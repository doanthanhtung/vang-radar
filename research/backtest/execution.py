"""Execution simulator that accounts with domestic ask/bid prices."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import pandas as pd

from .config import BacktestConfig
from research.strategies.base_strategy import Order


@dataclass(frozen=True)
class Fill:
    date: pd.Timestamp
    side: Literal["BUY", "SELL"]
    quantity: float
    price: float
    gross_value: float
    fee: float
    slippage: float
    net_cash_flow: float
    reason: str


class ExecutionSimulator:
    """Convert strategy orders to fills using ask for buys and bid for sells."""

    def __init__(self, config: BacktestConfig) -> None:
        self.config = config

    def execute(self, order: Order, row: pd.Series, portfolio: object) -> Fill | None:
        if order.side == "BUY":
            price = self._price(row, "domestic_ask")
            mark_price = self._price(row, "domestic_bid")
            executable_cash = max(0.0, float(getattr(portfolio, "cash", 0.0)) - self.config.initial_capital * self.config.cash_reserve_pct)
            market_value = float(getattr(portfolio, "current_market_value", 0.0))
            per_unit_cost = price * (1.0 + self.config.fee_bps / 10_000.0 + self.config.slippage_bps / 10_000.0)
            target_cash = executable_cash * order.target_fraction
            cash = float(getattr(portfolio, "cash", 0.0))
            exposure_cap = max(0.0, min(1.0, self.config.max_exposure))
            numerator = exposure_cap * (cash + market_value) - market_value
            denominator = mark_price * (1.0 - exposure_cap) + exposure_cap * per_unit_cost
            max_qty_by_exposure = 0.0 if numerator <= 0 or denominator <= 0 else numerator / denominator
            max_qty_by_cash = target_cash / per_unit_cost if per_unit_cost > 0 else 0.0
            quantity = min(max_qty_by_cash, max_qty_by_exposure)
            if quantity <= 0:
                return None
            gross = quantity * price
            fee = gross * self.config.fee_bps / 10_000.0
            slippage = gross * self.config.slippage_bps / 10_000.0
            return Fill(pd.Timestamp(row["date"]), "BUY", quantity, price, gross, fee, slippage, -(gross + fee + slippage), order.reason)

        price = self._price(row, "domestic_bid")
        held = float(getattr(portfolio, "position_qty", 0.0))
        quantity = min(held, held * order.target_fraction)
        if quantity <= 0:
            return None
        gross = quantity * price
        fee = gross * self.config.fee_bps / 10_000.0
        slippage = gross * self.config.slippage_bps / 10_000.0
        return Fill(pd.Timestamp(row["date"]), "SELL", quantity, price, gross, fee, slippage, gross - fee - slippage, order.reason)

    def _price(self, row: pd.Series, column: str) -> float:
        value = row.get(column)
        if pd.notna(value) and float(value) > 0:
            return float(value)
        if self.config.allow_mid_fallback:
            mid = row.get("domestic_mid")
            if pd.notna(mid) and float(mid) > 0:
                return float(mid)
        raise ValueError(f"Cannot execute without valid {column}; mid fallback disabled")
