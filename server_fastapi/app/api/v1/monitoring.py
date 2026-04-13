from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, Request

from app.api.deps import get_container
from app.core.config import get_settings
from app.core.time_utils import iso_now_msk, now_msk
from app.schemas.envelope import SuccessEnvelope
from app.services.container import AppContainer
from app.services.quant_artifact_service import load_returns_matrix_artifact

router = APIRouter(prefix="/monitoring", tags=["monitoring"])


def _default_alerts() -> list[dict[str, object]]:
    return [
        {
            "id": "bootstrap-alert",
            "category": "system",
            "severity": "low",
            "resolved": False,
            "message": "Monitoring bootstrap alert",
            "timestamp": iso_now_msk(),
        }
    ]


def _build_slo_alerts(routes: dict[str, dict[str, float | int]]) -> list[dict[str, object]]:
    min_samples = get_settings().slo_alert_min_samples
    alerts: list[dict[str, object]] = []
    for route, metric in routes.items():
        count = int(metric.get("count", 0))
        if count < min_samples:
            continue
        server_rate = float(metric.get("serverErrorRate", 0))
        p95 = float(metric.get("p95LatencyMs", 0))
        if server_rate >= 0.05:
            alerts.append(
                {
                    "id": f"error-rate:{route}",
                    "category": "availability",
                    "severity": "critical",
                    "resolved": False,
                    "message": f"Sustained server error rate on {route}",
                    "metric": {"serverErrorRate": server_rate},
                    "timestamp": iso_now_msk(),
                }
            )
        if p95 >= 1000:
            alerts.append(
                {
                    "id": f"latency:{route}",
                    "category": "latency",
                    "severity": "high",
                    "resolved": False,
                    "message": f"P95 latency budget exceeded on {route}",
                    "metric": {"p95LatencyMs": p95},
                    "timestamp": iso_now_msk(),
                }
            )
    return alerts


def _returns_matrix_freshness() -> dict[str, object]:
    loaded = load_returns_matrix_artifact()
    if not loaded.get("ok"):
        return {"ok": False, "error": loaded.get("error", "artifact_unavailable")}
    summary = loaded.get("summary") if isinstance(loaded.get("summary"), dict) else {}
    last_run = summary.get("lastRunAt")
    age_hours: float | None = None
    if isinstance(last_run, str) and last_run.strip():
        try:
            dt = datetime.fromisoformat(last_run.replace("Z", "+00:00"))
            age_hours = round((datetime.now(timezone.utc) - dt).total_seconds() / 3600.0, 3)
        except ValueError:
            age_hours = None
    return {
        "ok": True,
        "lastRunAt": last_run,
        "ageHours": age_hours,
        "figiCount": summary.get("figiCount"),
        "rows": summary.get("rows"),
        "cols": summary.get("cols"),
    }


@router.get("/metrics", summary="Маршрутные метрики мониторинга")
async def monitoring_metrics(
    request: Request,
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict[str, object]]:
    routes = request.app.state.metrics_registry.snapshot()
    settings = get_settings()
    broker = {
        "tokenConfigured": bool(settings.tinkoff_token),
        "schedulerEnabled": settings.tinkoff_scheduler_enabled,
        "grpcReadPath": settings.tinkoff_use_grpc,
        "clientReady": container.tinkoff_client is not None,
    }
    quant_returns_matrix = _returns_matrix_freshness()
    return SuccessEnvelope(
        data={
            "routes": routes,
            "summary": {
                "requestCount": sum(int(item["count"]) for item in routes.values()) if routes else 0,
                "errorCount": sum(int(item["errorCount"]) for item in routes.values()) if routes else 0,
                "serverErrorCount": sum(int(item.get("serverErrorCount", 0)) for item in routes.values())
                if routes
                else 0,
                "broker": broker,
                "quantReturnsMatrix": quant_returns_matrix,
            },
            "timestamp": now_msk(),
        }
    )


@router.get("/alerts", summary="Список активных алертов")
async def monitoring_alerts(
    request: Request,
    category: str | None = Query(default=None),
    severity: str | None = Query(default=None),
    resolved: bool | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=1000),
) -> SuccessEnvelope[dict[str, object]]:
    routes = request.app.state.metrics_registry.snapshot()
    alerts = _default_alerts() + _build_slo_alerts(routes)
    if category is not None:
        alerts = [a for a in alerts if a["category"] == category]
    if severity is not None:
        alerts = [a for a in alerts if a["severity"] == severity]
    if resolved is not None:
        alerts = [a for a in alerts if a["resolved"] is resolved]
    alerts = alerts[:limit]
    return SuccessEnvelope(data={"items": alerts, "count": len(alerts)})


@router.post("/alerts/{alert_id}/resolve", summary="Пометить алерт как решенный")
async def resolve_alert(alert_id: str) -> SuccessEnvelope[dict[str, object]]:
    return SuccessEnvelope(
        data={
            "id": alert_id,
            "resolved": True,
            "resolvedAt": now_msk(),
        }
    )


@router.get("/performance", summary="Агрегированные метрики производительности")
async def monitoring_performance(request: Request) -> SuccessEnvelope[dict[str, object]]:
    routes = request.app.state.metrics_registry.snapshot()
    aggregate_count = sum(int(item["count"]) for item in routes.values()) if routes else 0
    aggregate_errors = sum(int(item["errorCount"]) for item in routes.values()) if routes else 0
    aggregate_server = sum(int(item.get("serverErrorCount", 0)) for item in routes.values()) if routes else 0
    return SuccessEnvelope(
        data={
            "responseTime": 0,
            "throughput": aggregate_count,
            "errorRate": 0 if aggregate_count == 0 else round(aggregate_errors / aggregate_count, 4),
            "serverErrorRate": 0 if aggregate_count == 0 else round(aggregate_server / aggregate_count, 4),
            "cacheHitRate": 0,
        }
    )


@router.get("/health", summary="Проверка состояния мониторинга")
async def monitoring_health() -> SuccessEnvelope[dict[str, object]]:
    return SuccessEnvelope(
        data={
            "status": "healthy",
            "timestamp": now_msk(),
        }
    )


@router.get("/report", summary="Сводный отчет мониторинга")
async def monitoring_report(request: Request) -> SuccessEnvelope[dict[str, object]]:
    routes = request.app.state.metrics_registry.snapshot()
    alerts = _default_alerts() + _build_slo_alerts(routes)
    return SuccessEnvelope(
        data={
            "metrics": {"routes": routes},
            "performance": {"routeCount": len(routes)},
            "health": {"status": "healthy"},
            "recentAlerts": alerts,
            "timestamp": now_msk(),
        }
    )


@router.post("/reset", summary="Сброс собранных метрик")
async def monitoring_reset(request: Request) -> SuccessEnvelope[dict[str, str]]:
    request.app.state.metrics_registry.reset()
    return SuccessEnvelope(data={"message": "Metrics reset successfully"})
