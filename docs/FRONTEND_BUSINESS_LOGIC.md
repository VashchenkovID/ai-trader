# Бизнес-логика фронтенда

См. также: [BACKEND_BUSINESS_LOGIC.md](./BACKEND_BUSINESS_LOGIC.md) — домены API, state machine заявок и флаги окружения. В начале того файла — **таблица слоёв** (количественный core REWRITE §2–§5 vs гибрид `Recommendation` vs обучение), чтобы не смешивать смыслы в UI.

Этот документ описывает пользовательские сценарии, привязку к HTTP/WebSocket API и глобальному состоянию. Целевая информационная архитектура: [frontend/docs/TARGET_FRONTEND_IA.md](../frontend/docs/TARGET_FRONTEND_IA.md).

---

## 1. Роли и задачи пользователя

Согласовано с [TARGET_FRONTEND_IA §1](../frontend/docs/TARGET_FRONTEND_IA.md):

| Потребность | Смысл в UI | Опора на бэкенд (см. разделы [BACKEND](./BACKEND_BUSINESS_LOGIC.md)) |
|-------------|------------|----------------------------------------------------------------------|
| Автоторговля по профилям | Статус auto-paper, профили, очередь заявок | §2 `auto-paper-trading`, [BACKEND §3.1–3.4](./BACKEND_BUSINESS_LOGIC.md#3-сквозные-бизнес-потоки) (анализ, пайплайн, заявки, paper), trading-requests |
| Виртуальные портфели | NAV, сравнение профилей, пороги | §2 `/portfolio/virtual/*`, [§3.6](./BACKEND_BUSINESS_LOGIC.md#36-виртуальные-профили-и-nav) |
| Реальный портфель | Позиции, баланс, режим | §2 `/portfolio`, [§3.5](./BACKEND_BUSINESS_LOGIC.md#35-режим-торговли-paper--real--micro) |
| Рекомендации | Список, карточка по FIGI | `/market`, `/recommendation-pipeline` |
| Торговые заявки | Статусы, approve/reject/execute | [BACKEND §3.3](./BACKEND_BUSINESS_LOGIC.md#33-торговые-заявки-и-state-machine) |
| Настройки | Ключи, кеш, scheduler | `/settings`, триггеры в `/system/*` |
| Мониторинг процессов | Задачи, алерты, health | `/system/*`, `/monitoring`, `WS` (ниже) |

---

## 2. Глобальное состояние и транспорт

| Механизм | Файл | Назначение |
|----------|------|------------|
| Сессия | [`frontend/src/services/auth.ts`](../frontend/src/services/auth.ts) | Логин, хранение токена, `verifyStoredSession` |
| Trading core | [`frontend/src/store/tradingCoreStore.ts`](../frontend/src/store/tradingCoreStore.ts) | Профиль (`AuthService`), режим (`TradingModeService.tradingModeCurrentApiV1TradingModeCurrentGet`), портфель: при `paper` — **`GET /portfolio/virtual`** (`PortfolioService.getVirtualPortfolioApiV1PortfolioVirtualGet`), при ошибке API — fallback на `portfolio.virtual.initial_capital` из настроек; при `real`/`micro` — `PortfolioService.getPortfolioApiV1PortfolioGet1` |
| Системный статус | [`frontend/src/store/systemStatusStore.ts`](../frontend/src/store/systemStatusStore.ts) | WebSocket `VITE_WS_SYSTEM_STATUS_PATH` или по умолчанию `/api/v1/ws/system-status` ([`system.py`](../server_fastapi/app/api/v1/system.py)); события планировщика/задач; по ряду событий — `refreshPortfolio` с источником `socket` |
| HTTP-клиент | [`frontend/src/api/generated/`](../frontend/src/api/generated/) | OpenAPI-клиент; база URL из [`OpenAPI.ts`](../frontend/src/api/generated/core/OpenAPI.ts) / конфиг сборки |

Компонент `ProtectedWithRealtime`, дерево маршрутов и `RouteDataGuard` подключены в [`App.tsx`](../frontend/src/App.tsx); страницы подгружаются **лениво** (`React.lazy`), оболочка оборачивает `<Outlet />` в `Suspense`.

---

## 3. Маршрут → сценарий → API / стор

Колонка «Маршрут» соответствует [`APP_SIDEBAR_ITEMS`](../frontend/src/navigation/appSidebar.ts). Полные HTTP-пути — `/api/v1/...`.

| Маршрут | Что делает пользователь | Основные вызовы (generated services) |
|---------|-------------------------|--------------------------------------|
| `/dashboard` | **Точка входа после логина.** Пользователь получает «срез дня»: текущий **режим торговли** (paper / real / micro), **оценку капитала или баланса** (для реального счёта — снимок брокера; для paper — **`GET /portfolio/virtual`** в `tradingCoreStore`, см. §2). **Сверяется** с тем, что система «сейчас в работе»: фоновые задачи, планировщик, health/статусы — если на экране есть соответствующие виджеты. **Переходит** в автоторговлю, заявки или портфель через сайдбар, не выполняя здесь глубоких торговых действий. | `TradingModeService`, `PortfolioService` или логика как в `tradingCoreStore`; опционально `SystemService`, `MonitoringService` для виджетов |
| `/virtual-trading` | **Управляет автоторговлей и виртуальным контуром.** Включает или выключает **auto-paper**, смотрит **статус** сервиса и ограничения. **Обзор профилей** (slug, пороги, связь с пайплайном): для ориентира, какие правила порождают заявки. **Просматривает последние действия** — недавние заявки, события, чтобы понять, сработал ли пайплайн. При необходимости **переходит** к полному списку заявок или к настройкам профилей. Не заменяет экран детального списка заявок (`/trading-requests`), а дополняет его сценарием «как живёт автоматика». | `AutoPaperTradingService`, `TradingRequestsService`, `PortfolioService` (виртуальные эндпоинты при необходимости) |
| `/portfolio` | **Работает с реальным брокерским портфелем.** Просматривает **позиции, количество, текущую оценку, прибыль/убыток** по бумагам. **Читает рекомендации по позициям** (удержание, докупка, сокращение) — это вход для ручных решений на реальном счёте, а не автоматическое исполнение. Может **перейти** к карточке инструмента или к рекомендациям по FIGI, если в UI есть ссылки. | `PortfolioService.getPortfolioApiV1PortfolioGet1`, `getPortfolioPositionRecommendationsApiV1PortfolioPositionRecommendationsGet` |
| `/recommendations`, `/recommendations/:figi` | На **`/recommendations`** — **листинг рекомендаций** по инструментам: фильтрация, сортировка, переход к деталям. На **`/recommendations/:figi`** — **карточка по одному FIGI**: сигнал, уверенность/score, краткое обоснование, связанные рыночные данные, если экран их подгружает. Пользователь **не исполняет сделку** напрямую здесь (исполнение идёт через заявки и режим), а **информируется** для решения на других экранах. | `MarketService`, `RecommendationPipelineService` |
| `/trading-requests` | **Операционный центр по заявкам.** Просматривает **таблицу** с историей и очередью, **сужает выбор** фильтрами (статус, период, FIGI, режим). Для строки с допустимым переходом выполняет **preview** (если доступен), затем **approve**, **reject**, **execute** или **cancel** — строго в рамках [state machine на бэкенде](./BACKEND_BUSINESS_LOGIC.md#33-торговые-заявки-и-state-machine). Смотрит **агрегаты** (сколько в ожидании, исполнено, отклонено), чтобы контролировать очередь. | `TradingRequestsService` (см. [BACKEND §3.3–3.4](./BACKEND_BUSINESS_LOGIC.md#33-торговые-заявки-и-state-machine)) |
| `/monitoring/alerts` | **Читает ленту алертов:** системные события, сбои, пороговые срабатывания, уведомления от мониторинга. Может **фильтровать** по типу/времени (если UI поддерживает), **открывать деталь** инцидента. Цель — **быстрая диагностика** «что сломалось или требует внимания», без глубокой настройки (она в `/settings` и system API). | `MonitoringService` |
| `/risk` | **Проверяет риск-профиль:** лимиты, просадка, ограничения по позициям, флаги **emergency** или стоп-режима. Может **запускать или просматривать результат preflight** (если экран связан с проверкой перед сделкой) — «можно ли сейчас торговать с учётом лимитов». Не заменяет исполнение заявок, а даёт **go / no-go** в терминах риска. | `RiskService`, при необходимости `PreflightCheckService` |
| `/performance` | **Анализирует производительность** стратегии/счёта за выбранные периоды: доходность, просадки, сравнение с бенчмарком — в объёме, который отдаёт `PerformanceService`. Пользователь **выбирает период или отчёт**, **читает графики и таблицы**, может **экспортировать** (если предусмотрено). Это **ретроспектива**, не live-торговля. | `PerformanceService` |
| `/portfolio-analyzer` | **Запускает разбор портфеля в текстовом/агрегированном виде:** задаёт входные параметры (или использует текущий снимок), **инициирует анализ**, получает **сводку метрик и выводов** (как отчёт для человека). Используется для **объяснения** состояния портфеля, а не для выставления заявок. | `PortfolioAnalyzerService` |
| `/backtest-sma` | **Лабораторный сценарий:** задаёт **инструмент (FIGI), окно дат, параметры SMA**, запускает **бэктест**, **сравнивает** результат (кривая капитала, простые метрики). Пользователь **не влияет на реальный счёт**; это **offline-эксперимент** для оценки правила. | `BacktestingService` |
| `/settings` | **Настраивает приложение:** ключи и флаги в `app_settings`, **Kelly**, лимиты бюджета, **начальный капитал paper**, уведомления, таймзона и пр. **Сохраняет** изменения и **ожидает**, что downstream-экраны (дашборд, auto-paper) подхватят новые значения после обновления стора/перезагрузки. Опционально **связан** с триггерами `system` (кеш, задачи) — если так собран UI. | `SettingsService` |
| `/login` | **Аутентификация:** вводит **учётные данные** (в текущей модели — пароль из конфигурации бэкенда), отправляет форму. При успехе **получает JWT**, клиент **сохраняет сессию** и перенаправляет на защищённые маршруты; при ошибке **повторяет ввод**. Без успешного логина **остальные маршруты недоступны** (guard). | `AuthService.postAuthLogin` и verify |

Страницы-обёртки и layout исторически могут использовать `PageLayout` и `Sidebar`; навигация — `navigateFromSidebar` из [`appSidebar.ts`](../frontend/src/navigation/appSidebar.ts).

---

## 4. Сквозные сценарии (кратко)

**Логин:** `POST /api/v1/auth/login` → сохранение токена → последующие запросы с Bearer → `POST /auth/verify` при проверке сессии.

**Загрузка «ядра» после входа:** `ensureLoaded` в `tradingCoreStore` подтягивает режим торговли и портфель. В режиме `paper` основной источник — **`GET /portfolio/virtual`** (снимок из БД); при сбое запроса используется fallback из `portfolio.virtual.initial_capital` в настройках.

**Заявки:** UI отображает статусы и вызывает `approve` / `reject` / `execute` / `cancel` в соответствии с допустимыми переходами на сервере; для preview — `POST /trading-requests/preview`.

**Виртуальные профили и NAV:** для графиков и таблицы порогов — `GET /portfolio/virtual/nav-history`, `GET /portfolio/virtual/profiles-config`, `GET /portfolio/virtual/profiles` (см. [BACKEND §3.6](./BACKEND_BUSINESS_LOGIC.md#36-виртуальные-профили-и-nav)).

**Мониторинг:** WebSocket отдаёт снимок планировщика и задач; REST-дубли — эндпоинты `system` в [BACKEND §2](./BACKEND_BUSINESS_LOGIC.md).

---

## 5. Разрывы и приоритеты

| Проблема | Суть | Рекомендация |
|----------|------|--------------|
| `rewriteCoreApi.ts` | В [TARGET_FRONTEND_IA §7](../frontend/docs/TARGET_FRONTEND_IA.md) упомянут агрегирующий модуль | На практике используются **`PortfolioService` / `PortfolioAnalyzerService` / `BacktestingService`** из `api/generated`; отдельный wrapper не обязателен, пока нет дублирования вызовов |
| Дублирование смысла экранов | Dashboard vs автоторговля vs виртуальные портфели | Держать разделение ролей экранов по [TARGET §6–7](../frontend/docs/TARGET_FRONTEND_IA.md); в сайдбаре у вторичных групп — подпись `caption`, на страницах риск/performance — пояснение в UI |
| Покрытие тестами UI | Страницы и тяжёлые компоненты в основном без unit-тестов | Наращивать тесты домена (`tradingRequestTransitions`, сторы) и smoke/e2e по мере стабилизации API |

---

## 6. Чеклист синхронизации с бэкендом

- [x] Экран заявок отражает статусы и недопустимые действия согласно state machine ([BACKEND §3.3](./BACKEND_BUSINESS_LOGIC.md#33-торговые-заявки-и-state-machine)); допустимые переходы — [`tradingRequestTransitions.ts`](../frontend/src/domain/tradingRequestTransitions.ts), подсказки к кнопкам — [`tradingRequestUiHints.ts`](../frontend/src/domain/tradingRequestUiHints.ts).
- [x] Индикация режима `paper` / `real` / `micro` согласована с `TradingModeService` (дашборд / автоторговля).
- [x] Виртуальные профили: отображение slug, порогов из `profiles-config`, истории NAV (`/virtual-portfolios`).
- [x] Опциональные инструменты (бэктест, анализатор) вынесены в группу с подписью «вторичный поток»; training/migration в меню не смешиваются с core.
- [ ] При смене OpenAPI — регенерация `frontend/src/api/generated/` и проверка имён методов в таблице §3 (вручную или в CI).

---

*Версия: согласовано с [BACKEND_BUSINESS_LOGIC.md](./BACKEND_BUSINESS_LOGIC.md) и [TARGET_FRONTEND_IA.md](../frontend/docs/TARGET_FRONTEND_IA.md).*
