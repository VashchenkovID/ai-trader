import TradingRequest from '../models/TradingRequest.js';
import ExitOptimizationService from './ExitOptimizationService.js';
import SettingsService from './SettingsService.js';
import LoggerService from './LoggerService.js';
import ServiceManager from './ServiceManager.js';
import { Op } from 'sequelize';

/**
 * Сервис для мониторинга открытых позиций
 * 
 * Функциональность:
 * - Мониторинг открытых позиций в реальном времени
 * - Алерты при приближении к стоп-лоссам
 * - Интеграция с ExitOptimizationService для периодических проверок
 * - Уведомления через Telegram и WebSocket
 */
class PositionMonitoringService {
    constructor() {
        this.isInitialized = false;
        this.settings = {
            // Интервалы проверки
            checkIntervalMinutes: 5,  // Проверка каждые 5 минут
            stopLossCheckIntervalMinutes: 1,  // Проверка стоп-лоссов каждую минуту
            
            // Пороги для алертов
            stopLossWarningPercent: 2.0,  // Предупреждение при 2% до стоп-лосса
            stopLossCriticalPercent: 1.0,  // Критическое предупреждение при 1% до стоп-лосса
            
            // Настройки уведомлений
            enableTelegramAlerts: true,
            enableWebSocketAlerts: true,
            enableExitOptimizationChecks: true,
            
            // Кэш для предотвращения дублирования алертов
            alertCooldownMinutes: 15  // Не отправлять повторные алерты в течение 15 минут
        };
        
        // Кэш последних алертов (для предотвращения дублирования)
        this.lastAlerts = new Map(); // figi -> { type, timestamp }
    }

    async initialize() {
        try {
            LoggerService.info('📊 Initializing Position Monitoring Service...');
            
            // Загружаем настройки
            await this.loadSettings();
            
            this.isInitialized = true;
            LoggerService.info('✅ Position Monitoring Service initialized');
        } catch (error) {
            LoggerService.error('❌ Failed to initialize Position Monitoring Service:', error);
            throw error;
        }
    }

    /**
     * Загрузка настроек из базы данных
     */
    async loadSettings() {
        try {
            const settings = await SettingsService.getAllSettings('position_monitoring');
            
            if (settings && settings.length > 0) {
                for (const setting of settings) {
                    const key = setting.key.replace('position_monitoring.', '');
                    const value = setting.value;
                    
                    if (key.includes('interval') || key.includes('percent') || key.includes('minutes')) {
                        this.settings[key] = parseFloat(value) || this.settings[key];
                    } else if (key.includes('enable')) {
                        this.settings[key] = value === 'true' || value === true;
                    }
                }
            }
        } catch (error) {
            LoggerService.warn('⚠️ Failed to load position monitoring settings, using defaults:', error.message);
        }
    }

    /**
     * Получение всех открытых позиций
     */
    async getOpenPositions(options = {}) {
        try {
            const where = {
                status: 'EXECUTED',
                action: 'BUY'  // Пока мониторим только длинные позиции
            };

            if (options.tradingMode) {
                where.tradingMode = options.tradingMode;
            }

            const positions = await TradingRequest.findAll({
                where,
                order: [['executedAt', 'ASC']]
            });

            return positions;
        } catch (error) {
            LoggerService.error('❌ Error getting open positions:', error);
            throw error;
        }
    }

    /**
     * Проверка всех открытых позиций
     */
    async checkAllPositions(options = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('PositionMonitoringService не инициализирован');
            }

            const positions = await this.getOpenPositions(options);
            
            if (!positions || positions.length === 0) {
                return {
                    checked: 0,
                    alerts: 0,
                    warnings: 0
                };
            }

            LoggerService.info(`🔍 Checking ${positions.length} open positions...`);

            // Получаем текущие цены для всех инструментов
            const figis = [...new Set(positions.map(p => p.figi))];
            const currentPrices = await this.getCurrentPrices(figis);

            let alertsCount = 0;
            let warningsCount = 0;
            const results = [];

            for (const position of positions) {
                try {
                    const currentPrice = currentPrices[position.figi];
                    if (!currentPrice || currentPrice <= 0) {
                        continue;
                    }

                    const checkResult = await this.checkPosition(position, currentPrice);
                    
                    if (checkResult.hasAlert) {
                        alertsCount++;
                    }
                    if (checkResult.hasWarning) {
                        warningsCount++;
                    }

                    results.push(checkResult);
                } catch (error) {
                    LoggerService.error(`❌ Error checking position ${position.id}:`, error);
                }
            }

