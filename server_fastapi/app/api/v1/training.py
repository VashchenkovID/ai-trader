"""
API для запуска обучения (Phase 4).

Эндпоинты вызывают контуры обучения в фоне. Результаты сохраняются в MLflow и/или
в каталог артефактов. Пайплайн рекомендаций читает предсказания из БД (формат recommendations).
"""

from __future__ import annotations

import asyncio
import math
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from pydantic import BaseModel, Field

from app.api.deps import get_container
from app.core.errors import AppError
from app.db.session import get_db_session
from app.services.container import AppContainer
from app.services.llm_jury_service import run_jury_for_figi
from sqlalchemy.ext.asyncio import AsyncSession
from training.config import get_training_settings
from training.governance import (
    ReleaseMetrics,
    ReleasePolicy,
    append_release_decision,
    evaluate_release_gate,
)

router = APIRouter(prefix="/training", tags=["training"])


def _default_jury_providers() -> list:
    """Провайдеры жюри по умолчанию (Mock + включенные реальные провайдеры)."""
    try:
        from training.llm_jury.providers import (
            AlisaGptProvider,
            GigaChatProvider,
            MockLLMProvider,
        )
    except ImportError:
        return []
    return [
        MockLLMProvider("mock"),
        GigaChatProvider(),
        AlisaGptProvider(),
    ]


def _consensus_to_recommendation(consensus: float) -> str:
    if consensus >= 0.55:
        return "BUY"
    if consensus <= 0.45:
        return "SELL"
    return "HOLD"


