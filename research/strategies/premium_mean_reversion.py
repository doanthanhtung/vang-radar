"""Premium mean-reversion strategy."""

from __future__ import annotations

import math

import pandas as pd

from .base_strategy import BaseStrategy, Order


class PremiumMeanReversionStrategy(BaseStrategy):
    name = "premium_mean_reversion"
    description = "Buy when domestic premium percentile is unusually low, exit when premium normalizes."

    def generate_order(self, row: pd.Series, portfolio: object) -> Order | None:
        pctile_col = self.params.get("premium_percentile_col", "premium_pct_pctile_252d")
        buy_threshold = float(self.params.get("buy_threshold", 0.2))
        exit_threshold = float(self.params.get("exit_threshold", 0.8))
        buy_fraction = float(self.params.get("buy_fraction", 0.5))
        pctile = row.get(pctile_col)
        if pctile is None or not math.isfinite(float(pctile)):
            return None
        exposure = float(getattr(portfolio, "exposure", 0.0))
        if exposure <= 0 and float(pctile) <= buy_threshold:
            return Order("BUY", buy_fraction, f"premium percentile <= {buy_threshold:.2f}")
        if exposure > 0 and float(pctile) >= exit_threshold:
            return Order("SELL", 1.0, f"premium percentile >= {exit_threshold:.2f}")
        return None


class PremiumSpreadFilterStrategy(PremiumMeanReversionStrategy):
    name = "premium_spread_filter"
    description = "Buy low premium only when spread percentile is acceptable; exit on rich premium or wide spread."

    def generate_order(self, row: pd.Series, portfolio: object) -> Order | None:
        spread_col = self.params.get("spread_percentile_col", "spread_pct_pctile_252d")
        max_spread = float(self.params.get("max_spread_percentile", 0.5))
        exit_spread = float(self.params.get("exit_spread_percentile", 0.9))
        spread = row.get(spread_col)
        exposure = float(getattr(portfolio, "exposure", 0.0))
        if exposure > 0 and spread is not None and math.isfinite(float(spread)) and float(spread) >= exit_spread:
            return Order("SELL", 1.0, f"spread percentile >= {exit_spread:.2f}")
        if exposure <= 0 and (spread is None or not math.isfinite(float(spread)) or float(spread) > max_spread):
            return None
        return super().generate_order(row, portfolio)

