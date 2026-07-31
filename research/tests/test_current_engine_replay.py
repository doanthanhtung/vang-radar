from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import pytest

from research.backtest.current_engine_replay import (
    replay_current_engine,
    resolve_product_code,
)


def replay_data() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "date": pd.to_datetime(["2025-01-01", "2025-01-05", "2025-01-10"]),
            "domestic_bid": [82_000_000, 83_000_000, 84_000_000],
            "domestic_ask": [84_000_000, 85_000_000, 86_000_000],
            "world_gold_usd": [2_000, 2_050, 2_100],
            "usd_vnd": [25_000, 25_000, 25_000],
        }
    )


def test_resolve_product_code_prefers_explicit_value() -> None:
    data = replay_data().assign(product_type="DOJI_RING_9999")
    assert resolve_product_code(data, "SJC_BAR") == "SJC_BAR"


def test_resolve_product_code_uses_single_dataset_product() -> None:
    data = replay_data().assign(product_type="SJC_BAR")
    assert resolve_product_code(data, None) == "SJC_BAR"


@pytest.mark.parametrize(
    "product_values",
    [None, ["SJC_BAR", "DOJI_RING_9999", "SJC_BAR"]],
)
def test_resolve_product_code_rejects_missing_or_mixed_product(
    product_values: list[str] | None,
) -> None:
    data = replay_data()
    if product_values is not None:
        data["product_type"] = product_values
    with pytest.raises(ValueError, match="product code"):
        resolve_product_code(data, None)


def test_replay_requires_all_production_market_inputs() -> None:
    with pytest.raises(ValueError, match="world_gold_usd"):
        replay_current_engine(
            replay_data().drop(columns=["world_gold_usd"]),
            "SJC_BAR",
        )


def test_replay_enriches_rows_through_one_real_typescript_batch(tmp_path: Path) -> None:
    enriched = replay_current_engine(
        replay_data(),
        "SJC_BAR",
        workspace_root=Path(__file__).resolve().parents[2],
        temporary_root=tmp_path,
    )

    assert len(enriched) == 3
    assert {
        "current_signal",
        "current_score",
        "current_confidence",
        "current_engine_version",
        "current_engine_input",
        "current_engine_reasons",
    }.issubset(enriched.columns)
    assert enriched["current_signal"].notna().all()
    assert enriched["current_score"].between(0, 100).all()
    assert enriched["current_engine_version"].nunique() == 1
    assert json.loads(enriched.loc[0, "current_engine_input"])["premiumSampleSize180d"] == 0
    assert json.loads(enriched.loc[1, "current_engine_input"])["premiumSampleSize180d"] == 1
