from __future__ import annotations

from types import SimpleNamespace

import pytest

import app.bootstrap as bootstrap


@pytest.mark.asyncio
async def test_ensure_bootstrap_runs_migrations_when_tables_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bootstrap, "_bootstrap_done", False)
    calls: list[str] = []

    async def _tables_exist() -> bool:
        return False

    async def _seed_settings() -> None:
        calls.append("settings")

    async def _seed_admin(_container) -> None:
        calls.append("admin")

    monkeypatch.setattr(bootstrap, "db_tables_exist", _tables_exist)
    monkeypatch.setattr(bootstrap, "seed_app_settings", _seed_settings)
    monkeypatch.setattr(bootstrap, "seed_admin_user", _seed_admin)
    monkeypatch.setattr(bootstrap, "run_alembic_upgrade_head", lambda: calls.append("alembic"))

    await bootstrap.ensure_bootstrap(SimpleNamespace())
    assert calls == ["alembic", "settings", "admin"]


@pytest.mark.asyncio
async def test_ensure_bootstrap_skips_migrations_when_tables_exist(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bootstrap, "_bootstrap_done", False)
    calls: list[str] = []

    async def _tables_exist() -> bool:
        return True

    async def _seed_settings() -> None:
        calls.append("settings")

    async def _seed_admin(_container) -> None:
        calls.append("admin")

    monkeypatch.setattr(bootstrap, "db_tables_exist", _tables_exist)
    monkeypatch.setattr(bootstrap, "seed_app_settings", _seed_settings)
    monkeypatch.setattr(bootstrap, "seed_admin_user", _seed_admin)
    monkeypatch.setattr(bootstrap, "run_alembic_upgrade_head", lambda: calls.append("alembic"))

    await bootstrap.ensure_bootstrap(SimpleNamespace())
    assert calls == ["settings", "admin"]


@pytest.mark.asyncio
async def test_ensure_bootstrap_is_idempotent(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bootstrap, "_bootstrap_done", False)
    calls: list[str] = []

    async def _tables_exist() -> bool:
        return True

    async def _seed_settings() -> None:
        calls.append("settings")

    async def _seed_admin(_container) -> None:
        calls.append("admin")

    monkeypatch.setattr(bootstrap, "db_tables_exist", _tables_exist)
    monkeypatch.setattr(bootstrap, "seed_app_settings", _seed_settings)
    monkeypatch.setattr(bootstrap, "seed_admin_user", _seed_admin)

    container = SimpleNamespace()
    await bootstrap.ensure_bootstrap(container)
    await bootstrap.ensure_bootstrap(container)
    assert calls == ["settings", "admin"]


@pytest.mark.asyncio
async def test_seed_app_settings_does_not_override_existing_values(monkeypatch: pytest.MonkeyPatch) -> None:
    class Row:
        def __init__(self, key: str, value: str, module: str, description: str) -> None:
            self.key = key
            self.value = value
            self.module = module
            self.description = description

    class Session:
        def __init__(self) -> None:
            self.rows = {
                "trading_mode": Row("trading_mode", "real", "", ""),
            }
            self.added = 0
            self.committed = False

        async def get(self, _model, key: str):
            return self.rows.get(key)

        def add(self, _obj) -> None:
            self.added += 1

        async def commit(self) -> None:
            self.committed = True

    class SessionCtx:
        def __init__(self) -> None:
            self.session = Session()

        async def __aenter__(self):
            return self.session

        async def __aexit__(self, exc_type, exc, tb):
            return False

    ctx = SessionCtx()
    monkeypatch.setattr(bootstrap, "SessionLocal", lambda: ctx)

    await bootstrap.seed_app_settings()

    existing = ctx.session.rows["trading_mode"]
    assert existing.value == "real"
    assert existing.module == "trading"
    assert existing.description != ""
    assert ctx.session.committed is True
