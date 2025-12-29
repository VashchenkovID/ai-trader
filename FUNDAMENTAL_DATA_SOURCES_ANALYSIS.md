# Анализ источников данных для фундаментальных показателей

## 📊 Требуемые данные

Согласно плану улучшения нейросетей (Приоритет 1), нам нужны следующие показатели:
- **P/E** (Price-to-Earnings) - отношение цены к прибыли
- **P/B** (Price-to-Book) - отношение цены к балансовой стоимости
- **EV/EBITDA** - отношение стоимости компании к EBITDA
- **ROE** (Return on Equity) - рентабельность собственного капитала (%)
- **Debt/EBITDA** - отношение долга к EBITDA
- **Operating Margin** - операционная маржа (%)
- **Net Margin** - чистая маржа (%)

## 🔍 Анализ investing-com-api-v2

### Что предоставляет библиотека:
- ✅ **Исторические данные** (свечи, котировки)
- ✅ **Валютные пары, акции, индексы**
- ✅ **Настройка периода и интервала**

### Что НЕ предоставляет:
- ❌ **Фундаментальные показатели** (P/E, P/B, ROE и т.д.)
- ❌ **Финансовые отчеты**
- ❌ **Балансовые данные**

### Вывод:
**investing-com-api-v2 НЕ подходит** для получения фундаментальных данных напрямую. Библиотека предназначена только для исторических котировок.

## 💡 Альтернативные решения

### Вариант 1: Парсинг Investing.com напрямую (⚠️ Рисковано)

Investing.com содержит фундаментальные данные на страницах компаний, но:
- ⚠️ Нет официального API
- ⚠️ Может нарушать Terms of Service
- ⚠️ Риск блокировки IP
- ⚠️ Нестабильность (структура страниц может меняться)

**Пример URL для парсинга:**
```
https://ru.investing.com/equities/sberbank-financial-summary
https://ru.investing.com/equities/sberbank-ratios
```

**Реализация:**
```javascript
// Можно использовать Puppeteer для парсинга страниц компаний
// Но это требует:
// 1. Поиск правильных URL для каждой компании
// 2. Парсинг HTML структуры
// 3. Обработка изменений в структуре сайта
```

### Вариант 2: Porti.ru API (✅ Рекомендуется)

**Преимущества:**
- ✅ Официальный API
- ✅ Фундаментальные данные для российских и зарубежных акций
- ✅ Стабильность и надежность
- ✅ Поддержка

**Недостатки:**
- ❌ Платный (нужен токен)
- ❌ Может быть дорого для большого количества инструментов

**Пример запроса:**
```javascript
// GET https://porti.ru/xapi/company/fundamental?code=MOEX:GAZP&token=YOUR_TOKEN&format=json
// Возвращает:
// {
//   "pe": 5.2,
//   "pb": 0.8,
//   "evEbitda": 3.1,
//   "roe": 12.5,
//   ...
// }
```

**Документация:** https://porti.ru/payment/api/docs/fundamental

### Вариант 3: Tinkoff Invest API (✅ ОСНОВНОЙ ИСТОЧНИК)

**Что доступно:**
- ✅ Метод `GetAssetFundamentals` для получения фундаментальных показателей
- ✅ Официальный API, уже интегрирован в систему
- ✅ Надежность и стабильность
- ✅ Поддержка до 100 активов за один запрос

**Структура запроса:**
```javascript
// 1. Получить asset_uid из FIGI через GetAssetBy
const asset = await TinkoffApiService.getAssetBy(figi);
const assetUid = asset.assetUid;

// 2. Запросить фундаментальные данные
const response = await TinkoffApiService.makeRequest(
  '/tinkoff.public.invest.api.contract.v1.InstrumentsService/GetAssetFundamentals',
  {
    assets: [assetUid] // Массив до 100 asset_uid
  }
);
```

