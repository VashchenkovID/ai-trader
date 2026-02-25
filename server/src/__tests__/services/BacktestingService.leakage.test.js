import { describe, it, expect } from '@jest/globals';
import BacktestingService from '../../services/BacktestingService.js';

describe('BacktestingService anti-leakage recommendation gating', () => {
    it('allows recommendation published before candle within validity window', () => {
        const recDate = new Date('2026-01-10T10:00:00.000Z');
        const candleDate = new Date('2026-01-12T10:00:00.000Z');

        const eligible = BacktestingService.isRecommendationEligibleForCandle(recDate, candleDate, 3);
        expect(eligible).toBe(true);
    });

    it('blocks future recommendation (look-ahead)', () => {
        const recDate = new Date('2026-01-13T10:00:00.000Z');
        const candleDate = new Date('2026-01-12T10:00:00.000Z');

        const eligible = BacktestingService.isRecommendationEligibleForCandle(recDate, candleDate, 3);
        expect(eligible).toBe(false);
    });

    it('blocks outdated recommendation outside validity window', () => {
        const recDate = new Date('2026-01-01T10:00:00.000Z');
        const candleDate = new Date('2026-01-10T10:00:00.000Z');

        const eligible = BacktestingService.isRecommendationEligibleForCandle(recDate, candleDate, 3);
        expect(eligible).toBe(false);
    });
});

