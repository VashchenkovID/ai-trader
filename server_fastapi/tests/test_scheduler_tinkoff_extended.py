from __future__ import annotations

import ast
import asyncio
import sys
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
async def test_publish_replaces_oldest_when_queue_full() -> None:
    q = asyncio.Queue(maxsize=1)
    q.put_nowait({"full": True})
    scheduler._ws_subscribers.add(q)
    await scheduler._publish("task.update", {"a": 1})
    assert q in scheduler._ws_subscribers
    assert q.qsize() == 1
    item = await q.get()
    assert item["event"] == "task.update"


def test_trigger_named_job_unsupported() -> None:
    with pytest.raises(ValueError):
        scheduler.trigger_named_job("does-not-exist")


def test_extract_option_figi_supports_basic_asset_and_position_uid() -> None:
    ticker_to_figi = {"SBER": "FIGI_SBER"}
    uid_to_figi = {"POS123": "FIGI_POS"}
    by_basic_asset = scheduler._extract_option_figi({"basicAsset": "SBER"}, ticker_to_figi, uid_to_figi)
    by_position_uid = scheduler._extract_option_figi({"basicAssetPositionUid": "POS123"}, ticker_to_figi, uid_to_figi)
    assert by_basic_asset == "FIGI_SBER"
    assert by_position_uid == "FIGI_POS"


def test_extract_signal_figi_uses_instrument_uid_lookup() -> None:
    out = scheduler._extract_signal_figi({"instrumentUid": "UID42"}, {}, {"UID42": "FIGI42"})
    assert out == "FIGI42"


def test_adaptive_fusion_params_and_recommendation_thresholds() -> None:
    low = scheduler._adaptive_fusion_params("low")
    high = scheduler._adaptive_fusion_params("high")
    normal = scheduler._adaptive_fusion_params("normal")
    assert low[0] > normal[0]  # NN weight
    assert high[1] > normal[1]  # LLM weight in high vol
    assert scheduler._score_to_recommendation(0.9) == "BUY"
    assert scheduler._score_to_recommendation(0.1) == "SELL"


