"""Run Phase 3 robustness, regime analysis, report, and final scoring."""

from __future__ import annotations

import argparse
import ast
import json
import logging
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd

from .config import BacktestConfig
from .final_recommendation import build_final_recommendations, write_candidate_report
from .regime_analysis import run_regime_analysis
from .report import build_report
from .robustness import run_robustness_tests
from research.strategies.phase25_strategies import BalancedDcaStrategy, DrawdownLadderStrategy, PremiumAccumulationStrategy, TrendValuationStrategy
from research.strategies.dca_strategy import HybridPremiumTrendDcaStrategy
from research.strategies.base_strategy import BaseStrategy


STRATEGY_CLASSES = {
    "drawdown_ladder": DrawdownLadderStrategy,
    "premium_accumulation": PremiumAccumulationStrategy,
    "trend_valuation": TrendValuationStrategy,
    "balanced_dca": BalancedDcaStrategy,
    "hybrid_premium_spread_trend_dca": HybridPremiumTrendDcaStrategy,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Phase 3 on an existing Phase 2.5 output folder")
    parser.add_argument("--phase25-output", required=True)
    parser.add_argument("--output-root", default="research/backtest/outputs")
    parser.add_argument("--top-n", type=int, default=10)
    parser.add_argument("--monte-carlo-runs", type=int, default=500)
    parser.add_argument("--initial-capital", type=float, default=1_000_000_000.0)
    parser.add_argument("--fee-bps", type=float, default=5.0)
    parser.add_argument("--slippage-bps", type=float, default=3.0)
    parser.add_argument("--delay", type=int, default=1)
    parser.add_argument("--max-exposure", type=float, default=0.9)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source = Path(args.phase25_output)
    output_dir = Path(args.output_root) / f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_phase3"
    output_dir.mkdir(parents=True, exist_ok=True)
    _configure_logging(output_dir)
    config = BacktestConfig(
        initial_capital=args.initial_capital,
        fee_bps=args.fee_bps,
        slippage_bps=args.slippage_bps,
        execution_delay_days=args.delay,
        max_exposure=args.max_exposure,
        output_root=Path(args.output_root),
    )
    logging.info("Starting Phase 3 from %s", source)
    _copy_phase25_inputs(source, output_dir)
    df = pd.read_csv(source / "normalized_dataset.csv")
    df["date"] = pd.to_datetime(df["date"])
    candidates = load_top_candidates(source, args.top_n)
    robustness = run_robustness_tests(df, candidates, config, args.monte_carlo_runs)
    for name, frame in robustness.items():
        frame.to_csv(output_dir / f"{name}.csv", index=False)
    regime = run_regime_analysis(df, candidates, config)
    for name, frame in regime.items():
        frame.to_csv(output_dir / f"{name}.csv", index=False)
    balanced = pd.read_csv(source / "balanced_ranking.csv")
    final, report_payload = build_final_recommendations(balanced, robustness["robustness_summary"], regime["regime_summary"])
    final.to_csv(output_dir / "final_recommendations.csv", index=False)
    report_payload["source_phase25_output"] = str(source)
    report_payload["phase3_output"] = str(output_dir)
    write_candidate_report(str(output_dir / "final_candidate_report.json"), report_payload)
    build_report(output_dir)
    _write_json(output_dir / "config_used.json", {**config.to_dict(), "phase25_output": str(source), "monte_carlo_runs": args.monte_carlo_runs})
    print(final[["strategy", "final_score", "balanced_score", "robustness_score", "regime_stability_score", "parameter_stability_score", "cagr", "max_drawdown"]].head(5).to_string(index=False))
    print(f"\nOutput folder: {output_dir}")
    return 0


def load_top_candidates(source: Path, top_n: int) -> list[BaseStrategy]:
    recommended = pd.read_csv(source / "recommended_top_candidates.csv")
    factory = pd.read_csv(source / "strategy_factory_results.csv")
    selected = recommended.head(top_n)[["strategy"]].merge(factory, on="strategy", how="left")
    candidates: list[BaseStrategy] = []
    for _, row in selected.iterrows():
        base_name = str(row["base_name"])
        params = ast.literal_eval(str(row["params"])) if pd.notna(row["params"]) else {}
        cls = STRATEGY_CLASSES.get(base_name)
        if cls is None:
            continue
        candidates.append(cls(params))
    return candidates


def _copy_phase25_inputs(source: Path, output_dir: Path) -> None:
    for name in [
        "data_summary.json",
        "benchmark_clean_comparison.csv",
        "compare_current_engine.csv",
        "balanced_ranking.csv",
        "conservative_ranking.csv",
        "recommended_top_candidates.csv",
        "strategy_factory_results.csv",
        "trades.csv",
        "equity_curve.csv",
    ]:
        src = source / name
        if src.exists():
            shutil.copy2(src, output_dir / name)


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")


def _configure_logging(output_dir: Path) -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        handlers=[logging.FileHandler(output_dir / "logs.txt", encoding="utf-8"), logging.StreamHandler()],
    )


if __name__ == "__main__":
    raise SystemExit(main())

