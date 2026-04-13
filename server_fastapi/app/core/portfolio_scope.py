"""Идентификаторы портфеля для позиционного анализа (реальный + виртуальные профили)."""

from __future__ import annotations

from app.core.virtual_profiles import VIRTUAL_PROFILE_SLUGS, normalize_virtual_profile

PORTFOLIO_SCOPE_REAL = "real"
VIRTUAL_PREFIX = "virtual:"


def virtual_scope(slug: str) -> str:
    return f"{VIRTUAL_PREFIX}{normalize_virtual_profile(slug)}"


def all_portfolio_scopes() -> list[str]:
    return [PORTFOLIO_SCOPE_REAL] + [virtual_scope(s) for s in VIRTUAL_PROFILE_SLUGS]


def is_valid_portfolio_scope(scope: str) -> bool:
    s = (scope or "").strip()
    if s == PORTFOLIO_SCOPE_REAL:
        return True
    if s.startswith(VIRTUAL_PREFIX):
        raw = (s[len(VIRTUAL_PREFIX) :]).strip().lower()
        return raw in VIRTUAL_PROFILE_SLUGS
    return False


def canonical_portfolio_scope(scope: str) -> str:
    """Нормализует строку scope (`virtual:Moderate` → `virtual:moderate`)."""
    s = (scope or "").strip()
    if s == PORTFOLIO_SCOPE_REAL:
        return PORTFOLIO_SCOPE_REAL
    if s.startswith(VIRTUAL_PREFIX):
        raw = (s[len(VIRTUAL_PREFIX) :]).strip().lower()
        if raw not in VIRTUAL_PROFILE_SLUGS:
            raise ValueError(f"invalid virtual portfolio scope: {scope!r}")
        return virtual_scope(raw)
    raise ValueError(f"invalid portfolio scope: {scope!r}")


def virtual_slug_from_scope(scope: str) -> str | None:
    """Для scope `virtual:moderate` возвращает `moderate`; для `real` — None."""
    s = (scope or "").strip()
    if not s.startswith(VIRTUAL_PREFIX):
        return None
    raw = (s[len(VIRTUAL_PREFIX) :]).strip().lower()
    return raw if raw in VIRTUAL_PROFILE_SLUGS else None
