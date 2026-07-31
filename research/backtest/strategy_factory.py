"""Strategy factory for capped rule-based variants."""

from __future__ import annotations

from itertools import product

from .config import BacktestConfig
from research.strategies.base_strategy import BaseStrategy
from research.strategies.dca_strategy import HybridPremiumTrendDcaStrategy
from research.strategies.phase25_strategies import (
    BalancedDcaStrategy,
    DrawdownLadderStrategy,
    PremiumAccumulationStrategy,
    TrendValuationStrategy,
)
from research.strategies.premium_mean_reversion import PremiumMeanReversionStrategy, PremiumSpreadFilterStrategy


def build_phase1_strategies(config: BacktestConfig) -> list[BaseStrategy]:
    strategies: list[BaseStrategy] = []
    for threshold in [0.05, 0.10, 0.20, 0.30]:
        strategies.append(
            PremiumMeanReversionStrategy(
                {
                    "buy_threshold": threshold,
                    "exit_threshold": 0.80,
                    "buy_fraction": 0.5,
                    "premium_percentile_col": "premium_pct_pctile_252d",
                }
            )
        )
    for premium_threshold in [0.10, 0.20, 0.30]:
        for spread_threshold in [0.30, 0.50, 0.70]:
            strategies.append(
                PremiumSpreadFilterStrategy(
                    {
                        "buy_threshold": premium_threshold,
                        "max_spread_percentile": spread_threshold,
                        "exit_threshold": 0.80,
                        "exit_spread_percentile": 0.90,
                        "buy_fraction": 0.5,
                    }
                )
            )
    for premium_threshold in [0.10, 0.20]:
        for spread_threshold in [0.50, 0.70]:
            for trend_col in ["world_ma100", "world_ma200", "domestic_ma200"]:
                strategies.append(
                    HybridPremiumTrendDcaStrategy(
                        {
                            "buy_threshold": premium_threshold,
                            "max_spread_percentile": spread_threshold,
                            "trend_col": trend_col,
                            "initial_fraction": 0.3,
                            "dca_fraction": 0.2,
                            "dca_drop": 0.03,
                            "max_exposure": min(0.9, config.max_exposure),
                        }
                    )
                )
    return strategies[: config.max_strategies]


