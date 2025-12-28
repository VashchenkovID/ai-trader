import Company from '../models/Company.js';
import TradingRequest from '../models/TradingRequest.js';
import PositionStrategy from '../models/PositionStrategy.js';
import SettingsService from './SettingsService.js';
import LoggerService from './LoggerService.js';
import TinkoffApiService from './TinkoffApiService.js';
import { Op } from 'sequelize';

/**
 * Сервис для контроля диверсификации портфеля
 * 
 * Функциональность:
 * - Ограничение по секторам (макс. 20-30% в одном секторе)
 * - Ограничение по капитализации (баланс между крупными и средними)
 * - Географическая диверсификация (если доступны иностранные акции)
 * - Баланс между ростом и дивидендами
 */
class DiversificationService {
    constructor() {
        this.isInitialized = false;
        this.settings = {
            // Ограничения по секторам
            maxSectorExposure: 0.25, // Максимум 25% в одном секторе
            maxSectorExposureStrict: 0.20, // Строгое ограничение 20%
            warningSectorExposure: 0.20, // Предупреждение при 20%
            
            // Ограничения по капитализации
            minLargeCapPercent: 0.40, // Минимум 40% крупных компаний
            maxLargeCapPercent: 0.70, // Максимум 70% крупных компаний
            minMidCapPercent: 0.20, // Минимум 20% средних компаний
            maxMidCapPercent: 0.50, // Максимум 50% средних компаний
            minSmallCapPercent: 0.0, // Минимум 0% малых компаний (опционально)
            maxSmallCapPercent: 0.20, // Максимум 20% малых компаний
            
            // Пороги капитализации (в рублях)
            largeCapThreshold: 500000000000, // 500 млрд руб
            midCapThreshold: 100000000000, // 100 млрд руб
            
            // Географическая диверсификация
            maxCountryExposure: 0.80, // Максимум 80% в одной стране
            preferredCountries: ['RU'], // Предпочтительные страны
            allowForeignStocks: true, // Разрешить иностранные акции
            
            // Баланс роста и дивидендов
            minDividendStocksPercent: 0.20, // Минимум 20% дивидендных акций
            maxDividendStocksPercent: 0.60, // Максимум 60% дивидендных акций
            minGrowthStocksPercent: 0.20, // Минимум 20% акций роста
            maxGrowthStocksPercent: 0.60, // Максимум 60% акций роста
            
            // Общие настройки
            enableStrictChecks: true, // Строгие проверки
            autoRebalance: false, // Автоматическая ребалансировка
            rebalanceThreshold: 0.05 // Порог для ребалансировки (5%)
        };
    }

    async initialize() {
        try {
            LoggerService.info('🌍 Initializing Diversification Service...');
            
            // Загружаем настройки
            await this.loadSettings();
            
            this.isInitialized = true;
            LoggerService.info('✅ Diversification Service initialized');
        } catch (error) {
            LoggerService.error('❌ Failed to initialize Diversification Service:', error);
            throw error;
        }
    }

    /**
     * Загрузка настроек из базы данных
     */
    async loadSettings() {
        try {
            const settings = await SettingsService.getAllSettings('diversification');
            
            if (settings && settings.length > 0) {
                for (const setting of settings) {
                    const key = setting.key.replace('diversification.', '');
                    const value = setting.value;
                    
                    if (key.includes('percent') || key.includes('exposure') || key.includes('threshold') || key.includes('min') || key.includes('max')) {
                        this.settings[key] = parseFloat(value) || this.settings[key];
                    } else if (key.includes('enable') || key.includes('allow') || key.includes('auto')) {
                        this.settings[key] = value === 'true' || value === true;
                    } else if (key === 'preferredCountries') {
                        try {
                            this.settings[key] = JSON.parse(value);
                        } catch (e) {
                            // Оставляем значение по умолчанию
                        }
                    }
                }
            }
        } catch (error) {
            LoggerService.warn('⚠️ Failed to load diversification settings, using defaults:', error.message);
        }
    }

