import TradingRequest from '../models/TradingRequest.js';
import Recommendation from '../models/Recommendation.js';
import TradingEngine from './TradingEngine.js';
import TradingModeManager from './TradingModeManager.js';
import WebSocketService from './WebSocketService.js';
import OptimizedTelegramService from './OptimizedTelegramService.js';
import TinkoffApiService from './TinkoffApiService.js';
import SettingsService from './SettingsService.js';

/**
 * Сервис для управления торговыми заявками
 */
class TradingRequestService {
    constructor() {
        this.isInitialized = false;
        this.autoExecutionEnabled = false;
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

            if (recommendation.recommendation === 'HOLD') {
                throw new Error('Cannot create trading request for HOLD recommendation');
            }

            // Получаем текущий режим торговли
            const currentMode = TradingModeManager.getCurrentMode().mode;
            
            // Валидация для режима торговли
            await this.validateTradingMode(currentMode, recommendation);

            // Получаем текущую цену
            const currentPrice = await this.getCurrentPrice(recommendation.figi);
            
            // Рассчитываем количество акций с учетом режима
            const quantity = await this.calculateQuantity(
                recommendation.figi, 
                currentPrice, 
                recommendation.confidence,
                options.maxAmount,
                currentMode
            );

            const estimatedAmount = currentPrice * quantity;

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

            // Уведомляем через WebSocket
            WebSocketService.broadcast({
                type: 'TRADING_REQUEST_CREATED',
                data: tradingRequest
            });

            // Отправляем уведомление в Telegram
            await this.sendTelegramNotification(tradingRequest, 'CREATED');

            console.log(`📝 Trading request created: ${tradingRequest.id} (${tradingRequest.action} ${tradingRequest.ticker})`);
            
            return tradingRequest;

        } catch (error) {
            console.error('❌ Error creating trading request:', error);
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

            // Уведомляем
            WebSocketService.broadcast({
                type: 'TRADING_REQUEST_APPROVED',
                data: request
            });

            await this.sendTelegramNotification(request, 'APPROVED');

            console.log(`✅ Trading request approved: ${requestId}`);

            // Если включено автоисполнение, выполняем сразу
            if (this.autoExecutionEnabled) {
                setTimeout(() => this.executeRequest(requestId), 1000);
            }

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

            // Уведомляем
            WebSocketService.broadcast({
                type: 'TRADING_REQUEST_REJECTED',
                data: request
            });

            await this.sendTelegramNotification(request, 'REJECTED');

            console.log(`❌ Trading request rejected: ${requestId} - ${reason}`);
            
            return request;

        } catch (error) {
            console.error('❌ Error rejecting trading request:', error);
            throw error;
        }
    }

    /**
     * Исполнение заявки
     */
    async executeRequest(requestId) {
        try {
            const request = await TradingRequest.findByPk(requestId);
            if (!request) {
                throw new Error(`Trading request not found: ${requestId}`);
            }

            if (request.status !== 'APPROVED') {
                throw new Error(`Cannot execute request with status: ${request.status}`);
            }

            // Получаем текущую цену для проверки
            const currentPrice = await this.getCurrentPrice(request.figi);
            const priceChange = Math.abs(currentPrice - request.priceAtRequest) / request.priceAtRequest;
            
            // Проверяем, не изменилась ли цена слишком сильно (более 5%)
            if (priceChange > 0.05) {
                await request.reject(`Price changed too much: ${(priceChange * 100).toFixed(2)}%`);
                throw new Error('Price changed significantly since request creation');
            }

            // Создаем торговый сигнал
            const signal = {
                symbol: request.ticker,
                figi: request.figi,
                action: request.action,
                quantity: request.quantity,
                price: currentPrice,
                confidence: request.confidence,
                requestId: request.id
            };

            // Исполняем через TradingEngine
            const executionResult = await TradingEngine.executeOrder(signal);

            // Обновляем заявку
            await request.execute(executionResult);

            // Уведомляем
            WebSocketService.broadcast({
                type: 'TRADING_REQUEST_EXECUTED',
                data: { request, result: executionResult }
            });

            await this.sendTelegramNotification(request, 'EXECUTED', executionResult);

            console.log(`🎯 Trading request executed: ${requestId}`);
            
            return { request, executionResult };

        } catch (error) {
            console.error('❌ Error executing trading request:', error);
            
            // Обновляем статус заявки на ошибку
            try {
                const request = await TradingRequest.findByPk(requestId);
                if (request && request.status === 'APPROVED') {
                    await request.reject(`Execution failed: ${error.message}`);
                }
            } catch (updateError) {
                console.error('❌ Error updating failed request:', updateError);
            }
            
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
                WebSocketService.broadcast({
                    type: 'TRADING_REQUESTS_EXPIRED',
                    data: { count: expiredRequests.length }
                });
            }

        } catch (error) {
            console.error('❌ Error cleaning up expired requests:', error);
        }
    }

    /**
     * Получение текущей цены инструмента
     */
    async getCurrentPrice(figi) {
        try {
            const orderbook = await TinkoffApiService.getOrderBook(figi);
            return (orderbook.lastPrice || orderbook.closePrice || 0);
        } catch (error) {
            console.warn(`⚠️ Could not get current price for ${figi}:`, error.message);
            return 0;
        }
    }

    /**
     * Валидация режима торговли
     */
    async validateTradingMode(mode, recommendation) {
        try {
            const modeSettings = await TradingModeManager.getModeSettings();
            
            switch (mode) {
                case 'paper':
                    // Paper режим - минимальные ограничения
                    if (recommendation.confidence < 0.3) {
                        throw new Error('Paper режим: минимальная уверенность 30%');
                    }
                    break;
                    
                case 'micro':
                    // Micro режим - средние ограничения
                    if (recommendation.confidence < modeSettings.minConfidence) {
                        throw new Error(`Micro режим: требуется уверенность минимум ${(modeSettings.minConfidence * 100).toFixed(0)}%`);
                    }
                    break;
                    
                case 'real':
                    // Real режим - строгие ограничения
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
            const portfolioSettings = await SettingsService.getPortfolioSettings();
            const mode = tradingMode || TradingModeManager.getCurrentMode().mode;
            
            // Базовая сумма на основе уверенности
            let baseAmount = portfolioSettings.user_max_portfolio_budget * 0.05; // 5% от портфеля
            
            // Корректируем на основе уверенности
            baseAmount *= confidence;
            
            // Корректируем на основе режима торговли
            const modeSettings = await TradingModeManager.getModeSettings();
            baseAmount *= modeSettings.maxPositionSize / 0.05; // Нормализуем к базовому 5%
            
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
            if (maxAmount && maxAmount < baseAmount) {
                baseAmount = maxAmount;
            }
            
            // Рассчитываем количество акций
            const quantity = Math.floor(baseAmount / price);
            
            return Math.max(1, quantity); // Минимум 1 акция
            
        } catch (error) {
            console.error('❌ Error calculating quantity:', error);
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
                await OptimizedTelegramService.sendMessage(message);
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
            WebSocketService.broadcast({
                type: 'TRADING_REQUEST_CANCELLED',
                data: request
            });

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
