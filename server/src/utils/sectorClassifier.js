import CachedInstrument from '../models/CachedInstrument.js';
import LoggerService from '../services/LoggerService.js';

/**
 * Утилита для классификации инструментов по секторам
 * Фаза 4.3.1: Анализ по секторам и корреляциям
 */
class SectorClassifier {
    constructor() {
        // Маппинг секторов (можно расширить)
        this.sectorMapping = {
            // Технологии
            'technology': ['технологии', 'technology', 'it', 'информационные технологии', 'software', 'hardware'],
            // Финансы
            'finance': ['финансы', 'finance', 'banking', 'банки', 'финансовые услуги', 'financial services'],
            // Энергетика
            'energy': ['энергетика', 'energy', 'нефть', 'газ', 'oil', 'gas', 'электроэнергетика'],
            // Потребительские товары
            'consumer': ['потребительские товары', 'consumer', 'розничная торговля', 'retail', 'fcmg'],
            // Здравоохранение
            'healthcare': ['здравоохранение', 'healthcare', 'медицина', 'pharma', 'pharmaceutical'],
            // Промышленность
            'industrial': ['промышленность', 'industrial', 'машиностроение', 'engineering'],
            // Недвижимость
            'real_estate': ['недвижимость', 'real estate', 'reit', 'риэлторская деятельность'],
            // Материалы
            'materials': ['материалы', 'materials', 'металлургия', 'химия', 'metals', 'chemicals'],
            // Телекоммуникации
            'telecommunications': ['телекоммуникации', 'telecommunications', 'telecom', 'связь'],
            // Коммунальные услуги
            'utilities': ['коммунальные услуги', 'utilities', 'энергоснабжение'],
            // Транспорт
            'transportation': ['транспорт', 'transportation', 'логистика', 'logistics'],
            // Другое
            'other': ['другое', 'other', 'прочее']
        };
    }

    /**
     * Классифицирует инструмент по сектору
     * @param {string|Object} instrument - FIGI или объект CachedInstrument
     * @returns {Promise<string>} Название сектора
     */
    async classifySector(instrument) {
        try {
            let instrumentData;
            
            if (typeof instrument === 'string') {
                // Если передан FIGI, получаем инструмент из БД
                instrumentData = await CachedInstrument.findOne({
                    where: { figi: instrument }
                });
            } else {
                instrumentData = instrument;
            }

            if (!instrumentData) {
                return 'other';
            }

            // Если сектор уже указан в БД, используем его
            if (instrumentData.sector) {
                return this.normalizeSector(instrumentData.sector);
            }

            // Пытаемся определить сектор по названию
            const name = (instrumentData.name || '').toLowerCase();
            const ticker = (instrumentData.ticker || '').toLowerCase();
            const apiData = instrumentData.apiData || {};

            // Проверяем каждый сектор
            for (const [sector, keywords] of Object.entries(this.sectorMapping)) {
                for (const keyword of keywords) {
                    if (name.includes(keyword) || ticker.includes(keyword)) {
                        return sector;
                    }
                }
            }

            // Проверяем apiData на наличие информации о секторе
            if (apiData.sector) {
                return this.normalizeSector(apiData.sector);
            }

            return 'other';
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error classifying sector', {
                    service: 'SectorClassifier',
                    error: { message: error.message }
                });
            }
            return 'other';
        }
    }

    /**
     * Нормализует название сектора
     * @param {string} sector - Название сектора
     * @returns {string} Нормализованное название
     */
    normalizeSector(sector) {
        if (!sector) return 'other';
        
        const normalized = sector.toLowerCase().trim();
        
        // Проверяем маппинг
        for (const [key, keywords] of Object.entries(this.sectorMapping)) {
            if (keywords.some(kw => normalized.includes(kw))) {
                return key;
            }
        }

        // Если не найдено, возвращаем 'other'
        return 'other';
    }

    /**
     * Группирует инструменты по секторам
     * @param {Array<string>} figis - Массив FIGI
     * @returns {Promise<Object>} Объект { sector: [figis] }
     */
    async groupBySector(figis) {
        const grouped = {};
        
        for (const figi of figis) {
            const sector = await this.classifySector(figi);
            if (!grouped[sector]) {
                grouped[sector] = [];
            }
            grouped[sector].push(figi);
        }

        return grouped;
    }

    /**
     * Получает все доступные сектора
     * @returns {Array<string>} Массив названий секторов
     */
    getAvailableSectors() {
        return Object.keys(this.sectorMapping);
    }

    /**
     * Обновляет сектор для инструмента в БД
     * @param {string} figi - FIGI инструмента
     * @param {string} sector - Название сектора
     * @returns {Promise<boolean>} Успешность обновления
     */
    async updateInstrumentSector(figi, sector) {
        try {
            const normalizedSector = this.normalizeSector(sector);
            await CachedInstrument.update(
                { sector: normalizedSector },
                { where: { figi } }
            );
            return true;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error updating instrument sector', {
                    service: 'SectorClassifier',
                    figi,
                    error: { message: error.message }
                });
            }
            return false;
        }
    }

    /**
     * Массовое обновление секторов для всех инструментов
     * @param {number} batchSize - Размер батча
     * @returns {Promise<Object>} Статистика обновления
     */
    async updateAllSectors(batchSize = 100) {
        try {
            const instruments = await CachedInstrument.findAll({
                where: {
                    isActive: true
                },
                limit: 10000 // Ограничение для безопасности
            });

            let updated = 0;
            let skipped = 0;
            let errors = 0;

            for (let i = 0; i < instruments.length; i += batchSize) {
                const batch = instruments.slice(i, i + batchSize);
                
                for (const instrument of batch) {
                    try {
                        const currentSector = instrument.sector;
                        const classifiedSector = await this.classifySector(instrument);
                        
                        if (currentSector !== classifiedSector) {
                            await this.updateInstrumentSector(instrument.figi, classifiedSector);
                            updated++;
                        } else {
                            skipped++;
                        }
                    } catch (error) {
                        errors++;
                        if (LoggerService.isInitialized) {
                            LoggerService.error('Error updating sector for instrument', {
                                service: 'SectorClassifier',
                                figi: instrument.figi,
                                error: { message: error.message }
                            });
                        }
                    }
                }
            }

            return {
                total: instruments.length,
                updated,
                skipped,
                errors
            };
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error in updateAllSectors', {
                    service: 'SectorClassifier',
                    error: { message: error.message }
                });
            }
            throw error;
        }
    }
}

export default new SectorClassifier();

