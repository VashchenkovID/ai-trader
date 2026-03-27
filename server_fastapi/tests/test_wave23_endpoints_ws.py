from __future__ import annotations

from fastapi.testclient import TestClient
import pytest

from app.main import app


@pytest.mark.asyncio
async def test_wave2_trigger_endpoints_return_task_contract(client) -> None:
    endpoints = [
        "/api/v1/system/cache/update",
        "/api/v1/system/cache/full-update",
        "/api/v1/system/data/full-sync-year",
        "/api/v1/system/training/quick",
        "/api/v1/system/training/full",
        "/api/v1/market/refresh",
        "/api/v1/portfolio/real/sync",
        "/api/v1/portfolio/sync",
        "/api/v1/assets/sync",
        "/api/v1/fundamental-data/sync-and-fill",
        "/api/v1/fundamental-data/fill-all",
        "/api/v1/macro-data/update",
        "/api/v1/macro-data/load-indices",
        "/api/v1/signals/update",
        "/api/v1/options-data/update-all",
        "/api/v1/trading-windows/update",
        "/api/v1/system/price-loops/portfolio",
        "/api/v1/system/price-loops/signals",
        "/api/v1/system/price-loops/trading-requests",
        "/api/v1/system/governance/weekly-backtest",
        "/api/v1/system/governance/dynamic-budget",
        "/api/v1/system/governance/rebalancing",
        "/api/v1/system/risk/position-monitoring",
        "/api/v1/system/risk/partial-exit",
        "/api/v1/system/risk/trailing-stops",
    ]
    for endpoint in endpoints:
        response = await client.post(endpoint)
        assert response.status_code == 200, endpoint
        body = response.json()
        assert body["success"] is True
        data = body["data"]
        assert data["status"] == "scheduled"
        assert isinstance(data["taskId"], str)
        assert isinstance(data["taskType"], str)
        assert isinstance(data["queuedAt"], str)


@pytest.mark.asyncio
async def test_wave2_task_status_endpoints(client) -> None:
    scheduled = await client.post("/api/v1/system/cache/update")
    task_id = scheduled.json()["data"]["taskId"]

    task_get = await client.get(f"/api/v1/system/tasks/{task_id}")
    assert task_get.status_code == 200
    task_payload = task_get.json()["data"]
    assert task_payload["taskId"] == task_id
    assert "timing" in task_payload
    assert "errorCode" in task_payload

    tasks_list = await client.get("/api/v1/system/tasks", params={"limit": 10})
    assert tasks_list.status_code == 200
    assert isinstance(tasks_list.json()["data"]["items"], list)

    scheduler_status = await client.get("/api/v1/system/scheduler/status")
    assert scheduler_status.status_code == 200
    assert "jobs" in scheduler_status.json()["data"]
    assert "coreTrainingAnalysisJobs" in scheduler_status.json()["data"]

    missing_task_get = await client.get("/api/v1/system/tasks/unknown-task-id")
    assert missing_task_get.status_code == 200
    missing_payload = missing_task_get.json()["data"]
    assert missing_payload["status"] == "not_found"
    assert missing_payload["errorCode"] == "TASK_NOT_FOUND"

    portfolio_sync_status = await client.get("/api/v1/portfolio/sync/status")
    assert portfolio_sync_status.status_code == 200
    assert "lastTask" in portfolio_sync_status.json()["data"]

    trading_windows_status = await client.get("/api/v1/trading-windows/status")
    assert trading_windows_status.status_code == 200
    assert "lastTask" in trading_windows_status.json()["data"]


def test_websocket_system_status_stream() -> None:
    import app.bootstrap as bootstrap

    bootstrap._bootstrap_done = True
    with TestClient(app) as sync_client:
        with sync_client.websocket_connect("/api/v1/ws/system-status") as ws:
            first = ws.receive_json()
            assert first["event"] in {"system.snapshot", "system.heartbeat"}
            assert "payload" in first
            # Дальше обычно приходит heartbeat или task/scheduler update.
            second = ws.receive_json()
            assert "event" in second
            assert "timestamp" in second
