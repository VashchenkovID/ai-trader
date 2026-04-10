"""
Текстовый анализатор портфелей: JSON метрик + вопрос пользователя → отчёт (REWRITE_CORE §12).

При наличии PERPLEXITY_API_KEY вызывает chat completions; иначе — краткий шаблонный отчёт.
"""

from __future__ import annotations

import json
from typing import Any
import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.db.models import PortfolioAnalyzerReport


class PortfolioAnalyzerService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def generate_report(
        self,
        session: AsyncSession,
        *,
        user_query: str,
        profiles: list[dict[str, Any]],
    ) -> tuple[str, str]:
        payload = {"portfolios": profiles, "query": user_query}
        text = await self._llm_or_fallback(user_query, profiles)
        row = PortfolioAnalyzerReport(
            user_query=user_query,
            profiles_payload=payload,
            text_report=text,
        )
        session.add(row)
        await session.flush()
        return str(row.id), text

    async def _llm_or_fallback(self, user_query: str, profiles: list[dict[str, Any]]) -> str:
        key = (self._settings.perplexity_api_key or "").strip()
        if not key:
            return self._fallback_text(user_query, profiles)
        prompt = (
            "Ты финансовый аналитик. Даны профили виртуальных портфелей (JSON) и вопрос пользователя. "
            "Дай сжатый сравнительный ответ на русском, без выдуманных цифр вне JSON.\n\n"
            f"Данные:\n{json.dumps(profiles, ensure_ascii=False, indent=2)}\n\nВопрос:\n{user_query}"
        )
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                r = await client.post(
                    "https://api.perplexity.ai/chat/completions",
                    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                    json={
                        "model": "sonar",
                        "messages": [{"role": "user", "content": prompt}],
                    },
                )
                r.raise_for_status()
                data = r.json()
                choices = data.get("choices") or []
                if choices:
                    msg = (choices[0].get("message") or {}).get("content") or ""
                    if isinstance(msg, str) and msg.strip():
                        return msg.strip()
        except Exception:
            pass
        return self._fallback_text(user_query, profiles)

    @staticmethod
    def _fallback_text(user_query: str, profiles: list[dict[str, Any]]) -> str:
        lines = [
            "Анализатор работает в режиме без LLM (нет PERPLEXITY_API_KEY). Краткая сводка по данным:",
            "",
        ]
        for p in profiles:
            slug = p.get("profileSlug", "?")
            tv = p.get("totalValue")
            tm = p.get("tradeMetrics")
            if isinstance(tm, dict):
                lines.append(
                    f"- {slug}: totalValue={tv}, "
                    f"totalReturnPct={tm.get('totalReturnPct')}, "
                    f"nTrades={tm.get('nTrades')}, "
                    f"winRatePct={tm.get('winRatePct')}"
                )
            else:
                lines.append(f"- {slug}: totalValue={tv}")
        lines.extend(["", f"Вопрос пользователя: {user_query}", "", "Подключите PERPLEXITY_API_KEY для развёрнутого текстового анализа."])
        return "\n".join(lines)
