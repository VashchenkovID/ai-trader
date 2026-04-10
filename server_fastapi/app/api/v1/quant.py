"""Quant API: матрица доходностей и оптимизация PyPortfolioOpt (REWRITE_CORE §3)."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

import pandas as pd

from app.api.deps import get_container
from app.core.config import get_settings
from app.core.errors import AppError
from app.db.session import get_db_session
from app.schemas.envelope import SuccessEnvelope
from app.services.container import AppContainer
from app.services.quant_artifact_service import load_returns_matrix_artifact

router = APIRouter(prefix="/quant", tags=["quant"])


class FigisRequest(BaseModel):
    figis: list[str] = Field(min_length=1, max_length=64)
    candle_limit_per_figi: int = Field(default=500, ge=10, le=5000)


class SingleFigiCandles(BaseModel):
    figi: str = Field(min_length=4, max_length=64)
    candle_limit: int = Field(default=200, ge=30, le=2000)


@router.post("/returns-matrix", summary="Матрица дневных доходностей по FIGI")
async def post_returns_matrix(
    body: FigisRequest,
    db_session: AsyncSession = Depends(get_db_session),
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    df = await container.market_returns_service.build_returns_matrix_for_figis(
        db_session,
        body.figis,
        candle_limit_per_figi=body.candle_limit_per_figi,
    )
    await db_session.commit()
    if df.empty:
        return SuccessEnvelope(
            data={"rows": 0, "columns": [], "message": "Нет пересекающихся свечей по FIGI"}
        )
    sample = []
    for idx, row in df.head(5).iterrows():
        sample.append({"date": str(idx), **{str(k): float(v) for k, v in row.items()}})
    return SuccessEnvelope(
        data={
            "rows": len(df),
            "columns": [str(c) for c in df.columns],
            "indexStart": str(df.index.min()),
            "indexEnd": str(df.index.max()),
            "sample": sample,
        }
    )


@router.get("/returns-matrix-artifact", summary="Ночной артефакт матрицы (DATA_CONTRACT)")
async def get_returns_matrix_artifact() -> SuccessEnvelope[dict]:
    """Читает `data/quant/returns_matrix_latest.json` без пересчёта (потребитель §5)."""
    loaded = load_returns_matrix_artifact()
    if not loaded["ok"]:
        return SuccessEnvelope(
            data={
                "ok": False,
                "path": loaded["path"],
                "error": loaded["error"],
                "summary": None,
            }
        )
    payload = loaded["payload"] or {}
    # Не отдаём полную матрицу в GET (может быть большой) — только сводка + shape.
    matrix = payload.get("matrix") if isinstance(payload.get("matrix"), dict) else {}
    return SuccessEnvelope(
        data={
            "ok": True,
            "path": loaded["path"],
            "error": None,
            "summary": loaded.get("summary"),
            "lastRunAt": payload.get("lastRunAt"),
            "figis": payload.get("figis"),
            "shape": payload.get("shape"),
            "matrixColumns": (matrix.get("columns") or [])[:64],
            "matrixIndexStart": (matrix.get("index") or [None])[0],
            "matrixIndexEnd": (matrix.get("index") or [None])[-1],
            "dataContract": payload.get("dataContract"),
        }
    )


@router.post("/optimize-max-sharpe", summary="Веса max Sharpe (PyPortfolioOpt)")
async def post_optimize_max_sharpe(
    body: FigisRequest,
    db_session: AsyncSession = Depends(get_db_session),
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    if not container.risk_optimization_service.is_available():
        raise AppError(
            "SERVICE_UNAVAILABLE",
            message="Установите optional-зависимость quant: PyPortfolioOpt",
        )
    df = await container.market_returns_service.build_returns_matrix_for_figis(
        db_session,
        body.figis,
        candle_limit_per_figi=body.candle_limit_per_figi,
    )
    await db_session.commit()
    if df.empty or len(df.columns) < 2:
        return SuccessEnvelope(
            data={"ok": False, "error": "Недостаточно данных для оптимизации", "weights": {}}
        )
    result = container.risk_optimization_service.max_sharpe_weights(df)
    artifact = load_returns_matrix_artifact()
    merged = dict(result) if isinstance(result, dict) else {"result": result}
    merged["returnsMatrixArtifact"] = {
        "ok": artifact.get("ok"),
        "summary": artifact.get("summary"),
        "path": artifact.get("path"),
    }
    return SuccessEnvelope(data=merged)


@router.post("/indicators-preview", summary="RSI / Bollinger width по свечам из БД (§2, feature-flag)")
async def post_indicators_preview(
    body: SingleFigiCandles,
    db_session: AsyncSession = Depends(get_db_session),
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    if not get_settings().indicators_api_enabled:
        raise AppError("FORBIDDEN", message="INDICATORS_API_ENABLED=false")
    rows = await container.market_repository.get_candles_by_figi(
        db_session, figi=body.figi.strip(), offset=0, limit=body.candle_limit
    )
    await db_session.commit()
    if len(rows) < 20:
        return SuccessEnvelope(
            data={"ok": False, "figi": body.figi, "message": "insufficient_candles", "n": len(rows)}
        )
    chrono = list(reversed(rows))
    close = pd.Series([float(r.close) for r in chrono])
    from training.features.basic_ta import bollinger_width, simple_rsi

    rsi = simple_rsi(close, period=14)
    bw = bollinger_width(close, window=20)
    last_i = len(rsi) - 1
    return SuccessEnvelope(
        data={
            "ok": True,
            "figi": body.figi,
            "n": len(close),
            "rsi14Last": float(rsi.iloc[last_i]) if last_i >= 0 else None,
            "bollingerWidth20Last": float(bw.iloc[last_i]) if last_i >= 0 else None,
        }
    )
