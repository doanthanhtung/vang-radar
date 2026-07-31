"""Portfolio accounting and risk constraints."""

from __future__ import annotations

from dataclasses import asdict, dataclass

import pandas as pd

from .execution import Fill


@dataclass
class EquityPoint:
    date: pd.Timestamp
    cash: float
    position_qty: float
    mark_price: float
    market_value: float
    position_value: float
    equity: float
    drawdown: float
    exposure: float


class Portfolio:
    """Long-only VND/gold portfolio with cash and exposure tracking."""

    def __init__(self, initial_capital: float, max_exposure: float = 1.0) -> None:
        self.initial_capital = float(initial_capital)
        self.cash = float(initial_capital)
        self.position_qty = 0.0
        self.max_exposure_limit = float(max_exposure)
        self.cost_basis = 0.0
        self.high_watermark = float(initial_capital)
        self.trades: list[dict[str, object]] = []
        self.equity_curve: list[EquityPoint] = []

    @property
    def current_market_value(self) -> float:
        return self.equity_curve[-1].market_value if self.equity_curve else 0.0

    @property
    def current_equity(self) -> float:
        return self.equity_curve[-1].equity if self.equity_curve else self.cash

    @property
    def exposure(self) -> float:
        if not self.equity_curve:
            return 0.0
        equity = self.equity_curve[-1].equity
        return 0.0 if equity <= 0 else self.equity_curve[-1].market_value / equity

    def can_apply(self, fill: Fill) -> bool:
        if fill.side == "BUY":
            return self.cash + fill.net_cash_flow >= -1e-6
        return fill.quantity <= self.position_qty + 1e-9

    def apply_fill(self, fill: Fill) -> None:
        if not self.can_apply(fill):
            raise ValueError("Fill violates portfolio constraints")
        cash_before = self.cash
        position_before = self.position_qty
        cost_basis_before = self.cost_basis
        realized_pnl = 0.0
        self.cash += fill.net_cash_flow
        if fill.side == "BUY":
            self.position_qty += fill.quantity
            self.cost_basis += -fill.net_cash_flow
        else:
            avg_cost = 0.0 if self.position_qty <= 0 else self.cost_basis / self.position_qty
            removed_cost = avg_cost * fill.quantity
            realized_pnl = fill.net_cash_flow - removed_cost
            self.position_qty -= fill.quantity
            self.cost_basis -= removed_cost
            if abs(self.position_qty) < 1e-9:
                self.position_qty = 0.0
                self.cost_basis = 0.0
        trade = asdict(fill)
        trade.update(
            {
                "action": fill.side,
                "qty": fill.quantity,
                "cash_before": cash_before,
                "cash_after": self.cash,
                "position_before": position_before,
                "position_after": self.position_qty,
                "cost_basis_before": cost_basis_before,
                "cost_basis_after": self.cost_basis,
                "realized_pnl": realized_pnl,
            }
        )
        self.trades.append(trade)

    def mark_to_market(self, row: pd.Series) -> EquityPoint:
        mark_price = float(row["domestic_bid"]) if self.position_qty > 0 else float(row["domestic_ask"])
        market_value = self.position_qty * mark_price
        equity = self.cash + market_value
        self.high_watermark = max(self.high_watermark, equity)
        drawdown = 0.0 if self.high_watermark <= 0 else equity / self.high_watermark - 1.0
        exposure = 0.0 if equity <= 0 else market_value / equity
        point = EquityPoint(
            pd.Timestamp(row["date"]),
            self.cash,
            self.position_qty,
            mark_price,
            market_value,
            market_value,
            equity,
            drawdown,
            exposure,
        )
        self.equity_curve.append(point)
        return point

    def trades_frame(self) -> pd.DataFrame:
        return pd.DataFrame(self.trades)

    def equity_frame(self) -> pd.DataFrame:
        return pd.DataFrame([asdict(point) for point in self.equity_curve])
