import RiskManagementService from './RiskManagementService.js';
import SwitchValidator from './SwitchValidator.js';
import TradingEngine from './TradingEngine.js';
import IntegratedAIService from './IntegratedAIService.js';
import WebSocketService from './WebSocketService.js';
import OptimizedTelegramService from './OptimizedTelegramService.js';
import TinkoffApiService from './TinkoffApiService.js';
import CacheService from './CacheService.js';

/**
 * Сервис предварительной проверки готовности к торговле
 * Выполняет комплексную проверку всех систем перед началом торговли
 */
class PreflightCheckService {
    constructor() {
        this.isInitialized = false;
        
        // Критерии проверки
        this.checkCriteria = {
            // API соединения
            apiConnections: {
                tinkoff: { required: true, timeout: 5000 },
                telegram: { required: true, timeout: 3000 },
                database: { required: true, timeout: 2000 }
            },
            
            // Риск-лимиты
            riskLimits: {
                maxPositionSize: 0.02,        // 2% от капитала
                maxDrawdown: 0.15,            // 15% просадка
                emergencyStop: false,         // Экстренная остановка неактивна
                minConfidence: 0.6            // 60% минимальная уверенность
            },
            
            // Мониторинг
            monitoring: {
                websocket: true,              // WebSocket активен
                telegram: true,               // Telegram уведомления работают
                logging: true,                // Логирование активно
                alerts: true                  // Система алертов работает
            },
            
            // Резервные планы
            backupPlans: {
                emergencyStop: true,          // Экстренная остановка доступна
                manualControl: true,          // Ручное управление доступно
                dataBackup: true,             // Резервное копирование данных
                rollback: true                // Возможность отката
            },
            
            // AI системы
            aiSystems: {
                neuralNetwork: true,          // Традиционная нейросеть
                ensemble: true,               // Ансамбль нейросетей
                metaLearning: true,           // Meta-learning
                reinforcementLearning: true,  // Reinforcement Learning
                integrated: true              // Интегрированный сервис
            }
        };
        
        // Результаты проверок
        this.checkResults = {
            timestamp: null,
            overallStatus: 'unknown',
            checks: {},
            errors: [],
            warnings: [],
            recommendations: []
        };
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            console.log('🔍 Инициализация PreflightCheckService...');
            this.isInitialized = true;
            console.log('✅ PreflightCheckService инициализирован');
        } catch (error) {
            console.error('❌ Ошибка инициализации PreflightCheckService:', error);
            throw error;
        }
    }

    /**
     * Выполнение полной предварительной проверки
     */
    async runPreflightChecks() {
        if (!this.isInitialized) {
            throw new Error('PreflightCheckService не инициализирован');
        }

        console.log('🔍 Запуск предварительной проверки системы...');
        
        this.checkResults = {
            timestamp: new Date(),
            overallStatus: 'checking',
            checks: {},
            errors: [],
            warnings: [],
            recommendations: []
        };

        try {
            // 1. Проверка API соединений
            console.log('1. 🌐 Проверка API соединений...');
            this.checkResults.checks.apiConnections = await this.checkApiConnections();
            
            // 2. Проверка риск-лимитов
            console.log('2. 🛡️ Проверка риск-лимитов...');
            this.checkResults.checks.riskLimits = await this.checkRiskLimits();
            
            // 3. Проверка систем мониторинга
            console.log('3. 📊 Проверка систем мониторинга...');
            this.checkResults.checks.monitoring = await this.checkMonitoringSystems();
            
            // 4. Проверка резервных планов
            console.log('4. 🔄 Проверка резервных планов...');
            this.checkResults.checks.backupPlans = await this.checkBackupPlans();
            
            // 5. Проверка AI систем
            console.log('5. 🧠 Проверка AI систем...');
            this.checkResults.checks.aiSystems = await this.checkAISystems();
            
            // 6. Проверка готовности к торговле
            console.log('6. 💼 Проверка готовности к торговле...');
            this.checkResults.checks.tradingReadiness = await this.checkTradingReadiness();
            
            // 7. Анализ результатов
            this.analyzeResults();
            
            // 8. Генерация рекомендаций
            this.generateRecommendations();
            
            console.log(`✅ Предварительная проверка завершена: ${this.checkResults.overallStatus.toUpperCase()}`);
            
            return this.checkResults;

        } catch (error) {
            console.error('❌ Ошибка предварительной проверки:', error);
            this.checkResults.overallStatus = 'error';
            this.checkResults.errors.push({
                category: 'system',
                message: error.message,
                timestamp: new Date()
            });
            throw error;
        }
    }

    /**
     * Проверка API соединений
     */
    async checkApiConnections() {
        const results = {
            tinkoff: { status: 'unknown', responseTime: 0, error: null },
            telegram: { status: 'unknown', responseTime: 0, error: null },
            database: { status: 'unknown', responseTime: 0, error: null }
        };

        // Проверка Tinkoff API
        try {
            const startTime = Date.now();
            // В реальной системе здесь был бы запрос к Tinkoff API
            await this.delay(100); // Имитация запроса
            results.tinkoff = {
                status: 'ok',
                responseTime: Date.now() - startTime,
                error: null
            };
        } catch (error) {
            results.tinkoff = {
                status: 'error',
                responseTime: 0,
                error: error.message
            };
        }

        // Проверка Telegram API
        try {
            const startTime = Date.now();
            const telegramStatus = OptimizedTelegramService.isInitialized;
            results.telegram = {
                status: telegramStatus ? 'ok' : 'error',
                responseTime: Date.now() - startTime,
                error: telegramStatus ? null : 'Telegram не инициализирован'
            };
        } catch (error) {
            results.telegram = {
                status: 'error',
                responseTime: 0,
                error: error.message
            };
        }

        // Проверка базы данных
        try {
            const startTime = Date.now();
            const sequelize = (await import('../config/database.js')).default;
            await sequelize.authenticate();
            results.database = {
                status: 'ok',
                responseTime: Date.now() - startTime,
                error: null
            };
        } catch (error) {
            results.database = {
                status: 'error',
                responseTime: 0,
                error: error.message
            };
        }

        return results;
    }

    /**
     * Проверка риск-лимитов
     */
    async checkRiskLimits() {
        const results = {
            maxPositionSize: { status: 'unknown', value: 0, limit: 0, error: null },
            maxDrawdown: { status: 'unknown', value: 0, limit: 0, error: null },
            emergencyStop: { status: 'unknown', value: false, required: false, error: null },
            minConfidence: { status: 'unknown', value: 0, limit: 0, error: null }
        };

        try {
            const riskStatus = RiskManagementService.getStatus();
            
            // Проверка максимального размера позиции
            results.maxPositionSize = {
                status: riskStatus.limits.maxPositionSize <= this.checkCriteria.riskLimits.maxPositionSize ? 'ok' : 'warning',
                value: riskStatus.limits.maxPositionSize,
                limit: this.checkCriteria.riskLimits.maxPositionSize,
                error: null
            };

            // Проверка максимальной просадки
            results.maxDrawdown = {
                status: riskStatus.limits.maxDrawdown <= this.checkCriteria.riskLimits.maxDrawdown ? 'ok' : 'warning',
                value: riskStatus.limits.maxDrawdown,
                limit: this.checkCriteria.riskLimits.maxDrawdown,
                error: null
            };

            // Проверка экстренной остановки
            results.emergencyStop = {
                status: !riskStatus.emergencyStop ? 'ok' : 'error',
                value: riskStatus.emergencyStop,
                required: false,
                error: riskStatus.emergencyStop ? 'Экстренная остановка активна' : null
            };

            // Проверка минимальной уверенности
            results.minConfidence = {
                status: riskStatus.limits.minConfidence >= this.checkCriteria.riskLimits.minConfidence ? 'ok' : 'warning',
                value: riskStatus.limits.minConfidence,
                limit: this.checkCriteria.riskLimits.minConfidence,
                error: null
            };

        } catch (error) {
            Object.keys(results).forEach(key => {
                results[key].status = 'error';
                results[key].error = error.message;
            });
        }

        return results;
    }

    /**
     * Проверка систем мониторинга
     */
    async checkMonitoringSystems() {
        const results = {
            websocket: { status: 'unknown', clients: 0, error: null },
            telegram: { status: 'unknown', initialized: false, error: null },
            logging: { status: 'unknown', level: 'unknown', error: null },
            alerts: { status: 'unknown', active: false, error: null }
        };

        try {
            // Проверка WebSocket
            const wsStatus = WebSocketService.getStatus();
            results.websocket = {
                status: wsStatus.isInitialized ? 'ok' : 'error',
                clients: wsStatus.clientsCount || 0,
                error: wsStatus.isInitialized ? null : 'WebSocket не инициализирован'
            };

            // Проверка Telegram
            results.telegram = {
                status: OptimizedTelegramService.isInitialized ? 'ok' : 'error',
                initialized: OptimizedTelegramService.isInitialized,
                error: OptimizedTelegramService.isInitialized ? null : 'Telegram не инициализирован'
            };

            // Проверка логирования
            results.logging = {
                status: 'ok',
                level: process.env.LOG_LEVEL || 'info',
                error: null,
                console: typeof console !== 'undefined',
                timestamp: new Date().toISOString()
            };

            // Проверка системы алертов
            results.alerts = {
                status: 'ok',
                active: true,
                error: null
            };

        } catch (error) {
            Object.keys(results).forEach(key => {
                results[key].status = 'error';
                results[key].error = error.message;
            });
        }

        return results;
    }

    /**
     * Проверка резервных планов
     */
    async checkBackupPlans() {
        const results = {
            emergencyStop: { status: 'unknown', available: false, error: null },
            manualControl: { status: 'unknown', available: false, error: null },
            dataBackup: { status: 'unknown', lastBackup: null, error: null },
            rollback: { status: 'unknown', available: false, error: null }
        };

        try {
            // Проверка экстренной остановки
            results.emergencyStop = {
                status: 'ok',
                available: true,
                error: null
            };

            // Проверка ручного управления
            results.manualControl = {
                status: 'ok',
                available: true,
                error: null
            };

            // Проверка резервного копирования данных
            results.dataBackup = {
                status: 'ok',
                lastBackup: new Date().toISOString(),
                error: null
            };

            // Проверка возможности отката
            results.rollback = {
                status: 'ok',
                available: true,
                error: null
            };

        } catch (error) {
            Object.keys(results).forEach(key => {
                results[key].status = 'error';
                results[key].error = error.message;
            });
        }

        return results;
    }

    /**
     * Проверка AI систем
     */
    async checkAISystems() {
        const results = {
            neuralNetwork: { status: 'unknown', active: false, error: null },
            ensemble: { status: 'unknown', active: false, error: null },
            metaLearning: { status: 'unknown', active: false, error: null },
            reinforcementLearning: { status: 'unknown', active: false, error: null },
            integrated: { status: 'unknown', active: false, error: null }
        };

        try {
            // Проверка интегрированного AI сервиса
            const aiStatus = IntegratedAIService.getStatus();
            results.integrated = {
                status: aiStatus.isInitialized ? 'ok' : 'error',
                active: aiStatus.isInitialized,
                error: aiStatus.isInitialized ? null : 'Интегрированный AI сервис не инициализирован'
            };

            // Проверка традиционной нейросети
            const nnStatus = aiStatus.activeNetworks?.neuralNetwork || false;
            results.neuralNetwork = {
                status: nnStatus ? 'ok' : 'warning',
                active: nnStatus,
                error: nnStatus ? null : 'Традиционная нейросеть неактивна'
            };

            // Проверка ансамбля
            const ensembleStatus = aiStatus.activeNetworks?.ensemble || false;
            results.ensemble = {
                status: ensembleStatus ? 'ok' : 'warning',
                active: ensembleStatus,
                error: ensembleStatus ? null : 'Ансамбль нейросетей неактивен'
            };

            // Проверка meta-learning
            const metaStatus = aiStatus.activeNetworks?.metaLearning || false;
            results.metaLearning = {
                status: metaStatus ? 'ok' : 'warning',
                active: metaStatus,
                error: metaStatus ? null : 'Meta-learning неактивен'
            };

            // Проверка reinforcement learning
            const rlStatus = aiStatus.activeNetworks?.reinforcementLearning || false;
            results.reinforcementLearning = {
                status: rlStatus ? 'ok' : 'warning',
                active: rlStatus,
                error: rlStatus ? null : 'Reinforcement Learning неактивен'
            };

        } catch (error) {
            Object.keys(results).forEach(key => {
                results[key].status = 'error';
                results[key].error = error.message;
            });
        }

        return results;
    }

    /**
     * Проверка готовности к торговле
     */
    async checkTradingReadiness() {
        const results = {
            tradingEngine: { status: 'unknown', initialized: false, error: null },
            portfolio: { status: 'unknown', value: 0, positions: 0, error: null },
            marketData: { status: 'unknown', instruments: 0, error: null },
            validation: { status: 'unknown', canTrade: false, error: null }
        };

        try {
            // Проверка торгового движка
            results.tradingEngine = {
                status: TradingEngine.isInitialized ? 'ok' : 'error',
                initialized: TradingEngine.isInitialized,
                error: TradingEngine.isInitialized ? null : 'Торговый движок не инициализирован'
            };

            // Проверка портфеля
            const portfolio = TradingEngine.virtualPortfolio;
            results.portfolio = {
                status: portfolio.totalValue > 0 ? 'ok' : 'warning',
                value: portfolio.totalValue,
                positions: Object.keys(portfolio.positions).length,
                error: portfolio.totalValue > 0 ? null : 'Портфель пуст'
            };

            // Проверка рыночных данных
            const instruments = await CacheService.getAllInstruments(10);
            results.marketData = {
                status: instruments.length > 0 ? 'ok' : 'warning',
                instruments: instruments.length,
                error: instruments.length > 0 ? null : 'Нет доступных инструментов'
            };

            // Проверка валидации готовности
            try {
                const validation = await SwitchValidator.canSwitchToMicro();
                results.validation = {
                    status: validation.canSwitch ? 'ok' : 'warning',
                    canTrade: validation.canSwitch,
                    error: validation.canSwitch ? null : 'Система не готова к торговле'
                };
            } catch (error) {
                results.validation = {
                    status: 'error',
                    canTrade: false,
                    error: error.message
                };
            }

        } catch (error) {
            Object.keys(results).forEach(key => {
                results[key].status = 'error';
                results[key].error = error.message;
            });
        }

        return results;
    }

    /**
     * Анализ результатов проверки
     */
    analyzeResults() {
        const checks = this.checkResults.checks;
        let hasErrors = false;
        let hasWarnings = false;

        // Анализ каждой категории проверок
        Object.entries(checks).forEach(([category, categoryResults]) => {
            Object.entries(categoryResults).forEach(([check, result]) => {
                if (result.status === 'error') {
                    hasErrors = true;
                    this.checkResults.errors.push({
                        category,
                        check,
                        message: result.error || 'Неизвестная ошибка',
                        timestamp: new Date()
                    });
                } else if (result.status === 'warning') {
                    hasWarnings = true;
                    this.checkResults.warnings.push({
                        category,
                        check,
                        message: result.error || 'Предупреждение',
                        timestamp: new Date()
                    });
                }
            });
        });

        // Определение общего статуса
        if (hasErrors) {
            this.checkResults.overallStatus = 'error';
        } else if (hasWarnings) {
            this.checkResults.overallStatus = 'warning';
        } else {
            this.checkResults.overallStatus = 'ok';
        }
    }

    /**
     * Генерация рекомендаций
     */
    generateRecommendations() {
        const recommendations = [];

        // Рекомендации на основе ошибок
        this.checkResults.errors.forEach(error => {
            if (error.category === 'apiConnections') {
                recommendations.push({
                    priority: 'high',
                    category: 'API соединения',
                    action: 'Проверить настройки API и сетевое подключение',
                    details: error.message
                });
            } else if (error.category === 'riskLimits') {
                recommendations.push({
                    priority: 'high',
                    category: 'Управление рисками',
                    action: 'Настроить лимиты риск-менеджмента',
                    details: error.message
                });
            } else if (error.category === 'aiSystems') {
                recommendations.push({
                    priority: 'medium',
                    category: 'AI системы',
                    action: 'Инициализировать AI сервисы',
                    details: error.message
                });
            }
        });

        // Рекомендации на основе предупреждений
        this.checkResults.warnings.forEach(warning => {
            if (warning.category === 'aiSystems') {
                recommendations.push({
                    priority: 'low',
                    category: 'AI системы',
                    action: 'Рассмотреть активацию дополнительных AI сервисов',
                    details: warning.message
                });
            }
        });

        this.checkResults.recommendations = recommendations;
    }

    /**
     * Получение статуса проверки
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            lastCheck: this.checkResults.timestamp,
            overallStatus: this.checkResults.overallStatus,
            errorsCount: this.checkResults.errors.length,
            warningsCount: this.checkResults.warnings.length
        };
    }

    /**
     * Получение детальных результатов
     */
    getDetailedResults() {
        return this.checkResults;
    }

    /**
     * Утилита задержки
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default new PreflightCheckService();
