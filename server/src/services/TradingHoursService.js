import TinkoffApiService from './TinkoffApiService.js';
import OptimizedTelegramService from './OptimizedTelegramService.js';
import Settings from '../models/Settings.js';
import CachedTradingHours from '../models/CachedTradingHours.js';

/**
 * Сервис для работы с торговыми часами
 */
class TradingHoursService {
    constructor() {
        this.isInitialized = false;
        this.settings = {};
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            
            await this.loadSettings();

            // Гарантируем наличие таблицы кеша торговых часов
            try {
                const { default: CachedTradingHours } = await import('../models/CachedTradingHours.js');
                await CachedTradingHours.sync({ force: false });
            } catch (e) {
                console.warn('⚠️ Не удалось синхронизировать таблицу cached_trading_hours:', e.message);
            }
            
            this.isInitialized = true;
        } catch (error) {
            console.error('❌ Ошибка инициализации TradingHoursService:', error);
            throw error;
        }
    }

    /**
     * Загрузка настроек
     */
    async loadSettings() {
        this.settings = {
            enabled: await Settings.getSetting('trading_hours_enabled', true),
            notificationMinutes: await Settings.getSetting('trading_hours_notification_minutes', 15),
            instrumentsCount: await Settings.getSetting('trading_hours_instruments_count', 2),
            cacheTimeout: await Settings.getSetting('trading_hours_cache_timeout', 15)
        };
    }

    /**
     * Проверить торговые часы и отправить уведомления
     */
    async checkAndSendNotifications() {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            if (!this.settings.enabled) {
                return { status: 'disabled' };
            }

            // Получаем список инструментов для проверки
            let instruments = [];
            try {
                instruments = await CachedTradingHours.findAll({
                    limit: this.settings.instrumentsCount,
                    order: [['lastUpdated', 'ASC']]
                });
            } catch (dbError) {
                // Если таблицы нет — создаем и выходим мягко до следующего запуска
                if (dbError?.original?.code === '42P01' || /does not exist/i.test(dbError?.message || '')) {
                    console.warn('⚠️ Таблица cached_trading_hours отсутствует. Создаю...');
                    try {
                        await CachedTradingHours.sync({ force: false });
                        return { status: 'initialized' };
                    } catch (syncErr) {
                        console.error('❌ Не удалось создать таблицу cached_trading_hours:', syncErr);
                        return { status: 'error', error: syncErr.message };
                    }
                }
                throw dbError;
            }

            const results = [];

            for (const instrument of instruments) {
                try {
                    const tradingHours = await this.getTradingHours(instrument.figi);
                    
                    if (tradingHours) {
                        const now = new Date();
                        const nextOpen = new Date(tradingHours.nextOpen);
                        const nextClose = new Date(tradingHours.nextClose);
                        
                        // Проверяем, нужно ли отправить уведомление
                        const minutesToOpen = Math.floor((nextOpen - now) / (1000 * 60));
                        const minutesToClose = Math.floor((nextClose - now) / (1000 * 60));
                        
                        if (minutesToOpen <= this.settings.notificationMinutes && minutesToOpen > 0) {
                            await this.sendNotification(instrument.figi, 'opening', minutesToOpen);
                            results.push({ figi: instrument.figi, type: 'opening', minutes: minutesToOpen });
                        }
                        
                        if (minutesToClose <= this.settings.notificationMinutes && minutesToClose > 0) {
                            await this.sendNotification(instrument.figi, 'closing', minutesToClose);
                            results.push({ figi: instrument.figi, type: 'closing', minutes: minutesToClose });
                        }
                    }
                } catch (error) {
                    console.error(`Ошибка проверки торговых часов для ${instrument.figi}:`, error);
                }
            }

            return { status: 'success', notifications: results };
        } catch (error) {
            console.error('Ошибка проверки торговых часов:', error);
            return { status: 'error', error: error.message };
        }
    }

    /**
     * Получить торговые часы для инструмента
     */
    async getTradingHours(figi) {
        try {
            // Сначала проверяем кеш
            const cached = await CachedTradingHours.findOne({ where: { figi } });
            if (cached && this.isCacheValid(cached)) {
                return {
                    isOpen: cached.isOpen,
                    nextOpen: cached.nextOpen,
                    nextClose: cached.nextClose
                };
            }

            // Получаем от API
            const tradingHours = await TinkoffApiService.getTradingHours(figi);
            
            if (tradingHours) {
                // Получаем ticker по figi
                let ticker = 'UNKNOWN';
                try {
                    const instrument = await TinkoffApiService.getInstrumentByFigi(figi);
                    ticker = instrument?.ticker || figi.substring(0, 10); // fallback
                } catch (error) {
                    console.warn(`Could not get ticker for ${figi}, using fallback`);
                    ticker = figi.substring(0, 10); // используем часть figi как fallback
                }

                // Сохраняем в кеш
                await CachedTradingHours.upsert({
                    figi,
                    ticker,
                    tradingStatus: tradingHours.tradingStatus || 'UNKNOWN',
                    isTrading: tradingHours.isOpen || false,
                    lastPrice: tradingHours.lastPrice || null,
                    lastPriceTime: tradingHours.lastPriceTime || null,
                    apiData: tradingHours,
                    lastUpdated: new Date(),
                    source: 'tinkoff_api'
                });

                return tradingHours;
            }

            return null;
        } catch (error) {
            console.error(`Ошибка получения торговых часов для ${figi}:`, error);
            return null;
        }
    }

    /**
     * Проверить валидность кеша
     */
    isCacheValid(cached) {
        const now = new Date();
        const cacheAge = now - cached.lastUpdated;
        return cacheAge < (this.settings.cacheTimeout * 60 * 1000);
    }

    /**
     * Отправить уведомление
     */
    async sendNotification(figi, type, minutes) {
        try {
            const message = type === 'opening' 
                ? `🔔 Торги по ${figi} откроются через ${minutes} минут`
                : `🔔 Торги по ${figi} закроются через ${minutes} минут`;

            await OptimizedTelegramService.sendNotification({
                type: 'trading_hours',
                message,
                priority: 'normal'
            });
        } catch (error) {
            console.error(`Ошибка отправки уведомления для ${figi}:`, error);
        }
    }

    /**
     * Получить статус сервиса
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            settings: this.settings
        };
    }
}

export default new TradingHoursService();
