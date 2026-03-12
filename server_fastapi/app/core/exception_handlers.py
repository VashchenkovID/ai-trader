import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.error_registry import get_error_registry
from app.core.errors import AppError
from app.schemas.envelope import ErrorBody, ErrorEnvelope

logger = logging.getLogger(__name__)


def _error_response(
    *,
    status_code: int,
    code: str,
    message: str,
    details: dict[str, Any] | None,
    trace_id: str | None,
) -> JSONResponse:
    body = ErrorEnvelope(
        error=ErrorBody(code=code, message=message, details=details or {}, traceId=trace_id)
    )
    return JSONResponse(status_code=status_code, content=body.model_dump())


def register_exception_handlers(app: FastAPI) -> None:
    async def _safe_record(**kwargs: Any) -> None:
        try:
            await get_error_registry().record(**kwargs)
        except Exception as exc:
            logger.warning("failed to persist error registry entry: %s", exc)

    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        trace_id = getattr(request.state, "trace_id", None)
        await _safe_record(
            error_key=f"app:{exc.error_code}",
            error_message_sample=exc.message,
            source=f"http:{request.method} {request.url.path}",
            trace_id=trace_id,
        )
        return _error_response(
            status_code=exc.status_code,
            code=exc.error_code,
            message=exc.message,
            details=exc.details,
            trace_id=trace_id,
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        trace_id = getattr(request.state, "trace_id", None)
        await _safe_record(
            error_key="http:BAD_REQUEST:validation",
            error_message_sample=str(exc),
            source=f"http:{request.method} {request.url.path}",
            trace_id=trace_id,
        )
        return _error_response(
            status_code=400,
            code="BAD_REQUEST",
            message="Validation or input error",
            details={"errors": exc.errors()},
            trace_id=trace_id,
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        trace_id = getattr(request.state, "trace_id", None)
        await _safe_record(
            error_key=f"http:INTERNAL_ERROR:{exc.__class__.__name__}",
            error_message_sample=str(exc),
            source=f"http:{request.method} {request.url.path}",
            trace_id=trace_id,
        )
        return _error_response(
            status_code=500,
            code="INTERNAL_ERROR",
            message="Internal server error",
            details={"type": exc.__class__.__name__},
            trace_id=trace_id,
        )
