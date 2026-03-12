from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_bearer_token, get_container, get_current_user
from app.core.errors import AppError
from app.db.session import get_db_session
from app.schemas.envelope import SuccessEnvelope
from app.schemas.platform import AuthLoginData, AuthLoginRequest, UserDTO, VerifyTokenRequest
from app.services.container import AppContainer

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", summary="Вход пользователя")
async def login(
    payload: AuthLoginRequest,
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[AuthLoginData]:
    result = await container.auth_service.login(db_session, payload.username, payload.password)
    if result is None:
        raise AppError("UNAUTHORIZED", message="Неверное имя пользователя или пароль")
    token, user = result
    return SuccessEnvelope(data=AuthLoginData(token=token, user=user))


@router.get("/me", summary="Текущий пользователь")
async def me(user: UserDTO = Depends(get_current_user)) -> SuccessEnvelope[UserDTO]:
    return SuccessEnvelope(data=user)


@router.post("/verify", summary="Проверка токена")
async def verify(
    payload: VerifyTokenRequest,
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict[str, object]]:
    user = await container.auth_service.verify(db_session, payload.token)
    if user is None:
        raise AppError("UNAUTHORIZED", message="Токен недействителен или истек")
    return SuccessEnvelope(data={"message": "Токен действителен", "user": user.model_dump()})


@router.post("/logout", summary="Выход пользователя")
async def logout(
    request: Request,
    token: str = Depends(get_bearer_token),
) -> SuccessEnvelope[dict[str, str]]:
    container: AppContainer = request.app.state.container
    await container.auth_service.logout(token)
    return SuccessEnvelope(data={"message": "Выход выполнен успешно"})
