from __future__ import annotations

import math

import pandas as pd
import pytest

from research.backtest.config import BacktestConfig
from research.backtest.execution import ExecutionSimulator
from research.backtest.metrics import compute_metrics
from research.backtest.portfolio import Portfolio
from research.strategies.base_strategy import Order


def row(date: str = "2024-01-01", bid: float = 99.0, ask: float = 100.0) -> pd.Series:
    return pd.Series({"date": pd.Timestamp(date), "domestic_bid": bid, "domestic_ask": ask})


def test_buy_uses_ask_and_sell_uses_bid() -> None:
    config = BacktestConfig(initial_capital=1_000_000, fee_bps=0, slippage_bps=0)
    portfolio = Portfolio(config.initial_capital)
    simulator = ExecutionSimulator(config)

    buy = simulator.execute(Order("BUY", 0.5, "test buy"), row(bid=90, ask=100), portfolio)
    assert buy is not None
    assert buy.price == 100
    portfolio.apply_fill(buy)

    sell = simulator.execute(Order("SELL", 1.0, "test sell"), row(bid=95, ask=105), portfolio)
    assert sell is not None
    assert sell.price == 95
    portfolio.apply_fill(sell)
    trades = portfolio.trades_frame()
    required = {
        "cash_before",
        "cash_after",
        "position_before",
        "position_after",
        "price",
        "fee",
        "slippage",
        "realized_pnl",
    }
    assert required.issubset(trades.columns)
    assert trades.iloc[1]["realized_pnl"] < 0


def test_cannot_buy_more_than_cash() -> None:
    config = BacktestConfig(initial_capital=1_000_000, fee_bps=100, slippage_bps=0)
    portfolio = Portfolio(config.initial_capital)
    fill = ExecutionSimulator(config).execute(Order("BUY", 1.0, "all in"), row(ask=100), portfolio)
    assert fill is not None
    portfolio.apply_fill(fill)
    assert portfolio.cash >= -1e-6


def test_cannot_sell_more_than_position() -> None:
    portfolio = Portfolio(1_000_000)
    bad_sell = Order("SELL", 1.0, "no position")
    fill = ExecutionSimulator(BacktestConfig()).execute(bad_sell, row(), portfolio)
    assert fill is None


def test_max_exposure_guard() -> None:
    config = BacktestConfig(initial_capital=1_000_000, fee_bps=0, slippage_bps=0, max_exposure=0.5)
    portfolio = Portfolio(config.initial_capital, max_exposure=config.max_exposure)
    fill = ExecutionSimulator(config).execute(Order("BUY", 1.0, "max exposure"), row(bid=100, ask=100), portfolio)
    assert fill is not None
    portfolio.apply_fill(fill)
    point = portfolio.mark_to_market(row(bid=100, ask=100))
    assert point.exposure <= 0.5 + 1e-6
    assert point.equity == point.cash + point.market_value
    assert point.market_value == point.position_value


def test_metrics_basic_values() -> None:
    equity = pd.DataFrame(
        {
            "date": pd.to_datetime(["2024-01-01", "2024-01-02", "2024-01-03"]),
            "equity": [100.0, 110.0, 105.0],
            "exposure": [0.0, 0.5, 0.5],
        }
    )
    trades = pd.DataFrame()
    metrics = compute_metrics(equity, trades, initial_capital=100.0)
    assert math.isclose(metrics["total_return"], 0.05)
    assert metrics["max_drawdown"] < 0
    assert metrics["number_of_trades"] == 0

def test_mid_fallback_disabled_by_default() -> None:
    simulator = ExecutionSimulator(BacktestConfig())
    with pytest.raises(ValueError):
        simulator.execute(Order("BUY", 1.0, "missing ask"), pd.Series({"date": pd.Timestamp("2024-01-01"), "domestic_mid": 100}), Portfolio(1000))


def test_fee_and_slippage_are_applied() -> None:
    config = BacktestConfig(initial_capital=10_000, fee_bps=100, slippage_bps=50)
    portfolio = Portfolio(config.initial_capital)
    fill = ExecutionSimulator(config).execute(Order("BUY", 1.0, "costs"), row(ask=100), portfolio)
    assert fill is not None
    assert math.isclose(fill.fee, fill.gross_value * 0.01)
    assert math.isclose(fill.slippage, fill.gross_value * 0.005)
    portfolio.apply_fill(fill)
    assert portfolio.cash >= -1e-6
