"""Trading adapter for production-engine signals replayed over historical data."""

from __future__ import annotations

import pandas as pd

from .base_strategy import BaseStrategy, Order


class CurrentEngineAdapter(BaseStrategy):
    name = "current_engine_adapter"
    description = "Trades production VangScore signals recomputed without look-ahead bias."

    def generate_order(self, row: pd.Series, portfolio: object) -> Order | None:
        signal = str(row.get("current_signal", "")).upper()
        exposure = float(getattr(portfolio, "exposure", 0.0))
        if exposure <= 0 and signal in {"BUY_DCA", "BUY"}:
            return Order("BUY", float(self.params.get("buy_fraction", 0.5)), "current engine buy signal")
        if exposure > 0 and signal in {"AVOID", "TAKE_PROFIT", "SELL"}:
            return Order("SELL", 1.0, "current engine exit signal")
        return None
