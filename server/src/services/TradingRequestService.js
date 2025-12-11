import TradingRequest from '../models/TradingRequest.js';
import Recommendation from '../models/Recommendation.js';
import TradingEngine from './TradingEngine.js'; // Нужен для обновления виртуального портфеля в paper mode
import TradingModeManager from './TradingModeManager.js';
import ServiceManager from './ServiceManager.js';
import OptimizedTelegramService from './OptimizedTelegramService.js';
import TinkoffApiService from './TinkoffApiService.js';
import SettingsService from './SettingsService.js';
import StrategyAllocationService from './StrategyAllocationService.js';
import RiskManagementService from './RiskManagementService.js';
import CacheService from './CacheService.js';
import PortfolioAllocation from '../models/PortfolioAllocation.js';
import PositionStrategy from '../models/PositionStrategy.js';
import TradingStrategy from '../models/TradingStrategy.js';
import { Op } from 'sequelize';

/**
 * Сервис для управления торговыми заявками
 */
class TradingRequestService {
    constructor() {
        this.isInitialized = false;
        this.autoExecutionEnabled = false; // Отключено - пользователь выполняет вручную
        this.cleanupInterval = null;
    }

    async initialize() {
        try {
            console.log('🎯 Initializing Trading Request Service...');
            
            // Загружаем настройки
            this.autoExecutionEnabled = await SettingsService.getSetting('auto_execution_enabled', false);
            
            // Запускаем очистку истекших заявок каждые 5 минут
            this.cleanupInterval = setInterval(() => {
                this.cleanupExpiredRequests();
            }, 5 * 60 * 1000);
            
            this.isInitialized = true;
            console.log('✅ Trading Request Service initialized');
        } catch (error) {
            console.error('❌ Failed to initialize Trading Request Service:', error);
            throw error;
        }
    }

