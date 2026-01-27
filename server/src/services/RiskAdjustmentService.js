import Settings from '../models/Settings.js';
import OptimizedTelegramService from './OptimizedTelegramService.js';
import RiskManagementService from './RiskManagementService.js';
import CapitalScalingService from './CapitalScalingService.js';
import ProfitabilityTracker from './ProfitabilityTracker.js';

/**
 * Сервис для автоматической корректировки рисков
 * 
 * Основные функции:
 * - Анализ производительности системы
 * - Автоматическая корректировка параметров риска
 * - Адаптация к изменяющимся рыночным условиям
 * - Интеграция с системой масштабирования капитала
 */
class RiskAdjustmentService {
    constructor() {
        this.isInitialized = false;
        this.adjustmentSettings = {};
        this.riskHistory = [];
        this.currentRiskLevel = 'medium'; // low, medium, high, extreme
        this.riskLevels = {
            low: { 
                maxPositionSize: 0.01, 
                maxDrawdown: 0.05, 
                stopLoss: 0.02, 
                takeProfit: 0.03,
                multiplier: 0.8,
                name: 'Низкий риск'
            },
            medium: { 
                maxPositionSize: 0.02, 
                maxDrawdown: 0.08, 
                stopLoss: 0.03, 
                takeProfit: 0.05,
                multiplier: 1.0,
                name: 'Средний риск'
            },
            high: { 
                maxPositionSize: 0.03, 
                maxDrawdown: 0.12, 
                stopLoss: 0.04, 
                takeProfit: 0.08,
                multiplier: 1.2,
                name: 'Высокий риск'
            },
            extreme: { 
                maxPositionSize: 0.05, 
                maxDrawdown: 0.20, 
                stopLoss: 0.06, 
                takeProfit: 0.12,
                multiplier: 1.5,
                name: 'Экстремальный риск'
            }
        };
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            
            await this.loadAdjustmentSettings();
            await this.loadRiskHistory();
            await this.determineCurrentRiskLevel();
            
            this.isInitialized = true;
            
        } catch (error) {
            console.error('❌ Ошибка инициализации RiskAdjustmentService:', error);
            throw error;
        }
    }

    /**
     * Загрузка настроек корректировки рисков
     */
    async loadAdjustmentSettings() {
        this.adjustmentSettings = {
            // Основные параметры
            enabled: await Settings.getSetting('risk_adjustment_enabled', true),
            autoAdjustment: await Settings.getSetting('risk_auto_adjustment', true),
            adjustmentFrequency: await Settings.getSetting('risk_adjustment_frequency', 'daily'), // daily, weekly, monthly
            
            // Пороги для корректировки
            performanceThreshold: await Settings.getSetting('risk_performance_threshold', 0.15), // 15%
            drawdownThreshold: await Settings.getSetting('risk_drawdown_threshold', 0.08), // 8%
            volatilityThreshold: await Settings.getSetting('risk_volatility_threshold', 0.05), // 5%
            winRateThreshold: await Settings.getSetting('risk_winrate_threshold', 0.60), // 60%
            
            // Параметры корректировки
            adjustmentStep: await Settings.getSetting('risk_adjustment_step', 0.1), // 10%
            maxAdjustment: await Settings.getSetting('risk_max_adjustment', 0.5), // 50%
            minAdjustment: await Settings.getSetting('risk_min_adjustment', 0.05), // 5%
            
            // Периоды анализа
            performanceWindow: await Settings.getSetting('risk_performance_window', 30), // дни
            volatilityWindow: await Settings.getSetting('risk_volatility_window', 14), // дни
            trendWindow: await Settings.getSetting('risk_trend_window', 7), // дни
            
            // Уведомления
            notifyOnAdjustment: await Settings.getSetting('risk_notify_adjustment', true),
            notifyOnRiskChange: await Settings.getSetting('risk_notify_risk_change', true),
            notifyOnThreshold: await Settings.getSetting('risk_notify_threshold', true),
            
            // Интеграция с другими сервисами
            integrateWithScaling: await Settings.getSetting('risk_integrate_scaling', true),
            integrateWithProfitability: await Settings.getSetting('risk_integrate_profitability', true),
            
            // Экстренные меры
            emergencyStopEnabled: await Settings.getSetting('risk_emergency_stop_enabled', true),
            emergencyStopThreshold: await Settings.getSetting('risk_emergency_stop_threshold', 0.15), // 15%
            emergencyStopDuration: await Settings.getSetting('risk_emergency_stop_duration', 24), // часы
        };
    }

    /**
     * Загрузка истории корректировок риска
     */
    async loadRiskHistory() {
        try {
            const history = await Settings.getSetting('risk_adjustment_history', []);
            this.riskHistory = history.slice(-100); // Последние 100 записей
        } catch (error) {
            console.error('❌ Ошибка загрузки истории риска:', error);
            this.riskHistory = [];
        }
    }

    /**
     * Определение текущего уровня риска
     */
    async determineCurrentRiskLevel() {
        try {
            const currentLevel = await Settings.getSetting('current_risk_level', 'medium');
            this.currentRiskLevel = currentLevel;
        } catch (error) {
            console.error('❌ Ошибка определения уровня риска:', error);
            this.currentRiskLevel = 'medium';
        }
    }

    /**
     * Анализ текущего состояния рисков
     */
    async analyzeRiskStatus() {
        try {
            const analysis = {
                timestamp: new Date(),
                currentLevel: this.currentRiskLevel,
                metrics: {},
                recommendations: [],
                alerts: []
            };

            // Получаем данные о производительности
            if (this.adjustmentSettings.integrateWithProfitability) {
                const profitabilityAnalysis = await ProfitabilityTracker.analyzeProfitability('month', this.adjustmentSettings.performanceWindow);
                analysis.metrics.profitability = profitabilityAnalysis.metrics || {};
            }

            // Получаем данные о масштабировании
            if (this.adjustmentSettings.integrateWithScaling) {
                const scalingStatus = await CapitalScalingService.getStatus();
                analysis.metrics.scaling = scalingStatus;
            }

            // Получаем данные о риск-менеджменте
            const riskStatus = await RiskManagementService.getStatus();
            analysis.metrics.riskManagement = riskStatus;

            // Анализируем метрики
            const riskScore = this.calculateRiskScore(analysis.metrics);
            analysis.riskScore = riskScore;

            // Генерируем рекомендации
            analysis.recommendations = this.generateRecommendations(analysis.metrics, riskScore);

            // Проверяем пороги
            analysis.alerts = this.checkThresholds(analysis.metrics);

            return analysis;

        } catch (error) {
            console.error('❌ Ошибка анализа рисков:', error);
            return {
                timestamp: new Date(),
                error: error.message,
                currentLevel: this.currentRiskLevel
            };
        }
    }

    /**
     * Расчет общего скора риска
     */
    calculateRiskScore(metrics) {
        let score = 0;
        let factors = 0;

        // Фактор прибыльности (0-1, где 1 = высокий риск)
        if (metrics.profitability) {
            const profitPercent = metrics.profitability.profitPercent || 0;
            const profitFactor = Math.max(0, Math.min(1, (0.2 - profitPercent) / 0.2));
            score += profitFactor * 0.3;
            factors += 0.3;
        }

        // Фактор просадки (0-1, где 1 = высокий риск)
        if (metrics.profitability) {
            const drawdown = metrics.profitability.maxDrawdown || 0;
            const drawdownFactor = Math.min(1, drawdown / 0.2);
            score += drawdownFactor * 0.25;
            factors += 0.25;
        }

        // Фактор волатильности (0-1, где 1 = высокий риск)
        if (metrics.profitability) {
            const volatility = metrics.profitability.volatility || 0;
            const volatilityFactor = Math.min(1, volatility / 0.1);
            score += volatilityFactor * 0.2;
            factors += 0.2;
        }

        // Фактор win rate (0-1, где 1 = высокий риск)
        if (metrics.profitability) {
            const winRate = metrics.profitability.winRate || 0;
            const winRateFactor = Math.max(0, (0.5 - winRate) / 0.5);
            score += winRateFactor * 0.15;
            factors += 0.15;
        }

        // Фактор масштабирования (0-1, где 1 = высокий риск)
        if (metrics.scaling) {
            const canIncrease = metrics.scaling.canIncrease || false;
            const scalingFactor = canIncrease ? 0.3 : 0.7; // Если не можем увеличить - риск выше
            score += scalingFactor * 0.1;
            factors += 0.1;
        }

        return factors > 0 ? score / factors : 0.5; // По умолчанию средний риск
    }

    /**
     * Генерация рекомендаций по корректировке риска
     */
    generateRecommendations(metrics, riskScore) {
        const recommendations = [];

        // Рекомендации на основе скора риска
        if (riskScore > 0.8) {
            recommendations.push({
                type: 'reduce_risk',
                priority: 'high',
                message: 'Критически высокий риск. Рекомендуется снизить позиции и усилить стоп-лоссы.',
                actions: ['reduce_position_size', 'tighten_stop_loss', 'increase_drawdown_limit']
            });
        } else if (riskScore > 0.6) {
            recommendations.push({
                type: 'reduce_risk',
                priority: 'medium',
                message: 'Высокий риск. Рекомендуется осторожность в новых позициях.',
                actions: ['reduce_position_size', 'review_stop_loss']
            });
        } else if (riskScore < 0.3) {
            recommendations.push({
                type: 'increase_risk',
                priority: 'low',
                message: 'Низкий риск. Можно рассмотреть увеличение позиций.',
                actions: ['increase_position_size', 'relax_stop_loss']
            });
        }

        // Рекомендации на основе конкретных метрик
        if (metrics.profitability) {
            const { profitPercent, maxDrawdown, winRate, volatility } = metrics.profitability;

            if (profitPercent < -0.05) {
                recommendations.push({
                    type: 'emergency',
                    priority: 'critical',
                    message: 'Критические убытки. Требуется немедленная корректировка.',
                    actions: ['emergency_stop', 'reduce_all_positions', 'review_strategy']
                });
            }

            if (maxDrawdown > 0.1) {
                recommendations.push({
                    type: 'drawdown',
                    priority: 'high',
                    message: 'Высокая просадка. Усилить контроль рисков.',
                    actions: ['tighten_stop_loss', 'reduce_position_size', 'increase_monitoring']
                });
            }

            if (winRate < 0.4) {
                recommendations.push({
                    type: 'strategy',
                    priority: 'medium',
                    message: 'Низкий win rate. Пересмотреть стратегию входа.',
                    actions: ['review_entry_strategy', 'improve_signal_quality', 'reduce_frequency']
                });
            }

            if (volatility > 0.08) {
                recommendations.push({
                    type: 'volatility',
                    priority: 'medium',
                    message: 'Высокая волатильность. Увеличить буферы безопасности.',
                    actions: ['increase_stop_loss', 'reduce_position_size', 'add_volatility_filter']
                });
            }
        }

        return recommendations;
    }

    /**
     * Проверка порогов для уведомлений
     */
    checkThresholds(metrics) {
        const alerts = [];

        if (metrics.profitability) {
            const { profitPercent, maxDrawdown, winRate, volatility } = metrics.profitability;

            // Проверка порога прибыльности
            if (profitPercent < -this.adjustmentSettings.performanceThreshold) {
                alerts.push({
                    type: 'performance',
                    level: 'warning',
                    message: `Прибыльность ${(profitPercent * 100).toFixed(2)}% ниже порога ${(this.adjustmentSettings.performanceThreshold * 100)}%`
                });
            }

            // Проверка порога просадки
            if (maxDrawdown > this.adjustmentSettings.drawdownThreshold) {
                alerts.push({
                    type: 'drawdown',
                    level: 'error',
                    message: `Просадка ${(maxDrawdown * 100).toFixed(2)}% превышает порог ${(this.adjustmentSettings.drawdownThreshold * 100)}%`
                });
            }

            // Проверка порога волатильности
            if (volatility > this.adjustmentSettings.volatilityThreshold) {
                alerts.push({
                    type: 'volatility',
                    level: 'warning',
                    message: `Волатильность ${(volatility * 100).toFixed(2)}% превышает порог ${(this.adjustmentSettings.volatilityThreshold * 100)}%`
                });
            }

            // Проверка порога win rate
            if (winRate < this.adjustmentSettings.winRateThreshold) {
                alerts.push({
                    type: 'winrate',
                    level: 'warning',
                    message: `Win rate ${(winRate * 100).toFixed(2)}% ниже порога ${(this.adjustmentSettings.winRateThreshold * 100)}%`
                });
            }
        }

        return alerts;
    }

    /**
     * Автоматическая корректировка рисков
     */
    async autoAdjustRisk() {
        try {
            if (!this.adjustmentSettings.autoAdjustment) {
                return { adjusted: false, reason: 'Автоматическая корректировка отключена' };
            }

            const analysis = await this.analyzeRiskStatus();
            
            if (analysis.error) {
                return { adjusted: false, error: analysis.error };
            }

            const { riskScore, recommendations } = analysis;
            const adjustments = [];

            // Определяем необходимые корректировки
            for (const recommendation of recommendations) {
                if (recommendation.priority === 'critical' || recommendation.priority === 'high') {
                    const adjustment = await this.calculateAdjustment(recommendation, riskScore);
                    if (adjustment) {
                        adjustments.push(adjustment);
                    }
                }
            }

            // Применяем корректировки
            if (adjustments.length > 0) {
                const result = await this.applyAdjustments(adjustments, analysis);
                return result;
            }

            return { adjusted: false, reason: 'Корректировка не требуется' };

        } catch (error) {
            console.error('❌ Ошибка автоматической корректировки:', error);
            return { adjusted: false, error: error.message };
        }
    }

    /**
     * Расчет корректировки на основе рекомендации
     */
    async calculateAdjustment(recommendation, riskScore) {
        const currentLevel = this.riskLevels[this.currentRiskLevel];
        const adjustment = {
            type: recommendation.type,
            priority: recommendation.priority,
            currentLevel: this.currentRiskLevel,
            changes: {}
        };

        // Определяем новый уровень риска
        let newLevel = this.currentRiskLevel;
        
        if (recommendation.type === 'reduce_risk') {
            if (this.currentRiskLevel === 'extreme') newLevel = 'high';
            else if (this.currentRiskLevel === 'high') newLevel = 'medium';
            else if (this.currentRiskLevel === 'medium') newLevel = 'low';
        } else if (recommendation.type === 'increase_risk') {
            if (this.currentRiskLevel === 'low') newLevel = 'medium';
            else if (this.currentRiskLevel === 'medium') newLevel = 'high';
            else if (this.currentRiskLevel === 'high') newLevel = 'extreme';
        }

        if (newLevel !== this.currentRiskLevel) {
            adjustment.newLevel = newLevel;
            adjustment.changes.riskLevel = {
                from: this.currentRiskLevel,
                to: newLevel
            };
        }

        // Рассчитываем изменения параметров
        const newLevelConfig = this.riskLevels[newLevel];
        const adjustmentFactor = this.calculateAdjustmentFactor(riskScore, recommendation.priority);

        adjustment.changes.parameters = {
            maxPositionSize: {
                from: currentLevel.maxPositionSize,
                to: newLevelConfig.maxPositionSize * adjustmentFactor
            },
            maxDrawdown: {
                from: currentLevel.maxDrawdown,
                to: newLevelConfig.maxDrawdown * adjustmentFactor
            },
            stopLoss: {
                from: currentLevel.stopLoss,
                to: newLevelConfig.stopLoss * adjustmentFactor
            },
            takeProfit: {
                from: currentLevel.takeProfit,
                to: newLevelConfig.takeProfit * adjustmentFactor
            }
        };

        return adjustment;
    }

    /**
     * Расчет фактора корректировки
     */
    calculateAdjustmentFactor(riskScore, priority) {
        let factor = 1.0;

        if (priority === 'critical') {
            factor = 0.5; // Снижаем на 50%
        } else if (priority === 'high') {
            factor = 0.7; // Снижаем на 30%
        } else if (priority === 'medium') {
            factor = 0.85; // Снижаем на 15%
        } else if (priority === 'low') {
            factor = 1.1; // Увеличиваем на 10%
        }

        // Дополнительная корректировка на основе скора риска
        if (riskScore > 0.8) {
            factor *= 0.8;
        } else if (riskScore < 0.3) {
            factor *= 1.2;
        }

        return Math.max(this.adjustmentSettings.minAdjustment, 
                       Math.min(this.adjustmentSettings.maxAdjustment, factor));
    }

    /**
     * Применение корректировок
     */
    async applyAdjustments(adjustments, analysis) {
        try {
            const results = [];

            for (const adjustment of adjustments) {
                // Обновляем уровень риска
                if (adjustment.newLevel) {
                    await this.updateRiskLevel(adjustment.newLevel);
                }

                // Обновляем параметры риск-менеджмента
                if (adjustment.changes.parameters) {
                    await this.updateRiskParameters(adjustment.changes.parameters);
                }

                // Записываем в историю
                await this.recordAdjustment(adjustment, analysis);

                results.push({
                    type: adjustment.type,
                    level: adjustment.newLevel || adjustment.currentLevel,
                    changes: adjustment.changes
                });
            }

            // Отправляем уведомление
            if (this.adjustmentSettings.notifyOnAdjustment) {
                await this.sendAdjustmentNotification(adjustments, analysis);
            }

            return {
                adjusted: true,
                adjustments: results,
                newRiskLevel: this.currentRiskLevel
            };

        } catch (error) {
            console.error('❌ Ошибка применения корректировок:', error);
            throw error;
        }
    }

    /**
     * Обновление уровня риска
     */
    async updateRiskLevel(newLevel) {
        try {
            await Settings.setSetting('current_risk_level', newLevel, {
                description: 'Текущий уровень риска',
                category: 'risk_adjustment',
                dataType: 'string'
            });

            this.currentRiskLevel = newLevel;

        } catch (error) {
            console.error('❌ Ошибка обновления уровня риска:', error);
            throw error;
        }
    }

    /**
     * Обновление параметров риск-менеджмента
     */
    async updateRiskParameters(parameters) {
        try {
            for (const [param, values] of Object.entries(parameters)) {
                await Settings.setSetting(`risk_${param}`, values.to, {
                    description: `Параметр риска: ${param}`,
                    category: 'risk_adjustment',
                    dataType: 'number'
                });
            }

            // Обновляем настройки в RiskManagementService
            await RiskManagementService.updateLimits({
                maxPositionSize: parameters.maxPositionSize?.to,
                maxDrawdown: parameters.maxDrawdown?.to,
                stopLoss: parameters.stopLoss?.to,
                takeProfit: parameters.takeProfit?.to
            });

        } catch (error) {
            console.error('❌ Ошибка обновления параметров риска:', error);
            throw error;
        }
    }

    /**
     * Запись корректировки в историю
     */
    async recordAdjustment(adjustment, analysis) {
        try {
            const record = {
                timestamp: new Date(),
                type: adjustment.type,
                priority: adjustment.priority,
                currentLevel: adjustment.currentLevel,
                newLevel: adjustment.newLevel,
                changes: adjustment.changes,
                riskScore: analysis.riskScore,
                metrics: analysis.metrics
            };

            this.riskHistory.unshift(record);
            
            // Оставляем только последние 100 записей
            if (this.riskHistory.length > 100) {
                this.riskHistory.splice(100);
            }

            // Сохраняем в настройки
            await Settings.setSetting('risk_adjustment_history', this.riskHistory, {
                description: 'История корректировок риска',
                category: 'risk_adjustment',
                dataType: 'json'
            });

        } catch (error) {
            console.error('❌ Ошибка записи корректировки:', error);
        }
    }

    /**
     * Отправка уведомления о корректировке
     */
    async sendAdjustmentNotification(adjustments, analysis) {
        try {
            let message = '🔄 КОРРЕКТИРОВКА РИСКОВ\n\n';
            
            message += `📊 Текущий уровень: ${this.riskLevels[this.currentRiskLevel]?.name}\n`;
            message += `📈 Скор риска: ${(analysis.riskScore * 100).toFixed(1)}%\n\n`;
            
            message += '🔧 Внесенные изменения:\n';
            for (const adjustment of adjustments) {
                message += `• ${adjustment.type}: ${adjustment.currentLevel} → ${adjustment.newLevel || adjustment.currentLevel}\n`;
            }
            
            if (analysis.alerts.length > 0) {
                message += '\n⚠️ АКТИВНЫЕ АЛЕРТЫ:\n';
                for (const alert of analysis.alerts) {
                    message += `• ${alert.message}\n`;
                }
            }

            await OptimizedTelegramService.sendAlert('🔄 КОРРЕКТИРОВКА РИСКОВ', message);

        } catch (error) {
            console.error('❌ Ошибка отправки уведомления:', error);
        }
    }

    /**
     * Получение статуса сервиса
     */
    async getStatus() {
        try {
            const analysis = await this.analyzeRiskStatus();
            
            return {
                isInitialized: this.isInitialized,
                currentRiskLevel: this.currentRiskLevel,
                riskScore: analysis.riskScore || 0,
                recommendations: analysis.recommendations || [],
                alerts: analysis.alerts || [],
                settings: this.adjustmentSettings,
                historyCount: this.riskHistory.length
            };

        } catch (error) {
            console.error('❌ Ошибка получения статуса:', error);
            return {
                isInitialized: this.isInitialized,
                error: error.message
            };
        }
    }

    /**
     * Получение истории корректировок
     */
    getAdjustmentHistory(limit = 50) {
        return this.riskHistory.slice(0, limit);
    }

    /**
     * Обновление настроек корректировки
     */
    async updateAdjustmentSettings(newSettings) {
        try {
            for (const [key, value] of Object.entries(newSettings)) {
                await Settings.setSetting(`risk_${key}`, value, {
                    description: `Настройка корректировки риска: ${key}`,
                    category: 'risk_adjustment',
                    dataType: typeof value === 'number' ? 'number' : 'boolean'
                });
            }

            await this.loadAdjustmentSettings();
            
            return { success: true, message: 'Настройки обновлены' };

        } catch (error) {
            console.error('❌ Ошибка обновления настроек:', error);
            throw error;
        }
    }
}

export default new RiskAdjustmentService();
