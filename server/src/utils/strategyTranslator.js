/**
 * Переводчик названий стратегий на русский язык
 */

const strategyTranslations = {
    // Стратегии Tinkoff API
    'True Strength Index': 'Индекс истинной силы',
    'TSI': 'Индекс истинной силы',
    'Аналитики БКС': 'Аналитики БКС',
    'Аналитики Атон': 'Аналитики Атон',
    'Аналитики ВТБ': 'Аналитики ВТБ',
    'Аналитики Сбер': 'Аналитики Сбер',
    'Аналитики Ренессанс': 'Аналитики Ренессанс',
    'Аналитики Финам': 'Аналитики Финам',
    
    // Общие паттерны
    'BKS': 'БКС',
    'ATON': 'Атон',
    'VTB': 'ВТБ',
    'SBER': 'Сбер',
    'RENAISSANCE': 'Ренессанс',
    'FINAM': 'Финам',
    
    // Технические индикаторы
    'RSI': 'Индекс относительной силы',
    'MACD': 'Схождение-расхождение скользящих средних',
    'Bollinger Bands': 'Полосы Боллинджера',
    'Moving Average': 'Скользящая средняя',
    'EMA': 'Экспоненциальная скользящая средняя',
    'SMA': 'Простая скользящая средняя',
    
    // Стратегии системы
    'aggressive': 'Агрессивная',
    'moderate': 'Умеренная',
    'conservative': 'Консервативная',
    
    // Дополнительные переводы
    'Unknown': 'Неизвестна',
    'N/A': 'Неизвестна'
};

/**
 * Перевод названия стратегии на русский язык
 * @param {string} strategyName - Название стратегии на английском
 * @returns {string} - Название стратегии на русском
 */
export function translateStrategy(strategyName) {
    if (!strategyName || typeof strategyName !== 'string') {
        return 'Неизвестна';
    }
    
    // Проверяем точное совпадение
    if (strategyTranslations[strategyName]) {
        return strategyTranslations[strategyName];
    }
    
    // Проверяем частичное совпадение (case-insensitive)
    const normalizedName = strategyName.trim();
    const lowerName = normalizedName.toLowerCase();
    
    for (const [key, value] of Object.entries(strategyTranslations)) {
        if (key.toLowerCase() === lowerName) {
            return value;
        }
    }
    
    // Проверяем, содержит ли название известные ключевые слова
    if (lowerName.includes('bks') || lowerName.includes('бкс')) {
        return 'Аналитики БКС';
    }
    if (lowerName.includes('aton') || lowerName.includes('атон')) {
        return 'Аналитики Атон';
    }
    if (lowerName.includes('vtb') || lowerName.includes('втб')) {
        return 'Аналитики ВТБ';
    }
    if (lowerName.includes('sber') || lowerName.includes('сбер')) {
        return 'Аналитики Сбер';
    }
    if (lowerName.includes('renaissance') || lowerName.includes('ренессанс')) {
        return 'Аналитики Ренессанс';
    }
    if (lowerName.includes('finam') || lowerName.includes('финам')) {
        return 'Аналитики Финам';
    }
    if (lowerName.includes('true strength') || lowerName.includes('tsi')) {
        return 'Индекс истинной силы';
    }
    
    // Если не найдено, возвращаем оригинальное название
    return normalizedName;
}

export default translateStrategy;

