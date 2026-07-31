"""Regime analysis for Phase 3 candidate review."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from .benchmark import run_strategy
from .config import BacktestConfig
from .metrics import compute_metrics
from research.strategies.base_strategy import BaseStrategy


def add_regime_labels(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    price = out["domestic_mid"] if "domestic_mid" in out.columns else (out["domestic_bid"] + out["domestic_ask"]) / 2.0
    ma200 = out.get("domestic_ma200", price.rolling(200, min_periods=40).mean())
    slope = ma200.diff(20)
    out["trend_regime"] = "sideway"
    out.loc[(price > ma200) & (slope > 0), "trend_regime"] = "bull"
    out.loc[(price < ma200) & (slope < 0), "trend_regime"] = "bear"
    vol = out.get("domestic_vol_60d", price.pct_change().rolling(60, min_periods=20).std())
    vol_rank = vol.rolling(252, min_periods=60).apply(lambda x: pd.Series(x).rank(pct=True).iloc[-1], raw=False)
    out["volatility_regime"] = "normal_volatility"
    out.loc[vol_rank >= 0.7, "volatility_regime"] = "high_volatility"
    out.loc[vol_rank <= 0.3, "volatility_regime"] = "low_volatility"
    premium_rank = out.get("premium_pct_pctile_252d")
    out["premium_regime"] = np.select([premium_rank < 0.3, premium_rank > 0.7], ["premium_low", "premium_high"], default="premium_mid")
    spread_rank = out.get("spread_pct_pctile_252d")
    out["spread_regime"] = np.select([spread_rank < 0.3, spread_rank > 0.7], ["spread_low", "spread_high"], default="spread_mid")
    if "usd_vnd" in out.columns:
        fx_ma100 = out["usd_vnd"].rolling(100, min_periods=20).mean()
        fx_return_60 = out["usd_vnd"].pct_change(60)
        out["fx_regime"] = np.select(
            [(out["usd_vnd"] > fx_ma100) | (fx_return_60 > 0), (out["usd_vnd"] < fx_ma100) | (fx_return_60 < 0)],
            ["fx_uptrend", "fx_downtrend"],
            default="fx_sideway",
        )
    else:
        out["fx_regime"] = "fx_unknown"
    return out


def run_regime_analysis(df: pd.DataFrame, candidates: list[BaseStrategy], config: BacktestConfig) -> dict[str, pd.DataFrame]:
    labeled = add_regime_labels(df)
    result_rows: list[dict[str, Any]] = []
    trade_rows: list[dict[str, Any]] = []
    summary_rows: list[dict[str, Any]] = []
    regime_cols = ["trend_regime", "volatility_regime", "premium_regime", "spread_regime", "fx_regime"]
    for strategy in candidates:
        equity, trades = run_strategy(labeled, strategy, config)
        equity = equity.copy()
        equity["date"] = pd.to_datetime(equity["date"])
        merged = equity.merge(labeled[["date", *regime_cols]], on="date", how="left")
        total_pnl = float(equity["equity"].iloc[-1] - equity["equity"].iloc[0])
        for regime_col in regime_cols:
            for regime, group in merged.groupby(regime_col):
                if len(group) < 2:
                    continue
                group = group.reset_index(drop=True)
                metrics = compute_metrics(group, pd.DataFrame(), float(group["equity"].iloc[0]), config.annualization_days)
                contribution = float(group["equity"].iloc[-1] - group["equity"].iloc[0])
                result_rows.append({
                    "strategy": strategy.unique_name,
                    "regime_type": regime_col,
                    "regime": regime,
                    "period_return": float(group["equity"].iloc[-1] / group["equity"].iloc[0] - 1.0),
                    "max_drawdown": metrics["max_drawdown"],
                    "average_exposure": float(group["exposure"].mean()),
                    "number_of_days": int(len(group)),
                    "contribution_to_total_pnl": 0.0 if total_pnl == 0 else contribution / total_pnl,
                })
        if not trades.empty:
            t = trades.copy()
            t["date"] = pd.to_datetime(t["date"])
            t = t.merge(labeled[["date", *regime_cols]], on="date", how="left")
            for regime_col in regime_cols:
                for regime, group in t.groupby(regime_col):
                    sells = group[group["side"] == "SELL"]
                    trade_rows.append({
                        "strategy": strategy.unique_name,
                        "regime_type": regime_col,
                        "regime": regime,
                        "number_of_trades": int(len(group)),
                        "win_rate": float((sells["realized_pnl"] > 0).mean()) if len(sells) else 0.0,
                        "avg_trade_return": float(sells["realized_pnl"].mean()) if len(sells) else 0.0,
                    })
        strategy_results = pd.DataFrame([row for row in result_rows if row["strategy"] == strategy.unique_name])
        if not strategy_results.empty:
            worst = strategy_results.sort_values("period_return").iloc[0]
            best = strategy_results.sort_values("period_return", ascending=False).iloc[0]
            concentration = float(strategy_results["contribution_to_total_pnl"].abs().max())
            summary_rows.append({
                "strategy": strategy.unique_name,
                "worst_regime": f"{worst['regime_type']}={worst['regime']}",
                "best_regime": f"{best['regime_type']}={best['regime']}",
                "regime_concentration": concentration,
                "regime_concentration_flag": concentration > 0.75,
                "regime_stability_score": float(max(0.0, min(1.0, 1.0 - concentration / 2.0))),
            })
    return {
        "regime_results": pd.DataFrame(result_rows),
        "regime_trade_breakdown": pd.DataFrame(trade_rows),
        "regime_summary": pd.DataFrame(summary_rows),
    }
