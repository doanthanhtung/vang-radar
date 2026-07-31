from __future__ import annotations

import pandas as pd

from research.backtest.benchmark import buy_and_hold_capped, buy_and_hold_pure
from research.backtest.compare_engines import current_signal_coverage
from research.backtest.config import BacktestConfig
from research.backtest.phase25_analysis import build_hurdle_results, build_phase25_rankings
from research.backtest.scoring import apply_score_penalties, balanced_score, conservative_score
from research.tests.test_features_data_and_runner import synthetic_data


def test_benchmark_pure_does_not_risk_rebalance() -> None:
    data = synthetic_data(120)
    config = BacktestConfig(max_exposure=0.5, fee_bps=0, slippage_bps=0)
    _, trades = buy_and_hold_pure(data, config)
    assert "risk_rebalance_max_exposure" not in set(trades.get("reason", []))
    assert "benchmark_rebalance_max_exposure" not in set(trades.get("reason", []))


def test_benchmark_capped_can_rebalance() -> None:
    data = synthetic_data(120)
    config = BacktestConfig(max_exposure=0.5, fee_bps=0, slippage_bps=0)
    _, trades = buy_and_hold_capped(data, config)
    assert "benchmark_rebalance_max_exposure" in set(trades["reason"])


def test_current_engine_insufficient_coverage_flag() -> None:
    data = synthetic_data(100)
    data["current_signal"] = None
    data.loc[:10, "current_signal"] = "HOLD"
    coverage = current_signal_coverage(data)
    assert coverage["status"] == "insufficient_historical_signal_coverage"
    assert coverage["buy_signal_days"] == 0


def test_hurdle_and_recommendation_filters_flags() -> None:
    config = BacktestConfig()
    full = pd.DataFrame(
        {
            "strategy": ["candidate_a"],
            "cagr": [0.02],
            "max_drawdown": [-0.02],
            "number_of_trades": [2],
            "average_exposure": [0.05],
            "pct_time_in_gold": [0.05],
            "sortino_ratio": [1.0],
            "calmar_ratio": [1.0],
            "turnover": [0.1],
        }
    )
    bench = pd.DataFrame(
        {
            "strategy": ["monthly_dca_pure", "buy_and_hold_pure"],
            "cagr": [0.10, 0.12],
            "max_drawdown": [-0.3, -0.3],
        }
    )
    hurdle = build_hurdle_results(full, bench, config)
    assert bool(hurdle.iloc[0]["low_return_vs_benchmark_flag"])


def test_balanced_score_penalty_and_conservative_score_exist() -> None:
    frame = pd.DataFrame(
        {
            "cagr": [0.1, 0.1],
            "sortino_ratio": [1.0, 1.0],
            "calmar_ratio": [1.0, 1.0],
            "max_drawdown": [-0.1, -0.1],
            "turnover": [0.1, 0.1],
            "average_exposure": [0.5, 0.5],
            "low_trade_count_flag": [False, True],
            "low_exposure_flag": [False, False],
            "low_return_vs_benchmark_flag": [False, False],
            "overfit_flag": [False, False],
        }
    )
    frame["balanced_score_raw"] = balanced_score(frame)
    frame["conservative_score_raw"] = conservative_score(frame)
    apply_score_penalties(frame, "balanced_score_raw", "balanced_score")
    assert frame.loc[0, "balanced_score"] > frame.loc[1, "balanced_score"]
    assert "conservative_score_raw" in frame.columns


def test_recommended_candidates_exclude_flagged_by_default() -> None:
    config = BacktestConfig()
    oos = pd.DataFrame({"strategy": ["bad"], "out_of_sample_score": [0.5], "oos_score_std": [0.0], "stability_score": [0.5], "overfit_flag": [False]})
    wf = pd.DataFrame(
        {
            "strategy": ["bad"],
            "period": ["test"],
            "cagr": [0.01],
            "sortino_ratio": [1.0],
            "calmar_ratio": [1.0],
            "max_drawdown": [-0.01],
            "turnover": [0.1],
            "number_of_trades": [1],
            "average_holding_days": [10],
            "average_exposure": [0.02],
            "pct_time_in_gold": [0.02],
            "period_score": [0.5],
        }
    )
    full = pd.DataFrame(
        {
            "strategy": ["bad"],
            "cagr": [0.01],
            "sortino_ratio": [1.0],
            "calmar_ratio": [1.0],
            "max_drawdown": [-0.01],
            "turnover": [0.1],
            "number_of_trades": [1],
            "average_exposure": [0.02],
            "pct_time_in_gold": [0.02],
        }
    )
    bench = pd.DataFrame({"strategy": ["monthly_dca_pure", "buy_and_hold_pure"], "cagr": [0.1, 0.12], "max_drawdown": [-0.3, -0.3]})
    _, _, _, _, recommended = build_phase25_rankings(oos, wf, full, bench, config)
    assert recommended.empty
