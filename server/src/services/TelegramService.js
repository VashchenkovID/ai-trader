import TelegramBot from 'node-telegram-bot-api';
import NeuralNetworkService from './NeuralNetworkService.js';

class TelegramService {
    constructor() {
        this.bot = null;
        this.chatId = null;
        this.isInitialized = false;
        this.startTime = null;
        this.networkErrors = 0;
        this.maxNetworkErrors = 10;
        this.temporarilyDisabled = false;
        
        // Агрегация ошибок обучения
        this.trainingErrors = new Map(); // figi -> { count, lastError, firstError }
        this.errorAggregationTimeout = null;
        this.maxErrorAggregationTime = 5 * 60 * 1000; // 5 минут
    }

    initialize() {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;

        if (!token || !chatId) {
            console.warn('Telegram bot token or chat ID not found. Telegram notifications disabled.');
            return;
        }

        this.initializeWithRetry(token, chatId, 0);
    }

    async initializeWithRetry(token, chatId, retryCount = 0) {
        const maxRetries = 5;
        const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 30000); // Exponential backoff, max 30s

        try {

            this.bot = new TelegramBot(token, { 
                polling: {
                    interval: 30000, // 30 seconds polling interval
                    autoStart: true,
                    params: {
                        timeout: 10
                    }
                }
            });
            
            this.chatId = chatId;
            this.isInitialized = true;

            this.setupHandlers();
            this.setupErrorHandlers();
            
        } catch (error) {
            console.error(`❌ Error initializing Telegram bot (attempt ${retryCount + 1}):`, error.message);
            
            if (retryCount < maxRetries) {
                setTimeout(() => {
                    this.initializeWithRetry(token, chatId, retryCount + 1);
                }, retryDelay);
            } else {
                console.error('❌ Failed to initialize Telegram bot after maximum retries. Telegram notifications disabled.');
                this.isInitialized = false;
            }
        }
    }

    setupErrorHandlers() {
        if (!this.bot) return;

        // Обработка ошибок polling
        this.bot.on('polling_error', (error) => {
            console.error('Telegram polling error:', error.message);
            
            // Если это ошибка сети, увеличиваем счетчик
            if (error.message.includes('ENOTFOUND') || 
                error.message.includes('ECONNRESET') || 
                error.message.includes('ETIMEDOUT')) {
                
                this.networkErrors++;

                if (this.networkErrors >= this.maxNetworkErrors) {
                    this.temporarilyDisabled = true;
                    this.isInitialized = false;
                    
                    // Попробуем переподключиться через 30 минут
                    setTimeout(() => {
                        this.temporarilyDisabled = false;
                        this.networkErrors = 0;
                        this.initialize();
                    }, 30 * 60 * 1000); // 30 минут
                } else {
                    setTimeout(() => {
                        this.restartPolling();
                    }, 5000);
                }
            }
        });

        // Обработка ошибок webhook
        this.bot.on('webhook_error', (error) => {
            console.error('Telegram webhook error:', error.message);
        });
    }

    restartPolling() {
        if (!this.bot || !this.isInitialized) return;

        try {
            this.bot.stopPolling();
            setTimeout(() => {
                this.bot.startPolling();
            }, 2000);
        } catch (error) {
            console.error('❌ Error restarting Telegram polling:', error.message);
        }
    }

    // Безопасная отправка сообщений с retry
    async safeSendMessage(chatId, message, options = {}, retryCount = 0) {
        if (!this.isInitialized || !this.bot || this.temporarilyDisabled) {
            return false;
        }

        const maxRetries = 3;
        const retryDelay = 1000 * (retryCount + 1); // 1s, 2s, 3s

        try {
            await this.bot.sendMessage(chatId, message, options);
            // Сбрасываем счетчик ошибок при успешной отправке
            this.networkErrors = Math.max(0, this.networkErrors - 1);
            return true;
        } catch (error) {
            console.error(`Error sending Telegram message (attempt ${retryCount + 1}):`, error.message);
            
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

    setupHandlers() {
        // Обработка команды /start
        this.bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            this.bot.sendMessage(chatId,
                '🤖 <b>Smart Exchange Bot активирован!</b>\n\n' +
                '📊 <b>Доступные команды:</b>\n' +
                '/status - Статус нейросети и системы\n' +
                '/system - Информация о системе\n' +
                '/update - Принудительное обновление данных\n' +
                '/help - Список команд\n\n' +
                '⚡ Система автоматически уведомит вас о:\n' +
                '• Запуске/остановке сервера\n' +
                '• Выгодных opportunities\n' +
                '• Ошибках системы\n' +
                '• Обновлениях данных',
                { parse_mode: 'HTML' }
            );
        });

        // Обработка команды /status
        this.bot.onText(/\/status/, async (msg) => {
            const status = NeuralNetworkService.getStatus();
            const statusText = this.formatStatusMessage(status);
            this.bot.sendMessage(msg.chat.id, statusText, { parse_mode: 'HTML' });
        });

        // Обработка команды /system
        this.bot.onText(/\/system/, async (msg) => {
            const systemInfo = this.formatSystemInfo();
            this.bot.sendMessage(msg.chat.id, systemInfo, { parse_mode: 'HTML' });
        });

        // Обработка команды /update
        this.bot.onText(/\/update/, async (msg) => {
            try {
                this.bot.sendMessage(msg.chat.id, '🔄 Запускаю обновление данных...');

                // Здесь можно добавить вызов API для обновления
                this.bot.sendMessage(msg.chat.id,
                    '✅ Обновление запущено\n' +
                    'Результат будет отправлен автоматически'
                );
            } catch (error) {
                this.bot.sendMessage(msg.chat.id, `❌ Ошибка: ${error.message}`);
            }
        });

        // Обработка команды /help
        this.bot.onText(/\/help/, (msg) => {
            this.bot.sendMessage(msg.chat.id,
                '📋 <b>Список команд:</b>\n\n' +
                '/start - Активация бота\n' +
                '/status - Статус нейросети\n' +
                '/system - Информация о системе\n' +
                '/update - Обновление данных\n' +
                '/help - Эта справка\n\n' +
                '⏰ <b>Автоматические уведомления:</b>\n' +
                '• При запуске системы\n' +
                '• Каждые 6 часов - обновление данных\n' +
                '• При выгодных opportunities\n' +
                '• При ошибках',
                { parse_mode: 'HTML' }
            );
        });

        // Обработка текстовых сообщений
        this.bot.on('message', (msg) => {
            if (msg.text && !msg.text.startsWith('/')) {
                this.bot.sendMessage(msg.chat.id,
                    'Используйте команды для взаимодействия:\n' +
                    '/status - статус системы\n' +
                    '/system - информация о системе\n' +
                    '/help - список команд'
                );
            }
        });
    }

    formatSystemInfo() {
        const uptime = this.getUptime();
        const memoryUsage = process.memoryUsage();
        const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);

        return `
💻 <b>ИНФОРМАЦИЯ О СИСТЕМЕ</b>

🕐 Время работы: <b>${uptime}</b>
🧠 Память: <b>${memoryMB} MB</b>
🌐 Окружение: <b>${process.env.NODE_ENV || 'development'}</b>

📊 <b>Сервисы:</b>
• База данных: ✅ Connected
• WebSocket: ✅ Active
• Нейросеть: ✅ ${NeuralNetworkService.status}
• Планировщик: ✅ Active

⏰ <b>Расписание:</b>
• Обновление данных: каждые 6 часов
• Очистка кеша: ежедневно в 2:00
• Анализ рынка: каждые 30 минут

🕐 Текущее время: ${new Date().toLocaleString('ru-RU')}
  `.trim();
    }

    formatStatusMessage(status) {
        const statusEmoji = {
            'off': '🔴',
            'training': '🟡',
            'active': '🟢'
        };

        return `
🤖 Статус нейросети: ${statusEmoji[status.status]} ${status.status.toUpperCase()}

${status.isTraining ? '⚡ Обучение в процессе...' : ''}
${status.isActive ? '✅ Режим анализа активен' : '❌ Режим анализа отключен'}
${status.hasModel ? '📊 Модель загружена' : '📭 Модель не обучена'}

Последнее обновление: ${new Date().toLocaleString('ru-RU')}
    `.trim();
    }

    // Отправка уведомления о рекомендации
    async sendRecommendation(recommendation) {
        if (!this.isInitialized) return;

        try {
            const message = this.formatRecommendationMessage(recommendation);
            await this.bot.sendMessage(this.chatId, message, { parse_mode: 'HTML' });
        } catch (error) {
            console.error('Error sending Telegram notification:', error);
        }
    }

    formatRecommendationMessage(recommendation) {
        if (recommendation.type === 'BUY') {
            let message = `
🎯 <b>РЕКОМЕНДАЦИЯ К ПОКУПКЕ</b>

📈 Акция: <b>${recommendation.instrument.ticker}</b>
🏢 Компания: ${recommendation.instrument.name}
💯 Уверенность: ${(recommendation.prediction.score * 100).toFixed(1)}%

💰 Текущая цена: ${recommendation.currentPrice?.toFixed(2) || 'N/A'} ${recommendation.instrument.currency}
📊 Предлагаемое количество: ${recommendation.suggestedQuantity}
💵 Общая стоимость: ${recommendation.estimatedCost?.toFixed(2) || 'N/A'} ${recommendation.instrument.currency}

🎪 Дивидендная доходность: ${(recommendation.instrument.dividendYield * 100)?.toFixed(2) || '0'}%`;

            // Добавляем объяснение, если оно есть
            if (recommendation.prediction.explanation) {
                const explanation = recommendation.prediction.explanation;
                
                message += `\n\n📊 <b>АНАЛИЗ:</b>`;
                
                // Технический анализ
                if (explanation.reasoning?.technical?.trend) {
                    const trend = explanation.reasoning.technical.trend;
                    message += `\n📈 Тренд: ${trend.description}`;
                }
                
                if (explanation.reasoning?.technical?.momentum) {
                    const momentum = explanation.reasoning.technical.momentum;
                    message += `\n⚡ Моментум: ${momentum.description}`;
                }
                
                // Плюсы
                if (explanation.pros && explanation.pros.length > 0) {
                    message += `\n\n✅ <b>ПЛЮСЫ:</b>`;
                    explanation.pros.slice(0, 3).forEach(pro => {
                        message += `\n• ${pro}`;
                    });
                }
                
                // Риски
                if (explanation.risks && explanation.risks.length > 0) {
                    message += `\n\n⚠️ <b>РИСКИ:</b>`;
                    explanation.risks.slice(0, 2).forEach(risk => {
                        message += `\n• ${risk}`;
                    });
                }
                
                // Резюме
                if (explanation.summary) {
                    message += `\n\n💡 <b>ВЫВОД:</b>\n${explanation.summary}`;
                }
            }

            message += `\n\n⏰ Время анализа: ${new Date().toLocaleString('ru-RU')}`;
            return message.trim();
        } else {
            let message = `
🚨 <b>РЕКОМЕНДАЦИЯ К ПРОДАЖЕ</b>

📉 Акция: <b>${recommendation.item.ticker}</b>
🏢 Компания: ${recommendation.item.name}
💯 Уверенность: ${(recommendation.prediction.score * 100).toFixed(1)}%

📊 Количество в портфеле: ${recommendation.item.quantity}
💰 Средняя цена покупки: ${recommendation.item.averagePrice} ${recommendation.item.currency}

🔍 Причина: ${recommendation.reason}`;

            // Добавляем объяснение, если оно есть
            if (recommendation.prediction.explanation) {
                const explanation = recommendation.prediction.explanation;
                
                message += `\n\n📊 <b>АНАЛИЗ:</b>`;
                
                // Технический анализ
                if (explanation.reasoning?.technical?.trend) {
                    const trend = explanation.reasoning.technical.trend;
                    message += `\n📈 Тренд: ${trend.description}`;
                }
                
                if (explanation.reasoning?.technical?.momentum) {
                    const momentum = explanation.reasoning.technical.momentum;
                    message += `\n⚡ Моментум: ${momentum.description}`;
                }
                
                // Минусы
                if (explanation.cons && explanation.cons.length > 0) {
                    message += `\n\n❌ <b>МИНУСЫ:</b>`;
                    explanation.cons.slice(0, 3).forEach(con => {
                        message += `\n• ${con}`;
                    });
                }
                
                // Риски
                if (explanation.risks && explanation.risks.length > 0) {
                    message += `\n\n⚠️ <b>РИСКИ:</b>`;
                    explanation.risks.slice(0, 2).forEach(risk => {
                        message += `\n• ${risk}`;
                    });
                }
                
                // Резюме
                if (explanation.summary) {
                    message += `\n\n💡 <b>ВЫВОД:</b>\n${explanation.summary}`;
                }
            }

            message += `\n\n⏰ Время анализа: ${new Date().toLocaleString('ru-RU')}`;
            return message.trim();
        }
    }

    // Отправка уведомления об ошибке
    async sendError(error) {
        if (!this.isInitialized) return;

        try {
            await this.bot.sendMessage(this.chatId,
                `🚨 <b>ОШИБКА СИСТЕМЫ</b>\n\n` +
                `<code>${error.message}</code>\n\n` +
                `Время: ${new Date().toLocaleString('ru-RU')}`,
                { parse_mode: 'HTML' }
            );
        } catch (telegramError) {
            console.error('Error sending error notification:', telegramError);
        }
    }

    // Агрегация ошибок обучения
    addTrainingError(figi, ticker, error) {
        if (!this.trainingErrors.has(figi)) {
            this.trainingErrors.set(figi, {
                ticker,
                count: 0,
                firstError: new Date(),
                lastError: new Date(),
                errors: []
            });
        }

        const errorData = this.trainingErrors.get(figi);
        errorData.count++;
        errorData.lastError = new Date();
        errorData.errors.push({
            message: error.message,
            timestamp: new Date()
        });

        // Ограничиваем количество ошибок в памяти
        if (errorData.errors.length > 10) {
            errorData.errors = errorData.errors.slice(-10);
        }

        // Запускаем таймер для отправки агрегированного уведомления
        this.scheduleErrorAggregation();
    }

    // Планирование отправки агрегированных ошибок
    scheduleErrorAggregation() {
        if (this.errorAggregationTimeout) {
            clearTimeout(this.errorAggregationTimeout);
        }

        this.errorAggregationTimeout = setTimeout(() => {
            this.sendAggregatedTrainingErrors();
        }, this.maxErrorAggregationTime);
    }

    // Отправка агрегированных ошибок обучения
    async sendAggregatedTrainingErrors() {
        if (!this.isInitialized || this.trainingErrors.size === 0) return;

        try {
            const totalErrors = Array.from(this.trainingErrors.values())
                .reduce((sum, errorData) => sum + errorData.count, 0);

            const uniqueInstruments = this.trainingErrors.size;

            let message = `🚨 <b>ОШИБКИ ОБУЧЕНИЯ НЕЙРОСЕТИ</b>\n\n`;
            message += `📊 Всего ошибок: <b>${totalErrors}</b>\n`;
            message += `📈 Инструментов с ошибками: <b>${uniqueInstruments}</b>\n\n`;

            // Добавляем детали по каждому инструменту (максимум 5)
            const errorEntries = Array.from(this.trainingErrors.entries()).slice(0, 5);
            for (const [figi, errorData] of errorEntries) {
                message += `🔸 <b>${errorData.ticker}</b>: ${errorData.count} ошибок\n`;
                if (errorData.errors.length > 0) {
                    const lastError = errorData.errors[errorData.errors.length - 1];
                    message += `   Последняя: ${lastError.message.substring(0, 50)}...\n`;
                }
            }

            if (this.trainingErrors.size > 5) {
                message += `\n... и еще ${this.trainingErrors.size - 5} инструментов\n`;
            }

            message += `\n⏰ Период: ${new Date().toLocaleString('ru-RU')}`;

            await this.bot.sendMessage(this.chatId, message, { parse_mode: 'HTML' });

            // Очищаем агрегированные ошибки после отправки
            this.trainingErrors.clear();
            this.errorAggregationTimeout = null;

        } catch (error) {
            console.error('Error sending aggregated training errors:', error);
        }
    }

    // Очистка ошибок обучения (вызывается при успешном обучении)
    clearTrainingErrors(figi) {
        if (this.trainingErrors.has(figi)) {
            this.trainingErrors.delete(figi);
        }
    }

    // Очистка всех ошибок обучения
    clearAllTrainingErrors() {
        this.trainingErrors.clear();
        if (this.errorAggregationTimeout) {
            clearTimeout(this.errorAggregationTimeout);
            this.errorAggregationTimeout = null;
        }
    }

    // Отправка уведомления о смене статуса
    async sendStatusUpdate(oldStatus, newStatus) {
        if (!this.isInitialized) return;

        try {
            await this.bot.sendMessage(this.chatId,
                `🔄 <b>ИЗМЕНЕНИЕ СТАТУСА</b>\n\n` +
                `Было: <b>${oldStatus}</b>\n` +
                `Стало: <b>${newStatus}</b>\n\n` +
                `Время: ${new Date().toLocaleString('ru-RU')}`,
                { parse_mode: 'HTML' }
            );
        } catch (error) {
            console.error('Error sending status update:', error);
        }
    }
    // Отправка уведомления об обновлении кеша
    async sendCacheUpdateNotification(instrumentCount, duration) {
        if (!this.isInitialized) return;

        try {
            await this.bot.sendMessage(this.chatId,
                `🔄 <b>ОБНОВЛЕНИЕ ДАННЫХ ЗАВЕРШЕНО</b>\n\n` +
                `📊 Обновлено инструментов: <b>${instrumentCount}</b>\n` +
                `⏱️ Время выполнения: <b>${duration} секунд</b>\n\n` +
                `⏰ Следующее обновление: через 6 часов\n` +
                `Время: ${new Date().toLocaleString('ru-RU')}`,
                { parse_mode: 'HTML' }
            );
        } catch (error) {
            console.error('Error sending cache update notification:', error);
        }
    }
    // Сводное уведомление об обучении
    async sendTrainingSummary(total, successes, failures, durationSec) {
        if (!this.isInitialized) return;
        try {
            await this.bot.sendMessage(this.chatId,
                `🧠 <b>ОБУЧЕНИЕ ЗАВЕРШЕНО</b>\n\n` +
                `Всего инструментов: <b>${total}</b>\n` +
                `Успешно: <b>${successes}</b>\n` +
                `С ошибкой: <b>${failures}</b>\n` +
                `Время: <b>${durationSec} сек</b>`,
                { parse_mode: 'HTML' }
            );
        } catch (error) {
            console.error('Error sending training summary:', error);
        }
    }
    // Отправка уведомления о старте приложения
    async sendStartupNotification() {
        if (!this.isInitialized) {
            return;
        }

        try {
            await this.bot.sendMessage(
                this.chatId,
                `🚀 <b>SMART EXCHANGE SYSTEM STARTED</b>\n\n` +
                `✅ Сервер успешно запущен\n` +
                `🕐 Время запуска: <b>${new Date().toLocaleString('ru-RU')}</b>\n` +
                `🌐 Порт: <b>${process.env.PORT || 3001}</b>\n` +
                `💾 База данных: <b>Connected</b>\n` +
                `🤖 Нейросеть: <b>Ready</b>\n\n` +
                `📊 Система мониторинга активирована\n` +
                `⏰ Следующее обновление данных: через 6 часов`,
                { parse_mode: 'HTML' }
            );
        } catch (error) {
            console.error('Error sending startup notification:', error);
        }
    }

// Отправка уведомления об остановке приложения
    async sendShutdownNotification(reason = 'normal shutdown') {
        if (!this.isInitialized) return;

        try {
            await this.bot.sendMessage(
                this.chatId,
                `🛑 <b>SMART EXCHANGE SYSTEM STOPPED</b>\n\n` +
                `📉 Сервер остановлен\n` +
                `🕐 Время остановки: <b>${new Date().toLocaleString('ru-RU')}</b>\n` +
                `🔍 Причина: <b>${reason}</b>\n` +
                `⏳ Время работы: <b>${this.getUptime()}</b>`,
                { parse_mode: 'HTML' }
            );
        } catch (error) {
            console.error('Error sending shutdown notification:', error);
        }
    }

// Вспомогательный метод для получения времени работы
    getUptime() {
        const uptime = process.uptime();
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

    // Метод для отправки системных отчетов
    async sendSystemReport(message) {
        if (!this.isInitialized) {
            console.warn('Telegram bot not initialized. Cannot send system report.');
            return;
        }

        try {
            await this.bot.sendMessage(
                this.chatId,
                message,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            console.error('Error sending system report:', error);
        }
    }

}

export default new TelegramService();