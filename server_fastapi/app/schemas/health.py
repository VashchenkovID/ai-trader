from datetime import datetime

from pydantic import BaseModel, Field


class HealthDTO(BaseModel):
    status: str = Field(..., description="Обязательное поле: статус сервиса")
    service: str = Field(..., description="Обязательное поле: имя сервиса")
    timestamp: datetime = Field(..., description="Обязательное поле: время формирования ответа")