    /**
     * Проверка диверсификации портфеля
     * @param {Array} positions - Массив позиций портфеля
     * @param {number} totalValue - Общая стоимость портфеля
     * @returns {Object} - Результат проверки
     */
    async checkDiversification(positions, totalValue) {
        try {
            const results = {
                isValid: true,
                warnings: [],
                errors: [],
                sectorAnalysis: {},
                capitalizationAnalysis: {},
                geographicAnalysis: {},
                growthDividendAnalysis: {},
                recommendations: []
            };

            // 1. Анализ секторов
            const sectorAnalysis = await this.analyzeSectors(positions, totalValue);
            results.sectorAnalysis = sectorAnalysis;
            
            if (sectorAnalysis.violations && sectorAnalysis.violations.length > 0) {
                results.isValid = false;
                results.errors.push(...sectorAnalysis.violations);
            }
            
            if (sectorAnalysis.warnings && sectorAnalysis.warnings.length > 0) {
                results.warnings.push(...sectorAnalysis.warnings);
            }

            // 2. Анализ капитализации
            const capAnalysis = await this.analyzeCapitalization(positions, totalValue);
            results.capitalizationAnalysis = capAnalysis;
            
            if (capAnalysis.violations && capAnalysis.violations.length > 0) {
                results.isValid = false;
                results.errors.push(...capAnalysis.violations);
            }
            
            if (capAnalysis.warnings && capAnalysis.warnings.length > 0) {
                results.warnings.push(...capAnalysis.warnings);
            }

            // 3. Географический анализ
            const geoAnalysis = await this.analyzeGeography(positions, totalValue);
            results.geographicAnalysis = geoAnalysis;
            
            if (geoAnalysis.violations && geoAnalysis.violations.length > 0) {
                results.isValid = false;
                results.errors.push(...geoAnalysis.violations);
            }
            
            if (geoAnalysis.warnings && geoAnalysis.warnings.length > 0) {
                results.warnings.push(...geoAnalysis.warnings);
            }

            // 4. Анализ роста и дивидендов
            const growthDivAnalysis = await this.analyzeGrowthDividends(positions, totalValue);
            results.growthDividendAnalysis = growthDivAnalysis;
            
            if (growthDivAnalysis.violations && growthDivAnalysis.violations.length > 0) {
                results.isValid = false;
                results.errors.push(...growthDivAnalysis.violations);
            }
            
            if (growthDivAnalysis.warnings && growthDivAnalysis.warnings.length > 0) {
                results.warnings.push(...growthDivAnalysis.warnings);
            }

            // Генерируем рекомендации
            results.recommendations = this.generateRecommendations(results);

            return results;
        } catch (error) {
            LoggerService.error('❌ Error checking diversification:', error);
            throw error;
        }
    }

    /**
     * Анализ секторов
     */
    async analyzeSectors(positions, totalValue) {
        const sectors = {};
        const result = {
            sectors: {},
            totalExposure: {},
            violations: [],
            warnings: []
        };

        // Группируем позиции по секторам
        for (const position of positions) {
            const figi = position.figi || position.symbol;
            const value = position.currentValue || position.value || 0;
            
            // Получаем информацию о компании
            let company = null;
            try {
                company = await Company.findOne({ where: { figi } });
            } catch (error) {
                LoggerService.warn(`⚠️ Could not find company for ${figi}:`, error.message);
            }
            
            const sector = company?.sector || position.sector || 'Unknown';
            
            if (!sectors[sector]) {
                sectors[sector] = {
                    positions: [],
                    totalValue: 0,
                    exposure: 0
                };
            }
            
            sectors[sector].positions.push({
                figi,
                ticker: position.ticker || company?.ticker,
                value
            });
            sectors[sector].totalValue += value;
        }

        // Рассчитываем экспозицию
        for (const [sector, data] of Object.entries(sectors)) {
            const exposure = totalValue > 0 ? data.totalValue / totalValue : 0;
            data.exposure = exposure;
            result.sectors[sector] = data;
            result.totalExposure[sector] = exposure;

            // Проверяем ограничения
            const maxExposure = this.settings.enableStrictChecks 
                ? this.settings.maxSectorExposureStrict 
                : this.settings.maxSectorExposure;

            if (exposure > maxExposure) {
                result.violations.push({
                    type: 'sector_exposure',
                    sector,
                    exposure: (exposure * 100).toFixed(2) + '%',
                    maxExposure: (maxExposure * 100).toFixed(2) + '%',
                    message: `Сектор ${sector} превышает максимальную экспозицию: ${(exposure * 100).toFixed(2)}% > ${(maxExposure * 100).toFixed(2)}%`
                });
            } else if (exposure > this.settings.warningSectorExposure) {
                result.warnings.push({
                    type: 'sector_exposure_warning',
                    sector,
                    exposure: (exposure * 100).toFixed(2) + '%',
                    message: `Сектор ${sector} близок к лимиту: ${(exposure * 100).toFixed(2)}%`
                });
            }
        }

        return result;
    }

