/**
 * Утилита для оптимизации запросов к БД
 * Предоставляет методы для батчинга, eager loading и кеширования запросов
 */

import sequelize from '../config/database.js';
import { Op } from 'sequelize';

class DatabaseQueryOptimizer {
    constructor() {
        this.queryCache = new Map(); // Кеш для часто используемых запросов
        this.cacheTimeout = 5 * 60 * 1000; // 5 минут
    }

    /**
     * Батчинг запросов findAll для избежания N+1 проблемы
     * @param {Model} Model - Sequelize модель
     * @param {Array} conditions - Массив условий для запросов
     * @param {Object} options - Опции для запроса (include, attributes, etc.)
     * @returns {Promise<Map>} Map с результатами, ключ - условие
     */
    async batchFindAll(Model, conditions, options = {}) {
        if (!Array.isArray(conditions) || conditions.length === 0) {
            return new Map();
        }

        // Объединяем все условия в один запрос с OR
        const whereConditions = conditions.map(cond => {
            if (typeof cond === 'string') {
                // Если условие - это просто значение для первичного ключа
                return { id: cond };
            }
            return cond;
        });

        const results = await Model.findAll({
            where: {
                [Op.or]: whereConditions
            },
            ...options
        });

        // Группируем результаты по условиям
        const resultMap = new Map();
        for (const condition of conditions) {
            const key = typeof condition === 'string' ? condition : JSON.stringify(condition);
            const matching = results.filter(item => {
                if (typeof condition === 'string') {
                    return item.id === condition || item.figi === condition;
                }
                // Сложная логика сопоставления для объектов
                return Object.keys(condition).every(k => item[k] === condition[k]);
            });
            resultMap.set(key, matching);
        }

        return resultMap;
    }

    /**
     * Батчинг findByPk запросов
     * @param {Model} Model - Sequelize модель
     * @param {Array} ids - Массив ID
     * @param {Object} options - Опции для запроса
     * @returns {Promise<Map>} Map с результатами, ключ - ID
     */
    async batchFindByPk(Model, ids, options = {}) {
        if (!Array.isArray(ids) || ids.length === 0) {
            return new Map();
        }

        // Убираем дубликаты
        const uniqueIds = [...new Set(ids)];
        
        const results = await Model.findAll({
            where: {
                id: { [Op.in]: uniqueIds }
            },
            ...options
        });

        // Создаем Map для быстрого доступа
        const resultMap = new Map();
        for (const item of results) {
            resultMap.set(item.id, item);
        }

        return resultMap;
    }

    /**
     * Батчинг findByFigi запросов (для инструментов)
     * @param {Model} Model - Sequelize модель
     * @param {Array} figis - Массив FIGI
     * @param {Object} options - Опции для запроса
     * @returns {Promise<Map>} Map с результатами, ключ - FIGI
     */
    async batchFindByFigi(Model, figis, options = {}) {
        if (!Array.isArray(figis) || figis.length === 0) {
            return new Map();
        }

        // Убираем дубликаты
        const uniqueFigis = [...new Set(figis)];
        
        const results = await Model.findAll({
            where: {
                figi: { [Op.in]: uniqueFigis }
            },
            ...options
        });

        // Создаем Map для быстрого доступа
        const resultMap = new Map();
        for (const item of results) {
            resultMap.set(item.figi, item);
        }

        return resultMap;
    }

