"""
Release governance для контуров обучения (Phase 4).

Модуль валидирует метрики кандидата перед промоутом модели и сохраняет аудит-решение
в JSONL-реестр.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
import json


@dataclass(frozen=True)
class ReleasePolicy:
    """Пороговые значения release-gate."""

    min_trades: int = 30
    min_win_rate: float = 0.50
    min_profit_factor: float = 1.05
    min_sharpe: float = 0.30
    max_drawdown: float = 0.25
    min_consistency: float = 0.50


@dataclass(frozen=True)
class ReleaseMetrics:
    """Нормализованные метрики кандидата."""

    trades: int
    win_rate: float
    profit_factor: float
    sharpe: float
    max_drawdown: float
    consistency: float


def evaluate_release_gate(
    metrics: ReleaseMetrics,
    policy: ReleasePolicy,
    *,
    model_ref: str | None = None,
) -> dict[str, object]:
    """
    Проверяет метрики относительно policy и возвращает решение release-gate.
    """
    checks = {
        "trades": metrics.trades >= policy.min_trades,
        "win_rate": metrics.win_rate >= policy.min_win_rate,
        "profit_factor": metrics.profit_factor >= policy.min_profit_factor,
        "sharpe": metrics.sharpe >= policy.min_sharpe,
        "max_drawdown": metrics.max_drawdown <= policy.max_drawdown,
        "consistency": metrics.consistency >= policy.min_consistency,
    }
    failed_checks = [name for name, ok in checks.items() if not ok]
    approved = not failed_checks
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "model_ref": model_ref or "unknown",
        "approved": approved,
        "failed_checks": failed_checks,
        "checks": checks,
        "metrics": asdict(metrics),
        "policy": asdict(policy),
    }


def append_release_decision(registry_path: str | Path, decision: dict[str, object]) -> str:
    """
    Добавляет решение release-gate в JSONL-реестр и возвращает путь к файлу.
    """
    path = Path(registry_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(decision, ensure_ascii=False) + "\n")
    return str(path)


__all__ = [
    "ReleasePolicy",
    "ReleaseMetrics",
    "evaluate_release_gate",
    "append_release_decision",
]
