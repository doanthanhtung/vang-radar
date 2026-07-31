"""Past-only feature engineering for rule-based gold strategies."""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

LOGGER = logging.getLogger(__name__)


def rolling_percentile(series: pd.Series, window: int, min_periods: int = 20) -> pd.Series:
    """Percentile rank of the current observation within past/current window."""

    return series.rolling(window, min_periods=min_periods).apply(
        lambda values: pd.Series(values).rank(pct=True).iloc[-1],
        raw=False,
    )


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add deterministic rolling features using only data up to each row."""

    out = df.copy(deep=True)
    if "domestic_mid" not in out.columns:
        out["domestic_mid"] = (out["domestic_bid"] + out["domestic_ask"]) / 2.0

    if "premium_pct" not in out.columns and {"domestic_ask", "world_gold_usd", "usd_vnd"}.issubset(out.columns):
        LOGGER.warning("premium_pct missing; cannot infer accurately without world VND conversion, skipping")

    return_cols = {
        "domestic_gold_return": "domestic_mid",
        "world_gold_return": "world_gold_usd",
        "fx_return": "usd_vnd",
    }
    for ret_col, price_col in return_cols.items():
        if ret_col not in out.columns and price_col in out.columns:
            out[ret_col] = out[price_col].pct_change()

    for col, prefix, windows in [
        ("premium_pct", "premium_pct_pctile", [252, 504, 756, 1260]),
        ("spread_pct", "spread_pct_pctile", [252, 504, 756]),
    ]:
        if col not in out.columns:
            LOGGER.warning("Skipping rolling percentiles because %s is missing", col)
            continue
        for window in windows:
            out[f"{prefix}_{window}d"] = rolling_percentile(out[col], window)

    for col, prefix in [("premium_pct", "premium_z"), ("spread_pct", "spread_z")]:
        if col not in out.columns:
            continue
        mean = out[col].rolling(252, min_periods=20).mean()
        std = out[col].rolling(252, min_periods=20).std(ddof=0)
        out[prefix] = (out[col] - mean) / std.replace(0, np.nan)

    for price_col, prefix in [("domestic_mid", "domestic"), ("world_gold_usd", "world")]:
        if price_col not in out.columns:
            LOGGER.warning("Skipping moving averages because %s is missing", price_col)
            continue
        for window in [50, 100, 200, 300]:
            out[f"{prefix}_ma{window}"] = out[price_col].rolling(window, min_periods=max(5, window // 5)).mean()

    if "domestic_mid" in out.columns:
        for window in [60, 120, 252]:
            rolling_high = out["domestic_mid"].rolling(window, min_periods=5).max()
            out[f"domestic_drawdown_{window}d"] = out["domestic_mid"] / rolling_high - 1.0
        for window in [20, 60, 120]:
            out[f"domestic_vol_{window}d"] = out["domestic_gold_return"].rolling(window, min_periods=5).std(ddof=0)
            out[f"domestic_momentum_{window}d"] = out["domestic_mid"].pct_change(window)

    if "usd_vnd" in out.columns:
        for window in [50, 100]:
            out[f"usd_vnd_above_ma{window}"] = out["usd_vnd"] > out["usd_vnd"].rolling(window, min_periods=10).mean()
        for window in [20, 60]:
            out[f"fx_return_{window}d"] = out["usd_vnd"].pct_change(window)

    if "world_gold_usd" in out.columns:
        for window in [20, 60, 120]:
            out[f"world_momentum_{window}d"] = out["world_gold_usd"].pct_change(window)

    out["regime"] = "sideway"
    if {"domestic_ma200", "domestic_mid"}.issubset(out.columns):
        bull = (out["domestic_mid"] > out["domestic_ma200"]) & (out.get("domestic_momentum_60d", 0) > 0)
        bear = (out["domestic_mid"] < out["domestic_ma200"]) & (out.get("domestic_momentum_60d", 0) < 0)
        out.loc[bull, "regime"] = "bull"
        out.loc[bear, "regime"] = "bear"
    if "domestic_vol_60d" in out.columns:
        vol_rank = rolling_percentile(out["domestic_vol_60d"], 252, min_periods=20)
        out["volatility_regime"] = np.where(vol_rank >= 0.7, "high_volatility", "low_volatility")
    else:
        out["volatility_regime"] = "unknown"
    return out


def assert_no_lookahead(raw: pd.DataFrame, featured: pd.DataFrame, row_index: int) -> None:
    """Assert features up to row_index are unchanged when future rows are removed."""

    truncated = add_features(raw.iloc[: row_index + 1])
    common = [c for c in truncated.columns if c in featured.columns and c not in {"date"}]
    left = truncated.iloc[-1][common]
    right = featured.iloc[row_index][common]
    pd.testing.assert_series_equal(left, right, check_names=False, check_dtype=False, atol=1e-12, rtol=1e-12)

