"""Batch bridge to replay the production TypeScript signal engine."""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import pandas as pd

REQUIRED_COLUMNS = (
    "date",
    "domestic_bid",
    "domestic_ask",
    "world_gold_usd",
    "usd_vnd",
)


def resolve_product_code(data: pd.DataFrame, explicit_product_code: str | None) -> str:
    """Resolve one product for replay, rejecting ambiguous multi-product frames."""

    if explicit_product_code and explicit_product_code.strip():
        return explicit_product_code.strip()
    if "product_type" in data.columns:
        products = data["product_type"].dropna().astype(str).str.strip()
        products = products[products != ""].unique().tolist()
        if len(products) == 1:
            return products[0]
    raise ValueError(
        "A single product code is required for current-engine replay; "
        "pass --product-code or provide one product_type value"
    )


def _validate_market_inputs(data: pd.DataFrame) -> None:
    missing = [column for column in REQUIRED_COLUMNS if column not in data.columns]
    if missing:
        raise ValueError(
            "Current-engine replay requires production market inputs; "
            f"missing columns: {', '.join(missing)}"
        )
    invalid = [
        column
        for column in REQUIRED_COLUMNS[1:]
        if pd.to_numeric(data[column], errors="coerce").isna().any()
    ]
    if invalid:
        raise ValueError(
            "Current-engine replay requires complete numeric values; "
            f"invalid columns: {', '.join(invalid)}"
        )


def _build_rows(data: pd.DataFrame, product_code: str) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for record in data.loc[:, REQUIRED_COLUMNS].to_dict(orient="records"):
        timestamp = pd.Timestamp(record["date"])
        if timestamp.tzinfo is None:
            timestamp = timestamp.tz_localize("UTC")
        else:
            timestamp = timestamp.tz_convert("UTC")
        rows.append(
            {
                "date": timestamp.isoformat().replace("+00:00", "Z"),
                "productCode": product_code,
                "domesticBuyPriceVnd": float(record["domestic_bid"]),
                "domesticSellPriceVnd": float(record["domestic_ask"]),
                "xauUsdPerOz": float(record["world_gold_usd"]),
                "usdVnd": float(record["usd_vnd"]),
            }
        )
    return rows


def replay_current_engine(
    data: pd.DataFrame,
    product_code: str,
    *,
    workspace_root: Path | None = None,
    temporary_root: Path | None = None,
) -> pd.DataFrame:
    """Return a copy enriched by one batch invocation of the production engine."""

    _validate_market_inputs(data)
    root = workspace_root or Path(__file__).resolve().parents[2]
    pnpm = shutil.which("pnpm")
    if pnpm is None:
        raise RuntimeError("pnpm is required to replay the production signal engine")

    with tempfile.TemporaryDirectory(
        prefix="vangscore-history-",
        dir=temporary_root,
    ) as directory:
        input_path = Path(directory) / "input.json"
        output_path = Path(directory) / "output.json"
        input_path.write_text(
            json.dumps({"rows": _build_rows(data, product_code)}),
            encoding="utf-8",
        )
        command = [
            pnpm,
            "--filter",
            "@vang-radar/domain",
            "historical-signals",
            "--input",
            str(input_path),
            "--output",
            str(output_path),
        ]
        completed = subprocess.run(
            command,
            cwd=root,
            capture_output=True,
            text=True,
            check=False,
        )
        if completed.returncode != 0:
            detail = completed.stderr.strip() or completed.stdout.strip()
            raise RuntimeError(f"Historical VangScore replay failed: {detail}")
        payload = json.loads(output_path.read_text(encoding="utf-8"))

    result_rows = payload.get("rows")
    if not isinstance(result_rows, list) or len(result_rows) != len(data):
        raise RuntimeError("Historical VangScore replay returned an unexpected row count")

    replay = pd.DataFrame(
        {
            "date": pd.to_datetime([row["date"] for row in result_rows], utc=True)
            .tz_localize(None)
            .normalize(),
            "current_signal": [row["output"]["signal"] for row in result_rows],
            "current_score": [row["output"]["score"] for row in result_rows],
            "current_confidence": [row["output"]["confidence"] for row in result_rows],
            "current_engine_version": [row["engineVersion"] for row in result_rows],
            "current_engine_input": [
                json.dumps(row["input"], ensure_ascii=False, sort_keys=True)
                for row in result_rows
            ],
            "current_engine_reasons": [
                json.dumps(row["output"]["reasons"], ensure_ascii=False)
                for row in result_rows
            ],
        }
    )
    base = data.copy(deep=True)
    base["date"] = pd.to_datetime(base["date"]).dt.normalize()
    stale_columns = [column for column in replay.columns if column != "date" and column in base]
    base = base.drop(columns=stale_columns)
    enriched = base.merge(replay, on="date", how="left", validate="one_to_one")
    if enriched["current_signal"].isna().any():
        raise RuntimeError("Historical VangScore replay could not align every input date")
    return enriched
