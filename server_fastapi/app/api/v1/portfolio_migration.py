"""
Миграция портфеля legacy → FastAPI (TRACEABILITY: Portfolio migration).

Полный перенос сценариев Node `portfolio-migrator` не входит в текущий релиз — контракт и статус зафиксированы API.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.schemas.envelope import SuccessEnvelope

router = APIRouter(prefix="/portfolio-migration", tags=["portfolio-migration"])


@router.get("/status", summary="Статус поддержки миграции портфеля")
async def portfolio_migration_status() -> SuccessEnvelope[dict]:
    return SuccessEnvelope(
        data={
            "implementationStatus": "deferred",
            "scope": "post_mvp",
            "message": (
                "Полная миграция счёта из legacy не портирована. "
                "Используйте синхронизацию реального портфеля через scheduler и GET /portfolio/real/db."
            ),
            "relatedEndpoints": [
                "/api/v1/portfolio",
                "/api/v1/portfolio/real/db",
                "POST /api/v1/portfolio/real/sync",
            ],
        }
    )


@router.post("/start", summary="Запуск миграции (зарезервировано)")
async def portfolio_migration_start() -> SuccessEnvelope[dict]:
    return SuccessEnvelope(
        data={
            "accepted": False,
            "implementationStatus": "not_implemented",
            "message": "Миграция не запускается — см. GET /portfolio-migration/status",
        }
    )
