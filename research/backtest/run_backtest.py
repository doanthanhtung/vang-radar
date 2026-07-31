"""Command-line runner for Phase 1 VangScore research backtests."""

from __future__ import annotations

import argparse
import json
import logging
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd

from .benchmark import run_strategy
from .compare_engines import benchmark_clean_comparison, compare_current_engine, clean_benchmark_runners
from .config import BacktestConfig
from .current_engine_replay import replay_current_engine, resolve_product_code
from .data_adapter import BacktestDataAdapter
from .feature_engineering import add_features
from .metrics import compute_metrics
from .phase25_analysis import build_phase25_rankings
from .scoring import score_metrics
from .strategy_factory import build_strategy_factory, strategy_display_name, strategy_factory_frame
from .walk_forward import run_walk_forward


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run isolated VangScore Phase 1 backtest")
    parser.add_argument("--input", help="CSV/XLSX fallback input path")
    parser.add_argument("--product-code", help="Product code for DB load, e.g. SJC_BAR")
    parser.add_argument("--output-root", default="research/backtest/outputs")
    parser.add_argument("--initial-capital", type=float, default=1_000_000_000.0)
    parser.add_argument("--fee-bps", type=float, default=5.0)
    parser.add_argument("--slippage-bps", type=float, default=3.0)
    parser.add_argument("--delay", type=int, default=1)
    parser.add_argument("--max-exposure", type=float, default=1.0)
    parser.add_argument("--max-strategies", type=int, default=300)
    parser.add_argument(
        "--skip-current-engine-replay",
        action="store_true",
        help="Use stored current_signal/current_score columns instead of replaying the production engine",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    config = BacktestConfig(
        initial_capital=args.initial_capital,
        fee_bps=args.fee_bps,
        slippage_bps=args.slippage_bps,
        execution_delay_days=args.delay,
        max_exposure=args.max_exposure,
        max_strategies=args.max_strategies,
        output_root=Path(args.output_root),
    )
    output_dir = config.output_root / datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir.mkdir(parents=True, exist_ok=True)
    _configure_logging(output_dir)
    logging.info("Starting Phase 2.5 backtest")

    adapter = BacktestDataAdapter(config)
    raw = adapter.load(input_path=args.input, product_code=args.product_code)
    if not args.skip_current_engine_replay:
        product_code = resolve_product_code(raw, args.product_code)
        logging.info("Replaying production VangScore history for %s", product_code)
        raw = replay_current_engine(raw, product_code)
    data = add_features(raw)
    adapter.export_normalized(data, output_dir / "normalized_dataset.csv")
    _write_json(output_dir / "config_used.json", {**config.to_dict(), "git_commit": _git_commit()})
    _write_json(output_dir / "data_summary.json", adapter.summary.__dict__ if adapter.summary else {})

    all_metrics: list[dict[str, Any]] = []
    all_trades: list[pd.DataFrame] = []
    all_equity: list[pd.DataFrame] = []

    for name, runner in clean_benchmark_runners(data, config).items():
        equity, trades = runner()
        _collect_result(name, "benchmark", equity, trades, config, all_metrics, all_trades, all_equity)

    strategies = build_strategy_factory(config)
    strategy_factory_frame(strategies).to_csv(output_dir / "strategy_factory_results.csv", index=False)
    for strategy in strategies:
        name = strategy_display_name(strategy)
        equity, trades = run_strategy(data, strategy, config)
        _collect_result(name, strategy.description, equity, trades, config, all_metrics, all_trades, all_equity, strategy.params)

    summary = pd.DataFrame(all_metrics)
    summary["score"] = score_metrics(summary, config)
    summary = summary.sort_values("score", ascending=False)
    trades_out = pd.concat(all_trades, ignore_index=True) if all_trades else pd.DataFrame()
    equity_out = pd.concat(all_equity, ignore_index=True) if all_equity else pd.DataFrame()
    walk_forward_results, oos_ranking = run_walk_forward(data, strategies, config)
    benchmark_clean = benchmark_clean_comparison(data, config)
    compare_current = compare_current_engine(data, strategies, config)
    activity_flags, hurdle_results, balanced_ranking, conservative_ranking, recommended = build_phase25_rankings(
        oos_ranking,
        walk_forward_results,
        summary,
        benchmark_clean,
        config,
    )
    if not balanced_ranking.empty:
        top_payload = balanced_ranking.head(10).to_dict(orient="records")
    else:
        top_payload = summary.head(10).to_dict(orient="records")
    summary.to_csv(output_dir / "summary_metrics.csv", index=False)
    trades_out.to_csv(output_dir / "trades.csv", index=False)
    equity_out.to_csv(output_dir / "equity_curve.csv", index=False)
    walk_forward_results.to_csv(output_dir / "walk_forward_results.csv", index=False)
    oos_ranking.to_csv(output_dir / "out_of_sample_ranking.csv", index=False)
    benchmark_clean.to_csv(output_dir / "benchmark_clean_comparison.csv", index=False)
    compare_current.to_csv(output_dir / "compare_current_engine.csv", index=False)
    activity_flags.to_csv(output_dir / "activity_flags.csv", index=False)
    hurdle_results.to_csv(output_dir / "hurdle_results.csv", index=False)
    balanced_ranking.to_csv(output_dir / "balanced_ranking.csv", index=False)
    conservative_ranking.to_csv(output_dir / "conservative_ranking.csv", index=False)
    recommended.to_csv(output_dir / "recommended_top_candidates.csv", index=False)
    _write_json(output_dir / "top_strategies.json", top_payload)
    _write_phase3_placeholder_outputs(output_dir)
    printable = balanced_ranking.head(10) if not balanced_ranking.empty else summary.head(10)
    columns = [col for col in ["strategy", "balanced_score", "conservative_score", "out_of_sample_score", "cagr", "sortino_ratio", "calmar_ratio", "max_drawdown", "number_of_trades", "low_trade_count_flag", "low_return_vs_benchmark_flag", "overfit_flag"] if col in printable.columns]
    print(printable[columns].to_string(index=False))
    print(f"\nOutput folder: {output_dir}")
    return 0


def _collect_result(
    name: str,
    description: str,
    equity: pd.DataFrame,
    trades: pd.DataFrame,
    config: BacktestConfig,
    all_metrics: list[dict[str, Any]],
    all_trades: list[pd.DataFrame],
    all_equity: list[pd.DataFrame],
    params: dict[str, Any] | None = None,
) -> None:
    metrics = compute_metrics(equity, trades, config.initial_capital, config.annualization_days)
    metrics.update({"strategy": name, "description": description, "params": json.dumps(params or {}, sort_keys=True)})
    all_metrics.append(metrics)
    if not trades.empty:
        trades = trades.copy()
        trades["strategy"] = name
        all_trades.append(trades)
    equity = equity.copy()
    equity["strategy"] = name
    all_equity.append(equity)


def _write_phase3_placeholder_outputs(output_dir: Path) -> None:
    for name in ["robustness_results.csv", "regime_results.csv"]:
        pd.DataFrame({"status": ["not_implemented_in_phase_1"]}).to_csv(output_dir / name, index=False)
    (output_dir / "report.html").write_text("<html><body><h1>VangScore Phase 2.5 Backtest</h1><p>Detailed report is Phase 3.</p></body></html>", encoding="utf-8")


def _write_json(path: Path, payload: dict[str, Any] | list[Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")


def _git_commit() -> str | None:
    try:
        result = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True)
        return result.stdout.strip()
    except Exception:
        return None


def _configure_logging(output_dir: Path) -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        handlers=[
            logging.FileHandler(output_dir / "logs.txt", encoding="utf-8"),
            logging.StreamHandler(),
        ],
    )


if __name__ == "__main__":
    raise SystemExit(main())
