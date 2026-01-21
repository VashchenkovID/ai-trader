/**
 * Сервис синхронизации реального портфеля со стратегиями
 * Фаза 1, задача 1.2: Синхронизация портфеля
 * 
 * Сопоставляет позиции из реального портфеля с одобренными торговыми заявками
 * и создает/обновляет связи PositionStrategy
 */

import TradingRequest from '../models/TradingRequest.js';
import PositionStrategy from '../models/PositionStrategy.js';
import RealPortfolio from '../models/RealPortfolio.js';
import TradingEngine from './TradingEngine.js';
import { Op } from 'sequelize';

class PortfolioSyncService {
    constructor() {
        this.isInitialized = false;
        this.lastSyncResult = null;
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            console.log('🔄 Инициализация PortfolioSyncService...');
            
            // Убеждаемся, что TradingEngine инициализирован
            if (!TradingEngine.isInitialized) {
                await TradingEngine.initialize();
            }
            
            this.isInitialized = true;
            console.log('✅ PortfolioSyncService инициализирован');
        } catch (error) {
            console.error('❌ Ошибка инициализации PortfolioSyncService:', error);
            throw error;
        }
    }

    /**
     * Основной метод синхронизации портфеля с заявками
     * @param {Object} options - Опции синхронизации
     * @param {number} options.maxLookbackHours - Сколько часов назад искать одобренные заявки (по умолчанию 48)
     * @param {boolean} options.silent - Без уведомлений
     * @param {boolean} options.createMissingPositions - Создавать PositionStrategy для позиций без заявок
     * @returns {Promise<Object>} Результат синхронизации
     */
    async syncRealPortfolioWithStrategies(options = {}) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const {
            maxLookbackHours = 48,
            silent = false,
            createMissingPositions = false
        } = options;

        const startTime = Date.now();
        const result = {
            success: true,
            matched: 0,
            created: 0,
            updated: 0,
            unmatchedBuys: [],
            unmatchedSells: [],
            unmatchedClosed: [],
            requestsWithoutPosition: [],
            sellRequestsWithoutPosition: [],
            errors: [],
            warnings: []
        };

        try {
            console.log(`🔄 Начало синхронизации портфеля (lookback: ${maxLookbackHours} часов)...`);

            // Шаг 1: Сохранить снимок портфеля "до" синхронизации
            const portfolioBefore = await RealPortfolio.getCurrent();
            const positionsBefore = portfolioBefore?.positions || {};
            
            if (typeof positionsBefore === 'string') {
                try {
                    positionsBefore = JSON.parse(positionsBefore);
                } catch (e) {
                    console.warn('⚠️ Ошибка парсинга positionsBefore:', e.message);
                    positionsBefore = {};
                }
            }

            // Шаг 2: Получить актуальный портфель из брокера
            const portfolioAfter = await TradingEngine.getRealPortfolioValue();
            const positionsAfter = portfolioAfter?.positions || {};

            // Шаг 3: Найти изменения позиций
            const changes = this.findChangedPositions(positionsBefore, positionsAfter);
            
            if (!silent) {
                console.log(`📊 Изменения позиций:`, {
                    new: changes.new.length,
                    increased: changes.increased.length,
                    decreased: changes.decreased.length,
                    closed: changes.closed.length
                });
            }

            // Шаг 4: Получить недавно одобренные заявки
            const approvedRequests = await this.getRecentApprovedRequests(maxLookbackHours);

            if (!silent) {
                console.log(`📋 Найдено одобренных заявок: ${approvedRequests.length}`);
            }

            // Шаг 5: Сопоставить позиции с заявками
            const matchResult = await this.matchPositionsWithApprovedRequests(
                changes,
                approvedRequests,
                positionsAfter
            );

            // Объединяем результаты
            result.matched = matchResult.matched;
            result.created = matchResult.created;
            result.updated = matchResult.updated;
            result.unmatchedBuys = matchResult.unmatchedBuys || [];
            result.unmatchedSells = matchResult.unmatchedSells || [];
            result.unmatchedClosed = matchResult.unmatchedClosed || [];
            result.requestsWithoutPosition = matchResult.requestsWithoutPosition || [];
            result.sellRequestsWithoutPosition = matchResult.sellRequestsWithoutPosition || [];
            result.errors = matchResult.errors || [];
            result.warnings = matchResult.warnings || [];

            // Шаг 6: Обновить RealPortfolio с новым снимком
            await this.updateRealPortfolio(portfolioAfter);

            const duration = Date.now() - startTime;
            result.duration = duration;
            result.timestamp = new Date().toISOString();

            this.lastSyncResult = result;

            if (!silent) {
                console.log(`✅ Синхронизация завершена за ${duration}ms`);
                console.log(`📊 Результаты:`, {
                    matched: result.matched,
                    created: result.created,
                    updated: result.updated,
                    unmatched: result.unmatchedBuys.length + result.unmatchedSells.length + result.unmatchedClosed.length
                });
            }

            return result;

        } catch (error) {
            console.error('❌ Ошибка синхронизации портфеля:', error);
            result.success = false;
            result.errors.push(error.message);
            throw error;
        }
    }

    /**
     * Найти новые/измененные позиции (сравнение "до" и "после")
     * @param {Object} positionsBefore - Позиции до синхронизации {FIGI: quantity}
     * @param {Object} positionsAfter - Позиции после синхронизации {FIGI: quantity}
     * @returns {Object} Изменения позиций
     */
    findChangedPositions(positionsBefore, positionsAfter) {
        const changes = {
            new: [],           // Новые позиции (BUY)
            increased: [],      // Увеличенные позиции (BUY)
            decreased: [],     // Уменьшенные позиции (SELL - частичная продажа)
            closed: []        // Закрытые позиции (SELL - полная продажа)
        };

        const allFigis = new Set([
            ...Object.keys(positionsBefore || {}),
            ...Object.keys(positionsAfter || {})
        ]);

        for (const figi of allFigis) {
            const beforeQty = parseInt(positionsBefore[figi] || 0);
            const afterQty = parseInt(positionsAfter[figi] || 0);

            if (beforeQty === 0 && afterQty > 0) {
                // Новая позиция
                changes.new.push({
                    figi,
                    quantity: afterQty
                });
            } else if (beforeQty > 0 && afterQty === 0) {
                // Позиция закрыта полностью
                changes.closed.push({
                    figi,
                    beforeQuantity: beforeQty
                });
            } else if (afterQty > beforeQty) {
                // Позиция увеличена
                changes.increased.push({
                    figi,
                    beforeQuantity: beforeQty,
                    afterQuantity: afterQty,
                    addedQuantity: afterQty - beforeQty
                });
            } else if (afterQty < beforeQty && afterQty > 0) {
                // Позиция уменьшена (частичная продажа)
                changes.decreased.push({
                    figi,
                    beforeQuantity: beforeQty,
                    afterQuantity: afterQty,
                    soldQuantity: beforeQty - afterQty
                });
            }
        }

        return changes;
    }

    /**
     * Получить недавно одобренные заявки
     * @param {number} lookbackHours - Сколько часов назад искать
     * @returns {Promise<Array>} Массив одобренных заявок
     */
    async getRecentApprovedRequests(lookbackHours = 48) {
        try {
            const lookbackDate = new Date();
            lookbackDate.setHours(lookbackDate.getHours() - lookbackHours);

            const requests = await TradingRequest.findAll({
                where: {
                    status: {
                        [Op.in]: ['APPROVED', 'EXECUTED']
                    },
                    [Op.or]: [
                        { approvedAt: { [Op.gte]: lookbackDate } },
                        { createdAt: { [Op.gte]: lookbackDate } }
                    ]
                },
                order: [['approvedAt', 'DESC'], ['createdAt', 'DESC']],
                limit: 1000 // Лимит для безопасности
            });

            return requests;
        } catch (error) {
            console.error('❌ Ошибка получения одобренных заявок:', error);
            throw error;
        }
    }

    /**
     * Сопоставление изменений позиций с одобренными заявками
     * @param {Object} changes - Изменения позиций
     * @param {Array} approvedRequests - Одобренные заявки
     * @param {Object} currentPositions - Текущие позиции
     * @returns {Promise<Object>} Результат сопоставления
     */
    async matchPositionsWithApprovedRequests(changes, approvedRequests, currentPositions) {
        const result = {
            matched: 0,
            created: 0,
            updated: 0,
            unmatchedBuys: [],
            unmatchedSells: [],
            unmatchedClosed: [],
            requestsWithoutPosition: [],
            sellRequestsWithoutPosition: [],
            errors: [],
            warnings: []
        };

        try {
            // Группируем заявки по FIGI и action
            const requestsByFigi = {};
            for (const request of approvedRequests) {
                const figi = request.figi;
                if (!requestsByFigi[figi]) {
                    requestsByFigi[figi] = { BUY: [], SELL: [] };
                }
                if (request.action) {
                    requestsByFigi[figi][request.action].push(request);
                }
            }

            // Обработка новых и увеличенных позиций (BUY)
            const buyPositions = [...changes.new, ...changes.increased];
            for (const position of buyPositions) {
                const figi = position.figi;
                const buyRequests = requestsByFigi[figi]?.BUY || [];

                if (buyRequests.length > 0) {
                    // Выбираем самую свежую заявку
                    const request = buyRequests[0]; // Уже отсортированы по approvedAt DESC
                    
                    try {
                        // Проверяем, нет ли уже активного PositionStrategy для этого FIGI
                        const existingStrategy = await this.getActivePositionStrategy(figi);
                        
                        if (!existingStrategy) {
                            // Создаем новый PositionStrategy
                            const actualQuantity = position.quantity || position.afterQuantity || 0;
                            await this.createPositionStrategyFromRequest(request, actualQuantity);
                            result.created++;
                            result.matched++;
                        } else {
                            // Обновляем существующий (если позиция увеличилась)
                            if (position.afterQuantity && position.afterQuantity > position.beforeQuantity) {
                                result.warnings.push(`Позиция ${figi} уже имеет стратегию, но количество увеличилось`);
                            }
                        }
                    } catch (error) {
                        console.error(`❌ Ошибка создания PositionStrategy для ${figi}:`, error);
                        result.errors.push(`Ошибка для ${figi}: ${error.message}`);
                    }
                } else {
                    // Позиция без заявки
                    result.unmatchedBuys.push({
                        figi,
                        quantity: position.quantity || position.afterQuantity || 0
                    });
                }
            }

            // Обработка уменьшенных и закрытых позиций (SELL)
            const sellPositions = [...changes.decreased, ...changes.closed];
            for (const position of sellPositions) {
                const figi = position.figi;
                const sellRequests = requestsByFigi[figi]?.SELL || [];
                const currentQuantity = currentPositions[figi] || 0;

                // Находим существующий активный PositionStrategy
                const existingStrategy = await this.getActivePositionStrategy(figi);

                if (existingStrategy) {
                    if (sellRequests.length > 0) {
                        // Есть SELL заявка и PositionStrategy
                        const request = sellRequests[0]; // Самая свежая
                        await this.updatePositionStrategyForSell(request, currentQuantity);
                        result.updated++;
                        result.matched++;
                    } else {
                        // PositionStrategy есть, но SELL заявки нет
                        if (currentQuantity === 0) {
                            result.unmatchedClosed.push({
                                figi,
                                beforeQuantity: position.beforeQuantity || 0
                            });
                        } else {
                            result.unmatchedSells.push({
                                figi,
                                beforeQuantity: position.beforeQuantity || 0,
                                afterQuantity: currentQuantity
                            });
                        }
                    }
                } else {
                    // Нет PositionStrategy для закрытой/уменьшенной позиции
                    if (currentQuantity === 0) {
                        result.unmatchedClosed.push({
                            figi,
                            beforeQuantity: position.beforeQuantity || 0
                        });
                    } else {
                        result.unmatchedSells.push({
                            figi,
                            beforeQuantity: position.beforeQuantity || 0,
                            afterQuantity: currentQuantity
                        });
                    }
                }
            }

            // Проверяем заявки без позиций
            for (const request of approvedRequests) {
                const figi = request.figi;
                const currentQuantity = currentPositions[figi] || 0;

                if (request.action === 'BUY' && currentQuantity === 0) {
                    // BUY заявка, но позиции нет
                    result.requestsWithoutPosition.push({
                        requestId: request.id,
                        figi,
                        ticker: request.ticker,
                        quantity: request.quantity
                    });
                } else if (request.action === 'SELL') {
                    // SELL заявка - проверяем, была ли позиция уменьшена/закрыта
                    const wasDecreased = changes.decreased.some(p => p.figi === figi);
                    const wasClosed = changes.closed.some(p => p.figi === figi);
                    
                    if (!wasDecreased && !wasClosed && currentQuantity > 0) {
                        // SELL заявка, но позиция не изменилась
                        result.sellRequestsWithoutPosition.push({
                            requestId: request.id,
                            figi,
                            ticker: request.ticker,
                            quantity: request.quantity
                        });
                    }
                }
            }

        } catch (error) {
            console.error('❌ Ошибка сопоставления позиций с заявками:', error);
            result.errors.push(error.message);
        }

        return result;
    }

    /**
     * Создать PositionStrategy для позиции из заявки на покупку
     * @param {Object} tradingRequest - Торговая заявка
     * @param {number} actualQuantity - Фактическое количество акций
     * @returns {Promise<Object>} Созданный PositionStrategy
     */
    async createPositionStrategyFromRequest(tradingRequest, actualQuantity) {
        try {
            if (!tradingRequest.strategyId) {
                throw new Error(`Заявка ${tradingRequest.id} не имеет strategyId`);
            }

            // Проверяем, нет ли уже PositionStrategy для этого positionId
            const existing = await PositionStrategy.findOne({
                where: { positionId: tradingRequest.id }
            });

            if (existing) {
                console.log(`⚠️ PositionStrategy уже существует для заявки ${tradingRequest.id}`);
                return existing;
            }

            const entryDate = tradingRequest.approvedAt || tradingRequest.createdAt || new Date();

            const positionStrategy = await PositionStrategy.create({
                positionId: tradingRequest.id,
                strategyId: tradingRequest.strategyId,
                entryReason: {
                    confidence: tradingRequest.confidence,
                    score: tradingRequest.score,
                    aiExplanation: tradingRequest.aiExplanation,
                    reasoning: tradingRequest.reasoning
                },
                entryDate: entryDate,
                // Сохраняем фактическое количество в метаданных (если нужно)
                // actualQuantity может отличаться от requestedQuantity
            });

            console.log(`✅ Создан PositionStrategy для ${tradingRequest.ticker} (${tradingRequest.figi})`);
            
            return positionStrategy;
        } catch (error) {
            console.error('❌ Ошибка создания PositionStrategy:', error);
            throw error;
        }
    }

    /**
     * Обновить/закрыть PositionStrategy при продаже
     * @param {Object} tradingRequest - Торговая заявка на продажу
     * @param {number} currentQuantity - Текущее количество акций после продажи
     * @returns {Promise<Object>} Обновленный PositionStrategy
     */
    async updatePositionStrategyForSell(tradingRequest, currentQuantity) {
        try {
            // Находим активный PositionStrategy для этого FIGI
            const positionStrategy = await this.getActivePositionStrategy(tradingRequest.figi);

            if (!positionStrategy) {
                throw new Error(`Не найден активный PositionStrategy для ${tradingRequest.figi}`);
            }

            const exitDate = tradingRequest.approvedAt || tradingRequest.createdAt || new Date();

            if (currentQuantity === 0) {
                // Позиция закрыта полностью
                positionStrategy.exitDate = exitDate;
                
                // Рассчитываем resultPercent (Фаза 2, задача 2.1.1)
                let resultPercent = null;
                try {
                    const buyRequest = await TradingRequest.findOne({
                        where: {
                            positionId: positionStrategy.positionId,
                            action: 'BUY',
                            status: 'EXECUTED'
                        },
                        order: [['executedAt', 'ASC']]
                    });
                    
                    if (buyRequest && buyRequest.actualPrice && tradingRequest.actualPrice) {
                        const buyPrice = buyRequest.actualPrice;
                        const sellPrice = tradingRequest.actualPrice;
                        resultPercent = ((sellPrice - buyPrice) / buyPrice) * 100;
                        positionStrategy.resultPercent = resultPercent;
                        
                        // Записываем результат в FeedbackService (Фаза 2, задача 2.1.1)
                        try {
                            const FeedbackService = (await import('./FeedbackService.js')).default;
                            if (FeedbackService && FeedbackService.isInitialized) {
                                await FeedbackService.recordTradeResult(
                                    tradingRequest.recommendationId,
                                    sellPrice,
                                    resultPercent,
                                    {
                                        tradingRequestId: tradingRequest.id,
                                        positionStrategyId: positionStrategy.id,
                                        figi: tradingRequest.figi
                                    }
                                );
                            }
                        } catch (feedbackError) {
                            console.warn('⚠️ Could not record trade result in FeedbackService:', feedbackError.message);
                        }
                    }
                } catch (calcError) {
                    console.warn('⚠️ Could not calculate resultPercent:', calcError.message);
                }
                
                await positionStrategy.save();
                console.log(`✅ PositionStrategy закрыт для ${tradingRequest.ticker} (${tradingRequest.figi})${resultPercent !== null ? `, результат: ${resultPercent.toFixed(2)}%` : ''}`);
            } else {
                // Частичная продажа - обновляем метаданные
                // Позиция остается активной (exitDate не устанавливаем)
                // Можно сохранить информацию о частичной продаже в entryReason
                const entryReason = positionStrategy.entryReason || {};
                entryReason.partialSells = entryReason.partialSells || [];
                entryReason.partialSells.push({
                    date: exitDate,
                    soldQuantity: tradingRequest.quantity,
                    remainingQuantity: currentQuantity
                });
                positionStrategy.entryReason = entryReason;
                
                await positionStrategy.save();
                console.log(`✅ PositionStrategy обновлен (частичная продажа) для ${tradingRequest.ticker}`);
            }

            return positionStrategy;
        } catch (error) {
            console.error('❌ Ошибка обновления PositionStrategy:', error);
            throw error;
        }
    }

    /**
     * Получить существующий активный PositionStrategy для FIGI
     * @param {string} figi - FIGI инструмента
     * @returns {Promise<Object|null>} Активный PositionStrategy или null
     */
    async getActivePositionStrategy(figi) {
        try {
            // Сначала находим все одобренные заявки для этого FIGI
            const requests = await TradingRequest.findAll({
                where: {
                    figi,
                    status: {
                        [Op.in]: ['APPROVED', 'EXECUTED']
                    }
                },
                order: [['approvedAt', 'DESC'], ['createdAt', 'DESC']]
            });

            if (requests.length === 0) {
                return null;
            }

            // Ищем активный PositionStrategy для этих заявок
            const requestIds = requests.map(r => r.id);
            const positionStrategy = await PositionStrategy.findOne({
                where: {
                    positionId: { [Op.in]: requestIds },
                    exitDate: null // Только активные позиции
                },
                order: [['entryDate', 'DESC']] // Берем самую свежую
            });

            return positionStrategy;
        } catch (error) {
            console.error(`❌ Ошибка поиска активного PositionStrategy для ${figi}:`, error);
            return null;
        }
    }

    /**
     * Обновить RealPortfolio с новым снимком
     * @param {Object} portfolioData - Данные портфеля
     */
    async updateRealPortfolio(portfolioData) {
        try {
            let portfolio = await RealPortfolio.getCurrent();
            
            if (!portfolio) {
                // Создаем новый портфель
                portfolio = await RealPortfolio.create({
                    cash: portfolioData.cash || 0,
                    positions: portfolioData.positions || {},
                    positionsValue: portfolioData.positionsValue || 0,
                    totalValue: portfolioData.totalValue || 0,
                    lastUpdated: new Date()
                });
            } else {
                // Обновляем существующий
                portfolio.cash = portfolioData.cash || 0;
                portfolio.positions = portfolioData.positions || {};
                portfolio.positionsValue = portfolioData.positionsValue || 0;
                portfolio.totalValue = portfolioData.totalValue || 0;
                portfolio.lastUpdated = new Date();
                await portfolio.save();
            }
        } catch (error) {
            console.error('❌ Ошибка обновления RealPortfolio:', error);
            throw error;
        }
    }

    /**
     * Получить статус последней синхронизации
     * @returns {Object} Статус синхронизации
     */
    getLastSyncStatus() {
        if (!this.lastSyncResult) {
            return {
                lastSync: null,
                positionsMatched: 0,
                positionsUnmatched: 0
            };
        }

        return {
            lastSync: this.lastSyncResult.timestamp,
            positionsMatched: this.lastSyncResult.matched,
            positionsUnmatched: 
                this.lastSyncResult.unmatchedBuys.length +
                this.lastSyncResult.unmatchedSells.length +
                this.lastSyncResult.unmatchedClosed.length,
            details: this.lastSyncResult
        };
    }

    /**
     * Получить список несоответствий
     * @returns {Promise<Object>} Позиции без стратегии и заявки без позиций
     */
    async getMismatches() {
        try {
            // Получаем все активные PositionStrategy
            const activeStrategies = await PositionStrategy.findAll({
                where: { exitDate: null },
                include: [{
                    model: TradingRequest,
                    as: 'position',
                    required: true
                }]
            });

            const positionsWithStrategy = new Set(
                activeStrategies.map(ps => ps.position?.figi).filter(Boolean)
            );

            // Получаем текущий портфель
            const portfolio = await TradingEngine.getRealPortfolioValue();
            const currentPositions = portfolio?.positions || {};
            const currentFigis = Object.keys(currentPositions).filter(figi => currentPositions[figi] > 0);

            // Позиции без стратегии
            const positionsWithoutStrategy = currentFigis
                .filter(figi => !positionsWithStrategy.has(figi))
                .map(figi => ({
                    figi,
                    quantity: currentPositions[figi]
                }));

            // Заявки без позиций (одобренные, но позиции нет)
            const recentRequests = await this.getRecentApprovedRequests(48);
            const requestsWithoutPosition = recentRequests
                .filter(req => req.action === 'BUY' && (!currentPositions[req.figi] || currentPositions[req.figi] === 0))
                .map(req => ({
                    requestId: req.id,
                    figi: req.figi,
                    ticker: req.ticker,
                    quantity: req.quantity,
                    approvedAt: req.approvedAt
                }));

            return {
                positionsWithoutStrategy,
                requestsWithoutPosition
            };
        } catch (error) {
            console.error('❌ Ошибка получения несоответствий:', error);
            throw error;
        }
    }
}

export default new PortfolioSyncService();

