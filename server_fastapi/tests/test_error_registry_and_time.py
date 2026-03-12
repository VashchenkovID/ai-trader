from __future__ import annotations

from pathlib import Path

import pytest

from app.core.error_registry import FileErrorRegistry
from app.core.time_utils import iso_now_msk, now_msk


@pytest.mark.asyncio
async def test_error_registry_new_and_repeat(tmp_path: Path) -> None:
    registry = FileErrorRegistry(str(tmp_path / "logs" / "error_registry.json"))

    await registry.record(
        error_key="http:INTERNAL_ERROR:RuntimeError",
        error_message_sample="boom-1",
        source="http:GET /x",
        trace_id="t1",
    )
    await registry.record(
        error_key="http:INTERNAL_ERROR:RuntimeError",
        error_message_sample="boom-2",
        source="http:GET /x",
        trace_id="t2",
    )
    await registry.record(
        error_key="http:BAD_REQUEST:validation",
        error_message_sample="bad input",
        source="http:POST /y",
        trace_id="t3",
    )

    items = await registry.list_top(limit=10)
    assert len(items) == 2
    first = items[0]
    assert first["error_key"] == "http:INTERNAL_ERROR:RuntimeError"
    assert first["count"] == 2
    assert first["last_trace_id"] == "t2"


def test_now_msk_timezone_and_iso() -> None:
    dt = now_msk()
    assert dt.utcoffset() is not None
    assert int(dt.utcoffset().total_seconds()) == 3 * 3600
    assert iso_now_msk().endswith("+03:00")