async def _save_jury_to_recommendation(
    *,
    container: AppContainer,
    db_session: AsyncSession,
    figi: str,
    ticker: str,
    sector: str,
    candles: list[dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    providers = _default_jury_providers()
    if not providers:
        return None
    if candles:
        parts = [f"close: {c.get('close')}" for c in candles[-5:]]
        context = f"Тикер {ticker}, сектор {sector}. Последние свечи: {', '.join(parts)}."
    else:
        context = f"Тикер {ticker}, сектор {sector}."

    summary = await run_jury_for_figi(
        db_session,
        figi=figi,
        ticker=ticker,
        context=context,
        providers=providers,
    )
    recommendation = _consensus_to_recommendation(float(summary["consensus"]))
    payload = {
        "providers": summary.get("provider_payload") or {},
        "consensus": float(summary["consensus"]),
        "dispersion": float(summary["dispersion"]),
        "confidenceAvg": float(summary["confidence_avg"]),
        "requiredProvidersPresent": bool(summary.get("required_providers_present")),
        "source": "llm_jury",
    }
    await container.market_repository.upsert_recommendation(
        db_session,
        figi=figi,
        recommendation=recommendation,
        confidence=Decimal(str(round(float(summary["confidence_avg"]), 4))),
        score=Decimal(str(round(float(summary["consensus"]), 4))),
        llm_jury_payload=payload,
    )
    await db_session.commit()
    return payload


def _run_nn_sync(
    epochs: int = 20,
    candles_df: Any = None,
    lookback_days: int = 60,
    prediction_horizon: int = 5,
    resume_from_latest: bool = False,
) -> str | None:
    """Синхронный запуск обучения NN (вызывается в executor)."""
    try:
        from training.run_nn import run
        return run(
            max_epochs=epochs,
            candles_df=candles_df,
            lookback_days=lookback_days,
            prediction_horizon=prediction_horizon,
            resume_from_latest=resume_from_latest,
        )
    except ImportError:
        return None


@router.post(
    "/run-nn",
    summary="Запустить обучение NN с conditioning",
    description="Ставит в очередь фоновую задачу обучения базового контура NN. Чекпоинты сохраняются в MLflow и TRAINING_ARTIFACTS_DIR. Требует установки зависимости [training].",
)
async def run_nn_training(
    background_tasks: BackgroundTasks,
    epochs: int = 20,
    resume_from_latest: bool = Query(False, description="Продолжить обучение с последнего чекпоинта"),
) -> dict[str, Any]:
    loop = asyncio.get_event_loop()
    run_id = await loop.run_in_executor(None, _run_nn_sync, epochs, None, 60, 5, resume_from_latest)
    if run_id is None:
        return {
            "status": "unavailable",
            "message": "Training package not installed. Install with: pip install -e \".[training]\"",
        }
    return {"status": "completed", "mlflow_run_id": run_id}


@router.post(
    "/run-nn-from-figi",
    summary="Запустить обучение NN по свечам из БД (FIGI)",
    description="Загружает свечи по FIGI из БД, преобразует в фичи и запускает обучение в executor.",
)
async def run_nn_from_figi(
    figi: str = Query(..., description="FIGI инструмента"),
    epochs: int = Query(20, ge=1, le=500),
    lookback_days: int = Query(60, ge=20, le=120),
    prediction_horizon: int = Query(5, ge=1, le=30),
    limit: int = Query(2000, ge=100, le=5000),
    resume_from_latest: bool = Query(False, description="Продолжить обучение с последнего чекпоинта"),
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    try:
        from training.data.loaders import candles_to_dataframe
    except ImportError:
        raise AppError(
            "SERVICE_UNAVAILABLE",
            message='Training package not installed. Install with: pip install -e ".[training]"',
        )
    rows = await container.market_repository.get_candles_by_figi(
        db_session, figi=figi, offset=0, limit=limit
    )
    if not rows:
        raise AppError("NOT_FOUND", message=f"Свечи по FIGI {figi} не найдены")
    df = candles_to_dataframe(rows)
    min_rows = lookback_days + prediction_horizon + 50
    if df.empty or len(df) < min_rows:
        raise AppError(
            "BAD_REQUEST",
            message=f"Недостаточно свечей (нужно >= {min_rows}, получено {len(df)})",
        )
    loop = asyncio.get_event_loop()
    run_id = await loop.run_in_executor(
        None,
        lambda: _run_nn_sync(
            epochs=epochs,
            candles_df=df,
            lookback_days=lookback_days,
            prediction_horizon=prediction_horizon,
            resume_from_latest=resume_from_latest,
        ),
    )
    if run_id is None:
        return {"status": "unavailable", "message": "Training package not installed."}
    llm_payload = None
    try:
        stock = None
        if hasattr(container.market_repository, "get_instrument_by_figi"):
            stock = await container.market_repository.get_instrument_by_figi(db_session, figi)
        ticker = getattr(stock, "ticker", None) or figi
        sector = getattr(stock, "sector", None) or "—"
        llm_payload = await _save_jury_to_recommendation(
            container=container,
            db_session=db_session,
            figi=figi,
            ticker=str(ticker),
            sector=str(sector),
            candles=[{"close": float(v)} for v in df["close"].tail(5).tolist()] if "close" in df else None,
        )
    except Exception:
        llm_payload = None
    return {
        "status": "completed",
        "mlflow_run_id": run_id,
        "figi": figi,
        "rows_used": len(df),
        "llmJuryPayloadSaved": bool(llm_payload),
    }


@router.post(
    "/run-nn-background",
    summary="Запланировать обучение NN в фоне",
    description="Добавляет задачу обучения в BackgroundTasks и сразу возвращает ответ. Результат обучения пишется в MLflow; для получения run_id смотрите логи приложения.",
)
async def schedule_nn_training(
    background_tasks: BackgroundTasks,
    epochs: int = 20,
    resume_from_latest: bool = Query(False, description="Продолжить обучение с последнего чекпоинта"),
) -> dict[str, Any]:
    def _task() -> None:
        _run_nn_sync(epochs=epochs, resume_from_latest=resume_from_latest)

    try:
        from training.run_nn import run  # noqa: F401
    except ImportError:
        return {
            "status": "rejected",
            "message": "Training package not installed. Install with: pip install -e \".[training]\"",
        }
    background_tasks.add_task(_task)
    return {"status": "scheduled", "message": "NN training started in background.", "epochs": epochs}


def _run_backtest_sync(
    checkpoint_path: str,
    n_splits: int = 5,
    candles_df: Any = None,
) -> dict[str, Any]:
    """Синхронный запуск walk-forward бэктеста (вызывается в executor)."""
    try:
        from training.run_backtest import run
        return run(
            checkpoint_path=checkpoint_path,
            n_splits=n_splits,
            candles_df=candles_df,
            log_mlflow=True,
        )
    except ImportError:
        return {"test_mse": float("nan"), "test_mae": float("nan"), "test_direction_accuracy": float("nan")}


def _run_stacking_sync(
    base_checkpoint_path: str,
    epochs: int = 20,
    candles_df: Any = None,
) -> str | None:
    """Синхронный запуск обучения стекинга (вызывается в executor)."""
    try:
        from training.run_stacking import run
        return run(
            base_checkpoint_path=base_checkpoint_path,
            max_epochs=epochs,
            candles_df=candles_df,
        )
    except ImportError:
        return None


def _run_weekly_sync(
    epochs: int = 20,
    candles_df: Any = None,
    seq_len: int = 30,
    n_forecast: int = 5,
    resume_from_latest: bool = False,
) -> str | None:
    """Синхронный запуск обучения Weekly forecast (вызывается в executor)."""
    try:
        from training.run_weekly import run
        return run(
            max_epochs=epochs,
            candles_df=candles_df,
            seq_len=seq_len,
            n_forecast=n_forecast,
            resume_from_latest=resume_from_latest,
        )
    except ImportError:
        return None


def _run_rl_sync(
    total_steps: int = 10_000,
    env_name: str = "paper",
    continue_from_latest: bool = False,
) -> str | None:
    """Синхронный запуск обучения RL-агента (вызывается в executor)."""
    try:
        from training.rl import train_agent

        return train_agent(
            env_name=env_name, total_steps=total_steps, continue_from_latest=continue_from_latest
        )
    except ImportError:
        return None


@router.post(
    "/run-weekly",
    summary="Запустить обучение Weekly forecast (LSTM)",
    description="Запускает обучение контура weekly в executor. Без FIGI используется синтетика. Чекпоинты в models_root/weekly/.",
)
async def run_weekly_training(
    epochs: int = Query(20, ge=1, le=500),
    seq_len: int = Query(30, ge=10, le=60),
    n_forecast: int = Query(5, ge=1, le=14),
    resume_from_latest: bool = Query(False, description="Продолжить обучение с последнего weekly чекпоинта"),
) -> dict[str, Any]:
    loop = asyncio.get_event_loop()
    run_id = await loop.run_in_executor(
        None,
        lambda: _run_weekly_sync(
            epochs=epochs,
            seq_len=seq_len,
            n_forecast=n_forecast,
            resume_from_latest=resume_from_latest,
        ),
    )
    if run_id is None:
        return {
            "status": "unavailable",
            "message": "Training package not installed. Install with: pip install -e \".[training]\"",
        }
    return {"status": "completed", "mlflow_run_id": run_id}


@router.post(
    "/run-rl",
    summary="Запустить обучение RL-агента (Q-learning)",
    description="Запускает табличный RL-контур (HOLD/BUY/SELL), сохраняет артефакт агента в models_root/rl.",
)
async def run_rl_training(
    total_steps: int = Query(10_000, ge=100, le=2_000_000),
    env_name: str = Query("paper"),
    continue_from_latest: bool = Query(False, description="Продолжить RL-обучение с последнего агента"),
) -> dict[str, Any]:
    loop = asyncio.get_event_loop()
    checkpoint = await loop.run_in_executor(
        None,
        lambda: _run_rl_sync(
            total_steps=total_steps,
            env_name=env_name,
            continue_from_latest=continue_from_latest,
        ),
    )
    if checkpoint is None:
        return {
            "status": "unavailable",
            "message": "Training package not installed. Install with: pip install -e \".[training]\"",
        }
    return {
        "status": "completed",
        "rl_checkpoint": checkpoint,
        "total_steps": total_steps,
        "env_name": env_name,
    }


@router.post(
    "/run-weekly-from-figi",
    summary="Запустить обучение Weekly forecast по свечам из БД (FIGI)",
    description="Загружает свечи по FIGI из БД и запускает обучение LSTM в executor.",
)
async def run_weekly_from_figi(
    figi: str = Query(..., description="FIGI инструмента"),
    epochs: int = Query(20, ge=1, le=500),
    seq_len: int = Query(30, ge=10, le=60),
    n_forecast: int = Query(5, ge=1, le=14),
    limit: int = Query(2000, ge=100, le=5000),
    resume_from_latest: bool = Query(False, description="Продолжить обучение с последнего weekly чекпоинта"),
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    try:
        from training.data.loaders import candles_to_dataframe
    except ImportError:
        raise AppError(
            "SERVICE_UNAVAILABLE",
            message='Training package not installed. Install with: pip install -e ".[training]"',
        )
    rows = await container.market_repository.get_candles_by_figi(
        db_session, figi=figi, offset=0, limit=limit
    )
    if not rows:
        raise AppError("NOT_FOUND", message=f"Свечи по FIGI {figi} не найдены")
    df = candles_to_dataframe(rows)
    min_rows = 20 + seq_len + n_forecast + 50
    if df.empty or len(df) < min_rows:
        raise AppError(
            "BAD_REQUEST",
            message=f"Недостаточно свечей для weekly (нужно >= {min_rows}, получено {len(df)})",
        )
    loop = asyncio.get_event_loop()
    run_id = await loop.run_in_executor(
        None,
        lambda: _run_weekly_sync(
            epochs=epochs,
            candles_df=df,
            seq_len=seq_len,
            n_forecast=n_forecast,
            resume_from_latest=resume_from_latest,
        ),
    )
    if run_id is None:
        return {"status": "unavailable", "message": "Training package not installed."}
    llm_payload = None
    try:
        stock = None
        if hasattr(container.market_repository, "get_instrument_by_figi"):
            stock = await container.market_repository.get_instrument_by_figi(db_session, figi)
        ticker = getattr(stock, "ticker", None) or figi
        sector = getattr(stock, "sector", None) or "—"
        llm_payload = await _save_jury_to_recommendation(
            container=container,
            db_session=db_session,
            figi=figi,
            ticker=str(ticker),
            sector=str(sector),
            candles=[{"close": float(v)} for v in df["close"].tail(5).tolist()] if "close" in df else None,
        )
    except Exception:
        llm_payload = None
    return {
        "status": "completed",
        "mlflow_run_id": run_id,
        "figi": figi,
        "rows_used": len(df),
        "llmJuryPayloadSaved": bool(llm_payload),
    }


@router.post(
    "/run-backtest",
    summary="Запустить walk-forward бэктест по чекпоинту NN",
    description="Загружает данные (по FIGI из БД или синтетика), разбивает на n_splits окон, оценивает модель на каждом тестовом окне, возвращает средние метрики (test_mse, test_mae, test_direction_accuracy).",
)
async def run_backtest(
    checkpoint: str = Query(..., description="Путь к чекпоинту CondMLP (например ./models/python_nn/cond_mlp-xx.ckpt)"),
    n_splits: int = Query(5, ge=2, le=20),
    figi: str | None = Query(None, description="FIGI для загрузки свечей из БД; без указания — синтетика"),
    limit: int = Query(2000, ge=100, le=5000),
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    candles_df = None
    if figi:
        try:
            from training.data.loaders import candles_to_dataframe
        except ImportError:
            raise AppError(
                "SERVICE_UNAVAILABLE",
                message='Training package not installed. Install with: pip install -e ".[training]"',
            )
        rows = await container.market_repository.get_candles_by_figi(
            db_session, figi=figi, offset=0, limit=limit
        )
        if not rows:
            raise AppError("NOT_FOUND", message=f"Свечи по FIGI {figi} не найдены")
        candles_df = candles_to_dataframe(rows)
        min_rows = 60 + 5 + 50
        if candles_df.empty or len(candles_df) < min_rows:
            raise AppError(
                "BAD_REQUEST",
                message=f"Недостаточно свечей для backtest (нужно >= {min_rows}, получено {len(candles_df)})",
            )
    loop = asyncio.get_event_loop()
    metrics = await loop.run_in_executor(
        None,
        lambda: _run_backtest_sync(checkpoint_path=checkpoint, n_splits=n_splits, candles_df=candles_df),
    )
    if any(not isinstance(v, (float, int)) or math.isnan(float(v)) for v in metrics.values()):
        return {
            "status": "failed",
            "message": "Backtest failed or returned invalid metrics",
            "metrics": metrics,
            "checkpoint": checkpoint,
        }
    return {"status": "completed", "metrics": metrics, "checkpoint": checkpoint}


@router.post(
    "/run-stacking",
    summary="Запустить обучение мета-модели стекинга поверх CondMLP",
    description="Загружает базовый чекпоинт CondMLP, строит мета-признаки из 9×2 предсказаний, обучает StackingModel, сохраняет чекпоинт в models_root/stacking/.",
)
async def run_stacking(
    base_checkpoint: str = Query(..., description="Путь к чекпоинту CondMLP"),
    epochs: int = Query(20, ge=5, le=200),
    figi: str | None = Query(None, description="FIGI для загрузки свечей из БД; без указания — синтетика"),
    limit: int = Query(2000, ge=100, le=5000),
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    candles_df = None
    if figi:
        try:
            from training.data.loaders import candles_to_dataframe
        except ImportError:
            raise AppError(
                "SERVICE_UNAVAILABLE",
                message='Training package not installed. Install with: pip install -e ".[training]"',
            )
        rows = await container.market_repository.get_candles_by_figi(
            db_session, figi=figi, offset=0, limit=limit
        )
        if not rows:
            raise AppError("NOT_FOUND", message=f"Свечи по FIGI {figi} не найдены")
        candles_df = candles_to_dataframe(rows)
        min_rows = 60 + 5 + 50
        if candles_df.empty or len(candles_df) < min_rows:
            raise AppError(
                "BAD_REQUEST",
                message=f"Недостаточно свечей для stacking (нужно >= {min_rows}, получено {len(candles_df)})",
            )
    loop = asyncio.get_event_loop()
    stacking_path = await loop.run_in_executor(
        None,
        lambda: _run_stacking_sync(
            base_checkpoint_path=base_checkpoint,
            epochs=epochs,
            candles_df=candles_df,
        ),
    )
    if stacking_path is None:
        return {"status": "unavailable", "message": "Training package not installed or stacking failed."}
    return {"status": "completed", "stacking_checkpoint": stacking_path, "base_checkpoint": base_checkpoint}


class ReleaseGateBody(BaseModel):
    """Вход release-gate для решения о промоуте модели."""

    model_ref: str = Field(..., description="Идентификатор или путь модели-кандидата")
    trades: int = Field(..., ge=0, description="Количество сделок в OOS-проверке")
    win_rate: float = Field(..., ge=0, le=1, description="Доля прибыльных сделок")
    profit_factor: float = Field(..., ge=0, description="Profit factor")
    sharpe: float = Field(..., description="Sharpe ratio")
    max_drawdown: float = Field(..., ge=0, le=1, description="Максимальная просадка (0..1)")
    consistency: float = Field(..., ge=0, le=1, description="Стабильность OOS-результатов (0..1)")
    persist: bool = Field(
        default=True,
        description="Сохранять решение в JSONL-реестр release-gate",
    )


@router.post(
    "/release-gate",
    summary="Проверить release-gate и принять решение о промоуте модели",
    description="Сверяет метрики кандидата с порогами policy, возвращает approve/reject и список проваленных критериев.",
)
async def run_release_gate(body: ReleaseGateBody) -> dict[str, Any]:
    settings = get_training_settings()
    policy = ReleasePolicy(
        min_trades=settings.release_min_trades,
        min_win_rate=settings.release_min_win_rate,
        min_profit_factor=settings.release_min_profit_factor,
        min_sharpe=settings.release_min_sharpe,
        max_drawdown=settings.release_max_drawdown,
        min_consistency=settings.release_min_consistency,
    )
    metrics = ReleaseMetrics(
        trades=body.trades,
        win_rate=body.win_rate,
        profit_factor=body.profit_factor,
        sharpe=body.sharpe,
        max_drawdown=body.max_drawdown,
        consistency=body.consistency,
    )
    decision = evaluate_release_gate(metrics, policy, model_ref=body.model_ref)

    registry_path = None
    if body.persist:
        registry_path = append_release_decision(settings.release_registry_path, decision)

    return {
        "status": "approved" if decision["approved"] else "rejected",
        "decision": decision,
        "registry_path": registry_path,
    }


class RunJuryBody(BaseModel):
    """Тело запроса запуска жюри по FIGI."""

    figi: str | None = Field(None, description="Один FIGI инструмента")
    figi_list: list[str] | None = Field(None, description="Список FIGI для пакетного запуска")


@router.post(
    "/run-jury",
    summary="Запустить LLM-жюри по FIGI и сохранить мнения в БД",
    description="Загружает инструмент и свечи из БД, вызывает всех провайдеров жюри, сохраняет мнения в llm_jury_opinions и агрегат в llm_jury_aggregates.",
)
async def run_jury_endpoint(
    body: RunJuryBody = RunJuryBody(),
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    figi_list = []
    if body.figi:
        figi_list.append(body.figi)
    if body.figi_list:
        figi_list.extend(body.figi_list)
    if not figi_list:
        raise AppError("BAD_REQUEST", message="Укажите figi или figi_list")

    providers = _default_jury_providers()
    if not providers:
        raise AppError(
            "SERVICE_UNAVAILABLE",
            message='Training package not installed. Install with: pip install -e ".[training]"',
        )

    results = []
    for figi in figi_list:
        stock = await container.market_service.get_stock(db_session, figi)
        if not stock:
            results.append({"figi": figi, "status": "error", "message": "instrument not found"})
            continue
        ticker = str(stock.get("ticker", figi))
        sector = str(stock.get("sector") or "—")
        candles, _ = await container.market_service.get_candles(
            db_session, figi=figi, offset=0, limit=30
        )
        if candles:
            parts = [f"close: {c.get('close')}" for c in candles[-5:]]
            context = f"Тикер {ticker}, сектор {sector}. Последние свечи: {', '.join(parts)}."
        else:
            context = f"Тикер {ticker}, сектор {sector}."
        try:
            summary = await run_jury_for_figi(
                db_session, figi=figi, ticker=ticker, context=context, providers=providers
            )
            if hasattr(container, "market_repository"):
                recommendation = _consensus_to_recommendation(float(summary["consensus"]))
                payload = {
                    "providers": summary.get("provider_payload") or {},
                    "consensus": float(summary["consensus"]),
                    "dispersion": float(summary["dispersion"]),
                    "confidenceAvg": float(summary["confidence_avg"]),
                    "requiredProvidersPresent": bool(summary.get("required_providers_present")),
                    "source": "llm_jury",
                }
                await container.market_repository.upsert_recommendation(
                    db_session,
                    figi=figi,
                    recommendation=recommendation,
                    confidence=Decimal(str(round(float(summary["confidence_avg"]), 4))),
                    score=Decimal(str(round(float(summary["consensus"]), 4))),
                    llm_jury_payload=payload,
                )
                await db_session.commit()
            results.append({"status": "ok", **summary})
        except Exception as e:
            results.append({"figi": figi, "status": "error", "message": str(e)})

    return {"status": "completed", "results": results}
