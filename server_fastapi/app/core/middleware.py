import logging
import uuid
from collections import defaultdict, deque
from collections.abc import Awaitable, Callable
from time import monotonic

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.metrics import MetricsRegistry
from app.schemas.envelope import ErrorBody, ErrorEnvelope

logger = logging.getLogger("http")

REQUEST_ID_HEADER = "X-Request-Id"
TRACE_ID_HEADER = "X-Trace-Id"


def _get_or_create_header(request: Request, header_name: str) -> str:
    return request.headers.get(header_name) or str(uuid.uuid4())


_RATE_LIMIT_PATH_ALLOWLIST: frozenset[str] = frozenset(
    {
        "/health",
        "/api/v1/health",
        "/api/v1/monitoring/health",
    }
)


def register_middlewares(app: FastAPI, metrics_registry: MetricsRegistry) -> None:
    rate_history: dict[str, deque[float]] = defaultdict(deque)

    @app.middleware("http")
    async def request_context_middleware(
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        request_id = _get_or_create_header(request, REQUEST_ID_HEADER)
        trace_id = _get_or_create_header(request, TRACE_ID_HEADER)
        request.state.request_id = request_id
        request.state.trace_id = trace_id

        settings = get_settings()
        if not settings.disable_rate_limit and request.url.path not in _RATE_LIMIT_PATH_ALLOWLIST:
            window = float(settings.rate_limit_window_seconds)
            cap = int(settings.rate_limit_max)
            if cap > 0 and window > 0:
                ip = request.client.host if request.client else "unknown"
                now = monotonic()
                bucket = rate_history[ip]
                while bucket and now - bucket[0] > window:
                    bucket.popleft()
                if len(bucket) >= cap:
                    body = ErrorEnvelope(
                        error=ErrorBody(
                            code="RATE_LIMITED",
                            message="Too many requests",
                            details={"windowSeconds": window, "maxRequests": cap},
                            traceId=trace_id,
                        )
                    )
                    response = JSONResponse(status_code=429, content=body.model_dump())
                    response.headers[REQUEST_ID_HEADER] = request_id
                    response.headers[TRACE_ID_HEADER] = trace_id
                    return response
                bucket.append(now)

        ops_service = getattr(request.app.state.container, "ops_service", None)
        if ops_service:
            ops_decision = ops_service.evaluate_request(
                request_id=request_id, method=request.method, path=request.url.path
            )
            request.state.ops_mode = ops_decision["mode"]
            if not ops_decision["writeAllowed"]:
                body = ErrorEnvelope(
                    error=ErrorBody(
                        code="SERVICE_UNAVAILABLE",
                        message="Write operations are temporarily disabled by cutover policy",
                        details={"mode": ops_decision["mode"], "path": request.url.path},
                        traceId=trace_id,
                    )
                )
                response = JSONResponse(status_code=503, content=body.model_dump())
                response.headers[REQUEST_ID_HEADER] = request_id
                response.headers[TRACE_ID_HEADER] = trace_id
                response.headers["X-Ops-Mode"] = str(ops_decision["mode"])
                response.headers["X-Canary-Selected"] = str(
                    bool(ops_decision.get("canarySelected", False))
                ).lower()
                return response

        started_at = metrics_registry.start_timer()
        response = await call_next(request)
        response.headers[REQUEST_ID_HEADER] = request_id
        response.headers[TRACE_ID_HEADER] = trace_id
        if ops_service:
            response.headers["X-Ops-Mode"] = str(getattr(request.state, "ops_mode", "normal"))

        route = request.scope.get("route")
        if route is None:
            route_key = f"{request.method} <unmatched>"
        else:
            route_path = getattr(route, "path", request.url.path)
            route_key = f"{request.method} {route_path}"
        metrics_registry.observe(route_key, started_at=started_at, status_code=response.status_code)

        logger.info(
            "request handled",
            extra={
                "operation": route_key,
                "request_id": request_id,
                "trace_id": trace_id,
                "status_code": response.status_code,
            },
        )
        return response
