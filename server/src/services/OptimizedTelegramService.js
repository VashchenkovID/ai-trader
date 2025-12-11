import TelegramBot from 'node-telegram-bot-api';
import { getService } from './GlobalServiceManager.js';

/**
 * Оптимизированный сервис Telegram уведомлений
 * Содержит только необходимые уведомления без спама
 */
class OptimizedTelegramService {
    constructor() {
        this.bot = null;
        this.chatId = null;
        this.isInitialized = false;
        this.startTime = null;
        this.networkErrors = 0;
        this.maxNetworkErrors = 5;
        this.temporarilyDisabled = false;
        
        // Системный отчет каждые 12 часов
        this.systemReportInterval = null;
        this.lastSystemReport = null;
        
        // Агрегация сильных рекомендаций
        this.strongRecommendations = [];
        this.recommendationAggregationTimeout = null;
        
        // Счетчик тренировок
        this.trainingCount = 0;
    }

    async initialize() {
        // Проверяем, не инициализирован ли уже бот
        if (this.isInitialized && this.bot) {
            console.log('⚠️ Telegram bot already initialized, skipping...');
            return;
        }

        const token = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;

        if (!token || !chatId) {
            console.warn('Telegram bot token or chat ID not found. Telegram notifications disabled.');
            return;
        }

        await this.initializeWithRetry(token, chatId, 0);
    }

    async initializeWithRetry(token, chatId, retryCount = 0) {
        const maxRetries = 3;
        const retryDelay = Math.min(2000 * Math.pow(2, retryCount), 10000);

        try {
            // Если бот уже существует, останавливаем его перед переинициализацией
            if (this.bot) {
                try {
                    this.bot.stopPolling();
                    this.bot = null;
                } catch (e) {
                    // Игнорируем ошибки при остановке
                }
            }

            console.log(`🤖 Initializing Telegram bot (attempt ${retryCount + 1}/${maxRetries + 1})...`);
            
            // Сначала пытаемся создать бота с polling
            // Но если сразу возникает ошибка 409, переключаемся на режим без polling
            let botCreated = false;
            try {
                this.bot = new TelegramBot(token, { 
                    polling: {
                        interval: 30000,
                        autoStart: true,
                        params: { timeout: 10 }
                    }
                });
                botCreated = true;
            } catch (createError) {
                // Если ошибка 409 при создании, сразу переключаемся на режим без polling
                if (createError.message && createError.message.includes('409 Conflict')) {
                    console.warn('⚠️ Another Telegram bot instance is already running. This instance will use polling: false.');
                    this.bot = new TelegramBot(token, { polling: false });
                    botCreated = true;
                } else {
                    throw createError;
                }
            }
            
            this.chatId = chatId;
            this.isInitialized = true;
            this.startTime = new Date();

            this.setupHandlers();
            this.setupErrorHandlers();
            this.startSystemReportScheduler();
            
            if (botCreated && this.bot && this.bot._polling) {
                console.log('✅ Telegram bot initialized successfully with polling');
            } else {
                console.log('✅ Telegram bot initialized without polling (another instance is active)');
            }
        } catch (error) {
            console.error(`❌ Error initializing Telegram bot (attempt ${retryCount + 1}):`, error.message);
            
            // Если ошибка 409 Conflict, значит другой экземпляр уже запущен
            if (error.message && error.message.includes('409 Conflict')) {
                console.warn('⚠️ Another Telegram bot instance is already running. This instance will use polling: false.');
                // Инициализируем без polling
                try {
                    this.bot = new TelegramBot(token, { polling: false });
                    this.chatId = chatId;
                    this.isInitialized = true;
                    this.startTime = new Date();
                    this.setupHandlers();
                    this.setupErrorHandlers();
                    this.startSystemReportScheduler();
                    console.log('✅ Telegram bot initialized without polling (another instance is active)');
                    return;
                } catch (fallbackError) {
                    console.error('❌ Failed to initialize Telegram bot without polling:', fallbackError.message);
                    this.isInitialized = false;
                    return;
                }
            }
            
            if (retryCount < maxRetries) {
                console.log(`🔄 Retrying in ${retryDelay / 1000} seconds...`);
                setTimeout(() => {
                    this.initializeWithRetry(token, chatId, retryCount + 1);
                }, retryDelay);
            } else {
                console.error('❌ Failed to initialize Telegram bot after maximum retries.');
                this.isInitialized = false;
            }
        }
    }

