"""
Текстовый анализатор портфелей: JSON метрик + вопрос пользователя -> отчёт (REWRITE_CORE §12).

При доступности LLM-провайдера использует его, иначе строит человекопонятный отчёт по метрикам.
"""

from __future__ import annotations

import json
from typing import Any
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
        try:
            from training.llm_jury.providers.gigachat import GigaChatProvider
            prov = GigaChatProvider(timeout=120.0)
            prompt = (
                "Ты финансовый аналитик. Даны профили виртуальных портфелей (JSON) и вопрос пользователя. "
                "Дай сжатый сравнительный ответ на русском, без выдуманных цифр вне JSON.\n\n"
                f"Данные:\n{json.dumps(profiles, ensure_ascii=False, indent=2)}\n\nВопрос:\n{user_query}"
            )
            text = await prov.complete_text(prompt, max_tokens=4096)
            if text and text.strip():
                return text.strip()
        except Exception:
            pass
        return self._fallback_text(user_query, profiles)

    @staticmethod
    def _fallback_text(user_query: str, profiles: list[dict[str, Any]]) -> str:
        lines = ["Краткий сравнительный разбор виртуальных портфелей:", ""]
        scored: list[tuple[str, float | None, float | None, float | None, int | None]] = []
        for p in profiles:
            slug = p.get("profileSlug", "?")
            tv = p.get("totalValue")
            tm = p.get("tradeMetrics")
            if isinstance(tm, dict):
                total_return = tm.get("totalReturnPct")
                win_rate = tm.get("winRatePct")
                n_trades = tm.get("nTrades")
                sharpe = tm.get("sharpeAnnualized")
                max_dd = tm.get("maxDrawdownPct")
                lines.append(f"- {slug}")
                lines.append(f"  • Стоимость: {tv if tv is not None else '—'}")
                lines.append(f"  • Доходность: {total_return if total_return is not None else '—'}%")
                lines.append(f"  • Сделок: {n_trades if n_trades is not None else '—'}")
                lines.append(f"  • Win rate: {win_rate if win_rate is not None else '—'}%")
                lines.append(f"  • Sharpe: {sharpe if sharpe is not None else '—'}")
                lines.append(f"  • Max drawdown: {max_dd if max_dd is not None else '—'}%")
                lines.append("")
                scored.append(
                    (
                        str(slug),
                        float(total_return) if isinstance(total_return, (int, float)) else None,
                        float(max_dd) if isinstance(max_dd, (int, float)) else None,
                        float(win_rate) if isinstance(win_rate, (int, float)) else None,
                        int(n_trades) if isinstance(n_trades, (int, float)) else None,
                    )
                )
            else:
                lines.append(f"- {slug}")
                lines.append(f"  • Стоимость: {tv if tv is not None else '—'}")
                lines.append("")

        if scored:
            best_return = max(scored, key=lambda x: x[1] if x[1] is not None else float("-inf"))
            best_dd = max(scored, key=lambda x: x[2] if x[2] is not None else float("-inf"))
            best_win = max(scored, key=lambda x: x[3] if x[3] is not None else float("-inf"))
            most_trades = max(scored, key=lambda x: x[4] if x[4] is not None else -1)
            lines.extend(
                [
                    "Итог по данным:",
                    f"- Лучшая доходность: {best_return[0]} ({best_return[1] if best_return[1] is not None else '—'}%)",
                    f"- Наименьшая просадка: {best_dd[0]} ({best_dd[2] if best_dd[2] is not None else '—'}%)",
                    f"- Лучший win rate: {best_win[0]} ({best_win[3] if best_win[3] is not None else '—'}%)",
                    f"- Наиболее активный: {most_trades[0]} ({most_trades[4] if most_trades[4] is not None else '—'} сделок)",
                    "",
                ]
            )

        lines.extend([f"Запрос пользователя: {user_query}"])
        return "\n".join(lines)
