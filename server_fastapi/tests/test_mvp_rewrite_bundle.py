from __future__ import annotations

import json
from pathlib import Path
import pytest

from app.services.quant_artifact_service import load_returns_matrix_artifact
from app.services.execution_simulator import friction_bps, simulate_fill_notional
from training.data.llm_numeric import extract_llm_scores_from_jury_payload
from training.features.basic_ta import bollinger_width, simple_rsi


def test_load_returns_matrix_artifact_missing(tmp_path: Path) -> None:
    out = load_returns_matrix_artifact(tmp_path / "nope.json")
    assert out["ok"] is False
    assert out["error"] == "file_missing"


def test_load_returns_matrix_artifact_ok(tmp_path: Path) -> None:
    p = tmp_path / "returns_matrix_latest.json"
    p.write_text(
        json.dumps(
            {
                "lastRunAt": "2026-01-01T00:00:00Z",
                "figis": ["A", "B"],
                "shape": [10, 2],
                "matrix": {"index": ["d1"], "columns": ["A", "B"], "data": [[0.01, -0.02]]},
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    out = load_returns_matrix_artifact(p)
    assert out["ok"] is True
    assert out["summary"]["figiCount"] == 2
    assert out["summary"]["hasMatrix"] is True


def test_extract_llm_scores_fusion_llm_block() -> None:
    payload = {
        "llm": {"consensus": 0.7, "dispersion": 0.1, "confidenceAvg": 0.8},
        "mode": "nn_llm",
    }
    scores = extract_llm_scores_from_jury_payload(payload)
    assert scores["llm_consensus"] == pytest.approx(0.7)
    assert scores["llm_dispersion"] == pytest.approx(0.1)


def test_execution_simulator_friction() -> None:
    s = simulate_fill_notional(notional_rub=50_000.0)
    assert s["effectiveNotionalRub"] < s["notionalRub"]
    assert friction_bps() > 0


def test_basic_ta_rsi_shape() -> None:
    import pandas as pd

    close = pd.Series([100.0, 101.0, 99.0, 102.0, 101.0] * 5)
    rsi = simple_rsi(close, period=5)
    assert len(rsi) == len(close)
    assert rsi.iloc[-1] == rsi.iloc[-1]  # finite


def test_basic_ta_bollinger() -> None:
    import pandas as pd

    close = pd.Series(range(1, 50), dtype=float)
    w = bollinger_width(close, window=10)
    assert w.notna().sum() > 0


@pytest.mark.asyncio
async def test_get_execution_simulator_sample() -> None:
    from app.api.v1.reports import get_execution_simulator_sample

    r = await get_execution_simulator_sample()
    assert r.data["executionSimulator"] == "final_v2"
    assert "preview" in r.data
    assert "detailed" in r.data
