from __future__ import annotations

from pathlib import Path

import pandas as pd

from engines.candidate_engine_v1 import ENABLED, generate_candidate_signal
from research.backtest.config import BacktestConfig
from research.backtest.final_recommendation import build_final_recommendations
from research.backtest.regime_analysis import add_regime_labels, run_regime_analysis
from research.backtest.report import build_report
from research.backtest.robustness import parameter_stability, run_robustness_tests
from research.strategies.phase25_strategies import DrawdownLadderStrategy
from research.tests.test_features_data_and_runner import synthetic_data
from research.backtest.feature_engineering import add_features


def candidate() -> DrawdownLadderStrategy:
    return DrawdownLadderStrategy(
        {
            "drawdown_window": 252,
            "max_exposure": 0.7,
            "max_premium": 0.7,
            "max_spread": 0.8,
            "step_fraction": 0.2,
            "exit_premium": 0.8,
        }
    )


def test_robustness_outputs_not_empty() -> None:
    data = add_features(synthetic_data(360))
    result = run_robustness_tests(data, [candidate()], BacktestConfig(fee_bps=0, slippage_bps=0), monte_carlo_runs=20)
    assert not result["robustness_results"].empty
    assert not result["robustness_summary"].empty
    assert not result["monte_carlo_results"].empty


def test_parameter_stability_runs() -> None:
    data = add_features(synthetic_data(360))
    rows = parameter_stability(data, candidate(), BacktestConfig(fee_bps=0, slippage_bps=0), 0.1, 0.1)
    assert rows


def test_regime_labels_and_analysis() -> None:
    data = add_features(synthetic_data(360))
    labeled = add_regime_labels(data)
    assert {"trend_regime", "volatility_regime", "premium_regime", "spread_regime", "fx_regime"}.issubset(labeled.columns)
    result = run_regime_analysis(labeled, [candidate()], BacktestConfig(fee_bps=0, slippage_bps=0))
    assert not result["regime_results"].empty
    assert not result["regime_summary"].empty


def test_final_recommendations_created() -> None:
    balanced = pd.DataFrame(
        {
            "strategy": ["s"],
            "balanced_score": [0.5],
            "conservative_score": [0.4],
            "cagr": [0.1],
            "max_drawdown": [-0.1],
            "overfit_flag": [False],
        }
    )
    robustness = pd.DataFrame({"strategy": ["s"], "robustness_score": [0.8], "parameter_stability_score": [0.7], "robustness_failure_flag": [False], "parameter_overfit_flag": [False]})
    regime = pd.DataFrame({"strategy": ["s"], "regime_stability_score": [0.6], "regime_concentration_flag": [False]})
    final, payload = build_final_recommendations(balanced, robustness, regime)
    assert not final.empty
    assert "final_score" in final.columns
    assert payload["top_candidates"]


def test_report_html_created(tmp_path: Path) -> None:
    pd.DataFrame({"strategy": ["hold_cash"], "cagr": [0], "max_drawdown": [0]}).to_csv(tmp_path / "benchmark_clean_comparison.csv", index=False)
    pd.DataFrame({"strategy": ["s"], "final_score": [1]}).to_csv(tmp_path / "final_recommendations.csv", index=False)
    pd.DataFrame({"strategy": ["s"], "robustness_score": [1]}).to_csv(tmp_path / "robustness_summary.csv", index=False)
    pd.DataFrame({"strategy": ["s"], "worst_regime": ["x"], "best_regime": ["y"]}).to_csv(tmp_path / "regime_summary.csv", index=False)
    pd.DataFrame({"strategy": ["current"], "status": ["insufficient_historical_signal_coverage"]}).to_csv(tmp_path / "compare_current_engine.csv", index=False)
    path = build_report(tmp_path)
    assert path.exists()
    assert "Phase 3" in path.read_text(encoding="utf-8")


def test_candidate_engine_disabled() -> None:
    assert ENABLED is False
    assert generate_candidate_signal({}, 0)["signal"] == "DISABLED"