    setupErrorHandlers() {
        if (!this.bot) return;

        this.bot.on('polling_error', (error) => {
            console.error('Telegram polling error:', error.message);
            
            // Обработка ошибки 409 Conflict (другой экземпляр уже запущен)
            if (error.message && error.message.includes('409 Conflict')) {
                console.warn('⚠️ Another Telegram bot instance is running. Stopping polling for this instance.');
                try {
                    // Останавливаем polling
                    if (this.bot && this.bot.stopPolling) {
                        this.bot.stopPolling();
                    }
                    
                    // Переинициализируем без polling
                    const token = process.env.TELEGRAM_BOT_TOKEN;
                    const chatId = process.env.TELEGRAM_CHAT_ID;
                    if (token && chatId) {
                        // Удаляем старый бот
                        this.bot = null;
                        
                        // Создаем нового бота без polling
                        this.bot = new TelegramBot(token, { polling: false });
                        this.chatId = chatId;
                        this.isInitialized = true;
                        
                        // Переустанавливаем обработчики
                        this.setupHandlers();
                        this.setupErrorHandlers();
                        
                        console.log('✅ Telegram bot reinitialized without polling');
                    }
                } catch (e) {
                    console.error('❌ Error reinitializing Telegram bot:', e.message);
                    this.isInitialized = false;
                }
                return;
            }
            
            if (error.message.includes('ENOTFOUND') || 
                error.message.includes('ECONNRESET') || 
                error.message.includes('ETIMEDOUT')) {
                
                this.networkErrors++;
                console.log(`🔄 Network error detected (${this.networkErrors}/${this.maxNetworkErrors})`);
                
                if (this.networkErrors >= this.maxNetworkErrors) {
                    console.log('❌ Too many network errors, temporarily disabling Telegram');
                    this.temporarilyDisabled = true;
                    this.isInitialized = false;
                    
                    setTimeout(() => {
                        console.log('🔄 Attempting to re-enable Telegram after cooldown...');
                        this.temporarilyDisabled = false;
                        this.networkErrors = 0;
                        this.initialize();
                    }, 30 * 60 * 1000);
                }
            }
        });
    }

