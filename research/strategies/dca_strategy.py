"""DCA benchmark and hybrid rule-based DCA strategy."""

from __future__ import annotations

import math

import pandas as pd

from .base_strategy import BaseStrategy, Order


class MonthlyDcaStrategy(BaseStrategy):
    name = "monthly_dca"
    description = "Invest a fixed cash fraction near the start of each month."

    def generate_order(self, row: pd.Series, portfolio: object) -> Order | None:
        day = int(self.params.get("day_of_month", 1))
        fraction = float(self.params.get("cash_fraction", 0.05))
        date = pd.Timestamp(row["date"])
        already = self.state.custom.get("month")
        month_key = date.strftime("%Y-%m")
        if date.day >= day and already != month_key:
            self.state.custom["month"] = month_key
            return Order("BUY", fraction, "monthly DCA")
        return None


class HybridPremiumTrendDcaStrategy(BaseStrategy):
    name = "hybrid_premium_spread_trend_dca"
    description = "Start with low premium and reasonable spread, require trend support, then DCA on drawdowns."

    def generate_order(self, row: pd.Series, portfolio: object) -> Order | None:
        exposure = float(getattr(portfolio, "exposure", 0.0))
        max_exposure = float(self.params.get("max_exposure", 0.9))
        premium_col = self.params.get("premium_percentile_col", "premium_pct_pctile_252d")
        spread_col = self.params.get("spread_percentile_col", "spread_pct_pctile_252d")
        buy_threshold = float(self.params.get("buy_threshold", 0.2))
        max_spread = float(self.params.get("max_spread_percentile", 0.7))
        initial_fraction = float(self.params.get("initial_fraction", 0.3))
        dca_fraction = float(self.params.get("dca_fraction", 0.2))
        dca_drop = float(self.params.get("dca_drop", 0.03))
        max_dca = int(self.params.get("max_dca", 3))
        max_holding_days = int(self.params.get("max_holding_days", 365))
        trend_col = self.params.get("trend_col", "world_ma200")
        price_col = "world_gold_usd" if str(trend_col).startswith("world") else "domestic_mid"
        drawdown_col = f"domestic_drawdown_{int(self.params.get('drawdown_window', 120))}d"
        drawdown_threshold = float(self.params.get("drawdown_threshold", 0.0))

        premium = row.get(premium_col)
        spread = row.get(spread_col)
        if not self._finite_at_most(premium, buy_threshold) or not self._finite_at_most(spread, max_spread):
            return None

        if exposure > 0 and self.state.entry_date is not None:
            holding_days = (pd.Timestamp(row["date"]) - self.state.entry_date).days
            if holding_days >= max_holding_days:
                return Order("SELL", 1.0, f"max holding days >= {max_holding_days}")

        trend_value = row.get(trend_col)
        price_value = row.get(price_col)
        trend_ok = trend_value is None or not math.isfinite(float(trend_value)) or float(price_value) >= float(trend_value)
        if not trend_ok:
            return None

        drawdown = row.get(drawdown_col)
        drawdown_ok = (
            drawdown_threshold <= 0
            or (drawdown is not None and math.isfinite(float(drawdown)) and float(drawdown) <= -drawdown_threshold)
        )
        if exposure <= 0 and not drawdown_ok:
            return None

        domestic_ask = float(row["domestic_ask"])
        if exposure <= 0:
            self.state.entry_price = domestic_ask
            self.state.peak_price = domestic_ask
            self.state.entry_date = pd.Timestamp(row["date"])
            self.state.dca_count = 0
            return Order("BUY", min(initial_fraction, max_exposure), "low premium with trend support")

        if self.state.entry_price is None:
            self.state.entry_price = domestic_ask
        next_drop = self.state.entry_price * (1.0 - dca_drop * (self.state.dca_count + 1))
        if exposure < max_exposure and self.state.dca_count < max_dca and domestic_ask <= next_drop:
            self.state.dca_count += 1
            return Order("BUY", min(dca_fraction, max_exposure - exposure), "DCA after price drop")

        exit_threshold = float(self.params.get("exit_threshold", 0.85))
        if premium is not None and math.isfinite(float(premium)) and float(premium) >= exit_threshold:
            return Order("SELL", 1.0, "premium normalized")
        return None

    @staticmethod
    def _finite_at_most(value: object, threshold: float) -> bool:
        return value is not None and math.isfinite(float(value)) and float(value) <= threshold
