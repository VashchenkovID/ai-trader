import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import AutoPaperTradingService from '../../services/AutoPaperTradingService.js';
import PerformanceAnalyzer from '../../services/PerformanceAnalyzer.js';
import ProfitabilityTracker from '../../services/ProfitabilityTracker.js';

describe('AutoPaperTradingService iteration2 gates and meta-policy', () => {
    let originalAnalyzeTradingPerformance;
    let originalAnalyzeProfitability;
    let originalSettings;
    let originalReleaseGateCache;

    beforeEach(() => {
        originalAnalyzeTradingPerformance = PerformanceAnalyzer.analyzeTradingPerformance;
        originalAnalyzeProfitability = ProfitabilityTracker.analyzeProfitability;
        originalSettings = JSON.parse(JSON.stringify(AutoPaperTradingService.settings));
        originalReleaseGateCache = { ...AutoPaperTradingService.releaseGateCache };
        AutoPaperTradingService.releaseGateCache = { timestamp: 0, result: null };
    });

    afterEach(() => {
        PerformanceAnalyzer.analyzeTradingPerformance = originalAnalyzeTradingPerformance;
        ProfitabilityTracker.analyzeProfitability = originalAnalyzeProfitability;
        AutoPaperTradingService.settings = originalSettings;
        AutoPaperTradingService.releaseGateCache = originalReleaseGateCache;
    });

    it('maps regimes to policy keys', () => {
        expect(AutoPaperTradingService.mapMarketRegimeToPolicy('trend')).toBe('trend');
        expect(AutoPaperTradingService.mapMarketRegimeToPolicy('volatile')).toBe('volatile');
        expect(AutoPaperTradingService.mapMarketRegimeToPolicy('flat')).toBe('flat');
        expect(AutoPaperTradingService.mapMarketRegimeToPolicy('unknown')).toBe('normal');
    });

    it('applies meta-policy adjustments and clamps limits', () => {
        const base = {
            minConfidence: 0.7,
            maxConfidence: 0.95,
            minScore: 0.65,
            maxScore: 0.35,
            maxPositionSize: 0.05
        };
        const result = AutoPaperTradingService.applyMetaPolicyToSettings(base, {
            regime: 'volatile',
            policyKey: 'volatile',
            adjustments: {
                minConfidenceDelta: 0.5, // clamp expected
                minScoreDelta: 0.5, // clamp expected
                maxPositionMultiplier: 0.1
            }
        });

        expect(result.minConfidence).toBeLessThanOrEqual(0.99);
        expect(result.minScore).toBeLessThanOrEqual(0.99);
        expect(result.maxPositionSize).toBeGreaterThanOrEqual(0.005);
        expect(result.metaPolicy.policyKey).toBe('volatile');
    });

    it('returns default meta-policy when disabled', async () => {
        AutoPaperTradingService.settings.enableMetaPolicy = false;
        const result = await AutoPaperTradingService.evaluateMetaPolicy({ figi: 'TEST_FIGI' });
        expect(result.policyKey).toBe('normal');
        expect(result.regime).toBe('normal');
    });

    it('passes release gate when OOS metrics are above thresholds', async () => {
        PerformanceAnalyzer.analyzeTradingPerformance = async () => ({
            totalTrades: 60,
            winRate: 0.58,
            profitFactor: 1.35,
            sharpeRatio: 0.75,
            consistency: 0.42,
            maxDrawdown: 8
        });
        ProfitabilityTracker.analyzeProfitability = async () => ({
            metrics: {
                sortinoRatio: 0.7
            }
        });

        const result = await AutoPaperTradingService.evaluateReleaseGate(true);
        expect(result.passed).toBe(true);
        expect(result.reason).toBe('passed');
        expect(result.metrics.trades).toBe(60);
    });

    it('blocks release gate when OOS metrics degrade', async () => {
        PerformanceAnalyzer.analyzeTradingPerformance = async () => ({
            totalTrades: 50,
            winRate: 0.3,
            profitFactor: 0.7,
            sharpeRatio: 0.1,
            consistency: 0.02,
            maxDrawdown: 30
        });
        ProfitabilityTracker.analyzeProfitability = async () => ({
            metrics: {
                sortinoRatio: 0.05
            }
        });

        const result = await AutoPaperTradingService.evaluateReleaseGate(true);
        expect(result.passed).toBe(false);
        expect(result.reason.startsWith('RELEASE_GATE_BLOCKED:')).toBe(true);
    });

    it('tracks admission decisions with gate attribution', () => {
        AutoPaperTradingService.stats.admissionQuality = {
            considered: 0,
            passed: 0,
            blocked: 0,
            blockedByGate: {
                walkForwardGate: 0,
                releaseGate: 0,
                unknown: 0
            },
            recent: []
        };

        AutoPaperTradingService.recordAdmissionDecision({
            traceId: 't-1',
            figi: 'FIGI1',
            passed: false,
            blockedBy: 'walkForwardGate',
            checks: { walkForwardGate: { passed: false } }
        });
        AutoPaperTradingService.recordAdmissionDecision({
            traceId: 't-2',
            figi: 'FIGI2',
            passed: true,
            checks: { walkForwardGate: { passed: true }, releaseGate: { passed: true } }
        });

        const aq = AutoPaperTradingService.stats.admissionQuality;
        expect(aq.considered).toBe(2);
        expect(aq.passed).toBe(1);
        expect(aq.blocked).toBe(1);
        expect(aq.blockedByGate.walkForwardGate).toBe(1);
        expect(Array.isArray(aq.recent)).toBe(true);
        expect(aq.recent.length).toBe(2);
    });
});

