# Дизайн-система (краткая шпаргалка)

Референс и полный чеклист: [docs/FRONTEND_TECH_IMPLEMENTATION_PLAN.md](../../docs/FRONTEND_TECH_IMPLEMENTATION_PLAN.md) (§1).

## Визуальный якорь

Тёмная неоновая палитра: см. `docs/assets/ui-reference-landing-dark-neon.png` в корне репозитория.

## Токены и тема

| Что | Где |
| --- | --- |
| Токены (радиусы, drawer и т.д.) | `src/theme/tokens.ts` |
| Палитра, типографика, overrides MUI | `src/theme/appTheme.ts` |
| Глобальные стили | `src/index.scss` |

## Примитивы проекта (над MUI)

| Компонент | Файл | Назначение |
| --------- | ---- | ---------- |
| `FormField` | `src/components/ui/FormField.tsx` | Label, hint, error; дочерний `TextField` без `label` |
| `HighlightCard` | `src/components/ui/HighlightCard.tsx` | Карточка с акцентной рамкой (KPI) |
| `EmptyState` | `src/components/ui/EmptyState.tsx` | Пустые списки / нет данных |
| `ChartContainer` | `src/components/charts/ChartContainer.tsx` | Заголовок + фон для `lightweight-charts` |

Реэкспорт: `src/components/ui/index.ts`.

## Оболочка

- `AppShell`: сайдбар (drawer на mobile), полоса «режим / портфель / баланс», `framer-motion` у контента с учётом `prefers-reduced-motion`.
- Меню: `src/navigation/appSidebar.ts`; лаб-маршруты — `src/config/labRoutes.ts` (`VITE_ENABLE_LAB_ROUTES`).

## Эталон табличной страницы

`/trading-requests`: фильтры, drawer на узком экране, превью заявки, клиентская фильтрация FIGI/дат — `src/utils/tradingRequestFilters.ts`.