**Структура ответа (РЕАЛЬНЫЙ):**
```json
"fundamentals": [{
  "domicileIndicatorCode": "...",
  "assetUid": "...",
  "peRatioTtm": 1.17,                    // ✅ P/E (Price-to-Earnings)
  "priceToBookTtm": 5.02,                // ✅ P/B (Price-to-Book)
  "evToEbitdaMrq": 6.68,                 // ✅ EV/EBITDA
  "roe": 6.43,                           // ✅ ROE (Return on Equity)
  "totalDebtToEbitdaMrq": 6.77,         // ✅ Debt/EBITDA
  "netMarginMrq": 8.76,                  // ✅ Net Margin (%)
  "revenueTtm": 2.02,                    // Выручка (для расчета Operating Margin)
  "ebitdaTtm": 4.14,                     // EBITDA (для расчета Operating Margin)
  "netIncomeTtm": 7.38,                  // Чистая прибыль
  "roic": 6.96,                          // ROIC (бонус)
  "roa": 3.55,                           // ROA (бонус)
  "currentRatioMrq": 6.70,               // Текущая ликвидность (бонус)
  "freeCashFlowTtm": 1.48,               // Свободный денежный поток (бонус)
  "dividendYieldDailyTtm": 3.09,         // Дивидендная доходность (бонус)
  "beta": 2.30,                          // Бета коэффициент (бонус)
  "marketCapitalization": 0.80,          // Рыночная капитализация (бонус)
  "fiscalPeriodStartDate": "2000-01-23",
  "fiscalPeriodEndDate": "2000-01-23",
  // ... и много других показателей
}]
```

**✅ АНАЛИЗ: Все необходимые показатели ЕСТЬ!**

**Доступные показатели:**
1. ✅ **P/E** → `peRatioTtm`
2. ✅ **P/B** → `priceToBookTtm`
3. ✅ **EV/EBITDA** → `evToEbitdaMrq`
4. ✅ **ROE** → `roe`
5. ✅ **Debt/EBITDA** → `totalDebtToEbitdaMrq`
6. ⚠️ **Operating Margin** → можно вычислить: `(ebitdaTtm / revenueTtm) * 100` (приблизительно)
   - Или использовать `netMarginMrq` как fallback
7. ✅ **Net Margin** → `netMarginMrq`

**Дополнительные полезные показатели:**
- `roic` - Return on Invested Capital
- `roa` - Return on Assets
- `currentRatioMrq` - Текущая ликвидность
- `freeCashFlowTtm` - Свободный денежный поток
- `dividendYieldDailyTtm` - Дивидендная доходность
- `beta` - Бета коэффициент (риск)
- `marketCapitalization` - Рыночная капитализация
- `revenueTtm` - Выручка за последние 12 месяцев
- `ebitdaTtm` - EBITDA за последние 12 месяцев
- `netIncomeTtm` - Чистая прибыль за последние 12 месяцев

**⚠️ Важно:**
- `Operating Margin` нет напрямую, но можно вычислить из `ebitdaTtm` и `revenueTtm`
- Или использовать `netMarginMrq` как приближение
- Все показатели уже нормализованы или в правильных единицах измерения

**✅ ВЫВОД: Tinkoff API предоставляет ВСЕ необходимые показатели!**
- Все 7 требуемых показателей доступны (6 напрямую, 1 вычисляется)
- Данные актуальные (TTM - trailing twelve months, MRQ - most recent quarter)
- Официальный источник, надежность гарантирована
- Уже интегрирован в систему, не требует дополнительных токенов
- **Рекомендуется использовать как ЕДИНСТВЕННЫЙ основной источник**
- SmartLab использовать только как fallback для старых данных или если Tinkoff API недоступен

**Документация:** https://developer.tbank.ru/invest/api/instruments-service-get-asset-fundamentals

### Вариант 4: SmartLab API (✅ Для российских акций)

**Преимущества:**
- ✅ Бесплатный доступ (частично)
- ✅ Фундаментальные данные для российских компаний
- ✅ Хорошее покрытие MOEX

**Недостатки:**
- ❌ Только российские акции
- ❌ Может требовать регистрацию

**Пример:**
```javascript
// SmartLab предоставляет данные через свой сайт
// Можно парсить или использовать их API (если доступен)
```

### Вариант 5: Finam API (✅ Платный, но полный)

**Преимущества:**
- ✅ Полные фундаментальные данные
- ✅ Официальный API
- ✅ Хорошее покрытие российских компаний

**Недостатки:**
- ❌ Платный
- ❌ Может быть дорого

## 🎯 Рекомендации

