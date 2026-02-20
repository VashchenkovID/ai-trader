# Чеклист для запуска автоторговли

## ❌ НЕДОСТАТОЧНО: Только настройки в БД

Настройки в БД (`auto_trade_enabled`, `auto_trade_min_confidence`, и т.д.) - это только **первый шаг**. Они контролируют **создание заявок**, но не их **исполнение**.

## ✅ ПОЛНЫЙ ЧЕКЛИСТ

### 1. Настройки в БД (для создания заявок) ✅

```bash
# Проверить настройки
docker exec ai-trader-db psql -U postgres -d postgres -c "SELECT key, value FROM settings WHERE key LIKE 'auto_trade%';"

# Создать недостающие (если нужно)
docker exec ai-trader-db psql -U postgres -d postgres << 'EOF'
INSERT INTO settings (key, value, description, category, "dataType", "lastUpdated")
VALUES 
    ('auto_trade_enabled', 'true', 'Включить автоматическое создание торговых заявок', 'trading', 'boolean', NOW()),
    ('auto_trade_min_confidence', '0.7', 'Минимальная уверенность модели', 'trading', 'number', NOW()),
    ('auto_trade_min_score', '0.65', 'Минимальный score для BUY', 'trading', 'number', NOW()),
    ('auto_trade_min_agreement', '0.6', 'Минимальная согласованность моделей', 'trading', 'number', NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "lastUpdated" = NOW();
EOF
```

**Что это делает:**
- ✅ Включает автоматическое **создание** заявок из рекомендаций
- ✅ Устанавливает пороги для создания заявок

**Что это НЕ делает:**
- ❌ НЕ включает автоматическое **исполнение** заявок
- ❌ НЕ гарантирует, что заявки будут исполняться

---

### 2. Включить AutoPaperTradingService (для исполнения заявок) ⚠️ КРИТИЧНО

**Это нужно сделать ОБЯЗАТЕЛЬНО через API:**

```bash
# Включить автоторговлю
curl -X POST http://your-server:3001/api/auto-paper-trading/enable
```

**Или через фронтенд:**
- Перейти в Настройки → Автоторговля
- Нажать кнопку "Включить"

**Проверить статус:**
```bash
curl http://your-server:3001/api/auto-paper-trading/status
```

**Ожидаемый результат:**
```json
{
  "success": true,
  "data": {
    "isInitialized": true,
    "isEnabled": true,  // ← Должно быть true!
    "currentPhase": "phase1",
    ...
  }
}
```

**Что это делает:**
- ✅ Включает автоматическое **исполнение** заявок
- ✅ Загружает виртуальный портфель
- ✅ Обрабатывает существующие заявки в ожидании

---

### 3. Проверить режим торговли (должен быть 'paper')

```bash
# Проверить текущий режим (через API или логи)
curl http://your-server:3001/api/trading-mode/current
```

**Должно быть:**
```json
{
  "mode": "paper"  // ← Должно быть "paper"
}
```

**Если режим другой:**
- Переключите на режим `paper` через API или интерфейс

---

### 4. Проверить генерацию рекомендаций

Рекомендации должны генерироваться автоматически через `SchedulerService`:
- Обновление кеша: каждые 2 часа
- Быстрое обучение: 08:00, 10:00, 12:00, 14:00, 16:00, 18:00
- Полное обучение: понедельник в 03:00

**Проверить последние рекомендации:**
```bash
docker exec ai-trader-db psql -U postgres -d postgres -c "SELECT figi, recommendation, confidence, score, \"createdAt\" FROM \"Recommendations\" ORDER BY \"createdAt\" DESC LIMIT 10;"
```

**Если рекомендаций нет:**
- Проверьте логи SchedulerService
- Убедитесь, что обучение нейросети запускается
- Проверьте, что кеш данных обновляется

---

### 5. Проверить создание заявок

**Проверить последние заявки:**
```bash
docker exec ai-trader-db psql -U postgres -d postgres -c "SELECT id, figi, action, status, confidence, score, \"tradingMode\", \"createdAt\" FROM trading_requests WHERE \"tradingMode\" = 'paper' ORDER BY \"createdAt\" DESC LIMIT 10;"
```

