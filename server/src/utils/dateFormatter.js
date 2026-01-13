/**
 * Утилита для форматирования дат при возврате данных из API
 * Преобразует объекты Date из Sequelize в строки ISO
 */

/**
 * Преобразует значение даты в строку ISO
 * @param {Date|string|number|null|undefined} dateValue - Значение даты
 * @returns {string|null} - Строка ISO или null
 */
export function formatDateToISO(dateValue) {
    if (!dateValue) return null;
    
    if (dateValue instanceof Date) {
        return dateValue.toISOString();
    }
    
    // Если это строка или число, пытаемся преобразовать
    const date = new Date(dateValue);
    if (!isNaN(date.getTime())) {
        return date.toISOString();
    }
    
    return null;
}

/**
 * Преобразует объект Sequelize модели в обычный объект с форматированными датами
 * @param {Object} model - Sequelize модель или объект
 * @param {string[]} dateFields - Массив имен полей с датами для форматирования
 * @returns {Object} - Объект с форматированными датами
 */
export function formatModelDates(model, dateFields = ['createdAt', 'updatedAt', 'time', 'timestamp', 'date', 'executedAt', 'publishedAt', 'createDt', 'endDt', 'startDate', 'endDate']) {
    if (!model) return null;
    
    // Преобразуем Sequelize модель в обычный объект
    const data = model.toJSON ? model.toJSON() : model;
    
    // Форматируем все поля с датами
    const formatted = { ...data };
    
    for (const field of dateFields) {
        if (formatted[field] !== undefined && formatted[field] !== null) {
            formatted[field] = formatDateToISO(formatted[field]);
        }
    }
    
    return formatted;
}

/**
 * Преобразует массив моделей с форматированием дат
 * @param {Array} models - Массив Sequelize моделей или объектов
 * @param {string[]} dateFields - Массив имен полей с датами для форматирования
 * @returns {Array} - Массив объектов с форматированными датами
 */
export function formatModelsDates(models, dateFields = ['createdAt', 'updatedAt', 'time', 'timestamp', 'date', 'executedAt', 'publishedAt', 'createDt', 'endDt', 'startDate', 'endDate']) {
    if (!Array.isArray(models)) return [];
    
    return models.map(model => formatModelDates(model, dateFields));
}

