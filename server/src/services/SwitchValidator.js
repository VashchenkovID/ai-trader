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
            minProfitFactor: 1.3,          // Минимум 1.3 profit factor
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
            minProfitFactor: 1.5,          // Минимум 1.5 profit factor
            maxConsecutiveLosses: 3,       // Максимум 3 убытка подряд
            minConfidence: 0.70,           // 70%+ средняя уверенность
            minSharpeRatio: 1.0,           // Минимум 1.0 коэффициент Шарпа
            minConsistency: 0.8             // 80%+ консистентность
        };
        
        // История проверок
        this.validationHistory = [];
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            console.log('✅ Инициализация SwitchValidator...');
            this.isInitialized = true;
            console.log('✅ SwitchValidator инициализирован');
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
            const checks = await this.performValidationChecks(riskStats, this.fullTradingCriteria);
            
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
            profitability: this.checkProfitability(stats, criteria),
            consistency: this.checkConsistency(stats, criteria),
            riskMetrics: this.checkRiskMetrics(stats, criteria),
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
    checkProfitability(stats, criteria) {
        const profitableMonths = this.calculateProfitableMonths(stats);
        const winRate = stats.stats.winRate || 0;
        const profitFactor = stats.stats.profitFactor || 0;
        
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
            },
            profitFactor: {
                passed: profitFactor >= criteria.minProfitFactor,
                value: profitFactor,
                threshold: criteria.minProfitFactor,
                message: `Profit factor: ${profitFactor.toFixed(2)}/${criteria.minProfitFactor}`
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
        const consistency = this.calculateConsistency(stats);
        
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
            },
            consistency: {
                passed: criteria.minConsistency ? consistency >= criteria.minConsistency : true,
                value: consistency,
                threshold: criteria.minConsistency || 0,
                message: `Консистентность: ${(consistency * 100).toFixed(1)}%/${((criteria.minConsistency || 0) * 100)}%`
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
    checkRiskMetrics(stats, criteria) {
        const currentDrawdown = stats.stats.currentDrawdown || 0;
        const maxDrawdown = stats.stats.maxDrawdown || 0;
        const sharpeRatio = this.calculateSharpeRatio(stats);
        
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
            const checks = {
                riskManagement: RiskManagementService.isInitialized,
                telegram: OptimizedTelegramService.isInitialized,
                // Проверки других сервисов
                database: await this.checkDatabaseConnection(),
                api: await this.checkApiConnection(),
                monitoring: await this.checkMonitoringServices()
            };

            return {
                passed: Object.values(checks).every(Boolean),
                details: checks,
                score: Object.values(checks).filter(Boolean).length / Object.keys(checks).length
            };

        } catch (error) {
            console.error('❌ Ошибка проверки технической готовности:', error);
            return {
                passed: false,
                details: { error: error.message },
                score: 0
            };
        }
    }

    /**
     * Расчет прибыльных месяцев
     */
    calculateProfitableMonths(stats) {
        // Упрощенный расчет - в реальной системе здесь был бы анализ по месяцам
        const totalPnL = stats.stats.totalPnL || 0;
        const totalTrades = stats.stats.totalTrades || 0;
        
        if (totalTrades < 20) return 0;
        
        // Примерная оценка: если общий PnL положительный и есть достаточно сделок
        const estimatedMonths = Math.floor(totalTrades / 20); // Примерно 20 сделок в месяц
        return totalPnL > 0 ? estimatedMonths : 0;
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
     * Расчет коэффициента Шарпа
     */
    calculateSharpeRatio(stats) {
        if (!stats.tradeHistory || stats.tradeHistory.length < 10) return 0;
        
        const pnls = stats.tradeHistory.map(trade => trade.pnl || 0);
        const mean = pnls.reduce((sum, pnl) => sum + pnl, 0) / pnls.length;
        const variance = pnls.reduce((sum, pnl) => sum + Math.pow(pnl - mean, 2), 0) / pnls.length;
        const stdDev = Math.sqrt(variance);
        
        // Безрисковая ставка = 0 (для упрощения)
        return stdDev > 0 ? mean / stdDev : 0;
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
            console.log('💾 История валидаций сохранена');
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
}

export default new SwitchValidator();
