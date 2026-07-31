"""Disabled candidate engine for manual review only.

Rule source:
  Phase 2.5 production backtest output: research/backtest/outputs/20260704_163059

Candidate rule:
  drawdown_ladder_dd252_maxExp70_prem70_spread80_step20

Logic:
  - Use SJC_BAR daily data.
  - Compute 252-day domestic drawdown from rolling high.
  - Buy progressively when drawdown reaches 3%, 5%, 7%, and 10%.
  - Each ladder step targets +20% exposure.
  - Do not exceed 70% exposure.
  - Only buy when premium percentile <= 70 and spread percentile <= 80.
  - Trim 50% when premium percentile reaches 80.

Assumptions:
  - Buy execution uses domestic_ask.
  - Sell and mark-to-market use domestic_bid.
  - Fee/slippage assumptions must be supplied by caller.

Warning:
  This module is not production-enabled and is not imported by production
  scoring. Promotion requires manual review and explicit integration.
"""

from __future__ import annotations

from typing import Any

ENABLED = False

PARAMS = {
    "drawdown_window": 252,
    "max_exposure": 0.70,
    "max_premium_percentile": 0.70,
    "max_spread_percentile": 0.80,
    "step_fraction": 0.20,
    "exit_premium_percentile": 0.80,
    "drawdown_levels": [0.03, 0.05, 0.07, 0.10],
}


def generate_candidate_signal(features: dict[str, Any], current_exposure: float) -> dict[str, Any]:
    """Return a review-only signal for the candidate rule."""

    if not ENABLED:
        return {"enabled": False, "signal": "DISABLED", "reason": "candidate_engine_v1 is disabled by default"}
    premium = features.get("premium_pct_pctile_252d")
    spread = features.get("spread_pct_pctile_252d")
    drawdown = features.get("domestic_drawdown_252d")
    if premium is None or spread is None or drawdown is None:
        return {"enabled": True, "signal": "HOLD", "reason": "missing required candidate features"}
    if float(premium) >= PARAMS["exit_premium_percentile"] and current_exposure > 0:
        return {"enabled": True, "signal": "SELL_PARTIAL", "target_sell_fraction": 0.5, "reason": "premium compression exit"}
    if float(premium) > PARAMS["max_premium_percentile"] or float(spread) > PARAMS["max_spread_percentile"]:
        return {"enabled": True, "signal": "HOLD", "reason": "premium or spread guardrail"}
    target_exposure = 0.0
    for index, level in enumerate(PARAMS["drawdown_levels"], start=1):
        if float(drawdown) <= -level:
            target_exposure = min(PARAMS["max_exposure"], index * PARAMS["step_fraction"])
    if target_exposure > current_exposure:
        return {"enabled": True, "signal": "BUY", "target_exposure": target_exposure, "reason": "drawdown ladder add"}
    return {"enabled": True, "signal": "HOLD", "reason": "no ladder level crossed"}

