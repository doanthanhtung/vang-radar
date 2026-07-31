"""Phase 2.5 activity, hurdle, and recommendation analysis."""

from __future__ import annotations

from typing import Any

import pandas as pd

from .config import BacktestConfig
from .scoring import apply_score_penalties, balanced_score, conservative_score


def build_activity_flags(
    full_summary: pd.DataFrame,
    walk_forward_results: pd.DataFrame,
    config: BacktestConfig,
) -> pd.DataFrame:
    full = full_summary[~full_summary["strategy"].str.contains("hold_cash|buy_and_hold|monthly_dca", regex=True)].copy()
    if walk_forward_results.empty or "period" not in walk_forward_results.columns:
        oos = pd.DataFrame({"strategy": full["strategy"], "oos_total_trades": 0, "oos_average_exposure": 0.0, "oos_pct_time_in_gold": 0.0})
    else:
        test = walk_forward_results[walk_forward_results["period"] == "test"].copy()
        oos = test.groupby("strategy", as_index=False).agg(
            oos_total_trades=("number_of_trades", "sum"),
            oos_average_exposure=("average_exposure", "mean"),
            oos_pct_time_in_gold=("pct_time_in_gold", "mean"),
        )
    years = max(1e-9, _years(full_summary))
    activity = full[["strategy", "number_of_trades", "average_exposure", "pct_time_in_gold"]].rename(
        columns={
            "number_of_trades": "full_period_trades",
            "average_exposure": "full_period_average_exposure",
            "pct_time_in_gold": "full_period_pct_time_in_gold",
        }
    )
    activity = activity.merge(oos, on="strategy", how="left")
    activity["oos_total_trades"] = activity["oos_total_trades"].fillna(0)
    activity["trades_per_year"] = activity["full_period_trades"] / years
    activity["cash_drag"] = 1.0 - activity["full_period_average_exposure"].fillna(0.0)
    activity["low_trade_count_flag"] = (
        (activity["full_period_trades"] < config.min_full_period_trades)
        | (activity["oos_total_trades"] < config.min_oos_total_trades)
        | (activity["trades_per_year"] < config.min_trades_per_year)
    )
    activity["low_exposure_flag"] = activity["full_period_average_exposure"].fillna(0.0) < config.min_average_exposure
    return activity


def build_hurdle_results(
    full_summary: pd.DataFrame,
    benchmark_comparison: pd.DataFrame,
    config: BacktestConfig,
) -> pd.DataFrame:
    candidates = full_summary[~full_summary["strategy"].str.contains("hold_cash|buy_and_hold|monthly_dca", regex=True)].copy()
    monthly = _metric(benchmark_comparison, "monthly_dca_pure", "cagr")
    buy_hold = _metric(benchmark_comparison, "buy_and_hold_pure", "cagr")
    monthly_dd = _metric(benchmark_comparison, "monthly_dca_pure", "max_drawdown")
    buy_hold_dd = _metric(benchmark_comparison, "buy_and_hold_pure", "max_drawdown")
    candidates["cagr_vs_monthly_dca"] = candidates["cagr"] - monthly
    candidates["cagr_vs_buy_and_hold"] = candidates["cagr"] - buy_hold
    candidates["maxdd_vs_monthly_dca"] = candidates["max_drawdown"].abs() - abs(monthly_dd)
    candidates["return_drawdown_tradeoff"] = candidates["cagr"] / candidates["max_drawdown"].abs().replace(0, pd.NA)
    candidates["missed_upside_vs_monthly_dca"] = monthly - candidates["cagr"]
    candidates["low_return_vs_benchmark_flag"] = ~(
        (candidates["cagr"] >= config.monthly_dca_hurdle_fraction * monthly)
        | (candidates["cagr"] >= config.buy_hold_hurdle_fraction * buy_hold)
    )
    return candidates[
        [
            "strategy",
            "cagr_vs_monthly_dca",
            "cagr_vs_buy_and_hold",
            "maxdd_vs_monthly_dca",
            "return_drawdown_tradeoff",
            "missed_upside_vs_monthly_dca",
            "low_return_vs_benchmark_flag",
        ]
    ]


def build_phase25_rankings(
    oos_ranking: pd.DataFrame,
    walk_forward_results: pd.DataFrame,
    full_summary: pd.DataFrame,
    benchmark_comparison: pd.DataFrame,
    config: BacktestConfig,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    if oos_ranking.empty or walk_forward_results.empty or "period" not in walk_forward_results.columns:
        empty = pd.DataFrame()
        return build_activity_flags(full_summary, walk_forward_results, config), build_hurdle_results(full_summary, benchmark_comparison, config), empty, empty, empty
    activity = build_activity_flags(full_summary, walk_forward_results, config)
    hurdle = build_hurdle_results(full_summary, benchmark_comparison, config)
    test = walk_forward_results[walk_forward_results["period"] == "test"].copy()
    oos_metrics = test.groupby("strategy", as_index=False).agg(
        cagr=("cagr", "mean"),
        sortino_ratio=("sortino_ratio", "mean"),
        calmar_ratio=("calmar_ratio", "mean"),
        max_drawdown=("max_drawdown", "mean"),
        turnover=("turnover", "mean"),
        number_of_trades=("number_of_trades", "sum"),
        average_holding_days=("average_holding_days", "mean"),
        average_exposure=("average_exposure", "mean"),
        worst_split=("period_score", "min"),
    )
    ranking = oos_ranking.merge(oos_metrics, on="strategy", how="left")
    ranking = ranking.merge(activity, on="strategy", how="left")
    ranking = ranking.merge(hurdle, on="strategy", how="left")
    ranking["conservative_score_raw"] = conservative_score(ranking)
    ranking["balanced_score_raw"] = balanced_score(ranking)
    apply_score_penalties(ranking, "balanced_score_raw", "balanced_score")
    apply_score_penalties(ranking, "conservative_score_raw", "conservative_score")
    balanced = ranking.sort_values(["balanced_score", "stability_score"], ascending=False)
    conservative = ranking.sort_values(["conservative_score", "stability_score"], ascending=False)
    recommended = balanced[
        (~balanced.get("overfit_flag", False).fillna(False))
        & ((~balanced["low_trade_count_flag"].fillna(False)) | config.allow_low_trade_count)
        & ((~balanced["low_exposure_flag"].fillna(False)) | config.allow_low_trade_count)
        & ((~balanced["low_return_vs_benchmark_flag"].fillna(False)) | config.allow_low_return_vs_benchmark)
        & (balanced["max_drawdown"].abs() < abs(_metric(benchmark_comparison, "monthly_dca_pure", "max_drawdown")))
    ].copy()
    return activity, hurdle, balanced, conservative, recommended


def _metric(frame: pd.DataFrame, strategy: str, metric: str) -> float:
    rows = frame[frame["strategy"] == strategy]
    if rows.empty:
        return 0.0
    return float(rows.iloc[0][metric])


def _years(summary: pd.DataFrame) -> float:
    if "date_range_years" in summary.columns:
        return float(summary["date_range_years"].dropna().max())
    return 16.5
