# Диагностика проблем с автоторговлей

## Что было исправлено

1. **Обработка `auto_trade_enabled`** - теперь правильно обрабатывает строковые значения из БД
2. **Парсинг JSON `analysis`** - добавлена обработка случая, когда Sequelize возвращает JSON как строку
3. **Подробное логирование** - добавлено логирование на каждом этапе проверки

## Как проверить

### 1. Проверьте настройки в БД

```bash
docker exec ai-trader-db psql -U postgres -d postgres -c "SELECT key, value FROM settings WHERE key LIKE 'auto_trade%';"
```

Должны быть установлены:
- `auto_trade_enabled` = `true` (или `'true'` как строка)
- `auto_trade_min_confidence` = `0.7`
- `auto_trade_min_score` = `0.6`
- `auto_trade_min_agreement` = `0.6`

### 2. Запустите скрипт диагностики

```bash
node check-auto-trade-debug.js
```

Скрипт покажет:
- Какие настройки найдены в БД
- Какие рекомендации проходят проверку
- Почему рекомендации не проходят проверку
- Сколько активных заявок уже существует

### 3. Проверьте логи сервера

После запуска анализа рекомендаций проверьте логи на наличие сообщений:

**Успешное создание заявки:**
```
Auto-created trading request
```

**Рекомендация не проходит проверку:**
```
Recommendation does not meet confidence/score thresholds
Recommendation does not meet agreement threshold
```

**Начало проверки:**
```
Checking auto-trade eligibility
```

### 4. Проверьте, что рекомендации обновляются

Код теперь обрабатывает **все** сохраненные рекомендации (не только новые). Но важно, чтобы:
- Рекомендации действительно обновлялись в БД
- `analysis.agreement` был сохранен в БД

Проверьте структуру `analysis` в БД:

```bash
docker exec ai-trader-db psql -U postgres -d postgres -c "SELECT figi, ticker, recommendation, confidence, score, analysis->>'agreement' as agreement FROM \"Recommendations\" WHERE \"isActive\" = true LIMIT 5;"
```

## Возможные проблемы

### Проблема 1: `agreement` не сохраняется в БД

Если `analysis.agreement` отсутствует в БД, код попытается получить его из `IntegratedAIService`, но это может не сработать.

**Решение:** Убедитесь, что при сохранении рекомендаций `agreement` включается в `analysis`.

### Проблема 2: Настройки не читаются правильно

Если настройки в БД хранятся как строки, но код ожидает числа/boolean.

**Решение:** Исправлено в коде - теперь используется `parseFloat()` и правильная обработка boolean.

### Проблема 3: Рекомендации не обновляются

Если рекомендации не обновляются, код не будет их обрабатывать.

**Решение:** Код теперь обрабатывает все рекомендации, но нужно убедиться, что они действительно обновляются при анализе.

### Проблема 4: Заявки уже существуют

Если для рекомендации уже есть заявка со статусом `pending` или `approved`, новая заявка не будет создана.

**Решение:** Это нормальное поведение. Проверьте существующие заявки:

```bash
docker exec ai-trader-db psql -U postgres -d postgres -c "SELECT figi, status, \"createdAt\" FROM \"TradingRequests\" WHERE status IN ('pending', 'approved') ORDER BY \"createdAt\" DESC LIMIT 10;"
```

## Следующие шаги

1. Запустите скрипт диагностики
2. Проверьте логи сервера
3. Убедитесь, что настройки установлены правильно
4. Проверьте, что рекомендации обновляются с `agreement` в `analysis`

