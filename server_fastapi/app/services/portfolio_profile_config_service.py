"""Резолвер конфигов виртуальных профилей из AppSetting `portfolio.profiles` (JSON)."""

from __future__ import annotations

import json
import logging
from typing import Any

from app.core.virtual_profiles import DEFAULT_VIRTUAL_PROFILE, VIRTUAL_PROFILE_SLUGS, normalize_virtual_profile
from app.schemas.portfolio_profile import PortfolioProfileConfig
from app.services.settings_service import SettingsService

logger = logging.getLogger(__name__)

_SETTING_KEY = "portfolio.profiles"

# REWRITE_CORE §13.2–13.5 — дефолты, если в БД нет ключа или поля профиля.
_DEFAULT_BY_SLUG: dict[str, dict[str, Any]] = {
    "conservative": {
        "signal_min_score": 0.7,
        "signal_min_confidence": 0.72,
        "max_position_fraction": 0.02,
        "max_total_exposure_fraction": 0.35,
        "rebalance_days": 14,
    },
    "moderate": {
        "signal_min_score": 0.6,
        "signal_min_confidence": 0.62,
        "max_position_fraction": 0.06,
        "max_total_exposure_fraction": 0.55,
        "rebalance_days": 7,
    },
    "aggressive": {
        "signal_min_score": 0.5,
        "signal_min_confidence": 0.52,
        "max_position_fraction": 0.14,
        "max_total_exposure_fraction": 0.95,
        "rebalance_days": 1,
    },
    "experimental": {
        "signal_min_score": 0.55,
        "signal_min_confidence": 0.58,
        "max_position_fraction": 0.08,
        "max_total_exposure_fraction": 0.65,
        "rebalance_days": 3,
    },
}


def _parse_profiles_raw(raw: object) -> dict[str, Any]:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        s = raw.strip()
        if not s:
            return {}
        try:
            data = json.loads(s)
        except json.JSONDecodeError:
            logger.warning("portfolio.profiles: invalid JSON, using built-in defaults")
            return {}
        return data if isinstance(data, dict) else {}
    return {}


class PortfolioProfileConfigService:
    """Единый источник порогов и лимитов по slug."""

    def __init__(self, settings_service: SettingsService) -> None:
        self._settings = settings_service

    def _merged_table(self) -> dict[str, dict[str, Any]]:
        item = self._settings._settings.get(_SETTING_KEY)
        raw_val = item.value if item else None
        from_db = _parse_profiles_raw(raw_val)
        out: dict[str, dict[str, Any]] = {}
        for slug in VIRTUAL_PROFILE_SLUGS:
            base = dict(_DEFAULT_BY_SLUG.get(slug, _DEFAULT_BY_SLUG["moderate"]))
            override = from_db.get(slug) if isinstance(from_db.get(slug), dict) else {}
            base.update({k: v for k, v in override.items() if v is not None})
            out[slug] = base
        return out

    def get_config(self, slug: str | None) -> PortfolioProfileConfig:
        norm = normalize_virtual_profile(slug)
        row = self._merged_table().get(norm) or self._merged_table()[DEFAULT_VIRTUAL_PROFILE]
        try:
            return PortfolioProfileConfig.model_validate(row)
        except Exception as e:
            logger.warning("portfolio profile %s invalid (%s), fallback moderate", norm, e)
            return PortfolioProfileConfig.model_validate(_DEFAULT_BY_SLUG["moderate"])