    /**
     * Анализ капитализации
     */
    async analyzeCapitalization(positions, totalValue) {
        const caps = {
            large: { positions: [], totalValue: 0, exposure: 0 },
            mid: { positions: [], totalValue: 0, exposure: 0 },
            small: { positions: [], totalValue: 0, exposure: 0 },
            unknown: { positions: [], totalValue: 0, exposure: 0 }
        };

        const result = {
            distribution: {},
            violations: [],
            warnings: []
        };

        // Группируем позиции по капитализации
        for (const position of positions) {
            const figi = position.figi || position.symbol;
            const value = position.currentValue || position.value || 0;
            
            // Получаем информацию о компании
            let company = null;
            try {
                company = await Company.findOne({ where: { figi } });
            } catch (error) {
                LoggerService.warn(`⚠️ Could not find company for ${figi}:`, error.message);
            }
            
            const marketCap = company?.marketCap || position.marketCap || null;
            
            let capCategory = 'unknown';
            if (marketCap) {
                if (marketCap >= this.settings.largeCapThreshold) {
                    capCategory = 'large';
                } else if (marketCap >= this.settings.midCapThreshold) {
                    capCategory = 'mid';
                } else {
                    capCategory = 'small';
                }
            }
            
            caps[capCategory].positions.push({
                figi,
                ticker: position.ticker || company?.ticker,
                value,
                marketCap
            });
            caps[capCategory].totalValue += value;
        }

        // Рассчитываем экспозицию
        for (const [category, data] of Object.entries(caps)) {
            const exposure = totalValue > 0 ? data.totalValue / totalValue : 0;
            data.exposure = exposure;
            result.distribution[category] = data;
        }

        // Проверяем ограничения
        const largeExposure = result.distribution.large?.exposure || 0;
        const midExposure = result.distribution.mid?.exposure || 0;
        const smallExposure = result.distribution.small?.exposure || 0;

        if (largeExposure < this.settings.minLargeCapPercent) {
            result.violations.push({
                type: 'capitalization_min',
                category: 'large',
                exposure: (largeExposure * 100).toFixed(2) + '%',
                minExposure: (this.settings.minLargeCapPercent * 100).toFixed(2) + '%',
                message: `Недостаточно крупных компаний: ${(largeExposure * 100).toFixed(2)}% < ${(this.settings.minLargeCapPercent * 100).toFixed(2)}%`
            });
        }

        if (largeExposure > this.settings.maxLargeCapPercent) {
            result.violations.push({
                type: 'capitalization_max',
                category: 'large',
                exposure: (largeExposure * 100).toFixed(2) + '%',
                maxExposure: (this.settings.maxLargeCapPercent * 100).toFixed(2) + '%',
                message: `Слишком много крупных компаний: ${(largeExposure * 100).toFixed(2)}% > ${(this.settings.maxLargeCapPercent * 100).toFixed(2)}%`
            });
        }

        if (midExposure < this.settings.minMidCapPercent) {
            result.warnings.push({
                type: 'capitalization_warning',
                category: 'mid',
                exposure: (midExposure * 100).toFixed(2) + '%',
                minExposure: (this.settings.minMidCapPercent * 100).toFixed(2) + '%',
                message: `Рекомендуется больше средних компаний: ${(midExposure * 100).toFixed(2)}% < ${(this.settings.minMidCapPercent * 100).toFixed(2)}%`
            });
        }

        if (smallExposure > this.settings.maxSmallCapPercent) {
            result.violations.push({
                type: 'capitalization_max',
                category: 'small',
                exposure: (smallExposure * 100).toFixed(2) + '%',
                maxExposure: (this.settings.maxSmallCapPercent * 100).toFixed(2) + '%',
                message: `Слишком много малых компаний: ${(smallExposure * 100).toFixed(2)}% > ${(this.settings.maxSmallCapPercent * 100).toFixed(2)}%`
            });
        }

        return result;
    }

