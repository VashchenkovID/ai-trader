import Settings from '../models/Settings.js';
import MigrationStatus from '../models/MigrationStatus.js';
import OptimizedTelegramService from './OptimizedTelegramService.js';
import TradingEngine from './TradingEngine.js';
import sequelize from '../config/database.js';

/**
 * Сервис для управления постепенным увеличением капитала (Этап 3)
 * 
 * Основные функции:
 * - Отслеживание прибыльности системы
 * - Автоматическое увеличение капитала на основе результатов
 * - Корректировка рисков в зависимости от производительности
 * - Валидация готовности к увеличению капитала
 */
class CapitalScalingService {
    constructor() {
        this.isInitialized = false;
        this.scalingSettings = {};
        this.performanceHistory = [];
        this.currentCapitalLevel = 'micro'; // micro, small, medium, large
        this.capitalLevels = {};
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            
            await this.loadScalingSettings();
            await this.loadPerformanceHistory();
            await this.determineCurrentCapitalLevel();
            
            this.isInitialized = true;
            
        } catch (error) {
            console.error('❌ Ошибка инициализации CapitalScalingService:', error);
            throw error;
        }
    }

    /**
     * Загрузка настроек масштабирования
     */
    async loadScalingSettings() {
        this.scalingSettings = {
            // Основные параметры масштабирования
            minProfitabilityThreshold: await Settings.getSetting('scaling_min_profitability', 0.15), // 15%
            minTradingDays: await Settings.getSetting('scaling_min_trading_days', 30),
            maxDrawdownThreshold: await Settings.getSetting('scaling_max_drawdown', 0.10), // 10%
            minWinRate: await Settings.getSetting('scaling_min_win_rate', 0.60), // 60%
            
            // Параметры увеличения капитала
            capitalIncreaseStep: await Settings.getSetting('scaling_capital_increase_step', 0.25), // 25%
            maxCapitalIncrease: await Settings.getSetting('scaling_max_capital_increase', 0.50), // 50%
            minDaysBetweenIncreases: await Settings.getSetting('scaling_min_days_between', 14),
            
            // Параметры снижения капитала
            capitalDecreaseStep: await Settings.getSetting('scaling_capital_decrease_step', 0.20), // 20%
            maxCapitalDecrease: await Settings.getSetting('scaling_max_capital_decrease', 0.40), // 40%
            
            // Параметры риска
            riskAdjustmentFactor: await Settings.getSetting('scaling_risk_adjustment_factor', 0.8),
            maxRiskPerTrade: await Settings.getSetting('scaling_max_risk_per_trade', 0.02), // 2%
            maxPortfolioRisk: await Settings.getSetting('scaling_max_portfolio_risk', 0.10), // 10%
            
            // Параметры уведомлений
            notifyOnCapitalChange: await Settings.getSetting('scaling_notify_capital_change', true),
            notifyOnRiskAdjustment: await Settings.getSetting('scaling_notify_risk_adjustment', true),
            notifyOnPerformanceAlert: await Settings.getSetting('scaling_notify_performance_alert', true),
            
            // Параметры валидации
            requireManualApproval: await Settings.getSetting('scaling_require_manual_approval', true),
            maxAutoIncrease: await Settings.getSetting('scaling_max_auto_increase', 0.20), // 20%
            
            // Параметры мониторинга
            performanceWindowDays: await Settings.getSetting('scaling_performance_window', 30),
            evaluationFrequency: await Settings.getSetting('scaling_evaluation_frequency', 'daily'), // daily, weekly, monthly
            autoScalingEnabled: await Settings.getSetting('scaling_auto_enabled', false)
        };

        // Загружаем уровни капитала
        await this.loadCapitalLevels();
    }

    /**
     * Загрузка уровней капитала из настроек
     */
    async loadCapitalLevels() {
        try {
            // Загружаем уровни капитала из настроек
            const levelsConfig = await Settings.getSetting('scaling_capital_levels', {
                micro: { min: 10000, max: 50000, multiplier: 1.0, name: 'Микро-капитал' },
                small: { min: 50000, max: 200000, multiplier: 1.2, name: 'Малый капитал' },
                medium: { min: 200000, max: 500000, multiplier: 1.5, name: 'Средний капитал' },
                large: { min: 500000, max: 1000000, multiplier: 2.0, name: 'Большой капитал' }
            });

            this.capitalLevels = levelsConfig;

        } catch (error) {
            console.error('❌ Ошибка загрузки уровней капитала:', error);
            // Устанавливаем значения по умолчанию
            this.capitalLevels = {
                micro: { min: 10000, max: 50000, multiplier: 1.0, name: 'Микро-капитал' },
                small: { min: 50000, max: 200000, multiplier: 1.2, name: 'Малый капитал' },
                medium: { min: 200000, max: 500000, multiplier: 1.5, name: 'Средний капитал' },
                large: { min: 500000, max: 1000000, multiplier: 2.0, name: 'Большой капитал' }
            };
        }
    }

    /**
     * Проверка существования таблицы
     */
    async checkTableExists(tableName) {
        try {
            const queryInterface = sequelize.getQueryInterface();
            const tables = await queryInterface.showAllTables();
            return tables.includes(tableName);
        } catch (error) {
            console.warn(`⚠️ Ошибка проверки таблицы ${tableName}:`, error.message);
            return false;
        }
    }

    /**
     * Загрузка истории производительности
     */
    async loadPerformanceHistory() {
        try {
            // Проверяем, существует ли таблица migration_status
            const tableExists = await this.checkTableExists('migration_status');
            if (!tableExists) {
                return;
            }

            // Загружаем историю из миграций и торговых операций
            const migrations = await MigrationStatus.findAll({
                where: {
                    status: 'completed'
                },
                order: [['endTime', 'DESC']],
                limit: 100
            });

            this.performanceHistory = migrations.map(migration => ({
                date: migration.endTime,
                type: 'migration',
                capital: migration.stats?.finalCapital || 0,
                profit: migration.stats?.totalProfit || 0,
                profitPercent: migration.stats?.profitPercent || 0,
                drawdown: migration.stats?.maxDrawdown || 0,
                winRate: migration.stats?.winRate || 0,
                trades: migration.stats?.totalTrades || 0
            }));

            // Добавляем данные из TradingEngine
            if (TradingEngine.virtualPortfolio && TradingEngine.virtualPortfolio.trades) {
                const recentTrades = TradingEngine.virtualPortfolio.trades
                    .filter(trade => new Date(trade.timestamp) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
                    .map(trade => ({
                        date: new Date(trade.timestamp),
                        type: 'trade',
                        profit: trade.pnl || 0,
                        symbol: trade.symbol,
                        action: trade.action
                    }));
                
                this.performanceHistory.push(...recentTrades);
            }

            // Сортируем по дате
            this.performanceHistory.sort((a, b) => new Date(b.date) - new Date(a.date));

        } catch (error) {
            console.error('❌ Ошибка загрузки истории производительности:', error);
            this.performanceHistory = [];
        }
    }

    /**
     * Определение текущего уровня капитала
     */
    async determineCurrentCapitalLevel() {
        try {
            const currentCapital = await Settings.getSetting('user_max_portfolio_budget', 1000000);
            
            for (const [level, config] of Object.entries(this.capitalLevels)) {
                if (currentCapital >= config.min && currentCapital <= config.max) {
                    this.currentCapitalLevel = level;
                    break;
                }
            }

        } catch (error) {
            console.error('❌ Ошибка определения уровня капитала:', error);
            this.currentCapitalLevel = 'micro';
        }
    }

    /**
     * Анализ производительности системы
     */
    async analyzePerformance() {
        try {
            const analysis = {
                period: this.scalingSettings.performanceWindowDays,
                startDate: new Date(Date.now() - this.scalingSettings.performanceWindowDays * 24 * 60 * 60 * 1000),
                endDate: new Date(),
                metrics: {}
            };

            // Фильтруем данные за период
            const periodData = this.performanceHistory.filter(
                item => new Date(item.date) >= analysis.startDate
            );

            if (periodData.length === 0) {
                return {
                    ...analysis,
                    hasEnoughData: false,
                    message: 'Недостаточно данных для анализа'
                };
            }

            // Рассчитываем метрики
            const trades = periodData.filter(item => item.type === 'trade');
            const migrations = periodData.filter(item => item.type === 'migration');

            // Общая прибыльность
            const totalProfit = periodData.reduce((sum, item) => sum + (item.profit || 0), 0);
            const totalCapital = await Settings.getSetting('user_max_portfolio_budget', 1000000);
            const profitPercent = totalCapital > 0 ? (totalProfit / totalCapital) * 100 : 0;

            // Win Rate
            const profitableTrades = trades.filter(trade => trade.profit > 0).length;
            const winRate = trades.length > 0 ? profitableTrades / trades.length : 0;

            // Максимальная просадка
            const maxDrawdown = Math.max(...migrations.map(m => m.drawdown || 0), 0);

            // Средняя прибыльность в день
            const days = Math.max(1, (analysis.endDate - analysis.startDate) / (24 * 60 * 60 * 1000));
            const dailyProfit = totalProfit / days;

            // Волатильность
            const profits = trades.map(t => t.profit || 0);
            const avgProfit = profits.reduce((sum, p) => sum + p, 0) / profits.length;
            const variance = profits.reduce((sum, p) => sum + Math.pow(p - avgProfit, 2), 0) / profits.length;
            const volatility = Math.sqrt(variance);

            analysis.metrics = {
                totalProfit,
                profitPercent,
                winRate,
                maxDrawdown,
                dailyProfit,
                volatility,
                totalTrades: trades.length,
                totalMigrations: migrations.length,
                hasEnoughData: true
            };

            return analysis;

        } catch (error) {
            console.error('❌ Ошибка анализа производительности:', error);
            return {
                hasEnoughData: false,
                error: error.message
            };
        }
    }

    /**
     * Проверка готовности к увеличению капитала
     */
    async canIncreaseCapital() {
        try {
            const analysis = await this.analyzePerformance();
            
            if (!analysis.hasEnoughData) {
                return {
                    canIncrease: false,
                    reason: 'Недостаточно данных для анализа',
                    analysis
                };
            }

            const { metrics } = analysis;
            const reasons = [];

            // Проверяем минимальную прибыльность
            if (metrics.profitPercent < this.scalingSettings.minProfitabilityThreshold * 100) {
                reasons.push(`Прибыльность ${metrics.profitPercent.toFixed(2)}% ниже минимального порога ${this.scalingSettings.minProfitabilityThreshold * 100}%`);
            }

            // Проверяем максимальную просадку
            if (metrics.maxDrawdown > this.scalingSettings.maxDrawdownThreshold) {
                reasons.push(`Максимальная просадка ${(metrics.maxDrawdown * 100).toFixed(2)}% превышает допустимую ${this.scalingSettings.maxDrawdownThreshold * 100}%`);
            }

            // Проверяем win rate
            if (metrics.winRate < this.scalingSettings.minWinRate) {
                reasons.push(`Win rate ${(metrics.winRate * 100).toFixed(2)}% ниже минимального ${this.scalingSettings.minWinRate * 100}%`);
            }

            // Проверяем количество торговых дней
            if (analysis.period < this.scalingSettings.minTradingDays) {
                reasons.push(`Период анализа ${analysis.period} дней меньше минимального ${this.scalingSettings.minTradingDays} дней`);
            }

            const canIncrease = reasons.length === 0;

            return {
                canIncrease,
                reasons,
                analysis,
                currentLevel: this.currentCapitalLevel,
                nextLevel: this.getNextCapitalLevel()
            };

        } catch (error) {
            console.error('❌ Ошибка проверки готовности к увеличению:', error);
            return {
                canIncrease: false,
                reason: 'Ошибка анализа',
                error: error.message
            };
        }
    }

    /**
     * Получение следующего уровня капитала
     */
    getNextCapitalLevel() {
        const levels = Object.keys(this.capitalLevels);
        const currentIndex = levels.indexOf(this.currentCapitalLevel);
        
        if (currentIndex < levels.length - 1) {
            return levels[currentIndex + 1];
        }
        
        return null; // Уже на максимальном уровне
    }

    /**
     * Увеличение капитала
     */
    async increaseCapital(amount = null, reason = 'Автоматическое увеличение') {
        try {
            const validation = await this.canIncreaseCapital();
            
            if (!validation.canIncrease) {
                throw new Error(`Нельзя увеличить капитал: ${validation.reasons.join(', ')}`);
            }

            const currentCapital = await Settings.getSetting('user_max_portfolio_budget', 1000000);
            const increaseAmount = amount || (currentCapital * this.scalingSettings.capitalIncreaseStep);
            const newCapital = Math.min(
                currentCapital + increaseAmount,
                currentCapital * (1 + this.scalingSettings.maxCapitalIncrease)
            );

            // Обновляем настройки
            await Settings.setSetting('user_max_portfolio_budget', newCapital, {
                description: 'Максимальный бюджет портфеля (руб.)',
                category: 'portfolio',
                dataType: 'number'
            });

            // Обновляем уровень капитала
            await this.determineCurrentCapitalLevel();

            // Отправляем уведомление
            if (this.scalingSettings.notifyOnCapitalChange) {
                await OptimizedTelegramService.sendAlert(
                    '📈 УВЕЛИЧЕНИЕ КАПИТАЛА',
                    `Капитал увеличен с ${currentCapital.toLocaleString()} до ${newCapital.toLocaleString()} руб.\n` +
                    `Увеличение: ${((newCapital - currentCapital) / currentCapital * 100).toFixed(2)}%\n` +
                    `Причина: ${reason}\n` +
                    `Новый уровень: ${this.currentCapitalLevel}`
                );
            }

            // Записываем в историю
            await this.recordCapitalChange('increase', currentCapital, newCapital, reason, validation.analysis);

            return {
                success: true,
                oldCapital: currentCapital,
                newCapital,
                increaseAmount: newCapital - currentCapital,
                increasePercent: ((newCapital - currentCapital) / currentCapital) * 100,
                newLevel: this.currentCapitalLevel
            };

        } catch (error) {
            console.error('❌ Ошибка увеличения капитала:', error);
            
            if (this.scalingSettings.notifyOnCapitalChange) {
                await OptimizedTelegramService.sendAlert(
                    '❌ ОШИБКА УВЕЛИЧЕНИЯ КАПИТАЛА',
                    `Не удалось увеличить капитал: ${error.message}`
                );
            }
            
            throw error;
        }
    }

    /**
     * Снижение капитала
     */
    async decreaseCapital(amount = null, reason = 'Автоматическое снижение') {
        try {
            const currentCapital = await Settings.getSetting('user_max_portfolio_budget', 1000000);
            const decreaseAmount = amount || (currentCapital * this.scalingSettings.capitalDecreaseStep);
            const newCapital = Math.max(
                currentCapital - decreaseAmount,
                currentCapital * (1 - this.scalingSettings.maxCapitalDecrease)
            );

            // Обновляем настройки
            await Settings.setSetting('user_max_portfolio_budget', newCapital, {
                description: 'Максимальный бюджет портфеля (руб.)',
                category: 'portfolio',
                dataType: 'number'
            });

            // Обновляем уровень капитала
            await this.determineCurrentCapitalLevel();

            // Отправляем уведомление
            if (this.scalingSettings.notifyOnCapitalChange) {
                await OptimizedTelegramService.sendAlert(
                    '📉 СНИЖЕНИЕ КАПИТАЛА',
                    `Капитал снижен с ${currentCapital.toLocaleString()} до ${newCapital.toLocaleString()} руб.\n` +
                    `Снижение: ${((currentCapital - newCapital) / currentCapital * 100).toFixed(2)}%\n` +
                    `Причина: ${reason}\n` +
                    `Новый уровень: ${this.currentCapitalLevel}`
                );
            }

            // Записываем в историю
            await this.recordCapitalChange('decrease', currentCapital, newCapital, reason);

            return {
                success: true,
                oldCapital: currentCapital,
                newCapital,
                decreaseAmount: currentCapital - newCapital,
                decreasePercent: ((currentCapital - newCapital) / currentCapital) * 100,
                newLevel: this.currentCapitalLevel
            };

        } catch (error) {
            console.error('❌ Ошибка снижения капитала:', error);
            
            if (this.scalingSettings.notifyOnCapitalChange) {
                await OptimizedTelegramService.sendAlert(
                    '❌ ОШИБКА СНИЖЕНИЯ КАПИТАЛА',
                    `Не удалось снизить капитал: ${error.message}`
                );
            }
            
            throw error;
        }
    }

    /**
     * Запись изменения капитала в историю
     */
    async recordCapitalChange(type, oldCapital, newCapital, reason, analysis = null) {
        try {
            const change = {
                type, // 'increase' или 'decrease'
                oldCapital,
                newCapital,
                changeAmount: newCapital - oldCapital,
                changePercent: ((newCapital - oldCapital) / oldCapital) * 100,
                reason,
                timestamp: new Date(),
                analysis: analysis ? {
                    profitPercent: analysis.metrics?.profitPercent || 0,
                    winRate: analysis.metrics?.winRate || 0,
                    maxDrawdown: analysis.metrics?.maxDrawdown || 0,
                    totalTrades: analysis.metrics?.totalTrades || 0
                } : null
            };

            // Сохраняем в настройки как историю
            const history = await Settings.getSetting('capital_scaling_history', []);
            history.unshift(change);
            
            // Оставляем только последние 100 записей
            if (history.length > 100) {
                history.splice(100);
            }

            await Settings.setSetting('capital_scaling_history', history, {
                description: 'История изменений капитала',
                category: 'scaling',
                dataType: 'json'
            });

        } catch (error) {
            console.error('❌ Ошибка записи изменения капитала:', error);
        }
    }

    /**
     * Автоматическая корректировка капитала
     */
    async autoAdjustCapital() {
        try {
            if (!this.scalingSettings.autoScalingEnabled) {
                return { adjusted: false, reason: 'Автоматическое масштабирование отключено' };
            }

            const validation = await this.canIncreaseCapital();
            
            if (validation.canIncrease) {
                // Проверяем, можно ли увеличить автоматически
                const currentCapital = await Settings.getSetting('user_max_portfolio_budget', 1000000);
                const maxAutoIncrease = currentCapital * this.scalingSettings.maxAutoIncrease;
                const suggestedIncrease = currentCapital * this.scalingSettings.capitalIncreaseStep;
                
                if (suggestedIncrease <= maxAutoIncrease) {
                    return await this.increaseCapital(suggestedIncrease, 'Автоматическое увеличение');
                } else {
                    return { 
                        adjusted: false, 
                        reason: 'Требуется ручное подтверждение для увеличения',
                        suggestedIncrease,
                        maxAutoIncrease
                    };
                }
            } else {
                // Проверяем, нужно ли снизить капитал
                const analysis = validation.analysis;
                if (analysis && analysis.metrics) {
                    const { maxDrawdown, profitPercent } = analysis.metrics;
                    
                    if (maxDrawdown > this.scalingSettings.maxDrawdownThreshold * 1.5 || 
                        profitPercent < -this.scalingSettings.minProfitabilityThreshold * 100) {
                        
                        const currentCapital = await Settings.getSetting('user_max_portfolio_budget', 1000000);
                        const decreaseAmount = currentCapital * this.scalingSettings.capitalDecreaseStep;
                        
                        return await this.decreaseCapital(decreaseAmount, 'Автоматическое снижение из-за плохих результатов');
                    }
                }
            }

            return { adjusted: false, reason: 'Корректировка не требуется' };

        } catch (error) {
            console.error('❌ Ошибка автоматической корректировки:', error);
            return { adjusted: false, error: error.message };
        }
    }

    /**
     * Получение статуса сервиса
     */
    async getStatus() {
        try {
            const analysis = await this.analyzePerformance();
            const validation = await this.canIncreaseCapital();
            const currentCapital = await Settings.getSetting('user_max_portfolio_budget', 1000000);
            
            return {
                isInitialized: this.isInitialized,
                currentCapitalLevel: this.currentCapitalLevel,
                currentCapital,
                nextLevel: this.getNextCapitalLevel(),
                canIncrease: validation.canIncrease,
                reasons: validation.reasons || [],
                analysis: analysis.metrics || {},
                settings: this.scalingSettings,
                historyCount: this.performanceHistory.length
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
     * Получение истории изменений капитала
     */
    async getCapitalHistory(limit = 50) {
        try {
            const history = await Settings.getSetting('capital_scaling_history', []);
            return history.slice(0, limit);
        } catch (error) {
            console.error('❌ Ошибка получения истории капитала:', error);
            return [];
        }
    }

    /**
     * Обновление настроек масштабирования
     */
    async updateScalingSettings(newSettings) {
        try {
            for (const [key, value] of Object.entries(newSettings)) {
                await Settings.setSetting(`scaling_${key}`, value, {
                    description: `Настройка масштабирования: ${key}`,
                    category: 'scaling',
                    dataType: typeof value === 'number' ? 'number' : 'boolean'
                });
            }

            await this.loadScalingSettings();
            
            return { success: true, message: 'Настройки обновлены' };

        } catch (error) {
            console.error('❌ Ошибка обновления настроек:', error);
            throw error;
        }
    }

    /**
     * Обновление уровней капитала
     */
    async updateCapitalLevels(newLevels) {
        try {
            // Валидация уровней капитала
            const validatedLevels = this.validateCapitalLevels(newLevels);
            
            // Сохраняем в настройки
            await Settings.setSetting('scaling_capital_levels', validatedLevels, {
                description: 'Уровни капитала для масштабирования',
                category: 'scaling',
                dataType: 'json'
            });

            // Перезагружаем уровни
            await this.loadCapitalLevels();
            
            return { 
                success: true, 
                message: 'Уровни капитала обновлены',
                levels: this.capitalLevels
            };

        } catch (error) {
            console.error('❌ Ошибка обновления уровней капитала:', error);
            throw error;
        }
    }

    /**
     * Валидация уровней капитала
     */
    validateCapitalLevels(levels) {
        const validated = {};
        const levelNames = Object.keys(levels);
        
        // Проверяем, что есть хотя бы один уровень
        if (levelNames.length === 0) {
            throw new Error('Должен быть хотя бы один уровень капитала');
        }

        // Сортируем уровни по минимальному значению
        const sortedLevels = levelNames.sort((a, b) => levels[a].min - levels[b].min);
        
        for (let i = 0; i < sortedLevels.length; i++) {
            const levelName = sortedLevels[i];
            const level = levels[levelName];
            
            // Проверяем обязательные поля
            if (typeof level.min !== 'number' || typeof level.max !== 'number' || typeof level.multiplier !== 'number') {
                throw new Error(`Уровень ${levelName} должен содержать min, max и multiplier как числа`);
            }
            
            // Проверяем логику min < max
            if (level.min >= level.max) {
                throw new Error(`Уровень ${levelName}: min (${level.min}) должен быть меньше max (${level.max})`);
            }
            
            // Проверяем, что уровни не пересекаются
            if (i > 0) {
                const prevLevel = validated[sortedLevels[i-1]];
                if (level.min <= prevLevel.max) {
                    throw new Error(`Уровень ${levelName}: min (${level.min}) должен быть больше max предыдущего уровня (${prevLevel.max})`);
                }
            }
            
            // Проверяем разумные значения
            if (level.min < 0 || level.max < 0) {
                throw new Error(`Уровень ${levelName}: min и max должны быть положительными`);
            }
            
            if (level.multiplier < 0.1 || level.multiplier > 10) {
                throw new Error(`Уровень ${levelName}: multiplier должен быть между 0.1 и 10`);
            }
            
            validated[levelName] = {
                min: level.min,
                max: level.max,
                multiplier: level.multiplier,
                name: level.name || levelName
            };
        }
        
        return validated;
    }

    /**
     * Получение информации об уровнях капитала
     */
    getCapitalLevelsInfo() {
        return {
            levels: this.capitalLevels,
            currentLevel: this.currentCapitalLevel,
            nextLevel: this.getNextCapitalLevel(),
            totalLevels: Object.keys(this.capitalLevels).length
        };
    }
}

export default new CapitalScalingService();
