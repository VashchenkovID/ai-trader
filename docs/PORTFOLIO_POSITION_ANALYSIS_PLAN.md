# План реализации анализа портфеля по позициям (цена закупки + промпты для ручного ввода)

Документ фиксирует целевую архитектуру и поэтапный план. Согласуется с разделением слоёв в [BACKEND_BUSINESS_LOGIC.md](./BACKEND_BUSINESS_LOGIC.md): рыночный NN/жюри отдельно от портфельного контекста.

**Цель:** анализировать **все портфели** (виртуальные профили + реальный счёт) **по открытым позициям**, опираясь на **цену закупки (средняя)** и **текущую цену**, с отдельными промптами для **автоматического контура** и для **ручного ввода пользователя**.

---

## 1. Принципы (зафиксировать до кода)

| Принцип | Обоснование |
|---------|-------------|
| **Гибрид: инструмент → портфель** | Нейросеть обучена на рыночных фичах ([`analysis_market_portfolio`](../server_fastapi/app/scheduler.py), `build_feature_pipeline`). Вход «моя средняя цена» без переобучения даёт риск distribution shift. Рекомендуется: **один рыночный скоринг на FIGI** + **портфельный слой** (правила + LLM с полной позицией). |
| **Ключ рекомендации `(portfolioScope, figi)`** | Одна запись «на FIGI для всех» не отражает PnL конкретного владельца. Нужны **отдельные** сущности или явное расширение модели (см. §3). |
| **Единый источник правды по ценам** | Реальный портфель — данные синка Tinkoff ([`portfolio`](../server_fastapi/app/api/v1/portfolio.py), `RealPortfolio`, задача `portfolio_sync`). Виртуальные — снимок из [`VirtualPortfolioService`](../server_fastapi/app/services/virtual_portfolio_service.py) (`averagePositionPrice`, `currentPrice` в payload позиций). |
| **Не дублировать NN на каждый профиль** | Для одного FIGI в `moderate` и `aggressive` **инференс NN один раз**; различаются пороги профиля, размер позиции, текст жюри и итоговый вердикт портфеля. |

---

## 2. Объём портфелей

| Источник | Идентификатор | Позиции и средняя |
|----------|---------------|-------------------|
| Виртуальные профили | `profileSlug` из `VIRTUAL_PROFILE_SLUGS` | Уже есть агрегированный payload в `get_portfolio_payload` / `list_all_profiles_payload` |
| Реальный счёт | `real` или отдельный enum `PortfolioScope` | `RealPortfolio.positions` + обогащение ценами из API/БД (как в `get_portfolio`) |

**Задача планировщика/сервиса:** для каждого scope собрать список позиций с полями минимум: `figi`, `ticker`, `quantity`, `averagePurchasePrice` (или эквивалент из API), `currentPrice`, `unrealizedPnlAbs`, `unrealizedPnlPct`, `weightInPortfolio` (опционально), `currency`, а также при наличии истории сделок/операций — **`firstBuyAt`** (ISO, TZ сервера) и **`daysInPosition`** (календарные дни по FIFO): виртуальный портфель — из `VirtualPortfolio.trades`; реальный live — из `GetOperations` за ограниченное окно (например 730 дней). Кэш `real_db` без истории операций: поля `null`.

---

## 3. Модель данных и API

### 3.1. Вариант A (предпочтительный): отдельная таблица «портфельные рекомендации»

- Таблица например `portfolio_position_recommendations` (или `portfolio_recommendation_overlays`):
  - `id`, `created_at`
  - `portfolio_scope` (`real` \| `virtual:{slug}`)
  - `figi`
  - `analysis_run_id` (UUID прогона, для группировки)
  - `market_score`, `market_confidence` (копия или ссылка на последний инструментальный прогон)
  - `final_action` (BUY / SELL / HOLD / ADD / TRIM — уточнить словарь под продукт)
  - `final_confidence`
  - `nn_payload_ref` (JSON или FK на снимок)
  - `llm_payload` (JSON: провайдеры, consensus, текст)
  - `position_snapshot` (JSON: цены на момент анализа)
- Индекс `(portfolio_scope, figi, created_at)` или уникальность «последняя по паре» через частичный индекс / логика upsert.

### 3.2. Вариант B: расширение `Recommendation`

