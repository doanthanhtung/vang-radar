"""Final Phase 3 scoring and recommendation logic."""

from __future__ import annotations

import json
from typing import Any

import pandas as pd


def build_final_recommendations(
    balanced: pd.DataFrame,
    robustness_summary: pd.DataFrame,
    regime_summary: pd.DataFrame,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    frame = balanced.merge(robustness_summary, on="strategy", how="left").merge(regime_summary, on="strategy", how="left")
    for col, default in [
        ("robustness_score", 0.0),
        ("regime_stability_score", 0.0),
        ("parameter_stability_score", 0.0),
        ("conservative_score", 0.0),
        ("balanced_score", 0.0),
    ]:
        frame[col] = pd.to_numeric(frame.get(col, default), errors="coerce").fillna(default)
    frame["final_score_raw"] = (
        0.35 * frame["balanced_score"]
        + 0.25 * frame["robustness_score"]
        + 0.20 * frame["regime_stability_score"]
        + 0.15 * frame["parameter_stability_score"]
        + 0.05 * frame["conservative_score"]
    )
    penalties = {
        "overfit_flag": 0.20,
        "low_trade_count_flag": 0.12,
        "low_return_vs_benchmark_flag": 0.15,
        "parameter_overfit_flag": 0.15,
        "robustness_failure_flag": 0.20,
        "regime_concentration_flag": 0.10,
    }
    frame["penalty_total"] = 0.0
    for flag, penalty in penalties.items():
        if flag in frame.columns:
            frame["penalty_total"] += frame[flag].fillna(False).astype(bool).astype(float) * penalty
    frame["final_score"] = frame["final_score_raw"] - frame["penalty_total"]
    final = frame.sort_values("final_score", ascending=False)
    report = {
        "top_candidates": final.head(3).to_dict(orient="records"),
        "selection_notes": [
            "No production promotion was performed.",
            "Final score combines balanced ranking, robustness, regime stability, and parameter stability.",
            "Candidates with robustness or regime concentration flags require manual review before production use.",
        ],
    }
    return final, report


def write_candidate_report(path: str, payload: dict[str, Any]) -> None:
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, default=str)

