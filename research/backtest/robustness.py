"""Robustness tests for Phase 3 candidate review."""

from __future__ import annotations

from dataclasses import replace
from typing import Any

import numpy as np
import pandas as pd

from .benchmark import run_strategy
from .config import BacktestConfig
from .metrics import compute_metrics
from research.strategies.base_strategy import BaseStrategy


def run_robustness_tests(
    df: pd.DataFrame,
    candidates: list[BaseStrategy],
    config: BacktestConfig,
    monte_carlo_runs: int = 500,
) -> dict[str, pd.DataFrame]:
    stress_rows: list[dict[str, Any]] = []
    stability_rows: list[dict[str, Any]] = []
    mc_rows: list[dict[str, Any]] = []
    leave_rows: list[dict[str, Any]] = []
    for strategy in candidates:
        base_equity, base_trades = run_strategy(df, strategy, config)
        base_metrics = compute_metrics(base_equity, base_trades, config.initial_capital, config.annualization_days)
        base_cagr = float(base_metrics["cagr"])
        base_mdd = abs(float(base_metrics["max_drawdown"]))
        for mult in [1, 2, 3, 5]:
            stress_rows.append(_stress_result(df, strategy, replace(config, fee_bps=config.fee_bps * mult), "fee", f"fee_x{mult}", base_cagr, base_mdd))
        for mult in [1, 2, 3, 5]:
            stress_rows.append(_stress_result(df, strategy, replace(config, slippage_bps=config.slippage_bps * mult), "slippage", f"slippage_x{mult}", base_cagr, base_mdd))
        for pct in [0.0, 0.10, 0.25, 0.50, 1.00]:
            stress_rows.append(_stress_result(widen_spread(df, pct), strategy, config, "spread", f"spread_plus_{int(pct * 100)}pct", base_cagr, base_mdd))
        for delay in [0, 1, 2, 3]:
            stress_rows.append(_stress_result(df, strategy, replace(config, execution_delay_days=delay), "delay", f"t_plus_{delay}", base_cagr, base_mdd))
        for drop in [0.01, 0.05, 0.10]:
            stress_rows.append(_stress_result(drop_random_rows(df, drop, config.random_seed), strategy, config, "missing_data", f"drop_{int(drop * 100)}pct", base_cagr, base_mdd))
        stress_rows.append(_stress_result(inject_outliers(df, config.random_seed), strategy, config, "outlier", "bad_quotes_and_premium_spread", base_cagr, base_mdd))
        stability_rows.extend(parameter_stability(df, strategy, config, base_cagr, base_mdd))
        mc_rows.append(monte_carlo_summary(base_equity, strategy.unique_name, config, monte_carlo_runs))
        leave_rows.extend(leave_one_period_out(df, strategy, config))
    stress = pd.DataFrame(stress_rows)
    stability = pd.DataFrame(stability_rows)
    monte_carlo = pd.DataFrame(mc_rows)
    leave_one = pd.DataFrame(leave_rows)
    summary = robustness_summary(stress, stability, monte_carlo, leave_one)
    return {
        "stress_test_results": stress,
        "parameter_stability": stability,
        "monte_carlo_results": monte_carlo,
        "leave_one_period_results": leave_one,
        "robustness_results": pd.concat([stress, leave_one], ignore_index=True, sort=False),
        "robustness_summary": summary,
    }


def widen_spread(df: pd.DataFrame, pct: float) -> pd.DataFrame:
    out = df.copy()
    mid = (out["domestic_bid"] + out["domestic_ask"]) / 2.0
    spread = (out["domestic_ask"] - out["domestic_bid"]) * (1.0 + pct)
    out["domestic_bid"] = mid - spread / 2.0
    out["domestic_ask"] = mid + spread / 2.0
    out["domestic_mid"] = mid
    out["spread"] = out["domestic_ask"] - out["domestic_bid"]
    out["spread_pct"] = out["spread"] / out["domestic_ask"]
    return out


def drop_random_rows(df: pd.DataFrame, pct: float, seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed + int(pct * 10_000))
    keep = rng.random(len(df)) >= pct
    keep[0] = True
    keep[-1] = True
    return df.loc[keep].reset_index(drop=True)


