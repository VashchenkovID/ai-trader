import TradingRequest from '../models/TradingRequest.js';
import PositionExit from '../models/PositionExit.js';
import TradingEngine from './TradingEngine.js';
import CacheService from './CacheService.js';
import CachedInstrument from '../models/CachedInstrument.js';
import TradingModeManager from './TradingModeManager.js';
import OptimizedTelegramService from './OptimizedTelegramService.js';
import WebSocketService from './WebSocketService.js';

/**
 * Сервис для частичного закрытия позиций
 * Реализует стратегию постепенного закрытия:
 * - 50% при +10% прибыли
 * - 25% при +15% прибыли  
 * - 25% при +20% прибыли или трейлинг-стоп
 */
class PartialExitService {
    constructor() {
        this.isInitialized = false;
        // Этапы закрытия: [процент прибыли, процент позиции для закрытия от НАЧАЛЬНОГО количества]
        // ВАЖНО: Проценты накопительные (50% → 75% → 100%)
        this.exitStages = [
            { profitPercent: 10, exitPercent: 50, cumulativePercent: 50, stage: 'STAGE_1_10PCT' },  // Закрыть 50% (итого 50%)
            { profitPercent: 15, exitPercent: 25, cumulativePercent: 75, stage: 'STAGE_2_15PCT' },  // Закрыть еще 25% (итого 75%)
            { profitPercent: 20, exitPercent: 25, cumulativePercent: 100, stage: 'STAGE_3_20PCT' }   // Закрыть еще 25% (итого 100%)
        ];
    }

