from fastapi import APIRouter

from app.api.v1.auth import router as auth_v1_router
from app.api.v1.health import router as health_v1_router
from app.api.v1.market import router as market_v1_router
from app.api.v1.monitoring import router as monitoring_v1_router
from app.api.v1.news import router as news_v1_router
from app.api.v1.performance import router as performance_v1_router
from app.api.v1.profitability import router as profitability_v1_router
from app.api.v1.settings import router as settings_v1_router
from app.api.v1.system import router as system_v1_router
from app.api.v1.auto_paper import router as auto_paper_v1_router
from app.api.v1.recommendation_pipeline import router as recommendation_pipeline_v1_router
from app.api.v1.preflight import router as preflight_v1_router
from app.api.v1.risk import router as risk_v1_router
from app.api.v1.trading_mode import router as trading_mode_v1_router
from app.api.v1.trading_requests import router as trading_requests_v1_router
from app.api.v1.training import router as training_v1_router
from app.api.v1.portfolio import router as portfolio_v1_router
from app.api.v1.telegram import router as telegram_v1_router
from app.api.v1.tinkoff import router as tinkoff_v1_router

api_router = APIRouter()

v1_routers = [
    health_v1_router,
    auth_v1_router,
    settings_v1_router,
    system_v1_router,
    monitoring_v1_router,
    market_v1_router,
    news_v1_router,
    performance_v1_router,
    profitability_v1_router,
    trading_requests_v1_router,
    portfolio_v1_router,
    telegram_v1_router,
    tinkoff_v1_router,
    trading_mode_v1_router,
    auto_paper_v1_router,
    recommendation_pipeline_v1_router,
    risk_v1_router,
    preflight_v1_router,
    training_v1_router,
]

for router in v1_routers:
    api_router.include_router(router, prefix="/v1")
