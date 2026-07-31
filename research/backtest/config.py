"""Configuration objects for the VangScore research backtester."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


DEFAULT_COLUMN_MAPPING: dict[str, str] = {
    "date": "date",
    "domestic_bid": "domestic_bid",
    "domestic_ask": "domestic_ask",
    "domestic_mid": "domestic_mid",
    "world_gold_usd": "world_gold_usd",
    "usd_vnd": "usd_vnd",
    "premium": "premium",
    "premium_pct": "premium_pct",
    "spread": "spread",
    "spread_pct": "spread_pct",
    "fx_return": "fx_return",
    "world_gold_return": "world_gold_return",
    "domestic_gold_return": "domestic_gold_return",
    "current_score": "current_score",
    "current_signal": "current_signal",
    "product_type": "product_type",
}

DEFAULT_SCORE_WEIGHTS: dict[str, float] = {
    "cagr": 0.35,
    "sortino_ratio": 0.25,
    "calmar_ratio": 0.20,
    "max_drawdown": -0.15,
    "turnover": -0.05,
}


@dataclass(frozen=True)
class BacktestConfig:
    """Runtime configuration for reproducible backtests."""

    initial_capital: float = 1_000_000_000.0
    fee_bps: float = 5.0
    slippage_bps: float = 3.0
    execution_delay_days: int = 1
    max_exposure: float = 1.0
    cash_reserve_pct: float = 0.0
    allow_mid_fallback: bool = False
    max_strategies: int = 300
    random_seed: int = 42
    annualization_days: int = 252
    dca_day_of_month: int = 1
    dca_cash_fraction: float = 0.05
    min_full_period_trades: int = 10
    min_oos_total_trades: int = 8
    min_trades_per_year: float = 0.5
    min_average_exposure: float = 0.10
    allow_low_trade_count: bool = False
    allow_low_return_vs_benchmark: bool = False
    monthly_dca_hurdle_fraction: float = 0.60
    buy_hold_hurdle_fraction: float = 0.50
    output_root: Path = Path("research/backtest/outputs")
    column_mapping: dict[str, str] = field(default_factory=lambda: DEFAULT_COLUMN_MAPPING.copy())
    score_weights: dict[str, float] = field(default_factory=lambda: DEFAULT_SCORE_WEIGHTS.copy())
    version: str = "phase2.0"

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["output_root"] = str(self.output_root)
        return data


DEFAULT_CONFIG = BacktestConfig()
