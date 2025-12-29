# Анализ Tinkoff API GetAssetFundamentals

## ✅ Вывод: Все необходимые показатели доступны!

## 📊 Сопоставление требуемых и доступных показателей

| Требуемый показатель | Поле в API | Статус | Примечание |
|---------------------|------------|--------|------------|
| **P/E** (Price-to-Earnings) | `peRatioTtm` | ✅ Есть | Trailing Twelve Months |
| **P/B** (Price-to-Book) | `priceToBookTtm` | ✅ Есть | Trailing Twelve Months |
| **EV/EBITDA** | `evToEbitdaMrq` | ✅ Есть | Most Recent Quarter |
| **ROE** (Return on Equity) | `roe` | ✅ Есть | В процентах |
| **Debt/EBITDA** | `totalDebtToEbitdaMrq` | ✅ Есть | Most Recent Quarter |
| **Operating Margin** | ❌ Нет напрямую | ⚠️ Вычисляется | `(ebitdaTtm / revenueTtm) * 100` |
| **Net Margin** | `netMarginMrq` | ✅ Есть | Most Recent Quarter |

## 🔍 Детальный анализ ответа API

### Основные показатели (требуемые):

```javascript
{
  "peRatioTtm": 1.17,                    // P/E - отношение цены к прибыли
  "priceToBookTtm": 5.02,                // P/B - отношение цены к балансовой стоимости
  "evToEbitdaMrq": 6.68,                 // EV/EBITDA - отношение стоимости компании к EBITDA
  "roe": 6.43,                           // ROE - рентабельность собственного капитала (%)
  "totalDebtToEbitdaMrq": 6.77,         // Debt/EBITDA - отношение долга к EBITDA
  "netMarginMrq": 8.76,                  // Net Margin - чистая маржа (%)
  
  // Для вычисления Operating Margin:
  "revenueTtm": 2.02,                    // Выручка за последние 12 месяцев
  "ebitdaTtm": 4.14,                     // EBITDA за последние 12 месяцев
  "netIncomeTtm": 7.38                   // Чистая прибыль за последние 12 месяцев
}
```

### Дополнительные полезные показатели:

```javascript
{
  "roic": 6.96,                          // ROIC - рентабельность инвестированного капитала
  "roa": 3.55,                           // ROA - рентабельность активов
  "currentRatioMrq": 6.70,               // Текущая ликвидность
  "freeCashFlowTtm": 1.48,               // Свободный денежный поток
  "dividendYieldDailyTtm": 3.09,         // Дивидендная доходность
  "beta": 2.30,                          // Бета коэффициент (риск)
  "marketCapitalization": 0.80,          // Рыночная капитализация
  "priceToSalesTtm": 4.96,               // P/S - отношение цены к выручке
  "freeCashFlowToPrice": 6.87,           // Свободный денежный поток к цене
  "priceToFreeCashFlowTtm": 9.96         // P/FCF - отношение цены к свободному денежному потоку
}
```

## 📝 Формула вычисления Operating Margin

Поскольку `Operating Margin` нет напрямую в API, его можно вычислить:

```javascript
// Вариант 1: Приблизительно через EBITDA
operatingMargin = (ebitdaTtm / revenueTtm) * 100;

// Вариант 2: Использовать Net Margin как приближение
operatingMargin = netMarginMrq; // Если нет других данных

// Вариант 3: Более точный расчет (если есть операционная прибыль)
// operatingMargin = (operatingIncome / revenueTtm) * 100;
// Но operatingIncome нет в ответе API
```

**Рекомендация:** Использовать Вариант 1 (через EBITDA), так как это наиболее близкое приближение к операционной марже.

## 🎯 План интеграции

### Этап 1: Добавить метод в TinkoffApiService

```javascript
// В TinkoffApiService.js
async getAssetFundamentals(assetUids) {
  // assetUids - массив до 100 идентификаторов активов
  const response = await this.makeRequest(
    '/tinkoff.public.invest.api.contract.v1.InstrumentsService/GetAssetFundamentals',
    {
      assets: assetUids
    }
  );
  return response.fundamentals || [];
}

async getAssetBy(figi) {
  // Получить asset_uid из FIGI
  const response = await this.makeRequest(
    '/tinkoff.public.invest.api.contract.v1.InstrumentsService/GetAssetBy',
    {
      id: figi,
      idType: 'INSTRUMENT_ID_TYPE_FIGI'
    }
  );
  return response.asset;
}
```

### Этап 2: Создать FundamentalDataService

```javascript
// В FundamentalDataService.js
async fetchFromTinkoff(figi) {
  // 1. Получить asset_uid из FIGI
  const asset = await TinkoffApiService.getAssetBy(figi);
  if (!asset || !asset.assetUid) {
    return null;
  }
  
  // 2. Запросить фундаментальные данные
  const fundamentals = await TinkoffApiService.getAssetFundamentals([asset.assetUid]);
  if (!fundamentals || fundamentals.length === 0) {
    return null;
  }
  
  const data = fundamentals[0];
  
  // 3. Вычислить Operating Margin
  let operatingMargin = null;
  if (data.ebitdaTtm && data.revenueTtm && data.revenueTtm > 0) {
    operatingMargin = (data.ebitdaTtm / data.revenueTtm) * 100;
  } else {
    // Fallback на Net Margin
    operatingMargin = data.netMarginMrq;
  }
  
  // 4. Сохранить в БД
  return await this.saveFundamentalData({
    figi,
    ticker: asset.ticker,
    period: new Date(data.fiscalPeriodEndDate || Date.now()),
    periodType: 'quarterly',
    pe: data.peRatioTtm,
    pb: data.priceToBookTtm,
    evEbitda: data.evToEbitdaMrq,
    roe: data.roe,
    debtEbitda: data.totalDebtToEbitdaMrq,
    operatingMargin: operatingMargin,
    netMargin: data.netMarginMrq,
    source: 'tinkoff',
    metadata: {
      roic: data.roic,
      roa: data.roa,
      currentRatio: data.currentRatioMrq,
      freeCashFlow: data.freeCashFlowTtm,
      dividendYield: data.dividendYieldDailyTtm,
      beta: data.beta,
      marketCap: data.marketCapitalization,
      revenue: data.revenueTtm,
      ebitda: data.ebitdaTtm,
      netIncome: data.netIncomeTtm
    }
  });
}
```

## ⚠️ Важные замечания

1. **Периоды данных:**
   - `TTM` = Trailing Twelve Months (последние 12 месяцев)
   - `MRQ` = Most Recent Quarter (последний квартал)
   - Нужно учитывать это при сравнении данных

2. **Operating Margin:**
   - Нет напрямую в API
   - Вычисляется через EBITDA/Revenue (приблизительно)
   - Можно использовать Net Margin как fallback

3. **Лимиты API:**
   - До 100 активов за один запрос
   - Нужно батчить запросы для множественных инструментов

4. **Обработка ошибок:**
   - Если `asset_uid` не найден → использовать fallback (SmartLab)
   - Если API недоступен → использовать кеш или fallback
   - Если данных нет → возвращать нули для нейросети

## 🎯 Итоговая рекомендация

**✅ Использовать Tinkoff API как ЕДИНСТВЕННЫЙ основной источник:**
- Все необходимые показатели доступны
- Официальный источник, надежность
- Уже интегрирован в систему
- Актуальные данные (TTM/MRQ)

**Fallback источники:**
- SmartLab - только если Tinkoff API недоступен или не вернул данные
- Investing.com - последний резерв

