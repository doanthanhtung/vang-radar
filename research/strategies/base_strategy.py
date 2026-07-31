"""Strategy interface and order model for the research backtester."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

import pandas as pd


OrderSide = Literal["BUY", "SELL"]


@dataclass(frozen=True)
class Order:
    side: OrderSide
    target_fraction: float
    reason: str


@dataclass
class StrategyState:
    entry_price: float | None = None
    peak_price: float | None = None
    entry_date: pd.Timestamp | None = None
    dca_count: int = 0
    custom: dict[str, Any] = field(default_factory=dict)


class BaseStrategy:
    name = "base"
    description = "Abstract strategy"

    def __init__(self, params: dict[str, Any] | None = None) -> None:
        self.params = params or {}
        self.state = StrategyState()

    @property
    def unique_name(self) -> str:
        if not self.params:
            return self.name
        params = "_".join(f"{key}={value}" for key, value in sorted(self.params.items()))
        return f"{self.name}__{params}"

    def generate_order(self, row: pd.Series, portfolio: Any) -> Order | None:
        raise NotImplementedError

    def reset(self) -> None:
        self.state = StrategyState()