    /**
     * Батчинг bulkCreate с обработкой конфликтов
     * @param {Model} Model - Sequelize модель
     * @param {Array} records - Массив записей для создания
     * @param {Object} options - Опции для bulkCreate
     * @returns {Promise<Array>} Массив созданных записей
     */
    async batchBulkCreate(Model, records, options = {}) {
        if (!Array.isArray(records) || records.length === 0) {
            return [];
        }

        // Разбиваем на батчи по 1000 записей
        const batchSize = 1000;
        const batches = [];
        for (let i = 0; i < records.length; i += batchSize) {
            batches.push(records.slice(i, i + batchSize));
        }

        const results = [];
        for (const batch of batches) {
            try {
                // Нельзя использовать ignoreDuplicates и updateOnDuplicate одновременно
                const bulkCreateOptions = { ...options };
                if (options.updateOnDuplicate && options.updateOnDuplicate.length > 0) {
                    // Если указан updateOnDuplicate, не используем ignoreDuplicates
                    bulkCreateOptions.updateOnDuplicate = options.updateOnDuplicate;
                    delete bulkCreateOptions.ignoreDuplicates;
                } else if (options.ignoreDuplicates !== false) {
                    // Если updateOnDuplicate не указан, используем ignoreDuplicates
                    bulkCreateOptions.ignoreDuplicates = true;
                }
                
                const created = await Model.bulkCreate(batch, bulkCreateOptions);
                results.push(...created);
            } catch (error) {
                console.error(`Error in batchBulkCreate for ${Model.name}:`, error);
                // Продолжаем с следующим батчем
            }
        }

        return results;
    }

    /**
     * Батчинг update запросов
     * @param {Model} Model - Sequelize модель
     * @param {Array} updates - Массив объектов { where, values }
     * @returns {Promise<Array>} Массив результатов обновления
     */
    async batchUpdate(Model, updates) {
        if (!Array.isArray(updates) || updates.length === 0) {
            return [];
        }

        // Группируем обновления по условиям для оптимизации
        const grouped = new Map();
        for (const update of updates) {
            const key = JSON.stringify(update.where);
            if (!grouped.has(key)) {
                grouped.set(key, []);
            }
            grouped.get(key).push(update.values);
        }

        const results = [];
        for (const [whereKey, valuesArray] of grouped.entries()) {
            const where = JSON.parse(whereKey);
            // Объединяем все значения для одинаковых условий
            const mergedValues = Object.assign({}, ...valuesArray);
            
            try {
                const [count] = await Model.update(mergedValues, { where });
                results.push({ where, count });
            } catch (error) {
                console.error(`Error in batchUpdate for ${Model.name}:`, error);
            }
        }

        return results;
    }

    /**
     * Кешированный запрос (для статических данных)
     * @param {string} cacheKey - Ключ кеша
     * @param {Function} queryFn - Функция для выполнения запроса
     * @param {number} ttl - Время жизни кеша в мс
     * @returns {Promise<any>} Результат запроса
     */
    async cachedQuery(cacheKey, queryFn, ttl = null) {
        const cacheEntry = this.queryCache.get(cacheKey);
        const now = Date.now();
        
        if (cacheEntry && (ttl === null || (now - cacheEntry.timestamp) < (ttl || this.cacheTimeout))) {
            return cacheEntry.data;
        }

        const data = await queryFn();
        this.queryCache.set(cacheKey, {
            data,
            timestamp: now
        });

        // Очистка старых записей
        this.cleanCache();

        return data;
    }

    /**
     * Очистка кеша от устаревших записей
     * @private
     */
    cleanCache() {
        const now = Date.now();
        for (const [key, entry] of this.queryCache.entries()) {
            if (now - entry.timestamp > this.cacheTimeout) {
                this.queryCache.delete(key);
            }
        }
    }

    /**
     * Оптимизированный запрос с eager loading
     * @param {Model} Model - Sequelize модель
     * @param {Object} where - Условия WHERE
     * @param {Array} includes - Массив ассоциаций для eager loading
     * @param {Object} options - Дополнительные опции
     * @returns {Promise<Array>} Результаты запроса
     */
    async findWithIncludes(Model, where, includes = [], options = {}) {
        return await Model.findAll({
            where,
            include: includes,
            ...options
        });
    }

    /**
     * Оптимизированный count с использованием findAndCountAll
     * @param {Model} Model - Sequelize модель
     * @param {Object} where - Условия WHERE
     * @param {Object} options - Дополнительные опции
     * @returns {Promise<Object>} { rows, count }
     */
    async findAndCountOptimized(Model, where, options = {}) {
        return await Model.findAndCountAll({
            where,
            ...options
        });
    }

    /**
     * Очистка всего кеша
     */
    clearCache() {
        this.queryCache.clear();
    }
}

// Экспортируем singleton экземпляр
const databaseQueryOptimizer = new DatabaseQueryOptimizer();

export default databaseQueryOptimizer;

