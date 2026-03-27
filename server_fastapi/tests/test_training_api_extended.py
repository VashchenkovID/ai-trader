from __future__ import annotations

import builtins
import math
from types import SimpleNamespace

import pandas as pd
import pytest
from fastapi import BackgroundTasks

from app.core.errors import AppError
from app.api.v1 import training as training_api
from app.api.v1 import market as market_api
from app.api.v1 import system as system_api


class _FakeLoop:
    async def run_in_executor(self, _executor, fn, *args):
        return fn(*args)


class _Repo:
    def __init__(self, rows):
        self._rows = rows

    async def get_candles_by_figi(self, _session, *, figi: str, offset: int, limit: int):
        return self._rows


def _force_import_error(monkeypatch: pytest.MonkeyPatch, module_name: str) -> None:
    real_import = builtins.__import__

    def _fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == module_name or name.startswith(f"{module_name}."):
            raise ImportError("forced import error for tests")
        return real_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", _fake_import)


def test_default_jury_providers_importerror(monkeypatch: pytest.MonkeyPatch) -> None:
    _force_import_error(monkeypatch, "training.llm_jury.providers")
    assert training_api._default_jury_providers() == []


def test_sync_helper_importerror_paths(monkeypatch: pytest.MonkeyPatch) -> None:
    _force_import_error(monkeypatch, "training.run_nn")
    assert training_api._run_nn_sync(epochs=1) is None


def test_backtest_sync_importerror(monkeypatch: pytest.MonkeyPatch) -> None:
    _force_import_error(monkeypatch, "training.run_backtest")
    out = training_api._run_backtest_sync("m.ckpt", n_splits=2)
    assert math.isnan(out["test_mse"])
    assert math.isnan(out["test_mae"])
    assert math.isnan(out["test_direction_accuracy"])


def test_stacking_weekly_rl_sync_importerror(monkeypatch: pytest.MonkeyPatch) -> None:
    _force_import_error(monkeypatch, "training.run_stacking")
    assert training_api._run_stacking_sync("b.ckpt", epochs=1) is None
    _force_import_error(monkeypatch, "training.run_weekly")
    assert training_api._run_weekly_sync(epochs=1) is None
    _force_import_error(monkeypatch, "training.rl")
    assert training_api._run_rl_sync(total_steps=100, env_name="paper") is None


@pytest.mark.asyncio
async def test_run_nn_training_rejected_without_real_dataset() -> None:
    with pytest.raises(AppError) as err:
        await training_api.run_nn_training(background_tasks=BackgroundTasks(), epochs=2)
    assert err.value.error_code == "BAD_REQUEST"


@pytest.mark.asyncio
async def test_schedule_nn_training_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(AppError) as err:
        await training_api.schedule_nn_training(background_tasks=BackgroundTasks(), epochs=2)
    assert err.value.error_code == "BAD_REQUEST"


@pytest.mark.asyncio
async def test_run_nn_from_figi_not_found() -> None:
    container = SimpleNamespace(market_repository=_Repo(rows=[]))
    with pytest.raises(AppError) as err:
        await training_api.run_nn_from_figi(
            figi="FIGI",
            epochs=1,
            lookback_days=20,
            prediction_horizon=1,
            limit=100,
            container=container,
            db_session=None,
        )
    assert err.value.error_code == "NOT_FOUND"


@pytest.mark.asyncio
async def test_run_nn_from_figi_insufficient_rows(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "training.data.loaders.candles_to_dataframe",
        lambda _rows: pd.DataFrame({"close": [1.0] * 10, "volume": [1.0] * 10}),
    )
    container = SimpleNamespace(market_repository=_Repo(rows=[{"x": 1}]))
    with pytest.raises(AppError) as err:
        await training_api.run_nn_from_figi(
            figi="FIGI",
            epochs=1,
            lookback_days=20,
            prediction_horizon=5,
            limit=100,
            container=container,
            db_session=None,
        )
    assert err.value.error_code == "BAD_REQUEST"


