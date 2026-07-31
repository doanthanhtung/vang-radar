"""Benchmarks and reusable backtest loop."""

from __future__ import annotations

import logging
from dataclasses import replace

import pandas as pd

from .config import BacktestConfig
from .execution import ExecutionSimulator
from .portfolio import Portfolio
from research.strategies.base_strategy import BaseStrategy, Order
from research.strategies.dca_strategy import MonthlyDcaStrategy

LOGGER = logging.getLogger(__name__)


def run_strategy(
    df: pd.DataFrame,
    strategy: BaseStrategy,
    config: BacktestConfig,
    enforce_rebalance: bool = True,
    rebalance_reason: str = "risk_rebalance_max_exposure",
) -> tuple[pd.DataFrame, pd.DataFrame]:
    portfolio = Portfolio(config.initial_capital, max_exposure=config.max_exposure)
    simulator = ExecutionSimulator(config)
    pending: list[tuple[int, Order]] = []
    strategy.reset()

    for idx, row in df.reset_index(drop=True).iterrows():
        due = [item for item in pending if item[0] <= idx]
        pending = [item for item in pending if item[0] > idx]
        for _, order in due:
            fill = simulator.execute(order, row, portfolio)
            if fill and portfolio.can_apply(fill):
                portfolio.apply_fill(fill)
        portfolio.mark_to_market(row)
        if enforce_rebalance:
            _enforce_max_exposure(row, portfolio, simulator, config, rebalance_reason)
        signal_order = strategy.generate_order(row, portfolio)
        if signal_order:
            delay = max(0, int(config.execution_delay_days))
            execution_idx = idx + delay
            if delay == 0:
                fill = simulator.execute(signal_order, row, portfolio)
                if fill and portfolio.can_apply(fill):
                    portfolio.apply_fill(fill)
                    portfolio.equity_curve.pop()
                    portfolio.mark_to_market(row)
                    if enforce_rebalance:
                        _enforce_max_exposure(row, portfolio, simulator, config, rebalance_reason)
            elif execution_idx < len(df):
                pending.append((execution_idx, signal_order))

    return portfolio.equity_frame(), portfolio.trades_frame()


def hold_cash(df: pd.DataFrame, config: BacktestConfig) -> tuple[pd.DataFrame, pd.DataFrame]:
    equity = pd.DataFrame(
        {
            "date": df["date"],
            "cash": config.initial_capital,
            "position_qty": 0.0,
            "mark_price": df["domestic_bid"],
            "market_value": 0.0,
            "position_value": 0.0,
            "equity": config.initial_capital,
            "drawdown": 0.0,
            "exposure": 0.0,
        }
    )
    return equity, pd.DataFrame()


def buy_and_hold_pure(df: pd.DataFrame, config: BacktestConfig) -> tuple[pd.DataFrame, pd.DataFrame]:
    pure_config = replace(config, max_exposure=1.0)
    portfolio = Portfolio(config.initial_capital, max_exposure=1.0)
    simulator = ExecutionSimulator(pure_config)
    first = df.iloc[0]
    fill = simulator.execute(Order("BUY", 1.0, "buy_and_hold_pure_entry"), first, portfolio)
    if fill:
        portfolio.apply_fill(fill)
    for _, row in df.iterrows():
        portfolio.mark_to_market(row)
    return portfolio.equity_frame(), portfolio.trades_frame()


def buy_and_hold_capped(df: pd.DataFrame, config: BacktestConfig) -> tuple[pd.DataFrame, pd.DataFrame]:
    portfolio = Portfolio(config.initial_capital, max_exposure=config.max_exposure)
    simulator = ExecutionSimulator(config)
    first = df.iloc[0]
    fill = simulator.execute(Order("BUY", min(1.0, config.max_exposure), "buy_and_hold_capped_entry"), first, portfolio)
    if fill:
        portfolio.apply_fill(fill)
    for _, row in df.iterrows():
        portfolio.mark_to_market(row)
        _enforce_max_exposure(row, portfolio, simulator, config, "benchmark_rebalance_max_exposure")
    return portfolio.equity_frame(), portfolio.trades_frame()


def buy_and_hold(df: pd.DataFrame, config: BacktestConfig) -> tuple[pd.DataFrame, pd.DataFrame]:
    return buy_and_hold_capped(df, config)


def monthly_dca_pure(df: pd.DataFrame, config: BacktestConfig) -> tuple[pd.DataFrame, pd.DataFrame]:
    pure_config = replace(config, max_exposure=1.0)
    return run_strategy(
        df,
        MonthlyDcaStrategy({"day_of_month": config.dca_day_of_month, "cash_fraction": config.dca_cash_fraction}),
        pure_config,
        enforce_rebalance=False,
    )


def monthly_dca_capped(df: pd.DataFrame, config: BacktestConfig) -> tuple[pd.DataFrame, pd.DataFrame]:
    return run_strategy(
        df,
        MonthlyDcaStrategy({"day_of_month": config.dca_day_of_month, "cash_fraction": config.dca_cash_fraction}),
        config,
        enforce_rebalance=True,
        rebalance_reason="benchmark_rebalance_max_exposure",
    )


def monthly_dca(df: pd.DataFrame, config: BacktestConfig) -> tuple[pd.DataFrame, pd.DataFrame]:
    return monthly_dca_capped(df, config)


def _enforce_max_exposure(
    row: pd.Series,
    portfolio: Portfolio,
    simulator: ExecutionSimulator,
    config: BacktestConfig,
    reason: str = "risk_rebalance_max_exposure",
) -> None:
    if not portfolio.equity_curve or portfolio.position_qty <= 0:
        return
    for _ in range(5):
        point = portfolio.equity_curve[-1]
        if point.exposure <= config.max_exposure + 1e-6:
            return
        target_market_value = max(0.0, config.max_exposure * point.equity)
        excess_value = max(0.0, point.market_value - target_market_value)
        if excess_value <= 0 or point.mark_price <= 0:
            return
        sell_fraction = min(1.0, excess_value / point.market_value * 1.01)
        fill = simulator.execute(Order("SELL", sell_fraction, reason), row, portfolio)
        if fill and portfolio.can_apply(fill):
            portfolio.apply_fill(fill)
            portfolio.equity_curve.pop()
            portfolio.mark_to_market(row)
        else:
            return
