"""Walk-forward validation for rule-based strategy selection."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pandas as pd

from .benchmark import run_strategy
from .config import BacktestConfig
from .metrics import compute_metrics
from .scoring import rank_out_of_sample, score_metrics
from .strategy_factory import strategy_display_name
from research.strategies.base_strategy import BaseStrategy


@dataclass(frozen=True)
class WalkForwardSplit:
    name: str
    train_start: str
    train_end: str
    test_start: str
    test_end: str | None


DEFAULT_SPLITS = [
    WalkForwardSplit("2010_2015__2016_2018", "2010-01-01", "2015-12-31", "2016-01-01", "2018-12-31"),
    WalkForwardSplit("2013_2018__2019_2021", "2013-01-01", "2018-12-31", "2019-01-01", "2021-12-31"),
    WalkForwardSplit("2016_2021__2022_2024", "2016-01-01", "2021-12-31", "2022-01-01", "2024-12-31"),
    WalkForwardSplit("2019_2024__2025_now", "2019-01-01", "2024-12-31", "2025-01-01", None),
]


def slice_period(df: pd.DataFrame, start: str, end: str | None) -> pd.DataFrame:
    dates = pd.to_datetime(df["date"])
    mask = dates >= pd.Timestamp(start)
    if end is not None:
        mask &= dates <= pd.Timestamp(end)
    return df.loc[mask].copy()


def validate_split(split: WalkForwardSplit) -> None:
    if pd.Timestamp(split.train_end) >= pd.Timestamp(split.test_start):
        raise ValueError(f"Walk-forward split overlaps: {split.name}")


def run_walk_forward(
    df: pd.DataFrame,
    strategies: list[BaseStrategy],
    config: BacktestConfig,
    min_rows: int = 30,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    rows: list[dict[str, Any]] = []
    for split in DEFAULT_SPLITS:
        validate_split(split)
        train_df = slice_period(df, split.train_start, split.train_end)
        test_df = slice_period(df, split.test_start, split.test_end)
        if len(train_df) < min_rows or len(test_df) < min_rows:
            continue
        for strategy in strategies:
            strategy_name = strategy_display_name(strategy)
            for period_name, period_df in [("train", train_df), ("test", test_df)]:
                equity, trades = run_strategy(period_df, strategy, config)
                metrics = compute_metrics(equity, trades, config.initial_capital, config.annualization_days)
                metrics.update(
                    {
                        "split": split.name,
                        "period": period_name,
                        "strategy": strategy_name,
                        "description": strategy.description,
                        "params": strategy.params,
                        "start_date": period_df["date"].min(),
                        "end_date": period_df["date"].max(),
                    }
                )
                rows.append(metrics)

    results = pd.DataFrame(rows)
    if results.empty:
        return results, pd.DataFrame()
    results["period_score"] = score_metrics(results, config)
    ranked = rank_out_of_sample(results, config)
    ranked = add_degradation_flags(results, ranked)
    return results, ranked


def add_degradation_flags(results: pd.DataFrame, ranked: pd.DataFrame) -> pd.DataFrame:
    if ranked.empty:
        return ranked
    pivot = results.pivot_table(index="strategy", columns="period", values="period_score", aggfunc="mean")
    out = ranked.merge(pivot, on="strategy", how="left")
    out["train_vs_test_degradation"] = out.get("train", 0.0) - out.get("test", 0.0)
    out["overfit_flag"] = (out["train_vs_test_degradation"] > 0.25) & (out["out_of_sample_score"] < out["train"].fillna(0.0))
    return out
