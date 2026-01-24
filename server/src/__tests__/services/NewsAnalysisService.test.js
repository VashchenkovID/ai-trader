import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Мокируем зависимости ДО импорта тестируемого модуля
jest.mock('../../services/LoggerService.js', () => ({
    __esModule: true,
    default: {
        isInitialized: true,
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    }
}));

// Импортируем после моков
import NewsAnalysisService from '../../services/NewsAnalysisService.js';

describe('NewsAnalysisService - Фаза 3, задача 3.4: Расширение анализа новостей', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        if (!NewsAnalysisService.isInitialized) {
            await NewsAnalysisService.initialize();
        }
    });

    describe('3.4.1. Классификация важности событий', () => {
        it('should classify earnings events correctly', () => {
            const article = {
                title: 'Компания опубликовала отчет за квартал',
                description: 'Выручка выросла на 20%, прибыль увеличилась'
            };

            const classification = NewsAnalysisService.classifyEventImportance(article);

            expect(classification.category).toBe('earnings');
            expect(classification.priority).toBeGreaterThan(0.8);
            expect(classification.isHighPriority).toBe(true);
            expect(classification.matchedPatterns.length).toBeGreaterThan(0);
        });

        it('should classify mergers events correctly', () => {
            const article = {
                title: 'Слияние двух компаний',
                description: 'Объявлено о поглощении компании'
            };

            const classification = NewsAnalysisService.classifyEventImportance(article);

            expect(classification.category).toBe('mergers');
            expect(classification.priority).toBeGreaterThan(0.8);
            expect(classification.isHighPriority).toBe(true);
        });

        it('should classify macro events correctly', () => {
            const article = {
                title: 'ЦБ повысил ключевую ставку',
                description: 'Центробанк объявил о решении по инфляции'
            };

            const classification = NewsAnalysisService.classifyEventImportance(article);

            expect(classification.category).toBe('macro');
            expect(classification.priority).toBeGreaterThan(0.7);
            expect(classification.isHighPriority).toBe(true);
        });

        it('should classify dividends events correctly', () => {
            const article = {
                title: 'Объявлены дивиденды',
                description: 'Совет директоров принял решение о выплате дивидендов'
            };

            const classification = NewsAnalysisService.classifyEventImportance(article);

            expect(classification.category).toBe('dividends');
            expect(classification.priority).toBeGreaterThan(0.7);
        });

        it('should increase priority for multiple event types', () => {
            const article = {
                title: 'Отчет за квартал и слияние компаний',
                description: 'Компания опубликовала результаты квартала и объявила о поглощении'
            };

            const classification = NewsAnalysisService.classifyEventImportance(article);

            expect(classification.matchedPatterns.length).toBeGreaterThan(1);
            expect(classification.priority).toBeGreaterThan(0.8);
        });

        it('should return general category for unknown events', () => {
            const article = {
                title: 'Обычная новость',
                description: 'Ничего особенного не произошло'
            };

            const classification = NewsAnalysisService.classifyEventImportance(article);

            expect(classification.category).toBe('general');
            expect(classification.priority).toBe(0.5);
            expect(classification.isHighPriority).toBe(false);
        });
    });

    describe('3.4.2. Временное затухание влияния новостей', () => {
        it('should return 1.0 for fresh news (today)', () => {
            const article = {
                publishedAt: new Date()
            };

            const decay = NewsAnalysisService.calculateTimeDecay(article);

            expect(decay).toBeCloseTo(1.0, 1);
        });

        it('should return lower decay for older news', () => {
            const article = {
                publishedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 дней назад
            };

            const decay = NewsAnalysisService.calculateTimeDecay(article, new Date(), 7);

            expect(decay).toBeLessThan(1.0);
            expect(decay).toBeGreaterThan(0);
            // Через период полураспада должно быть примерно 0.5
            expect(decay).toBeCloseTo(0.5, 1);
        });

        it('should return very low decay for very old news', () => {
            const article = {
                publishedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 дней назад
            };

            const decay = NewsAnalysisService.calculateTimeDecay(article, new Date(), 7);

            expect(decay).toBeLessThan(0.1);
            expect(decay).toBeGreaterThanOrEqual(0);
        });

        it('should return 0 for news without publishedAt', () => {
            const article = {};

            const decay = NewsAnalysisService.calculateTimeDecay(article);

            expect(decay).toBe(0);
        });

        it('should apply time decay to news array', () => {
            const now = new Date();
            const news = [
                {
                    title: 'Fresh news',
                    publishedAt: now,
                    sentiment: 0.8,
                    relevance: 0.9
                },
                {
                    title: 'Old news',
                    publishedAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
                    sentiment: 0.8,
                    relevance: 0.9
                }
            ];

            const decayedNews = NewsAnalysisService.applyTimeDecayToNews(news, now, 7);

            expect(decayedNews.length).toBe(2);
            expect(decayedNews[0].timeDecayFactor).toBeCloseTo(1.0, 1);
            expect(decayedNews[1].timeDecayFactor).toBeLessThan(1.0);
            expect(decayedNews[0].adjustedSentiment).toBeGreaterThan(decayedNews[1].adjustedSentiment);
            expect(decayedNews[0].adjustedRelevance).toBeGreaterThan(decayedNews[1].adjustedRelevance);
        });
    });

    describe('3.4.3. Связь новостей с рекомендациями', () => {
        it('should calculate feature importance for news categories', async () => {
            const mockGetCachedNews = jest.fn().mockResolvedValue([
                {
                    title: 'Отчет за квартал',
                    description: 'Прибыль выросла',
                    publishedAt: new Date(),
                    sentiment: 0.8,
                    relevance: 0.9
                },
                {
                    title: 'Слияние компаний',
                    description: 'Объявлено о поглощении',
                    publishedAt: new Date(),
                    sentiment: 0.6,
                    relevance: 0.8
                }
            ]);

            NewsAnalysisService.getCachedNews = mockGetCachedNews;

            const result = await NewsAnalysisService.analyzeNewsFeatureImportance('TEST_FIGI', 30);

            expect(result.featureImportance).toBeDefined();
            expect(result.historicalImpact).toBeDefined();
            expect(result.newsCount).toBeGreaterThan(0);
            expect(result.topCategories).toBeDefined();
        });

        it('should return empty result when no news available', async () => {
            const mockGetCachedNews = jest.fn().mockResolvedValue([]);
            NewsAnalysisService.getCachedNews = mockGetCachedNews;

            const result = await NewsAnalysisService.analyzeNewsFeatureImportance('TEST_FIGI', 30);

            expect(result.featureImportance).toEqual({});
            expect(result.historicalImpact).toEqual({});
            expect(result.newsCount).toBe(0);
            expect(result.averageImpact).toBe(0);
        });

        it('should prioritize high priority news in feature importance', async () => {
            const now = new Date();
            const mockGetCachedNews = jest.fn().mockResolvedValue([
                {
                    title: 'Критический отчет',
                    description: 'Результаты квартала',
                    publishedAt: now,
                    sentiment: 0.9,
                    relevance: 1.0
                },
                {
                    title: 'Обычная новость',
                    description: 'Ничего особенного',
                    publishedAt: now,
                    sentiment: 0.3,
                    relevance: 0.5
                }
            ]);

            NewsAnalysisService.getCachedNews = mockGetCachedNews;

            const result = await NewsAnalysisService.analyzeNewsFeatureImportance('TEST_FIGI', 30);

            expect(result.featureImportance).toBeDefined();
            if (result.topCategories && result.topCategories.length > 0) {
                expect(result.topCategories[0].importance).toBeGreaterThan(0);
            }
        });

        it('should handle errors gracefully', async () => {
            const mockGetCachedNews = jest.fn().mockRejectedValue(new Error('Database error'));
            NewsAnalysisService.getCachedNews = mockGetCachedNews;

            const result = await NewsAnalysisService.analyzeNewsFeatureImportance('TEST_FIGI', 30);

            expect(result.featureImportance).toEqual({});
            expect(result.error).toBeDefined();
        });
    });

    describe('getEnhancedNews - интеграция всех функций', () => {
        it('should return enhanced news with classification and time decay', async () => {
            const now = new Date();
            const mockGetCachedNews = jest.fn().mockResolvedValue([
                {
                    title: 'Отчет за квартал',
                    description: 'Прибыль выросла',
                    publishedAt: now,
                    sentiment: 0.8,
                    relevance: 0.9
                },
                {
                    title: 'Старая новость',
                    description: 'Что-то произошло',
                    publishedAt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
                    sentiment: 0.6,
                    relevance: 0.7
                }
            ]);

            NewsAnalysisService.getCachedNews = mockGetCachedNews;

            const enhancedNews = await NewsAnalysisService.getEnhancedNews('TEST_FIGI', 7, 20, {
                applyTimeDecay: true,
                halfLifeDays: 7,
                prioritizeByImportance: true
            });

            expect(enhancedNews.length).toBeGreaterThan(0);
            expect(enhancedNews[0]).toHaveProperty('eventClassification');
            expect(enhancedNews[0]).toHaveProperty('timeDecayFactor');
            expect(enhancedNews[0]).toHaveProperty('adjustedSentiment');
            expect(enhancedNews[0]).toHaveProperty('adjustedRelevance');
        });

        it('should prioritize high importance news', async () => {
            const now = new Date();
            const mockGetCachedNews = jest.fn().mockResolvedValue([
                {
                    title: 'Обычная новость',
                    description: 'Ничего особенного',
                    publishedAt: now,
                    sentiment: 0.5,
                    relevance: 0.5
                },
                {
                    title: 'Критический отчет',
                    description: 'Результаты квартала',
                    publishedAt: now,
                    sentiment: 0.9,
                    relevance: 1.0
                }
            ]);

            NewsAnalysisService.getCachedNews = mockGetCachedNews;

            const enhancedNews = await NewsAnalysisService.getEnhancedNews('TEST_FIGI', 7, 20, {
                applyTimeDecay: true,
                prioritizeByImportance: true
            });

            // Критическая новость должна быть первой
            if (enhancedNews.length >= 2) {
                const firstImportance = (enhancedNews[0].eventClassification?.priority || 0.5) * 
                                      (enhancedNews[0].timeDecayFactor || 1) * 
                                      (enhancedNews[0].relevance || 0.5);
                const secondImportance = (enhancedNews[1].eventClassification?.priority || 0.5) * 
                                       (enhancedNews[1].timeDecayFactor || 1) * 
                                       (enhancedNews[1].relevance || 0.5);
                expect(firstImportance).toBeGreaterThanOrEqual(secondImportance);
            }
        });

        it('should return empty array when no news available', async () => {
            const mockGetCachedNews = jest.fn().mockResolvedValue([]);
            NewsAnalysisService.getCachedNews = mockGetCachedNews;

            const enhancedNews = await NewsAnalysisService.getEnhancedNews('TEST_FIGI', 7, 20);

            expect(enhancedNews).toEqual([]);
        });

        it('should handle errors gracefully', async () => {
            const mockGetCachedNews = jest.fn().mockRejectedValue(new Error('Database error'));
            NewsAnalysisService.getCachedNews = mockGetCachedNews;

            const enhancedNews = await NewsAnalysisService.getEnhancedNews('TEST_FIGI', 7, 20);

            expect(enhancedNews).toEqual([]);
        });
    });
});