def inject_outliers(df: pd.DataFrame, seed: int) -> pd.DataFrame:
    out = df.copy()
    if len(out) < 20:
        return out
    rng = np.random.default_rng(seed)
    indexes = rng.choice(np.arange(5, len(out) - 5), size=max(1, len(out) // 200), replace=False)
    out.loc[indexes, "premium_pct"] = out.loc[indexes, "premium_pct"] * 5
    out.loc[indexes, "spread_pct"] = out.loc[indexes, "spread_pct"] * 5
    bad_quote_indexes = indexes[: max(1, len(indexes) // 3)]
    out.loc[bad_quote_indexes, "domestic_ask"] = out.loc[bad_quote_indexes, "domestic_ask"] * 1.25
    return out


def _stress_result(df: pd.DataFrame, strategy: BaseStrategy, config: BacktestConfig, test_type: str, scenario: str, base_cagr: float, base_mdd: float) -> dict[str, Any]:
    equity, trades = run_strategy(df, strategy, config)
    metrics = compute_metrics(equity, trades, config.initial_capital, config.annualization_days)
    cagr = float(metrics["cagr"])
    mdd = abs(float(metrics["max_drawdown"]))
    return {
        "strategy": strategy.unique_name,
        "test_type": test_type,
        "scenario": scenario,
        **metrics,
        "cagr_change_pct": 0.0 if base_cagr == 0 else (cagr - base_cagr) / abs(base_cagr),
        "maxdd_increase_pct": 0.0 if base_mdd == 0 else (mdd - base_mdd) / base_mdd,
        "fee_bps": config.fee_bps,
        "slippage_bps": config.slippage_bps,
        "execution_delay_days": config.execution_delay_days,
    }


def parameter_stability(df: pd.DataFrame, strategy: BaseStrategy, config: BacktestConfig, base_cagr: float, base_mdd: float) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if strategy.name != "drawdown_ladder":
        return rows
    from research.strategies.phase25_strategies import DrawdownLadderStrategy

    base_params = strategy.params.copy()
    grid = {
        "drawdown_window": [120, 252],
        "max_exposure": [0.5, 0.7, 0.9],
        "max_premium": [0.5, 0.6, 0.7, 0.8],
        "max_spread": [0.6, 0.7, 0.8],
        "step_fraction": [0.10, 0.15, 0.20, 0.25],
    }
    for key, values in grid.items():
        for value in values:
            params = base_params.copy()
            params[key] = value
            variant = DrawdownLadderStrategy(params)
            equity, trades = run_strategy(df, variant, config)
            metrics = compute_metrics(equity, trades, config.initial_capital, config.annualization_days)
            cagr = float(metrics["cagr"])
            mdd = abs(float(metrics["max_drawdown"]))
            rows.append({"strategy": strategy.unique_name, "variant_param": key, "variant_value": value, **metrics, "cagr_change_pct": 0.0 if base_cagr == 0 else (cagr - base_cagr) / abs(base_cagr), "maxdd_increase_pct": 0.0 if base_mdd == 0 else (mdd - base_mdd) / base_mdd})
    return rows


def monte_carlo_summary(equity: pd.DataFrame, strategy_name: str, config: BacktestConfig, runs: int) -> dict[str, Any]:
    returns = pd.to_numeric(equity["equity"], errors="coerce").pct_change().dropna().to_numpy()
    if len(returns) == 0:
        return {"strategy": strategy_name, "runs": runs}
    rng = np.random.default_rng(config.random_seed)
    years = max(1e-9, (pd.Timestamp(equity["date"].iloc[-1]) - pd.Timestamp(equity["date"].iloc[0])).days / 365.25)
    cagrs: list[float] = []
    drawdowns: list[float] = []
    for _ in range(runs):
        sampled = rng.choice(returns, size=len(returns), replace=True)
        curve = np.cumprod(1.0 + sampled)
        total = curve[-1] - 1.0
        cagrs.append((1.0 + total) ** (1.0 / years) - 1.0 if total > -1 else -1.0)
        drawdowns.append(float((curve / np.maximum.accumulate(curve) - 1.0).min()))
    cagr_arr = np.array(cagrs)
    dd_arr = np.array(drawdowns)
    return {"strategy": strategy_name, "runs": runs, "median_cagr": float(np.median(cagr_arr)), "p5_cagr": float(np.percentile(cagr_arr, 5)), "p95_max_drawdown": float(np.percentile(dd_arr, 5)), "prob_negative_cagr": float(np.mean(cagr_arr < 0)), "prob_maxdd_worse_than_20pct": float(np.mean(dd_arr < -0.20)), "worst_simulated_drawdown": float(dd_arr.min())}


def leave_one_period_out(df: pd.DataFrame, strategy: BaseStrategy, config: BacktestConfig) -> list[dict[str, Any]]:
    periods = [("2010_2012", "2010-01-01", "2012-12-31"), ("2013_2015", "2013-01-01", "2015-12-31"), ("2016_2018", "2016-01-01", "2018-12-31"), ("2019_2021", "2019-01-01", "2021-12-31"), ("2022_2024", "2022-01-01", "2024-12-31"), ("2025_2026", "2025-01-01", "2026-12-31")]
    rows: list[dict[str, Any]] = []
    dates = pd.to_datetime(df["date"])
    for label, start, end in periods:
        subset = df.loc[~((dates >= pd.Timestamp(start)) & (dates <= pd.Timestamp(end)))].copy()
        if len(subset) < 30:
            continue
        equity, trades = run_strategy(subset, strategy, config)
        rows.append({"strategy": strategy.unique_name, "test_type": "leave_one_period_out", "scenario": f"exclude_{label}", **compute_metrics(equity, trades, config.initial_capital, config.annualization_days)})
    return rows


def robustness_summary(stress: pd.DataFrame, stability: pd.DataFrame, monte_carlo: pd.DataFrame, leave_one: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    strategies = sorted(set(stress.get("strategy", [])) | set(stability.get("strategy", [])) | set(monte_carlo.get("strategy", [])))
    for strategy in strategies:
        s = stress[stress["strategy"] == strategy]
        p = stability[stability["strategy"] == strategy]
        m = monte_carlo[monte_carlo["strategy"] == strategy]
        l = leave_one[leave_one["strategy"] == strategy]
        fee3 = _scenario(s, "fee_x3")
        slip3 = _scenario(s, "slippage_x3")
        delay2 = _scenario(s, "t_plus_2")
        spread50 = _scenario(s, "spread_plus_50pct")
        parameter_score = float((p["cagr"] > 0).mean()) if not p.empty else 0.0
        parameter_overfit = bool((p["cagr_change_pct"] < -0.5).mean() > 0.25) if not p.empty else True
        mc = m.iloc[0] if not m.empty else {}
        leave_score = float((l["cagr"] > 0).mean()) if not l.empty else 0.0
        robustness_failure = any([_fails_cagr_drop(fee3, 0.30), _fails_cagr_drop(slip3, 0.30), _fails_delay(delay2), _fails_positive(spread50), bool(mc.get("prob_maxdd_worse_than_20pct", 1.0) > 0.25)])
        rows.append({"strategy": strategy, "fee_x3_pass": not _fails_cagr_drop(fee3, 0.30), "slippage_x3_pass": not _fails_cagr_drop(slip3, 0.30), "delay_t2_pass": not _fails_delay(delay2), "spread_plus_50_pass": not _fails_positive(spread50), "parameter_stability_score": parameter_score, "parameter_overfit_flag": parameter_overfit, "leave_one_period_score": leave_score, "monte_carlo_p5_cagr": float(mc.get("p5_cagr", np.nan)), "monte_carlo_prob_maxdd_worse_than_20pct": float(mc.get("prob_maxdd_worse_than_20pct", np.nan)), "robustness_failure_flag": robustness_failure, "robustness_score": _bounded_score([not _fails_cagr_drop(fee3, 0.30), not _fails_cagr_drop(slip3, 0.30), not _fails_delay(delay2), not _fails_positive(spread50), parameter_score, leave_score, 1.0 - float(mc.get("prob_maxdd_worse_than_20pct", 1.0))])})
    return pd.DataFrame(rows)


def _scenario(frame: pd.DataFrame, scenario: str) -> pd.Series:
    rows = frame[frame["scenario"] == scenario]
    return rows.iloc[0] if not rows.empty else pd.Series(dtype=float)


def _fails_cagr_drop(row: pd.Series, threshold: float) -> bool:
    return True if row.empty else bool(row.get("cagr_change_pct", -1.0) < -threshold)


def _fails_delay(row: pd.Series) -> bool:
    return True if row.empty else bool(row.get("cagr", -1.0) <= 0 or row.get("maxdd_increase_pct", 1.0) > 0.5)


def _fails_positive(row: pd.Series) -> bool:
    return True if row.empty else bool(row.get("cagr", -1.0) <= 0)


def _bounded_score(values: list[Any]) -> float:
    numeric = [float(value) for value in values if pd.notna(value)]
    return 0.0 if not numeric else float(max(0.0, min(1.0, np.mean(numeric))))