    /**
     * Географический анализ
     */
    async analyzeGeography(positions, totalValue) {
        const countries = {};
        const result = {
            distribution: {},
            violations: [],
            warnings: []
        };

        // Группируем позиции по странам
        for (const position of positions) {
            const figi = position.figi || position.symbol;
            const value = position.currentValue || position.value || 0;
            
            // Получаем информацию о компании
            let company = null;
            try {
                company = await Company.findOne({ where: { figi } });
            } catch (error) {
                LoggerService.warn(`⚠️ Could not find company for ${figi}:`, error.message);
            }
            
            const country = company?.country || position.country || 'RU';
            
            if (!countries[country]) {
                countries[country] = {
                    positions: [],
                    totalValue: 0,
                    exposure: 0
                };
            }
            
            countries[country].positions.push({
                figi,
                ticker: position.ticker || company?.ticker,
                value
            });
            countries[country].totalValue += value;
        }

        // Рассчитываем экспозицию
        for (const [country, data] of Object.entries(countries)) {
            const exposure = totalValue > 0 ? data.totalValue / totalValue : 0;
            data.exposure = exposure;
            result.distribution[country] = data;

            // Проверяем ограничения
            if (exposure > this.settings.maxCountryExposure) {
                result.violations.push({
                    type: 'country_exposure',
                    country,
                    exposure: (exposure * 100).toFixed(2) + '%',
                    maxExposure: (this.settings.maxCountryExposure * 100).toFixed(2) + '%',
                    message: `Страна ${country} превышает максимальную экспозицию: ${(exposure * 100).toFixed(2)}% > ${(this.settings.maxCountryExposure * 100).toFixed(2)}%`
                });
            }
        }

        return result;
    }

    /**
     * Анализ роста и дивидендов
     */
    async analyzeGrowthDividends(positions, totalValue) {
        const categories = {
            growth: { positions: [], totalValue: 0, exposure: 0 },
            dividend: { positions: [], totalValue: 0, exposure: 0 },
            balanced: { positions: [], totalValue: 0, exposure: 0 },
            unknown: { positions: [], totalValue: 0, exposure: 0 }
        };

        const result = {
            distribution: {},
            violations: [],
            warnings: []
        };

        // Группируем позиции по категориям
        // TODO: Определять категорию на основе дивидендной доходности и роста
        // Пока используем упрощенную логику
        for (const position of positions) {
            const figi = position.figi || position.symbol;
            const value = position.currentValue || position.value || 0;
            
            // Упрощенная категоризация (можно улучшить)
            let category = 'balanced';
            if (position.dividendYield && position.dividendYield > 0.05) {
                category = 'dividend';
            } else if (position.growthRate && position.growthRate > 0.15) {
                category = 'growth';
            }
            
            categories[category].positions.push({
                figi,
                ticker: position.ticker,
                value
            });
            categories[category].totalValue += value;
        }

        // Рассчитываем экспозицию
        for (const [category, data] of Object.entries(categories)) {
            const exposure = totalValue > 0 ? data.totalValue / totalValue : 0;
            data.exposure = exposure;
            result.distribution[category] = data;
        }

        // Проверяем ограничения
        const dividendExposure = result.distribution.dividend?.exposure || 0;
        const growthExposure = result.distribution.growth?.exposure || 0;

        if (dividendExposure < this.settings.minDividendStocksPercent) {
            result.warnings.push({
                type: 'dividend_min',
                exposure: (dividendExposure * 100).toFixed(2) + '%',
                minExposure: (this.settings.minDividendStocksPercent * 100).toFixed(2) + '%',
                message: `Рекомендуется больше дивидендных акций: ${(dividendExposure * 100).toFixed(2)}% < ${(this.settings.minDividendStocksPercent * 100).toFixed(2)}%`
            });
        }

        if (dividendExposure > this.settings.maxDividendStocksPercent) {
            result.violations.push({
                type: 'dividend_max',
                exposure: (dividendExposure * 100).toFixed(2) + '%',
                maxExposure: (this.settings.maxDividendStocksPercent * 100).toFixed(2) + '%',
                message: `Слишком много дивидендных акций: ${(dividendExposure * 100).toFixed(2)}% > ${(this.settings.maxDividendStocksPercent * 100).toFixed(2)}%`
            });
        }

        if (growthExposure < this.settings.minGrowthStocksPercent) {
            result.warnings.push({
                type: 'growth_min',
                exposure: (growthExposure * 100).toFixed(2) + '%',
                minExposure: (this.settings.minGrowthStocksPercent * 100).toFixed(2) + '%',
                message: `Рекомендуется больше акций роста: ${(growthExposure * 100).toFixed(2)}% < ${(this.settings.minGrowthStocksPercent * 100).toFixed(2)}%`
            });
        }

        if (growthExposure > this.settings.maxGrowthStocksPercent) {
            result.violations.push({
                type: 'growth_max',
                exposure: (growthExposure * 100).toFixed(2) + '%',
                maxExposure: (this.settings.maxGrowthStocksPercent * 100).toFixed(2) + '%',
                message: `Слишком много акций роста: ${(growthExposure * 100).toFixed(2)}% > ${(this.settings.maxGrowthStocksPercent * 100).toFixed(2)}%`
            });
        }

        return result;
    }

