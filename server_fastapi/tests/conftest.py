import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from dotenv import load_dotenv
from pathlib import Path

from app.db.session import SessionLocal
from app.main import app

load_dotenv(dotenv_path=Path(__file__).resolve().parents[1] / ".env", override=False)


def _db_tables_exist() -> bool:
    """Проверяет, что таблицы БД существуют (миграции применены).

    Использует отдельный engine, чтобы не загрязнять основной пул соединений
    (asyncio.run создаёт и закрывает свой loop, что ломает main engine на Windows).
    """
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from app.core.config import get_settings
    import asyncio

    async def _check() -> bool:
        cfg = get_settings()
        tmp_engine = create_async_engine(cfg.database_url)
        try:
            Session = async_sessionmaker(bind=tmp_engine, class_=AsyncSession, expire_on_commit=False)
            async with Session() as session:
                await session.execute(text("SELECT 1 FROM instruments LIMIT 1"))
            return True
        except Exception:
            return False
        finally:
            await tmp_engine.dispose()

    try:
        return asyncio.run(_check())
    except Exception:
        return False


@pytest.fixture
def db_available() -> bool:
    """True если БД доступна и миграции применены."""
    return _db_tables_exist()


@pytest_asyncio.fixture
async def db_session(db_available: bool) -> AsyncSession:
    """Сессия БД для интеграционных тестов. Пропуск если таблицы не существуют."""
    if not db_available:
        pytest.skip("DB tables not available (run alembic upgrade head)")
    async with SessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def client() -> AsyncClient:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as async_client:
        yield async_client
