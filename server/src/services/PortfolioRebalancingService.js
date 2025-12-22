import Settings from '../models/Settings.js';
import TradingEngine from './TradingEngine.js';
import CapitalAllocationStrategy from './CapitalAllocationStrategy.js';
import TinkoffApiService from './TinkoffApiService.js';
import CacheService from './CacheService.js';
import OptimizedTelegramService from './OptimizedTelegramService.js';
import PortfolioRebalancing from '../models/PortfolioRebalancing.js';

/**
 * Сервис для автоматического ребалансирования портфеля
 * 
 * Основные функции:
 * - Проверка отклонений от целевых весов
 * - Расчет операций ребалансировки
 * - Оптимизация операций с учетом комиссий
 * - Выполнение ребалансировки
 */
class PortfolioRebalancingService {
    constructor() {
        this.isInitialized = false;
        this.settings = {
            enabled: true,
            threshold: 5,              // Порог отклонения в процентах (5%)
            minAmount: 1000,          // Минимальная сумма операции в рублях
            minBenefit: 50,           // Минимальная чистая выгода в рублях
            maxOperations: 20,        // Максимум операций за раз
            dryRun: false             // Режим тестирования (без выполнения)
        };
        this.lastCheck = null;
        this.lastRebalance = null;
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            console.log('🚀 Инициализация PortfolioRebalancingService...');
            
            await this.loadSettings();
            
            // Инициализируем зависимые сервисы, если они еще не инициализированы
            if (!TradingEngine.isInitialized) {
                await TradingEngine.initialize();
            }
            if (!CapitalAllocationStrategy.isInitialized) {
                await CapitalAllocationStrategy.initialize();
            }
            
            this.isInitialized = true;
            console.log('✅ PortfolioRebalancingService инициализирован');
            
        } catch (error) {
            console.error('❌ Ошибка инициализации PortfolioRebalancingService:', error);
            throw error;
        }
    }

    /**
     * Загрузка настроек
     */
    async loadSettings() {
        try {
            this.settings = {
                enabled: await Settings.getSetting('portfolio_rebalancing_enabled', true),
                threshold: await Settings.getSetting('portfolio_rebalancing_threshold', 5),
                minAmount: await Settings.getSetting('portfolio_rebalancing_min_amount', 1000),
                minBenefit: await Settings.getSetting('portfolio_rebalancing_min_benefit', 50),
                maxOperations: await Settings.getSetting('portfolio_rebalancing_max_operations', 20),
                dryRun: await Settings.getSetting('portfolio_rebalancing_dry_run', false)
            };
        } catch (error) {
            console.warn('⚠️ Ошибка загрузки настроек ребалансировки, используем значения по умолчанию:', error.message);
        }
    }

    /**
     * Проверка необходимости ребалансировки
     * @returns {Object} { needsRebalancing: boolean, deviations: Array, summary: Object }
     */
    async checkRebalancingNeeded() {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            // Получаем текущий портфель
            const portfolio = await TradingEngine.getPortfolioValue();
            if (!portfolio || !portfolio.positions) {
                return {
                    needsRebalancing: false,
                    deviations: [],
                    summary: {
                        totalValue: 0,
                        positionsCount: 0,
                        reason: 'Портфель пуст или недоступен'
                    }
                };
            }

            // Получаем позиции с деталями
            const positions = await this.getDetailedPositions(portfolio);
            if (positions.length === 0) {
                return {
                    needsRebalancing: false,
                    deviations: [],
                    summary: {
                        totalValue: portfolio.totalValue || portfolio.cash || 0,
                        positionsCount: 0,
                        reason: 'Нет открытых позиций'
                    }
                };
            }

            // Рассчитываем общую стоимость портфеля
            const totalValue = positions.reduce((sum, pos) => sum + pos.marketValue, 0) + (portfolio.cash || 0);

            // Получаем целевое распределение
            // Для ребалансировки нам не нужен полный анализ портфеля с метриками
            // Используем упрощенный подход - получаем только целевое распределение
            let targetAllocation = [];
            try {
                const optimization = await CapitalAllocationStrategy.optimizeAllocation();
                targetAllocation = optimization.targetAllocation || [];
            } catch (error) {
                console.warn('⚠️ Ошибка оптимизации распределения, используем упрощенный подход:', error.message);
                // Если оптимизация не удалась, возвращаем пустое целевое распределение
                // Это не критично для проверки ребалансировки
            }

            // Рассчитываем отклонения для каждой позиции
            const deviations = [];
            let needsRebalancing = false;

            for (const position of positions) {
                const targetPos = targetAllocation.find(t => 
                    t.symbol === position.figi || t.symbol === position.ticker
                );

                const currentWeight = totalValue > 0 ? (position.marketValue / totalValue) * 100 : 0;
                const targetWeight = targetPos ? (targetPos.weight || 0) * 100 : 0;
                const deviation = currentWeight - targetWeight;
                const deviationPercent = targetWeight > 0 ? Math.abs(deviation / targetWeight) * 100 : Math.abs(deviation);

                // Проверяем, нужна ли ребалансировка
                const needsRebalance = Math.abs(deviationPercent) > this.settings.threshold || 
                                     Math.abs(deviation) > 1; // Минимум 1% абсолютного отклонения

                if (needsRebalance) {
                    needsRebalancing = true;
                }

                deviations.push({
                    figi: position.figi,
                    ticker: position.ticker,
                    name: position.name || position.ticker,
                    currentWeight: Math.round(currentWeight * 100) / 100,
                    targetWeight: Math.round(targetWeight * 100) / 100,
                    deviation: Math.round(deviation * 100) / 100,
                    deviationPercent: Math.round(deviationPercent * 100) / 100,
                    currentValue: Math.round(position.marketValue * 100) / 100,
                    targetValue: Math.round((targetWeight / 100) * totalValue * 100) / 100,
                    needsRebalancing: needsRebalance,
                    currentPrice: position.currentPrice
                });
            }

            // Проверяем позиции, которые должны быть добавлены
            for (const targetPos of targetAllocation) {
                const existingPos = positions.find(p => 
                    p.figi === targetPos.symbol || p.ticker === targetPos.symbol
                );

                if (!existingPos && targetPos.weight > 0) {
                    const targetWeight = (targetPos.weight || 0) * 100;
                    const targetValue = (targetWeight / 100) * totalValue;

                    if (targetValue >= this.settings.minAmount) {
                        needsRebalancing = true;
                        deviations.push({
                            figi: targetPos.symbol,
                            ticker: targetPos.symbol,
                            name: targetPos.symbol,
                            currentWeight: 0,
                            targetWeight: Math.round(targetWeight * 100) / 100,
                            deviation: -targetWeight,
                            deviationPercent: 100,
                            currentValue: 0,
                            targetValue: Math.round(targetValue * 100) / 100,
                            needsRebalancing: true,
                            currentPrice: null
                        });
                    }
                }
            }

            this.lastCheck = new Date();

            return {
                needsRebalancing,
                deviations: deviations.filter(d => d.needsRebalancing),
                allDeviations: deviations,
                summary: {
                    totalValue: Math.round(totalValue * 100) / 100,
                    positionsCount: positions.length,
                    targetPositionsCount: targetAllocation.length,
                    deviationsCount: deviations.filter(d => d.needsRebalancing).length,
                    maxDeviation: deviations.length > 0 
                        ? Math.max(...deviations.map(d => Math.abs(d.deviationPercent)))
                        : 0,
                    threshold: this.settings.threshold
                }
            };

        } catch (error) {
            console.error('❌ Ошибка проверки необходимости ребалансировки:', error);
            return {
                needsRebalancing: false,
                deviations: [],
                summary: {
                    error: error.message
                }
            };
        }
    }

    /**
     * Получение детальной информации о позициях
     */
    async getDetailedPositions(portfolio) {
        // Фильтруем тестовые FIGI (TEST, TEST_*, TEST_FIGI_*)
        const isTestFigi = (figi) => {
            if (!figi || typeof figi !== 'string') return false;
            return figi === 'TEST' || figi.startsWith('TEST_') || figi.startsWith('TEST_FIGI_');
        };
        
        const positions = [];
        const rawPositions = portfolio.positions || {};

        // Если positions - массив (реальный портфель)
        if (Array.isArray(rawPositions)) {
            return rawPositions.map(pos => ({
                figi: pos.figi,
                ticker: pos.ticker || pos.figi,
                name: pos.name || pos.ticker,
                quantity: pos.quantity || 0,
                currentPrice: pos.currentPrice || pos.averagePrice || 0,
                marketValue: pos.marketValue || (pos.currentPrice || 0) * (pos.quantity || 0)
            }));
        }

        // Если positions - объект (виртуальный портфель)
        for (const [figi, quantity] of Object.entries(rawPositions)) {
            // Пропускаем тестовые FIGI
            if (isTestFigi(figi)) {
                console.log(`⏭️ Пропускаем тестовый FIGI: ${figi}`);
                continue;
            }
            
            if (typeof quantity === 'number' && quantity > 0) {
                try {
                    const instrument = await CacheService.getInstrument(figi, true);
                    if (!instrument) continue;

                    const currentPrice = instrument.lastPrice || 0;
                    const marketValue = currentPrice * quantity;

                    positions.push({
                        figi,
                        ticker: instrument.ticker || figi,
                        name: instrument.name || instrument.ticker || figi,
                        quantity,
                        currentPrice,
                        marketValue
                    });
                } catch (error) {
                    console.warn(`⚠️ Ошибка получения данных для позиции ${figi}:`, error.message);
                }
            }
        }

        return positions;
    }

    /**
     * Расчет операций ребалансировки
     * @param {Array} deviations - Отклонения от целевых весов
     * @returns {Array} Массив операций для ребалансировки
     */
    async calculateRebalancingOperations(deviations) {
        try {
            const operations = [];
            const portfolio = await TradingEngine.getPortfolioValue();
            const totalValue = portfolio.totalValue || 
                             (portfolio.cash || 0) + 
                             (await this.getDetailedPositions(portfolio)).reduce((sum, p) => sum + p.marketValue, 0);

            for (const deviation of deviations) {
                if (!deviation.needsRebalancing) continue;

                const valueDiff = deviation.targetValue - deviation.currentValue;
                const absValueDiff = Math.abs(valueDiff);

                // Пропускаем операции меньше минимальной суммы
                if (absValueDiff < this.settings.minAmount) {
                    continue;
                }

                // Определяем действие и количество
                let action = null;
                let quantity = 0;

                if (valueDiff > 0) {
                    // Нужно купить
                    action = 'BUY';
                    if (deviation.currentPrice && deviation.currentPrice > 0) {
                        quantity = Math.floor(valueDiff / deviation.currentPrice);
                    } else {
                        // Если цена недоступна, получаем из кеша
                        try {
                            const instrument = await CacheService.getInstrument(deviation.figi, true);
                            const price = instrument?.lastPrice || 0;
                            if (price > 0) {
                                quantity = Math.floor(valueDiff / price);
                            } else {
                                console.warn(`⚠️ Цена недоступна для ${deviation.ticker}, пропускаем операцию`);
                                continue;
                            }
                        } catch (error) {
                            console.warn(`⚠️ Ошибка получения цены для ${deviation.ticker}:`, error.message);
                            continue;
                        }
                    }
                } else {
                    // Нужно продать
                    action = 'SELL';
                    const positions = await this.getDetailedPositions(portfolio);
                    const position = positions.find(p => p.figi === deviation.figi || p.ticker === deviation.ticker);
                    
                    if (!position || position.quantity <= 0) {
                        continue;
                    }

                    if (deviation.currentPrice && deviation.currentPrice > 0) {
                        quantity = Math.min(
                            Math.floor(Math.abs(valueDiff) / deviation.currentPrice),
                            position.quantity
                        );
                    } else {
                        quantity = Math.min(
                            Math.floor(Math.abs(valueDiff) / position.currentPrice),
                            position.quantity
                        );
                    }
                }

                if (quantity <= 0) {
                    continue;
                }

                // Получаем текущую цену
                let currentPrice = deviation.currentPrice;
                if (!currentPrice || currentPrice <= 0) {
                    try {
                        const instrument = await CacheService.getInstrument(deviation.figi, true);
                        currentPrice = instrument?.lastPrice || 0;
                    } catch (error) {
                        console.warn(`⚠️ Не удалось получить цену для ${deviation.ticker}`);
                        continue;
                    }
                }

                if (currentPrice <= 0) {
                    continue;
                }

                operations.push({
                    figi: deviation.figi,
                    ticker: deviation.ticker,
                    name: deviation.name,
                    action,
                    quantity,
                    currentPrice,
                    estimatedValue: currentPrice * quantity,
                    deviation: deviation.deviation,
                    deviationPercent: deviation.deviationPercent,
                    priority: Math.abs(deviation.deviationPercent) // Приоритет = абсолютное отклонение
                });
            }

            return operations;

        } catch (error) {
            console.error('❌ Ошибка расчета операций ребалансировки:', error);
            return [];
        }
    }

    /**
     * Оптимизация операций с учетом комиссий
     * @param {Array} operations - Операции ребалансировки
     * @returns {Array} Оптимизированные операции
     */
    async optimizeOperationsWithCommissions(operations) {
        try {
            const optimized = [];
            
            // Получаем актуальное состояние портфеля
            const portfolio = await TradingEngine.getPortfolioValue();
            const positions = await this.getDetailedPositions(portfolio);
            const totalValue = positions.reduce((sum, p) => sum + p.marketValue, 0) + (portfolio.cash || 0);
            const portfolioPositions = portfolio.positions || {};

            for (const operation of operations) {
                // Рассчитываем комиссию
                const dealAmount = operation.currentPrice * operation.quantity;
                const commission = TinkoffApiService.calculateCommission(
                    operation.currentPrice,
                    operation.quantity
                );
                const estimatedCommission = commission.amount || 0;

                // Рассчитываем выгоду от ребалансировки
                // Выгода = исправление веса в рублях
                const rebalanceBenefit = Math.abs(operation.deviation) * totalValue / 100;

                // Чистая выгода = выгода - комиссия
                const netBenefit = rebalanceBenefit - estimatedCommission;

                // Проверяем целесообразность операции
                if (netBenefit < this.settings.minBenefit) {
                    console.log(`⏭️ Пропущена операция ${operation.ticker} ${operation.action}: чистая выгода ${netBenefit.toFixed(2)} руб < минимум ${this.settings.minBenefit} руб`);
                    continue;
                }

                if (dealAmount < this.settings.minAmount) {
                    console.log(`⏭️ Пропущена операция ${operation.ticker} ${operation.action}: сумма ${dealAmount.toFixed(2)} руб < минимум ${this.settings.minAmount} руб`);
                    continue;
                }

                // Проверяем достаточность средств/позиций
                if (operation.action === 'BUY') {
                    const requiredAmount = dealAmount + estimatedCommission;
                    if (requiredAmount > (portfolio.cash || 0)) {
                        console.log(`⏭️ Пропущена покупка ${operation.ticker}: недостаточно средств (нужно ${requiredAmount.toFixed(2)}, доступно ${(portfolio.cash || 0).toFixed(2)})`);
                        continue;
                    }
                } else if (operation.action === 'SELL') {
                    // Проверяем наличие позиции
                    const position = positions.find(p => p.figi === operation.figi || p.ticker === operation.ticker);
                    const availableQuantity = position?.quantity || 0;
                    if (operation.quantity > availableQuantity) {
                        console.log(`⏭️ Пропущена продажа ${operation.ticker}: недостаточно позиций (нужно ${operation.quantity}, доступно ${availableQuantity})`);
                        continue;
                    }
                }

                optimized.push({
                    ...operation,
                    estimatedCommission,
                    rebalanceBenefit,
                    netBenefit
                });
            }

            // Сортируем по приоритету (крупные отклонения первыми)
            optimized.sort((a, b) => b.priority - a.priority);

            // Ограничиваем количество операций
            return optimized.slice(0, this.settings.maxOperations);

        } catch (error) {
            console.error('❌ Ошибка оптимизации операций:', error);
            return operations; // Возвращаем исходные операции при ошибке
        }
    }

    /**
     * Выполнение ребалансировки
     * @param {Array} operations - Операции для выполнения
     * @param {string} trigger - Причина ребалансировки (scheduled, manual, threshold)
     * @param {boolean} saveHistory - Сохранять ли историю (по умолчанию true)
     * @returns {Object} Результат ребалансировки
     */
    async executeRebalancing(operations, trigger = 'manual', saveHistory = true) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            if (this.settings.dryRun) {
                console.log('🔍 DRY RUN: Ребалансировка не будет выполнена');
                return {
                    success: true,
                    dryRun: true,
                    operationsPlanned: operations.length,
                    operationsExecuted: 0,
                    operationsSkipped: 0,
                    totalCommission: 0,
                    operations: operations.map(op => ({
                        ...op,
                        executed: false,
                        dryRun: true
                    }))
                };
            }

            const results = {
                success: true,
                operationsPlanned: operations.length,
                operationsExecuted: 0,
                operationsSkipped: 0,
                operationsFailed: 0,
                totalCommission: 0,
                operations: [],
                errors: []
            };

            // Сохраняем состояние до ребалансировки
            const portfolioBefore = await TradingEngine.getPortfolioValue();
            const positionsBefore = await this.getDetailedPositions(portfolioBefore);

            // Выполняем операции
            for (const operation of operations) {
                try {
                    const signal = {
                        symbol: operation.figi,
                        action: operation.action,
                        quantity: operation.quantity,
                        price: operation.currentPrice,
                        confidence: 1.0,
                        isRebalancing: true
                    };

                    const result = await TradingEngine.executeOrder(signal);

                    if (result && result.trade) {
                        results.operationsExecuted++;
                        results.totalCommission += result.trade.commission || 0;
                        results.operations.push({
                            ...operation,
                            executed: true,
                            executionPrice: result.trade.price,
                            actualCommission: result.trade.commission || 0,
                            tradeId: result.trade.id
                        });
                    } else {
                        results.operationsSkipped++;
                        results.operations.push({
                            ...operation,
                            executed: false,
                            reason: 'Не удалось выполнить операцию'
                        });
                    }
                } catch (error) {
                    console.error(`❌ Ошибка выполнения операции ${operation.ticker} ${operation.action}:`, error);
                    results.operationsFailed++;
                    results.errors.push({
                        operation: operation.ticker,
                        action: operation.action,
                        error: error.message
                    });
                    results.operations.push({
                        ...operation,
                        executed: false,
                        error: error.message
                    });
                }
            }

            // Получаем состояние после ребалансировки
            const portfolioAfter = await TradingEngine.getPortfolioValue();
            const positionsAfter = await this.getDetailedPositions(portfolioAfter);

            results.beforeState = {
                totalValue: portfolioBefore.totalValue || 0,
                cash: portfolioBefore.cash || 0,
                positionsCount: positionsBefore.length
            };

            results.afterState = {
                totalValue: portfolioAfter.totalValue || 0,
                cash: portfolioAfter.cash || 0,
                positionsCount: positionsAfter.length
            };

            this.lastRebalance = new Date();
            results.timestamp = this.lastRebalance.toISOString();
            
            // Сохраняем историю ребалансировки (если не отключено)
            if (saveHistory) {
                try {
                const resultStatus = results.operationsFailed > 0 
                    ? (results.operationsExecuted > 0 ? 'partial' : 'failed')
                    : (results.operationsExecuted > 0 ? 'success' : 'pending');
                
                await PortfolioRebalancing.create({
                    timestamp: this.lastRebalance,
                    trigger: trigger,
                    operations: results.operations,
                    totalCommission: results.totalCommission,
                    beforeState: results.beforeState,
                    afterState: results.afterState,
                    result: resultStatus,
                    metadata: {
                        operationsPlanned: results.operationsPlanned,
                        operationsExecuted: results.operationsExecuted,
                        operationsSkipped: results.operationsSkipped,
                        operationsFailed: results.operationsFailed,
                        errors: results.errors
                    }
                });
                } catch (historyError) {
                    console.warn('⚠️ Не удалось сохранить историю ребалансировки:', historyError.message);
                    // Не прерываем выполнение при ошибке сохранения истории
                }
            }

            return results;

        } catch (error) {
            console.error('❌ Ошибка выполнения ребалансировки:', error);
            return {
                success: false,
                error: error.message,
                operationsPlanned: operations.length,
                operationsExecuted: 0
            };
        }
    }

    /**
     * Полная процедура ребалансировки
     * @returns {Object} Результат ребалансировки
     */
    async performRebalancing() {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            if (!this.settings.enabled) {
                return {
                    success: false,
                    reason: 'Ребалансировка отключена в настройках'
                };
            }

            // Проверяем необходимость ребалансировки
            const check = await this.checkRebalancingNeeded();

            if (!check.needsRebalancing) {
                return {
                    success: true,
                    rebalanced: false,
                    reason: 'Ребалансировка не требуется',
                    check: check.summary
                };
            }

            // Рассчитываем операции
            const operations = await this.calculateRebalancingOperations(check.deviations);

            if (operations.length === 0) {
                return {
                    success: true,
                    rebalanced: false,
                    reason: 'Нет операций для выполнения',
                    deviations: check.deviations.length
                };
            }

            // Оптимизируем операции
            const optimizedOperations = await this.optimizeOperationsWithCommissions(operations);

            if (optimizedOperations.length === 0) {
                return {
                    success: true,
                    rebalanced: false,
                    reason: 'После оптимизации не осталось целесообразных операций',
                    operationsPlanned: operations.length
                };
            }

            // Выполняем ребалансировку (trigger = 'scheduled' для автоматической, 'manual' для ручной)
            // Определяем trigger на основе контекста вызова
            const trigger = 'scheduled'; // По умолчанию для автоматической ребалансировки
            const result = await this.executeRebalancing(optimizedOperations, trigger);

            // Отправляем уведомление
            if (result.success && result.operationsExecuted > 0) {
                try {
                    await OptimizedTelegramService.sendAlert(
                        'PORTFOLIO_REBALANCED',
                        `Портфель ребалансирован: выполнено ${result.operationsExecuted} операций, комиссия ${result.totalCommission.toFixed(2)} руб`,
                        'info'
                    );
                } catch (error) {
                    console.warn('⚠️ Не удалось отправить уведомление:', error.message);
                }
            }

            return {
                success: true,
                rebalanced: result.operationsExecuted > 0,
                ...result,
                check: check.summary
            };

        } catch (error) {
            console.error('❌ Ошибка выполнения ребалансировки:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Получение статуса сервиса
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            enabled: this.settings.enabled,
            settings: this.settings,
            lastCheck: this.lastCheck,
            lastRebalance: this.lastRebalance
        };
    }
}

export default new PortfolioRebalancingService();

