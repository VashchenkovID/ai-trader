import TradingRequest from '../models/TradingRequest.js';
import Recommendation from '../models/Recommendation.js';
import TradingEngine from './TradingEngine.js'; // Нужен для обновления виртуального портфеля в paper mode
import TradingModeManager from './TradingModeManager.js';
import ServiceManager from './ServiceManager.js';
import OptimizedTelegramService from './OptimizedTelegramService.js';
import TinkoffApiService from './TinkoffApiService.js';
import SettingsService from './SettingsService.js';
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
            
            // Используем указанное количество или рассчитываем автоматически
            let quantity;
            if (options.quantity && options.quantity > 0 && !isNaN(options.quantity)) {
                quantity = Math.floor(Math.abs(options.quantity)); // Округляем вниз до целого числа
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
            
            // Валидация суммы
            if (!estimatedAmount || estimatedAmount <= 0 || isNaN(estimatedAmount) || !isFinite(estimatedAmount)) {
                throw new Error(`Invalid estimated amount: ${estimatedAmount}. Price: ${currentPrice}, Quantity: ${quantity}`);
            }

            // Создаем заявку
            const tradingRequest = await TradingRequest.create({
                recommendationId: recommendation.figi,
                figi: recommendation.figi,
                ticker: recommendation.ticker,
                name: recommendation.name,
                action: recommendation.recommendation,
                quantity,
                priceAtRequest: currentPrice,
                estimatedAmount,
                confidence: recommendation.confidence,
                score: recommendation.score,
                reasoning: this.generateReasoning(recommendation),
                aiExplanation: recommendation.explanation,
                tradingMode: currentMode,
                stopLoss: options.stopLoss || recommendation.stopLoss,
                takeProfit: options.takeProfit || recommendation.takeProfit,
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
                console.warn('⚠️ Could not broadcast WebSocket message:', wsError.message);
            }

            // Отправляем уведомление в Telegram (опционально)
            try {
                await this.sendTelegramNotification(tradingRequest, 'CREATED');
            } catch (telegramError) {
                console.warn('⚠️ Could not send Telegram notification:', telegramError.message);
            }

            console.log(`📝 Trading request created: ${tradingRequest.id} (${tradingRequest.action} ${tradingRequest.ticker})`);
            
            return tradingRequest;

        } catch (error) {
            console.error('❌ Error creating trading request:', error);
            throw error;
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

            if (recommendationData.recommendation === 'HOLD') {
                throw new Error('Cannot create trading request for HOLD recommendation');
            }

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

            // Создаем заявку
            const tradingRequest = await TradingRequest.create({
                recommendationId: recommendationData.figi, // Используем FIGI как ID рекомендации
                figi: recommendationData.figi,
                ticker: recommendationData.ticker,
                name: recommendationData.name,
                action: recommendationData.recommendation,
                quantity,
                priceAtRequest: currentPrice,
                estimatedAmount,
                confidence: recommendationData.confidence || 0.5,
                score: recommendationData.score || 0.5,
                reasoning: this.generateReasoning(recommendationData),
                aiExplanation: recommendationData.explanation || recommendationData.analysis,
                tradingMode: currentMode,
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
                console.warn('⚠️ Could not broadcast WebSocket message:', wsError.message);
            }

            // Отправляем уведомление в Telegram (опционально)
            try {
                await this.sendTelegramNotification(tradingRequest, 'CREATED');
            } catch (telegramError) {
                console.warn('⚠️ Could not send Telegram notification:', telegramError.message);
            }

            console.log(`📝 Trading request created from data: ${tradingRequest.id} (${tradingRequest.action} ${tradingRequest.ticker})`);
            
            return tradingRequest;

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
            let whereClause = {};
            
            if (status) {
                whereClause.status = status;
            }
            
            if (tradingMode) {
                whereClause.tradingMode = tradingMode;
            }
            
            if (Object.keys(whereClause).length > 0) {
                return await TradingRequest.findAll({
                    where: whereClause,
                    order: [['createdAt', 'DESC']],
                    limit
                });
            } else {
                return await TradingRequest.getRequestHistory(limit);
            }
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
            // Используем getLastPrices вместо getOrderBook
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
