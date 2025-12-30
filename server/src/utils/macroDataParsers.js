/**
 * Парсеры для макроэкономических данных из различных источников
 */

/**
 * Парсинг JSON ответа от API ЦБ РФ для курсов валют
 * @param {Object} jsonData - JSON объект от https://www.cbr-xml-daily.ru/daily_json.js
 * @returns {Array<Object>} Массив данных {date: Date, value: number, currencyCode: string, previousValue: number}
 */
export function parseCbrCurrencyJson(jsonData) {
    try {
        const records = [];
        
        if (!jsonData || !jsonData.Valute) {
            console.warn('⚠️ JSON от ЦБ РФ не содержит данных о валютах');
            return records;
        }

        // Дата данных
        const dateStr = jsonData.Date || jsonData.Timestamp || new Date().toISOString();
        const date = new Date(dateStr);
        
        if (isNaN(date.getTime())) {
            console.warn('⚠️ Некорректная дата в JSON от ЦБ РФ:', dateStr);
            return records;
        }

        // Обрабатываем только нужные валюты: USD, EUR
        const targetCurrencies = ['USD', 'EUR'];
        
        for (const currencyCode of targetCurrencies) {
            const currencyData = jsonData.Valute[currencyCode];
            
            if (!currencyData) {
                console.log(`ℹ️ Валюта ${currencyCode} не найдена в ответе ЦБ РФ`);
                continue;
            }

            // Значение курса (Value уже включает номинал)
            const value = parseFloat(currencyData.Value);
            const previousValue = currencyData.Previous ? parseFloat(currencyData.Previous) : null;
            const nominal = currencyData.Nominal ? parseInt(currencyData.Nominal) : 1;
            
            if (isNaN(value) || value <= 0) {
                console.warn(`⚠️ Некорректное значение курса для ${currencyCode}:`, currencyData.Value);
                continue;
            }

            // Сохраняем курс за 1 единицу валюты (нормализуем по номиналу)
            const normalizedValue = value / nominal;

            records.push({
                date: date,
                value: normalizedValue,
                currencyCode: currencyCode,
                previousValue: previousValue ? previousValue / nominal : null,
                metadata: {
                    currencyCode: currencyCode,
                    currencyName: currencyData.Name || '',
                    nominal: nominal,
                    rawValue: value,
                    rawPreviousValue: previousValue
                }
            });
        }

        console.log(`📊 Распарсено ${records.length} курсов валют из JSON ЦБ РФ`);
        return records;
    } catch (error) {
        console.error('❌ Ошибка парсинга JSON курсов валют ЦБ РФ:', error);
        return [];
    }
}

/**
 * Парсинг XML ответа от API ЦБ РФ для ключевой ставки
 * @param {string} xmlString - XML строка от DailyInfoWebServ/DailyInfo.asmx/KeyRate
 * @returns {Array<Object>} Массив данных {date: Date, value: number}
 */
export function parseCbrKeyRateXml(xmlString) {
    try {
        const records = [];
        
        // API возвращает XML в формате:
        // <KeyRate>
        //   <KR>
        //     <DT>2025-12-18T00:00:00</DT>
        //     <Rate>16.50</Rate>
        //   </KR>
        // </KeyRate>
        
        const krRegex = /<KR[^>]*>([\s\S]*?)<\/KR>/g;
        let match;

        while ((match = krRegex.exec(xmlString)) !== null) {
            const krXml = match[1];
            const dtMatch = krXml.match(/<DT[^>]*>([^<]+)<\/DT>/);
            const rateMatch = krXml.match(/<Rate[^>]*>([^<]+)<\/Rate>/);

            if (dtMatch && rateMatch) {
                const dateStr = dtMatch[1].trim();
                const valueStr = rateMatch[1].trim().replace(',', '.');
                const date = new Date(dateStr);
                const value = parseFloat(valueStr);

                if (!isNaN(value) && !isNaN(date.getTime())) {
                    records.push({
                        date: date,
                        value: value
                    });
                }
            }
        }

        return records;
    } catch (error) {
        console.error('❌ Ошибка парсинга XML ключевой ставки ЦБ РФ:', error);
        return [];
    }
}

/**
 * Парсинг HTML страницы ЦБ РФ для ключевой ставки
 * @param {string} htmlString - HTML строка
 * @param {Date} startDate - Начальная дата фильтрации
 * @param {Date} endDate - Конечная дата фильтрации
 * @returns {Array<Object>} Массив данных {date: Date, value: number}
 */
