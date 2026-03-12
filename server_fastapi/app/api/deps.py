from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import Depends, Header, Request

from app.core.errors import AppError
from app.db.session import get_db_session
from app.schemas.platform import UserDTO
from app.services.auth_service import AuthService
from app.services.container import AppContainer


def get_container(request: Request) -> AppContainer:
    return request.app.state.container


def get_bearer_token(authorization: str | None = Header(default=None)) -> str:
    if not authorization:
        raise AppError("UNAUTHORIZED", message="Authorization header is required")
    parts = authorization.split(" ", maxsplit=1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1]:
        raise AppError("UNAUTHORIZED", message="Invalid Authorization header format")
    return parts[1]


async def get_current_user(
    request: Request,
    authorization: str | None = Header(default=None),
    db_session: AsyncSession = Depends(get_db_session),
) -> UserDTO:
    auth_service: AuthService = request.app.state.container.auth_service
    resolved_token = get_bearer_token(authorization)
    user = await auth_service.verify(db_session, resolved_token)
    if user is None:
        raise AppError("UNAUTHORIZED", message="Token is invalid or expired")
    return user
