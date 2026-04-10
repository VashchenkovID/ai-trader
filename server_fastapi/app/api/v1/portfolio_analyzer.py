"""Текстовый анализатор портфелей (REWRITE_CORE §12)."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_container
from app.core.errors import AppError
from app.db.models import PortfolioAnalyzerReport
from app.db.session import get_db_session
from app.schemas.envelope import SuccessEnvelope
from app.services.container import AppContainer

router = APIRouter(prefix="/portfolio-analyzer", tags=["portfolio-analyzer"])


class AnalyzeRequest(BaseModel):
    query: str = Field(min_length=1, max_length=4000)


@router.post("/analyze", summary="Сгенерировать отчёт по виртуальным портфелям")
async def post_analyze(
    body: AnalyzeRequest,
    db_session: AsyncSession = Depends(get_db_session),
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    profiles = await container.virtual_portfolio_service.list_all_profiles_payload(db_session)
    rid, text = await container.portfolio_analyzer_service.generate_report(
        db_session,
        user_query=body.query,
        profiles=profiles,
    )
    await db_session.commit()
    return SuccessEnvelope(data={"reportId": rid, "text": text})


@router.get("/reports", summary="Последние отчёты")
async def list_reports(
    limit: int = 20,
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict]:
    stmt = select(PortfolioAnalyzerReport).order_by(PortfolioAnalyzerReport.created_at.desc()).limit(limit)
    rows = list((await db_session.scalars(stmt)).all())
    items = [
        {
            "id": str(r.id),
            "createdAt": r.created_at,
            "queryPreview": (r.user_query[:120] + "…") if len(r.user_query) > 120 else r.user_query,
        }
        for r in rows
    ]
    return SuccessEnvelope(data={"items": items})


@router.get("/reports/{report_id}", summary="Текст отчёта по id")
async def get_report(
    report_id: str,
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict]:
    from uuid import UUID

    try:
        uid = UUID(report_id)
    except ValueError as e:
        raise AppError("BAD_REQUEST", message="Некорректный id") from e
    row = await db_session.get(PortfolioAnalyzerReport, uid)
    if row is None:
        raise AppError("NOT_FOUND", message="Отчёт не найден")
    return SuccessEnvelope(
        data={
            "id": str(row.id),
            "userQuery": row.user_query,
            "text": row.text_report,
            "profilesPayload": row.profiles_payload,
            "createdAt": row.created_at,
        }
    )