    /**
     * Создание торговой заявки из рекомендации
     */
    async createTradingRequest(recommendationFigi, options = {}) {
        try {
            // Получаем рекомендацию
            const recommendation = await Recommendation.findByPk(recommendationFigi);
            if (!recommendation) {
                throw new Error(`Recommendation not found: ${recommendationFigi}`);
            }

            // Разрешаем создание заявок для HOLD рекомендаций (с предупреждением на фронтенде)
            // Пользователь может действовать вопреки рекомендации AI

            // Получаем текущий режим торговли
            const currentMode = TradingModeManager.getCurrentMode().mode;
            
            // Валидация для режима торговли
            await this.validateTradingMode(currentMode, recommendation);

            // Получаем текущую цену
            let currentPrice = await this.getCurrentPrice(recommendation.figi);
            
            // Если цена не получена, используем цену из рекомендации
            if (!currentPrice || currentPrice === 0 || isNaN(currentPrice) || currentPrice === null) {
                currentPrice = recommendation.priceAtAnalysis || recommendation.price || null;
                if (currentPrice) {
                    console.warn(`⚠️ Using recommendation price for ${recommendation.figi}: ${currentPrice}`);
                }
            }
            
            // Валидация цены
            if (!currentPrice || currentPrice <= 0 || isNaN(currentPrice) || currentPrice === null) {
                throw new Error(`Invalid price for ${recommendation.figi}: ${currentPrice}. Cannot create trading request. Please provide a valid price.`);
            }
            
            // Определяем стратегию для рекомендации
            let strategy = null;
            let positionSize = null;
            let strategyValidation = null;
            
            // Если стратегия указана явно в options, используем её
            if (options.strategyId) {
                try {
                    const TradingStrategy = (await import('../models/TradingStrategy.js')).default;
                    strategy = await TradingStrategy.findByPk(options.strategyId);
                    if (strategy) {
                        // Проверяем соответствие стратегии и рекомендации
                        strategyValidation = await StrategyAllocationService.validateStrategyRecommendationMatch(
                            strategy.id,
                            recommendation
                        );
                        
                        if (!strategyValidation.isValid && !options.ignoreStrategyValidation) {
                            const warnings = [];
                            if (!strategyValidation.meetsMinConfidence) {
                                warnings.push(`Уверенность (${recommendation.confidence.toFixed(2)}) ниже минимальной для стратегии (${strategy.minConfidence})`);
                            }
                            if (!strategyValidation.meetsMinScore) {
                                warnings.push(`Оценка (${recommendation.score.toFixed(2)}) ниже минимальной для стратегии (${strategy.minScore})`);
                            }
                            if (!strategyValidation.typeMatch) {
                                warnings.push('Тип стратегии не соответствует типу рекомендации');
                            }
                            if (!strategyValidation.timeframeMatch) {
                                warnings.push('Временной горизонт стратегии не соответствует рекомендации');
                            }
                            
                            // Сохраняем предупреждение для возврата клиенту вместо ошибки
                            strategyValidation.warnings = warnings;
                            strategyValidation.warningMessage = `Стратегия "${strategy.name}" не соответствует рекомендации: ${warnings.join('; ')}. ${strategyValidation.warning || ''}`;
                            // Не выбрасываем ошибку, а продолжаем выполнение с предупреждением
                        }
                        
                        // Рассчитываем размер позиции с учетом стратегии
                        const portfolioSettings = await SettingsService.getPortfolioSettings();
                        const totalBudget = portfolioSettings.user_max_portfolio_budget || 1000000;
                        positionSize = await StrategyAllocationService.calculatePositionSize(
                            strategy.id,
                            recommendation,
                            totalBudget
                        );
                    }
                } catch (strategyError) {
                    if (strategyError.message.includes('не соответствует рекомендации')) {
                        throw strategyError; // Пробрасываем ошибки валидации
                    }
                    console.warn('⚠️ Could not use specified strategy:', strategyError.message);
                }
            }
            
            // Если стратегия не указана явно, определяем автоматически
            if (!strategy) {
                try {
                    strategy = await StrategyAllocationService.getStrategyForRecommendation(recommendation);
                    if (strategy) {
                        // Рассчитываем размер позиции с учетом стратегии
                        const portfolioSettings = await SettingsService.getPortfolioSettings();
                        const totalBudget = portfolioSettings.user_max_portfolio_budget || 1000000;
                        positionSize = await StrategyAllocationService.calculatePositionSize(
                            strategy.id,
                            recommendation,
                            totalBudget
                        );
                    }
                } catch (strategyError) {
                    console.warn('⚠️ Could not determine strategy for recommendation:', strategyError.message);
                }
            }

            // Используем указанное количество или рассчитываем автоматически
            let quantity;
            if (options.quantity && options.quantity > 0 && !isNaN(options.quantity)) {
                quantity = Math.floor(Math.abs(options.quantity)); // Округляем вниз до целого числа
            } else if (positionSize && positionSize.amount > 0) {
                // Используем размер позиции из стратегии
                quantity = Math.floor(positionSize.amount / currentPrice);
            } else {
                // Рассчитываем количество акций с учетом режима
                quantity = await this.calculateQuantity(
                    recommendation.figi, 
                    currentPrice, 
                    recommendation.confidence,
                    options.maxAmount,
                    currentMode
                );
            }
            
            // Валидация количества
            if (!quantity || quantity <= 0 || isNaN(quantity) || !isFinite(quantity)) {
                throw new Error(`Invalid quantity calculated: ${quantity}. Price: ${currentPrice}, Confidence: ${recommendation.confidence}`);
            }
            
            quantity = Math.floor(Math.abs(quantity)); // Убеждаемся, что это целое положительное число

            const estimatedAmount = currentPrice * quantity;
            
            // Проверяем доступный бюджет стратегии, если стратегия определена
            if (strategy && positionSize) {
                const availableBudget = await StrategyAllocationService.getAvailableBudget(strategy.id);
                if (estimatedAmount > availableBudget) {
                    console.warn(`⚠️ Requested amount (${estimatedAmount}) exceeds available budget (${availableBudget}) for strategy ${strategy.name}`);
                    // Не блокируем создание заявки, но предупреждаем
                }
            }
            
            // Валидация суммы
            if (!estimatedAmount || estimatedAmount <= 0 || isNaN(estimatedAmount) || !isFinite(estimatedAmount)) {
                throw new Error(`Invalid estimated amount: ${estimatedAmount}. Price: ${currentPrice}, Quantity: ${quantity}`);
            }

            // Рассчитываем стоп-лосс: используем динамический ATR-based стоп-лосс, если доступен
            let stopLoss = options.stopLoss || recommendation.stopLoss;
            if (!stopLoss && strategy && currentPrice) {
                try {
                    const riskManagementService = (await import('./RiskManagementService.js')).default;
                    if (riskManagementService && riskManagementService.isInitialized) {
                        // Используем динамический стоп-лосс на основе ATR
                        stopLoss = await riskManagementService.calculateDynamicStopLoss(
                            recommendation.figi,
                            currentPrice,
                            strategy,
                            recommendation.recommendation === 'SELL' ? 'SELL' : 'BUY'
                        );
                    } else {
                        // Fallback к фиксированному проценту
                        stopLoss = currentPrice * (1 - strategy.stopLossPercent / 100);
                    }
                } catch (error) {
                    console.warn(`⚠️ Ошибка расчета динамического стоп-лосса, используем фиксированный процент: ${error.message}`);
                    stopLoss = currentPrice * (1 - strategy.stopLossPercent / 100);
                }
            } else if (!stopLoss && currentPrice) {
                // Если стратегии нет, используем фиксированный процент по умолчанию
                stopLoss = currentPrice * 0.95; // -5% по умолчанию
            }
            
            const takeProfit = options.takeProfit || recommendation.takeProfit || (strategy ? currentPrice * (1 + strategy.takeProfitPercent / 100) : null);
            
            // Определяем action: для HOLD рекомендаций создаем BUY заявку (пользователь хочет купить, несмотря на HOLD)
            const action = recommendation.recommendation === 'HOLD' ? 'BUY' : recommendation.recommendation;
            
            // Создаем заявку
            const tradingRequest = await TradingRequest.create({
                recommendationId: recommendation.figi,
                figi: recommendation.figi,
                ticker: recommendation.ticker,
                name: recommendation.name,
                action: action,
                quantity,
                priceAtRequest: currentPrice,
                estimatedAmount,
                confidence: recommendation.confidence,
                score: recommendation.score,
                reasoning: this.generateReasoning(recommendation),
                aiExplanation: recommendation.explanation,
                tradingMode: currentMode,
                strategyId: strategy ? strategy.id : null,
                stopLoss,
                takeProfit,
                maxLoss: options.maxLoss,
                userComment: options.comment
            });
            
            // Создаем запись PositionStrategy, если стратегия определена
            if (strategy) {
                try {
                    await PositionStrategy.create({
                        positionId: tradingRequest.id,
                        strategyId: strategy.id,
                        entryReason: {
                            confidence: recommendation.confidence,
                            score: recommendation.score,
                            signalsMatch: false, // TODO: проверка соответствия сигналам
                            aiRecommendation: recommendation.recommendation
                        },
                        targetTimeframe: strategy.timeframe === 'short' ? 7 : strategy.timeframe === 'medium' ? 30 : 90,
                        entryDate: new Date(),
                        expectedExitDate: strategy.timeframe === 'short' 
                            ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                            : strategy.timeframe === 'medium'
                            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                            : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
                    });
                    
                    // Используем бюджет стратегии
                    await PortfolioAllocation.useBudget(strategy.id, estimatedAmount);
                    console.log(`💰 Used ${estimatedAmount} RUB from strategy ${strategy.name} budget`);
                } catch (positionError) {
                    console.warn('⚠️ Could not create PositionStrategy or use budget:', positionError.message);
                    // Не блокируем создание заявки, если не удалось создать PositionStrategy
                }
            }

            // Создаем трейлинг-стоп для BUY позиций - неблокирующе
            if (action === 'BUY' && tradingRequest.status === 'pending') {
                // Выполняем в фоне, чтобы не блокировать создание заявки
                (async () => {
                    try {
                        const instrument = await CacheService.getInstrument(recommendation.figi, true);
                        
                        if (instrument) {
                            await RiskManagementService.createTrailingStop({
                                figi: recommendation.figi,
                                ticker: recommendation.ticker,
                                entryPrice: currentPrice,
                                quantity: quantity,
                                direction: 'BUY',
                                activationProfitPercent: 5.0, // Активация при +5%
                                trailingDistancePercent: 2.5, // Отступ 2.5% по умолчанию
                                useATR: strategy && strategy.atrMultiplier ? true : false, // Используем ATR, если есть стратегия с ATR
                                portfolioType: currentMode === 'real' ? 'real' : 'virtual',
                                tradingRequestId: tradingRequest.id,
                                strategyId: strategy ? strategy.id : null
                            });
                        }
                    } catch (trailingStopError) {
                        // Игнорируем ошибки создания трейлинг-стопа
                    }
                })();
            }

            // Уведомляем через WebSocket (если доступен)
            try {
                const WebSocketService = ServiceManager.getService('WebSocketService');
                if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                    WebSocketService.broadcast({
                        type: 'TRADING_REQUEST_CREATED',
                        data: tradingRequest
                    });
                }
            } catch (wsError) {
                console.warn('⚠️ Could not broadcast WebSocket message:', wsError.message);
            }

            // Отправляем заявку в Telegram для подтверждения (для всех заявок) - неблокирующе
            // Выполняем в фоне, чтобы не блокировать создание заявки
            (async () => {
                try {
                    // Получаем agreement из IntegratedAIService, если доступно (с таймаутом)
                    let agreement = null;
                    try {
                        const IntegratedAIService = (await import('./IntegratedAIService.js')).default;
                        if (IntegratedAIService.isInitialized) {
                            // Используем Promise.race для таймаута в 2 секунды
                            const agreementPromise = IntegratedAIService.getIntegratedRecommendation(recommendation.figi);
                            const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 2000));
                            const integratedRec = await Promise.race([agreementPromise, timeoutPromise]);
                            if (integratedRec && integratedRec.agreement !== undefined) {
                                agreement = integratedRec.agreement;
                            }
                        }
                    } catch (error) {
                        // Игнорируем ошибки получения agreement
                    }

                    // Отправляем заявку в Telegram с кнопками подтверждения
                    await OptimizedTelegramService.sendTradingRequestForApproval(tradingRequest.id, {
                        ticker: recommendation.ticker,
                        name: recommendation.name,
                        action: action,
                        quantity: quantity,
                        priceAtRequest: currentPrice,
                        estimatedAmount: estimatedAmount,
                        confidence: recommendation.confidence,
                        score: recommendation.score,
                        agreement: agreement,
                        stopLoss: stopLoss,
                        takeProfit: takeProfit,
                        strategyName: strategy ? strategy.name : null
                    });
                } catch (telegramError) {
                    // Игнорируем ошибки отправки в Telegram, не блокируем создание заявки
                }
            })();

            console.log(`📝 Trading request created: ${tradingRequest.id} (${tradingRequest.action} ${tradingRequest.ticker})`);
            
            // Возвращаем заявку с предупреждением о стратегии, если есть
            const result = tradingRequest.toJSON ? tradingRequest.toJSON() : tradingRequest;
            if (strategyValidation && !strategyValidation.isValid) {
                result.strategyWarning = {
                    message: strategyValidation.warningMessage,
                    warnings: strategyValidation.warnings,
                    isValid: false
                };
            }
            
            return result;

        } catch (error) {
            console.error('❌ Error creating trading request:', error);
            throw error;
        }
    }

    /**
     * Проверка, нужно ли отправить заявку в Telegram для подтверждения
     * @param {Object} recommendation - Рекомендация
     * @param {Object} tradingRequest - Торговая заявка
     * @returns {Promise<boolean>}
     */
    async shouldSendForTelegramApproval(recommendation, tradingRequest) {
        try {
            // Получаем настройки автоматического создания заявок
            const settings = await SettingsService.getSettings();
            const autoTradeEnabled = settings.auto_trade_enabled !== false; // По умолчанию включено
            const minConfidence = settings.auto_trade_min_confidence || 0.85;
            const minScore = settings.auto_trade_min_score || 0.8;
            const minAgreement = settings.auto_trade_min_agreement || 0.9;

            if (!autoTradeEnabled) {
                return false;
            }

            // Проверяем условия для автоматического создания заявки
            const meetsConfidence = recommendation.confidence >= minConfidence;
            const meetsScore = recommendation.score >= minScore;

            // Получаем agreement из IntegratedAIService
            let agreement = null;
            try {
                const IntegratedAIService = (await import('./IntegratedAIService.js')).default;
                if (IntegratedAIService.isInitialized) {
                    const integratedRec = await IntegratedAIService.getIntegratedRecommendation(recommendation.figi);
                    agreement = integratedRec.agreement || null;
                }
            } catch (error) {
                console.warn('⚠️ Could not get agreement for auto-trade check:', error.message);
            }

            const meetsAgreement = agreement === null || agreement >= minAgreement;

            // Проверяем, что все условия выполнены
            if (meetsConfidence && meetsScore && meetsAgreement) {
                // Проверяем, что заявка прошла все проверки RiskManagement
                try {
                    const RiskManagementService = (await import('./RiskManagementService.js')).default;
                    const validation = await RiskManagementService.validateOrder({
                        symbol: recommendation.figi,
                        action: tradingRequest.action,
                        quantity: tradingRequest.quantity,
                        price: tradingRequest.priceAtRequest,
                        confidence: recommendation.confidence
                    }, null, { [recommendation.figi]: tradingRequest.priceAtRequest });

                    if (validation.isValid) {
                        console.log(`✅ Auto-trade conditions met for ${recommendation.ticker}: confidence=${recommendation.confidence.toFixed(2)}, score=${recommendation.score.toFixed(2)}, agreement=${agreement !== null ? agreement.toFixed(2) : 'N/A'}`);
                        return true;
                    }
                } catch (error) {
                    console.warn('⚠️ Could not validate order for auto-trade:', error.message);
                }
            }

            return false;
        } catch (error) {
            console.error('❌ Error checking auto-trade conditions:', error);
            return false;
        }
    }

    /**
     * Создание торговой заявки из данных рекомендации (без сохранения в БД)
     */
    async createTradingRequestFromData(recommendationData, options = {}) {
        try {
            if (!recommendationData.figi) {
                throw new Error('FIGI is required in recommendationData');
            }

            // Разрешаем создание заявок для HOLD рекомендаций (с предупреждением на фронтенде)
            // Пользователь может действовать вопреки рекомендации AI

            // Получаем текущий режим торговли
            const currentMode = TradingModeManager.getCurrentMode().mode;
            
            // Валидация для режима торговли (для SELL операций валидация пропускается)
            await this.validateTradingMode(currentMode, recommendationData);
            
            // Получаем текущую цену
            let currentPrice = await this.getCurrentPrice(recommendationData.figi);
            
            // Если цена не получена, используем цену из данных рекомендации
            if (!currentPrice || currentPrice === 0 || isNaN(currentPrice) || currentPrice === null) {
                currentPrice = recommendationData.priceAtAnalysis || recommendationData.price || null;
                if (currentPrice) {
                    console.warn(`⚠️ Using recommendation data price for ${recommendationData.figi}: ${currentPrice}`);
                }
            }
            
            // Валидация цены
            if (!currentPrice || currentPrice <= 0 || isNaN(currentPrice) || currentPrice === null) {
                throw new Error(`Invalid price for ${recommendationData.figi}: ${currentPrice}. Cannot create trading request. Please provide a valid price.`);
            }
            
            // Используем указанное количество или рассчитываем автоматически
            let quantity;
            if (options.quantity && options.quantity > 0 && !isNaN(options.quantity)) {
                quantity = Math.floor(Math.abs(options.quantity));
            } else {
                // Рассчитываем количество акций с учетом режима
                quantity = await this.calculateQuantity(
                    recommendationData.figi, 
                    currentPrice, 
                    recommendationData.confidence || 0.5,
                    options.maxAmount,
                    currentMode
                );
            }
            
            // Валидация количества
            if (!quantity || quantity <= 0 || isNaN(quantity) || !isFinite(quantity)) {
                throw new Error(`Invalid quantity calculated: ${quantity}. Price: ${currentPrice}, Confidence: ${recommendationData.confidence || 0.5}`);
            }
            
            quantity = Math.floor(Math.abs(quantity)); // Убеждаемся, что это целое положительное число

            const estimatedAmount = currentPrice * quantity;
            
            // Валидация суммы
            if (!estimatedAmount || estimatedAmount <= 0 || isNaN(estimatedAmount) || !isFinite(estimatedAmount)) {
                throw new Error(`Invalid estimated amount: ${estimatedAmount}. Price: ${currentPrice}, Quantity: ${quantity}`);
            }

            // Определяем стратегию, если указана явно
            let strategy = null;
            let strategyValidation = null;
            
            if (options.strategyId) {
                try {
                    const TradingStrategy = (await import('../models/TradingStrategy.js')).default;
                    strategy = await TradingStrategy.findByPk(options.strategyId);
                    if (strategy) {
                        // Проверяем соответствие стратегии и рекомендации
                        strategyValidation = await StrategyAllocationService.validateStrategyRecommendationMatch(
                            strategy.id,
                            recommendationData
                        );
                        
                        if (!strategyValidation.isValid && !options.ignoreStrategyValidation) {
                            const warnings = [];
                            if (!strategyValidation.meetsMinConfidence) {
                                warnings.push(`Уверенность (${(recommendationData.confidence || 0).toFixed(2)}) ниже минимальной для стратегии (${strategy.minConfidence})`);
                            }
                            if (!strategyValidation.meetsMinScore) {
                                warnings.push(`Оценка (${(recommendationData.score || 0).toFixed(2)}) ниже минимальной для стратегии (${strategy.minScore})`);
                            }
                            if (!strategyValidation.typeMatch) {
                                warnings.push('Тип стратегии не соответствует типу рекомендации');
                            }
                            if (!strategyValidation.timeframeMatch) {
                                warnings.push('Временной горизонт стратегии не соответствует рекомендации');
                            }
                            
                            // Сохраняем предупреждение для возврата клиенту вместо ошибки
                            strategyValidation.warnings = warnings;
                            strategyValidation.warningMessage = `Стратегия "${strategy.name}" не соответствует рекомендации: ${warnings.join('; ')}. ${strategyValidation.warning || ''}`;
                            // Не выбрасываем ошибку, а продолжаем выполнение с предупреждением
                        }
                    }
                } catch (strategyError) {
                    if (strategyError.message.includes('не соответствует рекомендации')) {
                        throw strategyError; // Пробрасываем ошибки валидации
                    }
                    console.warn('⚠️ Could not use specified strategy:', strategyError.message);
                }
            }
            
            // Определяем action: для HOLD рекомендаций создаем BUY заявку (пользователь хочет купить, несмотря на HOLD)
            const action = recommendationData.recommendation === 'HOLD' ? 'BUY' : recommendationData.recommendation;
            
            // Формируем reasoning с информацией о валидации стратегии
            let reasoning = this.generateReasoning(recommendationData);
            if (strategyValidation && strategyValidation.warning) {
                reasoning += `\n\n⚠️ Предупреждение: ${strategyValidation.warning}`;
            }
            
            // Создаем заявку
            const tradingRequest = await TradingRequest.create({
                recommendationId: recommendationData.figi, // Используем FIGI как ID рекомендации
                figi: recommendationData.figi,
                ticker: recommendationData.ticker,
                name: recommendationData.name,
                action: action,
                quantity,
                priceAtRequest: currentPrice,
                estimatedAmount,
                confidence: recommendationData.confidence || 0.5,
                score: recommendationData.score || 0.5,
                reasoning: reasoning,
                aiExplanation: recommendationData.explanation || recommendationData.analysis,
                tradingMode: currentMode,
                strategyId: strategy ? strategy.id : null,
                stopLoss: options.stopLoss || recommendationData.stopLoss,
                takeProfit: options.takeProfit || recommendationData.targetPrice || recommendationData.takeProfit,
                maxLoss: options.maxLoss,
                userComment: options.comment
            });

            // Уведомляем через WebSocket (если доступен)
            try {
                const WebSocketService = ServiceManager.getService('WebSocketService');
                if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                    WebSocketService.broadcast({
                        type: 'TRADING_REQUEST_CREATED',
                        data: tradingRequest
                    });
                }
            } catch (wsError) {
                // Игнорируем ошибки WebSocket
            }

            // Отправляем заявку в Telegram для подтверждения - неблокирующе
            // Выполняем в фоне, чтобы не блокировать создание заявки
            (async () => {
                try {
                    // Получаем agreement из IntegratedAIService, если доступно (с таймаутом)
                    let agreement = null;
                    try {
                        const IntegratedAIService = (await import('./IntegratedAIService.js')).default;
                        if (IntegratedAIService.isInitialized) {
                            // Используем Promise.race для таймаута в 2 секунды
                            const agreementPromise = IntegratedAIService.getIntegratedRecommendation(recommendationData.figi);
                            const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 2000));
                            const integratedRec = await Promise.race([agreementPromise, timeoutPromise]);
                            if (integratedRec && integratedRec.agreement !== undefined) {
                                agreement = integratedRec.agreement;
                            }
                        }
                    } catch (error) {
                        // Игнорируем ошибки получения agreement
                    }

                    // Отправляем заявку в Telegram с кнопками подтверждения
                    await OptimizedTelegramService.sendTradingRequestForApproval(tradingRequest.id, {
                        ticker: recommendationData.ticker,
                        name: recommendationData.name,
                        action: action,
                        quantity: quantity,
                        priceAtRequest: currentPrice,
                        estimatedAmount: estimatedAmount,
                        confidence: recommendationData.confidence || 0.5,
                        score: recommendationData.score || 0.5,
                        agreement: agreement,
                        stopLoss: options.stopLoss || recommendationData.stopLoss,
                        takeProfit: options.takeProfit || recommendationData.targetPrice || recommendationData.takeProfit,
                        strategyName: strategy ? strategy.name : null
                    });
                } catch (telegramError) {
                    // Игнорируем ошибки отправки в Telegram, не блокируем создание заявки
                }
            })();
            
            // Возвращаем заявку с предупреждением о стратегии, если есть
            const result = tradingRequest.toJSON ? tradingRequest.toJSON() : tradingRequest;
            if (strategyValidation && !strategyValidation.isValid) {
                result.strategyWarning = {
                    message: strategyValidation.warningMessage,
                    warnings: strategyValidation.warnings,
                    isValid: false
                };
            }
            
            return result;

        } catch (error) {
            console.error('❌ Error creating trading request from data:', error);
            throw error;
        }
    }

    /**
     * Создание множественных заявок из рекомендаций
     */
    async createBulkTradingRequests(recommendationFigis, options = {}) {
        const results = [];
        const errors = [];

        for (const figi of recommendationFigis) {
            try {
                const request = await this.createTradingRequest(figi, options);
                results.push(request);
            } catch (error) {
                errors.push({ figi, error: error.message });
            }
        }

        return { requests: results, errors };
    }

    /**
     * Подтверждение заявки
     */
    async approveRequest(requestId, userComment = null) {
        try {
            const request = await TradingRequest.findByPk(requestId);
            if (!request) {
                throw new Error(`Trading request not found: ${requestId}`);
            }

            await request.approve(userComment);

            // Уведомляем через WebSocket (если доступен)
            try {
                const WebSocketService = ServiceManager.getService('WebSocketService');
                if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                    WebSocketService.broadcast({
                        type: 'TRADING_REQUEST_APPROVED',
                        data: request
                    });
                }
            } catch (wsError) {
                console.warn('⚠️ Could not broadcast WebSocket message:', wsError.message);
            }

            // Отправляем уведомление в Telegram (опционально)
            try {
                await this.sendTelegramNotification(request, 'APPROVED');
            } catch (telegramError) {
                console.warn('⚠️ Could not send Telegram notification:', telegramError.message);
            }

            console.log(`✅ Trading request approved: ${requestId} (User confirmed execution)`);

            // Для paper режима обновляем виртуальный портфель
            const currentMode = TradingModeManager.getCurrentMode().mode;
            if (currentMode === 'paper') {
                try {
                    await this.updateVirtualPortfolioForApprovedRequest(request);
                    console.log(`📊 Виртуальный портфель обновлен для заявки ${requestId}`);
                } catch (portfolioError) {
                    console.warn(`⚠️ Не удалось обновить виртуальный портфель: ${portfolioError.message}`);
                    // Не прерываем процесс одобрения, если обновление портфеля не удалось
                }
            }
            
            // Для real/micro режимов - пользователь сам выполняет сделку в брокерском приложении
            // Одобрение = пользователь подтвердил, что выполнил сделку согласно заявке

            return request;

        } catch (error) {
            console.error('❌ Error approving trading request:', error);
            throw error;
        }
    }

    /**
     * Отклонение заявки
     */
    async rejectRequest(requestId, reason) {
        try {
            const request = await TradingRequest.findByPk(requestId);
            if (!request) {
                throw new Error(`Trading request not found: ${requestId}`);
            }

            await request.reject(reason);

            // Уведомляем через WebSocket (если доступен)
            try {
                const WebSocketService = ServiceManager.getService('WebSocketService');
                if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                    WebSocketService.broadcast({
                        type: 'TRADING_REQUEST_REJECTED',
                        data: request
                    });
                }
            } catch (wsError) {
                console.warn('⚠️ Could not broadcast WebSocket message:', wsError.message);
            }

            // Отправляем уведомление в Telegram (опционально)
            try {
                await this.sendTelegramNotification(request, 'REJECTED');
            } catch (telegramError) {
                console.warn('⚠️ Could not send Telegram notification:', telegramError.message);
            }

            console.log(`❌ Trading request rejected: ${requestId} - ${reason}`);
            
            return request;

        } catch (error) {
            console.error('❌ Error rejecting trading request:', error);
            throw error;
        }
    }

    /**
     * Отметка заявки как выполненной (пользователь подтверждает выполнение)
     * Исполнение происходит вручную пользователем, мы только фиксируем факт
     */
    async markRequestAsExecuted(requestId, actualPrice = null, actualAmount = null) {
        try {
            const request = await TradingRequest.findByPk(requestId);
            if (!request) {
                throw new Error(`Trading request not found: ${requestId}`);
            }

            if (request.status !== 'APPROVED') {
                throw new Error(`Cannot mark as executed request with status: ${request.status}. Request must be approved first.`);
            }

            // Если цены не указаны, используем цену из заявки
            const finalPrice = actualPrice || request.priceAtRequest;
            const finalAmount = actualAmount || (finalPrice * request.quantity);

            // Обновляем статус заявки (пользователь подтвердил выполнение)
            await request.update({
                status: 'EXECUTED',
                executedAt: new Date(),
                actualPrice: finalPrice,
                actualAmount: finalAmount,
                executionResult: {
                    executed: true,
                    executedAt: new Date().toISOString(),
                    note: 'Executed manually by user'
                }
            });

            // Уведомляем через WebSocket (если доступен)
            try {
                const WebSocketService = ServiceManager.getService('WebSocketService');
                if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                    WebSocketService.broadcast({
                        type: 'TRADING_REQUEST_EXECUTED',
                        data: { request, executedAt: new Date().toISOString() }
                    });
                }
            } catch (wsError) {
                console.warn('⚠️ Could not broadcast WebSocket message:', wsError.message);
            }

            // Отправляем уведомление в Telegram (опционально)
            try {
                await this.sendTelegramNotification(request, 'EXECUTED');
            } catch (telegramError) {
                console.warn('⚠️ Could not send Telegram notification:', telegramError.message);
            }

            console.log(`✅ Trading request marked as executed: ${requestId} (User confirmed manual execution)`);
            
            return request;

        } catch (error) {
            console.error('❌ Error marking trading request as executed:', error);
            throw error;
        }
    }

    /**
     * Получение списка заявок
     */
    async getRequests(status = null, limit = 50, tradingMode = null) {
        try {
            const PositionStrategy = (await import('../models/PositionStrategy.js')).default;
            const TradingStrategy = (await import('../models/TradingStrategy.js')).default;
            
            let whereClause = {};
            
            if (status) {
                whereClause.status = status;
            }
            
            if (tradingMode) {
                whereClause.tradingMode = tradingMode;
            }
            
            let requests;
            if (Object.keys(whereClause).length > 0) {
                requests = await TradingRequest.findAll({
                    where: whereClause,
                    order: [['createdAt', 'DESC']],
                    limit
                });
            } else {
                requests = await TradingRequest.findAll({
                    order: [['createdAt', 'DESC']],
                    limit
                });
            }
            
            // Получаем стратегии для заявок
            const requestsWithStrategies = await Promise.all(requests.map(async (req) => {
                const reqData = req.toJSON();
                
                // Если есть strategyId, получаем стратегию напрямую
                if (reqData.strategyId) {
                    try {
                        const strategy = await TradingStrategy.findByPk(reqData.strategyId);
                        if (strategy) {
                            reqData.strategy = strategy.toJSON();
                        }
                    } catch (error) {
                        console.warn(`Could not load strategy for request ${reqData.id}:`, error.message);
                    }
                } else {
                    // Пытаемся найти через PositionStrategy
                    try {
                        const positionStrategy = await PositionStrategy.findOne({
                            where: { positionId: reqData.id }
                        });
                        if (positionStrategy && positionStrategy.strategyId) {
                            const strategy = await TradingStrategy.findByPk(positionStrategy.strategyId);
                            if (strategy) {
                                reqData.strategy = strategy.toJSON();
                            }
                        }
                    } catch (error) {
                        // Игнорируем ошибки при поиске стратегии
                    }
                }
                
                return reqData;
            }));
            
            return requestsWithStrategies;
        } catch (error) {
            console.error('❌ Error getting trading requests:', error);
            throw error;
        }
    }

    /**
     * Получение ожидающих заявок
     */
    async getPendingRequests(tradingMode = null) {
        try {
            let whereClause = { 
                status: 'PENDING',
                expiresAt: { [TradingRequest.sequelize.Op.gt]: new Date() }
            };
            
            if (tradingMode) {
                whereClause.tradingMode = tradingMode;
            }
            
            return await TradingRequest.findAll({
                where: whereClause,
                order: [['priority', 'DESC'], ['createdAt', 'ASC']],
                limit: 50
            });
        } catch (error) {
            console.error('❌ Error getting pending requests:', error);
            throw error;
        }
    }

    /**
     * Получение одобренных заявок
     */
    async getApprovedRequests(tradingMode = null) {
        try {
            let whereClause = { status: 'APPROVED' };
            
            if (tradingMode) {
                whereClause.tradingMode = tradingMode;
            }
            
            return await TradingRequest.findAll({
                where: whereClause,
                order: [['approvedAt', 'ASC']],
                limit: 50
            });
        } catch (error) {
            console.error('❌ Error getting approved requests:', error);
            throw error;
        }
    }

    /**
     * Массовое одобрение заявок
     */
    async bulkApprove(requestIds, userComment = null) {
        const results = [];
        const errors = [];

        for (const requestId of requestIds) {
            try {
                const request = await this.approveRequest(requestId, userComment);
                results.push(request);
            } catch (error) {
                errors.push({ requestId, error: error.message });
            }
        }

        return { approved: results, errors };
    }

    /**
     * Массовое отклонение заявок
     */
    async bulkReject(requestIds, reason) {
        const results = [];
        const errors = [];

        for (const requestId of requestIds) {
            try {
                const request = await this.rejectRequest(requestId, reason);
                results.push(request);
            } catch (error) {
                errors.push({ requestId, error: error.message });
            }
        }

        return { rejected: results, errors };
    }

    /**
     * Очистка истекших заявок
     */
    async cleanupExpiredRequests() {
        try {
            // Проверяем, что таблица существует
            const tableExists = await TradingRequest.sequelize.getQueryInterface().showAllTables();
            if (!tableExists.includes('trading_requests')) {
                console.log('⚠️ Trading requests table does not exist yet, skipping cleanup');
                return;
            }

            const expiredRequests = await TradingRequest.getExpiredRequests();
            
            for (const request of expiredRequests) {
                request.status = 'EXPIRED';
                await request.save();
                
                console.log(`⏰ Trading request expired: ${request.id}`);
            }

            if (expiredRequests.length > 0) {
                try {
                    const WebSocketService = ServiceManager.getService('WebSocketService');
                    if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                        WebSocketService.broadcast({
                            type: 'TRADING_REQUESTS_EXPIRED',
                            data: { count: expiredRequests.length }
                        });
                    }
                } catch (wsError) {
                    console.warn('⚠️ Could not broadcast WebSocket message:', wsError.message);
                }
            }

        } catch (error) {
            console.error('❌ Error cleaning up expired requests:', error);
        }
    }

    /**
     * Очистка одобренных и отклоненных заявок
     */
    async cleanupCompletedRequests(options = {}) {
        try {
            const { 
                olderThanDays = null,  // Удалять только заявки старше N дней
                tradingMode = null      // Фильтр по режиму торговли
            } = options;

            let whereClause = {
                status: {
                    [Op.in]: ['APPROVED', 'REJECTED']
                }
            };

            // Фильтр по режиму торговли
            if (tradingMode) {
                whereClause.tradingMode = tradingMode;
            }

            // Фильтр по дате (если указан)
            if (olderThanDays && olderThanDays > 0) {
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
                whereClause.updatedAt = {
                    [TradingRequest.sequelize.Op.lt]: cutoffDate
                };
            }

            const deletedCount = await TradingRequest.destroy({
                where: whereClause
            });

            console.log(`🧹 Удалено ${deletedCount} завершенных торговых заявок (APPROVED/REJECTED)`);

            // Уведомляем через WebSocket (если доступен)
            try {
                const WebSocketService = ServiceManager.getService('WebSocketService');
                if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                    WebSocketService.broadcast({
                        type: 'TRADING_REQUESTS_CLEANED',
                        data: {
                            deletedCount,
                            filters: { olderThanDays, tradingMode }
                        }
                    });
                }
            } catch (wsError) {
                console.warn('⚠️ Could not broadcast WebSocket message:', wsError.message);
            }

            return {
                success: true,
                deletedCount,
                filters: { olderThanDays, tradingMode }
            };

        } catch (error) {
            console.error('❌ Error cleaning up completed requests:', error);
            throw error;
        }
    }

    /**
     * Получение статистики по завершенным заявкам (для информации перед очисткой)
     */
    async getCompletedRequestsStats(tradingMode = null) {
        try {
            let whereClause = {
                status: {
                    [Op.in]: ['APPROVED', 'REJECTED']
                }
            };

            if (tradingMode) {
                whereClause.tradingMode = tradingMode;
            }

            const [approvedCount, rejectedCount, totalCount] = await Promise.all([
                TradingRequest.count({
                    where: { ...whereClause, status: 'APPROVED' }
                }),
                TradingRequest.count({
                    where: { ...whereClause, status: 'REJECTED' }
                }),
                TradingRequest.count({
                    where: whereClause
                })
            ]);

            // Получаем самую старую и новую заявку
            const oldestRequest = await TradingRequest.findOne({
                where: whereClause,
                order: [['updatedAt', 'ASC']],
                attributes: ['updatedAt']
            });

            const newestRequest = await TradingRequest.findOne({
                where: whereClause,
                order: [['updatedAt', 'DESC']],
                attributes: ['updatedAt']
            });

            return {
                total: totalCount,
                approved: approvedCount,
                rejected: rejectedCount,
                oldestDate: oldestRequest?.updatedAt || null,
                newestDate: newestRequest?.updatedAt || null
            };

        } catch (error) {
            console.error('❌ Error getting completed requests stats:', error);
            throw error;
        }
    }

    /**
     * Обновление виртуального портфеля для одобренной заявки (paper mode)
     */
    async updateVirtualPortfolioForApprovedRequest(request) {
        try {
            // Проверяем, что TradingEngine инициализирован
            if (!TradingEngine.isInitialized) {
                await TradingEngine.initialize();
            }
            
            // Для paper mode активируем движок, если он не активен
            // (executePaperOrder требует isActive = true)
            if (!TradingEngine.isActive) {
                console.warn('⚠️ Trading Engine не активен, активируем для обновления портфеля');
                await TradingEngine.activate();
            }
            
            // Получаем текущую цену для расчета
            let executionPrice = request.priceAtRequest;
            try {
                const currentPrice = await this.getCurrentPrice(request.figi);
                if (currentPrice && currentPrice > 0) {
                    executionPrice = currentPrice;
                } else {
                    console.warn(`⚠️ Используем цену из заявки: ${executionPrice}`);
                }
            } catch (priceError) {
                console.warn(`⚠️ Не удалось получить текущую цену, используем цену из заявки: ${priceError.message}`);
            }
            
            if (!executionPrice || executionPrice <= 0) {
                throw new Error(`Не удалось определить цену для ${request.figi}`);
            }
            
            // Создаем торговый сигнал для обновления портфеля
            const signal = {
                symbol: request.figi,
                figi: request.figi,
                action: request.action,
                quantity: request.quantity,
                price: executionPrice,
                confidence: request.confidence,
                requestId: request.id
            };
            
            // Обновляем виртуальный портфель через TradingEngine
            // Используем executePaperOrder напрямую, так как мы уже в paper mode
            const result = await TradingEngine.executePaperOrder(signal);
            
            // Портфель автоматически сохраняется в БД внутри executePaperOrder
            console.log(`✅ Виртуальный портфель обновлен и сохранен в БД: ${request.action} ${request.quantity} ${request.ticker} по ${executionPrice.toFixed(2)} ₽`);
            
            // Уведомляем через WebSocket об обновлении портфеля
            try {
                const WebSocketService = ServiceManager.getService('WebSocketService');
                if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                    const updatedPortfolio = await TradingEngine.getPortfolioValue();
                    WebSocketService.broadcast({
                        type: 'PORTFOLIO_UPDATED',
                        data: {
                            requestId: request.id,
                            portfolio: updatedPortfolio
                        }
                    });
                }
            } catch (wsError) {
                console.warn('⚠️ Could not broadcast portfolio update:', wsError.message);
            }
            
            return result;
            
        } catch (error) {
            console.error('❌ Ошибка обновления виртуального портфеля:', error);
            throw error;
        }
    }

    /**
     * Получение текущей цены инструмента
     */
    async getCurrentPrice(figi) {
        try {
            // Сначала пробуем получить из кеша (быстро)
            const instrument = await CacheService.getInstrument(figi, true); // skipUpdate = true для скорости
            if (instrument && typeof instrument.lastPrice === 'number' && instrument.lastPrice > 0) {
                // Проверяем, не устарела ли цена (если старше 5 минут, запрашиваем свежую)
                const priceAge = instrument.lastPriceTime ? new Date() - new Date(instrument.lastPriceTime) : Infinity;
                if (priceAge < 5 * 60 * 1000) { // 5 минут
                    return instrument.lastPrice;
                }
            }
            
            // Если нет в кеше или цена устарела, запрашиваем через API
            const response = await TinkoffApiService.getLastPrices([figi]);
            const lastPrices = response?.lastPrices || [];
            
            if (lastPrices.length > 0) {
                const priceData = lastPrices[0];
                // Цена может быть в разных форматах: price или units/nano
                let price = 0;
                if (priceData.price) {
                    if (typeof priceData.price === 'number') {
                        price = priceData.price;
                    } else if (priceData.price.units !== undefined) {
                        price = parseFloat(priceData.price.units) + (parseFloat(priceData.price.nano || 0) / 1000000000);
                    }
                }
                
                // Валидация цены
                if (price && price > 0 && !isNaN(price)) {
                    return price;
                }
            }
            
            console.warn(`⚠️ Invalid price from getLastPrices for ${figi}`);
            return null;
        } catch (error) {
            console.warn(`⚠️ Could not get current price for ${figi}:`, error.message);
            return null; // Возвращаем null вместо 0
        }
    }

    /**
     * Валидация режима торговли
     */
    async validateTradingMode(mode, recommendation) {
        try {
            const modeSettings = await TradingModeManager.getModeSettings();
            
            // Для SELL операций (продажа) не требуем минимальную уверенность,
            // так как это решение пользователя продать свои акции
            const isSell = recommendation.recommendation === 'SELL' || recommendation.action === 'SELL';
            
            if (isSell) {
                console.log(`✅ SELL операция: пропускаем валидацию уверенности (пользовательское решение)`);
                return; // Пропускаем валидацию для продаж
            }
            
            switch (mode) {
                case 'paper':
                    // Paper режим - минимальные ограничения только для покупок
                    if (recommendation.confidence < 0.3) {
                        throw new Error('Paper режим: минимальная уверенность 30%');
                    }
                    break;
                    
                case 'micro':
                    // Micro режим - средние ограничения только для покупок
                    if (recommendation.confidence < modeSettings.minConfidence) {
                        throw new Error(`Micro режим: требуется уверенность минимум ${(modeSettings.minConfidence * 100).toFixed(0)}%`);
                    }
                    break;
                    
                case 'real':
                    // Real режим - строгие ограничения только для покупок
                    if (recommendation.confidence < modeSettings.minConfidence) {
                        throw new Error(`Real режим: требуется уверенность минимум ${(modeSettings.minConfidence * 100).toFixed(0)}%`);
                    }
                    if (recommendation.score < 0.7) {
                        throw new Error('Real режим: требуется оценка минимум 70%');
                    }
                    break;
                    
                default:
                    throw new Error(`Неизвестный режим торговли: ${mode}`);
            }
            
        } catch (error) {
            console.error('❌ Trading mode validation failed:', error);
            throw error;
        }
    }

    /**
     * Расчет количества акций для покупки
     */
    async calculateQuantity(figi, price, confidence, maxAmount = null, tradingMode = null) {
        try {
            // Валидация входных параметров
            if (!price || price <= 0 || isNaN(price)) {
                throw new Error(`Invalid price for quantity calculation: ${price}`);
            }
            
            if (!confidence || confidence <= 0 || isNaN(confidence)) {
                confidence = 0.5; // Значение по умолчанию
            }
            
            const portfolioSettings = await SettingsService.getPortfolioSettings();
            const mode = tradingMode || TradingModeManager.getCurrentMode().mode;
            
            // Если указана максимальная сумма, используем её
            let baseAmount;
            if (maxAmount && maxAmount > 0 && !isNaN(maxAmount)) {
                baseAmount = maxAmount;
            } else {
                // Базовая сумма на основе уверенности
                const budget = portfolioSettings?.user_max_portfolio_budget || 100000; // Fallback: 100k
                baseAmount = budget * 0.05; // 5% от портфеля
                
                // Корректируем на основе уверенности
                baseAmount *= confidence;
                
                // Корректируем на основе режима торговли
                const modeSettings = await TradingModeManager.getModeSettings();
                if (modeSettings?.maxPositionSize) {
                    baseAmount *= modeSettings.maxPositionSize / 0.05; // Нормализуем к базовому 5%
                }
            }
            
            // Валидация базовой суммы
            if (!baseAmount || baseAmount <= 0 || isNaN(baseAmount)) {
                baseAmount = 10000; // Fallback: 10k рублей
                console.warn(`⚠️ Using fallback baseAmount: ${baseAmount}`);
            }
            
            // Дополнительные ограничения по режимам
            switch (mode) {
                case 'paper':
                    // Paper режим - без дополнительных ограничений
                    break;
                    
                case 'micro':
                    // Micro режим - ограничиваем максимальную сумму
                    const microMaxAmount = 50000; // 50,000 рублей максимум
                    baseAmount = Math.min(baseAmount, microMaxAmount);
                    break;
                    
                case 'real':
                    // Real режим - консервативный подход
                    baseAmount *= 0.5; // Уменьшаем на 50% для безопасности
                    break;
            }
            
            // Применяем максимальную сумму если указана
            if (maxAmount && maxAmount > 0 && !isNaN(maxAmount) && maxAmount < baseAmount) {
                baseAmount = maxAmount;
            }
            
            // Валидация базовой суммы перед расчетом
            if (!baseAmount || baseAmount <= 0 || isNaN(baseAmount) || !isFinite(baseAmount)) {
                console.warn(`⚠️ Invalid baseAmount: ${baseAmount}, using fallback`);
                baseAmount = 10000; // Fallback: 10k рублей
            }
            
            // Рассчитываем количество акций
            let quantity = Math.floor(baseAmount / price);
            
            // Валидация результата
            if (!quantity || quantity <= 0 || isNaN(quantity) || !isFinite(quantity)) {
                console.warn(`⚠️ Invalid calculated quantity: ${quantity}, using fallback. baseAmount: ${baseAmount}, price: ${price}`);
                quantity = 1; // Fallback к 1 акции
            }
            
            return Math.max(1, quantity); // Минимум 1 акция
            
        } catch (error) {
            console.error('❌ Error calculating quantity:', error);
            // Возвращаем минимальное значение вместо NaN
            return 1; // Fallback к 1 акции
        }
    }

    /**
     * Генерация обоснования для заявки
     */
    generateReasoning(recommendation) {
        const reasons = [];
        
        reasons.push(`AI рекомендация: ${recommendation.recommendation}`);
        reasons.push(`Уверенность: ${(recommendation.confidence * 100).toFixed(1)}%`);
        reasons.push(`Оценка: ${(recommendation.score * 100).toFixed(1)}%`);
        
        if (recommendation.analysis) {
            if (recommendation.analysis.technicalSignals) {
                reasons.push(`Технические сигналы: ${recommendation.analysis.technicalSignals.join(', ')}`);
            }
            if (recommendation.analysis.fundamentalFactors) {
                reasons.push(`Фундаментальные факторы: ${recommendation.analysis.fundamentalFactors.join(', ')}`);
            }
        }
        
        return reasons.join('\n');
    }

    /**
     * Отправка уведомления в Telegram
     */
    async sendTelegramNotification(request, action, executionResult = null) {
        try {
            let message = '';
            
            switch (action) {
                case 'CREATED':
                    message = `🆕 Новая торговая заявка\n` +
                             `${request.action} ${request.ticker} (${request.name})\n` +
                             `Количество: ${request.quantity}\n` +
                             `Цена: ${request.priceAtRequest.toFixed(2)} ₽\n` +
                             `Сумма: ${request.estimatedAmount.toFixed(2)} ₽\n` +
                             `Уверенность: ${(request.confidence * 100).toFixed(1)}%\n` +
                             `Статус: Ожидает подтверждения`;
                    break;
                    
                case 'APPROVED':
                    message = `✅ Заявка одобрена\n` +
                             `${request.action} ${request.ticker}\n` +
                             `Количество: ${request.quantity}\n` +
                             `Статус: Готова к исполнению`;
                    break;
                    
                case 'REJECTED':
                    message = `❌ Заявка отклонена\n` +
                             `${request.action} ${request.ticker}\n` +
                             `Причина: ${request.rejectionReason}`;
                    break;
                    
                case 'EXECUTED':
                    const profit = executionResult?.trade?.pnl || 0;
                    message = `🎯 Заявка исполнена\n` +
                             `${request.action} ${request.ticker}\n` +
                             `Количество: ${request.quantity}\n` +
                             `Цена исполнения: ${request.actualPrice?.toFixed(2) || 'N/A'} ₽\n` +
                             `Комиссия: ${request.commission?.toFixed(2) || 'N/A'} ₽\n` +
                             `P&L: ${profit > 0 ? '+' : ''}${profit.toFixed(2)} ₽`;
                    break;
            }
            
            if (message) {
                // Используем sendAlert если доступен, иначе просто логируем
                try {
                    if (OptimizedTelegramService && typeof OptimizedTelegramService.sendAlert === 'function') {
                        await OptimizedTelegramService.sendAlert('Торговая заявка', message);
                    } else {
                        console.log('📱 Telegram notification (service not available):', message);
                    }
                } catch (telegramError) {
                    console.warn('⚠️ Could not send Telegram notification:', telegramError.message);
                }
            }
            
        } catch (error) {
            console.error('❌ Error sending Telegram notification:', error);
        }
    }

    /**
     * Отмена заявки
     */
    async cancelRequest(requestId, reason = null) {
        try {
            const request = await TradingRequest.findByPk(requestId);
            if (!request) {
                throw new Error(`Trading request not found: ${requestId}`);
            }

            await request.cancel(reason);

            // Уведомляем
            try {
                const WebSocketService = ServiceManager.getService('WebSocketService');
                if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                    WebSocketService.broadcast({
                        type: 'TRADING_REQUEST_CANCELLED',
                        data: request
                    });
                }
            } catch (wsError) {
                console.warn('⚠️ Could not broadcast WebSocket message:', wsError.message);
            }

            console.log(`🚫 Trading request cancelled: ${requestId}`);
            
            return request;

        } catch (error) {
            console.error('❌ Error cancelling trading request:', error);
            throw error;
        }
    }

    /**
     * Получение статистики заявок
     */
    async getRequestStats(tradingMode = null) {
        try {
            let whereClause = {};
            if (tradingMode) {
                whereClause.tradingMode = tradingMode;
            }

            const stats = await TradingRequest.findAll({
                attributes: [
                    'status',
                    [TradingRequest.sequelize.fn('COUNT', '*'), 'count']
                ],
                where: whereClause,
                group: ['status']
            });

            const result = {
                total: 0,
                pending: 0,
                approved: 0,
                rejected: 0,
                executed: 0,
                cancelled: 0,
                expired: 0
            };

            stats.forEach(stat => {
                const status = stat.status.toLowerCase();
                const count = parseInt(stat.get('count'));
                result[status] = count;
                result.total += count;
            });

            return result;
            
        } catch (error) {
            console.error('❌ Error getting request stats:', error);
            throw error;
        }
    }

    /**
     * Получение статистики по всем режимам торговли
     */
    async getStatsByMode() {
        try {
            const stats = await TradingRequest.findAll({
                attributes: [
                    'tradingMode',
                    'status',
                    [TradingRequest.sequelize.fn('COUNT', '*'), 'count']
                ],
                group: ['tradingMode', 'status']
            });

            const result = {
                paper: { total: 0, pending: 0, approved: 0, rejected: 0, executed: 0, cancelled: 0, expired: 0 },
                micro: { total: 0, pending: 0, approved: 0, rejected: 0, executed: 0, cancelled: 0, expired: 0 },
                real: { total: 0, pending: 0, approved: 0, rejected: 0, executed: 0, cancelled: 0, expired: 0 }
            };

            stats.forEach(stat => {
                const mode = stat.tradingMode;
                const status = stat.status.toLowerCase();
                const count = parseInt(stat.get('count'));
                
                if (result[mode]) {
                    result[mode][status] = count;
                    result[mode].total += count;
                }
            });

            return result;
            
        } catch (error) {
            console.error('❌ Error getting stats by mode:', error);
            throw error;
        }
    }

    /**
     * Остановка сервиса
     */
    async stop() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        
        console.log('🛑 Trading Request Service stopped');
    }
}

export default new TradingRequestService();
