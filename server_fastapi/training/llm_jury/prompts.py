"""
Шаблон промпта для LLM-жюри (см. план AI Training Python Stack, раздел 3).

Подстановки: [РОЛЬ], [КОНТЕКСТ], [ТИКЕР]. Парсинг ответа: action (BUY/SELL/HOLD), confidence [0,1].
"""

from __future__ import annotations

JURY_PROMPT_TEMPLATE = """Ты [РОЛЬ]. Анализируй [ТИКЕР] только по данным ниже.

ДАННЫЕ:
[КОНТЕКСТ]

Верни ответ СТРОГО в формате (без markdown и лишнего текста):
ACTION: BUY|SELL|HOLD
CONFIDENCE: 0.00-1.00
HORIZON: short|mid|long
REASONS:
- <ключевой драйвер 1>
- <ключевой драйвер 2>
- <ключевой риск>
TRIGGERS:
- up: <что подтвердит BUY>
- down: <что подтвердит SELL>
POSITION_SIZE_HINT:
- <низкий|средний|высокий риск позиции и почему>

Ограничения:
- текст ответа только на русском языке;
- максимум 120 слов;
- только проверяемые выводы из данных;
- если данных мало/шумно: ACTION=HOLD, CONFIDENCE<=0.55.
"""


def build_jury_prompt(
    ticker: str,
    context: str,
    role: str = "финансовый аналитик",
) -> str:
    """
    Подставляет в шаблон тикер, контекст и роль.
    context: данные инструмента (сектор, цены, объёмы, макро-сводка).
    """
    return JURY_PROMPT_TEMPLATE.replace("[РОЛЬ]", role).replace(
        "[КОНТЕКСТ]", context
    ).replace("[ТИКЕР]", ticker)
