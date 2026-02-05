import RiskManagementService from './RiskManagementService.js';
import OptimizedTelegramService from './OptimizedTelegramService.js';

/**
 * Сервис валидации перехода между торговыми режимами
 * Проверяет готовность системы к переходу от бумажной торговли к реальной
 */
class SwitchValidator {
    constructor() {
        this.isInitialized = false;
        
        // Критерии для перехода к микро-капиталу
        this.microCapitalCriteria = {
            minProfitableMonths: 2,        // Минимум 2 прибыльных месяца
            minWinRate: 0.55,              // 55%+ win rate
            maxDrawdown: 0.12,             // Максимум 12% просадка
            minTotalTrades: 50,            // Минимум 50 сделок
            maxConsecutiveLosses: 4,       // Максимум 4 убытка подряд
            minConfidence: 0.65,           // 65%+ средняя уверенность
            minSharpeRatio: 0.8            // Минимум 0.8 коэффициент Шарпа
        };
        
        // Критерии для перехода к полной торговле
        this.fullTradingCriteria = {
            minProfitableMonths: 3,        // Минимум 3 прибыльных месяца
            minWinRate: 0.60,              // 60%+ win rate
            maxDrawdown: 0.10,             // Максимум 10% просадка
            minTotalTrades: 100,           // Минимум 100 сделок
            maxConsecutiveLosses: 3,       // Максимум 3 убытка подряд
            minConfidence: 0.70,           // 70%+ средняя уверенность
            minSharpeRatio: 1.0            // Минимум 1.0 коэффициент Шарпа
        };
        
        // История проверок
        this.validationHistory = [];
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            this.isInitialized = true;
        } catch (error) {
            console.error('❌ Ошибка инициализации SwitchValidator:', error);
            throw error;
        }
    }

    /**
     * Проверка готовности к переходу к микро-капиталу
     */
    async canSwitchToMicro() {
        if (!this.isInitialized) {
            throw new Error('SwitchValidator не инициализирован');
        }

        try {
            const riskStats = RiskManagementService.getDetailedStats();
            // Обновляем win rate из актуальных данных портфеля
            await this.updateStatsFromPortfolio(riskStats);
            const checks = await this.performValidationChecks(riskStats, this.microCapitalCriteria);
            
            const validation = {
                canSwitch: checks.allPassed,
                targetMode: 'micro',
                criteria: this.microCapitalCriteria,
                checks: checks,
                recommendations: this.getRecommendations(checks),
                timestamp: new Date().toISOString()
            };

            this.validationHistory.push(validation);
            await this.saveValidationHistory();
            
            return validation;

        } catch (error) {
            console.error('❌ Ошибка проверки перехода к микро-капиталу:', error);
            throw error;
        }
    }

    /**
     * Проверка готовности к переходу к полной торговле
     */
    async canSwitchToFull() {
        if (!this.isInitialized) {
            throw new Error('SwitchValidator не инициализирован');
        }

        try {
            const riskStats = RiskManagementService.getDetailedStats();
            // Обновляем win rate из актуальных данных портфеля
            await this.updateStatsFromPortfolio(riskStats);
            const checks = await this.performValidationChecks(riskStats, this.fullTradingCriteria);
            
            // Логируем обновленные данные для отладки
            const LoggerService = (await import('./LoggerService.js')).default;
            if (LoggerService && LoggerService.isInitialized) {
                LoggerService.debug('SwitchValidator.canSwitchToFull: обновленные данные', {
                    service: 'SwitchValidator',
                    operation: 'canSwitchToFull',
                    stats: {
                        winRate: riskStats.stats.winRate,
                        totalTrades: riskStats.stats.totalTrades,
                        sharpeRatio: riskStats.stats.sharpeRatio,
                        profitFactor: riskStats.stats.profitFactor,
                        maxDrawdown: riskStats.stats.maxDrawdown,
                        totalPnL: riskStats.stats.totalPnL
                    },
                    checks: {
                        profitability: checks.profitability?.details,
                        consistency: checks.consistency?.details,
                        riskMetrics: checks.riskMetrics?.details
                    }
                });
            }
            
            const validation = {
                canSwitch: checks.allPassed,
                targetMode: 'full',
                criteria: this.fullTradingCriteria,
                checks: checks,
                recommendations: this.getRecommendations(checks),
                timestamp: new Date().toISOString()
            };

            this.validationHistory.push(validation);
            await this.saveValidationHistory();
            
            return validation;

        } catch (error) {
            console.error('❌ Ошибка проверки перехода к полной торговле:', error);
            throw error;
        }
    }

    /**
     * Выполнение всех проверок валидации
     */
    async performValidationChecks(stats, criteria) {
        const checks = {
            profitability: await this.checkProfitability(stats, criteria),
            consistency: this.checkConsistency(stats, criteria),
            riskMetrics: await this.checkRiskMetrics(stats, criteria),
            technicalReadiness: await this.checkTechnicalReadiness(),
            allPassed: false
        };

        checks.allPassed = Object.values(checks).every(check => 
            typeof check === 'boolean' ? check : check.passed
        );

        return checks;
    }

    /**
     * Проверка прибыльности
     */
    async checkProfitability(stats, criteria) {
        const profitableMonths = await this.calculateProfitableMonths(stats);
        // Используем обновленный win rate из портфеля
        const winRate = stats.stats.winRate !== undefined && stats.stats.winRate !== null 
            ? stats.stats.winRate 
            : 0;
        
        const checks = {
            profitableMonths: {
                passed: profitableMonths >= criteria.minProfitableMonths,
                value: profitableMonths,
                threshold: criteria.minProfitableMonths,
                message: `Прибыльных месяцев: ${profitableMonths}/${criteria.minProfitableMonths}`
            },
            winRate: {
                passed: winRate >= criteria.minWinRate,
                value: winRate,
                threshold: criteria.minWinRate,
                message: `Win rate: ${(winRate * 100).toFixed(1)}%/${(criteria.minWinRate * 100)}%`
            }
        };

        return {
            passed: Object.values(checks).every(check => check.passed),
            details: checks,
            score: Object.values(checks).filter(check => check.passed).length / Object.keys(checks).length
        };
    }

    /**
     * Проверка консистентности
     */
    checkConsistency(stats, criteria) {
        const totalTrades = stats.stats.totalTrades || 0;
        const consecutiveLosses = stats.stats.consecutiveLosses || 0;
        const averageConfidence = this.calculateAverageConfidence(stats);
        
        const checks = {
            totalTrades: {
                passed: totalTrades >= criteria.minTotalTrades,
                value: totalTrades,
                threshold: criteria.minTotalTrades,
                message: `Всего сделок: ${totalTrades}/${criteria.minTotalTrades}`
            },
            consecutiveLosses: {
                passed: consecutiveLosses <= criteria.maxConsecutiveLosses,
                value: consecutiveLosses,
                threshold: criteria.maxConsecutiveLosses,
                message: `Убытков подряд: ${consecutiveLosses}/${criteria.maxConsecutiveLosses}`
            },
            confidence: {
                passed: averageConfidence >= criteria.minConfidence,
                value: averageConfidence,
                threshold: criteria.minConfidence,
                message: `Средняя уверенность: ${(averageConfidence * 100).toFixed(1)}%/${(criteria.minConfidence * 100)}%`
            }
        };

        return {
            passed: Object.values(checks).every(check => check.passed),
            details: checks,
            score: Object.values(checks).filter(check => check.passed).length / Object.keys(checks).length
        };
    }

    /**
     * Проверка рисков
     */
    async checkRiskMetrics(stats, criteria) {
        const currentDrawdown = stats.stats.currentDrawdown || 0;
        const maxDrawdown = stats.stats.maxDrawdown || 0;
        // Используем sharpeRatio из обновленных данных портфеля, если доступен
        const sharpeRatio = (stats.stats.sharpeRatio !== undefined && stats.stats.sharpeRatio !== null && !isNaN(stats.stats.sharpeRatio)) 
            ? stats.stats.sharpeRatio 
            : await this.calculateSharpeRatio(stats);
        
        const checks = {
            currentDrawdown: {
                passed: currentDrawdown <= criteria.maxDrawdown,
                value: currentDrawdown,
                threshold: criteria.maxDrawdown,
                message: `Текущая просадка: ${(currentDrawdown * 100).toFixed(1)}%/${(criteria.maxDrawdown * 100)}%`
            },
            maxDrawdown: {
                passed: maxDrawdown <= criteria.maxDrawdown,
                value: maxDrawdown,
                threshold: criteria.maxDrawdown,
                message: `Максимальная просадка: ${(maxDrawdown * 100).toFixed(1)}%/${(criteria.maxDrawdown * 100)}%`
            },
            sharpeRatio: {
                passed: sharpeRatio >= criteria.minSharpeRatio,
                value: sharpeRatio,
                threshold: criteria.minSharpeRatio,
                message: `Коэффициент Шарпа: ${sharpeRatio.toFixed(2)}/${criteria.minSharpeRatio}`
            }
        };

        return {
            passed: Object.values(checks).every(check => check.passed),
            details: checks,
            score: Object.values(checks).filter(check => check.passed).length / Object.keys(checks).length
        };
    }

    /**
     * Проверка технической готовности
     */
    async checkTechnicalReadiness() {
        try {
            // Проверяем доступность всех необходимых сервисов
            const riskManagementInitialized = RiskManagementService.isInitialized;
            const telegramInitialized = OptimizedTelegramService.isInitialized;
            const databaseConnected = await this.checkDatabaseConnection();
            const apiConnected = await this.checkApiConnection();
            const monitoringActive = await this.checkMonitoringServices();
            
            // Формируем детализированные проверки с value и threshold
            const checks = {
                riskManagement: {
                    passed: riskManagementInitialized,
                    value: riskManagementInitialized ? 1 : 0,
                    threshold: 1,
                    message: `Risk Management Service: ${riskManagementInitialized ? 'Инициализирован' : 'Не инициализирован'}`
                },
                telegram: {
                    passed: telegramInitialized,
                    value: telegramInitialized ? 1 : 0,
                    threshold: 1,
                    message: `Telegram Service: ${telegramInitialized ? 'Инициализирован' : 'Не инициализирован'}`
                },
                database: {
                    passed: databaseConnected,
                    value: databaseConnected ? 1 : 0,
                    threshold: 1,
                    message: `Database: ${databaseConnected ? 'Подключена' : 'Не подключена'}`
                },
                api: {
                    passed: apiConnected,
                    value: apiConnected ? 1 : 0,
                    threshold: 1,
                    message: `API: ${apiConnected ? 'Доступен' : 'Не доступен'}`
                },
                monitoring: {
                    passed: monitoringActive,
                    value: monitoringActive ? 1 : 0,
                    threshold: 1,
                    message: `Monitoring: ${monitoringActive ? 'Активен' : 'Не активен'}`
                }
            };

            return {
                passed: Object.values(checks).every(check => check.passed),
                details: checks,
                score: Object.values(checks).filter(check => check.passed).length / Object.keys(checks).length
            };

        } catch (error) {
            console.error('❌ Ошибка проверки технической готовности:', error);
            return {
                passed: false,
                details: { 
                    error: {
                        passed: false,
                        value: 0,
                        threshold: 1,
                        message: `Ошибка: ${error.message}`
                    }
                },
                score: 0
            };
        }
    }

    /**
     * Расчет прибыльных месяцев из закрытых сделок
     */
    async calculateProfitableMonths(stats) {
        try {
            // Получаем закрытые сделки из портфеля
            const TradingEngine = (await import('./TradingEngine.js')).default;
            const PnLCalculationService = (await import('./PnLCalculationService.js')).default;
            const portfolio = await TradingEngine.getPortfolioValue();
            
            if (!portfolio) return 0;
            
            const closedTrades = await PnLCalculationService.getClosedTrades(portfolio?.mode || 'paper');
            
            if (closedTrades.length === 0) return 0;
            
            // Группируем сделки по месяцам
            const monthlyPnL = new Map(); // key: "YYYY-MM", value: {totalPnL, count}
            
            for (const trade of closedTrades) {
                const tradeDate = new Date(trade.executedAt || trade.exitDate || trade.timestamp);
                const monthKey = `${tradeDate.getFullYear()}-${String(tradeDate.getMonth() + 1).padStart(2, '0')}`;
                
                const pnl = trade.realizedProfit || 0;
                
                if (!monthlyPnL.has(monthKey)) {
                    monthlyPnL.set(monthKey, { totalPnL: 0, count: 0 });
                }
                
                const monthData = monthlyPnL.get(monthKey);
                monthData.totalPnL += pnl;
                monthData.count += 1;
            }
            
            // Считаем прибыльные месяцы (месяцы с положительным PnL)
            let profitableMonths = 0;
            for (const [monthKey, monthData] of monthlyPnL.entries()) {
                if (monthData.totalPnL > 0 && monthData.count > 0) {
                    profitableMonths++;
                }
            }
            
            return profitableMonths;
        } catch (error) {
            console.warn('⚠️ Ошибка расчета прибыльных месяцев:', error.message);
            // Fallback на упрощенный расчет
            const totalPnL = stats.stats.totalPnL || 0;
            const totalTrades = stats.stats.totalTrades || 0;
            if (totalTrades < 20) return 0;
            const estimatedMonths = Math.floor(totalTrades / 20);
            return totalPnL > 0 ? estimatedMonths : 0;
        }
    }

    /**
     * Расчет средней уверенности
     */
    calculateAverageConfidence(stats) {
        if (!stats.tradeHistory || stats.tradeHistory.length === 0) return 0;
        
        const totalConfidence = stats.tradeHistory.reduce((sum, trade) => 
            sum + (trade.confidence || 0.5), 0
        );
        
        return totalConfidence / stats.tradeHistory.length;
    }

    /**
     * Расчет консистентности (стабильность результатов)
     */
    calculateConsistency(stats) {
        if (!stats.tradeHistory || stats.tradeHistory.length < 10) return 0;
        
        // Анализируем последние 20 сделок
        const recentTrades = stats.tradeHistory.slice(-20);
        const pnls = recentTrades.map(trade => trade.pnl || 0);
        
        // Рассчитываем коэффициент вариации
        const mean = pnls.reduce((sum, pnl) => sum + pnl, 0) / pnls.length;
        const variance = pnls.reduce((sum, pnl) => sum + Math.pow(pnl - mean, 2), 0) / pnls.length;
        const stdDev = Math.sqrt(variance);
        
        // Консистентность = 1 - (стандартное отклонение / среднее значение)
        return mean !== 0 ? Math.max(0, 1 - (stdDev / Math.abs(mean))) : 0;
    }

    /**
     * Расчет коэффициента Шарпа из закрытых сделок
     */
    async calculateSharpeRatio(stats) {
        try {
            // Используем единую функцию из PnLCalculationService
            const TradingEngine = (await import('./TradingEngine.js')).default;
            const PnLCalculationService = (await import('./PnLCalculationService.js')).default;
            const portfolio = await TradingEngine.getPortfolioValue();
            
            if (!portfolio) {
                // Fallback на tradeHistory если нет портфеля
                if (!stats.tradeHistory || stats.tradeHistory.length < 10) return 0;
                const pnls = stats.tradeHistory.map(trade => trade.pnl || 0);
                const mean = pnls.reduce((sum, pnl) => sum + pnl, 0) / pnls.length;
                const variance = pnls.reduce((sum, pnl) => sum + Math.pow(pnl - mean, 2), 0) / pnls.length;
                const stdDev = Math.sqrt(variance);
                return stdDev > 0 ? mean / stdDev : 0;
            }
            
            const closedTrades = await PnLCalculationService.getClosedTrades(portfolio?.mode || 'paper');
            const initialCapital = portfolio?.initialCapital || 1000000;
            
            if (closedTrades.length < 2) return 0;
            
            // getClosedTrades теперь возвращает сделки с полем pnl, можно использовать напрямую
            const metrics = PnLCalculationService.calculateMetricsFromClosedTrades(closedTrades, initialCapital);
            return metrics.sharpeRatio || 0;
        } catch (error) {
            console.warn('⚠️ Ошибка расчета Sharpe Ratio:', error.message);
            // Fallback на tradeHistory
            if (!stats.tradeHistory || stats.tradeHistory.length < 10) return 0;
            const pnls = stats.tradeHistory.map(trade => trade.pnl || 0);
            const mean = pnls.reduce((sum, pnl) => sum + pnl, 0) / pnls.length;
            const variance = pnls.reduce((sum, pnl) => sum + Math.pow(pnl - mean, 2), 0) / pnls.length;
            const stdDev = Math.sqrt(variance);
            return stdDev > 0 ? mean / stdDev : 0;
        }
    }

    /**
     * Получение рекомендаций по улучшению
     */
    getRecommendations(checks) {
        const recommendations = [];
        
        // Анализируем каждую категорию проверок
        Object.entries(checks).forEach(([category, check]) => {
            if (category === 'allPassed') return;
            
            if (!check.passed) {
                if (category === 'profitability') {
                    recommendations.push({
                        category: 'Прибыльность',
                        priority: 'high',
                        actions: [
                            'Увеличьте количество сделок',
                            'Улучшите точность прогнозов',
                            'Оптимизируйте размеры позиций'
                        ]
                    });
                } else if (category === 'consistency') {
                    recommendations.push({
                        category: 'Консистентность',
                        priority: 'medium',
                        actions: [
                            'Снизьте волатильность результатов',
                            'Улучшите риск-менеджмент',
                            'Проверьте качество данных'
                        ]
                    });
                } else if (category === 'riskMetrics') {
                    recommendations.push({
                        category: 'Управление рисками',
                        priority: 'high',
                        actions: [
                            'Снизьте максимальную просадку',
                            'Улучшите стоп-лоссы',
                            'Оптимизируйте размеры позиций'
                        ]
                    });
                } else if (category === 'technicalReadiness') {
                    recommendations.push({
                        category: 'Техническая готовность',
                        priority: 'critical',
                        actions: [
                            'Проверьте все сервисы',
                            'Убедитесь в стабильности системы',
                            'Проведите тестирование'
                        ]
                    });
                }
            }
        });
        
        return recommendations;
    }

    /**
     * Получение статуса валидации
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            lastValidation: this.validationHistory[this.validationHistory.length - 1] || null,
            totalValidations: this.validationHistory.length
        };
    }

    /**
     * Получение истории валидаций
     */
    getValidationHistory() {
        return this.validationHistory;
    }

    /**
     * Сохранение истории валидаций
     */
    async saveValidationHistory() {
        try {
            // В реальной системе здесь было бы сохранение в БД
        } catch (error) {
            console.error('❌ Ошибка сохранения истории валидаций:', error);
        }
    }

    /**
     * Отправка уведомления о готовности к переходу
     */
    async notifyReadiness(validation) {
        try {
            if (validation.canSwitch) {
                const message = `🎉 СИСТЕМА ГОТОВА К ПЕРЕХОДУ!\n\n` +
                              `Режим: ${validation.targetMode.toUpperCase()}\n` +
                              `Дата проверки: ${new Date(validation.timestamp).toLocaleString()}\n\n` +
                              `✅ Все критерии выполнены\n` +
                              `📊 Детали: ${JSON.stringify(validation.checks, null, 2)}`;
                
                await OptimizedTelegramService.sendAlert(message);
            } else {
                const message = `⚠️ СИСТЕМА НЕ ГОТОВА К ПЕРЕХОДУ\n\n` +
                              `Режим: ${validation.targetMode.toUpperCase()}\n` +
                              `Дата проверки: ${new Date(validation.timestamp).toLocaleString()}\n\n` +
                              `❌ Не выполнены критерии:\n` +
                              `${validation.recommendations.map(rec => `• ${rec.category}`).join('\n')}`;
                
                await OptimizedTelegramService.sendAlert(message);
            }
        } catch (error) {
            console.error('❌ Ошибка отправки уведомления:', error);
        }
    }

    /**
     * Проверка подключения к базе данных
     */
    async checkDatabaseConnection() {
        try {
            const Settings = (await import('../models/Settings.js')).default;
            const sequelize = Settings.sequelize;
            
            // Проверяем состояние соединения
            if (sequelize.connectionManager.pool && sequelize.connectionManager.pool._draining) {
                console.warn('⚠️ Database connection is closing, skipping check');
                return false;
            }
            
            await Settings.findOne({ limit: 1 });
            return true;
        } catch (error) {
            console.error('❌ Ошибка проверки БД:', error);
            return false;
        }
    }

    /**
     * Проверка подключения к API
     */
    async checkApiConnection() {
        try {
            const TinkoffApiService = (await import('./TinkoffApiService.js')).default;
            // Простая проверка доступности API
            return TinkoffApiService.token && TinkoffApiService.token !== 't.1234567890abcdef';
        } catch (error) {
            console.error('❌ Ошибка проверки API:', error);
            return false;
        }
    }

    /**
     * Проверка сервисов мониторинга
     */
    async checkMonitoringServices() {
        try {
            // Проверяем доступность WebSocket и других сервисов мониторинга
            const WebSocketService = (await import('./WebSocketService.js')).default;
            return WebSocketService.isInitialized || true; // WebSocket может быть не обязательным
        } catch (error) {
            console.error('❌ Ошибка проверки мониторинга:', error);
            return false;
        }
    }

    /**
     * Обновление статистики из актуальных данных портфеля
     */
    async updateStatsFromPortfolio(riskStats) {
        try {
            const TradingEngine = (await import('./TradingEngine.js')).default;
            const portfolio = await TradingEngine.getPortfolioValue();
            const trades = portfolio?.trades || [];
            const rawPositions = portfolio?.positions || {};
            
            // Рассчитываем позиции и P&L из портфеля (как в /api/portfolio)
            const { calculatePositionsWithStrategies, calculatePnLFromPositions } = await import('../utils/portfolioPositionsCalculator.js');
            const positionsByFigi = await calculatePositionsWithStrategies(portfolio, rawPositions, trades);
            const pnlResult = await calculatePnLFromPositions(portfolio, positionsByFigi, rawPositions);
            
            // Обновляем win rate из актуальных данных портфеля
            // Win rate должен рассчитываться только при достаточном количестве сделок
            if (pnlResult.winRate !== undefined && pnlResult.winRate !== null && pnlResult.totalTrades >= 3) {
                // winRate уже в диапазоне 0-1 из calculatePnLFromPositions
                riskStats.stats.winRate = pnlResult.winRate;
            } else if (pnlResult.totalTrades < 3) {
                // При малом количестве сделок win rate не считается надежным
                riskStats.stats.winRate = 0;
            }
            
            // Обновляем totalTrades из актуальных данных
            if (pnlResult.totalTrades !== undefined && pnlResult.totalTrades !== null) {
                riskStats.stats.totalTrades = pnlResult.totalTrades;
            }
            
            // Обновляем Sharpe ratio используя единый метод расчета из PnLCalculationService
            // Это обеспечивает синхронизацию с дашбордом производительности
            try {
                const PnLCalculationService = (await import('./PnLCalculationService.js')).default;
                const closedTrades = await PnLCalculationService.getClosedTrades(portfolio?.mode || 'paper');
                const initialCapital = portfolio?.initialCapital || 1000000;
                
                if (closedTrades.length > 0) {
                    // getClosedTrades теперь возвращает сделки с полем pnl, можно использовать напрямую
                    const metrics = PnLCalculationService.calculateMetricsFromClosedTrades(closedTrades, initialCapital);
                    if (metrics.sharpeRatio !== undefined && metrics.sharpeRatio !== null && !isNaN(metrics.sharpeRatio) && isFinite(metrics.sharpeRatio)) {
                        riskStats.stats.sharpeRatio = metrics.sharpeRatio;
                    }
                } else {
                    // Если нет закрытых сделок, используем значение из pnlResult как fallback
                    if (pnlResult.sharpeRatio !== undefined && pnlResult.sharpeRatio !== null && !isNaN(pnlResult.sharpeRatio) && isFinite(pnlResult.sharpeRatio)) {
                        riskStats.stats.sharpeRatio = pnlResult.sharpeRatio;
                    }
                }
            } catch (error) {
                console.warn('⚠️ Не удалось обновить Sharpe ratio из PnLCalculationService, используем значение из pnlResult:', error.message);
                // Fallback на значение из pnlResult
                if (pnlResult.sharpeRatio !== undefined && pnlResult.sharpeRatio !== null && !isNaN(pnlResult.sharpeRatio) && isFinite(pnlResult.sharpeRatio)) {
                    riskStats.stats.sharpeRatio = pnlResult.sharpeRatio;
                }
            }
            
            // Обновляем totalPnL
            if (pnlResult.totalPnL !== undefined && pnlResult.totalPnL !== null) {
                riskStats.stats.totalPnL = pnlResult.totalPnL;
            }
            
            // Обновляем profitFactor из актуальных данных используя единую функцию
            // Получаем закрытые сделки из PnLCalculationService
            if (pnlResult.totalTrades > 0) {
                try {
                    const PnLCalculationService = (await import('./PnLCalculationService.js')).default;
                    const closedTrades = await PnLCalculationService.getClosedTrades(portfolio?.mode || 'paper');
                    
                    if (closedTrades.length > 0) {
                        // Рассчитываем profitFactor из закрытых сделок
                        const totalWins = closedTrades
                            .filter(t => (t.realizedProfit || 0) > 0)
                            .reduce((sum, t) => sum + (t.realizedProfit || 0), 0);
                        const totalLosses = Math.abs(closedTrades
                            .filter(t => (t.realizedProfit || 0) < 0)
                            .reduce((sum, t) => sum + (t.realizedProfit || 0), 0));
                        
                        if (totalLosses > 0) {
                            riskStats.stats.profitFactor = totalWins / totalLosses;
                        } else if (totalWins > 0) {
                            riskStats.stats.profitFactor = Infinity; // Все сделки прибыльные
                        } else {
                            riskStats.stats.profitFactor = 0;
                        }
                    }
                } catch (error) {
                    console.warn('⚠️ Не удалось рассчитать profitFactor из закрытых сделок:', error.message);
                }
            }
            
            // Обновляем maxDrawdown из актуальных данных портфеля
            // Рассчитываем просадку на основе unrealizedPnL и realizedPnL
            const initialCapital = portfolio?.initialCapital || 1000000;
            if (initialCapital > 0 && pnlResult.totalPnL !== undefined) {
                const currentValue = initialCapital + pnlResult.totalPnL;
                // Просадка = (initialCapital - currentValue) / initialCapital, если currentValue < initialCapital
                if (currentValue < initialCapital) {
                    const drawdown = (initialCapital - currentValue) / initialCapital;
                    riskStats.stats.maxDrawdown = Math.max(riskStats.stats.maxDrawdown || 0, drawdown);
                    riskStats.stats.currentDrawdown = drawdown;
                } else {
                    riskStats.stats.currentDrawdown = 0;
                }
            }
            
            // Обновляем tradeHistory для расчета confidence и consistency из закрытых сделок
            try {
                const PnLCalculationService = (await import('./PnLCalculationService.js')).default;
                const closedTrades = await PnLCalculationService.getClosedTrades(portfolio?.mode || 'paper');
                
                if (closedTrades.length > 0) {
                    // Получаем confidence из TradingRequest для каждой сделки
                    const TradingRequest = (await import('../models/TradingRequest.js')).default;
                    const closedTradesForHistory = [];
                    
                    for (const trade of closedTrades) {
                        let confidence = 0.5; // По умолчанию
                        
                        // Пытаемся получить confidence из TradingRequest
                        if (trade.tradingRequestId) {
                            try {
                                const tradingRequest = await TradingRequest.findByPk(trade.tradingRequestId);
                                if (tradingRequest && tradingRequest.confidence !== undefined) {
                                    confidence = tradingRequest.confidence;
                                }
                            } catch (error) {
                                // Игнорируем ошибки получения confidence
                            }
                        }
                        
                        closedTradesForHistory.push({
                            pnl: trade.realizedProfit || 0,
                            confidence: confidence,
                            executedAt: trade.executedAt || trade.exitDate || trade.timestamp
                        });
                    }
                    
                    // Сортируем по дате
                    closedTradesForHistory.sort((a, b) => {
                        const dateA = new Date(a.executedAt || 0);
                        const dateB = new Date(b.executedAt || 0);
                        return dateA - dateB;
                    });
                    
                    // Обновляем tradeHistory (только закрытые сделки)
                    riskStats.tradeHistory = closedTradesForHistory;
                    
                    // Рассчитываем consecutiveLosses из закрытых сделок
                    let maxConsecutiveLosses = 0;
                    let currentConsecutiveLosses = 0;
                    
                    for (const trade of closedTradesForHistory) {
                        if (trade.pnl < 0) {
                            currentConsecutiveLosses++;
                            maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentConsecutiveLosses);
                        } else {
                            currentConsecutiveLosses = 0;
                        }
                    }
                    
                    // Обновляем текущие последовательные убытки (последние сделки)
                    riskStats.stats.consecutiveLosses = currentConsecutiveLosses;
                    riskStats.stats.maxConsecutiveLosses = maxConsecutiveLosses;
                }
            } catch (error) {
                console.warn('⚠️ Не удалось обновить tradeHistory из закрытых сделок:', error.message);
            }
            
            // Обновляем консистентность на основе обновленной истории сделок (даже если новых сделок не было)
            if (riskStats.tradeHistory && riskStats.tradeHistory.length > 0) {
                const consistency = this.calculateConsistency(riskStats);
                if (consistency !== undefined && !isNaN(consistency) && isFinite(consistency)) {
                    riskStats.stats.consistency = consistency;
                    try {
                        const LoggerService = (await import('./LoggerService.js')).default;
                        if (LoggerService && LoggerService.isInitialized) {
                            LoggerService.debug(`✅ Консистентность обновлена: ${(consistency * 100).toFixed(1)}% (сделок: ${riskStats.tradeHistory.length})`);
                        }
                    } catch (logError) {
                        // Игнорируем ошибки логирования
                    }
                } else {
                    // Консистентность не рассчитана
                    riskStats.stats.consistency = 0;
                }
            } else {
                // Если нет истории сделок, консистентность = 0
                riskStats.stats.consistency = 0;
            }
            
        } catch (error) {
            console.warn('⚠️ Не удалось обновить статистику из портфеля для валидации:', error.message);
            // Продолжаем с существующими данными из RiskManagementService
        }
    }
}

export default new SwitchValidator();