@pytest.mark.asyncio
async def test_run_nn_from_figi_completed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(training_api.asyncio, "get_event_loop", lambda: _FakeLoop())
    monkeypatch.setattr(
        "training.data.loaders.candles_to_dataframe",
        lambda _rows: pd.DataFrame({"close": [1.0] * 200, "volume": [1.0] * 200}),
    )
    monkeypatch.setattr(training_api, "_run_nn_sync", lambda *args, **kwargs: "run-ok")
    container = SimpleNamespace(market_repository=_Repo(rows=[{"x": 1}] * 200))

    out = await training_api.run_nn_from_figi(
        figi="FIGI",
        epochs=1,
        lookback_days=20,
        prediction_horizon=5,
        limit=500,
        container=container,
        db_session=None,
    )
    assert out["status"] == "completed"
    assert out["mlflow_run_id"] == "run-ok"


@pytest.mark.asyncio
async def test_run_nn_from_figi_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(training_api.asyncio, "get_event_loop", lambda: _FakeLoop())
    monkeypatch.setattr(
        "training.data.loaders.candles_to_dataframe",
        lambda _rows: pd.DataFrame({"close": [1.0] * 200, "volume": [1.0] * 200}),
    )
    monkeypatch.setattr(training_api, "_run_nn_sync", lambda *args, **kwargs: None)
    container = SimpleNamespace(market_repository=_Repo(rows=[{"x": 1}]))

    out = await training_api.run_nn_from_figi(
        figi="FIGI",
        epochs=1,
        lookback_days=20,
        prediction_horizon=5,
        limit=200,
        container=container,
        db_session=None,
    )
    assert out["status"] == "unavailable"


@pytest.mark.asyncio
async def test_run_weekly_from_figi_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(training_api.asyncio, "get_event_loop", lambda: _FakeLoop())
    monkeypatch.setattr(
        "training.data.loaders.candles_to_dataframe",
        lambda _rows: pd.DataFrame({"close": [1.0] * 200, "volume": [1.0] * 200}),
    )
    monkeypatch.setattr(training_api, "_run_weekly_sync", lambda *args, **kwargs: None)
    container = SimpleNamespace(market_repository=_Repo(rows=[{"x": 1}]))

    out = await training_api.run_weekly_from_figi(
        figi="FIGI",
        epochs=1,
        seq_len=30,
        n_forecast=5,
        limit=200,
        container=container,
        db_session=None,
    )
    assert out["status"] == "unavailable"


@pytest.mark.asyncio
async def test_run_weekly_training_rejected_without_real_dataset() -> None:
    with pytest.raises(AppError) as err:
        await training_api.run_weekly_training(epochs=1, seq_len=30, n_forecast=5)
    assert err.value.error_code == "BAD_REQUEST"


@pytest.mark.asyncio
async def test_run_rl_training_completed_and_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(training_api.asyncio, "get_event_loop", lambda: _FakeLoop())
    monkeypatch.setattr(training_api, "_run_rl_sync", lambda *args, **kwargs: "models/rl/q.pkl")
    out_ok = await training_api.run_rl_training(total_steps=100, env_name="paper")
    assert out_ok["status"] == "completed"
    monkeypatch.setattr(training_api, "_run_rl_sync", lambda *args, **kwargs: None)
    out_un = await training_api.run_rl_training(total_steps=100, env_name="paper")
    assert out_un["status"] == "unavailable"


@pytest.mark.asyncio
async def test_run_weekly_from_figi_not_found_and_insufficient(monkeypatch: pytest.MonkeyPatch) -> None:
    container_empty = SimpleNamespace(market_repository=_Repo(rows=[]))
    with pytest.raises(AppError) as err1:
        await training_api.run_weekly_from_figi(
            figi="FIGI",
            epochs=1,
            seq_len=30,
            n_forecast=5,
            limit=100,
            container=container_empty,
            db_session=None,
        )
    assert err1.value.error_code == "NOT_FOUND"

    monkeypatch.setattr(
        "training.data.loaders.candles_to_dataframe",
        lambda _rows: pd.DataFrame({"close": [1.0] * 50, "volume": [1.0] * 50}),
    )
    container_small = SimpleNamespace(market_repository=_Repo(rows=[{"x": 1}]))
    with pytest.raises(AppError) as err2:
        await training_api.run_weekly_from_figi(
            figi="FIGI",
            epochs=1,
            seq_len=30,
            n_forecast=5,
            limit=100,
            container=container_small,
            db_session=None,
        )
    assert err2.value.error_code == "BAD_REQUEST"


