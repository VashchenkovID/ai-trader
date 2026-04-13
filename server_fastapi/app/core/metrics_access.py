"""Ограничение доступа к корневому эндпоинту /metrics (см. docs/SECURITY_PLAN.md)."""

from fastapi import HTTPException, Request, status

from app.core.config import get_settings


def check_root_metrics_access(request: Request) -> None:
    settings = get_settings()
    if not settings.expose_root_metrics:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    token = settings.metrics_auth_token
    if not token:
        return
    provided = request.headers.get("x-metrics-token") or ""
    auth = request.headers.get("authorization") or ""
    if auth.lower().startswith("bearer "):
        provided = auth[7:].strip() or provided
    if provided != token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
