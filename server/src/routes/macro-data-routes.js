import express from 'express';
import { Op } from 'sequelize';
import MacroDataService from '../services/MacroDataService.js';
import MacroIndicator from '../models/MacroIndicator.js';

const router = express.Router();

/**
 * Получение статуса MacroDataService
 */
router.get('/status', async (req, res) => {
    try {
        if (!MacroDataService.isInitialized) {
            await MacroDataService.initialize();
        }

        const status = MacroDataService.getStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Ошибка получения статуса MacroDataService:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статуса',
            error: error.message
        });
    }
});

/**
 * Получение всех индикаторов
 * Query параметры:
 * - indicatorType: фильтр по типу индикатора
 * - country: код страны (по умолчанию 'RUS')
 * - startDate: начальная дата (ISO string)
 * - endDate: конечная дата (ISO string)
 * - limit: ограничение количества результатов (по умолчанию 100)
 * - offset: смещение для пагинации (по умолчанию 0)
 */
router.get('/indicators', async (req, res) => {
    try {
        const {
            indicatorType,
            country = 'RUS',
            startDate,
            endDate,
            limit = 100,
            offset = 0
        } = req.query;

        const where = {
            country: country
        };

        if (indicatorType) {
            where.indicatorType = indicatorType;
        }

        if (startDate || endDate) {
            where.period = {};
            if (startDate) {
                where.period[Op.gte] = new Date(startDate);
            }
            if (endDate) {
                where.period[Op.lte] = new Date(endDate);
            }
        }

        const indicators = await MacroIndicator.findAndCountAll({
            where: where,
            order: [['period', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            success: true,
            data: {
                indicators: indicators.rows,
                total: indicators.count,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });
    } catch (error) {
        console.error('Ошибка получения индикаторов:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения индикаторов',
            error: error.message
        });
    }
});

/**
 * Получение индикаторов определенного типа
 * Query параметры:
 * - country: код страны (по умолчанию 'RUS')
 * - startDate: начальная дата (ISO string)
 * - endDate: конечная дата (ISO string)
 * - limit: ограничение количества результатов (по умолчанию 100)
 */
router.get('/indicators/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const {
            country = 'RUS',
            startDate,
            endDate,
            limit = 100
        } = req.query;

        // Валидация типа индикатора (список допустимых значений из ENUM)
        const validTypes = [
            'inflation', 'interest_rate', 'gdp', 'unemployment',
            'sentiment', 'volatility_index', 'oil_price', 'industrial_production',
            'retail_sales', 'investments', 'exports', 'imports', 'other'
        ];
        
        if (!validTypes.includes(type)) {
            return res.status(400).json({
                success: false,
                message: `Невалидный тип индикатора: ${type}`,
                validTypes: validTypes
            });
        }

        const where = {
            indicatorType: type,
            country: country
        };

        if (startDate || endDate) {
            where.period = {};
            if (startDate) {
                where.period[Op.gte] = new Date(startDate);
            }
            if (endDate) {
                where.period[Op.lte] = new Date(endDate);
            }
        }

        const indicators = await MacroIndicator.findAll({
            where: where,
            order: [['period', 'DESC']],
            limit: parseInt(limit)
        });

        res.json({
            success: true,
            data: {
                indicatorType: type,
                indicators: indicators,
                count: indicators.length
            }
        });
    } catch (error) {
        console.error(`Ошибка получения индикаторов типа ${req.params.type}:`, error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения индикаторов',
            error: error.message
        });
    }
});

/**
 * Получение последних значений всех индикаторов
 * Query параметры:
 * - country: код страны (по умолчанию 'RUS')
 */
router.get('/latest', async (req, res) => {
    try {
        if (!MacroDataService.isInitialized) {
            await MacroDataService.initialize();
        }

        const { country = 'RUS' } = req.query;
        const latestIndicators = await MacroDataService.getLatestIndicators(country);

        res.json({
            success: true,
            data: {
                country: country,
                indicators: latestIndicators,
                count: Object.keys(latestIndicators).length
            }
        });
    } catch (error) {
        console.error('Ошибка получения последних индикаторов:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения последних индикаторов',
            error: error.message
        });
    }
});

/**
 * Получение данных за период
 * Query параметры:
 * - indicatorType: тип индикатора (обязательный)
 * - startDate: начальная дата (ISO string, обязательный)
 * - endDate: конечная дата (ISO string, обязательный)
 * - country: код страны (по умолчанию 'RUS')
 */
