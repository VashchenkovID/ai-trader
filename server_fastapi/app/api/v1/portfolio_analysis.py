"""Анализ открытых позиций по портфелю (scope): вердикт BUY/SELL/HOLD с учётом цены закупки."""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_container
from app.core.errors import AppError
from app.core.portfolio_scope import canonical_portfolio_scope, is_valid_portfolio_scope
from app.db.session import get_db_session
from app.scheduler import trigger_named_job
from app.schemas.envelope import SuccessEnvelope
from app.services.container import AppContainer

router = APIRouter(prefix="/portfolio-analysis", tags=["portfolio-analysis"])


class VerdictRequest(BaseModel):
    portfolio_scope: str = Field(
        ...,
        min_length=3,
        max_length=48,
        description="real или virtual:{conservative|moderate|aggressive|experimental}",
    )
    figis: list[str] | None = Field(default=None, description="Опционально ограничить список FIGI")


class PortfolioManualApplyBody(BaseModel):
    """Ручной импорт ответа внешней нейросети по позициям портфеля (тот же промпт, один сырой ответ)."""

    portfolio_scope: str = Field(..., min_length=3, max_length=48)
    figi: list[str] = Field(..., min_length=1, description="FIGI в том же порядке, что вернул GET manual/prompt")
    external_raw: str = Field(..., min_length=1, description="Сырой текст ответа (JSON с instruments[])")


@router.get(
    "/manual/prompt",
    summary="Промпт для ручного копирования во внешнюю нейросеть (вердикт по позициям портфеля)",
    description="Возвращает текст промпта и список FIGI. Порядок FIGI важен для POST manual/apply.",
)
async def get_manual_prompt(
    portfolio_scope: str = Query(..., description="real или virtual:moderate и т.д."),
    figi: list[str] = Query(default=[], description="Опционально: только эти FIGI, в заданном порядке"),
    db_session: AsyncSession = Depends(get_db_session),
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    if not is_valid_portfolio_scope(portfolio_scope):
        raise AppError("BAD_REQUEST", message="Некорректный portfolio_scope")
    scope = canonical_portfolio_scope(portfolio_scope)
    flt = figi if figi else None
    data = await container.portfolio_position_analysis_service.get_manual_prompt_bundle(
        db_session,
        portfolio_scope=scope,
        figi_filter=flt,
    )
    await db_session.commit()
    return SuccessEnvelope(data=data)


@router.post(
    "/manual/apply",
    summary="Применить сырой ответ внешней нейросети по позициям портфеля",
    description="Парсит JSON (instruments[]), сохраняет строки в portfolio_position_recommendations.",
)
async def post_manual_apply(
    body: PortfolioManualApplyBody,
    db_session: AsyncSession = Depends(get_db_session),
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    if not is_valid_portfolio_scope(body.portfolio_scope):
        raise AppError("BAD_REQUEST", message="Некорректный portfolio_scope")
    scope = canonical_portfolio_scope(body.portfolio_scope)
    data = await container.portfolio_position_analysis_service.apply_manual_external_verdict(
        db_session,
        portfolio_scope=scope,
        figis=body.figi,
        external_raw=body.external_raw,
    )
    if (
        container.settings.ppr_auto_pipeline_enabled
        and int(data.get("saved") or 0) > 0
    ):
        ppr_pipe = await container.portfolio_position_pipeline_service.run_for_scope(
            db_session,
            portfolio_scope=scope,
            mode="paper",
            limit=50,
        )
        data = {**data, "pprPipeline": ppr_pipe}
    await db_session.commit()
    return SuccessEnvelope(data=data)


@router.post("/verdict", summary="Вердикт BUY/SELL/HOLD по позициям портфеля (LLM или fallback)")
async def post_verdict(
    body: VerdictRequest,
    db_session: AsyncSession = Depends(get_db_session),
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    if not is_valid_portfolio_scope(body.portfolio_scope):
        raise AppError(
            "BAD_REQUEST",
            message="Некорректный portfolio_scope: ожидается real или virtual:{conservative|moderate|aggressive|experimental}",
        )
    scope = canonical_portfolio_scope(body.portfolio_scope)
    data = await container.portfolio_position_analysis_service.run_verdict(
        db_session,
        portfolio_scope=scope,
        figi_filter=body.figis,
        persist=True,
    )
    if (
        container.settings.ppr_auto_pipeline_enabled
        and int(data.get("saved") or 0) > 0
    ):
        ppr_pipe = await container.portfolio_position_pipeline_service.run_for_scope(
            db_session,
            portfolio_scope=scope,
            mode="paper",
            limit=50,
        )
        data = {**data, "pprPipeline": ppr_pipe}
    await db_session.commit()
    return SuccessEnvelope(data=data)


@router.post("/run", summary="Фоновый прогон анализа по всем портфелям (real + виртуальные)")
async def post_run() -> SuccessEnvelope[dict]:
    return SuccessEnvelope(data=trigger_named_job("analysis_portfolio_positions", source="manual"))


@router.post(
    "/pipeline-run",
    summary="Пайплайн заявок из последних PPR по scope (как recommendation-pipeline для портфеля)",
)
async def post_pipeline_run(
    portfolio_scope: str = Query(..., description="real или virtual:moderate и т.д."),
    mode: str = Query(default="paper", description="Режим торговли"),
    minConfidence: float | None = Query(default=None, description="Мин. final_confidence (0–1)"),
    minScore: float | None = Query(default=None, description="Мин. score для гейта (0–1)"),
    limit: int = Query(default=50, ge=1, le=200),
    db_session: AsyncSession = Depends(get_db_session),
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    if not is_valid_portfolio_scope(portfolio_scope):
        raise AppError("BAD_REQUEST", message="Некорректный portfolio_scope")
    scope = canonical_portfolio_scope(portfolio_scope)
    min_conf = Decimal(str(minConfidence)) if minConfidence is not None else None
    min_scr = Decimal(str(minScore)) if minScore is not None else None
    data = await container.portfolio_position_pipeline_service.run_for_scope(
        db_session,
        portfolio_scope=scope,
        mode=mode,
        min_confidence=min_conf,
        min_score=min_scr,
        limit=limit,
    )
    if data.get("error") != "failed_to_fetch":
        await db_session.commit()
    return SuccessEnvelope(data=data)


@router.get("/latest", summary="Последние сохранённые вердикты по FIGI (в пределах scope)")
async def get_latest(
    portfolio_scope: str = Query(..., description="real или virtual:moderate и т.д."),
    limit: int = Query(default=100, ge=1, le=500),
    db_session: AsyncSession = Depends(get_db_session),
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    if not is_valid_portfolio_scope(portfolio_scope):
        raise AppError("BAD_REQUEST", message="Некорректный portfolio_scope")
    data = await container.portfolio_position_analysis_service.list_latest_items(
        db_session,
        portfolio_scope,
        limit=limit,
    )
    await db_session.commit()
    return SuccessEnvelope(data=data)


@router.get("/positions", summary="Текущие позиции scope + последний сохранённый вердикт")
async def get_positions(
    portfolio_scope: str = Query(...),
    db_session: AsyncSession = Depends(get_db_session),
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    if not is_valid_portfolio_scope(portfolio_scope):
        raise AppError("BAD_REQUEST", message="Некорректный portfolio_scope")
    data = await container.portfolio_position_analysis_service.positions_with_latest_verdicts(
        db_session,
        portfolio_scope,
    )
    await db_session.commit()
    return SuccessEnvelope(data=data)
