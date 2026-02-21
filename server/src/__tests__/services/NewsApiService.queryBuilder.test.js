import { describe, it, expect } from '@jest/globals';
import NewsApiService from '../../services/NewsApiService.js';

describe('NewsApiService buildSearchQuery', () => {
    it('adds aliases and sector keywords to query', () => {
        const query = NewsApiService.buildSearchQuery('SBER', 'ПАО Сбербанк', {
            sector: 'finance',
            aliases: ['Сбер', 'Sberbank'],
            includeFinancialTerms: true
        });

        expect(query).toContain('SBER');
        expect(query).toContain('"Сбербанк"');
        expect(query).toContain('"Сбер"');
        expect(query.toLowerCase()).toContain('finance');
    });

    it('enforces maximum query length', () => {
        const aliases = Array.from({ length: 50 }, (_, i) => `ОченьДлинныйАлиасКомпании_${i}`);
        const query = NewsApiService.buildSearchQuery('LONG', 'Очень длинное название компании для проверки лимита', {
            sector: 'technology',
            aliases,
            includeFinancialTerms: true,
            includePoliticalTerms: true,
            queryType: 'political'
        });

        expect(query.length).toBeLessThanOrEqual(NewsApiService.maxQueryLength);
    });
});