    /**
     * Генерация рекомендаций
     */
    generateRecommendations(analysis) {
        const recommendations = [];

        // Рекомендации по секторам
        if (analysis.sectorAnalysis.violations && analysis.sectorAnalysis.violations.length > 0) {
            recommendations.push({
                type: 'sector_rebalance',
                priority: 'high',
                message: 'Необходимо снизить экспозицию в перегруженных секторах'
            });
        }

        // Рекомендации по капитализации
        if (analysis.capitalizationAnalysis.violations && analysis.capitalizationAnalysis.violations.length > 0) {
            recommendations.push({
                type: 'capitalization_rebalance',
                priority: 'high',
                message: 'Необходимо скорректировать распределение по капитализации'
            });
        }

        // Рекомендации по географии
        if (analysis.geographicAnalysis.violations && analysis.geographicAnalysis.violations.length > 0) {
            recommendations.push({
                type: 'geographic_diversification',
                priority: 'medium',
                message: 'Рекомендуется увеличить географическую диверсификацию'
            });
        }

        return recommendations;
    }

    /**
     * Проверка возможности добавления новой позиции
     * @param {string} figi - FIGI инструмента
     * @param {number} value - Стоимость позиции
     * @param {Array} currentPositions - Текущие позиции
     * @param {number} totalValue - Общая стоимость портфеля
     * @returns {Object} - Результат проверки
     */
    async canAddPosition(figi, value, currentPositions, totalValue) {
        try {
            // Создаем временный массив позиций с новой позицией
            const testPositions = [...currentPositions, {
                figi,
                value,
                currentValue: value
            }];
            
            const newTotalValue = totalValue + value;
            
            // Проверяем диверсификацию
            const analysis = await this.checkDiversification(testPositions, newTotalValue);
            
            return {
                canAdd: analysis.isValid,
                warnings: analysis.warnings,
                errors: analysis.errors,
                analysis
            };
        } catch (error) {
            LoggerService.error(`❌ Error checking if position can be added:`, error);
            return {
                canAdd: false,
                errors: [{ message: `Error: ${error.message}` }]
            };
        }
    }

    /**
     * Получение настроек
     */
    getSettings() {
        return { ...this.settings };
    }

    /**
     * Обновление настроек
     */
    async updateSettings(newSettings) {
        try {
            this.settings = { ...this.settings, ...newSettings };
            
            for (const [key, value] of Object.entries(newSettings)) {
                await SettingsService.setSetting(`diversification.${key}`, value, {
                    description: `Настройка диверсификации: ${key}`,
                    category: 'diversification',
                    dataType: typeof value === 'number' ? 'number' : (typeof value === 'boolean' ? 'boolean' : 'string')
                });
            }
            
            LoggerService.info('✅ Diversification settings updated');
            return true;
        } catch (error) {
            LoggerService.error('❌ Failed to update diversification settings:', error);
            throw error;
        }
    }
}

export default new DiversificationService();

