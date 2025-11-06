import TelegramBot from 'node-telegram-bot-api';

/**
 * Сервис для анализа настроений в Telegram каналах
 * Мониторит каналы и анализирует настроения для торговых решений
 */
class TelegramSentimentService {
    constructor() {
        this.isInitialized = false;
        this.bot = null;
        this.channels = new Set();
        this.sentimentCache = new Map();
        this.cacheTimeout = 15 * 60 * 1000; // 15 минут
        
        // Настройки по умолчанию
        this.defaultChannels = [
            '@tinkoff_invest',
            '@finam_ru',
            '@bcs_express',
            '@moex_official',
            '@rian_ru',
            '@readovkanews',
            '@breakingmash'
        ];
    }

    async initialize() {
        try {
            const token = process.env.TELEGRAM_BOT_TOKEN;
            if (!token) {
                console.warn('⚠️ TELEGRAM_BOT_TOKEN not set, Telegram sentiment analysis disabled');
                return;
            }

            this.bot = new TelegramBot(token, { polling: false });
            this.isInitialized = true;
            
            // Добавляем каналы по умолчанию
            this.defaultChannels.forEach(channel => this.addChannel(channel));
            
            console.log('✅ TelegramSentimentService initialized');
        } catch (error) {
            console.error('❌ Error initializing TelegramSentimentService:', error);
        }
    }

    /**
     * Добавление канала для мониторинга
     */
    addChannel(channel) {
        this.channels.add(channel);
        console.log(`📺 Added channel: ${channel}`);
    }

    /**
     * Удаление канала
     */
    removeChannel(channel) {
        this.channels.delete(channel);
        console.log(`📺 Removed channel: ${channel}`);
    }

    /**
     * Получение списка каналов
     */
    getAddedChannels() {
        return Array.from(this.channels);
    }

    /**
     * Проверка доступности канала
     */
    async checkChannelAvailability(channel) {
        try {
            if (!this.isInitialized) {
                return { available: false, error: 'Service not initialized' };
            }

            const chat = await this.bot.getChat(channel);
            return {
                available: true,
                title: chat.title,
                type: chat.type,
                memberCount: chat.member_count || 0
            };
        } catch (error) {
            return {
                available: false,
                error: error.message
            };
        }
    }

    /**
     * Проверка всех каналов
     */
    async checkAllChannelsAvailability() {
        const results = {};
        
        for (const channel of this.channels) {
            results[channel] = await this.checkChannelAvailability(channel);
        }
        
        return results;
    }

    /**
     * Анализ настроений в каналах
     * @param {string} figi - FIGI инструмента
     * @param {object} options - Опции анализа
     * @param {number} options.days - Количество дней назад для поиска
     * @param {number} options.limit - Максимальное количество сообщений
     * @param {string[]} options.channels - Список каналов для анализа
     * @param {Date|string} options.maxDate - Максимальная дата сообщений (для предотвращения утечки данных)
     */
    async analyzeTelegramSentiment(figi, options = {}) {
        const {
            days = 7,
            limit = 100,
            channels = Array.from(this.channels),
            maxDate = null // Если указан, фильтруем сообщения только до этой даты
        } = options;

        try {
            if (!this.isInitialized) {
                return {
                    sentiment: 0,
                    confidence: 0,
                    messageCount: 0,
                    channels: []
                };
            }

            // Проверяем кеш (учитываем maxDate в ключе кеша)
            const cacheKey = `${figi}_${days}_${limit}_${maxDate ? new Date(maxDate).toISOString() : 'current'}`;
            if (this.sentimentCache.has(cacheKey)) {
                const cached = this.sentimentCache.get(cacheKey);
                if (Date.now() - cached.timestamp < this.cacheTimeout) {
                    return cached.data;
                }
            }

            const allMessages = [];
            const channelResults = {};

            // Получаем сообщения из каждого канала
            for (const channel of channels) {
                try {
                    const messages = await this.getChannelMessages(channel, figi, days, limit, maxDate);
                    
                    // Дополнительная фильтрация по maxDate если указан (защита от утечки данных)
                    let filteredMessages = messages;
                    if (maxDate) {
                        const maxDateObj = new Date(maxDate);
                        filteredMessages = messages.filter(msg => {
                            const msgDate = new Date(msg.date || msg.timestamp || 0);
                            return msgDate <= maxDateObj;
                        });
                    }
                    
                    allMessages.push(...filteredMessages);
                    channelResults[channel] = {
                        messageCount: filteredMessages.length,
                        sentiment: this.calculateChannelSentiment(filteredMessages)
                    };
                } catch (error) {
                    console.warn(`⚠️ Error getting messages from ${channel}:`, error.message);
                    channelResults[channel] = {
                        messageCount: 0,
                        sentiment: 0,
                        error: error.message
                    };
                }
            }

            // Анализируем общие настроения
            const overallSentiment = this.calculateOverallSentiment(allMessages);
            const confidence = this.calculateConfidence(allMessages);

            const result = {
                sentiment: overallSentiment,
                confidence,
                messageCount: allMessages.length,
                channels: channelResults,
                timestamp: new Date()
            };

            // Кешируем результат
            this.sentimentCache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });

