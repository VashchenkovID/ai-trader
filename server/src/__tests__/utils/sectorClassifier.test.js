import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import SectorClassifier from '../../utils/sectorClassifier.js';
import CachedInstrument from '../../models/CachedInstrument.js';

jest.mock('../../models/CachedInstrument.js');
jest.mock('../../services/LoggerService.js', () => ({
    default: {
        isInitialized: true,
        error: jest.fn(),
        log: jest.fn()
    }
}));

describe('SectorClassifier (Phase 4.3.1)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('classifySector', () => {
        it('should classify instrument by existing sector field', async () => {
            const mockInstrument = {
                figi: 'TEST_FIGI',
                name: 'Test Company',
                sector: 'technology',
                ticker: 'TEST',
                apiData: {}
            };

            CachedInstrument.findOne = jest.fn().mockResolvedValue(mockInstrument);

            const sector = await SectorClassifier.classifySector('TEST_FIGI');
            expect(sector).toBe('technology');
        });

        it('should classify instrument by name keywords', async () => {
            const mockInstrument = {
                figi: 'TEST_FIGI',
                name: 'Technology Solutions Inc',
                sector: null,
                ticker: 'TECH',
                apiData: {}
            };

            CachedInstrument.findOne = jest.fn().mockResolvedValue(mockInstrument);

            const sector = await SectorClassifier.classifySector('TEST_FIGI');
            expect(sector).toBe('technology');
        });

        it('should return "other" for unknown sector', async () => {
            const mockInstrument = {
                figi: 'TEST_FIGI',
                name: 'Unknown Company',
                sector: null,
                ticker: 'UNK',
                apiData: {}
            };

            CachedInstrument.findOne = jest.fn().mockResolvedValue(mockInstrument);

            const sector = await SectorClassifier.classifySector('TEST_FIGI');
            expect(sector).toBe('other');
        });

        it('should return "other" when instrument not found', async () => {
            CachedInstrument.findOne = jest.fn().mockResolvedValue(null);

            const sector = await SectorClassifier.classifySector('NONEXISTENT');
            expect(sector).toBe('other');
        });
    });

    describe('normalizeSector', () => {
        it('should normalize sector name', () => {
            expect(SectorClassifier.normalizeSector('Technology')).toBe('technology');
            expect(SectorClassifier.normalizeSector('финансы')).toBe('finance');
            expect(SectorClassifier.normalizeSector('unknown')).toBe('other');
        });
    });

    describe('groupBySector', () => {
        it('should group instruments by sector', async () => {
            const figis = ['FIGI1', 'FIGI2', 'FIGI3'];
            
            CachedInstrument.findOne = jest.fn()
                .mockResolvedValueOnce({ figi: 'FIGI1', sector: 'technology', name: 'Tech1' })
                .mockResolvedValueOnce({ figi: 'FIGI2', sector: 'finance', name: 'Finance1' })
                .mockResolvedValueOnce({ figi: 'FIGI3', sector: 'technology', name: 'Tech2' });

            const grouped = await SectorClassifier.groupBySector(figis);
            
            expect(grouped.technology).toContain('FIGI1');
            expect(grouped.technology).toContain('FIGI3');
            expect(grouped.finance).toContain('FIGI2');
        });
    });

    describe('getAvailableSectors', () => {
        it('should return list of available sectors', () => {
            const sectors = SectorClassifier.getAvailableSectors();
            expect(Array.isArray(sectors)).toBe(true);
            expect(sectors.length).toBeGreaterThan(0);
            expect(sectors).toContain('technology');
            expect(sectors).toContain('finance');
        });
    });

    describe('updateInstrumentSector', () => {
        it('should update instrument sector in database', async () => {
            CachedInstrument.update = jest.fn().mockResolvedValue([1]);

            const result = await SectorClassifier.updateInstrumentSector('TEST_FIGI', 'technology');
            expect(result).toBe(true);
            expect(CachedInstrument.update).toHaveBeenCalledWith(
                { sector: 'technology' },
                { where: { figi: 'TEST_FIGI' } }
            );
        });
    });
});