- Добавить nullable `portfolio_scope`; при `NULL` — прежний смысл «рыночная строка»; при заполнении — портфельная.  
- Минусы: смешение двух семантик в одной таблице, сложнее запросы и пайплайн.

### 3.3. HTTP API (черновик)

| Метод | Назначение |
|-------|------------|
| `POST /portfolio-analysis/run` | Запуск анализа по всем scope (или фильтр `scopes[]`) — синхронно короткий job id или триггер фоновой задачи |
| `GET /portfolio-analysis/latest` | Последние рекомендации по всем портфелям или по `scope` |
| `GET /portfolio-analysis/positions/{scope}` | Позиции + привязанные последние вердикты |
| `POST /portfolio-analysis/verdict` | **Фиксированная задача:** scope + опционально `figi[]` — LLM возвращает BUY/SELL/HOLD по каждой позиции (см. §5.2) |
| `POST /portfolio-analysis/ask` | *(опционально, позже)* произвольный вопрос пользователя + те же данные позиций |

**Пайплайн заявок из PPR (реализовано):** отдельный [`PortfolioPositionPipelineService`](../server_fastapi/app/services/portfolio_position_pipeline_service.py) читает последние строки `portfolio_position_recommendations` по `portfolio_scope`, применяет пороги (в т.ч. гейт профиля в paper), создаёт заявки через `TradingRequestService.create_from_data` и при paper вызывает `AutoPaperService`, по той же схеме, что рыночный [`RecommendationPipelineService`](../server_fastapi/app/services/recommendation_pipeline_service.py). В планировщике шаг включается флагом `PPR_AUTO_PIPELINE_ENABLED` (после успешного `run_verdict` с `saved > 0`, только `mode=paper`). Ручной запуск: `POST /api/v1/portfolio-analysis/pipeline-run?portfolio_scope=…`. Пороги по умолчанию: `PPR_PIPELINE_MIN_CONFIDENCE` / `PPR_PIPELINE_MIN_SCORE`.

---

## 4. Конвейер анализа (пошагово)

1. **Сбор позиций** по каждому `portfolio_scope` (реальный + каждый виртуальный профиль). Пропуск пустых портфелей.
2. **Дедупликация FIGI** внутри одного прогона: множество уникальных FIGI для **рыночного** слоя.
3. **Рыночный слой (как сейчас, переиспользование):**
   - для каждого уникального FIGI: при необходимости взять уже посчитанное из `Recommendation` за сегодня или вызвать `_run_nn_inference_for_figi` + при необходимости точечное жюри (или только кэш).
4. **Портфельный слой (новый):** для каждой пары `(scope, figi)` с ненулевой позицией:
   - собрать `position_snapshot`;
   - вычислить производные: PnL %, дни в позиции (если есть дата сделки), доля от NAV;
   - **LLM-жюри с портфельным промптом** (отдельный шаблон, см. §5) — батч по позициям одного scope или по N инструментов с общим контекстом портфеля (два уровня: per-position vs whole-portfolio — см. §6);
   - опционально **правила**: например при сильном рыночном SELL и убытке &lt; X % — усилить SELL в тексте; при HOLD рынка и большой прибыли — предложить TRIM (продуктовые правила в конфиге).
5. **Сохранение** строк в таблицу из §3.1.
6. **Коммит и уведомление** (WebSocket / задача в `system/tasks`) — по аналогии с `analysis_market_portfolio`.

Отдельная **cron/job** `analysis_portfolio_positions` (имя на усмотрение) в [`scheduler.py`](../server_fastapi/app/scheduler.py) + триггер в [`system.py`](../server_fastapi/app/api/v1/system.py).

---

## 5. Промпты

### 5.1. Промпт жюри для автоматического анализа **позиции в портфеле** (шаблон)

Входные поля (плейсхолдеры):

- `PORTFOLIO_SCOPE`, `PROFILE_RISK_NOTES` (из конфига профиля)
- `FIGI`, `TICKER`, `SECTOR`
- `QTY`, `AVG_PURCHASE_PRICE`, `CURRENT_PRICE`, `CURRENCY`
- `UNREALIZED_PNL_PCT`, `UNREALIZED_PNL_ABS`
- `WEIGHT_IN_NAV_PCT` (если есть)
- `MARKET_NN_SCORE`, `MARKET_NN_CONFIDENCE` (кратко)
- `RECENT_CLOSES_SUMMARY` (как сейчас из свечей)
- `USER_INSTRUCTIONS` — пусто в авто-режиме