    setupHandlers() {
        if (!this.bot) return;

        // Команда /start
        this.bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            this.bot.sendMessage(chatId,
                '🤖 <b>Smart Exchange Bot активирован!</b>\n\n' +
                '📊 <b>Доступные команды:</b>\n' +
                '/status - Статус системы\n' +
                '/report - Получить системный отчет\n' +
                '/help - Список команд\n\n' +
                '⚡ <b>Автоматические уведомления:</b>\n' +
                '• Старт/остановка сервера\n' +
                '• Обучение нейросетей\n' +
                '• Сильные рекомендации\n' +
                '• Системные отчеты (каждые 12ч)\n' +
                '• Критические алерты',
                { parse_mode: 'HTML' }
            );
        });

        // Команда /status
        this.bot.onText(/\/status/, async (msg) => {
            try {
                const status = await this.getSystemStatus();
                const message = this.formatSystemStatus(status);
                this.bot.sendMessage(msg.chat.id, message, { parse_mode: 'HTML' });
            } catch (error) {
                this.bot.sendMessage(msg.chat.id, `❌ Ошибка получения статуса: ${error.message}`);
            }
        });

        // Команда /report
        this.bot.onText(/\/report/, async (msg) => {
            try {
                const report = await this.generateSystemReport();
                this.bot.sendMessage(msg.chat.id, report, { parse_mode: 'HTML' });
            } catch (error) {
                this.bot.sendMessage(msg.chat.id, `❌ Ошибка генерации отчета: ${error.message}`);
            }
        });

        // Команда /help
        this.bot.onText(/\/help/, (msg) => {
            this.bot.sendMessage(msg.chat.id,
                '📋 <b>Список команд:</b>\n\n' +
                '/start - Активация бота\n' +
                '/status - Статус системы\n' +
                '/report - Системный отчет\n' +
                '/help - Эта справка\n\n' +
                '⏰ <b>Автоматические уведомления:</b>\n' +
                '• Старт/остановка сервера\n' +
                '• Обучение нейросетей (полное/частичное)\n' +
                '• Сильные рекомендации (BUY/SELL)\n' +
                '• Системные отчеты (каждые 12ч)\n' +
                '• Критические алерты',
                { parse_mode: 'HTML' }
            );
        });
    }

    // 1. Уведомление о старте сервера
    async sendServerStartup() {
        if (!this.isInitialized) return;

        try {
            const systemStatus = await this.getSystemStatus();
            const message = this.formatServerStartupMessage(systemStatus);
            await this.safeSendMessage(this.chatId, message, { parse_mode: 'HTML' });
            console.log('✅ Server startup notification sent');
        } catch (error) {
            console.error('❌ Error sending startup notification:', error);
        }
    }

    formatServerStartupMessage(status) {
        const uptime = this.getUptime();
        
        return `🚀 <b>СЕРВЕР ЗАПУЩЕН</b>

🕐 Время запуска: <b>${new Date().toLocaleString('ru-RU')}</b>
⏱️ Время работы: <b>${uptime}</b>

📊 <b>СТАТУС СИСТЕМЫ:</b>
• База данных: ${status.database ? '✅' : '❌'} ${status.database ? 'Подключена' : 'Ошибка'}
• WebSocket: ${status.websocket ? '✅' : '❌'} ${status.websocket ? 'Активен' : 'Неактивен'}
• AI сервисы: ${status.ai ? '✅' : '❌'} ${status.ai ? 'Инициализированы' : 'Ошибка'}
• Торговый движок: ${status.trading ? '✅' : '❌'} ${status.trading ? 'Готов' : 'Ошибка'}

🧠 <b>НЕЙРОСЕТИ:</b>
• Традиционная: ${status.neuralNetworks.traditional ? '✅' : '❌'}
• Ансамбль: ${status.neuralNetworks.ensemble ? '✅' : '❌'}
• Meta-Learning: ${status.neuralNetworks.metaLearning ? '✅' : '❌'}
• RL агент: ${status.neuralNetworks.reinforcementLearning ? '✅' : '❌'}

💾 <b>ПАМЯТЬ:</b> ${status.memory} MB
🌐 <b>ПОРТ:</b> ${process.env.PORT || 3001}

⏰ Следующий отчет: через 12 часов`;
    }

    // 2. Уведомление о старте полного обучения
    async sendFullTrainingStart(figi, options = {}) {
        if (!this.isInitialized) return;

        try {
            const message = this.formatFullTrainingStartMessage(figi, options);
            await this.safeSendMessage(this.chatId, message, { parse_mode: 'HTML' });
            console.log('✅ Full training start notification sent');
        } catch (error) {
            console.error('❌ Error sending full training start notification:', error);
        }
    }

    formatFullTrainingStartMessage(figi, options) {
        return `🧠 <b>ПОЛНОЕ ОБУЧЕНИЕ НЕЙРОСЕТЕЙ</b>

📈 Инструмент: <b>${figi}</b>
📊 Параметры:
• Дней данных: ${options.days || 180}
• Эпох: ${options.epochs || 50}
• Размер батча: ${options.batchSize || 16}

🎯 <b>ОБУЧАЮТСЯ:</b>
• Традиционная нейросеть
• Ансамбль (LSTM + CNN + Transformer)
• Meta-Learning система
• Reinforcement Learning агент

⏰ Время начала: <b>${new Date().toLocaleString('ru-RU')}</b>
📊 Прогресс будет отправлен по завершении`;
    }

    // 3. Уведомление о завершении дообучения
    async sendPartialTrainingComplete(figi, options = {}, results = {}) {
        if (!this.isInitialized) return;

        try {
            const message = this.formatPartialTrainingCompleteMessage(figi, options, results);
            await this.safeSendMessage(this.chatId, message, { parse_mode: 'HTML' });
            console.log('✅ Partial training completion notification sent');
        } catch (error) {
            console.error('❌ Error sending partial training completion notification:', error);
        }
    }

    formatPartialTrainingCompleteMessage(figi, options, results) {
        const success = results.traditional?.success !== false;
        const accuracy = results.traditional?.history?.acc ? 
            results.traditional.history.acc[results.traditional.history.acc.length - 1] : null;
        
        return `✅ <b>ДООБУЧЕНИЕ ЗАВЕРШЕНО</b>

📈 Инструмент: <b>${figi}</b>
📊 Параметры:
• Дней данных: ${options.days || 30}
• Эпох: ${options.epochs || 10}
• Размер батча: ${options.batchSize || 16}

🎯 <b>РЕЗУЛЬТАТ:</b>
• Статус: ${success ? '✅ Успешно' : '❌ Ошибка'}
${accuracy ? `• Точность: ${(accuracy * 100).toFixed(2)}%` : ''}
• Время завершения: <b>${new Date().toLocaleString('ru-RU')}</b>

🧠 Нейросеть обновлена и готова к работе`;
    }

    // 4. Сильные рекомендации (агрегированные)
    async addStrongRecommendation(recommendation) {
        if (!this.isInitialized) return;

        // Фильтруем только сильные рекомендации (confidence > 0.8)
        if (recommendation.confidence > 0.8) {
            this.strongRecommendations.push({
                ...recommendation,
                timestamp: new Date()
            });

            // Запускаем таймер для агрегации
            this.scheduleRecommendationAggregation();
        }
    }

    scheduleRecommendationAggregation() {
        if (this.recommendationAggregationTimeout) {
            clearTimeout(this.recommendationAggregationTimeout);
        }

        // Агрегируем рекомендации каждые 30 минут
        this.recommendationAggregationTimeout = setTimeout(() => {
            this.sendStrongRecommendations();
        }, 30 * 60 * 1000);
    }

    async sendStrongRecommendations() {
        if (!this.isInitialized || this.strongRecommendations.length === 0) return;

        try {
            const message = this.formatStrongRecommendationsMessage();
            await this.safeSendMessage(this.chatId, message, { parse_mode: 'HTML' });
            
            // Очищаем после отправки
            this.strongRecommendations = [];
            console.log('✅ Strong recommendations sent');
        } catch (error) {
            console.error('❌ Error sending strong recommendations:', error);
        }
    }

    formatStrongRecommendationsMessage() {
        if (this.strongRecommendations.length === 0) return '';

        const buyRecommendations = this.strongRecommendations.filter(r => r.recommendation === 'BUY');
        const sellRecommendations = this.strongRecommendations.filter(r => r.recommendation === 'SELL');

        let message = `🎯 <b>СИЛЬНЫЕ РЕКОМЕНДАЦИИ</b>\n\n`;

        if (buyRecommendations.length > 0) {
            message += `📈 <b>ПОКУПКИ (${buyRecommendations.length}):</b>\n`;
            buyRecommendations.slice(0, 5).forEach(rec => {
                message += `• <b>${rec.figi}</b> - ${(rec.confidence * 100).toFixed(1)}% уверенности\n`;
            });
            message += '\n';
        }

        if (sellRecommendations.length > 0) {
            message += `📉 <b>ПРОДАЖИ (${sellRecommendations.length}):</b>\n`;
            sellRecommendations.slice(0, 5).forEach(rec => {
                message += `• <b>${rec.figi}</b> - ${(rec.confidence * 100).toFixed(1)}% уверенности\n`;
            });
            message += '\n';
        }

        message += `⏰ Период анализа: ${new Date().toLocaleString('ru-RU')}`;
        return message;
    }

    // 5. Критические алерты
    async sendAlert(alertType, message, severity = 'warning') {
        if (!this.isInitialized) return;

        try {
            const emoji = {
                'critical': '🚨',
                'warning': '⚠️',
                'info': 'ℹ️'
            };

            const alertMessage = `<b>Оповещение: ${alertType.toUpperCase()}</b>\n\n${message}\n\n⏰ Время: ${new Date().toLocaleString('ru-RU')}`;
            await this.safeSendMessage(this.chatId, alertMessage, { parse_mode: 'HTML' });
            console.log(`✅ Alert sent: ${alertType}`);
        } catch (error) {
            console.error('❌ Error sending alert:', error);
        }
    }

    // 6. Уведомление об остановке сервера
    async sendServerShutdown(reason = 'normal shutdown') {
        if (!this.isInitialized) return;

        try {
            const uptime = this.getUptime();
            const message = this.formatServerShutdownMessage(reason, uptime);
            await this.safeSendMessage(this.chatId, message, { parse_mode: 'HTML' });
            console.log('✅ Server shutdown notification sent');
        } catch (error) {
            console.error('❌ Error sending shutdown notification:', error);
        }
    }

    formatServerShutdownMessage(reason, uptime) {
        return `🛑 <b>СЕРВЕР ОСТАНОВЛЕН</b>

📉 Причина: <b>${reason}</b>
⏱️ Время работы: <b>${uptime}</b>
🕐 Время остановки: <b>${new Date().toLocaleString('ru-RU')}</b>

📊 <b>ФИНАЛЬНАЯ СТАТИСТИКА:</b>
• Обучений проведено: ${this.getTrainingCount()}
• Рекомендаций отправлено: ${this.strongRecommendations.length}
• Ошибок: ${this.networkErrors}

🔄 Перезапуск ожидается...`;
    }

    // 7. Системный отчет каждые 12 часов
    startSystemReportScheduler() {
        // Отправляем первый отчет через 1 час после запуска
        setTimeout(() => {
            this.sendSystemReport();
        }, 60 * 60 * 1000);

        // Затем каждые 12 часов
        this.systemReportInterval = setInterval(() => {
            this.sendSystemReport();
        }, 12 * 60 * 60 * 1000);
    }

    async sendSystemReport() {
        if (!this.isInitialized) return;

        try {
            const report = await this.generateSystemReport();
            await this.safeSendMessage(this.chatId, report, { parse_mode: 'HTML' });
            this.lastSystemReport = new Date();
            console.log('✅ System report sent');
        } catch (error) {
            console.error('❌ Error sending system report:', error);
        }
    }

    async generateSystemReport() {
        const systemStatus = await this.getSystemStatus();
        const uptime = this.getUptime();
        
        return `📊 <b>СИСТЕМНЫЙ ОТЧЕТ</b>

🕐 Время отчета: <b>${new Date().toLocaleString('ru-RU')}</b>
⏱️ Время работы: <b>${uptime}</b>

📈 <b>СТАТУС СИСТЕМЫ:</b>
• База данных: ${systemStatus.database ? '✅' : '❌'}
• WebSocket: ${systemStatus.websocket ? '✅' : '❌'}
• AI сервисы: ${systemStatus.ai ? '✅' : '❌'}
• Торговый движок: ${systemStatus.trading ? '✅' : '❌'}

🧠 <b>НЕЙРОСЕТИ:</b>
• Традиционная: ${systemStatus.neuralNetworks.traditional ? '✅' : '❌'}
• Ансамбль: ${systemStatus.neuralNetworks.ensemble ? '✅' : '❌'}
• Meta-Learning: ${systemStatus.neuralNetworks.metaLearning ? '✅' : '❌'}
• RL агент: ${systemStatus.neuralNetworks.reinforcementLearning ? '✅' : '❌'}

💾 <b>РЕСУРСЫ:</b>
• Память: ${systemStatus.memory} MB
• Ошибки сети: ${this.networkErrors}

📊 <b>АКТИВНОСТЬ:</b>
• Обучений: ${this.getTrainingCount()}
• Рекомендаций: ${this.strongRecommendations.length}
• Последний отчет: ${this.lastSystemReport ? this.lastSystemReport.toLocaleString('ru-RU') : 'Не отправлялся'}

⏰ Следующий отчет: через 12 часов`;
    }

    // Вспомогательные методы
    async getSystemStatus() {
        try {
            // Получаем сервисы через GlobalServiceManager
            const IntegratedAIService = getService('IntegratedAIService');
            const TradingEngine = getService('TradingEngine');
            const WebSocketService = getService('WebSocketService');
            const NeuralNetworkService = getService('NeuralNetworkService');
            const EnsembleService = getService('EnsembleService');
            const MetaLearningService = getService('MetaLearningService');
            const ReinforcementLearningService = getService('ReinforcementLearningService');
            
            // Проверка статуса базы данных
            let databaseStatus = false;
            try {
                const sequelize = (await import('../config/database.js')).default;
                if (sequelize && typeof sequelize.authenticate === 'function') {
                    await sequelize.authenticate();
                    databaseStatus = true;
                }
            } catch (dbError) {
                console.warn('Database connection check failed:', dbError.message);
                databaseStatus = false;
            }
            
            // Получаем статусы сервисов с безопасной обработкой
            let aiStatus = { isInitialized: false, activeNetworks: {} };
            try {
                if (IntegratedAIService && typeof IntegratedAIService.getStatus === 'function') {
                    aiStatus = IntegratedAIService.getStatus();
                }
            } catch (error) {
                console.warn('Error getting IntegratedAIService status:', error.message);
            }

            let tradingStatus = { isInitialized: false };
            try {
                if (TradingEngine && typeof TradingEngine.getStatus === 'function') {
                    tradingStatus = TradingEngine.getStatus();
                }
            } catch (error) {
                console.warn('Error getting TradingEngine status:', error.message);
            }

            let websocketStatus = { isConnected: false, clientsCount: 0 };
            try {
                if (WebSocketService && typeof WebSocketService.getStatus === 'function') {
                    websocketStatus = WebSocketService.getStatus();
                }
            } catch (error) {
                console.warn('Error getting WebSocketService status:', error.message);
            }
            
            // Безопасное получение статусов с обработкой ошибок
            let neuralNetworkStatus = { isActive: false };
            try {
                if (NeuralNetworkService && typeof NeuralNetworkService.getStatus === 'function') {
                    neuralNetworkStatus = NeuralNetworkService.getStatus();
                }
            } catch (error) {
                console.warn('Error getting NeuralNetworkService status:', error.message);
            }

            let ensembleStatus = { isInitialized: false };
            try {
                if (EnsembleService && typeof EnsembleService.getStatus === 'function') {
                    ensembleStatus = EnsembleService.getStatus();
                }
            } catch (error) {
                console.warn('Error getting EnsembleService status:', error.message);
            }

            let metaLearningStatus = { isInitialized: false };
            try {
                if (MetaLearningService && typeof MetaLearningService.getStatus === 'function') {
                    metaLearningStatus = MetaLearningService.getStatus();
                }
            } catch (error) {
                console.warn('Error getting MetaLearningService status:', error.message);
            }

            let reinforcementLearningStatus = { isInitialized: false };
            try {
                if (ReinforcementLearningService) {
                    // ReinforcementLearningService использует getStats(), а не getStatus()
                    if (typeof ReinforcementLearningService.getStats === 'function') {
                        const rlStats = ReinforcementLearningService.getStats();
                        reinforcementLearningStatus = {
                            isInitialized: rlStats.isInitialized || false
                        };
                    } else if (typeof ReinforcementLearningService.getStatus === 'function') {
                        reinforcementLearningStatus = ReinforcementLearningService.getStatus();
                    } else {
                        // Fallback: проверяем свойство напрямую
                        reinforcementLearningStatus = {
                            isInitialized: ReinforcementLearningService.isInitialized || false
                        };
                    }
                }
            } catch (error) {
                console.warn('Error getting ReinforcementLearningService status:', error.message);
            }

            return {
                database: databaseStatus,
                websocket: websocketStatus.isConnected || websocketStatus.clientsCount > 0,
                ai: aiStatus.isInitialized || false,
                trading: tradingStatus.isInitialized || false,
                neuralNetworks: {
                    traditional: neuralNetworkStatus.isActive || false,
                    ensemble: ensembleStatus.isInitialized || false,
                    metaLearning: metaLearningStatus.isInitialized || false,
                    reinforcementLearning: reinforcementLearningStatus.isInitialized || false
                },
                memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
            };
        } catch (error) {
            console.error('Error getting system status:', error);
            return {
                database: false,
                websocket: false,
                ai: false,
                trading: false,
                neuralNetworks: {
                    traditional: false,
                    ensemble: false,
                    metaLearning: false,
                    reinforcementLearning: false
                },
                memory: 0
            };
        }
    }

    formatSystemStatus(status) {
        return `📊 <b>СТАТУС СИСТЕМЫ</b>

🕐 Время: <b>${new Date().toLocaleString('ru-RU')}</b>
⏱️ Время работы: <b>${this.getUptime()}</b>

📈 <b>СЕРВИСЫ:</b>
• База данных: ${status.database ? '✅' : '❌'}
• WebSocket: ${status.websocket ? '✅' : '❌'}
• AI сервисы: ${status.ai ? '✅' : '❌'}
• Торговый движок: ${status.trading ? '✅' : '❌'}

🧠 <b>НЕЙРОСЕТИ:</b>
• Традиционная: ${status.neuralNetworks.traditional ? '✅' : '❌'}
• Ансамбль: ${status.neuralNetworks.ensemble ? '✅' : '❌'}
• Meta-Learning: ${status.neuralNetworks.metaLearning ? '✅' : '❌'}
• RL агент: ${status.neuralNetworks.reinforcementLearning ? '✅' : '❌'}

💾 Память: <b>${status.memory} MB</b>`;
    }

    getUptime() {
        if (!this.startTime) return '0с';
        
        const uptime = (new Date() - this.startTime) / 1000;
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);

        if (hours > 0) {
            return `${hours}ч ${minutes}м ${seconds}с`;
        } else if (minutes > 0) {
            return `${minutes}м ${seconds}с`;
        } else {
            return `${seconds}с`;
        }
    }

    getTrainingCount() {
        // Получаем реальный счетчик тренировок из кеша
        return this.trainingCount || 0;
    }

    /**
     * Очистка HTML от неподдерживаемых тегов для Telegram
     */
    sanitizeHtml(html) {
        if (!html || typeof html !== 'string') return html;
        
        // Удаляем неподдерживаемые теги (anonymous, script, style и т.д.)
        // Оставляем только поддерживаемые: <b>, <i>, <u>, <s>, <code>, <pre>, <a>
        return html
            .replace(/<anonymous[^>]*>.*?<\/anonymous>/gi, '') // Удаляем теги anonymous
            .replace(/<script[^>]*>.*?<\/script>/gi, '') // Удаляем script
            .replace(/<style[^>]*>.*?<\/style>/gi, '') // Удаляем style
            .replace(/<[^>]+>/g, (tag) => {
                // Разрешаем только поддерживаемые теги
                const allowedTags = ['b', 'i', 'u', 's', 'code', 'pre', 'a'];
                const tagName = tag.match(/<\/?(\w+)/)?.[1]?.toLowerCase();
                if (tagName && allowedTags.includes(tagName)) {
                    return tag;
                }
                return ''; // Удаляем неподдерживаемые теги
            });
    }

    async safeSendMessage(chatId, message, options = {}, retryCount = 0) {
        if (!this.isInitialized || !this.bot || this.temporarilyDisabled) {
            console.log('Telegram temporarily disabled or not initialized, skipping message');
            return false;
        }

        const maxRetries = 3;
        const retryDelay = 1000 * (retryCount + 1);

        try {
            // Очищаем HTML от неподдерживаемых тегов, если используется HTML parse_mode
            if (options.parse_mode === 'HTML' && typeof message === 'string') {
                message = this.sanitizeHtml(message);
            }
            
            await this.bot.sendMessage(chatId, message, options);
            this.networkErrors = Math.max(0, this.networkErrors - 1);
            return true;
        } catch (error) {
            console.error(`Error sending Telegram message (attempt ${retryCount + 1}):`, error.message);
            
            // Если ошибка связана с парсингом HTML, пробуем отправить без HTML
            if (error.message && error.message.includes('parse entities') && options.parse_mode === 'HTML') {
                console.warn('⚠️ HTML parsing error, retrying without HTML formatting');
                try {
                    // Удаляем HTML теги и отправляем как простой текст
                    const plainMessage = message.replace(/<[^>]+>/g, '');
                    await this.bot.sendMessage(chatId, plainMessage, { parse_mode: undefined });
                    return true;
                } catch (retryError) {
                    console.error('Error sending plain text message:', retryError.message);
                }
            }
            
            if (retryCount < maxRetries && this.isInitialized && !this.temporarilyDisabled) {
                setTimeout(() => {
                    this.safeSendMessage(chatId, message, options, retryCount + 1);
                }, retryDelay);
            } else {
                console.error('Failed to send Telegram message after maximum retries');
                return false;
            }
        }
    }

    // Очистка ресурсов
    cleanup() {
        if (this.systemReportInterval) {
            clearInterval(this.systemReportInterval);
        }
        if (this.recommendationAggregationTimeout) {
            clearTimeout(this.recommendationAggregationTimeout);
        }
        if (this.bot) {
            this.bot.stopPolling();
        }
    }

    /**
     * Остановка сервиса
     */
    async stop() {
        try {
            console.log('🛑 Stopping Optimized Telegram Service...');
            this.cleanup();
            console.log('✅ Optimized Telegram Service stopped');
        } catch (error) {
            console.error('❌ Error stopping Optimized Telegram Service:', error);
            throw error;
        }
    }
}

export default new OptimizedTelegramService();