export function parseCbrKeyRateHtml(htmlString, startDate, endDate) {
    try {
        const records = [];
        
        // Ищем конкретную структуру: <div class="table-wrapper"> с <table class="data">
        // Структура:
        // <div class="table-wrapper">
        //   <div class="table-caption gray">% годовых</div>
        //   <div class="table">
        //     <table class="data">
        //       <tbody>
        //         <tr><th>Дата</th><th>Ставка</th></tr>
        //         <tr><td>18.12.2025</td><td>16,50</td></tr>
        //       </tbody>
        //     </table>
        //   </div>
        // </div>
        
        // Сначала ищем div с классом "table-wrapper"
        const tableWrapperRegex = /<div[^>]*class="table-wrapper"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i;
        const tableWrapperMatch = htmlString.match(tableWrapperRegex);
        
        if (!tableWrapperMatch) {
            console.warn('⚠️ Не найдено div с классом "table-wrapper" на странице ЦБ РФ');
            // Fallback: ищем любую таблицу с классом "data"
            return parseCbrKeyRateHtmlFallback(htmlString, startDate, endDate);
        }
        
        const tableWrapperHtml = tableWrapperMatch[1];
        
        // Ищем таблицу с классом "data" внутри table-wrapper
        const dataTableRegex = /<table[^>]*class="data"[^>]*>([\s\S]*?)<\/table>/i;
        const dataTableMatch = tableWrapperHtml.match(dataTableRegex);
        
        if (!dataTableMatch) {
            console.warn('⚠️ Не найдено таблицы с классом "data" внутри table-wrapper');
            return parseCbrKeyRateHtmlFallback(htmlString, startDate, endDate);
        }
        
        const tableHtml = dataTableMatch[1];
        
        // Ищем строки таблицы (пропускаем заголовок <th>)
        const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let rowMatch;
        let isHeader = true;
        
        while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
            const rowHtml = rowMatch[1];
            
            // Пропускаем строку заголовка (содержит <th>)
            if (rowHtml.includes('<th')) {
                isHeader = false;
                continue;
            }
            
            // Извлекаем ячейки таблицы (<td>)
            const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
            const cells = [];
            let cellMatch;
            
            while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
                const cellText = cellMatch[1]
                    .replace(/<[^>]+>/g, '') // Удаляем HTML теги
                    .replace(/&nbsp;/g, ' ')
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&quot;/g, '"')
                    .replace(/&#39;/g, "'")
                    .trim();
                cells.push(cellText);
            }
            
            // Ожидаем формат: [дата, ставка]
            if (cells.length >= 2) {
                const dateStr = cells[0];
                const rateStr = cells[1].replace(',', '.').replace(/\s+/g, '');
                
                // Парсим дату (формат: DD.MM.YYYY)
                const dateMatch = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
                if (dateMatch) {
                    const [, day, month, year] = dateMatch;
                    const date = new Date(`${year}-${month}-${day}`);
                    const value = parseFloat(rateStr);
                    
                    if (!isNaN(value) && !isNaN(date.getTime())) {
                        // Фильтруем по датам
                        if (date >= startDate && date <= endDate) {
                            records.push({
                                date: date,
                                value: value
                            });
                        }
                    } else {
                        console.warn(`⚠️ Некорректные данные в строке: дата=${dateStr}, ставка=${rateStr}`);
                    }
                }
            }
        }
        
        // Сортируем по дате
        records.sort((a, b) => a.date.getTime() - b.date.getTime());
        
        console.log(`✅ Распарсено ${records.length} записей из таблицы с классом "data"`);
        return records;
    } catch (error) {
        console.error('❌ Ошибка парсинга HTML ключевой ставки ЦБ РФ:', error);
        return [];
    }
}

/**
 * Fallback метод парсинга HTML (ищет любую таблицу)
 * @param {string} htmlString - HTML строка
 * @param {Date} startDate - Начальная дата фильтрации
 * @param {Date} endDate - Конечная дата фильтрации
 * @returns {Array<Object>} Массив данных {date: Date, value: number}
 */
function parseCbrKeyRateHtmlFallback(htmlString, startDate, endDate) {
    try {
        const records = [];
        
        // Ищем любую таблицу с данными
        const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
        let tableMatch;
        
        while ((tableMatch = tableRegex.exec(htmlString)) !== null) {
            const tableHtml = tableMatch[1];
            
            // Ищем строки таблицы (пропускаем заголовок)
            const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
            let rowMatch;
            let isHeader = true;
            
            while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
                if (isHeader) {
                    isHeader = false;
                    continue; // Пропускаем заголовок
                }
                
                const rowHtml = rowMatch[1];
                
                // Извлекаем ячейки таблицы
                const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
                const cells = [];
                let cellMatch;
                
                while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
                    const cellText = cellMatch[1]
                        .replace(/<[^>]+>/g, '') // Удаляем HTML теги
                        .replace(/&nbsp;/g, ' ')
                        .replace(/&amp;/g, '&')
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .trim();
                    cells.push(cellText);
                }
                
                // Ожидаем формат: [дата, ставка]
                if (cells.length >= 2) {
                    const dateStr = cells[0];
                    const rateStr = cells[1].replace(',', '.').replace(/\s+/g, '');
                    
                    // Парсим дату (формат: DD.MM.YYYY)
                    const dateMatch = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
                    if (dateMatch) {
                        const [, day, month, year] = dateMatch;
                        const date = new Date(`${year}-${month}-${day}`);
                        const value = parseFloat(rateStr);
                        
                        if (!isNaN(value) && !isNaN(date.getTime())) {
                            // Фильтруем по датам
                            if (date >= startDate && date <= endDate) {
                                records.push({
                                    date: date,
                                    value: value
                                });
                            }
                        }
                    }
                }
            }
            
            // Если нашли данные в первой таблице, прекращаем поиск
            if (records.length > 0) {
                break;
            }
        }
        
        // Сортируем по дате
        records.sort((a, b) => a.date.getTime() - b.date.getTime());
        
        return records;
    } catch (error) {
        console.error('❌ Ошибка fallback парсинга HTML ключевой ставки ЦБ РФ:', error);
        return [];
    }
}

/**
 * Парсинг XML ответа от ЦБ РФ (старый метод для других данных)
 * @param {string} xmlString - XML строка
 * @returns {Array<Object>} Массив данных
 */
export function parseCbrXml(xmlString) {
    try {
        if (!xmlString || xmlString.length < 50) {
            console.warn('⚠️ Подозрительно короткий XML от ЦБ РФ');
            return [];
        }

        // Простой парсинг XML (можно улучшить с помощью библиотеки xml2js)
        const records = [];
        
        // Проверяем наличие тега Record
        if (!xmlString.includes('<Record')) {
            console.warn('⚠️ XML от ЦБ РФ не содержит тегов Record');
            console.log('Первые 500 символов XML:', xmlString.substring(0, 500));
            return [];
        }

        const recordRegex = /<Record[^>]*>([\s\S]*?)<\/Record>/g;
        let match;
        let matchCount = 0;

        while ((match = recordRegex.exec(xmlString)) !== null) {
            matchCount++;
            const recordXml = match[1];
            const record = {};

            // Извлекаем основные поля
            // Дата может быть в атрибуте Date тега Record или в теге <Date>
            const dateAttrMatch = match[0].match(/Date="([^"]+)"/);
            const dateTagMatch = recordXml.match(/<Date>([^<]+)<\/Date>/);
            const valueMatch = recordXml.match(/<Value>([^<]+)<\/Value>/);
            const idMatch = recordXml.match(/<Id>([^<]+)<\/Id>/) || match[0].match(/Id="([^"]+)"/);

            let dateStr = null;
            if (dateAttrMatch) {
                dateStr = dateAttrMatch[1];
            } else if (dateTagMatch) {
                dateStr = dateTagMatch[1];
            }

            if (dateStr && valueMatch) {
                // Парсим дату в формате DD.MM.YYYY
                const [day, month, year] = dateStr.split('.');
                record.date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                
                // Парсим значение (заменяем запятую на точку)
                record.value = parseFloat(valueMatch[1].replace(',', '.'));
                
                if (idMatch) {
                    record.id = idMatch[1];
                }
                
                if (!isNaN(record.value) && !isNaN(record.date.getTime())) {
                    records.push(record);
                } else {
                    console.warn(`⚠️ Некорректные данные в записи: дата=${dateStr}, значение=${valueMatch[1]}`);
                }
            } else {
                console.warn(`⚠️ Не удалось извлечь дату или значение из записи ${matchCount}`);
            }
        }

        console.log(`✅ Распарсено ${records.length} записей из ${matchCount} найденных тегов Record`);
        return records;
    } catch (error) {
        console.error('❌ Ошибка парсинга XML ЦБ РФ:', error);
        console.error('XML (первые 1000 символов):', xmlString?.substring(0, 1000));
        return [];
    }
}

