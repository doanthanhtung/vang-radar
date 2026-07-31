"""Performance metrics for backtest outputs."""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd


def compute_metrics(
    equity_curve: pd.DataFrame,
    trades: pd.DataFrame,
    initial_capital: float,
    annualization_days: int = 252,
) -> dict[str, Any]:
    if equity_curve.empty:
        raise ValueError("Cannot compute metrics on an empty equity curve")
    equity = pd.to_numeric(equity_curve["equity"], errors="coerce")
    returns = equity.pct_change().fillna(0.0)
    total_return = float(equity.iloc[-1] / initial_capital - 1.0)
    days = max(1, (pd.Timestamp(equity_curve["date"].iloc[-1]) - pd.Timestamp(equity_curve["date"].iloc[0])).days)
    cagr = float((1.0 + total_return) ** (365.25 / days) - 1.0) if total_return > -1 else -1.0
    ann_vol = float(returns.std(ddof=0) * math.sqrt(annualization_days))
    downside = returns[returns < 0]
    downside_vol = float(downside.std(ddof=0) * math.sqrt(annualization_days)) if len(downside) else 0.0
    sharpe = _safe_ratio(float(returns.mean() * annualization_days), ann_vol)
    sortino = _safe_ratio(float(returns.mean() * annualization_days), downside_vol)
    running_max = equity.cummax()
    drawdown = equity / running_max - 1.0
    max_drawdown = float(drawdown.min())
    calmar = _safe_ratio(cagr, abs(max_drawdown))
    trade_returns = _trade_returns(trades)
    profit_factor = _profit_factor(trade_returns)
    holding_days = _holding_days(trades)
    exposure = pd.to_numeric(equity_curve.get("exposure", pd.Series([0.0] * len(equity_curve))), errors="coerce").fillna(0.0)
    costs = _transaction_costs(trades)
    yearly = equity_curve.copy()
    yearly["date"] = pd.to_datetime(yearly["date"])
    yearly["year"] = yearly["date"].dt.year
    yearly_returns = yearly.groupby("year")["equity"].agg(lambda s: s.iloc[-1] / s.iloc[0] - 1.0)

    return {
        "cagr": cagr,
        "total_return": total_return,
        "annualized_volatility": ann_vol,
        "sharpe_ratio": sharpe,
        "sortino_ratio": sortino,
        "max_drawdown": max_drawdown,
        "calmar_ratio": calmar,
        "win_rate": float((trade_returns > 0).mean()) if len(trade_returns) else 0.0,
        "profit_factor": profit_factor,
        "average_trade_return": float(trade_returns.mean()) if len(trade_returns) else 0.0,
        "median_trade_return": float(trade_returns.median()) if len(trade_returns) else 0.0,
        "average_holding_days": float(np.mean(holding_days)) if holding_days else 0.0,
        "number_of_trades": int(len(trades)),
        "worst_trade": float(trade_returns.min()) if len(trade_returns) else 0.0,
        "best_trade": float(trade_returns.max()) if len(trade_returns) else 0.0,
        "worst_calendar_year": float(yearly_returns.min()) if len(yearly_returns) else 0.0,
        "recovery_time_days": int(_recovery_time_days(equity_curve, drawdown)),
        "pct_time_in_gold": float((exposure > 0).mean()),
        "average_exposure": float(exposure.mean()),
        "max_exposure": float(exposure.max()),
        "turnover": float(_turnover(trades, initial_capital)),
        "transaction_cost_impact": float(costs / initial_capital),
    }


def _safe_ratio(numerator: float, denominator: float) -> float:
    return 0.0 if denominator == 0 or not math.isfinite(denominator) else numerator / denominator


def _trade_returns(trades: pd.DataFrame) -> pd.Series:
    if trades.empty:
        return pd.Series(dtype=float)
    buys: list[dict[str, float]] = []
    returns: list[float] = []
    for _, trade in trades.iterrows():
        if trade["side"] == "BUY":
            buys.append({"qty": float(trade["quantity"]), "cost": -float(trade["net_cash_flow"])})
        elif buys:
            sell_qty = float(trade["quantity"])
            proceeds_per_unit = float(trade["net_cash_flow"]) / sell_qty
            while sell_qty > 1e-9 and buys:
                lot = buys[0]
                qty = min(sell_qty, lot["qty"])
                cost_per_unit = lot["cost"] / lot["qty"]
                returns.append(proceeds_per_unit / cost_per_unit - 1.0)
                lot["qty"] -= qty
                lot["cost"] -= cost_per_unit * qty
                sell_qty -= qty
                if lot["qty"] <= 1e-9:
                    buys.pop(0)
    return pd.Series(returns, dtype=float)


def _profit_factor(trade_returns: pd.Series) -> float:
    gains = trade_returns[trade_returns > 0].sum()
    losses = abs(trade_returns[trade_returns < 0].sum())
    if losses == 0:
        return float("inf") if gains > 0 else 0.0
    return float(gains / losses)


def _holding_days(trades: pd.DataFrame) -> list[int]:
    if trades.empty:
        return []
    entry_dates: list[pd.Timestamp] = []
    holds: list[int] = []
    for _, trade in trades.iterrows():
        if trade["side"] == "BUY":
            entry_dates.append(pd.Timestamp(trade["date"]))
        elif entry_dates:
            entry = entry_dates.pop(0)
            holds.append((pd.Timestamp(trade["date"]) - entry).days)
    return holds


def _recovery_time_days(equity_curve: pd.DataFrame, drawdown: pd.Series) -> int:
    if drawdown.min() >= 0:
        return 0
    trough = int(drawdown.idxmin())
    prior_peak = float(equity_curve["equity"].iloc[: trough + 1].max())
    after = equity_curve.iloc[trough:]
    recovered = after[after["equity"] >= prior_peak]
    if recovered.empty:
        return int((pd.Timestamp(after["date"].iloc[-1]) - pd.Timestamp(after["date"].iloc[0])).days)
    return int((pd.Timestamp(recovered["date"].iloc[0]) - pd.Timestamp(after["date"].iloc[0])).days)


def _turnover(trades: pd.DataFrame, initial_capital: float) -> float:
    if trades.empty:
        return 0.0
    return float(pd.to_numeric(trades["gross_value"]).sum() / initial_capital)


def _transaction_costs(trades: pd.DataFrame) -> float:
    if trades.empty:
        return 0.0
    return float(pd.to_numeric(trades["fee"]).sum() + pd.to_numeric(trades["slippage"]).sum())

