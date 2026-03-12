from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AuthLoginRequest(BaseModel):
    username: str = Field(..., description="Обязательное поле: имя пользователя")
    password: str = Field(..., description="Обязательное поле: пароль пользователя")


class VerifyTokenRequest(BaseModel):
    token: str = Field(..., description="Обязательное поле: JWT токен для проверки")


class UserDTO(BaseModel):
    id: int = Field(..., description="Обязательное поле: идентификатор пользователя")
    username: str = Field(..., description="Обязательное поле: логин пользователя")
    fullName: str = Field(..., description="Обязательное поле: полное имя пользователя")
    lastLogin: datetime | None = Field(default=None, description="Необязательное поле: время последнего входа")


class AuthLoginData(BaseModel):
    token: str = Field(..., description="Обязательное поле: JWT токен доступа")
    user: UserDTO = Field(..., description="Обязательное поле: профиль авторизованного пользователя")


class SettingItemDTO(BaseModel):
    key: str = Field(..., description="Обязательное поле: ключ настройки")
    value: Any = Field(..., description="Обязательное поле: текущее значение")
    type: str = Field(default="string", description="Необязательное поле: тип значения")
    module: str = Field(default="other", description="Необязательное поле: модуль настройки")
    description: str = Field(default="", description="Необязательное поле: описание настройки")
    min: float | None = Field(default=None, description="Необязательное поле: минимально допустимое значение")
    max: float | None = Field(default=None, description="Необязательное поле: максимально допустимое значение")
    options: list[Any] | None = Field(default=None, description="Необязательное поле: допустимые варианты")


class SettingsUpdateRequest(BaseModel):
    key: str = Field(..., min_length=1, description="Обязательное поле: ключ изменяемой настройки")
    value: Any = Field(..., description="Обязательное поле: новое значение настройки")


class KellySettingsDTO(BaseModel):
    enabled: bool = Field(default=True, description="Необязательное поле: включен ли расчет по формуле Келли")
    conservativeFactor: float = Field(default=0.25, description="Необязательное поле: консервативный коэффициент")
    minTrades: int = Field(default=10, description="Необязательное поле: минимальное число сделок")
    volatilityPeriod: int = Field(default=30, description="Необязательное поле: период волатильности в днях")


class KellySettingsUpdateRequest(BaseModel):
    enabled: bool | None = Field(default=None, description="Включение/выключение расчета Келли")
    conservativeFactor: float | None = Field(default=None, description="Новое значение консервативного коэффициента")
    minTrades: int | None = Field(default=None, description="Новое минимальное число сделок")
    volatilityPeriod: int | None = Field(default=None, description="Новый период волатильности в днях")
