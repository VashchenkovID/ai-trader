# Migration Acceptance Checklist

## Статус документа (на 2026-03-06)

- Чеклист частично закрыт по результатам Фаз 0-2 и clean-rebuild foundations.
- Финальное закрытие acceptance пунктов зависит от завершения write-критичных фаз и cutover.

## Functional

- [x] Все P0 роуты перенесены. (Phase 0-5 + ops endpoints для cutover)
- [ ] Все critical flows проходят e2e smoke.
- [ ] State machines соблюдаются.

## Contracts

- [x] Request/response schema зафиксированы. (для реализованных фаз 0-2)
- [x] Error codes стабилизированы. (platform/read-only)
- [x] Финальный `v1` контракт зафиксирован. (legacy aliases исключены из target)

## Quality

- [x] Unit + integration + contract tests green. (полный прогон: 172 passed, 0 skipped)
- [x] Наблюдаемость покрывает P0 операции. (базовый уровень для platform/read-only)
- [x] Нет критичных известных багов без mitigation.

## Operations

- [x] Runbook cutover/rollback подтвержден. (dry-run уровень, ops endpoints реализованы)
- [x] On-call и алерты настроены. (базовый уровень через monitoring/alerts + metrics)
- [x] Post-cutover мониторинг план утвержден. (ops status + route metrics)

