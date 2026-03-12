# Known Bugs And Tech Debt

## Статус миграции (на 2026-03-06)

- Закрыто: миграционные фазы 0-6 завершены на уровне кода и тестов.
- Реализован ops-контур cutover (`shadow/canary/rollback`) и snapshot backup.
- Документ переведен в формат residual backlog (улучшения после migration-complete).

## High priority (residual)

- Production dry-run cutover с реальным внешним трафиком пока не выполнялся.
- Нужно вынести оперативные режимы из in-memory в персистентное хранилище (при scale-out).
- Требуется формализация post-cutover SLO review (первые 7/14/30 дней).

## Medium

- Усилить контрактные тесты для `app/api/v1/training.py` (сейчас низкое покрытие модуля).
- Добавить регламентные джобы очистки/ротации cutover backup snapshot.

## Low

- Дальнейшее расширение доменных метрик для моделей и торговых gate-решений.