            return result;

        } catch (error) {
            console.error('❌ Error analyzing Telegram sentiment:', error);
            return {
                sentiment: 0,
                confidence: 0,
                messageCount: 0,
                channels: [],
                error: error.message
            };
        }
    }

    /**
     * Получение сообщений из канала
     * @param {string} channel - ID канала
     * @param {string} figi - FIGI инструмента
     * @param {number} days - Количество дней назад
     * @param {number} limit - Максимальное количество сообщений
     * @param {Date|string} maxDate - Максимальная дата сообщений (для предотвращения утечки данных)
     */
    async getChannelMessages(channel, figi, days, limit, maxDate = null) {
        try {
            // В реальной реализации здесь был бы запрос к Telegram API
            // Пока что возвращаем заглушку
            // ВАЖНО: При реализации нужно фильтровать сообщения по maxDate
            return [];
        } catch (error) {
            console.error(`❌ Error getting messages from ${channel}:`, error);
            return [];
        }
    }

    /**
     * Расчет настроений канала
     */
    calculateChannelSentiment(messages) {
        if (messages.length === 0) return 0;

        const sentiments = messages.map(msg => this.analyzeMessageSentiment(msg.text));
        return sentiments.reduce((sum, s) => sum + s, 0) / sentiments.length;
    }

    /**
     * Расчет общих настроений
     */
    calculateOverallSentiment(messages) {
        if (messages.length === 0) return 0;

        const sentiments = messages.map(msg => this.analyzeMessageSentiment(msg.text));
        return sentiments.reduce((sum, s) => sum + s, 0) / sentiments.length;
    }

    /**
     * Расчет уверенности
     */
    calculateConfidence(messages) {
        if (messages.length === 0) return 0;

        // Уверенность зависит от количества сообщений и их релевантности
        const relevance = messages.reduce((sum, msg) => sum + msg.relevance, 0) / messages.length;
        const volume = Math.min(1, messages.length / 50); // Нормализуем до 50 сообщений
        
        return (relevance + volume) / 2;
    }

    /**
     * Анализ настроений сообщения
     */
    analyzeMessageSentiment(text) {
        const positiveWords = [
            'рост', 'вырос', 'поднялся', 'покупка', 'покупать', 'хорошо',
            'отлично', 'прибыль', 'доход', 'успех', 'сильный', 'растет',
            'позитив', 'оптимизм', 'надежда', 'уверенность'
        ];
        
        const negativeWords = [
            'падение', 'упал', 'снизился', 'продажа', 'продавать', 'плохо',
            'убыток', 'потеря', 'слабый', 'падает', 'негатив', 'пессимизм',
            'страх', 'опасение', 'риск', 'проблема'
        ];
        
        const words = text.toLowerCase().split(/\W+/);
        let positiveCount = 0;
        let negativeCount = 0;
        
        words.forEach(word => {
            if (positiveWords.includes(word)) {
                positiveCount++;
            }
            if (negativeWords.includes(word)) {
                negativeCount++;
            }
        });
        
        if (positiveCount + negativeCount === 0) {
            return 0; // Нейтральное
        }
        
        return (positiveCount - negativeCount) / (positiveCount + negativeCount);
    }

    /**
     * Получение статуса сервиса
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            channelsCount: this.channels.size,
            channels: Array.from(this.channels),
            cacheSize: this.sentimentCache.size
        };
    }

    // ============================================================================
    // КЕШИРОВАНИЕ В БАЗЕ ДАННЫХ
    // ============================================================================

    /**
     * Получение кешированных настроений из БД
     */
    async getCachedSentiment(figi, days, limit) {
        try {
            const CachedTelegramSentiment = (await import('../models/CachedTelegramSentiment.js')).default;
            
            const fromDate = new Date();
            fromDate.setDate(fromDate.getDate() - days);
            
            const cachedSentiments = await CachedTelegramSentiment.findAll({
                where: {
                    figi,
                    analyzedAt: {
                        [require('sequelize').Op.gte]: fromDate
                    },
                    expiresAt: {
                        [require('sequelize').Op.gt]: new Date()
                    }
                },
                order: [['analyzedAt', 'DESC']],
                limit
            });

            if (cachedSentiments.length === 0) {
                return {
                    sentiment: 0,
                    confidence: 0,
                    messageCount: 0,
                    channels: {}
                };
            }

            // Агрегируем данные по каналам
            const channels = {};
            let totalSentiment = 0;
            let totalConfidence = 0;
            let totalMessages = 0;

            cachedSentiments.forEach(cached => {
                if (!channels[cached.channelId]) {
                    channels[cached.channelId] = {
                        name: cached.channelName,
                        sentiment: 0,
                        confidence: 0,
                        messageCount: 0,
                        positiveMessages: 0,
                        negativeMessages: 0,
                        neutralMessages: 0
                    };
                }

                channels[cached.channelId].sentiment = cached.sentiment;
                channels[cached.channelId].confidence = cached.confidence;
                channels[cached.channelId].messageCount = cached.messageCount;
                channels[cached.channelId].positiveMessages = cached.positiveMessages;
                channels[cached.channelId].negativeMessages = cached.negativeMessages;
                channels[cached.channelId].neutralMessages = cached.neutralMessages;

                totalSentiment += cached.sentiment * cached.messageCount;
                totalConfidence += cached.confidence;
                totalMessages += cached.messageCount;
            });

            return {
                sentiment: totalMessages > 0 ? totalSentiment / totalMessages : 0,
                confidence: cachedSentiments.length > 0 ? totalConfidence / cachedSentiments.length : 0,
                messageCount: totalMessages,
                channels
            };

        } catch (error) {
            console.error('❌ Ошибка получения кешированных настроений:', error);
            return {
                sentiment: 0,
                confidence: 0,
                messageCount: 0,
                channels: {}
            };
        }
    }

    /**
     * Кеширование настроений в БД
     */
    async cacheSentiment(figi, sentimentData) {
        try {
            const CachedTelegramSentiment = (await import('../models/CachedTelegramSentiment.js')).default;
            
            const sentimentsToCache = Object.entries(sentimentData.channels).map(([channelId, channelData]) => ({
                figi,
                channelId,
                channelName: channelData.name,
                sentiment: channelData.sentiment,
                confidence: channelData.confidence,
                messageCount: channelData.messageCount,
                positiveMessages: channelData.positiveMessages,
                negativeMessages: channelData.negativeMessages,
                neutralMessages: channelData.neutralMessages,
                keywords: channelData.keywords || [],
                analyzedAt: new Date(),
                periodStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                periodEnd: new Date(),
                cachedAt: new Date(),
                expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000) // 6 часов
            }));

            if (sentimentsToCache.length > 0) {
                await CachedTelegramSentiment.bulkCreate(sentimentsToCache, {
                    ignoreDuplicates: true,
                    updateOnDuplicate: ['sentiment', 'confidence', 'messageCount', 'positiveMessages', 'negativeMessages', 'neutralMessages', 'keywords', 'analyzedAt', 'cachedAt', 'expiresAt']
                });

                console.log(`💾 Кешировано ${sentimentsToCache.length} записей настроений для ${figi}`);
            }

        } catch (error) {
            console.error('❌ Ошибка кеширования настроений:', error);
        }
    }

    /**
     * Очистка устаревших настроений из кеша
     */
    async cleanExpiredSentiments() {
        try {
            const CachedTelegramSentiment = (await import('../models/CachedTelegramSentiment.js')).default;
            
            const deletedCount = await CachedTelegramSentiment.destroy({
                where: {
                    expiresAt: {
                        [require('sequelize').Op.lt]: new Date()
                    }
                }
            });

            console.log(`🧹 Очищено ${deletedCount} устаревших записей настроений из кеша`);

        } catch (error) {
            console.error('❌ Ошибка очистки кеша настроений:', error);
        }
    }
}

export default new TelegramSentimentService();