def build_strategy_factory(config: BacktestConfig) -> list[BaseStrategy]:
    """Build Phase 2.5 mixed strategy grid, capped by config.max_strategies."""

    families: list[list[BaseStrategy]] = []
    hybrid: list[BaseStrategy] = []
    raw_params: list[dict[str, object]] = []
    grid = list(product(
        [0.05, 0.10, 0.20, 0.30],
        [0.30, 0.50, 0.70],
        [100, 200, 300],
        [60, 120, 252],
        [0.03, 0.05, 0.07, 0.10],
        [0.02, 0.03, 0.05],
        [0.20, 0.30, 0.40],
        [0.50, 0.70, 0.90],
        [0.70, 0.80, 0.90],
        [90, 180, 365, 730],
    ))
    for (
        premium_threshold,
        spread_threshold,
        trend_ma,
        drawdown_window,
        drawdown_threshold,
        dca_step,
        initial_buy_pct,
        max_exposure,
        exit_premium,
        max_holding_days,
    ) in grid:
        raw_params.append({
            "buy_threshold": premium_threshold,
            "max_spread_percentile": spread_threshold,
            "trend_col": f"domestic_ma{trend_ma}",
            "drawdown_window": drawdown_window,
            "drawdown_threshold": drawdown_threshold,
            "dca_drop": dca_step,
            "initial_fraction": initial_buy_pct,
            "dca_fraction": min(0.20, max_exposure - initial_buy_pct),
            "max_exposure": min(max_exposure, config.max_exposure),
            "exit_threshold": exit_premium,
            "max_holding_days": max_holding_days,
            "premium_percentile_col": "premium_pct_pctile_252d",
            "spread_percentile_col": "spread_pct_pctile_252d",
        })

    hybrid.extend(HybridPremiumTrendDcaStrategy(params) for params in raw_params)
    families.append(hybrid)

    premium_accumulation: list[BaseStrategy] = []
    for premium, spread, trend, max_exp in product([0.2, 0.3, 0.4], [0.5, 0.7], ["domestic_ma100", "domestic_ma200", "domestic_ma300"], [0.5, 0.7, 0.9]):
        premium_accumulation.append(PremiumAccumulationStrategy({
            "premium_threshold": premium,
            "spread_threshold": spread,
            "trend_col": trend,
            "initial_fraction": 0.2,
            "monthly_fraction": 0.05,
            "max_exposure": min(max_exp, config.max_exposure),
            "exit_threshold": 0.8,
        }))
    families.append(premium_accumulation)

    trend_valuation: list[BaseStrategy] = []
    for trend, max_premium, max_spread, max_exp in product(["domestic_ma100", "domestic_ma200", "world_ma200"], [0.5, 0.7], [0.6, 0.8], [0.5, 0.7, 0.9]):
        trend_valuation.append(TrendValuationStrategy({
            "trend_col": trend,
            "max_premium": max_premium,
            "max_spread": max_spread,
            "initial_fraction": 0.3,
            "add_fraction": 0.08,
            "max_exposure": min(max_exp, config.max_exposure),
            "exit_premium": 0.9,
        }))
    families.append(trend_valuation)

    drawdown_ladder: list[BaseStrategy] = []
    for window, max_premium, max_spread, step, max_exp in product([60, 120, 252], [0.5, 0.7], [0.6, 0.8], [0.15, 0.2], [0.5, 0.7, 0.9]):
        drawdown_ladder.append(DrawdownLadderStrategy({
            "drawdown_window": window,
            "max_premium": max_premium,
            "max_spread": max_spread,
            "step_fraction": step,
            "max_exposure": min(max_exp, config.max_exposure),
            "exit_premium": 0.8,
        }))
    families.append(drawdown_ladder)

    balanced_dca: list[BaseStrategy] = []
    for trend, max_premium, cheap_premium, max_exp in product(["domestic_ma100", "domestic_ma200", "domestic_ma300"], [0.6, 0.75], [0.2, 0.3], [0.5, 0.7, 0.9]):
        balanced_dca.append(BalancedDcaStrategy({
            "trend_col": trend,
            "max_premium": max_premium,
            "cheap_premium": cheap_premium,
            "max_spread": 0.8,
            "monthly_fraction": 0.04,
            "cheap_add": 0.04,
            "drawdown_add": 0.06,
            "max_exposure": min(max_exp, config.max_exposure),
            "exit_premium": 0.9,
        }))
    families.append(balanced_dca)

    quota = max(1, config.max_strategies // len(families))
    sampled = [_sample_family(family, quota) for family in families]
    selected: list[BaseStrategy] = []
    while len(selected) < config.max_strategies and any(sampled):
        for family in sampled:
            if family and len(selected) < config.max_strategies:
                selected.append(family.pop(0))
    if len(selected) < config.max_strategies:
        seen = {strategy.unique_name for strategy in selected}
        for strategy in hybrid:
            if strategy.unique_name not in seen:
                selected.append(strategy)
                seen.add(strategy.unique_name)
            if len(selected) >= config.max_strategies:
                break
    return selected[: config.max_strategies]


def _sample_family(family: list[BaseStrategy], limit: int) -> list[BaseStrategy]:
    if len(family) <= limit:
        return family.copy()
    step = len(family) / limit
    return [family[int(index * step)] for index in range(limit)]


def strategy_display_name(strategy: BaseStrategy) -> str:
    return strategy.unique_name


def strategy_factory_frame(strategies: list[BaseStrategy]) -> "pd.DataFrame":
    import pandas as pd

    return pd.DataFrame(
        [
            {
                "strategy": strategy_display_name(strategy),
                "base_name": strategy.name,
                "description": strategy.description,
                "params": strategy.params,
            }
            for strategy in strategies
        ]
    )
