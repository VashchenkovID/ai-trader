from datetime import timedelta

import bcrypt
import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import AppError
from app.core.time_utils import now_msk
from app.db.models import User
from app.schemas.platform import UserDTO


class AuthService:
    """Сервис аутентификации: вход, проверка JWT и синхронизация admin-пользователя."""
    def __init__(self, settings: Settings) -> None:
        """Инициализирует сервис и читает параметры безопасности из конфигурации."""
        self._settings = settings
        self._admin_username = "admin"
        self._admin_full_name = "Иван Дмитриевич"

    async def login(
        self,
        db_session: AsyncSession,
        username: str,
        password: str,
    ) -> tuple[str, UserDTO] | None:
        """Проверяет логин/пароль, обновляет last_login и возвращает JWT + данные пользователя."""
        try:
            await self._ensure_admin_user(db_session)
            user = await self._find_user_by_username(db_session, username=username)
        except Exception as exc:
            raise AppError(
                "SERVICE_UNAVAILABLE",
                message="Authentication storage is unavailable",
                details={"type": exc.__class__.__name__},
            ) from exc
        if user is None or not user.is_active:
            return None
        if not bcrypt.checkpw(password.encode("utf-8"), user.password_hash.encode("utf-8")):
            return None

        user.last_login = now_msk()
        try:
            await db_session.commit()
            await db_session.refresh(user)
        except Exception as exc:
            raise AppError(
                "SERVICE_UNAVAILABLE",
                message="Authentication storage is unavailable",
                details={"type": exc.__class__.__name__},
            ) from exc
        user_dto = self._to_user_dto(user)
        token = self._encode_token(user_id=user_dto.id, username=user_dto.username)
        return token, user_dto

    async def verify(self, db_session: AsyncSession, token: str) -> UserDTO | None:
        """Проверяет JWT и возвращает активного пользователя из БД."""
        payload = self._decode_token(token)
        if payload is None:
            return None

        user_id = payload.get("userId")
        if not isinstance(user_id, int):
            return None
        try:
            user = await db_session.get(User, user_id)
        except Exception as exc:
            raise AppError(
                "SERVICE_UNAVAILABLE",
                message="Authentication storage is unavailable",
                details={"type": exc.__class__.__name__},
            ) from exc
        if user is None or not user.is_active:
            return None
        return self._to_user_dto(user)

    async def logout(self, token: str) -> None:  # noqa: ARG002
        """Завершает сессию логически; для stateless JWT отдельного хранения нет."""
        return None

    async def _find_user_by_username(self, db_session: AsyncSession, username: str) -> User | None:
        """Ищет пользователя в БД по username."""
        result = await db_session.execute(select(User).where(User.username == username))
        return result.scalar_one_or_none()

    async def _ensure_admin_user(self, db_session: AsyncSession) -> None:
        """Создает/обновляет admin-пользователя из USER_PASSWORD, как в Node-инициализации."""
        if not self._settings.user_password:
            return
        user = await self._find_user_by_username(db_session, username=self._admin_username)

        raw_password = self._settings.user_password.encode("utf-8")
        if user is None:
            password_hash = bcrypt.hashpw(raw_password, bcrypt.gensalt()).decode("utf-8")
            db_session.add(
                User(
                    username=self._admin_username,
                    full_name=self._admin_full_name,
                    password_hash=password_hash,
                    is_active=True,
                )
            )
            await db_session.commit()
            return

        password_matches = bcrypt.checkpw(raw_password, user.password_hash.encode("utf-8"))
        if not password_matches:
            user.password_hash = bcrypt.hashpw(raw_password, bcrypt.gensalt()).decode("utf-8")
        if not user.is_active:
            user.is_active = True
        await db_session.commit()

    async def ensure_admin_user(self, db_session: AsyncSession) -> None:
        """Публичный фасад для startup-bootstrap и других инициализаторов."""
        await self._ensure_admin_user(db_session)

    def _encode_token(self, *, user_id: int, username: str) -> str:
        """Создает JWT с userId/username и временем истечения."""
        expires_delta = self._parse_expires_in(self._settings.jwt_expires_in)
        payload = {
            "userId": user_id,
            "username": username,
            "exp": now_msk() + expires_delta,
        }
        return jwt.encode(payload, self._settings.jwt_secret, algorithm="HS256")

    def _decode_token(self, token: str) -> dict[str, object] | None:
        """Декодирует JWT и возвращает payload или None при ошибке."""
        try:
            decoded = jwt.decode(token, self._settings.jwt_secret, algorithms=["HS256"])
        except jwt.PyJWTError:
            return None
        return decoded if isinstance(decoded, dict) else None

    @staticmethod
    def _parse_expires_in(value: str) -> timedelta:
        """Преобразует строку TTL формата 7d/12h/30m в timedelta."""
        normalized = value.strip().lower()
        if normalized.endswith("d"):
            return timedelta(days=int(normalized[:-1]))
        if normalized.endswith("h"):
            return timedelta(hours=int(normalized[:-1]))
        if normalized.endswith("m"):
            return timedelta(minutes=int(normalized[:-1]))
        return timedelta(days=7)

    @staticmethod
    def _to_user_dto(user: User) -> UserDTO:
        """Преобразует ORM-модель пользователя в DTO для API-ответов."""
        return UserDTO(
            id=user.id,
            username=user.username,
            fullName=user.full_name,
            lastLogin=user.last_login,
        )
