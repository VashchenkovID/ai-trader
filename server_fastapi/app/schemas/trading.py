from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class TradingRequestDTO(BaseModel):
    """DTO заявки для API."""
    id: UUID = Field(..., description="Обязательное поле: идентификатор заявки")
    status: str = Field(..., description="Обязательное поле: статус заявки")
    figi: str = Field(..., description="Обязательное поле: FIGI инструмента")
    mode: str = Field(..., description="Обязательное поле: режим торговли")
    action: str = Field(..., description="Обязательное поле: BUY или SELL")
    quantity: int = Field(..., description="Обязательное поле: количество")
    price: Decimal = Field(..., description="Обязательное поле: цена на момент запроса")
    budget: Decimal = Field(..., description="Обязательное поле: бюджет заявки")
    createdAt: datetime = Field(..., description="Обязательное поле: дата создания")
    updatedAt: datetime = Field(..., description="Обязательное поле: дата обновления")
    approvedAt: datetime | None = Field(default=None, description="Необязательное: дата одобрения")
    executedAt: datetime | None = Field(default=None, description="Необязательное: дата исполнения")
    expiresAt: datetime | None = Field(default=None, description="Необязательное: дата истечения")
    ticker: str | None = Field(default=None, description="Необязательное: тикер инструмента")
    name: str | None = Field(default=None, description="Необязательное: название инструмента")
    confidence: Decimal | None = Field(default=None, description="Необязательное: уверенность модели")
    score: Decimal | None = Field(default=None, description="Необязательное: скоринг рекомендации")
    rejectReason: str | None = Field(default=None, description="Необязательное: причина отклонения")
    actualPrice: Decimal | None = Field(default=None, description="Необязательное: фактическая цена")
    actualAmount: Decimal | None = Field(default=None, description="Необязательное: фактическая сумма")


class TradingRequestCreateOptions(BaseModel):
    """Опции при создании заявки из рекомендации."""
    action: str | None = Field(default=None, description="Переопределить action (BUY/SELL)")
    mode: str = Field(default="paper", description="Режим торговли")
    quantity: int | None = Field(default=None, description="Переопределить количество")


class TradingRequestCreateRequest(BaseModel):
    """Тело запроса создания заявки."""
    recommendationFigi: str | None = Field(default=None, description="FIGI рекомендации в БД")
    recommendationData: dict[str, Any] | None = Field(
        default=None,
        description="Данные рекомендации напрямую (если нет в БД)"
    )
    options: TradingRequestCreateOptions = Field(
        default_factory=TradingRequestCreateOptions,
        description="Опции создания",
    )


class TradingRequestPreviewRequest(BaseModel):
    """Предрасчёт заявки без записи в БД (те же поля, что у создания)."""
    recommendationFigi: str | None = Field(default=None, description="FIGI рекомендации в БД")
    recommendationData: dict[str, Any] | None = Field(
        default=None,
        description="Данные рекомендации напрямую (если нет строки в БД)"
    )
    options: TradingRequestCreateOptions = Field(
        default_factory=TradingRequestCreateOptions,
        description="Опции (action, mode, quantity)",
    )


class TradingRequestApproveRequest(BaseModel):
    comment: str | None = Field(default=None, description="Комментарий к одобрению")


class TradingRequestRejectRequest(BaseModel):
    reason: str = Field(default="", description="Причина отклонения (необязательно)")


class TradingRequestExecuteRequest(BaseModel):
    actualPrice: Decimal | None = Field(default=None, description="Фактическая цена исполнения")
    actualAmount: Decimal | None = Field(default=None, description="Фактическая сумма исполнения")
