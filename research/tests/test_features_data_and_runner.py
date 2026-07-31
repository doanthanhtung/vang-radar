from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from research.backtest.config import BacktestConfig
from research.backtest.data_adapter import BacktestDataAdapter
from research.backtest.feature_engineering import add_features, assert_no_lookahead
from research.backtest.benchmark import run_strategy
from research.strategies.dca_strategy import HybridPremiumTrendDcaStrategy


def synthetic_data(rows: int = 320) -> pd.DataFrame:
    dates = pd.date_range("2020-01-01", periods=rows, freq="D")
    base = 50_000_000 + np.linspace(0, 5_000_000, rows) + np.sin(np.arange(rows) / 7) * 500_000
    spread = 500_000 + np.sin(np.arange(rows) / 9) * 100_000
    premium = 0.08 + np.sin(np.arange(rows) / 23) * 0.04
    return pd.DataFrame(
        {
            "date": dates,
            "domestic_bid": base,
            "domestic_ask": base + spread,
            "domestic_mid": base + spread / 2,
            "world_gold_usd": 1800 + np.linspace(0, 200, rows),
            "usd_vnd": 24_000 + np.linspace(0, 500, rows),
            "premium_pct": premium,
            "spread_pct": spread / (base + spread),
        }
    )


def test_data_adapter_missing_optional_columns_and_inference() -> None:
    raw = synthetic_data(30).rename(columns={"domestic_bid": "buyPrice", "domestic_ask": "sellPrice"})
    raw = raw.drop(columns=["domestic_mid", "spread_pct"])
    adapter = BacktestDataAdapter(BacktestConfig())
    normalized = adapter.normalize(raw)
    assert {"domestic_bid", "domestic_ask", "domestic_mid", "spread_pct"}.issubset(normalized.columns)
    assert adapter.summary is not None
    assert "domestic_bid" in adapter.summary.inferred_columns


def test_rolling_features_do_not_change_when_future_removed() -> None:
    raw = synthetic_data(320)
    featured = add_features(raw)
    assert_no_lookahead(raw, featured, 260)


def test_hybrid_dca_respects_max_exposure() -> None:
    data = add_features(synthetic_data(320))
    config = BacktestConfig(initial_capital=1_000_000_000, fee_bps=0, slippage_bps=0, max_exposure=0.7)
    strategy = HybridPremiumTrendDcaStrategy(
        {
            "buy_threshold": 1.0,
            "max_spread_percentile": 1.0,
            "trend_col": "domestic_ma200",
            "initial_fraction": 0.4,
            "dca_fraction": 0.2,
            "dca_drop": 0.001,
            "max_exposure": 0.7,
        }
    )
    equity, _ = run_strategy(data, strategy, config)
    assert equity["exposure"].max() <= 0.7 + 1e-6


def test_runner_creates_non_empty_outputs(tmp_path: Path) -> None:
    input_path = tmp_path / "sample.csv"
    output_root = tmp_path / "outputs"
    synthetic_data(320).to_csv(input_path, index=False)
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "research.backtest.run_backtest",
            "--input",
            str(input_path),
            "--output-root",
            str(output_root),
            "--product-code",
            "SJC_BAR",
            "--delay",
            "1",
        ],
        cwd=Path(__file__).resolve().parents[2],
        capture_output=True,
        text=True,
        check=True,
    )
    folders = sorted(output_root.iterdir())
    assert folders, result.stdout + result.stderr
    latest = folders[-1]
    for name in ["summary_metrics.csv", "trades.csv", "equity_curve.csv", "config_used.json", "data_summary.json", "logs.txt"]:
        assert (latest / name).exists()
    assert not pd.read_csv(latest / "summary_metrics.csv").empty
    equity = pd.read_csv(latest / "equity_curve.csv")
    assert not equity.empty
    assert {"date", "cash", "position_qty", "market_value", "equity", "drawdown", "exposure", "strategy"}.issubset(equity.columns)
    trades = pd.read_csv(latest / "trades.csv")
    assert {"cash_before", "cash_after", "position_before", "position_after", "price", "fee", "slippage", "realized_pnl"}.issubset(trades.columns)
    normalized = pd.read_csv(latest / "normalized_dataset.csv")
    assert normalized["current_signal"].notna().all()
    assert normalized["current_score"].between(0, 100).all()
    assert normalized["current_engine_version"].nunique() == 1
