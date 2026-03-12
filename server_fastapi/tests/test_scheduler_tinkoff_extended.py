from __future__ import annotations

import ast
import asyncio
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock

import httpx
import pytest

import app.scheduler as scheduler
from app.services.tinkoff_client import TinkoffApiClient, TinkoffApiError


class _SessionCtx:
    def __init__(self, session) -> None:
        self._session = session

    async def __aenter__(self):
        return self._session

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _FakeSession:
    def __init__(self, row=None) -> None:
        self.row = row
        self.added = None
        self.committed = False

    async def scalar(self, _stmt):
        return self.row

    def add(self, row):
        self.added = row

    async def commit(self):
        self.committed = True


@pytest.mark.asyncio
async def test_run_job_with_state_emits_training_and_analysis_events() -> None:
    q = scheduler.subscribe_status_stream()
    try:
        await scheduler._run_job_with_state("training_full", lambda: asyncio.sleep(0, result={"ok": 1}))
        await scheduler._run_job_with_state("analysis_market_portfolio", lambda: asyncio.sleep(0, result={"ok": 1}))
        events = []
        while not q.empty():
            events.append((await q.get())["event"])
        assert "training.status" in events
        assert "analysis.status" in events
    finally:
        scheduler.unsubscribe_status_stream(q)


@pytest.mark.asyncio
async def test_run_job_with_state_failure_sets_failed() -> None:
    async def _boom():
        raise RuntimeError("boom")

    with pytest.raises(RuntimeError):
        await scheduler._run_job_with_state("cache_update", _boom)
    state = scheduler._job_states["cache_update"]
    assert state.status == "failed"
    assert "boom" in (state.last_error or "")


@pytest.mark.asyncio
async def test_publish_drops_full_queue() -> None:
    q = asyncio.Queue(maxsize=1)
    q.put_nowait({"full": True})
    scheduler._ws_subscribers.add(q)
    await scheduler._publish("task.update", {"a": 1})
    assert q not in scheduler._ws_subscribers


def test_trigger_named_job_unsupported() -> None:
    with pytest.raises(ValueError):
        scheduler.trigger_named_job("does-not-exist")