Требования к ответу: структурированный JSON или тот же формат, что у батч-жюри, но с полями `action`, `confidence`, `horizon`, `reasons` с явной привязкой к **точке входа** и **текущей цене**.

### 5.2. Промпт для сценария «ручной запуск анализа» (задача **фиксированная**)

Пользователь не формулирует свой текст: **единственная цель вызова** — получить по выбранному портфелю (scope) структурированные рекомендации **BUY / SELL / HOLD** по **каждой открытой позиции** (и при необходимости краткий обзор по портфелю целиком в том же ответе). Различаются только **какой набор позиций подставить** в JSON:

| Подрежим | Когда | Что подставляется в `{positions_json}` |
|----------|--------|----------------------------------------|
| **Портфель целиком** | Запуск по scope (например aggressive, real) | Все позиции профиля + при наличии метрики портфеля (NAV, доли) |
| **Подмножество** | Пользователь отметил одну/несколько бумаг в UI | Только выбранные FIGI из этого scope |

Шаблон системного сообщения (черновик) — **без плейсхолдера произвольного вопроса**:

```text
Ты финансовый аналитик. По портфелю ниже даны только факты из JSON (FIGI, тикер, средняя цена закупки, текущая цена, количество, нереализованный PnL, доля в портфеле при наличии). Не придумывай цифры вне JSON.

Системный рыночный сигнал по инструментам (если передан): краткая сводка BUY/SELL/HOLD или score по FIGI — не подменяй ею цены и PnL из JSON позиций.

Задача (всегда одна и та же):
1) По КАЖДОЙ позиции в JSON верни ровно одно действие: BUY, SELL или HOLD (в смысле удержания текущей позиции, без обязательства докупать).
2) Для каждой позиции укажи confidence от 0 до 1 и 1–3 причины, явно связывая вывод с ценой закупки, текущей ценой и PnL.
3) При необходимости добавь краткий блок по портфелю целиком (концентрация, общий риск) — без новых чисел вне JSON.

Формат ответа: строго структурированный (например JSON-массив instruments[] с полями figi, action, confidence, reasons[]), без markdown вокруг.

Данные позиций:
{positions_json}

Сводка рыночных сигналов (опционально):
{market_signals_by_figi}
```

Провайдер: тот же контур, что и для текстового анализа (например Perplexity), но **отдельный метод/эндпоинт** (например `POST /portfolio-analysis/verdict`), чтобы не смешивать с произвольным чатом [`/portfolio-analyzer`](../server_fastapi/app/api/v1/portfolio_analyzer.py). Произвольный вопрос пользователем — **отдельная опция** (другой промпт и маршрут), если понадобится позже.

### 5.3. Связь с обучением / «ручной ввод нейросетям»

- **Обучающий контур NN** (Python stack): при желании логировать **анонимизированные** пары (фичи рынка + контекст позиции + финальный лейбл от эксперта) в JSONL для будущего дообучения — **отдельная фаза**, не блокирует MVP.
- Для MVP: «нейросетям» в смысле продукта = **Perplexity + жюри-провайдеры**; сырой **ручной промпт** пользователя не отправлять в **torch-модель** без валидации размерности и безопасности.

---

## 6. Per-position vs whole-portfolio LLM

| Стратегия | Плюсы | Минусы |
|-----------|--------|--------|
| **Только по позиции** | Дешевле токенов, проще парсить | Теряется корреляция и суммарный риск |
| **Сначала портфель, потом позиции** | Лучше narrative («перекос в сектор») | Два прохода LLM, дороже |
| **Один батч: все строки портфеля в одном промпте** | Один вызов на провайдера на портфель | Лимиты контекста при большом числе позиций |

**Рекомендация для MVP:** один промпт **на портфель** с таблицей позиций + опционально второй **короткий** проход только для позиций с |PnL%| &gt; порога или с конфликтом «рынок SELL / позиция в плюсе».

---

## 7. Фронтенд

