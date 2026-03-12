from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class ErrorBody(BaseModel):
    code: str = Field(..., description="Обязательное поле: машинный код ошибки")
    message: str = Field(..., description="Обязательное поле: человекочитаемое описание")
    details: dict[str, Any] = Field(default_factory=dict, description="Необязательное поле: дополнительные детали")
    traceId: str | None = Field(default=None, description="Необязательное поле: идентификатор трассировки")


class SuccessEnvelope(BaseModel, Generic[T]):
    success: bool = Field(default=True, description="Флаг успешного ответа")
    data: T = Field(..., description="Обязательное поле: полезная нагрузка ответа")


class ErrorEnvelope(BaseModel):
    success: bool = Field(default=False, description="Флаг ошибочного ответа")
    error: ErrorBody = Field(..., description="Обязательное поле: тело ошибки")
