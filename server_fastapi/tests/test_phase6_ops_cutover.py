from __future__ import annotations

from pathlib import Path

import pytest

from app.main import app
from app.services.ops_service import OpsService


@pytest.mark.asyncio
async def test_ops_status_mode_canary_and_rollback(client) -> None:
    # Начинаем из normal для детерминизма.
    app.state.container.ops_service.set_mode("normal")

    status = await client.get("/api/v1/system/ops/status")
    assert status.status_code == 200
    assert status.json()["data"]["mode"] == "normal"

    canary = await client.post("/api/v1/system/ops/canary", json={"percent": 100})
    assert canary.status_code == 200
    assert canary.json()["data"]["mode"] == "canary"
    assert canary.json()["data"]["canaryPercent"] == 100

    rollback = await client.post("/api/v1/system/ops/rollback")
    assert rollback.status_code == 200
    assert rollback.json()["data"]["mode"] == "rollback"

    back = await client.post("/api/v1/system/ops/mode", json={"mode": "normal"})
    assert back.status_code == 200
    assert back.json()["data"]["mode"] == "normal"


@pytest.mark.asyncio
async def test_shadow_mode_blocks_write_requests(client) -> None:
    app.state.container.ops_service.set_mode("shadow")
    try:
        blocked = await client.post("/api/v1/recommendation-pipeline/run")
        assert blocked.status_code == 503
        body = blocked.json()
        assert body["success"] is False
        assert body["error"]["code"] == "SERVICE_UNAVAILABLE"
        assert blocked.headers.get("X-Ops-Mode") == "shadow"
    finally:
        app.state.container.ops_service.set_mode("normal")


@pytest.mark.asyncio
async def test_canary_mode_100_percent_allows_write_requests(client) -> None:
    app.state.container.ops_service.set_canary_percent(100)
    try:
        allowed = await client.post("/api/v1/recommendation-pipeline/run")
        assert allowed.status_code == 200
        assert allowed.headers.get("X-Ops-Mode") == "canary"
    finally:
        app.state.container.ops_service.set_mode("normal")


@pytest.mark.asyncio
async def test_ops_backup_snapshot_endpoint(client) -> None:
    response = await client.post("/api/v1/system/ops/backup")
    assert response.status_code == 200
    payload = response.json()["data"]
    assert "backupPath" in payload
    assert "snapshot" in payload
    assert "counts" in payload["snapshot"]
    assert Path(payload["backupPath"]).exists()


def test_ops_service_canary_selection_and_backup(tmp_path) -> None:
    svc = OpsService(
        backup_rollup_path=str(tmp_path / "cutover_backups.jsonl"),
        backup_keep_raw=1,
    )
    svc.set_canary_percent(30)
    d1 = svc.evaluate_request(request_id="req-1", method="POST", path="/api/v1/trading-requests/create")
    d2 = svc.evaluate_request(request_id="req-1", method="POST", path="/api/v1/trading-requests/create")
    # Для одного request_id решение должно быть стабильным.
    assert d1["canarySelected"] == d2["canarySelected"]

    backup = svc.create_backup_snapshot(str(tmp_path), {"counts": {"x": 1}})
    assert Path(backup).exists()
    backup2 = svc.create_backup_snapshot(str(tmp_path), {"counts": {"x": 2}})
    assert Path(backup2).exists()
    raw = list(Path(tmp_path).glob("cutover_snapshot_*.json"))
    assert len(raw) == 1
    rollup = tmp_path / "cutover_backups.jsonl"
    assert rollup.exists()
    assert len(rollup.read_text(encoding="utf-8").splitlines()) >= 2