            LoggerService.info(`✅ Position check completed: ${alertsCount} alerts, ${warningsCount} warnings`);

            return {
                checked: positions.length,
                alerts: alertsCount,
                warnings: warningsCount,
                results
            };
        } catch (error) {
            LoggerService.error('❌ Error checking all positions:', error);
            throw error;
        }
    }

    /**
     * Проверка одной позиции
     */
    async checkPosition(position, currentPrice) {
        try {
            const result = {
                positionId: position.id,
                figi: position.figi,
                ticker: position.ticker,
                hasAlert: false,
                hasWarning: false,
                alerts: [],
                warnings: [],
                exitAnalysis: null
            };

            // 1. Проверка стоп-лосса
            if (position.stopLoss) {
                const stopLossCheck = this.checkStopLoss(position, currentPrice);
                if (stopLossCheck.hasAlert) {
                    result.hasAlert = true;
                    result.alerts.push(stopLossCheck.alert);
                    await this.sendAlert(position, 'stop_loss', stopLossCheck.alert);
                } else if (stopLossCheck.hasWarning) {
                    result.hasWarning = true;
                    result.warnings.push(stopLossCheck.warning);
                    await this.sendWarning(position, 'stop_loss', stopLossCheck.warning);
                }
            }

            // 2. Проверка через ExitOptimizationService (если включено)
            if (this.settings.enableExitOptimizationChecks) {
                try {
                    const exitAnalysis = await ExitOptimizationService.analyzeExit(position, {
                        currentPrice
                    });

                    result.exitAnalysis = exitAnalysis;

                    if (exitAnalysis.shouldExit) {
                        result.hasAlert = true;
                        const alert = {
                            type: 'exit_recommended',
                            priority: exitAnalysis.priority || 'medium',
                            reason: exitAnalysis.reason,
                            recommendation: exitAnalysis.recommendation,
                            suggestedExitPrice: exitAnalysis.suggestedExitPrice,
                            suggestedExitPercent: exitAnalysis.suggestedExitPercent
                        };
                        result.alerts.push(alert);
                        await this.sendAlert(position, 'exit_recommended', alert);
                    } else if (exitAnalysis.shouldConsiderExit) {
                        result.hasWarning = true;
                        const warning = {
                            type: 'consider_exit',
                            reason: exitAnalysis.reason,
                            recommendation: exitAnalysis.recommendation
                        };
                        result.warnings.push(warning);
                        await this.sendWarning(position, 'consider_exit', warning);
                    }
                } catch (error) {
                    LoggerService.warn(`⚠️ Error in exit optimization check for ${position.figi}:`, error.message);
                }
            }

            return result;
        } catch (error) {
            LoggerService.error(`❌ Error checking position ${position.id}:`, error);
            throw error;
        }
    }

    /**
     * Проверка приближения к стоп-лоссу
     */
    checkStopLoss(position, currentPrice) {
        const stopLoss = position.stopLoss;
        const entryPrice = position.actualPrice || position.priceAtRequest;
        
        if (!stopLoss || !entryPrice || entryPrice <= 0) {
            return { hasAlert: false, hasWarning: false };
        }

        const distanceToStopLoss = Math.abs(currentPrice - stopLoss);
        const distancePercent = (distanceToStopLoss / entryPrice) * 100;

        const result = { hasAlert: false, hasWarning: false };

        // Критическое предупреждение (1% до стоп-лосса)
        if (distancePercent <= this.settings.stopLossCriticalPercent) {
            result.hasAlert = true;
            result.alert = {
                type: 'stop_loss_critical',
                message: `КРИТИЧЕСКОЕ ПРИБЛИЖЕНИЕ К СТОП-ЛОССУ: ${position.ticker}`,
                details: {
                    currentPrice,
                    stopLoss,
                    distancePercent: distancePercent.toFixed(2),
                    entryPrice
                }
            };
        }
        // Предупреждение (2% до стоп-лосса)
        else if (distancePercent <= this.settings.stopLossWarningPercent) {
            result.hasWarning = true;
            result.warning = {
                type: 'stop_loss_warning',
                message: `Приближение к стоп-лоссу: ${position.ticker}`,
                details: {
                    currentPrice,
                    stopLoss,
                    distancePercent: distancePercent.toFixed(2),
                    entryPrice
                }
            };
        }

        return result;
    }

    /**
     * Получение текущих цен для инструментов
     */
    async getCurrentPrices(figis) {
        try {
            const TinkoffApiService = (await import('./TinkoffApiService.js')).default;
            const lastPrices = await TinkoffApiService.getLastPrices(figis);
            return lastPrices || {};
        } catch (error) {
            LoggerService.warn('⚠️ Failed to get current prices:', error.message);
            return {};
        }
    }

    /**
     * Отправка алерта
     */
    async sendAlert(position, alertType, alertData) {
        try {
            // Проверяем кэш для предотвращения дублирования
            const cacheKey = `${position.figi}_${alertType}`;
            const lastAlert = this.lastAlerts.get(cacheKey);
            const now = Date.now();
            
            if (lastAlert && (now - lastAlert.timestamp) < (this.settings.alertCooldownMinutes * 60 * 1000)) {
                // Алерт уже отправлен недавно
                return;
            }

            // Обновляем кэш
            this.lastAlerts.set(cacheKey, {
                type: alertType,
                timestamp: now
            });

            // Очищаем старые записи из кэша (старше 1 часа)
            for (const [key, value] of this.lastAlerts.entries()) {
                if (now - value.timestamp > 60 * 60 * 1000) {
                    this.lastAlerts.delete(key);
                }
            }

            const message = this.formatAlertMessage(position, alertType, alertData);

            // Отправка в Telegram
            if (this.settings.enableTelegramAlerts) {
                try {
                    const OptimizedTelegramService = ServiceManager.getServiceSafe('OptimizedTelegramService');
                    if (OptimizedTelegramService && OptimizedTelegramService.isInitialized) {
                        await OptimizedTelegramService.sendAlert(
                            'POSITION_ALERT',
                            message,
                            alertData.priority === 'high' ? 'error' : 'warning'
                        );
                    }
                } catch (error) {
                    LoggerService.warn('⚠️ Failed to send Telegram alert:', error.message);
                }
            }

            // Отправка через WebSocket
            if (this.settings.enableWebSocketAlerts) {
                try {
                    const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
                    if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                        WebSocketService.broadcast({
                            type: 'POSITION_ALERT',
                            data: {
                                positionId: position.id,
                                figi: position.figi,
                                ticker: position.ticker,
                                alertType,
                                alertData,
                                timestamp: new Date().toISOString()
                            }
                        });
                    }
                } catch (error) {
                    LoggerService.warn('⚠️ Failed to send WebSocket alert:', error.message);
                }
            }

            LoggerService.info(`📢 Alert sent for ${position.ticker}: ${alertType}`);
        } catch (error) {
            LoggerService.error('❌ Error sending alert:', error);
        }
    }

    /**
     * Отправка предупреждения
     */
    async sendWarning(position, warningType, warningData) {
        try {
            // Проверяем кэш для предотвращения дублирования
            const cacheKey = `${position.figi}_${warningType}`;
            const lastAlert = this.lastAlerts.get(cacheKey);
            const now = Date.now();
            
            if (lastAlert && (now - lastAlert.timestamp) < (this.settings.alertCooldownMinutes * 60 * 1000)) {
                return;
            }

            this.lastAlerts.set(cacheKey, {
                type: warningType,
                timestamp: now
            });

            const message = this.formatWarningMessage(position, warningType, warningData);

            // Отправка в Telegram
            if (this.settings.enableTelegramAlerts) {
                try {
                    const OptimizedTelegramService = ServiceManager.getServiceSafe('OptimizedTelegramService');
                    if (OptimizedTelegramService && OptimizedTelegramService.isInitialized) {
                        await OptimizedTelegramService.sendAlert(
                            'POSITION_WARNING',
                            message,
                            'info'
                        );
                    }
                } catch (error) {
                    LoggerService.warn('⚠️ Failed to send Telegram warning:', error.message);
                }
            }

            // Отправка через WebSocket
            if (this.settings.enableWebSocketAlerts) {
                try {
                    const WebSocketService = ServiceManager.getServiceSafe('WebSocketService');
                    if (WebSocketService && typeof WebSocketService.broadcast === 'function') {
                        WebSocketService.broadcast({
                            type: 'POSITION_WARNING',
                            data: {
                                positionId: position.id,
                                figi: position.figi,
                                ticker: position.ticker,
                                warningType,
                                warningData,
                                timestamp: new Date().toISOString()
                            }
                        });
                    }
                } catch (error) {
                    LoggerService.warn('⚠️ Failed to send WebSocket warning:', error.message);
                }
            }
        } catch (error) {
            LoggerService.error('❌ Error sending warning:', error);
        }
    }

    /**
     * Форматирование сообщения алерта
     */
    formatAlertMessage(position, alertType, alertData) {
        const entryPrice = position.actualPrice || position.priceAtRequest;
        const currentPrice = alertData.details?.currentPrice || alertData.suggestedExitPrice;
        const profitPercent = currentPrice && entryPrice 
            ? (((currentPrice - entryPrice) / entryPrice) * 100).toFixed(2)
            : 'N/A';

        let message = `🚨 АЛЕРТ: ${position.ticker} (${position.name})\n\n`;

        switch (alertType) {
            case 'stop_loss_critical':
                message += `⚠️ КРИТИЧЕСКОЕ ПРИБЛИЖЕНИЕ К СТОП-ЛОССУ!\n\n`;
                message += `Текущая цена: ${currentPrice?.toFixed(2)}₽\n`;
                message += `Стоп-лосс: ${alertData.details.stopLoss.toFixed(2)}₽\n`;
                message += `Расстояние: ${alertData.details.distancePercent}%\n`;
                message += `Цена входа: ${entryPrice.toFixed(2)}₽\n`;
                message += `Прибыль/убыток: ${profitPercent}%`;
                break;

            case 'exit_recommended':
                message += `📊 Рекомендуется выход из позиции\n\n`;
                message += `Причина: ${alertData.reason}\n`;
                message += `Приоритет: ${alertData.priority}\n`;
                if (alertData.suggestedExitPrice) {
                    message += `Рекомендуемая цена выхода: ${alertData.suggestedExitPrice.toFixed(2)}₽\n`;
                }
                if (alertData.suggestedExitPercent !== null && alertData.suggestedExitPercent !== undefined) {
                    message += `Прибыль/убыток: ${alertData.suggestedExitPercent.toFixed(2)}%`;
                }
                break;

            default:
                message += `${alertData.message || 'Алерт по позиции'}\n\n`;
                if (alertData.details) {
                    Object.entries(alertData.details).forEach(([key, value]) => {
                        message += `${key}: ${value}\n`;
                    });
                }
        }

        return message;
    }

    /**
     * Форматирование сообщения предупреждения
     */
    formatWarningMessage(position, warningType, warningData) {
        let message = `⚠️ Предупреждение: ${position.ticker} (${position.name})\n\n`;

        switch (warningType) {
            case 'stop_loss_warning':
                message += `Приближение к стоп-лоссу\n\n`;
                message += `Текущая цена: ${warningData.details.currentPrice.toFixed(2)}₽\n`;
                message += `Стоп-лосс: ${warningData.details.stopLoss.toFixed(2)}₽\n`;
                message += `Расстояние: ${warningData.details.distancePercent}%`;
                break;

            case 'consider_exit':
                message += `Рекомендуется рассмотреть выход\n\n`;
                message += `Причина: ${warningData.reason}`;
                break;

            default:
                message += `${warningData.message || 'Предупреждение по позиции'}`;
        }

        return message;
    }

    /**
     * Получение текущих настроек
     */
    getSettings() {
        return { ...this.settings };
    }

    /**
     * Обновление настроек
     */
    async updateSettings(newSettings) {
        try {
            this.settings = { ...this.settings, ...newSettings };
            
            for (const [key, value] of Object.entries(newSettings)) {
                await SettingsService.setSetting(`position_monitoring.${key}`, value, {
                    description: `Настройка мониторинга позиций: ${key}`,
                    category: 'position_monitoring',
                    dataType: typeof value === 'number' ? 'number' : 'boolean'
                });
            }
            
            LoggerService.info('✅ Position monitoring settings updated');
            return true;
        } catch (error) {
            LoggerService.error('❌ Failed to update position monitoring settings:', error);
            throw error;
        }
    }
}

export default new PositionMonitoringService();