**Ожидаемый результат:**
- Должны появляться заявки со статусом `PENDING`
- `tradingMode` должен быть `paper`
- `confidence` и `score` должны соответствовать порогам

---

### 6. Проверить исполнение заявок

**Проверить исполненные заявки:**
```bash
docker exec ai-trader-db psql -U postgres -d postgres -c "SELECT id, figi, action, status, \"autoExecuted\", \"executedAt\" FROM trading_requests WHERE \"tradingMode\" = 'paper' AND status = 'EXECUTED' ORDER BY \"executedAt\" DESC LIMIT 10;"
```

**Если заявки не исполняются:**
- Проверьте `isEnabled` в статусе AutoPaperTradingService
- Проверьте логи сервера на ошибки
- Убедитесь, что заявки соответствуют критериям исполнения

---

## 🔍 Диагностика проблем

### Проблема: Заявки не создаются

**Причины:**
1. ❌ `auto_trade_enabled` = `false` в БД
2. ❌ Нет рекомендаций или они не соответствуют порогам
3. ❌ Нейросеть не генерирует рекомендации

**Решение:**
```bash
# Проверить настройки
docker exec ai-trader-db psql -U postgres -d postgres -c "SELECT key, value FROM settings WHERE key = 'auto_trade_enabled';"

# Проверить рекомендации
docker exec ai-trader-db psql -U postgres -d postgres -c "SELECT COUNT(*) FROM \"Recommendations\" WHERE \"createdAt\" > NOW() - INTERVAL '24 hours';"
```

---

### Проблема: Заявки создаются, но не исполняются

**Причины:**
1. ❌ `AutoPaperTradingService.isEnabled` = `false` (не включен через API)
2. ❌ Режим торговли не `paper`
3. ❌ Заявки не соответствуют критериям исполнения

**Решение:**
```bash
# Включить автоторговлю
curl -X POST http://your-server:3001/api/auto-paper-trading/enable

# Проверить статус
curl http://your-server:3001/api/auto-paper-trading/status
```

---

## ✅ Итоговый чеклист

- [ ] Настройки в БД созданы (`auto_trade_enabled`, `min_confidence`, `min_score`, `min_agreement`)
- [ ] `AutoPaperTradingService` включен через API (`POST /api/auto-paper-trading/enable`)
- [ ] Режим торговли = `paper`
- [ ] Рекомендации генерируются (проверить в БД)
- [ ] Заявки создаются (проверить в БД)
- [ ] Заявки исполняются (проверить в БД и логах)

---

## 🚀 Быстрый старт (все команды)

```bash
# 1. Создать настройки в БД
docker exec ai-trader-db psql -U postgres -d postgres << 'EOF'
INSERT INTO settings (key, value, description, category, "dataType", "lastUpdated")
VALUES 
    ('auto_trade_enabled', 'true', 'Включить автоматическое создание торговых заявок', 'trading', 'boolean', NOW()),
    ('auto_trade_min_confidence', '0.7', 'Минимальная уверенность модели', 'trading', 'number', NOW()),
    ('auto_trade_min_score', '0.65', 'Минимальный score для BUY', 'trading', 'number', NOW()),
    ('auto_trade_min_agreement', '0.6', 'Минимальная согласованность моделей', 'trading', 'number', NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "lastUpdated" = NOW();
EOF

# 2. Включить автоторговлю через API
curl -X POST http://your-server:3001/api/auto-paper-trading/enable

# 3. Проверить статус
curl http://your-server:3001/api/auto-paper-trading/status
```

---

## ⚠️ ВАЖНО

**Только настройки в БД НЕДОСТАТОЧНО!**

Вы **ОБЯЗАТЕЛЬНО** должны:
1. ✅ Создать настройки в БД (для создания заявок)
2. ✅ Включить `AutoPaperTradingService` через API (для исполнения заявок)

Без шага 2 заявки будут создаваться, но **НЕ будут исполняться автоматически**.

