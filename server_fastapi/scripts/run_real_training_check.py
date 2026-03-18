from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx


BASE = "http://127.0.0.1:8000"


def _extract_task_id(payload: dict[str, Any]) -> str | None:
    data = payload.get("data")
    if isinstance(data, dict):
        task_id = data.get("taskId") or data.get("task_id")
        if isinstance(task_id, str) and task_id:
            return task_id
    for key in ("taskId", "task_id"):
        value = payload.get(key)
        if isinstance(value, str) and value:
            return value
    return None


async def main() -> None:
    timeout = httpx.Timeout(20.0, connect=5.0)
    async with httpx.AsyncClient(base_url=BASE, timeout=timeout) as client:
        trigger = await client.post("/api/v1/system/training/quick")
        trigger.raise_for_status()
        trigger_payload = trigger.json()
        task_id = _extract_task_id(trigger_payload)
        if not task_id:
            raise RuntimeError(f"Cannot extract task id from payload: {trigger_payload}")
        print(f"task_id={task_id}")

        last = {}
        for _ in range(240):
            resp = await client.get(f"/api/v1/system/tasks/{task_id}")
            resp.raise_for_status()
            payload = resp.json()
            data = payload.get("data") if isinstance(payload, dict) else None
            task = data.get("task") if isinstance(data, dict) else None
            if not isinstance(task, dict):
                task = payload.get("task") if isinstance(payload, dict) else None
            if not isinstance(task, dict):
                await asyncio.sleep(1.0)
                continue
            last = task
            status = str(task.get("status") or "")
            if status in {"completed", "failed"}:
                break
            await asyncio.sleep(1.0)

        print("final_task=" + json.dumps(last, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
