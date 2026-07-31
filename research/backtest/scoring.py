"""Ranking helpers for strategy comparison."""

from __future__ import annotations

import pandas as pd

from .config import BacktestConfig


def normalize(series: pd.Series) -> pd.Series:
    clean = pd.to_numeric(series.replace([float("inf"), -float("inf")], pd.NA), errors="coerce")
    if clean.max() == clean.min():
        return pd.Series([0.5] * len(clean), index=clean.index)
    return (clean - clean.min()) / (clean.max() - clean.min())


def score_metrics(summary: pd.DataFrame, config: BacktestConfig) -> pd.Series:
    weights = config.score_weights
    return (
        weights.get("cagr", 0.0) * normalize(summary["cagr"])
        + weights.get("sortino_ratio", 0.0) * normalize(summary["sortino_ratio"])
        + weights.get("calmar_ratio", 0.0) * normalize(summary["calmar_ratio"])
        + weights.get("max_drawdown", 0.0) * normalize(summary["max_drawdown"].abs())
        + weights.get("turnover", 0.0) * normalize(summary["turnover"])
    )


def conservative_score(summary: pd.DataFrame) -> pd.Series:
    return (
        0.20 * normalize(summary["cagr"])
        + 0.30 * normalize(summary["sortino_ratio"])
        + 0.30 * normalize(summary["calmar_ratio"])
        - 0.20 * normalize(summary["max_drawdown"].abs())
    )


def balanced_score(summary: pd.DataFrame) -> pd.Series:
    exposure_return = summary["cagr"] * (0.5 + pd.to_numeric(summary.get("average_exposure", 0.0), errors="coerce").fillna(0.0))
    return (
        0.30 * normalize(summary["cagr"])
        + 0.20 * normalize(summary["sortino_ratio"])
        + 0.20 * normalize(summary["calmar_ratio"])
        - 0.15 * normalize(summary["max_drawdown"].abs())
        - 0.05 * normalize(summary["turnover"])
        + 0.10 * normalize(exposure_return)
    )


def apply_score_penalties(frame: pd.DataFrame, score_col: str, output_col: str) -> pd.Series:
    score = pd.to_numeric(frame[score_col], errors="coerce").fillna(0.0).copy()
    for flag, penalty in [
        ("low_trade_count_flag", 0.12),
        ("low_exposure_flag", 0.08),
        ("low_return_vs_benchmark_flag", 0.15),
        ("overfit_flag", 0.20),
    ]:
        if flag in frame.columns:
            score = score - frame[flag].fillna(False).astype(bool).astype(float) * penalty
    frame[output_col] = score
    return score


def rank_out_of_sample(results: pd.DataFrame, config: BacktestConfig) -> pd.DataFrame:
    test_rows = results[results["period"] == "test"].copy()
    if test_rows.empty:
        return pd.DataFrame()
    test_rows["split_score"] = score_metrics(test_rows, config)
    grouped = test_rows.groupby("strategy", as_index=False).agg(
        out_of_sample_score=("split_score", "mean"),
        oos_score_std=("split_score", "std"),
        oos_cagr=("cagr", "mean"),
        oos_sortino=("sortino_ratio", "mean"),
        oos_calmar=("calmar_ratio", "mean"),
        oos_max_drawdown=("max_drawdown", "mean"),
        oos_turnover=("turnover", "mean"),
        tested_splits=("split", "nunique"),
    )
    grouped["stability_score"] = grouped["out_of_sample_score"] - grouped["oos_score_std"].fillna(0.0) * 0.25
    return grouped.sort_values(["stability_score", "out_of_sample_score"], ascending=False)

