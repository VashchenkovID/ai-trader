from __future__ import annotations

from datetime import datetime, timezone

import httpx

from app.services.tinkoff_client import TinkoffApiClient


def test_tinkoff_surface_methods_call_expected_paths(monkeypatch) -> None:
    client = TinkoffApiClient("https://api.test", "token", "acc")
    calls: list[tuple[str, dict]] = []

    def _fake_request(path: str, body: dict):
        calls.append((path, body))
        return {"path": path, "body": body}

    monkeypatch.setattr(client, "_request", _fake_request)

    assert client.get_candles("FIGI1", "2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z")["path"].endswith("GetCandles")
    assert client.get_operations(from_ts="a", to_ts="b")["path"].endswith("GetOperations")
    assert client.get_accounts()["path"].endswith("GetAccounts")
    assert client.get_user_info()["path"].endswith("GetInfo")
    assert client.get_currencies()["path"].endswith("Currencies")
    assert client.get_bonds()["path"].endswith("Bonds")
    assert client.get_etfs()["path"].endswith("Etfs")
    assert client.get_dividends("FIGI1")["path"].endswith("GetDividends")
    assert client.find_instrument("sber")["path"].endswith("FindInstrument")
    assert client.get_trading_schedules("MOEX", "a", "b")["path"].endswith("TradingSchedules")
    assert client.get_trading_status("FIGI1")["path"].endswith("GetTradingStatus")
    assert client.get_options_by(basic_instrument_id="FIGI1")["path"].endswith("OptionsBy")
    assert client.get_asset_fundamentals(["uid1"])["path"].endswith("GetAssetFundamentals")
    assert client.get_assets()["path"].endswith("GetAssets")
    assert client.get_analyst_signals() == {"signals": []}
    assert any(path.endswith("SignalService/GetSignals") for path, _ in calls)

    # Минимальная sanity-проверка на количество вызовов обертки.
    assert len(calls) >= 15


def test_tinkoff_get_positions_without_account_returns_empty() -> None:
    client = TinkoffApiClient("https://api.test", "token", "")
    out = client.get_positions()
    assert out == {"positions": [], "money": [], "blocked": []}


def test_tinkoff_get_portfolio_handles_request_exception(monkeypatch) -> None:
    client = TinkoffApiClient("https://api.test", "token", "acc")
    monkeypatch.setattr(client, "_request", lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("boom")))
    out = client.get_portfolio()
    assert out["totalAmountPortfolio"]["value"] == 0
    assert out["positions"] == []


def test_get_analyst_signals_falls_back_to_legacy_on_404(monkeypatch) -> None:
    client = TinkoffApiClient("https://api.test", "token", "acc")
    calls: list[tuple[str, dict]] = []

    def _fake_request(path: str, body: dict):
        calls.append((path, body))
        if path.endswith("SignalService/GetSignals"):
            req = httpx.Request("POST", "https://api.test")
            resp = httpx.Response(404, request=req, text="nf")
            raise httpx.HTTPStatusError("not found", request=req, response=resp)
        if path.endswith("AnalyticsService/GetAnalystRecommendations"):
            return {"recommendations": [{"id": 1}]}
        return {}

    monkeypatch.setattr(client, "_request", _fake_request)
    out = client.get_analyst_signals()
    assert out == {"signals": [{"id": 1}]}
    assert calls[0][0].endswith("SignalService/GetSignals")
    assert calls[0][1] == {"limit": 100}
    assert calls[1][0].endswith("AnalyticsService/GetAnalystRecommendations")


def test_get_candles_serializes_datetime_and_uses_instrument_id(monkeypatch) -> None:
    client = TinkoffApiClient("https://api.test", "token", "acc")
    calls: list[tuple[str, dict]] = []

    def _fake_request(path: str, body: dict):
        calls.append((path, body))
        return {"ok": True}

    monkeypatch.setattr(client, "_request", _fake_request)
    client.get_candles(
        "FIGI1",
        datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
        datetime(2026, 1, 2, 0, 0, tzinfo=timezone.utc),
        "CANDLE_INTERVAL_DAY",
    )
    assert calls
    first_body = calls[0][1]
    assert first_body["instrumentId"] == "FIGI1"
    assert first_body["from"] == "2026-01-01T00:00:00Z"
    assert first_body["to"] == "2026-01-02T00:00:00Z"


def test_get_candles_fallbacks_to_figi_on_400(monkeypatch) -> None:
    client = TinkoffApiClient("https://api.test", "token", "acc")
    calls: list[tuple[str, dict]] = []

    def _fake_request(path: str, body: dict):
        calls.append((path, body))
        if len(calls) == 1:
            req = httpx.Request("POST", "https://api.test")
            resp = httpx.Response(400, request=req, text="bad request")
            raise httpx.HTTPStatusError("bad request", request=req, response=resp)
        return {"candles": []}

    monkeypatch.setattr(client, "_request", _fake_request)
    out = client.get_candles("FIGI1", "2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z")
    assert out == {"candles": []}
    assert calls[0][1].get("instrumentId") == "FIGI1"
    assert calls[1][1].get("figi") == "FIGI1"
