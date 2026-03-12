from dataclasses import dataclass
from http import HTTPStatus
from typing import Any


@dataclass(frozen=True)
class ErrorCode:
    code: str
    message: str
    status_code: int


ERROR_CODES: dict[str, ErrorCode] = {
    "BAD_REQUEST": ErrorCode("BAD_REQUEST", "Validation or input error", HTTPStatus.BAD_REQUEST),
    "UNAUTHORIZED": ErrorCode("UNAUTHORIZED", "Authentication required", HTTPStatus.UNAUTHORIZED),
    "FORBIDDEN": ErrorCode("FORBIDDEN", "Action is forbidden", HTTPStatus.FORBIDDEN),
    "NOT_FOUND": ErrorCode("NOT_FOUND", "Requested resource was not found", HTTPStatus.NOT_FOUND),
    "CONFLICT": ErrorCode("CONFLICT", "Conflict with current state", HTTPStatus.CONFLICT),
    "BUSINESS_RULE_VIOLATION": ErrorCode(
        "BUSINESS_RULE_VIOLATION",
        "Business rule validation failed",
        HTTPStatus.UNPROCESSABLE_ENTITY,
    ),
    "RATE_LIMITED": ErrorCode("RATE_LIMITED", "Too many requests", HTTPStatus.TOO_MANY_REQUESTS),
    "SERVICE_UNAVAILABLE": ErrorCode(
        "SERVICE_UNAVAILABLE", "Dependency is unavailable", HTTPStatus.SERVICE_UNAVAILABLE
    ),
    "INTERNAL_ERROR": ErrorCode(
        "INTERNAL_ERROR", "Internal server error", HTTPStatus.INTERNAL_SERVER_ERROR
    ),
    "INSUFFICIENT_STRATEGY_BUDGET": ErrorCode(
        "INSUFFICIENT_STRATEGY_BUDGET",
        "Insufficient strategy budget",
        HTTPStatus.UNPROCESSABLE_ENTITY,
    ),
    "AUTO_EXECUTION_FORBIDDEN_NON_PAPER": ErrorCode(
        "AUTO_EXECUTION_FORBIDDEN_NON_PAPER",
        "Auto execution is forbidden for non-paper mode",
        HTTPStatus.UNPROCESSABLE_ENTITY,
    ),
    "TRADING_REQUEST_NOT_FOUND": ErrorCode(
        "TRADING_REQUEST_NOT_FOUND",
        "Trading request not found",
        HTTPStatus.NOT_FOUND,
    ),
    "INVALID_STATE_TRANSITION": ErrorCode(
        "INVALID_STATE_TRANSITION",
        "Invalid state transition",
        HTTPStatus.CONFLICT,
    ),
    "RECOMMENDATION_NOT_FOUND": ErrorCode(
        "RECOMMENDATION_NOT_FOUND",
        "Recommendation not found",
        HTTPStatus.NOT_FOUND,
    ),
}


class AppError(Exception):
    def __init__(
        self,
        error_code: str,
        *,
        message: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        mapped = ERROR_CODES.get(error_code, ERROR_CODES["INTERNAL_ERROR"])
        self.error_code = mapped.code
        self.status_code = mapped.status_code
        self.message = message or mapped.message
        self.details = details or {}
        super().__init__(self.message)