@pytest.mark.asyncio
async def test_cache_jobs_require_container(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(scheduler, "_container", None)
    with pytest.raises(RuntimeError):
        await scheduler._cache_update_job()
    with pytest.raises(RuntimeError):
        await scheduler._cache_full_update_job()


@pytest.mark.asyncio
async def test_appsetting_jobs_create_and_update(monkeypatch: pytest.MonkeyPatch) -> None:
    scheduler._container = SimpleNamespace(
        tinkoff_client=SimpleNamespace(
            get_assets=lambda: {"assets": [{"uid": "A1"}, {}, None]},
            get_asset_fundamentals=lambda _ids: {"fundamentals": [{"assetUid": "A1"}, "bad"]},
        )
    )
    create_session = _FakeSession(row=None)
    monkeypatch.setattr(scheduler, "SessionLocal", lambda: _SessionCtx(create_session))
    out1 = await scheduler._fundamental_sync_fill_job()
    assert "completed" in out1["message"]
    assert create_session.added is not None
    assert create_session.added.key == "fundamental.last_sync"
    value = ast.literal_eval(create_session.added.value)
    assert len(value["payload"]["assets"]) == 1
    assert len(value["payload"]["fundamentals"]) == 1
    assert create_session.committed is True
    assert out1["writtenToDb"] is True

    existing = SimpleNamespace(value="old")
    update_session = _FakeSession(row=existing)
    monkeypatch.setattr(scheduler, "SessionLocal", lambda: _SessionCtx(update_session))
    out2 = await scheduler._macro_update_job()
    assert "completed" in out2["message"]
    assert existing.value != "old"
    assert update_session.committed is True


@pytest.mark.asyncio
async def test_signals_and_options_jobs_store_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    scheduler._container = SimpleNamespace(
        tinkoff_client=SimpleNamespace(
            get_analyst_signals=lambda: {"signals": [{"id": 1}]},
            get_options=lambda: {"instruments": [{"figi": "F1"}, "bad", None]},
        )
    )

    session1 = _FakeSession(row=None)
    monkeypatch.setattr(scheduler, "SessionLocal", lambda: _SessionCtx(session1))
    out1 = await scheduler._signals_update_job()
    assert out1["count"] == 1
    assert session1.added is not None
    assert session1.added.key == "signals.last_payload"
    signals_value = ast.literal_eval(session1.added.value)
    assert len(signals_value["payload"]["signals"]) == 1
    assert session1.committed is True

    session2 = _FakeSession(row=None)
    monkeypatch.setattr(scheduler, "SessionLocal", lambda: _SessionCtx(session2))
    out2 = await scheduler._options_update_job()
    assert out2["count"] == 1
    assert session2.added is not None
    assert session2.added.key == "options.last_payload"
    options_value = ast.literal_eval(session2.added.value)
    assert len(options_value["payload"]["instruments"]) == 1
    assert session2.committed is True
    assert out2["writtenToDb"] is True


@pytest.mark.asyncio
async def test_assets_sync_job_reports_written_to_db(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        scheduler,
        "_instruments_update_job_wrapped",
        lambda: asyncio.sleep(0, result={"message": "ok", "count": 3}),
    )
    out = await scheduler._assets_sync_job()
    assert out["message"] == "ok"
    assert out["writtenToDb"] is True


@pytest.mark.asyncio
async def test_analysis_market_portfolio_job_uses_supported_pipeline_signature(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: dict[str, object] = {}

    class _Pipeline:
        async def run(self, db_session, **kwargs):
            calls["session"] = db_session
            calls["kwargs"] = kwargs
            return {"created": [], "skipped": [], "total": 0}

    class _Session:
        pass

    scheduler._container = SimpleNamespace(recommendation_pipeline_service=_Pipeline())
    monkeypatch.setattr("app.db.session.SessionLocal", lambda: _SessionCtx(_Session()))

    out = await scheduler._analysis_market_portfolio_job()
    assert out["message"] == "analysis completed"
    assert calls["kwargs"] == {
        "mode": "paper",
        "min_confidence": Decimal("0"),
        "min_score": Decimal("0"),
        "limit": 50,
    }


class _Response:
    def __init__(self, status_code: int, payload: dict | None = None, text: str = "x") -> None:
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text
        self.is_success = 200 <= status_code < 300

    def json(self):
        return self._payload

    def raise_for_status(self):
        req = httpx.Request("POST", "https://api.test")
        raise httpx.HTTPStatusError("error", request=req, response=self)


def _mock_client_with_responses(responses: list[_Response]) -> MagicMock:
    mock_client = MagicMock()
    mock_client.post.side_effect = responses
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    return mock_client


def test_request_retries_then_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.tinkoff_client.time.sleep", lambda _x: None)
    mock_client = _mock_client_with_responses(
        [_Response(500, text="e1"), _Response(200, payload={"ok": True})]
    )
    monkeypatch.setattr("app.services.tinkoff_client.httpx.Client", MagicMock(return_value=mock_client))

    client = TinkoffApiClient("https://api.test", "token", "acc")
    out = client._request("/svc", {})
    assert out["ok"] is True
    assert mock_client.post.call_count == 2


def test_request_get_instrument_404_maps_to_tinkoff_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.tinkoff_client.time.sleep", lambda _x: None)
    mock_client = _mock_client_with_responses([_Response(404, text="nf")])
    monkeypatch.setattr("app.services.tinkoff_client.httpx.Client", MagicMock(return_value=mock_client))
    client = TinkoffApiClient("https://api.test", "token", "acc")
    with pytest.raises(TinkoffApiError) as err:
        client._request("/GetInstrumentBy", {"id": "X"})
    assert err.value.status_code == 404


def test_request_non_retry_status_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.tinkoff_client.time.sleep", lambda _x: None)
    mock_client = _mock_client_with_responses([_Response(400, text="bad")] * 5)
    monkeypatch.setattr("app.services.tinkoff_client.httpx.Client", MagicMock(return_value=mock_client))
    client = TinkoffApiClient("https://api.test", "token", "acc")
    with pytest.raises(httpx.HTTPStatusError):
        client._request("/svc", {})
    assert mock_client.post.call_count == 5


def test_get_assets_and_options_signals_fallbacks(monkeypatch: pytest.MonkeyPatch) -> None:
    client = TinkoffApiClient("https://api.test", "token", "acc")
    monkeypatch.setattr(client, "_request", lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("x")))
    monkeypatch.setattr(client, "get_shares", lambda: {"instruments": [{"figi": "F1"}]})
    assert client.get_assets()["assets"][0]["figi"] == "F1"
    assert client.get_options() == {"instruments": []}
    assert client.get_analyst_signals() == {"signals": []}


def test_get_instrument_404(monkeypatch: pytest.MonkeyPatch) -> None:
    client = TinkoffApiClient("https://api.test", "token", "acc")

    def _fake_request(path: str, body: dict):
        if "GetInstrumentBy" in path:
            raise TinkoffApiError("Not found", status_code=404)
        return body

    monkeypatch.setattr(client, "_request", _fake_request)
    assert client.get_instrument_by_figi("UNKNOWN") is None


def test_get_last_prices_marks_degraded_on_exception(monkeypatch: pytest.MonkeyPatch) -> None:
    client = TinkoffApiClient("https://api.test", "token", "acc")
    monkeypatch.setattr(client, "_request", lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("ssl")))
    out = client.get_last_prices(["FIGI1"])
    assert out["lastPrices"] == []
    assert out["_degraded"] is True
    assert out["_error_type"] == "RuntimeError"


@pytest.mark.asyncio
async def test_last_prices_job_records_degraded_runtime_error(monkeypatch: pytest.MonkeyPatch) -> None:
    class _Session:
        async def commit(self):
            return None

    class _Registry:
        def __init__(self) -> None:
            self.calls = []

        async def record(self, **kwargs):
            self.calls.append(kwargs)

    class _MarketRepo:
        async def list_figi(self, _session, limit: int = 500):
            return ["FIGI1"]

        async def update_last_price(self, _session, *, figi: str, last_price: float):
            return None

    fake_registry = _Registry()
    monkeypatch.setattr(scheduler, "SessionLocal", lambda: _SessionCtx(_Session()))
    monkeypatch.setattr(scheduler, "get_error_registry", lambda: fake_registry)
    container = SimpleNamespace(
        tinkoff_client=SimpleNamespace(
            get_last_prices=lambda _figi: {
                "lastPrices": [],
                "_degraded": True,
                "_error": "ssl failed",
                "_error_type": "ConnectError",
                "_operation": "get_last_prices",
            }
        ),
        market_repository=_MarketRepo(),
    )

    out = await scheduler._last_prices_job(container)
    assert out["degraded"] is True
    assert fake_registry.calls
    assert fake_registry.calls[0]["error_key"] == "tinkoff:get_last_prices:ConnectError"

