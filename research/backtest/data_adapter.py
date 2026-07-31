"""Read-only data adapter for database or offline CSV/XLSX inputs."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd

from .config import BacktestConfig

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class DataSummary:
    rows: int
    start_date: str | None
    end_date: str | None
    missing_columns: list[str]
    missing_value_counts: dict[str, int]
    inferred_columns: list[str]
    duplicate_dates_removed: int
    outlier_warnings: list[str]
    product_types: list[str]


class BacktestDataAdapter:
    """Load normalized historical rows without mutating production data."""

    REQUIRED_COLUMNS = ("date", "domestic_bid", "domestic_ask")

    def __init__(self, config: BacktestConfig) -> None:
        self.config = config
        self.summary: DataSummary | None = None

    def load(self, input_path: str | Path | None = None, product_code: str | None = None) -> pd.DataFrame:
        if input_path:
            raw = self._load_file(Path(input_path))
        else:
            raw = self._load_database(product_code=product_code)
        return self.normalize(raw)

    def _load_file(self, path: Path) -> pd.DataFrame:
        LOGGER.info("Loading offline backtest data from %s", path)
        if path.suffix.lower() == ".csv":
            return pd.read_csv(path)
        if path.suffix.lower() in {".xlsx", ".xls"}:
            return pd.read_excel(path)
        raise ValueError(f"Unsupported input file type: {path.suffix}")

    def _load_database(self, product_code: str | None) -> pd.DataFrame:
        """Read existing production tables via SELECT only.

        Requires pandas SQL support and an installed SQLAlchemy-compatible driver.
        CSV/XLSX fallback is the recommended offline path when dependencies are absent.
        """

        database_url = os.getenv("DATABASE_URL") or _read_env_value("DATABASE_URL")
        if not database_url:
            raise RuntimeError("DATABASE_URL is not set; pass --input for CSV/XLSX fallback")
        try:
            from sqlalchemy import create_engine, text
        except ImportError as exc:
            raise RuntimeError("SQLAlchemy is required for DB loading; pass --input for CSV/XLSX") from exc

        query = """
            SELECT
              gm.time::date AS date,
              gm.domestic_buy_price_vnd AS domestic_bid,
              gm.domestic_sell_price_vnd AS domestic_ask,
              (gm.domestic_buy_price_vnd + gm.domestic_sell_price_vnd) / 2.0 AS domestic_mid,
              gm.xau_usd_per_oz AS world_gold_usd,
              gm.usd_vnd AS usd_vnd,
              gm.premium_sell_pct AS premium_pct,
              gm.spread_abs_vnd AS spread,
              gm.spread_pct AS spread_pct,
              ss.score AS current_score,
              ss.signal AS current_signal,
              gp.code AS product_type
            FROM gold_metrics gm
            JOIN gold_products gp ON gp.id = gm.product_id
            LEFT JOIN LATERAL (
              SELECT signal, score
              FROM signal_snapshots
              WHERE product_id = gm.product_id AND time::date = gm.time::date
              ORDER BY time DESC
              LIMIT 1
            ) ss ON true
            WHERE (:product_code IS NULL OR gp.code = :product_code)
            ORDER BY gm.time ASC
        """
        LOGGER.info("Loading read-only backtest data from database")
        engine = create_engine(database_url)
        with engine.connect() as conn:
            return pd.read_sql(text(query), conn, params={"product_code": product_code})

    def normalize(self, raw: pd.DataFrame) -> pd.DataFrame:
        df = raw.copy(deep=True)
        missing: list[str] = []
        inferred: list[str] = []
        outliers: list[str] = []

        rename_map = {
            source: canonical
            for canonical, source in self.config.column_mapping.items()
            if source in df.columns and source != canonical
        }
        if rename_map:
            df = df.rename(columns=rename_map)
            LOGGER.info("Applied column mapping: %s", rename_map)

        aliases = {
            "domestic_bid": ["buyPrice", "buy_price", "buyPriceVnd", "domesticBuyPriceVnd"],
            "domestic_ask": ["sellPrice", "sell_price", "sellPriceVnd", "domesticSellPriceVnd", "close"],
            "world_gold_usd": ["xauUsdPerOz", "priceUsdPerOz"],
            "usd_vnd": ["usdVnd", "rate"],
            "premium_pct": ["premiumSellPct", "premiumPercent"],
            "spread_pct": ["spreadPct", "spreadPercent"],
            "product_type": ["productCode"],
        }
        for canonical, candidates in aliases.items():
            if canonical not in df.columns:
                for candidate in candidates:
                    if candidate in df.columns:
                        df[canonical] = df[candidate]
                        inferred.append(canonical)
                        LOGGER.warning("Inferred %s from %s", canonical, candidate)
                        break

        if "date" not in df.columns and "time" in df.columns:
            df["date"] = df["time"]
            inferred.append("date")
            LOGGER.warning("Inferred date from time")

        if "domestic_mid" not in df.columns and {"domestic_bid", "domestic_ask"}.issubset(df.columns):
            df["domestic_mid"] = (pd.to_numeric(df["domestic_bid"]) + pd.to_numeric(df["domestic_ask"])) / 2.0
            inferred.append("domestic_mid")

        if "spread" not in df.columns and {"domestic_bid", "domestic_ask"}.issubset(df.columns):
            df["spread"] = pd.to_numeric(df["domestic_ask"]) - pd.to_numeric(df["domestic_bid"])
            inferred.append("spread")

        if "spread_pct" not in df.columns and {"domestic_bid", "domestic_ask"}.issubset(df.columns):
            bid = pd.to_numeric(df["domestic_bid"])
            ask = pd.to_numeric(df["domestic_ask"])
            df["spread_pct"] = np.where(ask > 0, (ask - bid) / ask, np.nan)
            inferred.append("spread_pct")

        for col in self.REQUIRED_COLUMNS:
            if col not in df.columns:
                missing.append(col)
        if missing:
            raise ValueError(f"Missing required backtest columns: {missing}")

        optional = [col for col in self.config.column_mapping if col not in df.columns]
        for col in optional:
            LOGGER.warning("Optional column missing and will be skipped: %s", col)

        try:
            parsed_dates = pd.to_datetime(df["date"], utc=True)
        except ValueError:
            parsed_dates = pd.to_datetime(df["date"], utc=True, format="mixed")
        df["date"] = parsed_dates.dt.tz_localize(None).dt.normalize()
        df = df.sort_values("date").reset_index(drop=True)
        duplicate_dates = int(df.duplicated("date").sum())
        if duplicate_dates:
            LOGGER.warning("Dropping %s duplicate date rows, keeping last", duplicate_dates)
            df = df.drop_duplicates("date", keep="last").reset_index(drop=True)

        numeric_columns = [col for col in df.columns if col != "date"]
        for col in numeric_columns:
            if col in {
                "current_signal",
                "current_engine_input",
                "current_engine_reasons",
                "current_engine_version",
                "product_type",
            }:
                continue
            df[col] = pd.to_numeric(df[col], errors="coerce")

        self._validate_prices(df, outliers)
        self._validate_optional_quality(df, outliers)
        missing_value_counts = {
            col: int(df[col].isna().sum())
            for col in [
                "domestic_bid",
                "domestic_ask",
                "premium_pct",
                "spread_pct",
                "world_gold_usd",
                "usd_vnd",
            ]
            if col in df.columns
        }
        self.summary = DataSummary(
            rows=len(df),
            start_date=df["date"].min().date().isoformat() if len(df) else None,
            end_date=df["date"].max().date().isoformat() if len(df) else None,
            missing_columns=optional,
            missing_value_counts=missing_value_counts,
            inferred_columns=inferred,
            duplicate_dates_removed=duplicate_dates,
            outlier_warnings=outliers,
            product_types=sorted(df["product_type"].dropna().astype(str).unique().tolist()) if "product_type" in df.columns else [],
        )
        return df

    def _validate_prices(self, df: pd.DataFrame, outliers: list[str]) -> None:
        invalid_spread = df["domestic_ask"] < df["domestic_bid"]
        if bool(invalid_spread.any()):
            message = f"{int(invalid_spread.sum())} rows have domestic_ask < domestic_bid"
            outliers.append(message)
            LOGGER.warning(message)

        for col in ("domestic_bid", "domestic_ask"):
            non_positive = df[col] <= 0
            if bool(non_positive.any()):
                message = f"{int(non_positive.sum())} rows have non-positive {col}"
                outliers.append(message)
                LOGGER.warning(message)

    def _validate_optional_quality(self, df: pd.DataFrame, outliers: list[str]) -> None:
        checks = {
            "premium_pct": (-0.5, 1.0),
            "spread_pct": (0.0, 0.2),
            "domestic_bid": (1_000_000, 500_000_000),
            "domestic_ask": (1_000_000, 500_000_000),
            "world_gold_usd": (100, 10_000),
            "usd_vnd": (1_000, 100_000),
        }
        for col, (lower, upper) in checks.items():
            if col not in df.columns:
                continue
            values = pd.to_numeric(df[col], errors="coerce")
            invalid = values.notna() & ((values < lower) | (values > upper))
            if bool(invalid.any()):
                message = f"{int(invalid.sum())} rows have outlier {col} outside [{lower}, {upper}]"
                outliers.append(message)
                LOGGER.warning(message)

    @staticmethod
    def export_normalized(df: pd.DataFrame, output_path: Path) -> None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(output_path, index=False)


def _read_env_value(key: str, env_path: Path = Path(".env")) -> str | None:
    if not env_path.exists():
        return None
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        name, value = stripped.split("=", 1)
        if name.strip() == key:
            return value.strip().strip('"').strip("'")
    return None
