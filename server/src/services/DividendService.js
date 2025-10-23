import TinkoffApiService from './TinkoffApiService.js';
import CachedInstrument from '../models/CachedInstrument.js';

/**
 * Сервис для работы с дивидендами
 */
class DividendService {
    constructor() {
        this.isInitialized = false;
        this.priorityInstruments = new Set();
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        try {
            console.log('🚀 Инициализация DividendService...');
            this.isInitialized = true;
            console.log('✅ DividendService инициализирован');
        } catch (error) {
            console.error('❌ Ошибка инициализации DividendService:', error);
            throw error;
        }
    }

    /**
     * Добавить инструмент в приоритетный список для обновления дивидендов
     */
    addPriorityInstrument(figi) {
        if (figi) {
            this.priorityInstruments.add(figi);
        }
    }

    /**
     * Обновить дивиденды для инструмента
     */
    async updateDividends(figi) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            // Получаем дивиденды от Tinkoff API
            const dividends = await TinkoffApiService.getDividends(figi);
            
            if (dividends && dividends.dividends) {
                // Обновляем дивидендную доходность в кеше
                const totalDividends = dividends.dividends.reduce((sum, div) => {
                    return sum + (div.dividendNet || 0);
                }, 0);

                // Получаем текущую цену для расчета доходности
                const instrument = await CachedInstrument.findOne({ where: { figi } });
                if (instrument && instrument.lastPrice) {
                    const dividendYield = totalDividends / instrument.lastPrice;
                    
                    await CachedInstrument.update(
                        { dividendYield },
                        { where: { figi } }
                    );
                }
            }

            return dividends;
        } catch (error) {
            console.error(`Ошибка обновления дивидендов для ${figi}:`, error);
            return null;
        }
    }

    /**
     * Получить дивиденды для инструмента
     */
    async getDividends(figi, from, to) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            return await TinkoffApiService.getDividends(figi, from, to);
        } catch (error) {
            console.error(`Ошибка получения дивидендов для ${figi}:`, error);
            return null;
        }
    }

    /**
     * Обновить дивиденды для всех приоритетных инструментов
     */
    async updatePriorityDividends() {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            const results = [];
            for (const figi of this.priorityInstruments) {
                try {
                    const result = await this.updateDividends(figi);
                    results.push({ figi, success: true, data: result });
                } catch (error) {
                    results.push({ figi, success: false, error: error.message });
                }
            }

            return results;
        } catch (error) {
            console.error('Ошибка обновления приоритетных дивидендов:', error);
            return [];
        }
    }

    /**
     * Получить статус сервиса
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            priorityInstrumentsCount: this.priorityInstruments.size,
            priorityInstruments: Array.from(this.priorityInstruments)
        };
    }
}

export default DividendService;