router.get('/period', async (req, res) => {
    try {
        const {
            indicatorType,
            startDate,
            endDate,
            country = 'RUS'
        } = req.query;

        if (!indicatorType) {
            return res.status(400).json({
                success: false,
                message: 'Параметр indicatorType обязателен'
            });
        }

        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'Параметры startDate и endDate обязательны'
            });
        }

        if (!MacroDataService.isInitialized) {
            await MacroDataService.initialize();
        }

        const indicators = await MacroDataService.getIndicatorsForPeriod(
            indicatorType,
            new Date(startDate),
            new Date(endDate),
            country
        );

        res.json({
            success: true,
            data: {
                indicatorType: indicatorType,
                startDate: startDate,
                endDate: endDate,
                country: country,
                indicators: indicators,
                count: indicators.length
            }
        });
    } catch (error) {
        console.error('Ошибка получения данных за период:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения данных за период',
            error: error.message
        });
    }
});

/**
 * Получение макро-фичей для конкретной даты
 * Query параметры:
 * - date: дата (ISO string, по умолчанию текущая дата)
 * - country: код страны (по умолчанию 'RUS')
 */
router.get('/features', async (req, res) => {
    try {
        const {
            date,
            country = 'RUS'
        } = req.query;

        if (!MacroDataService.isInitialized) {
            await MacroDataService.initialize();
        }

        const targetDate = date ? new Date(date) : new Date();
        const features = await MacroDataService.getMacroFeatures(targetDate, country);

        res.json({
            success: true,
            data: {
                date: targetDate.toISOString(),
                country: country,
                features: features,
                featureNames: [
                    'inflation',
                    'inflationChange',
                    'interestRate',
                    'interestRateChange',
                    'gdpGrowth',
                    'unemployment',
                    'sentimentIndex',
                    'volatilityIndex'
                ]
            }
        });
    } catch (error) {
        console.error('Ошибка получения макро-фичей:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения макро-фичей',
            error: error.message
        });
    }
});

/**
 * Принудительное обновление данных
 * Body параметры (опционально):
 * - sources: объект с настройками источников { cbr: true, rosstat: true, moex: true }
 * - startDate: начальная дата для обновления (ISO string)
 * - endDate: конечная дата для обновления (ISO string)
 */
router.post('/update', async (req, res) => {
    try {
        if (!MacroDataService.isInitialized) {
            await MacroDataService.initialize();
        }

        const { sources, startDate, endDate } = req.body;

        // Если указаны источники, временно обновляем настройки
        let originalSources = null;
        if (sources) {
            originalSources = MacroDataService.settings.sources;
            MacroDataService.settings.sources = {
                ...MacroDataService.settings.sources,
                ...sources
            };
        }

        try {
            // Выполняем обновление
            const updateStats = await MacroDataService.updateAllData(
                startDate ? new Date(startDate) : null,
                endDate ? new Date(endDate) : null
            );

            // Восстанавливаем оригинальные настройки источников
            if (originalSources) {
                MacroDataService.settings.sources = originalSources;
            }

            res.json({
                success: true,
                message: 'Обновление данных завершено',
                data: updateStats
            });
        } catch (updateError) {
            // Восстанавливаем оригинальные настройки источников в случае ошибки
            if (originalSources) {
                MacroDataService.settings.sources = originalSources;
            }
            throw updateError;
        }
    } catch (error) {
        console.error('Ошибка обновления макро-данных:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка обновления данных',
            error: error.message
        });
    }
});

/**
 * Получение статистики обновлений
 */
router.get('/update-stats', async (req, res) => {
    try {
        if (!MacroDataService.isInitialized) {
            await MacroDataService.initialize();
        }

        const stats = MacroDataService.updateStats;
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Ошибка получения статистики обновлений:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статистики',
            error: error.message
        });
    }
});

/**
 * Очистка кеша макро-данных
 */
router.post('/cache/clear', async (req, res) => {
    try {
        if (!MacroDataService.isInitialized) {
            await MacroDataService.initialize();
        }

        MacroDataService.clearCache();
        
        res.json({
            success: true,
            message: 'Кеш макро-данных очищен'
        });
    } catch (error) {
        console.error('Ошибка очистки кеша:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка очистки кеша',
            error: error.message
        });
    }
});

export default router;