    async initialize() {
        try {
            this.isInitialized = true;
        } catch (error) {
            const LoggerService = (await import('./LoggerService.js')).default;
            LoggerService.error('Failed to initialize Partial Exit Service', {
                service: 'PartialExitService',
                operation: 'initialize',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            throw error;
        }
    }

    /**
     * Проверка всех открытых позиций и частичное закрытие при достижении целей
     */
    async checkAndExecutePartialExits() {
        try {
            // Получаем все исполненные BUY заявки, которые еще не закрыты полностью
            const openPositions = await TradingRequest.findAll({
                where: {
                    action: 'BUY',
                    status: 'EXECUTED',
                    tradingMode: ['paper', 'micro', 'real']
                },
                order: [['executedAt', 'ASC']]
            });

            if (!openPositions || openPositions.length === 0) {
                return {
                    checked: 0,
                    executed: 0,
                    skipped: 0
                };
            }

            let checked = 0;
            let executed = 0;
            let skipped = 0;

            // Получаем текущие цены для всех инструментов
            const figis = [...new Set(openPositions.map(req => req.figi))];
            const currentPrices = await this.getCurrentPrices(figis);

            for (const position of openPositions) {
                try {
                    checked++;
                    
                    // Получаем текущую цену
                    const currentPrice = currentPrices[position.figi];
                    if (!currentPrice || currentPrice <= 0) {
                        skipped++;
                        continue;
                    }

                    // Проверяем, нужно ли закрывать позицию
                    const exitResult = await this.checkPositionForExit(position, currentPrice);
                    
                    if (exitResult.shouldExit) {
                        await this.executePartialExit(position, exitResult);
                        executed++;
                    }
                } catch (error) {
                    console.error(`❌ Error checking position ${position.figi}:`, error.message);
                    skipped++;
                }
            }

            return {
                checked,
                executed,
                skipped
            };
        } catch (error) {
            console.error('❌ Error in checkAndExecutePartialExits:', error);
            throw error;
        }
    }

    /**
     * Проверка позиции на необходимость частичного закрытия
     */
    async checkPositionForExit(position, currentPrice) {
        try {
            // Валидация входных данных
            if (!position || !position.id || !position.figi) {
                return { shouldExit: false, reason: 'Invalid position data' };
            }
            
            if (!currentPrice || !isFinite(currentPrice) || currentPrice <= 0) {
                return { shouldExit: false, reason: 'Invalid current price' };
            }
            
            // Проверяем, не сработал ли трейлинг-стоп
            const TrailingStop = (await import('../models/TrailingStop.js')).default;
            const activeTrailingStop = await TrailingStop.findOne({
                where: {
                    tradingRequestId: position.id,
                    status: ['pending', 'active', 'triggered']
                }
            });
            
            if (activeTrailingStop && activeTrailingStop.status === 'triggered') {
                return { 
                    shouldExit: false, 
                    reason: 'Trailing stop already triggered',
                    trailingStopTriggered: true
                };
            }
            
            // Получаем историю закрытий для этой позиции
            const existingExits = await PositionExit.getExitsByRequest(position.id);
            const executedExits = existingExits.filter(e => e.status === 'EXECUTED');
            
            // Определяем, какие этапы уже выполнены
            const completedStages = new Set(executedExits.map(e => e.exitStage));
            
            // Рассчитываем текущий процент прибыли
            const entryPrice = position.actualPrice || position.priceAtRequest;
            if (!entryPrice || entryPrice <= 0 || !isFinite(entryPrice)) {
                return { shouldExit: false, reason: 'Invalid entry price' };
            }

            const profitPercent = ((currentPrice - entryPrice) / entryPrice) * 100;

            // Определяем оставшееся количество акций
            let remainingQuantity = position.quantity;
            if (executedExits.length > 0) {
                const totalExited = executedExits.reduce((sum, exit) => sum + exit.exitQuantity, 0);
                remainingQuantity = position.quantity - totalExited;
            }

            if (remainingQuantity <= 0) {
                return { shouldExit: false, reason: 'Position already fully closed', remainingQuantity: 0 };
            }

            // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Проценты считаются от НАЧАЛЬНОГО количества позиции, а не от оставшегося
            const initialQuantity = position.quantity;

            // Проверяем каждый этап закрытия
            for (const stage of this.exitStages) {
                // Если этап уже выполнен, пропускаем
                if (completedStages.has(stage.stage)) {
                    continue;
                }

                // Если прибыль достигла порога для этого этапа
                if (profitPercent >= stage.profitPercent) {
                    // Рассчитываем накопительное целевое количество от НАЧАЛЬНОГО количества
                    const targetCumulativeQuantity = Math.floor(initialQuantity * (stage.cumulativePercent / 100));
                    
                    // Рассчитываем, сколько уже было закрыто на предыдущих этапах
                    const alreadyExited = executedExits.reduce((sum, exit) => sum + exit.exitQuantity, 0);
                    
                    // Количество для закрытия на этом этапе = накопительное целевое - уже закрытое
                    const exitQuantity = Math.max(0, targetCumulativeQuantity - alreadyExited);
                    
                    // Проверяем, что есть что закрывать и что не превышаем оставшееся количество
                    const actualExitQuantity = Math.min(exitQuantity, remainingQuantity);
                    
                    if (actualExitQuantity > 0) {
                        return {
                            shouldExit: true,
                            stage: stage.stage,
                            profitPercent,
                            exitQuantity: actualExitQuantity,
                            exitPrice: currentPrice,
                            entryPrice,
                            remainingQuantity: remainingQuantity - actualExitQuantity
                        };
                    }
                }
            }

            return { shouldExit: false, reason: 'No exit conditions met' };
        } catch (error) {
            console.error(`❌ Error checking position for exit:`, error);
            return { shouldExit: false, reason: error.message };
        }
    }

    /**
     * Выполнение частичного закрытия позиции
     */
    async executePartialExit(position, exitInfo) {
        try {
            // Валидация входных данных
            if (!position || !position.id || !position.figi) {
                throw new Error('Invalid position data');
            }
            
            if (!exitInfo || !exitInfo.shouldExit) {
                throw new Error('Exit conditions not met');
            }
            
            // Валидация количества для закрытия
            if (!exitInfo.exitQuantity || exitInfo.exitQuantity <= 0 || !isFinite(exitInfo.exitQuantity)) {
                throw new Error(`Invalid exitQuantity: ${exitInfo.exitQuantity}`);
            }
            
            if (!exitInfo.exitPrice || exitInfo.exitPrice <= 0 || !isFinite(exitInfo.exitPrice)) {
                throw new Error(`Invalid exitPrice: ${exitInfo.exitPrice}`);
            }
            
            // Проверяем, что не закрываем больше, чем есть
            const existingExits = await PositionExit.getExitsByRequest(position.id);
            const executedExits = existingExits.filter(e => e.status === 'EXECUTED');
            const totalExited = executedExits.reduce((sum, e) => sum + e.exitQuantity, 0);
            const remainingQuantity = position.quantity - totalExited;
            
            if (exitInfo.exitQuantity > remainingQuantity) {
                throw new Error(`Cannot exit ${exitInfo.exitQuantity} shares, only ${remainingQuantity} remaining`);
            }
            
            // Проверяем, не сработал ли трейлинг-стоп
            const RiskManagementService = (await import('./RiskManagementService.js')).default;
            const TrailingStop = (await import('../models/TrailingStop.js')).default;
            
            const activeTrailingStop = await TrailingStop.findOne({
                where: {
                    tradingRequestId: position.id,
                    status: ['pending', 'active', 'triggered'] // Включаем 'triggered' для проверки
                }
            });
            
            if (activeTrailingStop && activeTrailingStop.status === 'triggered') {
                console.log(`⚠️ Трейлинг-стоп уже сработал для ${position.ticker}, пропускаем частичное закрытие`);
                return {
                    success: false,
                    reason: 'Trailing stop already triggered',
                    trailingStopId: activeTrailingStop.id
                };
            }
            
            const currentMode = TradingModeManager.getCurrentMode().mode;
            
            // Создаем запись о закрытии
            const positionExit = await PositionExit.create({
                tradingRequestId: position.id,
                figi: position.figi,
                ticker: position.ticker,
                name: position.name,
                entryPrice: exitInfo.entryPrice,
                initialQuantity: position.quantity,
                remainingQuantity: remainingQuantity - exitInfo.exitQuantity,
                exitStage: exitInfo.stage,
                profitPercent: exitInfo.profitPercent,
                exitPrice: exitInfo.exitPrice,
                exitQuantity: exitInfo.exitQuantity,
                exitAmount: exitInfo.exitPrice * exitInfo.exitQuantity,
                commission: 0, // Будет рассчитана при исполнении
                realizedProfit: 0, // Будет рассчитана при исполнении
                status: 'PENDING',
                tradingMode: currentMode
            });

            console.log(`📊 Creating partial exit for ${position.ticker}: ${exitInfo.exitQuantity} shares (${exitInfo.profitPercent.toFixed(2)}% profit)`);

            // Выполняем закрытие через TradingEngine
            const executionResult = await this.executeExitTrade(position, exitInfo, currentMode);
            
            // Обновляем запись о закрытии
            const realizedProfit = (exitInfo.exitPrice - exitInfo.entryPrice) * exitInfo.exitQuantity - executionResult.commission;
            
            await positionExit.execute({
                exitPrice: executionResult.price,
                commission: executionResult.commission,
                realizedProfit,
                notes: `Partial exit: ${exitInfo.stage}, ${exitInfo.profitPercent.toFixed(2)}% profit`
            });

            // Отправляем уведомления
            await this.sendNotifications(position, exitInfo, executionResult, realizedProfit);

            return {
                success: true,
                positionExit,
                executionResult,
                realizedProfit
            };
        } catch (error) {
            console.error(`❌ Error executing partial exit for ${position.figi}:`, error);
            throw error;
        }
    }

    /**
     * Выполнение торговой операции закрытия
     */
    async executeExitTrade(position, exitInfo, tradingMode) {
        try {
            const signal = {
                symbol: position.figi,
                action: 'SELL',
                quantity: exitInfo.exitQuantity,
                price: exitInfo.exitPrice,
                confidence: 1.0, // Максимальная уверенность для частичного закрытия
                isPartialExit: true,
                originalRequestId: position.id
            };

            let result;
            
            if (tradingMode === 'paper') {
                result = await TradingEngine.executePaperOrder(signal);
            } else if (tradingMode === 'micro') {
                result = await TradingEngine.executeMicroOrder(signal);
            } else {
                // В режиме real пользователь выполняет вручную
                // Создаем торговую заявку напрямую для частичного закрытия
                const exitRequest = await TradingRequest.create({
                    recommendationId: position.recommendationId || position.figi,
                    figi: position.figi,
                    ticker: position.ticker,
                    name: position.name,
                    action: 'SELL',
                    quantity: exitInfo.exitQuantity,
                    priceAtRequest: exitInfo.exitPrice,
                    estimatedAmount: exitInfo.exitPrice * exitInfo.exitQuantity,
                    confidence: 1.0,
                    score: 1.0,
                    reasoning: `Частичное закрытие позиции: ${exitInfo.stage}, прибыль ${exitInfo.profitPercent.toFixed(2)}%`,
                    tradingMode: 'real',
                    status: 'PENDING',
                    takeProfit: null, // Частичное закрытие не требует takeProfit
                    userComment: `Автоматическое частичное закрытие: ${exitInfo.stage}`
                });
                
                console.log(`📋 Created SELL request for partial exit: ${exitRequest.id}`);
                
                return {
                    price: exitInfo.exitPrice,
                    commission: 0, // Будет рассчитана при реальном исполнении
                    requestId: exitRequest.id,
                    mode: 'real'
                };
            }

            return {
                price: result.trade.price,
                commission: result.trade.commission || 0,
                mode: tradingMode
            };
        } catch (error) {
            console.error(`❌ Error executing exit trade:`, error);
            throw error;
        }
    }

    /**
     * Получение текущих цен для инструментов
     */
    async getCurrentPrices(figis) {
        const prices = {};
        
        try {
            for (const figi of figis) {
                try {
                    const instrument = await CachedInstrument.findOne({
                        where: { figi }
                    });
                    
                    if (instrument && instrument.lastPrice) {
                        prices[figi] = instrument.lastPrice;
                    } else {
                        // Пытаемся получить цену через CacheService
                        const price = await CacheService.getInstrument(figi, true);
                        if (price && price.lastPrice) {
                            prices[figi] = price.lastPrice;
                        }
                    }
                } catch (error) {
                    console.warn(`⚠️ Could not get price for ${figi}:`, error.message);
                }
            }
        } catch (error) {
            console.error('❌ Error getting current prices:', error);
        }
        
        return prices;
    }

    /**
     * Отправка уведомлений о частичном закрытии
     */
    async sendNotifications(position, exitInfo, executionResult, realizedProfit) {
        try {
            const profitText = exitInfo.profitPercent >= 0 ? '+' : '';
            const message = `📊 Частичное закрытие позиции\n` +
                `📈 Инструмент: ${position.ticker} (${position.name})\n` +
                `💰 Закрыто: ${exitInfo.exitQuantity} акций (${((exitInfo.exitQuantity / position.quantity) * 100).toFixed(1)}%)\n` +
                `📊 Прибыль: ${profitText}${exitInfo.profitPercent.toFixed(2)}%\n` +
                `💵 Цена закрытия: ${exitInfo.exitPrice.toFixed(2)} ₽\n` +
                `💎 Реализованная прибыль: ${realizedProfit.toFixed(2)} ₽\n` +
                `📋 Этап: ${this.getStageDescription(exitInfo.stage)}`;

            // Отправляем через Telegram
            try {
                await OptimizedTelegramService.sendMessage(message);
            } catch (telegramError) {
                console.warn('⚠️ Could not send Telegram notification:', telegramError.message);
            }

            // Отправляем через WebSocket
            try {
                const wsService = await WebSocketService.getInstance();
                if (wsService && typeof wsService.broadcast === 'function') {
                    wsService.broadcast({
                        type: 'partial_exit_executed',
                        data: {
                            positionId: position.id,
                            figi: position.figi,
                            ticker: position.ticker,
                            exitStage: exitInfo.stage,
                            exitQuantity: exitInfo.exitQuantity,
                            exitPrice: exitInfo.exitPrice,
                            profitPercent: exitInfo.profitPercent,
                            realizedProfit,
                            timestamp: new Date().toISOString()
                        }
                    });
                }
            } catch (wsError) {
                console.warn('⚠️ Could not send WebSocket notification:', wsError.message);
            }
        } catch (error) {
            console.error('❌ Error sending notifications:', error);
        }
    }

    /**
     * Получение описания этапа закрытия
     */
    getStageDescription(stage) {
        const descriptions = {
            'STAGE_1_10PCT': 'Этап 1: +10% прибыли (50% позиции)',
            'STAGE_2_15PCT': 'Этап 2: +15% прибыли (25% позиции)',
            'STAGE_3_20PCT': 'Этап 3: +20% прибыли (25% позиции)',
            'FULL_CLOSE': 'Полное закрытие',
            'TRAILING_STOP': 'Трейлинг-стоп'
        };
        return descriptions[stage] || stage;
    }

    /**
     * Получение статистики по частичным закрытиям
     */
    async getExitStatistics(figi = null, tradingRequestId = null) {
        try {
            const where = {};
            if (figi) where.figi = figi;
            if (tradingRequestId) where.tradingRequestId = tradingRequestId;

            const exits = await PositionExit.findAll({
                where: {
                    ...where,
                    status: 'EXECUTED'
                }
            });

            const stats = {
                totalExits: exits.length,
                totalRealizedProfit: exits.reduce((sum, e) => sum + (e.realizedProfit || 0), 0),
                totalCommission: exits.reduce((sum, e) => sum + (e.commission || 0), 0),
                byStage: {}
            };

            // Группируем по этапам
            for (const exit of exits) {
                if (!stats.byStage[exit.exitStage]) {
                    stats.byStage[exit.exitStage] = {
                        count: 0,
                        totalProfit: 0,
                        totalQuantity: 0
                    };
                }
                stats.byStage[exit.exitStage].count++;
                stats.byStage[exit.exitStage].totalProfit += exit.realizedProfit || 0;
                stats.byStage[exit.exitStage].totalQuantity += exit.exitQuantity;
            }

            return stats;
        } catch (error) {
            console.error('❌ Error getting exit statistics:', error);
            throw error;
        }
    }
}

// Создаем единственный экземпляр
const partialExitService = new PartialExitService();

export default partialExitService;

