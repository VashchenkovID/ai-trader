"""Чтение ночного артефакта матрицы доходностей (REWRITE_CORE §5, DATA_CONTRACT)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


DEFAULT_ARTIFACT_PATH = Path("data/quant/returns_matrix_latest.json")


def load_returns_matrix_artifact(path: Path | None = None) -> dict[str, Any]:
    """
    Загружает JSON с диска. Возвращает служебный результат с полем ok.
    Не бросает при отсутствии файла — для API и preflight.
    """
    p = path or DEFAULT_ARTIFACT_PATH
    if not p.is_file():
        return {
            "ok": False,
            "path": str(p.resolve()),
            "error": "file_missing",
            "payload": None,
        }
    try:
        raw = p.read_text(encoding="utf-8")
        data = json.loads(raw)
    except (OSError, UnicodeError, json.JSONDecodeError) as e:
        return {
            "ok": False,
            "path": str(p.resolve()),
            "error": f"read_failed:{e.__class__.__name__}",
            "payload": None,
        }
    if not isinstance(data, dict):
        return {"ok": False, "path": str(p.resolve()), "error": "invalid_json_shape", "payload": None}
    shape = data.get("shape")
    figis = data.get("figis") or []
    last_run = data.get("lastRunAt")
    matrix_ok = isinstance(data.get("matrix"), dict) and bool((data.get("matrix") or {}).get("columns"))
    return {
        "ok": True,
        "path": str(p.resolve()),
        "error": None,
        "payload": data,
        "summary": {
            "lastRunAt": last_run,
            "figiCount": len(figis) if isinstance(figis, list) else 0,
            "matrixShape": shape if isinstance(shape, list) else None,
            "hasMatrix": matrix_ok,
            "universeError": data.get("error"),
        },
    }
