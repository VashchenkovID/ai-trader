import { describe, it, expect, jest, beforeEach } from '@jest/globals';

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

import NewsAnalysisService from '../../services/NewsAnalysisService.js';

describe('NewsAnalysisService multi-source helpers', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        if (!NewsAnalysisService.isInitialized) {
            await NewsAnalysisService.initialize();
        }
    });

    it('deduplicates by url and keeps more relevant article', () => {
        const merged = NewsAnalysisService.mergeAndDeduplicateNews([
            { title: 'A', url: 'https://example.com/news/1', relevance: 0.4 },
            { title: 'A duplicate', url: 'https://example.com/news/1', relevance: 0.9 },
            { title: 'B', url: 'https://example.com/news/2', relevance: 0.6 }
        ]);

        expect(merged).toHaveLength(2);
        const best = merged.find(item => item.url === 'https://example.com/news/1');
        expect(best.relevance).toBe(0.9);
    });

    it('applies source-aware relevance weighting', () => {
        const article = {
            title: 'Сбербанк и ЦБ обсуждают ключевую ставку',
            description: 'Политика и санкции влияют на банковский сектор'
        };

        const companyRelevance = NewsAnalysisService.calculateRelevance(article, 'TEST', {
            sourceType: 'company',
            companyName: 'Сбербанк',
            ticker: 'SBER',
            sector: 'finance'
        });

        const politicalRelevance = NewsAnalysisService.calculateRelevance(article, 'TEST', {
            sourceType: 'political',
            companyName: 'Сбербанк',
            ticker: 'SBER',
            sector: 'finance'
        });

        expect(companyRelevance).toBeGreaterThan(politicalRelevance);
    });
});
