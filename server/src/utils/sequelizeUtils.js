/**
 * Утилиты для работы с Sequelize моделями
 */

/**
 * Конвертирует Sequelize модель или массив моделей в обычный JavaScript объект/массив
 * 
 * @param {Object|Array} model - Sequelize модель или массив моделей
 * @returns {Object|Array|null} - Обычный JavaScript объект/массив или null
 * 
 * @example
 * // Одиночная модель
 * const instrument = await CachedInstrument.findOne({ where: { figi } });
 * const instrumentData = sequelizeToJSON(instrument);
 * console.log(instrumentData.figi); // Работает корректно
 * 
 * @example
 * // Массив моделей
 * const instruments = await CachedInstrument.findAll();
 * const instrumentsData = sequelizeToJSON(instruments);
 * instrumentsData.forEach(instr => console.log(instr.figi));
 * 
 * @example
 * // Модель с ассоциациями
 * const recommendation = await Recommendation.findOne({
 *   include: [{ model: TradingStrategy, as: 'strategy' }]
 * });
 * const recData = sequelizeToJSON(recommendation);
 * console.log(recData.strategy.name); // Работает корректно
 */
function sequelizeToJSON(model) {
    // Если модель null или undefined
    if (!model) {
        return null;
    }

    // Если это массив моделей
    if (Array.isArray(model)) {
        return model.map(item => sequelizeToJSON(item));
    }

    // Если это уже обычный объект (не Sequelize модель)
    if (!model.toJSON || typeof model.toJSON !== 'function') {
        // Проверяем, может быть это объект с dataValues (raw: true)
        if (model.dataValues && typeof model.dataValues === 'object') {
            return { ...model.dataValues };
        }
        // Иначе возвращаем как есть
        return model;
    }

    // Если это Sequelize модель, используем toJSON()
    try {
        const json = model.toJSON();
        
        // Рекурсивно обрабатываем вложенные ассоциации
        if (json && typeof json === 'object') {
            for (const key in json) {
                if (json.hasOwnProperty(key)) {
                    const value = json[key];
                    // Если значение - это Sequelize модель или массив моделей
                    if (value && typeof value === 'object') {
                        if (Array.isArray(value)) {
                            json[key] = value.map(item => {
                                if (item && typeof item.toJSON === 'function') {
                                    return item.toJSON();
                                }
                                return item;
                            });
                        } else if (typeof value.toJSON === 'function') {
                            json[key] = value.toJSON();
                        }
                    }
                }
            }
        }
        
        return json;
    } catch (error) {
        console.warn('⚠️ Error converting Sequelize model to JSON:', error.message);
        
        // Fallback: пытаемся использовать dataValues
        if (model.dataValues && typeof model.dataValues === 'object') {
            return { ...model.dataValues };
        }
        
        // Последний fallback: возвращаем модель как есть
        return model;
    }
}

/**
 * Извлекает значение поля из Sequelize модели или обычного объекта
 * Поддерживает различные способы доступа к данным Sequelize
 * 
 * @param {Object} model - Sequelize модель или обычный объект
 * @param {string} field - Название поля для извлечения
 * @param {*} defaultValue - Значение по умолчанию, если поле не найдено
 * @returns {*} - Значение поля или defaultValue
 * 
 * @example
 * const instrument = await CachedInstrument.findOne({ where: { figi } });
 * const figi = getField(instrument, 'figi');
 * const ticker = getField(instrument, 'ticker', 'UNKNOWN');
 */
function getField(model, field, defaultValue = null) {
    if (!model) {
        return defaultValue;
    }

    // Пробуем разные способы доступа
    // 1. Прямой доступ (для обычных объектов)
    if (model[field] !== undefined && model[field] !== null) {
        return model[field];
    }

    // 2. Через toJSON() (для Sequelize моделей)
    if (model.toJSON && typeof model.toJSON === 'function') {
        try {
            const json = model.toJSON();
            if (json[field] !== undefined && json[field] !== null) {
                return json[field];
            }
        } catch (error) {
            // Игнорируем ошибки toJSON
        }
    }

    // 3. Через dataValues (для raw: true запросов)
    if (model.dataValues && model.dataValues[field] !== undefined && model.dataValues[field] !== null) {
        return model.dataValues[field];
    }

    // 4. Через get() метод (для Sequelize моделей)
    if (model.get && typeof model.get === 'function') {
        try {
            const value = model.get(field);
            if (value !== undefined && value !== null) {
                return value;
            }
        } catch (error) {
            // Игнорируем ошибки get()
        }
    }

    return defaultValue;
}

/**
 * Извлекает несколько полей из Sequelize модели или обычного объекта
 * 
 * @param {Object} model - Sequelize модель или обычный объект
 * @param {string[]} fields - Массив названий полей для извлечения
 * @returns {Object} - Объект с извлеченными полями
 * 
 * @example
 * const instrument = await CachedInstrument.findOne({ where: { figi } });
 * const { figi, ticker, name } = getFields(instrument, ['figi', 'ticker', 'name']);
 */
function getFields(model, fields) {
    if (!model || !Array.isArray(fields)) {
        return {};
    }

    const result = {};
    for (const field of fields) {
        result[field] = getField(model, field);
    }
    return result;
}

/**
 * Проверяет, является ли объект Sequelize моделью
 * 
 * @param {*} obj - Объект для проверки
 * @returns {boolean} - true, если это Sequelize модель
 */
function isSequelizeModel(obj) {
    if (!obj || typeof obj !== 'object') {
        return false;
    }

    // Проверяем наличие методов Sequelize
    return (
        (typeof obj.toJSON === 'function') ||
        (typeof obj.get === 'function' && obj.dataValues !== undefined) ||
        (obj._options && obj._options.isNewRecord !== undefined)
    );
}

export {
    sequelizeToJSON,
    getField,
    getFields,
    isSequelizeModel
};

export default {
    sequelizeToJSON,
    getField,
    getFields,
    isSequelizeModel
};

