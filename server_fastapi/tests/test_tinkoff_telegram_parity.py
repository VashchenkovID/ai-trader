from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.main import app


@pytest.mark.asyncio
async def test_tinkoff_surface_endpoints(client) -> None:
    container = app.state.container
    old_client = container.tinkoff_client
    container.tinkoff_client = SimpleNamespace(
        get_accounts=lambda: {"accounts": [{"id": "A1"}]},
        get_user_info=lambda: {"qualifiedForWorkWith": ["shares"]},
        get_operations=lambda **_kwargs: {"operations": [{"id": "O1"}]},
        get_currencies=lambda: {"instruments": [{"ticker": "USD"}]},
        get_bonds=lambda: {"instruments": [{"ticker": "RU000A"}]},
        get_etfs=lambda: {"instruments": [{"ticker": "TMOS"}]},
        get_dividends=lambda _figi: {"dividends": []},
        find_instrument=lambda _q: {"instruments": [{"figi": "F1"}]},
        get_trading_status=lambda _figi: {"marketOrderAvailableFlag": True},
    )
    try:
        for method, path in [
            ("get", "/api/v1/tinkoff/accounts"),
            ("get", "/api/v1/tinkoff/user-info"),
            ("get", "/api/v1/tinkoff/operations"),
            ("get", "/api/v1/tinkoff/instruments/currencies"),
            ("get", "/api/v1/tinkoff/instruments/bonds"),
            ("get", "/api/v1/tinkoff/instruments/etfs"),
            ("get", "/api/v1/tinkoff/instruments/dividends/FIGI1"),
            ("get", "/api/v1/tinkoff/instruments/find?query=sber"),
            ("get", "/api/v1/tinkoff/trading-status/FIGI1"),
        ]:
            if method == "get":
                response = await client.get(path)
            else:
                response = await client.post(path)
            assert response.status_code == 200, path
            assert response.json()["success"] is True
    finally:
        container.tinkoff_client = old_client


@pytest.mark.asyncio
async def test_telegram_and_notifications_endpoints(client, monkeypatch: pytest.MonkeyPatch) -> None:
    container = app.state.container
    monkeypatch.setattr(
        container.telegram_service,
        "test_connection",
        lambda: {"ok": True, "result": {"message_id": 1}},
    )
    monkeypatch.setattr(
        container.telegram_service,
        "send_message",
        lambda *_args, **_kwargs: {"ok": True, "result": {"message_id": 2}},
    )
    monkeypatch.setattr(
        container.telegram_service,
        "send_alert",
        lambda *_args, **_kwargs: {"ok": True, "result": {"message_id": 3}},
    )

    status = await client.get("/api/v1/telegram/status")
    assert status.status_code == 200
    assert "enabled" in status.json()["data"]

    test_resp = await client.post("/api/v1/telegram/test")
    assert test_resp.status_code == 200
    assert test_resp.json()["data"]["ok"] is True

    send_resp = await client.post("/api/v1/telegram/send", json={"text": "hello"})
    assert send_resp.status_code == 200
    assert send_resp.json()["data"]["ok"] is True

    alert_resp = await client.post(
        "/api/v1/telegram/alerts/system",
        json={"title": "Critical", "message": "Disk full"},
    )
    assert alert_resp.status_code == 200
    assert alert_resp.json()["data"]["ok"] is True

    settings_set = await client.post(
        "/api/v1/notifications/settings",
        json={"enabled": True, "default_chat_id": "123"},
    )
    assert settings_set.status_code == 200
    assert settings_set.json()["data"]["enabled"] is True

    settings_get = await client.get("/api/v1/notifications/settings")
    assert settings_get.status_code == 200
    assert "enabled" in settings_get.json()["data"]