### Краткосрочное решение (MVP):
1. **Начать с Tinkoff Invest API** (основной источник)
   - Использовать метод `GetAssetFundamentals`
   - Получать `asset_uid` через `GetAssetBy` из `FIGI`
   - Интегрировать в `FundamentalDataService`
   - Сохранять данные в БД
   - ⚠️ Проверить, какие показатели реально возвращает API

2. **Добавить SmartLab как fallback** для российских акций
   - Парсинг таблицы с https://smart-lab.ru/q/shares_fundamental/
   - Использовать для показателей, которых нет в Tinkoff API
   - Использовать rate limiting

3. **Добавить Investing.com парсинг** (последний fallback)
   - Только для инструментов, которых нет в других источниках
   - Использовать rate limiting
   - Обрабатывать ошибки gracefully

### Долгосрочное решение:
1. **Множественные источники** с приоритетами:
   - **Tinkoff Invest API** (основной) - для доступных показателей
   - **SmartLab** (fallback для MOEX) - для недостающих показателей
   - **Investing.com парсинг** (fallback для всех) - последний резерв
   - **Porti.ru API** (опционально, платный) - если нужны дополнительные данные
   - **Finam API** (опционально, платный) - если бюджет позволяет

2. **Кеширование и обновление:**
   - Данные обновляются редко (квартально)
   - Кешировать на 3-6 месяцев
   - Обновлять при появлении новых отчетов

## 📝 План интеграции

### Этап 1: Tinkoff Invest API (1-2 дня) - ОСНОВНОЙ
```javascript
// В TinkoffApiService добавить:
async getAssetFundamentals(assetUids) {
  // 1. Запросить данные через GetAssetFundamentals
  // 2. Обработать ответ
  // 3. Вернуть структурированные данные
}

// В FundamentalDataService добавить:
async fetchFromTinkoff(figi) {
  // 1. Получить asset_uid через GetAssetBy(figi)
  // 2. Запросить фундаментальные данные через getAssetFundamentals
  // 3. Извлечь нужные показатели (P/E, P/B, ROE и т.д.)
  // 4. Сохранить в БД
  // 5. Если показателей недостаточно, использовать fallback
}
```

### Этап 2: SmartLab парсинг (1-2 дня) - FALLBACK
```javascript
// В FundamentalDataService добавить:
async fetchFromSmartLab(figi, ticker) {
  // 1. Получить HTML страницы https://smart-lab.ru/q/shares_fundamental/
  // 2. Парсить таблицу table.simple-little-table.little.trades-table
  // 3. Найти строку по тикеру
  // 4. Извлечь показатели: P/E, P/B, ROE, Net Margin
  // 5. Сохранить в БД
}
```

### Этап 3: Investing.com парсинг (2-3 дня) - ПОСЛЕДНИЙ FALLBACK
```javascript
// В FundamentalDataService добавить:
async fetchFromInvesting(figi, ticker) {
  // 1. Найти URL страницы компании
  // 2. Парсить HTML с помощью fetch (без Puppeteer для простоты)
  // 3. Извлечь фундаментальные показатели
  // 4. Сохранить в БД
}
```

## ⚠️ Важные замечания

1. **Rate Limiting:**
   - Не делать слишком много запросов
   - Использовать кеширование
   - Уважать лимиты API

2. **Обработка ошибок:**
   - Если источник недоступен, использовать fallback
   - Логировать ошибки
   - Не падать при отсутствии данных

3. **Нормализация данных:**
   - Разные источники могут использовать разные форматы
   - Нужна нормализация перед сохранением
   - Валидация данных

4. **Юридические аспекты:**
   - Проверить Terms of Service для каждого источника
   - Использовать официальные API когда возможно
   - Для парсинга - использовать разумные интервалы

## 🔗 Полезные ссылки

- **Tinkoff Invest API GetAssetFundamentals:** https://developer.tbank.ru/invest/api/instruments-service-get-asset-fundamentals
- **Tinkoff Invest API (общая документация):** https://tinkoff.github.io/investAPI/
- **SmartLab:** https://smart-lab.ru/q/shares_fundamental/
- **Porti.ru API:** https://porti.ru/payment/api/docs/fundamental (опционально)
- **Finam:** https://www.finam.ru/ (опционально)

