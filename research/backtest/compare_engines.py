"""Compare current VangScore engine adapter with candidates and benchmarks."""

from __future__ import annotations

from typing import Any

import pandas as pd

from .benchmark import (
    buy_and_hold_capped,
    buy_and_hold_pure,
    hold_cash,
    monthly_dca_capped,
    monthly_dca_pure,
    run_strategy,
)
from .config import BacktestConfig
from .metrics import compute_metrics
from .scoring import score_metrics
from .strategy_factory import strategy_display_name
from research.strategies.base_strategy import BaseStrategy
from research.strategies.current_engine_adapter import CurrentEngineAdapter


def compare_current_engine(
    df: pd.DataFrame,
    strategies: list[BaseStrategy],
    config: BacktestConfig,
    top_n: int = 10,
) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    candidates = strategies[:top_n]
    runners = clean_benchmark_runners(df, config)
    coverage = current_signal_coverage(df)
    include_current = coverage["status"] == "ok"
    if include_current:
        runners["current_vangscore_engine"] = lambda: run_strategy(df, CurrentEngineAdapter(), config)

    for name, runner in runners.items():
        equity, trades = runner()
        row = compute_metrics(equity, trades, config.initial_capital, config.annualization_days)
        row.update({"strategy": name, "group": "current_or_benchmark"})
        if name == "current_vangscore_engine":
            row.update(coverage)
        rows.append(row)
    if not include_current:
        row = {metric: 0 for metric in ["cagr", "total_return", "annualized_volatility", "sharpe_ratio", "sortino_ratio", "max_drawdown", "calmar_ratio", "win_rate", "profit_factor", "average_trade_return", "median_trade_return", "average_holding_days", "number_of_trades", "worst_trade", "best_trade", "worst_calendar_year", "recovery_time_days", "pct_time_in_gold", "average_exposure", "max_exposure", "turnover", "transaction_cost_impact"]}
        row.update({"strategy": "current_vangscore_engine", "group": "current_or_benchmark", **coverage})
        rows.append(row)

    for strategy in candidates:
        equity, trades = run_strategy(df, strategy, config)
        row = compute_metrics(equity, trades, config.initial_capital, config.annualization_days)
        row.update({"strategy": strategy_display_name(strategy), "group": "candidate"})
        rows.append(row)

    output = pd.DataFrame(rows)
    if not output.empty:
        output["score"] = score_metrics(output, config)
        output = output.sort_values("score", ascending=False)
    return output


def clean_benchmark_runners(df: pd.DataFrame, config: BacktestConfig) -> dict[str, Any]:
    return {
        "hold_cash": lambda: hold_cash(df, config),
        "buy_and_hold_pure": lambda: buy_and_hold_pure(df, config),
        "buy_and_hold_capped": lambda: buy_and_hold_capped(df, config),
        "monthly_dca_pure": lambda: monthly_dca_pure(df, config),
        "monthly_dca_capped": lambda: monthly_dca_capped(df, config),
    }


def benchmark_clean_comparison(df: pd.DataFrame, config: BacktestConfig) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for name, runner in clean_benchmark_runners(df, config).items():
        equity, trades = runner()
        metrics = compute_metrics(equity, trades, config.initial_capital, config.annualization_days)
        metrics.update({"strategy": name, "group": "benchmark"})
        rows.append(metrics)
    output = pd.DataFrame(rows)
    output["score"] = score_metrics(output, config)
    return output.sort_values("score", ascending=False)


def current_signal_coverage(df: pd.DataFrame) -> dict[str, Any]:
    if "current_signal" not in df.columns:
        return {
            "signal_coverage_pct": 0.0,
            "valid_signal_days": 0,
            "buy_signal_days": 0,
            "sell_signal_days": 0,
            "status": "insufficient_historical_signal_coverage",
            "warning": "current_signal column missing",
        }
    signals = df["current_signal"].dropna().astype(str).str.upper()
    valid = signals[signals != ""]
    buy = valid.isin(["BUY", "BUY_DCA"]).sum()
    sell = valid.isin(["SELL", "TAKE_PROFIT", "AVOID"]).sum()
    coverage = len(valid) / max(1, len(df))
    status = "ok" if coverage >= 0.5 and buy > 0 else "insufficient_historical_signal_coverage"
    warning = "" if status == "ok" else "current_signal coverage below 50% or no buy signal; excluded from main ranking"
    return {
        "signal_coverage_pct": coverage,
        "valid_signal_days": int(len(valid)),
        "buy_signal_days": int(buy),
        "sell_signal_days": int(sell),
        "status": status,
        "warning": warning,
    }
