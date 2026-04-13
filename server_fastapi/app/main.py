from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.router import api_router
from app.bootstrap import ensure_bootstrap
from app.core.config import get_settings
from app.core.exception_handlers import register_exception_handlers
from app.core.logging import configure_logging
from app.core.metrics import MetricsRegistry
from app.core.metrics_access import check_root_metrics_access
from app.core.middleware import register_middlewares
from app.core.time_utils import now_msk
from app.schemas.envelope import SuccessEnvelope
from app.schemas.health import HealthDTO
from app.services.container import AppContainer, build_container
from app.scheduler import start_app_scheduler, shutdown_app_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    container: AppContainer = app.state.container
    await ensure_bootstrap(container)
    start_app_scheduler(container, settings)
    try:
        yield
    finally:
        shutdown_app_scheduler()


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level, settings.runtime_error_log_path)

    app = FastAPI(
        title="AI Trader API",
        description="Русскоязычная документация API сервиса AI Trader на FastAPI.",
        version="1.0.0",
        lifespan=lifespan,
    )

    trusted = [h.strip() for h in settings.trusted_hosts.split(",") if h.strip()]
    if trusted:
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=trusted)

    allowed_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    if settings.frontend_url:
        # FRONTEND_URL supports comma-separated values
        env_origins = [origin.strip() for origin in settings.frontend_url.split(",") if origin.strip()]
        allowed_origins = list(dict.fromkeys([*allowed_origins, *env_origins]))

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.state.container = build_container()
    app.state.metrics_registry = MetricsRegistry()
    register_middlewares(app, app.state.metrics_registry)
    register_exception_handlers(app)

    @app.get(
        "/health",
        tags=["health"],
        summary="Проверка доступности сервиса (корень приложения)",
        description="Для балансировщиков и k8s probe. Версионированный аналог: GET /api/v1/health.",
    )
    async def health() -> SuccessEnvelope[HealthDTO]:
        health_dto = HealthDTO(
            status="ok",
            service=settings.app_name,
            timestamp=now_msk(),
        )
        return SuccessEnvelope(data=health_dto)

    app.include_router(api_router, prefix="/api")

    @app.get("/metrics", tags=["observability"], summary="Снимок метрик приложения")
    async def metrics(_access: None = Depends(check_root_metrics_access)) -> SuccessEnvelope[dict[str, object]]:
        return SuccessEnvelope(data={"routes": app.state.metrics_registry.snapshot()})

    return app


def get_container(app: FastAPI) -> AppContainer:
    return app.state.container


app = create_app()
