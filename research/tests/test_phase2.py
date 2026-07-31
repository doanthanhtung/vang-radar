from __future__ import annotations

import pandas as pd

from research.backtest.config import BacktestConfig
from research.backtest.compare_engines import compare_current_engine
from research.backtest.scoring import rank_out_of_sample
from research.backtest.strategy_factory import build_strategy_factory, strategy_display_name
from research.backtest.walk_forward import DEFAULT_SPLITS, run_walk_forward, slice_period, validate_split
from research.tests.test_features_data_and_runner import synthetic_data


def long_synthetic_data() -> pd.DataFrame:
    data = synthetic_data(6200)
    data["date"] = pd.date_range("2010-01-01", periods=len(data), freq="D")
    data["current_signal"] = "HOLD"
    data.loc[data.index % 45 == 0, "current_signal"] = "BUY_DCA"
    data.loc[data.index % 120 == 0, "current_signal"] = "TAKE_PROFIT"
    data["current_score"] = 50
    return data


def test_strategy_factory_caps_and_has_metadata() -> None:
    config = BacktestConfig(max_strategies=25)
    strategies = build_strategy_factory(config)
    names = [strategy_display_name(strategy) for strategy in strategies]
    assert len(strategies) == 25
    assert len(names) == len(set(names))
    for strategy in strategies:
        assert strategy.name
        assert strategy.params
        assert strategy.description


def test_walk_forward_splits_do_not_overlap_and_dates_are_correct() -> None:
    data = long_synthetic_data()
    for split in DEFAULT_SPLITS:
        validate_split(split)
        train = slice_period(data, split.train_start, split.train_end)
        test = slice_period(data, split.test_start, split.test_end)
        if not train.empty and not test.empty:
            assert train["date"].max() < test["date"].min()
            assert train["date"].min() >= pd.Timestamp(split.train_start)
            assert train["date"].max() <= pd.Timestamp(split.train_end)
            assert test["date"].min() >= pd.Timestamp(split.test_start)


def test_walk_forward_outputs_train_and_test_without_overlap() -> None:
    config = BacktestConfig(max_strategies=3, fee_bps=0, slippage_bps=0)
    data = long_synthetic_data()
    from research.backtest.feature_engineering import add_features

    results, ranking = run_walk_forward(add_features(data), build_strategy_factory(config), config, min_rows=30)
    assert not results.empty
    assert {"train", "test"}.issubset(set(results["period"]))
    assert not ranking.empty
    assert "out_of_sample_score" in ranking.columns
    assert "overfit_flag" in ranking.columns


def test_ranking_uses_out_of_sample_not_train_only() -> None:
    config = BacktestConfig()
    results = pd.DataFrame(
        {
            "strategy": ["overfit", "overfit", "stable", "stable"],
            "period": ["train", "test", "train", "test"],
            "split": ["s1", "s1", "s1", "s1"],
            "cagr": [1.0, -0.1, 0.2, 0.2],
            "sortino_ratio": [2.0, -1.0, 1.0, 1.0],
            "calmar_ratio": [2.0, -1.0, 1.0, 1.0],
            "max_drawdown": [-0.01, -0.5, -0.1, -0.1],
            "turnover": [0.1, 0.1, 0.1, 0.1],
        }
    )
    ranking = rank_out_of_sample(results, config)
    assert ranking.iloc[0]["strategy"] == "stable"


def test_current_engine_adapter_comparison_does_not_mutate_input() -> None:
    config = BacktestConfig(max_strategies=2, fee_bps=0, slippage_bps=0)
    data = long_synthetic_data().iloc[:500].copy()
    from research.backtest.feature_engineering import add_features

    featured = add_features(data)
    before = featured.copy(deep=True)
    compare = compare_current_engine(featured, build_strategy_factory(config), config, top_n=2)
    pd.testing.assert_frame_equal(featured, before)
    assert "current_vangscore_engine" in set(compare["strategy"])