@pytest.mark.asyncio
async def test_run_weekly_from_figi_completed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(training_api.asyncio, "get_event_loop", lambda: _FakeLoop())
    monkeypatch.setattr(
        "training.data.loaders.candles_to_dataframe",
        lambda _rows: pd.DataFrame({"close": [1.0] * 300, "volume": [1.0] * 300}),
    )
    monkeypatch.setattr(training_api, "_run_weekly_sync", lambda *args, **kwargs: "w-ok")
    container = SimpleNamespace(market_repository=_Repo(rows=[{"x": 1}] * 300))
    out = await training_api.run_weekly_from_figi(
        figi="FIGI",
        epochs=1,
        seq_len=30,
        n_forecast=5,
        limit=500,
        container=container,
        db_session=None,
    )
    assert out["status"] == "completed"
    assert out["mlflow_run_id"] == "w-ok"


@pytest.mark.asyncio
async def test_run_backtest_with_figi_calls_sync_runner(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(training_api.asyncio, "get_event_loop", lambda: _FakeLoop())
    monkeypatch.setattr(
        "training.data.loaders.candles_to_dataframe",
        lambda _rows: pd.DataFrame({"close": [1.0] * 120, "volume": [1.0] * 120}),
    )
    monkeypatch.setattr(
        training_api,
        "_run_backtest_sync",
        lambda checkpoint_path, n_splits, candles_df: {
            "test_mse": 1.0,
            "test_mae": 2.0,
            "test_direction_accuracy": 0.7,
        },
    )
    container = SimpleNamespace(market_repository=_Repo(rows=[{"x": 1}]))

    out = await training_api.run_backtest(
        checkpoint="m.ckpt",
        n_splits=2,
        figi="FIGI",
        limit=200,
        container=container,
        db_session=None,
    )
    assert out["status"] == "completed"
    assert out["metrics"]["test_mse"] == 1.0


@pytest.mark.asyncio
async def test_run_backtest_figi_not_found_and_insufficient(monkeypatch: pytest.MonkeyPatch) -> None:
    container_empty = SimpleNamespace(market_repository=_Repo(rows=[]))
    with pytest.raises(AppError) as err1:
        await training_api.run_backtest(
            checkpoint="m.ckpt",
            n_splits=2,
            figi="FIGI",
            limit=200,
            container=container_empty,
            db_session=None,
        )
    assert err1.value.error_code == "NOT_FOUND"

    monkeypatch.setattr(
        "training.data.loaders.candles_to_dataframe",
        lambda _rows: pd.DataFrame({"close": [1.0] * 40, "volume": [1.0] * 40}),
    )
    container_small = SimpleNamespace(market_repository=_Repo(rows=[{"x": 1}] * 40))
    with pytest.raises(AppError) as err2:
        await training_api.run_backtest(
            checkpoint="m.ckpt",
            n_splits=2,
            figi="FIGI",
            limit=200,
            container=container_small,
            db_session=None,
        )
    assert err2.value.error_code == "BAD_REQUEST"


@pytest.mark.asyncio
async def test_run_backtest_nan_metrics_marked_failed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(training_api.asyncio, "get_event_loop", lambda: _FakeLoop())
    monkeypatch.setattr(
        training_api,
        "_run_backtest_sync",
        lambda checkpoint_path, n_splits, candles_df: {
            "test_mse": float("nan"),
            "test_mae": float("nan"),
            "test_direction_accuracy": float("nan"),
        },
    )
    with pytest.raises(AppError) as err:
        await training_api.run_backtest(
            checkpoint="m.ckpt",
            n_splits=2,
            figi=None,
            limit=200,
            container=SimpleNamespace(market_repository=_Repo(rows=[])),
            db_session=None,
        )
    assert err.value.error_code == "BAD_REQUEST"


@pytest.mark.asyncio
async def test_run_backtest_figi_importerror(monkeypatch: pytest.MonkeyPatch) -> None:
    _force_import_error(monkeypatch, "training.data.loaders")
    container = SimpleNamespace(market_repository=_Repo(rows=[{"x": 1}]))
    with pytest.raises(AppError) as err:
        await training_api.run_backtest(
            checkpoint="m.ckpt",
            n_splits=2,
            figi="FIGI",
            limit=200,
            container=container,
            db_session=None,
        )
    assert err.value.error_code == "SERVICE_UNAVAILABLE"


@pytest.mark.asyncio
async def test_run_stacking_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    container = SimpleNamespace(market_repository=_Repo(rows=[]))
    with pytest.raises(AppError) as err:
        await training_api.run_stacking(
            base_checkpoint="base.ckpt",
            epochs=10,
            figi=None,
            limit=100,
            container=container,
            db_session=None,
        )
    assert err.value.error_code == "BAD_REQUEST"


@pytest.mark.asyncio
async def test_run_stacking_figi_importerror(monkeypatch: pytest.MonkeyPatch) -> None:
    _force_import_error(monkeypatch, "training.data.loaders")
    container = SimpleNamespace(market_repository=_Repo(rows=[{"x": 1}]))
    with pytest.raises(AppError) as err:
        await training_api.run_stacking(
            base_checkpoint="base.ckpt",
            epochs=10,
            figi="FIGI",
            limit=100,
            container=container,
            db_session=None,
        )
    assert err.value.error_code == "SERVICE_UNAVAILABLE"


@pytest.mark.asyncio
async def test_run_stacking_completed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(training_api.asyncio, "get_event_loop", lambda: _FakeLoop())
    monkeypatch.setattr(training_api, "_run_stacking_sync", lambda *args, **kwargs: "models/stacking/meta.pt")
    monkeypatch.setattr(
        "training.data.loaders.candles_to_dataframe",
        lambda _rows: pd.DataFrame({"close": [1.0] * 150, "volume": [1.0] * 150}),
    )
    container = SimpleNamespace(market_repository=_Repo(rows=[{"x": 1}] * 150))
    out = await training_api.run_stacking(
        base_checkpoint="base.ckpt",
        epochs=10,
        figi="FIGI",
        limit=100,
        container=container,
        db_session=None,
    )
    assert out["status"] == "completed"
    assert out["stacking_checkpoint"].endswith("meta.pt")


@pytest.mark.asyncio
async def test_run_stacking_figi_not_found_and_insufficient(monkeypatch: pytest.MonkeyPatch) -> None:
    container_empty = SimpleNamespace(market_repository=_Repo(rows=[]))
    with pytest.raises(AppError) as err1:
        await training_api.run_stacking(
            base_checkpoint="base.ckpt",
            epochs=10,
            figi="FIGI",
            limit=100,
            container=container_empty,
            db_session=None,
        )
    assert err1.value.error_code == "NOT_FOUND"

    monkeypatch.setattr(
        "training.data.loaders.candles_to_dataframe",
        lambda _rows: pd.DataFrame({"close": [1.0] * 30, "volume": [1.0] * 30}),
    )
    container_small = SimpleNamespace(market_repository=_Repo(rows=[{"x": 1}] * 30))
    with pytest.raises(AppError) as err2:
        await training_api.run_stacking(
            base_checkpoint="base.ckpt",
            epochs=10,
            figi="FIGI",
            limit=100,
            container=container_small,
            db_session=None,
        )
    assert err2.value.error_code == "BAD_REQUEST"


@pytest.mark.asyncio
async def test_run_release_gate_without_persist() -> None:
    body = training_api.ReleaseGateBody(
        model_ref="m1",
        trades=100,
        win_rate=0.9,
        profit_factor=2.0,
        sharpe=1.0,
        max_drawdown=0.05,
        consistency=0.8,
        persist=False,
    )
    out = await training_api.run_release_gate(body)
    assert out["status"] in {"approved", "rejected"}
    assert out["registry_path"] is None


@pytest.mark.asyncio
async def test_run_jury_requires_figi_or_list() -> None:
    with pytest.raises(AppError) as err:
        await training_api.run_jury_endpoint(
            body=training_api.RunJuryBody(),
            container=SimpleNamespace(),
            db_session=None,
        )
    assert err.value.error_code == "BAD_REQUEST"


@pytest.mark.asyncio
async def test_run_jury_no_providers(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(training_api, "_default_jury_providers", lambda: [])
    with pytest.raises(AppError) as err:
        await training_api.run_jury_endpoint(
            body=training_api.RunJuryBody(figi="FIGI"),
            container=SimpleNamespace(),
            db_session=None,
        )
    assert err.value.error_code == "SERVICE_UNAVAILABLE"


@pytest.mark.asyncio
async def test_run_jury_mixed_results(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(training_api, "_default_jury_providers", lambda: [object()])

    class _MarketService:
        async def get_stock(self, _session, figi):
            if figi == "UNKNOWN":
                return None
            return {"ticker": figi, "sector": "Tech"}

        async def get_candles(self, _session, figi, offset, limit):
            return ([{"close": 10.0}, {"close": 11.0}], 2)

    async def _fake_run_jury(db_session, figi, ticker, context, providers):
        if figi == "FAIL":
            raise RuntimeError("jury failed")
        return {"figi": figi, "consensus": 0.6}

    monkeypatch.setattr(training_api, "run_jury_for_figi", _fake_run_jury)
    container = SimpleNamespace(market_service=_MarketService())
    out = await training_api.run_jury_endpoint(
        body=training_api.RunJuryBody(figi="OK", figi_list=["UNKNOWN", "FAIL"]),
        container=container,
        db_session=None,
    )
    assert out["status"] == "completed"
    assert len(out["results"]) == 3
    statuses = [x["status"] for x in out["results"]]
    assert "ok" in statuses
    assert "error" in statuses


@pytest.mark.asyncio
async def test_run_jury_saves_payload_to_recommendation(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(training_api, "_default_jury_providers", lambda: [object()])

    class _MarketService:
        async def get_stock(self, _session, figi):
            return {"ticker": figi, "sector": "Tech"}

        async def get_candles(self, _session, figi, offset, limit):
            return ([{"close": 10.0}, {"close": 11.0}], 2)

    class _MarketRepo:
        def __init__(self) -> None:
            self.calls: list[dict] = []

        async def upsert_recommendation(self, _session, **kwargs):
            self.calls.append(kwargs)
            return SimpleNamespace(figi=kwargs["figi"])

    async def _fake_run_jury(db_session, figi, ticker, context, providers):
        return {
            "figi": figi,
            "consensus": 0.62,
            "dispersion": 0.12,
            "confidence_avg": 0.77,
            "provider_payload": {
                "gigachat": {"action": "BUY", "confidence": 0.8, "rawText": "x"},
                "alisa_gpt": {"action": "BUY", "confidence": 0.74, "rawText": "y"},
            },
            "required_providers_present": True,
        }

    monkeypatch.setattr(training_api, "run_jury_for_figi", _fake_run_jury)
    market_repo = _MarketRepo()
    container = SimpleNamespace(market_service=_MarketService(), market_repository=market_repo)
    session = SimpleNamespace()
    async def _commit():
        return None
    session.commit = _commit

    out = await training_api.run_jury_endpoint(
        body=training_api.RunJuryBody(figi="OK"),
        container=container,
        db_session=session,
    )
    assert out["status"] == "completed"
    assert market_repo.calls
    saved = market_repo.calls[0]
    assert saved["recommendation"] == "BUY"
    assert saved["llm_jury_payload"]["requiredProvidersPresent"] is True


@pytest.mark.asyncio
async def test_market_stock_and_candles_happy_path() -> None:
    class _MarketService:
        async def get_stock(self, _session, _figi):
            return {"figi": "F", "ticker": "T"}

        async def get_candles(self, **kwargs):
            return ([{"close": 1}], 1)

    container = SimpleNamespace(market_service=_MarketService())
    stock = await market_api.market_stock("F", container=container, db_session=None)
    candles = await market_api.market_stock_candles("F", container=container, db_session=None)
    assert stock.data["figi"] == "F"
    assert candles.data["meta"]["total"] == 1


@pytest.mark.asyncio
async def test_system_mode_invalid_maps_to_bad_request() -> None:
    container = SimpleNamespace(ops_service=SimpleNamespace(set_mode=lambda _m: (_ for _ in ()).throw(ValueError("bad mode"))))
    with pytest.raises(AppError) as err:
        await system_api.ops_set_mode(body=system_api.OpsModeBody(mode="normal"), container=container)
    assert err.value.error_code == "BAD_REQUEST"