- Экран или секция дашборда: выбор scope → таблица позиций → колонки «закуп», «текущая», «PnL», «вердикт портфельного анализа», «уверенность».
- Кнопка «Получить вердикт по позициям» → `POST /portfolio-analysis/verdict` (фиксированная задача BUY/SELL/HOLD); превью JSON позиций перед отправкой.
- История ответов ручного режима: новая таблица `portfolio_analysis_chats` или расширение `PortfolioAnalyzerReport` полем `portfolio_scope` + `positions_snapshot`.

---

## 8. Этапы внедрения (roadmap)

| Фаза | Содержание | Критерий готовности |
|------|------------|---------------------|
| **0** | Утвердить enum `PortfolioScope`, контракт JSON позиции, словарь `final_action` | Документ + review |
| **1** | Сервис `PortfolioPositionAnalysisService`: сбор снимков real + virtual, дедуп FIGI, чтение последнего рыночного скора | Юнит-тесты на сбор полей |
| **2** | Таблица + репозиторий + `GET latest` | Миграция Alembic |
| **3** | Портфельный промпт + вызов жюри/Perplexity + сохранение | Интеграционный тест с mock провайдера |
| **4** | Job `analysis_portfolio_positions` + триггер API | E2E на пустом и с позициями |
| **5** | `POST .../verdict` + UI (запуск вердикта BUY/SELL/HOLD по позициям) | Ручная проверка UX; опционально `/ask` позже |
| **6** | Связка с `RecommendationPipelineService` (если нужны заявки из портфельных вердиктов) | Сценарий paper-only |
| **7** (опционально) | Фичи позиции в обучающий датасет NN | Отдельный эксперимент |

---

## 8. Риски и меры

- **Несовпадение средней цены** между Tinkoff и отображением — явно показывать `asOf` и источник.
- **Валюта и лотность** — нормализовать в RUB/USD для промпта или помечать валюту в каждой строке.
- **Галлюцинации LLM** — жёсткий блок «только цифры из JSON» + короткий контекст свечей как сейчас.
- **Стоимость API** — батчирование по портфелю, кэш по `(scope, figi, date)` для авто-режима.
- **Регуляторные формулировки** — дисклеймер «не индивидуальная инвестиционная рекомендация» в UI при необходимости.

---

## 10. Связанные файлы кодовой базы

| Компонент | Файл |
|-----------|------|
| Рыночный анализ (текущий) | [`server_fastapi/app/scheduler.py`](../server_fastapi/app/scheduler.py) (`_analysis_market_portfolio_job`, `_run_nn_inference_for_figi`) |
| Жюри (батч) | [`server_fastapi/training/llm_jury/run.py`](../server_fastapi/training/llm_jury/run.py), [`prompts.py`](../server_fastapi/training/llm_jury/prompts.py) |
| Текстовый анализатор (JSON метрики) | [`server_fastapi/app/services/portfolio_analyzer_service.py`](../server_fastapi/app/services/portfolio_analyzer_service.py) |
| Виртуальные портфели | [`server_fastapi/app/services/virtual_portfolio_service.py`](../server_fastapi/app/services/virtual_portfolio_service.py) |
| Реальный портфель API | [`server_fastapi/app/api/v1/portfolio.py`](../server_fastapi/app/api/v1/portfolio.py) |
| Пайплайн заявок | [`server_fastapi/app/services/recommendation_pipeline_service.py`](../server_fastapi/app/services/recommendation_pipeline_service.py) |

---

*Версия документа: 1.1.*

**Реализация (MVP):** таблица `portfolio_position_recommendations`, сервис [`portfolio_position_analysis_service.py`](../server_fastapi/app/services/portfolio_position_analysis_service.py), API [`portfolio_analysis.py`](../server_fastapi/app/api/v1/portfolio_analysis.py) (`/verdict`, `/run`, `/latest`, `/positions`, **`/manual/prompt`**, **`/manual/apply`** для ручного импорта ответа внешней нейросети), фоновая задача `analysis_portfolio_positions` и триггер `POST /api/v1/system/analysis/portfolio-positions`. UI: страница [`ManualLlmImportPage`](../frontend/src/pages/ManualLlmImportPage.tsx). Миграция Alembic `20260413_0018_portfolio_position_recommendations.py`.
