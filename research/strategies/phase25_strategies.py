"""Additional rule-based strategy families for Phase 2.5."""

from __future__ import annotations

import math

import pandas as pd

from .base_strategy import BaseStrategy, Order


def _finite(value: object) -> bool:
    return value is not None and math.isfinite(float(value))


class PremiumAccumulationStrategy(BaseStrategy):
    name = "premium_accumulation"
    description = "Accumulate when premium is cheap and spread is reasonable; add periodically while valuation remains cheap."

    def generate_order(self, row: pd.Series, portfolio: object) -> Order | None:
        exposure = float(getattr(portfolio, "exposure", 0.0))
        premium = row.get("premium_pct_pctile_252d")
        spread = row.get("spread_pct_pctile_252d")
        if not _finite(premium) or not _finite(spread):
            return None
        max_exposure = float(self.params.get("max_exposure", 0.7))
        if float(premium) > float(self.params.get("premium_threshold", 0.3)):
            if exposure > 0 and float(premium) >= float(self.params.get("exit_threshold", 0.8)):
                return Order("SELL", float(self.params.get("exit_fraction", 0.5)), "premium_compression_exit")
            return None
        if float(spread) > float(self.params.get("spread_threshold", 0.7)):
            return None
        trend_col = str(self.params.get("trend_col", "domestic_ma200"))
        trend_value = row.get(trend_col)
        price = row.get("domestic_mid")
        if _finite(trend_value) and _finite(price) and float(price) < float(trend_value) * float(self.params.get("trend_floor", 0.97)):
            return None
        if exposure <= 0:
            return Order("BUY", float(self.params.get("initial_fraction", 0.25)), "premium_accumulation_entry")
        date = pd.Timestamp(row["date"])
        month_key = date.strftime("%Y-%m")
        if exposure < max_exposure and self.state.custom.get("month") != month_key:
            self.state.custom["month"] = month_key
            return Order("BUY", min(float(self.params.get("monthly_fraction", 0.05)), max_exposure - exposure), "premium_accumulation_monthly_add")
        return None


class TrendValuationStrategy(BaseStrategy):
    name = "trend_valuation"
    description = "Follow domestic/world trend while avoiding expensive premium and wide spread regimes."

    def generate_order(self, row: pd.Series, portfolio: object) -> Order | None:
        exposure = float(getattr(portfolio, "exposure", 0.0))
        premium = row.get("premium_pct_pctile_252d")
        spread = row.get("spread_pct_pctile_252d")
        trend_col = str(self.params.get("trend_col", "domestic_ma200"))
        price_col = "world_gold_usd" if trend_col.startswith("world") else "domestic_mid"
        trend_value = row.get(trend_col)
        price = row.get(price_col)
        if not (_finite(premium) and _finite(spread) and _finite(trend_value) and _finite(price)):
            return None
        if exposure > 0 and (float(price) < float(trend_value) or float(premium) >= float(self.params.get("exit_premium", 0.9))):
            return Order("SELL", 1.0, "trend_break_or_premium_exit")
        if float(price) >= float(trend_value) and float(premium) <= float(self.params.get("max_premium", 0.7)) and float(spread) <= float(self.params.get("max_spread", 0.8)):
            if exposure <= 0:
                return Order("BUY", float(self.params.get("initial_fraction", 0.4)), "trend_valuation_entry")
            if exposure < float(self.params.get("max_exposure", 0.9)):
                return Order("BUY", float(self.params.get("add_fraction", 0.1)), "trend_valuation_add")
        return None


class DrawdownLadderStrategy(BaseStrategy):
    name = "drawdown_ladder"
    description = "Buy progressively at domestic drawdown ladder levels with spread/premium guardrails."

    def generate_order(self, row: pd.Series, portfolio: object) -> Order | None:
        premium = row.get("premium_pct_pctile_252d")
        spread = row.get("spread_pct_pctile_252d")
        if not _finite(premium) or not _finite(spread):
            return None
        if float(premium) > float(self.params.get("max_premium", 0.7)) or float(spread) > float(self.params.get("max_spread", 0.8)):
            return None
        exposure = float(getattr(portfolio, "exposure", 0.0))
        max_exposure = float(self.params.get("max_exposure", 0.9))
        dd = row.get(f"domestic_drawdown_{int(self.params.get('drawdown_window', 252))}d")
        if not _finite(dd):
            return None
        levels = list(self.params.get("levels", [0.03, 0.05, 0.07, 0.10]))
        target = 0.0
        for index, level in enumerate(levels, start=1):
            if float(dd) <= -float(level):
                target = min(max_exposure, index * float(self.params.get("step_fraction", 0.2)))
        if target > exposure:
            return Order("BUY", min(target - exposure, float(self.params.get("step_fraction", 0.2))), "drawdown_ladder_add")
        if exposure > 0 and float(premium) >= float(self.params.get("exit_premium", 0.85)):
            return Order("SELL", 0.5, "premium_compression_partial_exit")
        return None


class BalancedDcaStrategy(BaseStrategy):
    name = "balanced_dca"
    description = "Monthly DCA in healthy trend/valuation regimes, with larger adds when premium is cheap or drawdown is deep."

    def generate_order(self, row: pd.Series, portfolio: object) -> Order | None:
        premium = row.get("premium_pct_pctile_252d")
        spread = row.get("spread_pct_pctile_252d")
        trend_col = str(self.params.get("trend_col", "domestic_ma200"))
        trend_value = row.get(trend_col)
        price = row.get("domestic_mid")
        if not (_finite(premium) and _finite(spread)):
            return None
        exposure = float(getattr(portfolio, "exposure", 0.0))
        if exposure > 0 and (float(premium) >= float(self.params.get("exit_premium", 0.9)) or float(spread) >= float(self.params.get("pause_spread", 0.9))):
            return Order("SELL", float(self.params.get("exit_fraction", 0.25)), "valuation_or_spread_trim")
        if float(spread) > float(self.params.get("max_spread", 0.8)) or float(premium) > float(self.params.get("max_premium", 0.75)):
            return None
        if _finite(trend_value) and _finite(price) and float(price) < float(trend_value) * float(self.params.get("trend_floor", 0.98)):
            return None
        date = pd.Timestamp(row["date"])
        month_key = date.strftime("%Y-%m")
        if self.state.custom.get("month") == month_key:
            return None
        self.state.custom["month"] = month_key
        size = float(self.params.get("monthly_fraction", 0.04))
        dd = row.get(f"domestic_drawdown_{int(self.params.get('drawdown_window', 120))}d")
        if _finite(premium) and float(premium) <= float(self.params.get("cheap_premium", 0.3)):
            size += float(self.params.get("cheap_add", 0.04))
        if _finite(dd) and float(dd) <= -float(self.params.get("deep_drawdown", 0.05)):
            size += float(self.params.get("drawdown_add", 0.06))
        return Order("BUY", min(size, max(0.0, float(self.params.get("max_exposure", 0.9)) - exposure)), "balanced_dca_monthly_buy")