/**
 * Парсинг HTML страницы Investing.com для экономических данных (CPI, ВВП, безработица и др.)
 * Ищет блок <div id="releaseInfo" class="releaseInfo bold"> с данными:
 * - Последний выпуск (дата)
 * - Факт (значение)
 * - Прогноз
 * - Пред. (предыдущее значение)
 * @param {string} htmlString - HTML строка
 * @param {Date} startDate - Начальная дата фильтрации
 * @param {Date} endDate - Конечная дата фильтрации
 * @returns {Array<Object>} Массив данных {date: Date, value: number, metadata: Object}
 */
export function parseInvestingInflationHtml(htmlString, startDate, endDate) {
    try {
        const records = [];
        
        // Ищем блок releaseInfo - используем более гибкое регулярное выражение
        // Пробуем найти div с id="releaseInfo" и захватить все содержимое до закрывающего тега
        let releaseInfoHtml = null;
        
        // Вариант 1: точный поиск с id и class
        const releaseInfoRegex1 = /<div[^>]*id="releaseInfo"[^>]*>([\s\S]*?)<\/div>/i;
        const releaseInfoMatch1 = htmlString.match(releaseInfoRegex1);
        
        if (releaseInfoMatch1) {
            releaseInfoHtml = releaseInfoMatch1[1];
            console.log(`📋 Найден блок releaseInfo (вариант 1), длина: ${releaseInfoHtml.length} символов`);
            console.log(`📋 Первые 200 символов: ${releaseInfoHtml.substring(0, 200)}`);
        } else {
            // Вариант 2: поиск только по id
            const releaseInfoRegex2 = /<div[^>]*id=['"]releaseInfo['"][^>]*>([\s\S]*?)<\/div>/i;
            const releaseInfoMatch2 = htmlString.match(releaseInfoRegex2);
            
            if (releaseInfoMatch2) {
                releaseInfoHtml = releaseInfoMatch2[1];
                console.log(`📋 Найден блок releaseInfo (вариант 2), длина: ${releaseInfoHtml.length} символов`);
                console.log(`📋 Первые 200 символов: ${releaseInfoHtml.substring(0, 200)}`);
            } else {
                // Вариант 3: поиск по содержимому "Последний выпуск"
                const lastReleaseRegex = /Последний выпуск[\s\S]{0,500}/i;
                const lastReleaseMatch = htmlString.match(lastReleaseRegex);
                if (lastReleaseMatch) {
                    console.log(`📋 Найдено "Последний выпуск" в HTML, контекст: ${lastReleaseMatch[0]}`);
                }
                console.warn('⚠️ Не найден блок releaseInfo на странице Investing.com');
                return [];
            }
        }
        
        // Извлекаем дату из "Последний выпуск<div class="noBold">03.12.2025</div>"
        // Пробуем несколько вариантов регулярных выражений
        let dateMatch = null;
        
        // Вариант 1: точный поиск
        const dateRegex1 = /Последний выпуск[\s\S]*?<div[^>]*class="[^"]*noBold[^"]*"[^>]*>([^<]+)<\/div>/i;
        dateMatch = releaseInfoHtml.match(dateRegex1);
        
        if (!dateMatch) {
            // Вариант 2: более гибкий поиск
            const dateRegex2 = /Последний выпуск[\s\S]{0,200}?<div[^>]*class=['"]*[^'"]*noBold[^'"]*['"]*[^>]*>([^<]+)<\/div>/i;
            dateMatch = releaseInfoHtml.match(dateRegex2);
        }
        
        if (!dateMatch) {
            // Вариант 3: поиск даты в формате DD.MM.YYYY рядом с "Последний выпуск"
            const dateRegex3 = /Последний выпуск[\s\S]{0,200}?(\d{2}\.\d{2}\.\d{4})/i;
            const dateMatch3 = releaseInfoHtml.match(dateRegex3);
            if (dateMatch3) {
                // Создаем объект, похожий на результат match
                dateMatch = { 1: dateMatch3[1] };
            }
        }
        
        // Если не нашли в releaseInfoHtml, ищем во всем HTML
        if (!dateMatch) {
            const dateRegex4 = /Последний выпуск[\s\S]{0,500}?(\d{2}\.\d{2}\.\d{4})/i;
            const dateMatch4 = htmlString.match(dateRegex4);
            if (dateMatch4) {
                dateMatch = { 1: dateMatch4[1] };
                console.log(`📋 Найдена дата во всем HTML: ${dateMatch4[1]}`);
            }
        }
        
        let recordDate = null;
        if (dateMatch && dateMatch[1]) {
            const dateStr = dateMatch[1].trim();
            console.log(`📋 Найдена дата: ${dateStr}`);
            
            // Парсим дату в формате "DD.MM.YYYY"
            const dateParts = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
            if (dateParts) {
                const [, day, month, year] = dateParts;
                recordDate = new Date(`${year}-${month}-${day}`);
                console.log(`📋 Распарсена дата: ${recordDate.toISOString()}`);
            }
        }
        
        if (!recordDate || isNaN(recordDate.getTime())) {
            console.warn('⚠️ Не удалось распарсить дату из releaseInfo');
            console.log(`📋 Содержимое releaseInfoHtml (первые 500 символов): ${releaseInfoHtml.substring(0, 500)}`);
            return [];
        }
        
        // Упрощенный парсинг: ищем "Факт." и извлекаем значение из div с greenFont
        // Вариант 1: ищем div с классом greenFont после "Факт."
        const factRegex1 = /Факт\.\s*<div[^>]*class="[^"]*greenFont[^"]*"[^>]*>([^<]+)<\/div>/i;
        let factMatch = htmlString.match(factRegex1);
        
        // Вариант 2: ищем любой div после "Факт." в том же span
        if (!factMatch) {
            const factRegex2 = /Факт\.\s*<div[^>]*>([^<]+)<\/div>/i;
            factMatch = htmlString.match(factRegex2);
        }
        
        // Вариант 3: ищем первое число после "Факт." в пределах небольшого контекста
        if (!factMatch) {
            const factRegex3 = /Факт\.\s*[^<]*?(\d+[,\.]\d+)/i;
            factMatch = htmlString.match(factRegex3);
        }
        
        let value = null;
        if (factMatch) {
            const valueStr = factMatch[1].trim().replace(',', '.').replace(/%/g, '').replace(/\s+/g, '');
            value = parseFloat(valueStr);
            console.log(`📋 Найдено значение (Факт): ${valueStr} → ${value}`);
        }
        
        if (value === null || isNaN(value)) {
            console.warn('⚠️ Не удалось извлечь значение из HTML (не найдено "Факт.")');
            return [];
        }
        
        // Ищем прогноз - ищем "Прогноз" и следующее число
        let forecast = null;
        const forecastRegex = /Прогноз[\s\S]{0,300}?(\d+[,\.]\d+)/i;
        const forecastMatch = htmlString.match(forecastRegex);
        if (forecastMatch) {
            const forecastStr = forecastMatch[1].trim().replace(',', '.').replace(/%/g, '').replace(/\s+/g, '');
            const forecastNum = parseFloat(forecastStr);
            if (!isNaN(forecastNum) && !forecastStr.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
                forecast = forecastNum;
                console.log(`📋 Найден прогноз: ${forecastStr} → ${forecast}`);
            }
        }
        
        // Ищем предыдущее значение - ищем "Пред." и следующее число
        let previousValue = null;
        const previousRegex = /Пред\.[\s\S]{0,300}?(\d+[,\.]\d+)/i;
        const previousMatch = htmlString.match(previousRegex);
        if (previousMatch) {
            const previousStr = previousMatch[1].trim().replace(',', '.').replace(/%/g, '').replace(/\s+/g, '');
            const previousNum = parseFloat(previousStr);
            if (!isNaN(previousNum) && !previousStr.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
                previousValue = previousNum;
                console.log(`📋 Найдено предыдущее значение: ${previousStr} → ${previousValue}`);
            }
        }
        
        const metadata = {
            forecast: forecast,
            previousValue: previousValue,
            change: previousValue !== null && previousValue !== 0 ? ((value - previousValue) / previousValue) * 100 : null
        };
        
        // Фильтруем по датам
        if (recordDate >= startDate && recordDate <= endDate) {
            records.push({
                date: recordDate,
                value: value,
                metadata: metadata
            });
            console.log(`✅ Добавлена запись: дата=${recordDate.toISOString()}, значение=${value}`);
        } else {
            console.log(`ℹ️ Запись вне диапазона дат: ${recordDate.toISOString()} (диапазон: ${startDate.toISOString()} - ${endDate.toISOString()})`);
        }
        
        return records;
    } catch (error) {
        console.error('❌ Ошибка парсинга HTML Investing.com (экономический календарь):', error);
        return [];
    }
}

/**
 * Парсинг HTML страницы TradingView для индекса волатильности RVI
 * Ищет элемент с data-qa-id="symbol-last-value" или классом js-symbol-last
 * Важно: не использовать генерируемые классы типа zoF9r75I, только стабильные селекторы
 * @param {string} htmlString - HTML строка
 * @param {Date} startDate - Начальная дата фильтрации
 * @param {Date} endDate - Конечная дата фильтрации
 * @returns {Array<Object>} Массив данных {date: Date, value: number, metadata: Object}
 */
export function parseTradingViewRviHtml(htmlString, startDate, endDate) {
    try {
        const records = [];
        
        console.log('🔍 Начинаем парсинг RVI из Investing.com...');
        
        // Ищем элемент с атрибутом data-test="instrument-price-last"
        // Поддерживаем как двойные, так и одинарные кавычки
        const priceElementRegex = /<[^>]*\s+data-test=["']instrument-price-last["'][^>]*>([\s\S]*?)<\/[^>]+>/i;
        const priceElementMatch = htmlString.match(priceElementRegex);
        
        console.log(`📋 Поиск data-test="instrument-price-last": ${priceElementMatch ? 'найден' : 'не найден'}`);
        
        let valueHtml = null;
        let foundBy = null;
        
        if (priceElementMatch) {
            valueHtml = priceElementMatch[1];
            foundBy = 'data-test="instrument-price-last"';
            console.log(`📋 HTML содержимое элемента: ${valueHtml.substring(0, 300)}`);
        } else {
            // Пробуем альтернативный вариант - ищем элемент с data-test и извлекаем значение из него
            const altRegex = /<[^>]*\s+data-test=["']instrument-price-last["'][^>]*>([^<]+)/i;
            const altMatch = htmlString.match(altRegex);
            if (altMatch) {
                valueHtml = altMatch[1];
                foundBy = 'data-test="instrument-price-last" (альтернативный)';
                console.log(`📋 HTML содержимое элемента (альтернативный способ): ${valueHtml.substring(0, 300)}`);
            } else {
                console.warn('⚠️ Элемент с data-test="instrument-price-last" не найден!');
                // Выводим фрагмент HTML для отладки
                const dataTestIndex = htmlString.indexOf('data-test');
                if (dataTestIndex !== -1) {
                    const debugFragment = htmlString.substring(Math.max(0, dataTestIndex - 200), dataTestIndex + 500);
                    console.log(`📋 Фрагмент HTML вокруг "data-test" (первые 700 символов): ${debugFragment.substring(0, 700)}`);
                }
            }
        }
        
        if (valueHtml) {
            // Удаляем все HTML теги и собираем текст (значение может быть разбито на несколько span'ов)
            const valueText = valueHtml.replace(/<[^>]*>/g, '').trim();
            console.log(`📋 Текст после удаления HTML тегов: "${valueText}"`);
            
            // Очищаем строку: заменяем запятую на точку, убираем пробелы и нечисловые символы (кроме точки и минуса)
            let valueStr = valueText.replace(/,/g, '.').replace(/\s+/g, '').replace(/[^\d.-]/g, '');
            
            // Если значение начинается с точки, добавляем ноль
            if (valueStr.startsWith('.')) {
                valueStr = '0' + valueStr;
            }
            
            console.log(`📋 Очищенная строка для парсинга: "${valueStr}"`);
            
            const value = parseFloat(valueStr);
            
            if (!isNaN(value) && value > 0) {
                console.log(`✅ Извлечено значение RVI из Investing.com (${foundBy}): ${valueText} → ${value}`);
                
                // Извлекаем изменение и процент изменения (для Investing.com могут быть другие селекторы)
                const metadata = {};
                
                // Ищем изменение на Investing.com (может быть в разных форматах)
                // Пробуем найти data-test="instrument-price-change" или похожие атрибуты
                const changeRegex = /<[^>]*\s+data-test=["']instrument-price-change["'][^>]*>([\s\S]*?)<\/[^>]+>/i;
                const changeMatch = htmlString.match(changeRegex);
                if (changeMatch) {
                    const changeText = changeMatch[1].replace(/<[^>]*>/g, '').trim();
                    const changeStr = changeText.replace(/[−-]/g, '-').replace(/,/g, '.').replace(/\s+/g, '').replace(/[^\d.-]/g, '');
                    const changeValue = parseFloat(changeStr);
                    if (!isNaN(changeValue)) {
                        metadata.change = changeValue;
                        console.log(`📋 Найдено изменение: ${changeText} → ${changeValue}`);
                    }
                }
                
                // Ищем процент изменения
                const changePercentRegex = /<[^>]*\s+data-test=["']instrument-price-change-percent["'][^>]*>([\s\S]*?)<\/[^>]+>/i;
                const changePercentMatch = htmlString.match(changePercentRegex);
                if (changePercentMatch) {
                    const changePercentText = changePercentMatch[1].replace(/<[^>]*>/g, '').trim();
                    const changePercentStr = changePercentText.replace(/[−-]/g, '-').replace(/,/g, '.').replace(/%/g, '').replace(/\s+/g, '').replace(/[^\d.-]/g, '');
                    const changePercentValue = parseFloat(changePercentStr);
                    if (!isNaN(changePercentValue)) {
                        metadata.changePercent = changePercentValue;
                        console.log(`📋 Найден процент изменения: ${changePercentText} → ${changePercentValue}`);
                    }
                }
                
                // Используем текущую дату
                const recordDate = new Date();
                const recordDateStart = new Date(recordDate.getFullYear(), recordDate.getMonth(), recordDate.getDate());
                
                // Фильтруем по датам (сравниваем только даты, без времени)
                if (recordDateStart >= startDate && recordDateStart <= endDate) {
                    records.push({
                        date: recordDate,
                        value: value,
                        metadata: metadata
                    });
                    console.log(`✅ Добавлена запись RVI из Investing.com (${foundBy}): дата=${recordDate.toISOString()}, значение=${value}, изменение=${metadata.change || 'N/A'}, изменение %=${metadata.changePercent || 'N/A'}`);
                } else {
                    console.log(`ℹ️ Запись RVI вне диапазона дат: ${recordDateStart.toISOString()} (диапазон: ${startDate.toISOString()} - ${endDate.toISOString()})`);
                }
                
                return records;
            } else {
                console.warn(`⚠️ Не удалось распарсить значение RVI из ${foundBy}: "${valueText}" -> "${valueStr}" -> ${value}`);
                console.log(`📋 HTML элемента значения (полный): ${valueHtml}`);
                
                // Пробуем найти число вручную в HTML
                const numberMatch = valueHtml.match(/(\d+[,\.]\d+)/);
                if (numberMatch) {
                    const manualValueStr = numberMatch[1].replace(/,/g, '.');
                    const manualValue = parseFloat(manualValueStr);
                    if (!isNaN(manualValue) && manualValue > 0) {
                        console.log(`📋 Найдено значение вручную: ${manualValueStr} → ${manualValue}`);
                        // Используем найденное значение
                        const recordDate = new Date();
                        const recordDateStart = new Date(recordDate.getFullYear(), recordDate.getMonth(), recordDate.getDate());
                        const metadata = {};
                        
                        if (recordDateStart >= startDate && recordDateStart <= endDate) {
                            records.push({
                                date: recordDate,
                                value: manualValue,
                                metadata: metadata
                            });
                            console.log(`✅ Добавлена запись RVI из Investing.com (ручной поиск): дата=${recordDate.toISOString()}, значение=${manualValue}`);
                        }
                        return records;
                    }
                }
            }
        }
        
        // Если дошли сюда, значит не нашли значение ни одним из способов
        console.warn('⚠️ Не удалось найти значение RVI ни одним из способов');
        return [];
    } catch (error) {
        console.error('❌ Ошибка парсинга HTML RVI Investing.com:', error);
        return [];
    }
}

/**
 * Парсинг HTML страницы Мосбиржи для индекса волатильности RVI (старый метод, оставлен для совместимости)
 * @param {string} htmlString - HTML строка
 * @param {Date} startDate - Начальная дата фильтрации
 * @param {Date} endDate - Конечная дата фильтрации
 * @returns {Array<Object>} Массив данных {date: Date, value: number, metadata: Object}
 */
export function parseMoexRviHtml(htmlString, startDate, endDate) {
    try {
        const records = [];
        
        // Ищем таблицу с классом "last_values_table last_values_left_table"
        // Структура:
        // <table class="last_values_table last_values_left_table">
        //   <thead>
        //     <tr><td>Значение <span>18.12.2025 17:22:45</span></td></tr>
        //     <tr><td><span>32,42</span></td></tr>
        //   </thead>
        //   <tbody>...</tbody>
        // </table>
        
        const tableRegex = /<table[^>]*class="[^"]*last_values_table[^"]*"[^>]*>([\s\S]*?)<\/table>/i;
        const tableMatch = htmlString.match(tableRegex);
        
        if (!tableMatch) {
            console.warn('⚠️ Не найдено таблицы с классом "last_values_table" на странице Мосбиржи');
            return [];
        }
        
        const tableHtml = tableMatch[1];
        console.log(`📋 Найдена таблица RVI, длина: ${tableHtml.length} символов`);
        
        // Извлекаем дату и время из заголовка
        // Формат: <span class="indices_open_time">18.12.2025 17:22:45</span>
        const dateTimeRegex = /<span[^>]*class="[^"]*indices_open_time[^"]*"[^>]*>([^<]+)<\/span>/i;
        const dateTimeMatch = tableHtml.match(dateTimeRegex);
        
        let recordDate = new Date(); // По умолчанию текущая дата
        
        if (dateTimeMatch) {
            const dateTimeStr = dateTimeMatch[1].trim();
            console.log(`📋 Найдена дата/время: ${dateTimeStr}`);
            
            // Парсим дату в формате "DD.MM.YYYY HH:mm:ss"
            const dateTimeParts = dateTimeStr.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
            if (dateTimeParts) {
                const [, day, month, year, hour, minute, second] = dateTimeParts;
                recordDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
                console.log(`📋 Распарсена дата: ${recordDate.toISOString()}`);
            } else {
                // Пробуем только дату без времени
                const dateParts = dateTimeStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
                if (dateParts) {
                    const [, day, month, year] = dateParts;
                    recordDate = new Date(`${year}-${month}-${day}`);
                    console.log(`📋 Распарсена дата (без времени): ${recordDate.toISOString()}`);
                }
            }
        }
        
        // Извлекаем значение индекса
        // Формат: <td colspan="2" class="values_tr_second"><span class=""> 32,39 </span></td>
        // Пробуем несколько вариантов поиска
        let valueMatch = null;
        let valueStr = null;
        
        // Вариант 1: точный поиск с colspan="2"
        valueMatch = tableHtml.match(/<td[^>]*colspan="2"[^>]*class="[^"]*values_tr_second[^"]*"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i);
        if (valueMatch) {
            valueStr = valueMatch[1];
            console.log(`📋 Найдено значение (вариант 1): ${valueStr}`);
        }
        
        // Вариант 2: поиск без colspan
        if (!valueMatch) {
            valueMatch = tableHtml.match(/<td[^>]*class="[^"]*values_tr_second[^"]*"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i);
            if (valueMatch) {
                valueStr = valueMatch[1];
                console.log(`📋 Найдено значение (вариант 2): ${valueStr}`);
            }
        }
        
        // Вариант 3: поиск любого span внутри td с классом values_tr_second
        if (!valueMatch) {
            const tdMatch = tableHtml.match(/<td[^>]*class="[^"]*values_tr_second[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
            if (tdMatch) {
                const tdContent = tdMatch[1];
                const spanMatch = tdContent.match(/<span[^>]*>([^<]+)<\/span>/i);
                if (spanMatch) {
                    valueStr = spanMatch[1];
                    console.log(`📋 Найдено значение (вариант 3): ${valueStr}`);
                }
            }
        }
        
        if (!valueStr) {
            console.warn('⚠️ Не найдено значение индекса RVI в таблице');
            console.log(`📋 Первые 500 символов таблицы для отладки:`, tableHtml.substring(0, 500));
            return [];
        }
        
        valueStr = valueStr.trim().replace(',', '.').replace(/\s+/g, '');
        const value = parseFloat(valueStr);
        
        console.log(`📋 Извлечено значение RVI: ${valueStr} → ${value}`);
        
        if (isNaN(value)) {
            console.warn(`⚠️ Некорректное значение RVI: ${valueStr}`);
            return [];
        }
        
        // Извлекаем дополнительные данные из tbody (открытие, максимум, минимум)
        const tbodyRegex = /<tbody>([\s\S]*?)<\/tbody>/i;
        const tbodyMatch = tableHtml.match(tbodyRegex);
        const metadata = {};
        
        if (tbodyMatch) {
            const tbodyHtml = tbodyMatch[1];
            
            // Ищем строки с данными
            const rowRegex = /<tr[^>]*class="[^"]*value_row[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
            let rowMatch;
            
            while ((rowMatch = rowRegex.exec(tbodyHtml)) !== null) {
                const rowHtml = rowMatch[1];
                
                // Извлекаем название и значение
                const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
                const cells = [];
                let cellMatch;
                
                while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
                    const cellText = cellMatch[1]
                        .replace(/<[^>]+>/g, '')
                        .replace(/&nbsp;/g, ' ')
                        .trim();
                    cells.push(cellText);
                }
                
                if (cells.length >= 2) {
                    const label = cells[0].toLowerCase();
                    const cellValue = cells[1].replace(',', '.').replace(/\s+/g, '');
                    
                    if (label.includes('открытие')) {
                        metadata.open = parseFloat(cellValue);
                    } else if (label.includes('максимальное')) {
                        metadata.high = parseFloat(cellValue);
                    } else if (label.includes('минимальное')) {
                        metadata.low = parseFloat(cellValue);
                    }
                }
            }
        }
        
        // Фильтруем по датам
        if (recordDate >= startDate && recordDate <= endDate) {
            records.push({
                date: recordDate,
                value: value,
                metadata: metadata
            });
            console.log(`✅ Добавлена запись RVI: дата=${recordDate.toISOString()}, значение=${value}`);
        } else {
            console.log(`ℹ️ Запись RVI вне диапазона дат: ${recordDate.toISOString()} (диапазон: ${startDate.toISOString()} - ${endDate.toISOString()})`);
        }
        
        return records;
    } catch (error) {
        console.error('❌ Ошибка парсинга HTML RVI Мосбиржи:', error);
        return [];
    }
}

/**
 * Парсинг JSON ответа от Мосбиржи (старый метод, может использоваться для других данных)
 * @param {Object} jsonData - JSON данные
 * @returns {Array<Object>} Массив данных
 */
export function parseMoexJson(jsonData) {
    try {
        const records = [];

        if (!jsonData) {
            console.warn('⚠️ JSON от Мосбиржи пустой');
            return [];
        }

        // Мосбиржа возвращает данные в структуре analytics.data
        // Структура: { analytics: { data: [[date, value, ...], ...], metadata: {...} } }
        let dataArray = null;
        
        if (jsonData.analytics) {
            console.log(`📋 Структура analytics:`, Object.keys(jsonData.analytics));
            console.log(`📋 analytics.data существует:`, jsonData.analytics.data !== undefined);
            console.log(`📋 analytics.data является массивом:`, Array.isArray(jsonData.analytics.data));
            if (jsonData.analytics.data) {
                console.log(`📋 Длина analytics.data:`, jsonData.analytics.data.length);
                if (jsonData.analytics.columns) {
                    console.log(`📋 Колонки:`, jsonData.analytics.columns);
                }
                if (jsonData.analytics.data.length > 0) {
                    console.log(`📋 Пример первой записи:`, JSON.stringify(jsonData.analytics.data[0]).substring(0, 300));
                }
            }
            
            if (jsonData.analytics.data && Array.isArray(jsonData.analytics.data) && jsonData.analytics.data.length > 0) {
                dataArray = jsonData.analytics.data;
                console.log(`📊 Найдено ${dataArray.length} записей в analytics.data`);
            } else if (jsonData.analytics.columns && jsonData.analytics.data && Array.isArray(jsonData.analytics.data)) {
                // Данные могут быть в формате массива массивов с колонками
                dataArray = jsonData.analytics.data;
                console.log(`📊 Найдено ${dataArray.length} записей в analytics.data (формат с колонками)`);
            }
        }
        
        if (!dataArray && jsonData.rvi && Array.isArray(jsonData.rvi.data)) {
            dataArray = jsonData.rvi.data;
        } else if (jsonData.data && Array.isArray(jsonData.data)) {
            dataArray = jsonData.data;
        } else if (Array.isArray(jsonData)) {
            dataArray = jsonData;
        } else {
            // Пытаемся найти массив данных в любой вложенной структуре
            const findDataArray = (obj, depth = 0) => {
                if (depth > 5) return null; // Ограничиваем глубину поиска
                if (Array.isArray(obj) && obj.length > 0) {
                    // Проверяем, что это массив массивов (типичная структура Мосбиржи)
                    if (obj[0] && Array.isArray(obj[0])) {
                        return obj;
                    }
                    return obj;
                }
                if (typeof obj !== 'object' || obj === null) return null;
                for (const key in obj) {
                    if (key === 'data' && Array.isArray(obj[key])) {
                        return obj[key];
                    }
                    const nested = findDataArray(obj[key], depth + 1);
                    if (nested) return nested;
                }
                return null;
            };
            dataArray = findDataArray(jsonData);
        }

        if (!dataArray || dataArray.length === 0) {
            console.warn('⚠️ Не найдено массива данных в JSON Мосбиржи');
            console.log('Структура JSON (первые ключи):', Object.keys(jsonData));
            if (jsonData.analytics) {
                console.log('Структура analytics:', Object.keys(jsonData.analytics));
            }
            return [];
        }

        console.log(`📊 Обработка массива данных Мосбиржи, элементов: ${dataArray.length}`);
        
        // Детальная отладка первых элементов
        if (dataArray.length > 0) {
            console.log(`🔍 Первые 3 элемента для анализа:`);
            for (let i = 0; i < Math.min(3, dataArray.length); i++) {
                const item = dataArray[i];
                console.log(`  [${i}] Тип: ${typeof item}, Является массивом: ${Array.isArray(item)}`);
                if (Array.isArray(item)) {
                    console.log(`  [${i}] Длина: ${item.length}, Содержимое:`, JSON.stringify(item));
                } else if (typeof item === 'object' && item !== null) {
                    console.log(`  [${i}] Ключи:`, Object.keys(item));
                    console.log(`  [${i}] Содержимое:`, JSON.stringify(item, null, 2).substring(0, 300));
                } else {
                    console.log(`  [${i}] Значение:`, item);
                }
            }
        }

        for (let i = 0; i < dataArray.length; i++) {
            const item = dataArray[i];
            let dateStr = null;
            let value = null;

            // Мосбиржа может возвращать данные как массив [date, value, ...] или как объект
            if (Array.isArray(item)) {
                // Формат массива: [date, value, ...]
                console.log(`🔍 Обработка элемента [${i}] (массив, длина: ${item.length}):`, JSON.stringify(item));
                
                if (item.length >= 2) {
                    dateStr = item[0];
                    value = item[1];
                    console.log(`  → Извлечено: дата=${dateStr}, значение=${value}`);
                } else {
                    console.warn(`  ⚠️ Массив слишком короткий (длина: ${item.length})`);
                }
            } else if (typeof item === 'object' && item !== null) {
                // Формат объекта
                console.log(`🔍 Обработка элемента [${i}] (объект):`, JSON.stringify(item, null, 2).substring(0, 200));
                
                dateStr = item.trade_date || item.date || item.tradedate || item.tradeDate || item[0];
                value = item.value !== undefined ? item.value : 
                       (item.close !== undefined ? item.close : 
                       (item.rvi !== undefined ? item.rvi : 
                       (item[1] !== undefined ? item[1] : null)));
                
                console.log(`  → Извлечено: дата=${dateStr}, значение=${value}`);
            } else {
                console.warn(`  ⚠️ Неожиданный тип элемента [${i}]: ${typeof item}, значение:`, item);
            }

            if (dateStr && value !== null && value !== undefined) {
                const date = new Date(dateStr);
                const numValue = parseFloat(value);
                
                console.log(`  → Парсинг: дата=${dateStr} → ${date.toISOString()}, значение=${value} → ${numValue}`);
                
                if (!isNaN(numValue) && !isNaN(date.getTime())) {
                    records.push({
                        date: date,
                        value: numValue,
                        metadata: {
                            index: item.index || (Array.isArray(item) ? item[2] : null) || null,
                            close: item.close || (Array.isArray(item) ? item[1] : null) || null
                        }
                    });
                    console.log(`  ✅ Запись добавлена`);
                } else {
                    console.warn(`  ⚠️ Некорректные данные в записи Мосбиржи: дата=${dateStr} (isNaN: ${isNaN(date.getTime())}), значение=${value} (isNaN: ${isNaN(numValue)})`);
                }
            } else {
                console.warn(`  ⚠️ Не удалось извлечь дату или значение из элемента [${i}]`);
            }
        }

        console.log(`✅ Распарсено ${records.length} записей из ${dataArray.length} элементов массива`);
        return records;
    } catch (error) {
        console.error('❌ Ошибка парсинга JSON Мосбиржи:', error);
        console.error('JSON (первые 1000 символов):', JSON.stringify(jsonData, null, 2).substring(0, 1000));
        return [];
    }
}

/**
 * Нормализация данных индикатора
 * @param {string} indicatorType - Тип индикатора
 * @param {Object} rawData - Сырые данные
 * @returns {Object} Нормализованные данные
 */
export function normalizeIndicator(indicatorType, rawData) {
    try {
        // Рассчитываем изменение, если есть предыдущее значение
        let change = rawData.change || null;
        if (change === null && rawData.previousValue !== null && rawData.previousValue !== undefined && rawData.value !== undefined) {
            change = calculateChange(rawData.value, rawData.previousValue);
        }

        const normalized = {
            indicatorType: indicatorType,
            value: rawData.value || 0,
            period: rawData.date || new Date(),
            periodType: determinePeriodType(rawData.date, indicatorType),
            unit: determineUnit(indicatorType),
            metadata: {
                change: change,
                previousValue: rawData.previousValue || null,
                ...(rawData.metadata || {})
            }
        };

        return normalized;
    } catch (error) {
        console.error(`❌ Ошибка нормализации индикатора ${indicatorType}:`, error);
        return null;
    }
}

/**
 * Определение типа периода на основе даты и типа индикатора
 */
function determinePeriodType(date, indicatorType) {
    if (!date) return 'monthly';

    // ВВП обычно квартальный
    if (indicatorType === 'gdp') {
        return 'quarterly';
    }

    // Ставки, индексы и курсы валют обычно ежедневные
    if (indicatorType === 'interest_rate' || indicatorType === 'volatility_index' || indicatorType === 'currency_rate') {
        return 'daily';
    }

    // Остальное обычно месячное
    return 'monthly';
}

/**
 * Определение единицы измерения
 */
function determineUnit(indicatorType) {
    const unitMap = {
        'inflation': 'percent',
        'interest_rate': 'percent',
        'gdp': 'percent',
        'unemployment': 'percent',
        'sentiment': 'index',
        'volatility_index': 'index',
        'oil_price': 'absolute',
        'currency_rate': 'absolute'
    };

    return unitMap[indicatorType] || 'percent';
}

/**
 * Валидация данных индикатора
 * @param {Object} indicator - Данные индикатора
 * @returns {Object} {valid: boolean, errors: Array<string>}
 */
export function validateIndicator(indicator) {
    const errors = [];

    if (!indicator.indicatorType) {
        errors.push('Отсутствует тип индикатора');
    }

    if (indicator.value === undefined || indicator.value === null) {
        errors.push('Отсутствует значение индикатора');
    } else if (isNaN(indicator.value)) {
        errors.push('Значение индикатора не является числом');
    }

    if (!indicator.period) {
        errors.push('Отсутствует период данных');
    } else if (!(indicator.period instanceof Date) && isNaN(Date.parse(indicator.period))) {
        errors.push('Некорректная дата периода');
    }

    if (!indicator.source) {
        errors.push('Отсутствует источник данных');
    }

    // Проверка диапазонов значений
    if (indicator.value !== undefined && !isNaN(indicator.value)) {
        switch (indicator.indicatorType) {
            case 'inflation':
                if (indicator.value < -10 || indicator.value > 100) {
                    errors.push(`Некорректное значение инфляции: ${indicator.value}%`);
                }
                break;
            case 'interest_rate':
                // Ключевая ставка ЦБ РФ обычно в диапазоне 0-30%
                // Значения выше 50% скорее всего не являются ключевой ставкой
                // Но не отклоняем их полностью, а только предупреждаем
                if (indicator.value < 0) {
                    errors.push(`Некорректное значение ставки: ${indicator.value}% (отрицательное)`);
                } else if (indicator.value > 50) {
                    // Значения > 50% подозрительны для ключевой ставки
                    // Но не добавляем ошибку, чтобы данные сохранились для анализа
                    console.warn(`⚠️ Подозрительное значение ставки: ${indicator.value}% (ожидается 0-30% для ключевой ставки)`);
                }
                break;
            case 'unemployment':
                if (indicator.value < 0 || indicator.value > 50) {
                    errors.push(`Некорректное значение безработицы: ${indicator.value}%`);
                }
                break;
            case 'gdp':
                if (indicator.value < -50 || indicator.value > 50) {
                    errors.push(`Некорректное значение роста ВВП: ${indicator.value}%`);
                }
                break;
            case 'currency_rate':
                // Курсы валют к RUB обычно в диапазоне 10-500
                // Значения вне этого диапазона подозрительны, но не отклоняем полностью
                if (indicator.value <= 0) {
                    errors.push(`Некорректное значение курса валюты: ${indicator.value} (должно быть положительным)`);
                } else if (indicator.value > 1000) {
                    console.warn(`⚠️ Подозрительное значение курса валюты: ${indicator.value} (обычно ожидается 10-500)`);
                }
                break;
        }
    }

    return {
        valid: errors.length === 0,
        errors: errors
    };
}

/**
 * Расчет изменения значения (change) на основе предыдущего значения
 * @param {number} currentValue - Текущее значение
 * @param {number} previousValue - Предыдущее значение
 * @returns {number} Изменение в процентах
 */
export function calculateChange(currentValue, previousValue) {
    if (previousValue === null || previousValue === undefined || previousValue === 0) {
        return 0;
    }
    return ((currentValue - previousValue) / previousValue) * 100;
}

