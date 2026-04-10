from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.errors import AppError
from app.services import manual_llm_batch_service as msvc
from training.llm_jury.run import build_by_figi_from_manual_dual_raw


def _batch_json(figi_actions: list[tuple[str, str, float]]) -> str:
    items = [
        {"figi": f, "action": a, "confidence": c}
        for f, a, c in figi_actions
    ]
    import json

    return json.dumps({"instruments": items})


def test_build_by_figi_from_manual_dual_raw_success() -> None:
    figis = ["BBG000A", "BBG000B"]
    g = _batch_json([("BBG000A", "BUY", 0.8), ("BBG000B", "HOLD", 0.5)])
    a = _batch_json([("BBG000A", "SELL", 0.7), ("BBG000B", "BUY", 0.9)])
    out = build_by_figi_from_manual_dual_raw(figis, g, a)
    assert set(out["byFigi"].keys()) == set(figis)
    raw_ops = out["rawOpinions"]
    assert len(raw_ops) == 2
    assert raw_ops[0].model_id == "giga_chat"
    assert raw_ops[1].model_id == "alisa_gpt"
    assert raw_ops[0].raw_text == g
    f1 = out["byFigi"]["BBG000A"]
    assert f1["required_providers_present"] is True
    assert "gigachat" in f1["provider_payload"]
    assert "alisa_gpt" in f1["provider_payload"]


def test_build_by_figi_from_manual_dual_raw_missing_figi_falls_back_hold() -> None:
    figis = ["ONLY1"]
    g = _batch_json([("OTHER", "BUY", 1.0)])
    a = _batch_json([("OTHER", "SELL", 1.0)])
    out = build_by_figi_from_manual_dual_raw(figis, g, a)
    row = out["byFigi"]["ONLY1"]
    # Нет совпадения FIGI в JSON → parse_batch_verdict оставляет HOLD 0.5 для ONLY1
    assert row["consensus"] == 0.5
    assert row["dispersion"] == 0.0


@pytest.mark.asyncio
async def test_apply_manual_llm_chunk_rejects_figi_mismatch(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_chunk_items(*_a, **_k):
        return (
            [
                {"figi": "A", "ticker": "A", "context": "c"},
                {"figi": "B", "ticker": "B", "context": "c"},
            ],
            1,
        )

    monkeypatch.setattr(msvc, "_build_chunk_items", fake_chunk_items)

    session = MagicMock()
    session.commit = AsyncMock()
    container = MagicMock()
    repo = MagicMock()

    with pytest.raises(AppError) as ei:
        await msvc.apply_manual_llm_chunk(
            session,
            container,
            repo,
            chunk_index=0,
            batch_size=2,
            figis=["B", "A"],
            gigachat_raw="{}",
            alisa_raw="{}",
        )
    assert ei.value.error_code == "BAD_REQUEST"


@pytest.mark.asyncio
async def test_apply_manual_llm_chunk_persists_and_upserts(monkeypatch: pytest.MonkeyPatch) -> None:
    figis = ["X1", "X2"]
    g = _batch_json([(f, "BUY", 0.8) for f in figis])
    a = _batch_json([(f, "BUY", 0.8) for f in figis])

    monkeypatch.setattr(msvc, "_load_app_settings_map", AsyncMock(return_value={}))

    async def fake_chunk_items(*_a, **_k):
        return (
            [{"figi": f, "ticker": f, "context": "ctx"} for f in figis],
            1,
        )

    monkeypatch.setattr(msvc, "_build_chunk_items", fake_chunk_items)

    async def fake_nn(figi: str, _ckpt: str):
        return {
            "ok": True,
            "score": 0.55,
            "confidence": 0.6,
            "checkpoint": "mock.ckpt",
            "payload": {"marketRegime": "normal", "featureCount": 1},
        }

    monkeypatch.setattr("app.scheduler._run_nn_inference_for_figi", fake_nn)
    monkeypatch.setattr("app.scheduler._latest_checkpoint_path", lambda _d: "mock.ckpt")

    persisted: dict[str, object] = {}

    async def capture_persist(session, *, figis, providers, raw_opinions):
        persisted["figis"] = list(figis)
        persisted["n_providers"] = len(providers)
        persisted["n_ops"] = len(raw_opinions)

    monkeypatch.setattr(msvc, "persist_llm_jury_batch_chunk", capture_persist)

    upserts: list[tuple[str, str]] = []

    class Repo:
        async def upsert_recommendation(self, session, **kwargs):
            upserts.append((kwargs["figi"], kwargs["recommendation"]))

    session = MagicMock()
    session.commit = AsyncMock()
    container = MagicMock()
    container.market_service.compute_and_store_weekly_forecast = AsyncMock()

    await msvc.apply_manual_llm_chunk(
        session,
        container,
        Repo(),
        chunk_index=0,
        batch_size=2,
        figis=list(figis),
        gigachat_raw=g,
        alisa_raw=a,
    )

    assert persisted.get("figis") == figis
    assert persisted.get("n_providers") == 2
    assert persisted.get("n_ops") == 2
    assert len(upserts) == 2
    assert all(f in figis for f, _ in upserts)
    session.commit.assert_awaited()
