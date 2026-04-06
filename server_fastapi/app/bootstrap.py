from __future__ import annotations

import asyncio
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.db.models import AppSetting
from app.db.session import SessionLocal, engine
from app.services.app_settings_persistence import hydrate_settings_service_from_db
from app.services.container import AppContainer

_bootstrap_lock = asyncio.Lock()
_bootstrap_done = False


async def db_tables_exist() -> bool:
    query = text(
        """
        SELECT COUNT(*)::int AS cnt
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('users', 'app_settings', 'trading_requests')
        """
    )
    try:
        async with engine.connect() as conn:
            count = int(await conn.scalar(query) or 0)
        return count >= 3
    except SQLAlchemyError:
        return False


def run_alembic_upgrade_head() -> None:
    root = Path(__file__).resolve().parents[1]
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("script_location", str(root / "alembic"))
    command.upgrade(cfg, "head")


def _seed_setting_defaults() -> list[tuple[str, str, str, str]]:
    return [
        ("trading_mode", "paper", "trading", "Режим торговли: paper/real/micro"),
        ("system.mode", "paper", "system", "Текущий режим системы"),
        ("auto_paper_enabled", "false", "trading", "Флаг auto paper"),
        ("risk.maxPositionSize", "0.1", "risk", "Максимальный размер позиции"),
        (
            "portfolio.virtual.initial_capital",
            "50000000",
            "portfolio",
            "Стартовый виртуальный капитал",
        ),
        ("analysis_v2_enabled", "true", "analysis", "Флаг включения улучшенного анализа v2"),
        (
            "analysis_v2_canary_percent",
            "20",
            "analysis",
            "Процент инструментов в canary-раскатке analysis v2",
        ),
        (
            "analysis_v2_llm_uncertainty_margin",
            "0.08",
            "analysis",
            "Окно неуверенности NN для условного вызова LLM",
        ),
        ("analysis_v2_llm_cache_ttl_hours", "6", "analysis", "TTL кэша LLM-ответов"),
        (
            "analysis_v2_quality_gates_enabled",
            "true",
            "analysis",
            "Включены ли quality gates перед inference",
        ),
        ("analysis_v2_conf_temp_nn_only", "1.0", "analysis", "Temperature scaling nn_only"),
        ("analysis_v2_conf_temp_llm_only", "1.0", "analysis", "Temperature scaling llm_only"),
        ("analysis_v2_conf_temp_nn_llm", "1.0", "analysis", "Temperature scaling nn_llm"),
    ]


async def seed_app_settings() -> None:
    defaults = _seed_setting_defaults()
    async with SessionLocal() as session:
        for key, value, module, description in defaults:
            row = await session.get(AppSetting, key)
            if row is None:
                session.add(
                    AppSetting(
                        key=key,
                        value=value,
                        value_type="string",
                        module=module,
                        description=description,
                    )
                )
                continue
            # Для существующих ключей seed не меняет value:
            # runtime-настройки должны сохраняться между рестартами.
            if not row.module:
                row.module = module
            if not row.description:
                row.description = description
        await session.commit()


async def ensure_virtual_portfolio(container: AppContainer) -> None:
    """Создаёт строку virtual_portfolio при отсутствии и при необходимости восстанавливает историю paper-исполнений."""
    async with SessionLocal() as session:
        reg = await session.scalar(text("SELECT to_regclass('public.virtual_portfolio')"))
        if reg is None:
            return
        await container.virtual_portfolio_service.ensure_bootstrap_row(session)
        await container.virtual_portfolio_service.backfill_from_history_if_needed(session)
        await session.commit()


async def seed_admin_user(container: AppContainer) -> None:
    async with SessionLocal() as session:
        await container.auth_service.ensure_admin_user(session)


async def ensure_bootstrap(container: AppContainer) -> None:
    global _bootstrap_done
    async with _bootstrap_lock:
        if _bootstrap_done:
            return
        has_tables = await db_tables_exist()
        if not has_tables:
            await asyncio.to_thread(run_alembic_upgrade_head)
        await seed_app_settings()
        async with SessionLocal() as session:
            await hydrate_settings_service_from_db(session, container.settings_service)
        await ensure_virtual_portfolio(container)
        await seed_admin_user(container)
        _bootstrap_done = True
