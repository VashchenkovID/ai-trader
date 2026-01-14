import CachedTradingHours from '../models/CachedTradingHours.js';
import TinkoffApiService from './TinkoffApiService.js';
import Settings from '../models/Settings.js';
import { Op } from 'sequelize';

/**
 * Сервис для кеширования торговых часов
 */
class TradingHoursCacheService {
    constructor() {
        this.isInitialized = false;
        this.cacheTimeout = 15 * 60 * 1000; // 15 минут по умолчанию
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            
            // Загружаем настройки кеша
            this.cacheTimeout = await Settings.getSetting('trading_hours_cache_timeout', 15) * 60 * 1000;
            
            this.isInitialized = true;
        } catch (error) {
            console.error('❌ Ошибка инициализации TradingHoursCacheService:', error);
            throw error;
        }
    }

    /**
     * Получить торговые часы из кеша или API
     */
    async getTradingHours(figi) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            // Проверяем кеш
            const cached = await CachedTradingHours.findOne({ where: { figi } });
            
            if (cached && this.isCacheValid(cached)) {
                return {
                    isOpen: cached.isOpen,
                    nextOpen: cached.nextOpen,
                    nextClose: cached.nextClose,
                    fromCache: true
                };
            }

            // Получаем от API
            const tradingHours = await TinkoffApiService.getTradingHours(figi);
            
            if (tradingHours) {
                // Сохраняем в кеш
                await this.cacheTradingHours(figi, tradingHours);
                return {
                    ...tradingHours,
                    fromCache: false
                };
            }

            return null;
        } catch (error) {
            console.error(`Ошибка получения торговых часов для ${figi}:`, error);
            return null;
        }
    }

    /**
     * Кешировать торговые часы для конкретного инструмента
     */
    async cacheTradingHours(figi, tradingHours) {
        try {
            // Получаем ticker по figi
            let ticker = 'UNKNOWN';
            try {
                const instrument = await TinkoffApiService.getInstrumentByFigi(figi);
                ticker = instrument?.ticker || figi.substring(0, 10); // fallback
            } catch (error) {
                console.warn(`Could not get ticker for ${figi}, using fallback`);
                ticker = figi.substring(0, 10); // используем часть figi как fallback
            }

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
        } catch (error) {
            console.error(`Ошибка кеширования торговых часов для ${figi}:`, error);
        }
    }

    /**
     * Обновить кеш торговых часов (для планировщика)
     */
    async updateTradingHoursCache() {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            console.log('🔄 Updating trading hours cache...');
            
            // Очищаем устаревший кеш
            await this.cleanExpiredCache();
            
            console.log('✅ Trading hours cache update completed');
        } catch (error) {
            console.error('❌ Error updating trading hours cache:', error);
            throw error;
        }
    }

    /**
     * Проверить валидность кеша
     */
    isCacheValid(cached) {
        const now = new Date();
        const cacheAge = now - cached.lastUpdated;
        return cacheAge < this.cacheTimeout;
    }

    /**
     * Очистить устаревший кеш
     */
    async cleanExpiredCache() {
        try {
            const expiredTime = new Date(Date.now() - this.cacheTimeout);
            
            const deleted = await CachedTradingHours.destroy({
                where: {
                    lastUpdated: {
                        [Op.lt]: expiredTime
                    }
                }
            });

            console.log(`Очищено ${deleted} устаревших записей торговых часов`);
            return deleted;
        } catch (error) {
            console.error('Ошибка очистки кеша торговых часов:', error);
            return 0;
        }
    }

    /**
     * Получить статистику кеша
     */
    async getCacheStats() {
        try {
            const total = await CachedTradingHours.count();
            const valid = await CachedTradingHours.count({
                where: {
                    lastUpdated: {
                        [Op.gte]: new Date(Date.now() - this.cacheTimeout)
                    }
                }
            });

            return {
                total,
                valid,
                expired: total - valid,
                cacheTimeout: this.cacheTimeout
            };
        } catch (error) {
            console.error('Ошибка получения статистики кеша:', error);
            return { total: 0, valid: 0, expired: 0, cacheTimeout: this.cacheTimeout };
        }
    }

    /**
     * Получить статус сервиса
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            cacheTimeout: this.cacheTimeout
        };
    }
}

export default new TradingHoursCacheService();
