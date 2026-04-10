"""Бэктест SMA (backtesting.py), сохранение результата в БД."""

from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_container
from app.core.errors import AppError
from app.db.models import BacktestRun
from app.db.session import get_db_session
from app.schemas.envelope import SuccessEnvelope
from app.services.container import AppContainer

router = APIRouter(prefix="/backtesting", tags=["backtesting"])


class SmaBacktestRequest(BaseModel):
    figi: str = Field(min_length=4, max_length=64)
    candle_limit: int = Field(default=500, ge=30, le=5000)
    sma_period: int = Field(default=20, ge=5, le=200)
    cash: float = Field(default=100_000.0, gt=0)
    commission: float = Field(default=0.001, ge=0, le=0.1)


@router.post("/sma", summary="Бэктест SMA-кросс по FIGI")
async def post_sma_backtest(
    body: SmaBacktestRequest,
    db_session: AsyncSession = Depends(get_db_session),
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    if not container.backtesting_service.is_available():
        raise AppError(
            "SERVICE_UNAVAILABLE",
            message="Установите optional-зависимость quant: Backtesting",
        )
    import pandas as pd

    candles = await container.market_repository.get_candles_by_figi(
        db_session,
        figi=body.figi,
        offset=0,
        limit=body.candle_limit,
    )
    if not candles:
        raise AppError("NOT_FOUND", message="Нет свечей по FIGI")
    rows = []
    for c in candles:
        rows.append(
            {
                "time": c.candle_time,
                "open": float(c.open),
                "high": float(c.high),
                "low": float(c.low),
                "close": float(c.close),
                "volume": int(c.volume or 0),
            }
        )
    df = pd.DataFrame(rows)
    df = df.set_index(pd.to_datetime(df["time"])).sort_index()
    result = container.backtesting_service.run_sma_backtest(
        df,
        cash=body.cash,
        commission=body.commission,
        sma_period=body.sma_period,
    )
    params = dict(result.get("params") or {})
    params["figi"] = body.figi
    params["candle_limit"] = body.candle_limit
    br = BacktestRun(
        universe_key=body.figi,
        strategy="sma_cross",
        params=params,
        stats=result.get("stats") if isinstance(result.get("stats"), dict) else {"raw": result.get("stats")},
    )
    db_session.add(br)
    await db_session.flush()
    await db_session.commit()
    return SuccessEnvelope(
        data={
            "backtestId": str(br.id),
            "result": result,
        }
    )


@router.get("/runs/{run_id}", summary="Сохранённый бэктест по id")
async def get_backtest_run(
    run_id: UUID,
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict]:
    from sqlalchemy import select

    row = await db_session.scalar(select(BacktestRun).where(BacktestRun.id == run_id).limit(1))
    if row is None:
        raise AppError("NOT_FOUND", message="Бэктест не найден")
    return SuccessEnvelope(
        data={
            "id": str(row.id),
            "universeKey": row.universe_key,
            "strategy": row.strategy,
            "params": row.params,
            "stats": row.stats,
            "createdAt": row.created_at,
        }
    )