def test_canary_bucket_and_confidence_calibration() -> None:
    assert scheduler._is_canary_enabled_for_figi("FIGI1", 0) is False
    assert scheduler._is_canary_enabled_for_figi("FIGI1", 100) is True
    raw = 0.8
    calibrated = scheduler._calibrate_confidence(raw, mode="nn_only", temperature=1.2)
    assert 0.0 <= calibrated <= 1.0
    assert calibrated < raw


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
async def test_full_db_sync_year_job_aggregates_steps(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(scheduler, "_assets_sync_job", lambda: asyncio.sleep(0, result={"degraded": False}))
    monkeypatch.setattr(scheduler, "_fundamental_sync_fill_job", lambda: asyncio.sleep(0, result={"degraded": False}))
    monkeypatch.setattr(scheduler, "_candles_sync_year_job", lambda: asyncio.sleep(0, result={"degraded": False}))
    monkeypatch.setattr(scheduler, "_dividends_sync_year_job", lambda: asyncio.sleep(0, result={"degraded": True}))
    monkeypatch.setattr(scheduler, "_options_update_job", lambda: asyncio.sleep(0, result={"degraded": False}))
    monkeypatch.setattr(scheduler, "_signals_update_job", lambda: asyncio.sleep(0, result={"degraded": False}))

    out = await scheduler._full_db_sync_year_job()
    assert out["message"] == "full db sync year completed"
    assert out["degraded"] is True
    assert set(out["steps"].keys()) == {
        "assets",
        "fundamentals",
        "candles",
        "dividends",
        "options",
        "signals",
    }


@pytest.mark.asyncio
async def test_dividends_sync_year_job_empty_universe(monkeypatch: pytest.MonkeyPatch) -> None:
    scheduler._container = SimpleNamespace(
        tinkoff_client=SimpleNamespace(get_dividends=lambda _figi: {"dividends": []}),
        market_repository=SimpleNamespace(list_figi=lambda _session, limit=100: asyncio.sleep(0, result=[])),
    )
    monkeypatch.setattr(scheduler, "SessionLocal", lambda: _SessionCtx(_FakeSession()))
    out = await scheduler._dividends_sync_year_job()
    assert out["count"] == 0
    assert out["writtenToDb"] is False


@pytest.mark.asyncio
async def test_candles_sync_year_job_partial_error(monkeypatch: pytest.MonkeyPatch) -> None:
    class _ReadSession:
        async def scalar(self, _stmt):
            return None

    class _WriteSession:
        def __init__(self) -> None:
            self.committed = False

        async def scalar(self, _stmt):
            return None

        def add(self, _row):
            return None

        async def commit(self):
            self.committed = True

    write_session = _WriteSession()
    sessions = [_ReadSession(), write_session]

    def _session_local():
        return _SessionCtx(sessions.pop(0))

    async def _list_figi(_session, limit=100):
        return ["F_OK", "F_BAD"]

    def _get_candles(figi, *_args, **_kwargs):
        if figi == "F_BAD":
            raise RuntimeError("upstream")
        return {
            "candles": [
                {
                    "time": "2026-01-01T00:00:00Z",
                    "open": {"units": "1", "nano": 0},
                    "high": {"units": "2", "nano": 0},
                    "low": {"units": "1", "nano": 0},
                    "close": {"units": "2", "nano": 0},
                    "volume": 100,
                }
            ]
        }

    scheduler._container = SimpleNamespace(
        tinkoff_client=SimpleNamespace(get_candles=_get_candles),
        market_repository=SimpleNamespace(list_figi=_list_figi),
    )
    monkeypatch.setattr(scheduler, "SessionLocal", _session_local)

    out = await scheduler._candles_sync_year_job()
    assert out["count"] == 1
    assert out["failed"] == 1
    assert out["degraded"] is True
    assert write_session.committed is True


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
        def __init__(self) -> None:
            self.committed = False

        async def commit(self):
            self.committed = True

    class _MarketRepo:
        async def list_instruments(self, *_args, **_kwargs):
            return []

    scheduler._container = SimpleNamespace(
        recommendation_pipeline_service=_Pipeline(),
        market_repository=_MarketRepo(),
    )
    fake_session = _Session()
    monkeypatch.setattr("app.db.session.SessionLocal", lambda: _SessionCtx(fake_session))

    out = await scheduler._analysis_market_portfolio_job()
    assert out["message"] == "analysis completed"
    assert calls["kwargs"] == {
        "mode": "paper",
        "min_confidence": Decimal("0"),
        "min_score": Decimal("0"),
        "limit": 50,
    }
    assert fake_session.committed is True


@pytest.mark.asyncio
async def test_analysis_market_portfolio_job_nn_only_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    class _Pipeline:
        async def run(self, _session, **_kwargs):
            return {"created": [], "skipped": [], "total": 0}

    class _Repo:
        async def list_instruments(self, _session, offset=0, limit=500):
            if offset > 0:
                return []
            return [SimpleNamespace(figi="F1", ticker="T1", sector="Tech")]

        async def get_recommendation_by_figi(self, _session, _figi):
            return None

        async def upsert_recommendation(self, _session, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(figi=kwargs["figi"])

    class _Session:
        async def commit(self):
            return None

    scheduler._container = SimpleNamespace(recommendation_pipeline_service=_Pipeline(), market_repository=_Repo())
    monkeypatch.setattr("app.db.session.SessionLocal", lambda: _SessionCtx(_Session()))
    monkeypatch.setattr("app.api.v1.training._default_jury_providers", lambda: [])
    monkeypatch.setattr(
        scheduler,
        "_run_nn_inference_for_figi",
        lambda _figi, _ckpt: asyncio.sleep(
            0,
            result={
                "ok": True,
                "score": 0.74,
                "confidence": 0.83,
                "checkpoint": "models/python_nn/test.ckpt",
                "payload": {"featureCount": 9},
            },
        ),
    )
    monkeypatch.setattr(scheduler, "_latest_checkpoint_path", lambda _p: "models/python_nn/test.ckpt")

    out = await scheduler._analysis_market_portfolio_job()
    assert out["message"] == "analysis completed"
    assert out["fusionNnOnly"] == 1
    assert captured["recommendation"] == "BUY"
    assert captured["nn_checkpoint"] == "models/python_nn/test.ckpt"
    assert captured["nn_payload"]["featureCount"] == 9


@pytest.mark.asyncio
async def test_training_quick_job_retries_without_resume(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[bool] = []

    def _fake_run(*args, **_kwargs):
        # 8-й параметр: resume_from_latest
        resume_flag = bool(args[7]) if len(args) > 7 else False
        calls.append(resume_flag)
        if resume_flag:
            raise RuntimeError("You restored a checkpoint with current_epoch=2, but you have set Trainer(max_epochs=1).")
        return "run-ok"

    fake_module = SimpleNamespace(run=_fake_run)
    monkeypatch.setitem(sys.modules, "training.run_nn", fake_module)
    monkeypatch.setitem(sys.modules, "training.run_stacking", SimpleNamespace(run=lambda *_a, **_k: None))
    monkeypatch.setitem(sys.modules, "training.rl", SimpleNamespace(train_agent=lambda **_k: "rl-ok"))
    scheduler._container = SimpleNamespace(market_repository=SimpleNamespace(), tinkoff_client=None)
    monkeypatch.setattr(scheduler, "_list_training_figi", lambda limit=5000: asyncio.sleep(0, result=["F1"]))
    monkeypatch.setattr(
        scheduler,
        "_load_training_candles_with_backfill",
        lambda *_args, **_kwargs: asyncio.sleep(0, result=([1] * 30, 1)),
    )
    monkeypatch.setattr(scheduler, "_load_intraday_candles_last_day", lambda _figi: asyncio.sleep(0, result=None))
    monkeypatch.setattr(scheduler, "_options_features_for_figi", lambda _figi: asyncio.sleep(0, result=None))
    monkeypatch.setattr(scheduler, "_signals_features_for_figi", lambda _figi: asyncio.sleep(0, result=None))

    out = await scheduler._training_quick_job()
    assert out["message"] == "quick training completed"
    assert out["mlflowRunId"] == "run-ok"
    assert out["metaSucceeded"] == 0
    assert out["metaFailed"] == 1
    assert calls == [True, False]


@pytest.mark.asyncio
async def test_training_quick_job_empty_pipeline_returns_skipped(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(sys.modules, "training.run_nn", SimpleNamespace(run=lambda *_args, **_kwargs: "run-ok"))
    monkeypatch.setitem(sys.modules, "training.run_stacking", SimpleNamespace(run=lambda *_a, **_k: None))
    monkeypatch.setitem(sys.modules, "training.rl", SimpleNamespace(train_agent=lambda **_k: "rl-ok"))
    scheduler._container = SimpleNamespace(market_repository=SimpleNamespace(), tinkoff_client=None)
    monkeypatch.setattr(scheduler, "_list_training_figi", lambda limit=5000: asyncio.sleep(0, result=["F1"]))
    monkeypatch.setattr(
        scheduler,
        "_load_training_candles_with_backfill",
        lambda *_args, **_kwargs: asyncio.sleep(0, result=(None, 1)),
    )
    monkeypatch.setattr(scheduler, "_load_intraday_candles_last_day", lambda _figi: asyncio.sleep(0, result=None))
    monkeypatch.setattr(scheduler, "_signals_features_for_figi", lambda _figi: asyncio.sleep(0, result=None))
    out = await scheduler._training_quick_job()
    assert out["message"] == "quick training skipped: insufficient candles on all instruments"
    assert out["windowDays"] == 1


@pytest.mark.asyncio
async def test_training_quick_job_uses_compatible_checkpoint_for_meta(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(sys.modules, "training.run_nn", SimpleNamespace(run=lambda *_args, **_kwargs: "run-ok"))

    captured: dict[str, object] = {}

    def _fake_stacking(*_args, **kwargs):
        captured["base_checkpoint_path"] = kwargs.get("base_checkpoint_path")
        return "meta-ok"

    monkeypatch.setitem(sys.modules, "training.run_stacking", SimpleNamespace(run=_fake_stacking))
    monkeypatch.setitem(sys.modules, "training.rl", SimpleNamespace(train_agent=lambda **_k: "rl-ok"))
    scheduler._container = SimpleNamespace(market_repository=SimpleNamespace(), tinkoff_client=None)
    monkeypatch.setattr(scheduler, "_list_training_figi", lambda limit=5000: asyncio.sleep(0, result=["F1"]))
    monkeypatch.setattr(
        scheduler,
        "_load_training_candles_with_backfill",
        lambda *_args, **_kwargs: asyncio.sleep(0, result=([1] * 30, 1)),
    )
    monkeypatch.setattr(scheduler, "_load_intraday_candles_last_day", lambda _figi: asyncio.sleep(0, result=None))
    monkeypatch.setattr(scheduler, "_options_features_for_figi", lambda _figi: asyncio.sleep(0, result=None))
    monkeypatch.setattr(scheduler, "_signals_features_for_figi", lambda _figi: asyncio.sleep(0, result=None))
    monkeypatch.setattr(
        scheduler,
        "_select_meta_base_checkpoint",
        lambda **_kwargs: "models/python_nn/compatible.ckpt",
    )

    out = await scheduler._training_quick_job()
    assert out["message"] == "quick training completed"
    assert out["metaSucceeded"] == 1
    assert out["metaFailed"] == 0
    assert captured["base_checkpoint_path"] == "models/python_nn/compatible.ckpt"


@pytest.mark.asyncio
async def test_training_full_job_skips_when_market_repo_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(sys.modules, "training.run_nn", SimpleNamespace(run=lambda *_a, **_k: "nn-run"))
    monkeypatch.setitem(
        sys.modules, "training.run_weekly", SimpleNamespace(run=lambda *_a, **_k: "weekly-run")
    )
    monkeypatch.setitem(sys.modules, "training.rl", SimpleNamespace(train_agent=lambda **_k: "rl-ckpt"))
    scheduler._container = None

    out = await scheduler._training_full_job()
    assert out["message"] == "full training skipped: market repository unavailable (real-data only)"
    assert out["reason"] == "market_repo_unavailable"
    assert out["metaSucceeded"] == 0
    assert out["metaFailed"] == 0


@pytest.mark.asyncio
async def test_weekly_generation_uses_real_db_dataset(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, object]] = []

    def _fake_run(*args, **kwargs):
        calls.append({"args": args, "kwargs": kwargs})
        return "weekly-real-run"

    monkeypatch.setitem(sys.modules, "training.run_weekly", SimpleNamespace(run=_fake_run))
    monkeypatch.setattr(scheduler, "_list_training_figi", lambda limit=5000: asyncio.sleep(0, result=["F1", "F2"]))
    monkeypatch.setattr(
        scheduler,
        "_load_training_candles_with_backfill",
        lambda figi, **_kwargs: asyncio.sleep(
            0,
            result=(
                __import__("pandas").DataFrame(
                    {
                        "close": [100.0 + i for i in range(130)],
                        "volume": [1_000_000 for _ in range(130)],
                    },
                    index=__import__("pandas").date_range("2025-01-01", periods=130, freq="D"),
                ),
                365,
            ),
        ),
    )
    out = await scheduler._weekly_generation_job()
    assert out["message"] == "weekly generation completed"
    assert out["mode"] == "generation"
    assert out["dataSource"] == "real_db"
    assert out["processedUniverse"] == "all_instruments"
    assert out["resumeFromLatest"] is False
    assert out["instrumentTotal"] == 2
    assert out["instrumentEligible"] == 2
    assert out["rowsUsed"] > 0
    assert calls
    args = calls[0]["args"]
    assert len(args) >= 8
    assert args[4] is not None  # candles_df
    assert args[7] is False  # resume_from_latest


@pytest.mark.asyncio
async def test_weekly_update_uses_incremental_resume(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, object]] = []

    def _fake_run(*args, **kwargs):
        calls.append({"args": args, "kwargs": kwargs})
        return "weekly-update-run"

    monkeypatch.setitem(sys.modules, "training.run_weekly", SimpleNamespace(run=_fake_run))
    monkeypatch.setattr(scheduler, "_list_training_figi", lambda limit=5000: asyncio.sleep(0, result=["F1"]))
    monkeypatch.setattr(
        scheduler,
        "_load_training_candles_with_backfill",
        lambda figi, **_kwargs: asyncio.sleep(
            0,
            result=(
                __import__("pandas").DataFrame(
                    {
                        "close": [200.0 + i for i in range(120)],
                        "volume": [500_000 for _ in range(120)],
                    },
                    index=__import__("pandas").date_range("2025-06-01", periods=120, freq="D"),
                ),
                45,
            ),
        ),
    )
    out = await scheduler._weekly_update_job()
    assert out["message"] == "weekly update completed"
    assert out["mode"] == "update"
    assert out["resumeFromLatest"] is True
    assert out["instrumentTotal"] == 1
    assert out["instrumentEligible"] == 1
    assert out["parameters"]["updateMode"] is True
    assert calls
    args = calls[0]["args"]
    assert len(args) >= 8
    assert args[4] is not None  # candles_df
    assert args[7] is True  # resume_from_latest


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

