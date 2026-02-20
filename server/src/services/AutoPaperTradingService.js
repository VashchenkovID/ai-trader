/**
 * Сервис автоматического исполнения заявок в paper режиме
 * Управляет жизненным циклом автоматических заявок и их исполнением
 */

import LoggerService from './LoggerService.js';
import TradingEngine from './TradingEngine.js';
import RiskManagementService from './RiskManagementService.js';
import RealisticExecutionSimulator from './RealisticExecutionSimulator.js';
import TradingRequest from '../models/TradingRequest.js';
import AutoPaperTradingStats from '../models/AutoPaperTradingStats.js';
import TradingModeManager from './TradingModeManager.js';
import { Op } from 'sequelize';
import sequelize from '../config/database.js';

class AutoPaperTradingService {
    constructor() {
        this.isInitialized = false;
        this.isEnabled = false; // Глобальный флаг включения
        this.processingLock = false; // Блокировка для предотвращения race conditions
        this.rlTrainingCache = new Map(); // Кеш для RL обучения (figi -> lastTrainingTime)
        
        this.settings = {
            // Условия автоматического исполнения
            minConfidence: 0.7,        // Минимальная уверенность для авто-исполнения
            maxConfidence: 0.95,       // Максимальная уверенность (защита от переобучения)
            minScore: 0.65,            // Минимальный score для BUY
            maxScore: 0.35,            // Максимальный score для SELL
            maxPositionSize: 0.05,     // Максимум 5% капитала на позицию
            maxDailyTrades: 15,        // Максимум сделок в день
            minTimeBetweenTrades: 300, // Минимум 5 минут между сделками (секунды)
            maxDailyLoss: 0.05,        // Максимум 5% дневного убытка
            enableRealisticExecution: true, // Включить реалистичную симуляцию
            
            // Лимиты для разных фаз
            phase1: {
                maxDailyTrades: 5,
                minConfidence: 0.8,
                maxPositionSize: 0.03
            },
            phase2: {
                maxDailyTrades: 10,
                minConfidence: 0.75,
                maxPositionSize: 0.04
            },
            phase3: {
                maxDailyTrades: 15,
                minConfidence: 0.7,
                maxPositionSize: 0.05
            }
        };
        
        this.stats = {
            dailyTrades: 0,
            dailyPnL: 0,
            totalTrades: 0,
            lastTradeTime: null,
            currentPhase: 'phase1' // phase1, phase2, phase3
        };
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            // Инициализация зависимостей - RiskManagementService должен быть доступен
            if (!RiskManagementService.isInitialized) {
                await RiskManagementService.initialize();
            }
            
            // Загрузка статистики из БД
            await this.loadDailyStats();
            
            // Инициализация RealisticExecutionSimulator
            await RealisticExecutionSimulator.initialize();
            
            // Проверка состояния системы
            const currentMode = TradingModeManager.getCurrentMode().mode;
            if (currentMode !== 'paper') {
                LoggerService.warn('AutoPaperTradingService initialized but current mode is not paper', {
                    currentMode
                });
            }
            
            this.isInitialized = true;
            LoggerService.info('AutoPaperTradingService initialized', {
                currentPhase: this.stats.currentPhase,
                dailyTrades: this.stats.dailyTrades
            });
        } catch (error) {
            LoggerService.error('Failed to initialize AutoPaperTradingService', {
                service: 'AutoPaperTradingService',
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Загрузка дневной статистики из БД
     */
    async loadDailyStats() {
        try {
            const stats = await AutoPaperTradingStats.getTodayStats();
            
            // Восстановить значения
            this.stats.dailyTrades = stats.dailyTrades;
            this.stats.dailyPnL = stats.dailyPnL;
            this.stats.totalTrades = stats.totalTrades;
            this.stats.currentPhase = stats.currentPhase;
            
            // Загрузить время последней сделки из БД
            // Проверяем, существует ли таблица trading_requests перед запросом
            try {
                // Проверяем существование таблицы через raw query
                const [tableCheck] = await sequelize.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = 'trading_requests'
                    );
                `);
                
                const tableExists = tableCheck && tableCheck[0] && (tableCheck[0].exists === true || tableCheck[0].exists === 't');
                
                if (tableExists) {
                    const lastTrade = await TradingRequest.findOne({
                        where: {
                            autoExecuted: true,
                            status: 'EXECUTED'
                        },
                        order: [['executedAt', 'DESC']],
                        attributes: ['executedAt']
                    });
                    
                    if (lastTrade && lastTrade.executedAt) {
                        this.stats.lastTradeTime = new Date(lastTrade.executedAt);
                    }
                } else {
                    LoggerService.debug('Table trading_requests does not exist yet, skipping lastTradeTime load', {
                        service: 'AutoPaperTradingService'
                    });
                }
            } catch (tableError) {
                // Игнорируем ошибки, если таблица еще не создана
                if (tableError.message && tableError.message.includes('does not exist')) {
                    LoggerService.debug('Table trading_requests does not exist yet, skipping lastTradeTime load', {
                        service: 'AutoPaperTradingService',
                        error: tableError.message
                    });
                } else {
                    throw tableError;
                }
            }
        } catch (error) {
            LoggerService.warn('Failed to load daily stats, using defaults', {
                error: error.message
            });
        }
    }

    /**
     * Сохранение дневной статистики в БД
     */
    async saveDailyStats() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const stats = await AutoPaperTradingStats.getTodayStats();
            
            stats.dailyTrades = this.stats.dailyTrades;
            stats.dailyPnL = this.stats.dailyPnL;
            stats.totalTrades = this.stats.totalTrades;
            stats.currentPhase = this.stats.currentPhase;
            stats.settings = this.getCurrentSettings();
            
            await stats.save();
        } catch (error) {
            LoggerService.warn('Failed to save daily stats', {
                error: error.message
            });
        }
    }

    /**
     * Получение текущих настроек с учетом фазы
     */
    getCurrentSettings() {
        const phaseSettings = this.settings[this.stats.currentPhase];
        
        // Настройки фазы имеют приоритет
        return {
            minConfidence: phaseSettings?.minConfidence ?? this.settings.minConfidence,
            maxConfidence: this.settings.maxConfidence,
            minScore: this.settings.minScore,
            maxScore: this.settings.maxScore,
            maxDailyTrades: phaseSettings?.maxDailyTrades ?? this.settings.maxDailyTrades,
            maxPositionSize: phaseSettings?.maxPositionSize ?? this.settings.maxPositionSize,
            minTimeBetweenTrades: this.settings.minTimeBetweenTrades,
            maxDailyLoss: this.settings.maxDailyLoss,
            enableRealisticExecution: this.settings.enableRealisticExecution
        };
    }

    /**
     * Получение максимального количества сделок для текущей фазы
     */
    getCurrentMaxDailyTrades() {
        return this.getCurrentSettings().maxDailyTrades;
    }

    /**
     * Проверка возможности автоматического исполнения заявки
     * @param {Object} tradingRequest - Торговая заявка
     * @returns {Promise<Object>} { canAutoExecute: boolean, reason: string }
     */
    async canAutoExecute(tradingRequest) {
        try {
            // 1. Проверка режима торговли (только paper)
            const currentMode = TradingModeManager.getCurrentMode().mode;
            if (currentMode !== 'paper') {
                return { canAutoExecute: false, reason: 'Auto-execution only available in paper mode' };
            }
            
            // 2. Проверка глобального флага isEnabled
            if (!this.isEnabled) {
                return { canAutoExecute: false, reason: 'Auto-execution is disabled' };
            }
            
            // 3. Проверка статуса заявки
            if (tradingRequest.status !== 'PENDING') {
                return { canAutoExecute: false, reason: `Request is not pending (status: ${tradingRequest.status})` };
            }
            
            // 4. Проверка истечения заявки
            if (tradingRequest.getIsExpired && tradingRequest.getIsExpired()) {
                return { canAutoExecute: false, reason: 'Request has expired' };
            }
            
            // 5. Проверка confidence и score
            const currentSettings = this.getCurrentSettings();
            if (tradingRequest.confidence < currentSettings.minConfidence) {
                return { canAutoExecute: false, reason: `Confidence too low: ${tradingRequest.confidence} < ${currentSettings.minConfidence}` };
            }
            
            if (tradingRequest.confidence > currentSettings.maxConfidence) {
                return { canAutoExecute: false, reason: `Confidence too high (possible overfitting): ${tradingRequest.confidence} > ${currentSettings.maxConfidence}` };
            }
            
            if (tradingRequest.action === 'BUY' && tradingRequest.score < currentSettings.minScore) {
                return { canAutoExecute: false, reason: `Score too low for BUY: ${tradingRequest.score} < ${currentSettings.minScore}` };
            }
            
            if (tradingRequest.action === 'SELL' && tradingRequest.score > currentSettings.maxScore) {
                return { canAutoExecute: false, reason: `Score too high for SELL: ${tradingRequest.score} > ${currentSettings.maxScore}` };
            }
            
            // 6. Проверка лимитов (dailyTrades, timeBetweenTrades)
            const today = new Date().toISOString().split('T')[0];
            const stats = await AutoPaperTradingStats.findOne({
                where: { date: today },
                lock: true // Блокировка строки в БД
            });
            
            if (stats && stats.dailyTrades >= this.getCurrentMaxDailyTrades()) {
                return { canAutoExecute: false, reason: `Daily trades limit reached: ${stats.dailyTrades} >= ${this.getCurrentMaxDailyTrades()}` };
            }
            
            // Проверка времени между сделками
            if (this.stats.lastTradeTime) {
                const timeSinceLastTrade = (Date.now() - this.stats.lastTradeTime.getTime()) / 1000; // в секундах
                if (timeSinceLastTrade < currentSettings.minTimeBetweenTrades) {
                    return { canAutoExecute: false, reason: `Too soon after last trade: ${Math.round(timeSinceLastTrade)}s < ${currentSettings.minTimeBetweenTrades}s` };
                }
            }
            
            // 7. Проверка дневного PnL
            if (stats && stats.dailyPnL < -currentSettings.maxDailyLoss) {
                return { canAutoExecute: false, reason: `Daily loss limit reached: ${stats.dailyPnL} < -${currentSettings.maxDailyLoss}` };
            }
            
            // 8. Проверка размера позиции
            // Получаем текущий портфель для расчета
            const portfolio = await TradingEngine.getPortfolioValue();
            const portfolioValue = portfolio.totalValue || portfolio.totalAmountPortfolio?.value || 50000000;
            const positionValue = tradingRequest.estimatedAmount;
            const positionSize = positionValue / portfolioValue;
            
            if (positionSize > currentSettings.maxPositionSize) {
                return { canAutoExecute: false, reason: `Position size too large: ${(positionSize * 100).toFixed(2)}% > ${(currentSettings.maxPositionSize * 100).toFixed(2)}%` };
            }
            
            // 9. Проверка рисков через RiskManagementService
            // RiskManagementService должен быть инициализирован при инициализации AutoPaperTradingService
            const signal = {
                symbol: tradingRequest.figi,
                figi: tradingRequest.figi,
                action: tradingRequest.action,
                quantity: tradingRequest.quantity,
                price: tradingRequest.priceAtRequest,
                confidence: tradingRequest.confidence,
                score: tradingRequest.score
            };
            
            const validation = await RiskManagementService.validateOrder(signal, portfolio, {});
            if (!validation.isValid) {
                return { 
                    canAutoExecute: false, 
                    reason: `Risk validation failed: ${validation.errors.join(', ')}` 
                };
            }
            
            return { canAutoExecute: true };
        } catch (error) {
            // Если RiskManagementService не инициализирован - это критическая ошибка
            // так как он должен быть инициализирован при старте AutoPaperTradingService
            if (error.message.includes('не инициализирован') || error.message.includes('not initialized')) {
                LoggerService.error('RiskManagementService not initialized - this should not happen', {
                    requestId: tradingRequest.id,
                    error: error.message
                });
                // Пытаемся инициализировать на лету (fallback)
                try {
                    await RiskManagementService.initialize();
                    // Повторяем проверку после инициализации
                    const signal = {
                        symbol: tradingRequest.figi,
                        figi: tradingRequest.figi,
                        action: tradingRequest.action,
                        quantity: tradingRequest.quantity,
                        price: tradingRequest.priceAtRequest,
                        confidence: tradingRequest.confidence,
                        score: tradingRequest.score
                    };
                    const portfolio = await TradingEngine.getPortfolioValue();
                    const validation = await RiskManagementService.validateOrder(signal, portfolio, {});
                    if (!validation.isValid) {
                        return { 
                            canAutoExecute: false, 
                            reason: `Risk validation failed: ${validation.errors.join(', ')}` 
                        };
                    }
                    return { canAutoExecute: true };
                } catch (initError) {
                    LoggerService.error('Failed to initialize RiskManagementService on the fly', {
                        requestId: tradingRequest.id,
                        error: initError.message
                    });
                    return { canAutoExecute: false, reason: `RiskManagementService initialization failed: ${initError.message}` };
                }
            }
            
            // Остальные ошибки логируем как ERROR
            LoggerService.error('Error in canAutoExecute', {
                requestId: tradingRequest.id,
                error: error.message
            });
            
            return { canAutoExecute: false, reason: `Error: ${error.message}` };
        }
    }

    /**
     * Автоматическое исполнение заявки
     * @param {Object} tradingRequest - Торговая заявка
     * @returns {Promise<Object>} Результат исполнения
     */
    async autoExecuteRequest(tradingRequest) {
        const transaction = await sequelize.transaction();
        
        try {
            // 1. Проверка canAutoExecute() (вне транзакции, только чтение)
            const canExecute = await this.canAutoExecute(tradingRequest);
            if (!canExecute.canAutoExecute) {
                throw new Error(canExecute.reason);
            }
            
            // 2. Подтверждение заявки (в транзакции)
            await tradingRequest.approve(null, { transaction });
            tradingRequest.autoExecuted = true;
            tradingRequest.autoExecutionPhase = this.stats.currentPhase;
            await tradingRequest.save({ transaction });
            
            // 3. Симуляция исполнения (вне транзакции, может быть долго)
            const order = {
                figi: tradingRequest.figi,
                action: tradingRequest.action,
                quantity: tradingRequest.quantity,
                price: tradingRequest.priceAtRequest
            };
            
            const executionResult = await RealisticExecutionSimulator.simulateExecution(order);
            
            // 4. Преобразование в формат для TradingEngine
            const signal = {
                symbol: tradingRequest.figi,
                figi: tradingRequest.figi,
                ticker: tradingRequest.ticker,
                action: tradingRequest.action,
                quantity: executionResult.executedQuantity,
                price: executionResult.executedPrice,
                confidence: tradingRequest.confidence,
                score: tradingRequest.score
            };
            
            // 5. Исполнение через TradingEngine (в транзакции)
            // TradingEngine.executePaperOrder не поддерживает транзакции напрямую,
            // но мы можем обновить заявку после исполнения
            const tradeResult = await TradingEngine.executePaperOrder(signal, executionResult);
            
            // 6. Обновление заявки (в транзакции)
            const executionResultForRequest = {
                executedPrice: executionResult.executedPrice,
                executedQuantity: executionResult.executedQuantity,
                commission: executionResult.commission,
                slippage: executionResult.slippage,
                spread: executionResult.spread,
                liquidityLevel: executionResult.liquidityLevel,
                originalPrice: executionResult.originalPrice
            };
            
            await tradingRequest.execute(executionResultForRequest, { transaction });
            
            // 7. Обновление статистики (в транзакции)
            await this.updateStats(tradeResult, { transaction });
            
            await transaction.commit();
            
            // 8. Запись в FeedbackService и RL обучение (вне транзакции, асинхронно)
            setImmediate(async () => {
                try {
                    // Расчет PnL для FeedbackService
                    let calculatedPnL = 0;
                    if (tradingRequest.action === 'SELL') {
                        // Найти соответствующую BUY заявку
                        const buyRequest = await TradingRequest.findOne({
                            where: {
                                figi: tradingRequest.figi,
                                action: 'BUY',
                                status: 'EXECUTED',
                                executedAt: { [Op.lt]: tradingRequest.executedAt }
                            },
                            order: [['executedAt', 'DESC']]
                        });
                        
                        if (buyRequest && buyRequest.actualPrice) {
                            const buyPrice = buyRequest.actualPrice;
                            const sellPrice = executionResult.executedPrice;
                            calculatedPnL = ((sellPrice - buyPrice) / buyPrice) * 100; // В процентах
                        }
                    }
                    
                    // Запись в FeedbackService
                    const FeedbackService = (await import('./FeedbackService.js')).default;
                    if (FeedbackService && FeedbackService.isInitialized) {
                        await FeedbackService.recordTradeResult(
                            tradingRequest.recommendationId,
                            executionResult.executedPrice,
                            calculatedPnL,
                            {
                                tradingRequestId: tradingRequest.id,
                                figi: tradingRequest.figi,
                                autoExecuted: true
                            }
                        );
                    }
                    
                    // Инкрементальное обучение RL (если нужно)
                    await this.scheduleRLTraining(tradingRequest.figi, tradeResult);
                } catch (error) {
                    LoggerService.warn('Failed to record trade result or train RL', {
                        requestId: tradingRequest.id,
                        error: error.message
                    });
                }
            });
            
            LoggerService.info('Auto-executed trading request', {
                requestId: tradingRequest.id,
                figi: tradingRequest.figi,
                action: tradingRequest.action,
                executedPrice: executionResult.executedPrice,
                executedQuantity: executionResult.executedQuantity
            });
            
            return {
                success: true,
                tradingRequest,
                executionResult,
                tradeResult
            };
        } catch (error) {
            await transaction.rollback();
            
            // Обработка ошибки
            if (tradingRequest.status === 'APPROVED') {
                tradingRequest.autoExecutionFailed = true;
                tradingRequest.executionError = error.message;
                await tradingRequest.save();
            }
            
            LoggerService.error('Failed to auto-execute request', {
                requestId: tradingRequest.id,
                error: error.message
            });
            
            throw error;
        }
    }

    /**
     * Обработка новой заявки (вызывается из TradingRequestService)
     * @param {Object} tradingRequest - Новая заявка
     */
    async processNewRequest(tradingRequest) {
        if (!this.isEnabled || !this.isInitialized) {
            return;
        }
        
        // Проверка блокировки
        if (this.processingLock) {
            LoggerService.warn('Another request is being processed, skipping', {
                requestId: tradingRequest.id
            });
            return;
        }
        
        this.processingLock = true;
        try {
            const canExecute = await this.canAutoExecute(tradingRequest);
            if (canExecute.canAutoExecute) {
                await this.autoExecuteRequest(tradingRequest);
            } else {
                LoggerService.debug('Cannot auto-execute request', {
                    requestId: tradingRequest.id,
                    reason: canExecute.reason
                });
            }
        } catch (error) {
            LoggerService.error('Error processing new request', {
                requestId: tradingRequest.id,
                error: error.message
            });
        } finally {
            this.processingLock = false;
        }
    }

    /**
     * Обновление статистики после сделки
     */
    async updateStats(tradeResult, options = {}) {
        try {
            this.stats.dailyTrades += 1;
            this.stats.totalTrades += 1;
            this.stats.lastTradeTime = new Date();
            
            // Обновление PnL (только для SELL сделок)
            if (tradeResult.trade && tradeResult.trade.pnl !== undefined) {
                this.stats.dailyPnL += tradeResult.trade.pnl;
            }
            
            // Сохранение в БД
            if (options.transaction) {
                // Сохраняем после commit транзакции
                setImmediate(() => this.saveDailyStats());
            } else {
                await this.saveDailyStats();
            }
        } catch (error) {
            LoggerService.warn('Failed to update stats', {
                error: error.message
            });
        }
    }

    /**
     * Сброс дневной статистики (вызывается планировщиком)
     */
    async resetDailyStats() {
        try {
            this.stats.dailyTrades = 0;
            this.stats.dailyPnL = 0;
            this.stats.lastTradeTime = null;
            
            await this.saveDailyStats();
            
            LoggerService.info('Daily stats reset', {
                totalTrades: this.stats.totalTrades
            });
        } catch (error) {
            LoggerService.error('Failed to reset daily stats', {
                error: error.message
            });
        }
    }

    /**
     * Переход на следующую фазу
     */
    async advancePhase() {
        const phases = ['phase1', 'phase2', 'phase3'];
        const currentIndex = phases.indexOf(this.stats.currentPhase);
        
        if (currentIndex < phases.length - 1) {
            this.stats.currentPhase = phases[currentIndex + 1];
            await this.saveDailyStats();
            
            LoggerService.info('Advanced to next phase', {
                newPhase: this.stats.currentPhase
            });
        }
    }

    /**
     * Проверка условий перехода на следующую фазу
     */
    async checkPhaseAdvancement() {
        // Реализация критериев из config/autoPaperTrading.js
        // Пока упрощенная версия
        const stats = await AutoPaperTradingStats.getTodayStats();
        
        // Проверка критериев перехода
        // В реальной реализации здесь была бы проверка:
        // - Минимум дней в фазе
        // - Минимум сделок
        // - Win rate >= 55%
        // - Просадка < 10%
        
        // Пока оставляем пустым для будущей реализации
    }

    /**
     * Включение автоматической торговли
     */
    async enable() {
        this.isEnabled = true;
        
        // СИНХРОНИЗАЦИЯ: Убеждаемся, что виртуальный портфель загружен и синхронизирован
        try {
            await TradingEngine.loadVirtualPortfolio();
            LoggerService.info('Virtual portfolio loaded for auto-paper trading', {
                positionsCount: Object.keys(TradingEngine.virtualPortfolio?.positions || {}).length,
                cash: TradingEngine.virtualPortfolio?.cash || 0
            });
        } catch (error) {
            LoggerService.warn('Failed to load virtual portfolio during enable', {
                error: error.message
            });
        }
        
        // Обработать только свежие заявки (созданные в последние 4 часа)
        const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
        const pendingRequests = await TradingRequest.findAll({
            where: {
                status: 'PENDING',
                tradingMode: 'paper',
                createdAt: { [Op.gte]: fourHoursAgo }
            },
            order: [['createdAt', 'ASC']],
            limit: 50 // Ограничение на количество обработки
        });
        
        // Обработать заявки последовательно
        for (const request of pendingRequests) {
            try {
                await this.processNewRequest(request);
            } catch (error) {
                LoggerService.warn('Failed to process old request', {
                    requestId: request.id,
                    error: error.message
                });
            }
        }
        
        LoggerService.info('Auto-paper trading enabled', {
            pendingRequestsProcessed: pendingRequests.length,
            positionsInPortfolio: Object.keys(TradingEngine.virtualPortfolio?.positions || {}).length
        });
    }

    /**
     * Выключение автоматической торговли
     */
    async disable() {
        this.isEnabled = false;
        LoggerService.info('Auto-paper trading disabled');
    }

    /**
     * Планирование RL обучения
     */
    async scheduleRLTraining(figi, tradeResult) {
        try {
            const ReinforcementLearningService = (await import('./ReinforcementLearningService.js')).default;
            if (!ReinforcementLearningService || !ReinforcementLearningService.isInitialized) {
                return;
            }
            
            const lastTraining = this.rlTrainingCache.get(figi) || 0;
            const now = Date.now();
            const fiveMinutes = 5 * 60 * 1000;
            
            if (now - lastTraining < fiveMinutes) {
                // Сохранить для батч-обучения позже
                // Пока просто пропускаем
                return;
            }
            
            // Проверка наличия модели для инструмента
            // В реальной реализации здесь была бы проверка hasModelForFigi()
            // Пока упрощенная версия
            
            // Обучить немедленно
            // await ReinforcementLearningService.incrementalTrainFromTrades(figi, [tradeResult]);
            this.rlTrainingCache.set(figi, now);
        } catch (error) {
            LoggerService.warn('RL training scheduling failed', {
                figi,
                error: error.message
            });
        }
    }

    /**
     * Получение статуса сервиса
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            isEnabled: this.isEnabled,
            currentPhase: this.stats.currentPhase,
            stats: {
                dailyTrades: this.stats.dailyTrades,
                dailyPnL: this.stats.dailyPnL,
                totalTrades: this.stats.totalTrades,
                lastTradeTime: this.stats.lastTradeTime
            },
            settings: this.getCurrentSettings()
        };
    }

    /**
     * Валидация настроек
     */
    validateSettings(newSettings) {
        const errors = [];
        
        // Проверка диапазонов
        if (newSettings.minConfidence !== undefined) {
            if (newSettings.minConfidence < 0.5 || newSettings.minConfidence > 0.95) {
                errors.push('minConfidence must be between 0.5 and 0.95');
            }
        }
        
        if (newSettings.maxDailyTrades !== undefined) {
            if (newSettings.maxDailyTrades < 1 || newSettings.maxDailyTrades > 50) {
                errors.push('maxDailyTrades must be between 1 and 50');
            }
        }
        
        if (newSettings.maxPositionSize !== undefined) {
            if (newSettings.maxPositionSize < 0.01 || newSettings.maxPositionSize > 0.1) {
                errors.push('maxPositionSize must be between 0.01 and 0.1');
            }
        }
        
        // Проверка логики
        if (newSettings.minScore !== undefined && newSettings.maxScore !== undefined) {
            if (newSettings.minScore >= newSettings.maxScore) {
                errors.push('minScore must be less than maxScore');
            }
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Обновление настроек
     */
    async updateSettings(newSettings) {
        const validation = this.validateSettings(newSettings);
        if (!validation.isValid) {
            throw new Error(`Invalid settings: ${validation.errors.join(', ')}`);
        }
        
        // Обновляем настройки
        Object.assign(this.settings, newSettings);
        
        // Сохраняем в БД (если нужно)
        await this.saveDailyStats();
    }
}

// Создаем единственный экземпляр
const autoPaperTradingService = new AutoPaperTradingService();

export default autoPaperTradingService;

