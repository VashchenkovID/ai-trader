from __future__ import annotations

import json
import sys
import types
from types import SimpleNamespace
from pathlib import Path

import pytest

from app.services.llm_jury_service import run_jury_for_figi
from training.governance import (
    ReleaseMetrics,
    ReleasePolicy,
    append_release_decision,
    evaluate_release_gate,
)
from training.rl import train_agent


class _FakeSession:
    def __init__(self) -> None:
        self.added: list[object] = []
        self.committed = False

    def add(self, row: object) -> None:
        self.added.append(row)

    async def commit(self) -> None:
        self.committed = True


def test_rl_train_agent_saves_checkpoint(tmp_path) -> None:
    path = train_agent(total_steps=300, checkpoint_dir=str(tmp_path), seed=7)
    assert path is not None
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    assert "q_table" in data
    assert len(data["policy"]) == 3
    assert data["stats"]["action_distribution"]["BUY"] >= 0


def test_release_gate_approve_and_reject(tmp_path) -> None:
    policy = ReleasePolicy(
        min_trades=10,
        min_win_rate=0.5,
        min_profit_factor=1.1,
        min_sharpe=0.3,
        max_drawdown=0.25,
        min_consistency=0.5,
    )
    good = ReleaseMetrics(
        trades=20,
        win_rate=0.6,
        profit_factor=1.3,
        sharpe=0.8,
        max_drawdown=0.1,
        consistency=0.7,
    )
    bad = ReleaseMetrics(
        trades=3,
        win_rate=0.2,
        profit_factor=0.7,
        sharpe=-0.2,
        max_drawdown=0.6,
        consistency=0.2,
    )

    approved = evaluate_release_gate(good, policy, model_ref="m-good")
    rejected = evaluate_release_gate(bad, policy, model_ref="m-bad")
    assert approved["approved"] is True
    assert rejected["approved"] is False
    assert "trades" in rejected["failed_checks"]

    registry = tmp_path / "release_registry.jsonl"
    out = append_release_decision(registry, approved)
    assert out.endswith("release_registry.jsonl")
    lines = registry.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1


@pytest.mark.asyncio
async def test_run_jury_for_figi_saves_opinions_and_aggregate(monkeypatch: pytest.MonkeyPatch) -> None:
    class _Opinion:
        def __init__(self, model_id: str, action: str, confidence: float, raw_text: str) -> None:
            self.model_id = model_id
            self.action = action
            self.confidence = confidence
            self.raw_text = raw_text

    async def _fake_run_jury(*, ticker: str, context: str, providers: list, role: str):
        assert ticker == "SBER"
        assert providers
        assert "свечи" in context
        assert role
        return [
            _Opinion("p1", "BUY", 0.8, "good"),
            _Opinion("p2", "HOLD", 0.6, "neutral"),
        ]

    def _fake_aggregate(opinions: list[_Opinion]) -> tuple[float, float]:
        assert len(opinions) == 2
        return 0.7, 0.1

    fake_module = types.SimpleNamespace(
        run_jury=_fake_run_jury,
        aggregate_opinions=_fake_aggregate,
    )
    monkeypatch.setitem(sys.modules, "training.llm_jury.run", fake_module)

    session = _FakeSession()
    summary = await run_jury_for_figi(
        session,
        figi="FIGI1",
        ticker="SBER",
        context="Последние свечи: ...",
        providers=[object()],
    )

    assert summary["figi"] == "FIGI1"
    assert summary["opinions_count"] == 2
    assert summary["consensus"] == 0.7
    assert "providers" not in summary  # контракт: provider_payload
    assert summary["provider_payload"]["p1"]["action"] == "BUY"
    assert summary["provider_payload"]["p2"]["action"] == "HOLD"
    assert summary["required_providers_present"] is False
    assert session.committed is True
    # 2 мнения + 1 агрегат
    assert len(session.added) == 3


@pytest.mark.asyncio
async def test_training_release_gate_endpoint(client, monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    settings = SimpleNamespace(
        release_min_trades=10,
        release_min_win_rate=0.5,
        release_min_profit_factor=1.1,
        release_min_sharpe=0.3,
        release_max_drawdown=0.25,
        release_min_consistency=0.5,
        release_registry_path=str(tmp_path / "registry.jsonl"),
    )
    monkeypatch.setattr("app.api.v1.training.get_training_settings", lambda: settings)

    response = await client.post(
        "/api/v1/training/release-gate",
        json={
            "model_ref": "model-v1",
            "trades": 50,
            "win_rate": 0.65,
            "profit_factor": 1.5,
            "sharpe": 0.9,
            "max_drawdown": 0.12,
            "consistency": 0.75,
            "persist": True,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "approved"
    assert body["decision"]["approved"] is True
    assert body["registry_path"]


@pytest.mark.asyncio
async def test_training_run_rl_endpoint_completed_and_unavailable(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "app.api.v1.training._run_rl_sync",
        lambda total_steps, env_name, continue_from_latest=False: "models/rl/q.json",
    )
    ok_response = await client.post("/api/v1/training/run-rl", params={"total_steps": 500, "env_name": "paper"})
    assert ok_response.status_code == 200
    ok_body = ok_response.json()
    assert ok_body["status"] == "completed"
    assert ok_body["rl_checkpoint"].endswith(".json")

    monkeypatch.setattr(
        "app.api.v1.training._run_rl_sync",
        lambda total_steps, env_name, continue_from_latest=False: None,
    )
    bad_response = await client.post("/api/v1/training/run-rl", params={"total_steps": 500, "env_name": "paper"})
    assert bad_response.status_code == 200
    bad_body = bad_response.json()
    assert bad_body["status"] == "unavailable"
