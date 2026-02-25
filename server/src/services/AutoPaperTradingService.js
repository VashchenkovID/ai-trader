/**
 * Сервис автоматического исполнения заявок в paper режиме
 * Управляет жизненным циклом автоматических заявок и их исполнением
 */

import LoggerService from './LoggerService.js';
import TradingEngine from './TradingEngine.js';
import RiskManagementService from './RiskManagementService.js';
import RealisticExecutionSimulator from './RealisticExecutionSimulator.js';
import TradingRequest from '../models/TradingRequest.js';
import AutoPaperTradingStats from '../models/AutoPaperTradingStats.js';
import TradingModeManager from './TradingModeManager.js';
import { Op } from 'sequelize';
import sequelize from '../config/database.js';

class AutoPaperTradingService {
    constructor() {
        this.isInitialized = false;
        this.isEnabled = false; // Глобальный флаг включения
        this.processingLock = false; // Блокировка для предотвращения race conditions
        this.rlTrainingCache = new Map(); // Кеш для RL обучения (figi -> lastTrainingTime)
        this.maxRlTrainingCacheSize = 500; // Ограничение размера кеша
        this.rlTrainingCacheTTL = 24 * 60 * 60 * 1000; // 24 часа
        this.walkForwardGateCache = { timestamp: 0, result: null };
        this.walkForwardGateCacheTtlMs = 5 * 60 * 1000; // 5 минут
        this.releaseGateCache = { timestamp: 0, result: null };
        this.releaseGateCacheTtlMs = 10 * 60 * 1000; // 10 минут
        
        this.settings = {
            // Условия автоматического исполнения
            minConfidence: 0.7,        // Минимальная уверенность для авто-исполнения
            maxConfidence: 0.95,       // Максимальная уверенность (защита от переобучения)
            minScore: 0.65,            // Минимальный score для BUY
            maxScore: 0.35,            // Максимальный score для SELL
            maxPositionSize: 0.05,     // Максимум 5% капитала на позицию
            maxDailyTrades: 15,        // Максимум сделок в день
            minTimeBetweenTrades: 300, // Минимум 5 минут между сделками (секунды)
            maxDailyLoss: 0.05,        // Максимум 5% дневного убытка
            enableRealisticExecution: true, // Включить реалистичную симуляцию
            enableMetaPolicy: true,         // Адаптивная подстройка порогов под режим рынка
            enableWalkForwardGate: true,    // Блокировать вход, если OOS-метрики деградировали
            enableReleaseGate: true,        // Формальный OOS-gate допуска модели к автоисполнению
            walkForwardGate: {
                windowDays: 30,
                minTrades: 10,
                minWinRate: 0.45,
                minProfitFactor: 1.05,
                maxDrawdown: 0.12
            },
            releaseGate: {
                windowDays: 30,
                minTrades: 20,
                minWinRate: 0.45,
                minProfitFactor: 1.0,
                minSharpe: 0.3,
                minSortino: 0.3,
                minConsistency: 0.1,
                maxDrawdown: 15 // в процентах
            },
            metaPolicy: {
                trend: {
                    minConfidenceDelta: -0.03,
                    minScoreDelta: -0.02,
                    maxPositionMultiplier: 1.1
                },
                volatile: {
                    minConfidenceDelta: 0.05,
                    minScoreDelta: 0.03,
                    maxPositionMultiplier: 0.7
                },
                flat: {
                    minConfidenceDelta: 0.03,
                    minScoreDelta: 0.02,
                    maxPositionMultiplier: 0.8
                },
                normal: {
                    minConfidenceDelta: 0,
                    minScoreDelta: 0,
                    maxPositionMultiplier: 1.0
                }
            },
            
            // Лимиты для разных фаз
            phase1: {
                maxDailyTrades: 5,
                minConfidence: 0.8,
                maxPositionSize: 0.03
            },
            phase2: {
                maxDailyTrades: 10,
                minConfidence: 0.75,
                maxPositionSize: 0.04
            },
            phase3: {
                maxDailyTrades: 15,
                minConfidence: 0.7,
                maxPositionSize: 0.05
            }
        };
        
        this.stats = {
            dailyTrades: 0,
            dailyPnL: 0,
            totalTrades: 0,
            lastTradeTime: null,
            currentPhase: 'phase1', // phase1, phase2, phase3
            decisionQuality: {
                considered: 0,
                approved: 0,
                blocked: 0,
                blockedByReason: {}
            },
            admissionQuality: {
                considered: 0,
                passed: 0,
                blocked: 0,
                blockedByGate: {
                    walkForwardGate: 0,
                    releaseGate: 0,
                    unknown: 0
                },
                recent: []
            },
            errorTracking: {
                totalErrors: 0,
                byOperation: {},
                recent: []
            }
        };
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            // Инициализация зависимостей - RiskManagementService должен быть доступен
            if (!RiskManagementService.isInitialized) {
                await RiskManagementService.initialize();
            }
            
            // Загрузка статистики из БД
            await this.loadDailyStats();
            
            // Инициализация RealisticExecutionSimulator
            await RealisticExecutionSimulator.initialize();
            
            // Проверка состояния системы
            const currentMode = TradingModeManager.getCurrentMode().mode;
            if (currentMode !== 'paper') {
                LoggerService.warn('AutoPaperTradingService initialized but current mode is not paper', {
                    currentMode
                });
            }
            
            this.isInitialized = true;
            LoggerService.info('AutoPaperTradingService initialized', {
                currentPhase: this.stats.currentPhase,
                dailyTrades: this.stats.dailyTrades
            });
        } catch (error) {
            LoggerService.error('Failed to initialize AutoPaperTradingService', {
                service: 'AutoPaperTradingService',
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Загрузка дневной статистики из БД
     */
    async loadDailyStats() {
        try {
            const stats = await AutoPaperTradingStats.getTodayStats();
            
            // Восстановить значения
            this.stats.dailyTrades = stats.dailyTrades;
            this.stats.dailyPnL = stats.dailyPnL;
            this.stats.totalTrades = stats.totalTrades;
            this.stats.currentPhase = stats.currentPhase;
            
            // Загрузить время последней сделки из БД
            // Проверяем, существует ли таблица trading_requests перед запросом
            try {
                // Проверяем существование таблицы через raw query
                const [tableCheck] = await sequelize.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = 'trading_requests'
                    );
                `);
                
                const tableExists = tableCheck && tableCheck[0] && (tableCheck[0].exists === true || tableCheck[0].exists === 't');
                
                if (tableExists) {
                    const lastTrade = await TradingRequest.findOne({
                        where: {
                            autoExecuted: true,
                            status: 'EXECUTED'
                        },
                        order: [['executedAt', 'DESC']],
                        attributes: ['executedAt']
                    });
                    
                    if (lastTrade && lastTrade.executedAt) {
                        this.stats.lastTradeTime = new Date(lastTrade.executedAt);
                    }
                } else {
                    LoggerService.debug('Table trading_requests does not exist yet, skipping lastTradeTime load', {
                        service: 'AutoPaperTradingService'
                    });
                }
            } catch (tableError) {
                // Игнорируем ошибки, если таблица еще не создана
                if (tableError.message && tableError.message.includes('does not exist')) {
                    LoggerService.debug('Table trading_requests does not exist yet, skipping lastTradeTime load', {
                        service: 'AutoPaperTradingService',
                        error: tableError.message
                    });
                } else {
                    throw tableError;
                }
            }
        } catch (error) {
            LoggerService.warn('Failed to load daily stats, using defaults', {
                error: error.message
            });
        }
    }

    /**
     * Сохранение дневной статистики в БД
     */
    async saveDailyStats() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const stats = await AutoPaperTradingStats.getTodayStats();
            
            stats.dailyTrades = this.stats.dailyTrades;
            stats.dailyPnL = this.stats.dailyPnL;
            stats.totalTrades = this.stats.totalTrades;
            stats.currentPhase = this.stats.currentPhase;
            stats.settings = this.getCurrentSettings();
            
            await stats.save();
        } catch (error) {
            LoggerService.warn('Failed to save daily stats', {
                error: error.message
            });
        }
    }

    /**
     * Получение текущих настроек с учетом фазы
     */
    getCurrentSettings() {
        const phaseSettings = this.settings[this.stats.currentPhase];
        
        // Настройки фазы имеют приоритет
        return {
            minConfidence: phaseSettings?.minConfidence ?? this.settings.minConfidence,
            maxConfidence: this.settings.maxConfidence,
            minScore: this.settings.minScore,
            maxScore: this.settings.maxScore,
            maxDailyTrades: phaseSettings?.maxDailyTrades ?? this.settings.maxDailyTrades,
            maxPositionSize: phaseSettings?.maxPositionSize ?? this.settings.maxPositionSize,
            minTimeBetweenTrades: this.settings.minTimeBetweenTrades,
            maxDailyLoss: this.settings.maxDailyLoss,
            enableRealisticExecution: this.settings.enableRealisticExecution,
            enableMetaPolicy: this.settings.enableMetaPolicy,
            enableWalkForwardGate: this.settings.enableWalkForwardGate,
            walkForwardGate: this.settings.walkForwardGate,
            enableReleaseGate: this.settings.enableReleaseGate,
            releaseGate: this.settings.releaseGate,
            metaPolicy: this.settings.metaPolicy
        };
    }

    createTraceId(prefix = 'auto-paper') {
        return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    buildOperationContext(operation, tradingRequest = null, extra = {}) {
        return {
            traceId: this.createTraceId(operation),
            operation,
            requestId: tradingRequest?.id || null,
            figi: tradingRequest?.figi || null,
            action: tradingRequest?.action || null,
            mode: TradingModeManager.getCurrentMode().mode,
            ...extra
        };
    }

    trackOperationError(context, step, error, extra = {}) {
        const normalizedStep = step || 'unknown_step';
        const operation = context?.operation || 'unknown_operation';
        const safeMessage = error?.message || String(error);

        this.stats.errorTracking.totalErrors += 1;
        this.stats.errorTracking.byOperation[operation] =
            (this.stats.errorTracking.byOperation[operation] || 0) + 1;

        const recentItem = {
            at: new Date().toISOString(),
            traceId: context?.traceId || null,
            operation,
            step: normalizedStep,
            requestId: context?.requestId || null,
            figi: context?.figi || null,
            message: safeMessage,
            ...extra
        };
        this.stats.errorTracking.recent.push(recentItem);
        if (this.stats.errorTracking.recent.length > 50) {
            this.stats.errorTracking.recent.shift();
        }

        LoggerService.error('AutoPaperTrading operation failed', {
            service: 'AutoPaperTradingService',
            traceId: context?.traceId,
            operation,
            step: normalizedStep,
            requestId: context?.requestId,
            figi: context?.figi,
            error: {
                message: safeMessage,
                stack: error?.stack || null
            },
            extra
        });
    }

    createStepError(context, step, error) {
        const wrapped = new Error(`[${step}] ${error.message}`);
        wrapped.code = `AUTO_PAPER_${step.toUpperCase()}_FAILED`;
        wrapped.cause = error;
        wrapped.traceId = context?.traceId;
        wrapped.operation = context?.operation;
        wrapped.step = step;
        return wrapped;
    }

    recordDecision(canExecute, reason = 'passed') {
        this.stats.decisionQuality.considered += 1;
        if (canExecute) {
            this.stats.decisionQuality.approved += 1;
            return;
        }

        this.stats.decisionQuality.blocked += 1;
        const normalizedReason = String(reason || 'unknown').slice(0, 120);
        this.stats.decisionQuality.blockedByReason[normalizedReason] =
            (this.stats.decisionQuality.blockedByReason[normalizedReason] || 0) + 1;
    }

    recordAdmissionDecision(payload = {}) {
        const {
            traceId = null,
            figi = null,
            ticker = null,
            passed = false,
            blockedBy = null,
            checks = null
        } = payload;

        this.stats.admissionQuality.considered += 1;
        if (passed) {
            this.stats.admissionQuality.passed += 1;
        } else {
            this.stats.admissionQuality.blocked += 1;
            const gateKey = blockedBy === 'walkForwardGate' || blockedBy === 'releaseGate'
                ? blockedBy
                : 'unknown';
            this.stats.admissionQuality.blockedByGate[gateKey] =
                (this.stats.admissionQuality.blockedByGate[gateKey] || 0) + 1;
        }

        this.stats.admissionQuality.recent.push({
            at: new Date().toISOString(),
            traceId,
            figi,
            ticker,
            passed,
            blockedBy: passed ? null : (blockedBy || 'unknown'),
            checks: checks || null
        });

        if (this.stats.admissionQuality.recent.length > 50) {
            this.stats.admissionQuality.recent.shift();
        }
    }

    calculateMaxDrawdownFromPnl(pnlSeries = []) {
        let equity = 0;
        let peak = 0;
        let maxDrawdown = 0;

        for (const pnl of pnlSeries) {
            equity += Number(pnl) || 0;
            if (equity > peak) peak = equity;
            const drawdown = peak > 0 ? (peak - equity) / peak : 0;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        }
        return maxDrawdown;
    }

    async evaluateWalkForwardGate(forceRefresh = false) {
        const now = Date.now();
        if (!forceRefresh
            && this.walkForwardGateCache.result
            && now - this.walkForwardGateCache.timestamp < this.walkForwardGateCacheTtlMs) {
            return this.walkForwardGateCache.result;
        }

        const gateConfig = this.settings.walkForwardGate || {};
        const windowDays = gateConfig.windowDays || 30;
        const minTrades = gateConfig.minTrades || 10;
        const minWinRate = gateConfig.minWinRate ?? 0.45;
        const minProfitFactor = gateConfig.minProfitFactor ?? 1.05;
        const maxDrawdownLimit = gateConfig.maxDrawdown ?? 0.12;

        const startDate = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
        const allTrades = await TradingEngine.getTradeHistory(10000);
        const closedTrades = allTrades
            .filter((trade) => {
                const tradeDate = new Date(trade.timestamp || trade.date || trade.createdAt);
                const isInWindow = tradeDate >= startDate;
                const isClosed = (trade.action === 'SELL' || trade.type === 'SELL');
                const hasPnl = trade.pnl !== null && trade.pnl !== undefined && Number.isFinite(Number(trade.pnl));
                const isPaper = !trade.mode || trade.mode === 'paper';
                return isInWindow && isClosed && hasPnl && isPaper;
            })
            .sort((a, b) => new Date(a.timestamp || a.date || a.createdAt) - new Date(b.timestamp || b.date || b.createdAt));

        if (closedTrades.length < minTrades) {
            const result = {
                passed: false,
                reason: `WALK_FORWARD_GATE_BLOCKED: insufficient trades ${closedTrades.length} < ${minTrades}`,
                metrics: { trades: closedTrades.length, windowDays }
            };
            this.walkForwardGateCache = { timestamp: now, result };
            return result;
        }

        const pnlValues = closedTrades.map((t) => Number(t.pnl) || 0);
        const wins = pnlValues.filter((p) => p > 0);
        const losses = pnlValues.filter((p) => p < 0);
        const winRate = wins.length / closedTrades.length;
        const grossProfit = wins.reduce((sum, p) => sum + p, 0);
        const grossLoss = Math.abs(losses.reduce((sum, p) => sum + p, 0));
        const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
        const maxDrawdown = this.calculateMaxDrawdownFromPnl(pnlValues);

        let passed = true;
        let reason = 'passed';
        if (winRate < minWinRate) {
            passed = false;
            reason = `WALK_FORWARD_GATE_BLOCKED: winRate ${winRate.toFixed(3)} < ${minWinRate}`;
        } else if (profitFactor < minProfitFactor) {
            passed = false;
            reason = `WALK_FORWARD_GATE_BLOCKED: profitFactor ${profitFactor.toFixed(3)} < ${minProfitFactor}`;
        } else if (maxDrawdown > maxDrawdownLimit) {
            passed = false;
            reason = `WALK_FORWARD_GATE_BLOCKED: maxDrawdown ${maxDrawdown.toFixed(3)} > ${maxDrawdownLimit}`;
        }

        const result = {
            passed,
            reason,
            metrics: {
                trades: closedTrades.length,
                windowDays,
                winRate,
                profitFactor,
                maxDrawdown
            }
        };
        this.walkForwardGateCache = { timestamp: now, result };
        return result;
    }

    mapMarketRegimeToPolicy(regime) {
        if (regime === 'trend') return 'trend';
        if (regime === 'volatile') return 'volatile';
        if (regime === 'flat') return 'flat';
        return 'normal';
    }

    async evaluateMetaPolicy(tradingRequest) {
        const defaultPolicy = {
            regime: 'normal',
            policyKey: 'normal',
            adjustments: this.settings.metaPolicy.normal
        };

        if (!this.settings.enableMetaPolicy || !tradingRequest?.figi) {
            return defaultPolicy;
        }

        try {
            let regime = null;
            try {
                const MarketRegimeService = (await import('./MarketRegimeService.js')).default;
                if (MarketRegimeService && typeof MarketRegimeService.detectRegime === 'function') {
                    const regimeInfo = await MarketRegimeService.detectRegime(tradingRequest.figi);
                    regime = regimeInfo?.regime || null;
                }
            } catch (marketRegimeError) {
                // fallback below
            }

            if (!regime) {
                const AdaptiveThresholdService = (await import('./AdaptiveThresholdService.js')).default;
                if (AdaptiveThresholdService && typeof AdaptiveThresholdService.detectMarketMode === 'function') {
                    regime = await AdaptiveThresholdService.detectMarketMode(tradingRequest.figi);
                }
            }

            const policyKey = this.mapMarketRegimeToPolicy(regime);
            const adjustments = this.settings.metaPolicy[policyKey] || this.settings.metaPolicy.normal;
            return {
                regime: regime || 'normal',
                policyKey,
                adjustments
            };
        } catch (error) {
            this.trackOperationError(
                this.buildOperationContext('evaluateMetaPolicy', tradingRequest),
                'detect_regime',
                error
            );
            return defaultPolicy;
        }
    }

    applyMetaPolicyToSettings(baseSettings, metaPolicyResult) {
        const adjustments = metaPolicyResult?.adjustments || this.settings.metaPolicy.normal;
        const minConfidence = Math.max(0.5, Math.min(0.99, baseSettings.minConfidence + (adjustments.minConfidenceDelta || 0)));
        const minScore = Math.max(0.3, Math.min(0.99, baseSettings.minScore + (adjustments.minScoreDelta || 0)));
        const maxPositionSize = Math.max(
            0.005,
            Math.min(0.2, baseSettings.maxPositionSize * (adjustments.maxPositionMultiplier || 1))
        );

        return {
            ...baseSettings,
            minConfidence,
            minScore,
            maxPositionSize,
            metaPolicy: {
                regime: metaPolicyResult?.regime || 'normal',
                policyKey: metaPolicyResult?.policyKey || 'normal',
                adjustments
            }
        };
    }

    async evaluateReleaseGate(forceRefresh = false) {
        const now = Date.now();
        if (!forceRefresh
            && this.releaseGateCache.result
            && now - this.releaseGateCache.timestamp < this.releaseGateCacheTtlMs) {
            return this.releaseGateCache.result;
        }

        const cfg = this.settings.releaseGate || {};
        const windowDays = cfg.windowDays || 30;
        const minTrades = cfg.minTrades || 20;
        const minWinRate = cfg.minWinRate ?? 0.45;
        const minProfitFactor = cfg.minProfitFactor ?? 1.0;
        const minSharpe = cfg.minSharpe ?? 0.3;
        const minSortino = cfg.minSortino ?? 0.3;
        const minConsistency = cfg.minConsistency ?? 0.1;
        const maxDrawdown = cfg.maxDrawdown ?? 15;

        try {
            const PerformanceAnalyzer = (await import('./PerformanceAnalyzer.js')).default;
            const ProfitabilityTracker = (await import('./ProfitabilityTracker.js')).default;

            const trading = await PerformanceAnalyzer.analyzeTradingPerformance(windowDays);
            const profitability = await ProfitabilityTracker.analyzeProfitability('month', windowDays);
            const metrics = profitability?.metrics || {};

            const extracted = {
                trades: trading?.totalTrades || 0,
                winRate: trading?.winRate || 0,
                profitFactor: trading?.profitFactor || 0,
                sharpe: trading?.sharpeRatio || 0,
                sortino: metrics?.sortinoRatio || 0,
                consistency: trading?.consistency || 0,
                maxDrawdown: trading?.maxDrawdown || 0
            };

            let passed = true;
            let reason = 'passed';
            if (extracted.trades < minTrades) {
                passed = false;
                reason = `RELEASE_GATE_BLOCKED: insufficient trades ${extracted.trades} < ${minTrades}`;
            } else if (extracted.winRate < minWinRate) {
                passed = false;
                reason = `RELEASE_GATE_BLOCKED: winRate ${extracted.winRate.toFixed(3)} < ${minWinRate}`;
            } else if (extracted.profitFactor < minProfitFactor) {
                passed = false;
                reason = `RELEASE_GATE_BLOCKED: profitFactor ${extracted.profitFactor.toFixed(3)} < ${minProfitFactor}`;
            } else if (extracted.sharpe < minSharpe) {
                passed = false;
                reason = `RELEASE_GATE_BLOCKED: sharpe ${extracted.sharpe.toFixed(3)} < ${minSharpe}`;
            } else if (extracted.sortino < minSortino) {
                passed = false;
                reason = `RELEASE_GATE_BLOCKED: sortino ${extracted.sortino.toFixed(3)} < ${minSortino}`;
            } else if (extracted.consistency < minConsistency) {
                passed = false;
                reason = `RELEASE_GATE_BLOCKED: consistency ${extracted.consistency.toFixed(3)} < ${minConsistency}`;
            } else if (extracted.maxDrawdown > maxDrawdown) {
                passed = false;
                reason = `RELEASE_GATE_BLOCKED: maxDrawdown ${extracted.maxDrawdown.toFixed(3)} > ${maxDrawdown}`;
            }

            const result = { passed, reason, metrics: extracted, windowDays };
            this.releaseGateCache = { timestamp: now, result };
            return result;
        } catch (error) {
            this.trackOperationError(
                this.buildOperationContext('evaluateReleaseGate'),
                'collect_metrics',
                error
            );
            const failSafe = {
                passed: false,
                reason: `RELEASE_GATE_BLOCKED: metrics unavailable (${error.message})`,
                metrics: null,
                windowDays
            };
            this.releaseGateCache = { timestamp: now, result: failSafe };
            return failSafe;
        }
    }

    /**
     * Получение максимального количества сделок для текущей фазы
     */
    getCurrentMaxDailyTrades() {
        return this.getCurrentSettings().maxDailyTrades;
    }

    /**
     * Проверка возможности автоматического исполнения заявки
     * @param {Object} tradingRequest - Торговая заявка
     * @returns {Promise<Object>} { canAutoExecute: boolean, reason: string }
     */
    async canAutoExecute(tradingRequest) {
        const opContext = this.buildOperationContext('canAutoExecute', tradingRequest);
        try {
            // 1. Проверка режима торговли (только paper)
            const currentMode = TradingModeManager.getCurrentMode().mode;
            if (currentMode !== 'paper') {
                return { canAutoExecute: false, reason: 'Auto-execution only available in paper mode' };
            }
            
            // 2. Проверка глобального флага isEnabled
            if (!this.isEnabled) {
                return { canAutoExecute: false, reason: 'Auto-execution is disabled' };
            }
            
            // 3. Проверка статуса заявки
            if (tradingRequest.status !== 'PENDING') {
                return { canAutoExecute: false, reason: `Request is not pending (status: ${tradingRequest.status})` };
            }
            
            // 4. Проверка истечения заявки
            if (tradingRequest.getIsExpired && tradingRequest.getIsExpired()) {
                return { canAutoExecute: false, reason: 'Request has expired' };
            }
            
            // 5. Meta-policy + проверка confidence и score
            const currentSettings = this.getCurrentSettings();
            const metaPolicy = await this.evaluateMetaPolicy(tradingRequest);
            const effectiveSettings = this.applyMetaPolicyToSettings(currentSettings, metaPolicy);

            if (tradingRequest.confidence < effectiveSettings.minConfidence) {
                return { canAutoExecute: false, reason: `Confidence too low: ${tradingRequest.confidence} < ${effectiveSettings.minConfidence}` };
            }
            
            if (tradingRequest.confidence > effectiveSettings.maxConfidence) {
                return { canAutoExecute: false, reason: `Confidence too high (possible overfitting): ${tradingRequest.confidence} > ${effectiveSettings.maxConfidence}` };
            }
            
            if (tradingRequest.action === 'BUY' && tradingRequest.score < effectiveSettings.minScore) {
                return { canAutoExecute: false, reason: `Score too low for BUY: ${tradingRequest.score} < ${effectiveSettings.minScore}` };
            }
            
            if (tradingRequest.action === 'SELL' && tradingRequest.score > effectiveSettings.maxScore) {
                return { canAutoExecute: false, reason: `Score too high for SELL: ${tradingRequest.score} > ${effectiveSettings.maxScore}` };
            }
            
            // 6. Проверка лимитов (dailyTrades, timeBetweenTrades)
            const today = new Date().toISOString().split('T')[0];
            const stats = await AutoPaperTradingStats.findOne({
                where: { date: today },
                lock: true // Блокировка строки в БД
            });
            
            if (stats && stats.dailyTrades >= this.getCurrentMaxDailyTrades()) {
                return { canAutoExecute: false, reason: `Daily trades limit reached: ${stats.dailyTrades} >= ${this.getCurrentMaxDailyTrades()}` };
            }
            
            // Проверка времени между сделками
            if (this.stats.lastTradeTime) {
                const timeSinceLastTrade = (Date.now() - this.stats.lastTradeTime.getTime()) / 1000; // в секундах
                if (timeSinceLastTrade < effectiveSettings.minTimeBetweenTrades) {
                    return { canAutoExecute: false, reason: `Too soon after last trade: ${Math.round(timeSinceLastTrade)}s < ${effectiveSettings.minTimeBetweenTrades}s` };
                }
            }
            
            // 7. Проверка дневного PnL
            if (stats && stats.dailyPnL < -effectiveSettings.maxDailyLoss) {
                return { canAutoExecute: false, reason: `Daily loss limit reached: ${stats.dailyPnL} < -${effectiveSettings.maxDailyLoss}` };
            }
            
            // 8. Проверка размера позиции
            // Получаем текущий портфель для расчета
            const portfolio = await TradingEngine.getPortfolioValue();
            const portfolioValue = portfolio.totalValue || portfolio.totalAmountPortfolio?.value || 50000000;
            const positionValue = tradingRequest.estimatedAmount;
            const positionSize = positionValue / portfolioValue;
            
            if (positionSize > effectiveSettings.maxPositionSize) {
                return { canAutoExecute: false, reason: `Position size too large: ${(positionSize * 100).toFixed(2)}% > ${(effectiveSettings.maxPositionSize * 100).toFixed(2)}%` };
            }
            
            // 9. Проверка рисков через RiskManagementService
            // 9.5 Walk-Forward gate на rolling OOS-окне для paper-режима
            if (effectiveSettings.enableWalkForwardGate) {
                const gateResult = await this.evaluateWalkForwardGate();
                if (!gateResult.passed) {
                    return {
                        canAutoExecute: false,
                        reason: gateResult.reason,
                        gateMetrics: gateResult.metrics
                    };
                }
            }

            // 9.6 Формальный release-gate на OOS метриках
            if (effectiveSettings.enableReleaseGate) {
                const releaseGate = await this.evaluateReleaseGate();
                if (!releaseGate.passed) {
                    return {
                        canAutoExecute: false,
                        reason: releaseGate.reason,
                        releaseGateMetrics: releaseGate.metrics
                    };
                }
            }

            // 10. Проверка рисков через RiskManagementService
            // RiskManagementService должен быть инициализирован при инициализации AutoPaperTradingService
            const signal = {
                symbol: tradingRequest.figi,
                figi: tradingRequest.figi,
                action: tradingRequest.action,
                quantity: tradingRequest.quantity,
                price: tradingRequest.priceAtRequest,
                confidence: tradingRequest.confidence,
                score: tradingRequest.score
            };
            
            const validation = await RiskManagementService.validateOrder(signal, portfolio, {});
            if (!validation.isValid) {
                return { 
                    canAutoExecute: false, 
                    reason: `Risk validation failed: ${validation.errors.join(', ')}` 
                };
            }
            
            return {
                canAutoExecute: true,
                metaPolicy: effectiveSettings.metaPolicy
            };
        } catch (error) {
            this.trackOperationError(opContext, 'validation', error);
            // Если RiskManagementService не инициализирован - это критическая ошибка
            // так как он должен быть инициализирован при старте AutoPaperTradingService
            if (error.message.includes('не инициализирован') || error.message.includes('not initialized')) {
                LoggerService.error('RiskManagementService not initialized - this should not happen', {
                    requestId: tradingRequest.id,
                    error: error.message
                });
                // Пытаемся инициализировать на лету (fallback)
                try {
                    await RiskManagementService.initialize();
                    // Повторяем проверку после инициализации
                    const signal = {
                        symbol: tradingRequest.figi,
                        figi: tradingRequest.figi,
                        action: tradingRequest.action,
                        quantity: tradingRequest.quantity,
                        price: tradingRequest.priceAtRequest,
                        confidence: tradingRequest.confidence,
                        score: tradingRequest.score
                    };
                    const portfolio = await TradingEngine.getPortfolioValue();
                    const validation = await RiskManagementService.validateOrder(signal, portfolio, {});
                    if (!validation.isValid) {
                        return { 
                            canAutoExecute: false, 
                            reason: `Risk validation failed: ${validation.errors.join(', ')}` 
                        };
                    }
                    return { canAutoExecute: true };
                } catch (initError) {
                    this.trackOperationError(opContext, 'risk_service_reinitialize', initError);
                    LoggerService.error('Failed to initialize RiskManagementService on the fly', {
                        requestId: tradingRequest.id,
                        error: initError.message
                    });
                    return { canAutoExecute: false, reason: `RiskManagementService initialization failed: ${initError.message}` };
                }
            }
            
            // Остальные ошибки логируем как ERROR
            LoggerService.error('Error in canAutoExecute', {
                requestId: tradingRequest.id,
                error: error.message
            });
            
            return { canAutoExecute: false, reason: `Error: ${error.message}` };
        }
    }

    /**
     * Автоматическое исполнение заявки
     * @param {Object} tradingRequest - Торговая заявка
     * @returns {Promise<Object>} Результат исполнения
     */
    async autoExecuteRequest(tradingRequest) {
        const opContext = this.buildOperationContext('autoExecuteRequest', tradingRequest);

        // Жесткий предохранитель: автоисполнение разрешено только в paper-режиме.
        // В real/micro заявки должны подтверждаться и исполняться пользователем вручную.
        const currentMode = TradingModeManager.getCurrentMode().mode;
        if (currentMode !== 'paper' || tradingRequest?.tradingMode !== 'paper') {
            const modeError = new Error(
                `AUTO_EXECUTION_FORBIDDEN_NON_PAPER: currentMode=${currentMode}, requestMode=${tradingRequest?.tradingMode || 'unknown'}`
            );
            this.trackOperationError(opContext, 'mode_guard', modeError, {
                currentMode,
                requestMode: tradingRequest?.tradingMode || 'unknown'
            });
            throw modeError;
        }

        const transaction = await sequelize.transaction();
        
        try {
            // 1. Проверка canAutoExecute() (вне транзакции, только чтение)
            let canExecute;
            try {
                canExecute = await this.canAutoExecute(tradingRequest);
            } catch (error) {
                throw this.createStepError(opContext, 'can_execute_check', error);
            }
            if (!canExecute.canAutoExecute) {
                throw new Error(canExecute.reason);
            }
            
            // 2. Подтверждение заявки (в транзакции)
            try {
                await tradingRequest.approve(null, { transaction });
            } catch (error) {
                throw this.createStepError(opContext, 'approve_request', error);
            }
            tradingRequest.autoExecuted = true;
            tradingRequest.autoExecutionPhase = this.stats.currentPhase;
            try {
                await tradingRequest.save({ transaction });
            } catch (error) {
                throw this.createStepError(opContext, 'save_approved_request', error);
            }
            
            // 3. Симуляция исполнения (вне транзакции, может быть долго)
            const order = {
                figi: tradingRequest.figi,
                action: tradingRequest.action,
                quantity: tradingRequest.quantity,
                price: tradingRequest.priceAtRequest
            };
            
            let executionResult;
            try {
                executionResult = await RealisticExecutionSimulator.simulateExecution(order);
            } catch (error) {
                throw this.createStepError(opContext, 'simulate_execution', error);
            }
            
            // 4. Преобразование в формат для TradingEngine
            const signal = {
                symbol: tradingRequest.figi,
                figi: tradingRequest.figi,
                ticker: tradingRequest.ticker,
                action: tradingRequest.action,
                quantity: executionResult.executedQuantity,
                price: executionResult.executedPrice,
                confidence: tradingRequest.confidence,
                score: tradingRequest.score
            };
            
            // 5. Исполнение через TradingEngine (в транзакции)
            // TradingEngine.executePaperOrder не поддерживает транзакции напрямую,
            // но мы можем обновить заявку после исполнения
            let tradeResult;
            try {
                tradeResult = await TradingEngine.executePaperOrder(signal, executionResult);
            } catch (error) {
                throw this.createStepError(opContext, 'execute_paper_order', error);
            }
            
            // 6. Обновление заявки (в транзакции)
            const executionResultForRequest = {
                executedPrice: executionResult.executedPrice,
                executedQuantity: executionResult.executedQuantity,
                commission: executionResult.commission,
                slippage: executionResult.slippage,
                spread: executionResult.spread,
                liquidityLevel: executionResult.liquidityLevel,
                originalPrice: executionResult.originalPrice
            };
            
            try {
                await tradingRequest.execute(executionResultForRequest, { transaction });
            } catch (error) {
                throw this.createStepError(opContext, 'persist_execution', error);
            }
            
            // 7. Обновление статистики (в транзакции)
            try {
                await this.updateStats(tradeResult, { transaction });
            } catch (error) {
                throw this.createStepError(opContext, 'update_stats', error);
            }
            
            try {
                await transaction.commit();
            } catch (error) {
                throw this.createStepError(opContext, 'commit_transaction', error);
            }
            
            // 8. Запись в FeedbackService и RL обучение (вне транзакции, асинхронно)
            setImmediate(async () => {
                try {
                    // Расчет PnL для FeedbackService
                    let calculatedPnL = 0;
                    if (tradingRequest.action === 'SELL') {
                        // Найти соответствующую BUY заявку
                        const buyRequest = await TradingRequest.findOne({
                            where: {
                                figi: tradingRequest.figi,
                                action: 'BUY',
                                status: 'EXECUTED',
                                executedAt: { [Op.lt]: tradingRequest.executedAt }
                            },
                            order: [['executedAt', 'DESC']]
                        });
                        
                        if (buyRequest && buyRequest.actualPrice) {
                            const buyPrice = buyRequest.actualPrice;
                            const sellPrice = executionResult.executedPrice;
                            calculatedPnL = ((sellPrice - buyPrice) / buyPrice) * 100; // В процентах
                        }
                    }
                    
                    // Запись в FeedbackService
                    const FeedbackService = (await import('./FeedbackService.js')).default;
                    if (FeedbackService && FeedbackService.isInitialized) {
                        await FeedbackService.recordTradeResult(
                            tradingRequest.recommendationId,
                            executionResult.executedPrice,
                            calculatedPnL,
                            {
                                tradingRequestId: tradingRequest.id,
                                figi: tradingRequest.figi,
                                autoExecuted: true
                            }
                        );
                    }
                    
                    // Инкрементальное обучение RL (если нужно)
                    await this.scheduleRLTraining(tradingRequest.figi, tradeResult);
                } catch (error) {
                    this.trackOperationError(opContext, 'post_commit_feedback_or_rl', error);
                    LoggerService.error('Failed to record trade result or train RL', {
                        requestId: tradingRequest.id,
                        error: error.message
                    });
                }
            });
            
            LoggerService.info('Auto-executed trading request', {
                requestId: tradingRequest.id,
                figi: tradingRequest.figi,
                action: tradingRequest.action,
                executedPrice: executionResult.executedPrice,
                executedQuantity: executionResult.executedQuantity
            });
            
            return {
                success: true,
                tradingRequest,
                executionResult,
                tradeResult
            };
        } catch (error) {
            this.trackOperationError(opContext, 'auto_execute_pipeline', error);
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                this.trackOperationError(opContext, 'rollback_transaction', rollbackError);
            }
            
            // Обработка ошибки
            if (tradingRequest.status === 'APPROVED') {
                tradingRequest.autoExecutionFailed = true;
                tradingRequest.executionError = error.message;
                await tradingRequest.save();
            }
            
            LoggerService.error('Failed to auto-execute request', {
                requestId: tradingRequest.id,
                error: error.message
            });
            
            throw error;
        }
    }

    /**
     * Обработка новой заявки (вызывается из TradingRequestService)
     * @param {Object} tradingRequest - Новая заявка
     */
    async processNewRequest(tradingRequest) {
        const opContext = this.buildOperationContext('processNewRequest', tradingRequest);
        if (!this.isEnabled || !this.isInitialized) {
            return;
        }
        
        // Проверка блокировки
        if (this.processingLock) {
            LoggerService.warn('Another request is being processed, skipping', {
                requestId: tradingRequest.id
            });
            return;
        }
        
        this.processingLock = true;
        try {
            const canExecute = await this.canAutoExecute(tradingRequest);
            if (canExecute.canAutoExecute) {
                this.recordDecision(true, 'passed');
                await this.autoExecuteRequest(tradingRequest);
            } else {
                this.recordDecision(false, canExecute.reason);
                LoggerService.debug('Cannot auto-execute request', {
                    requestId: tradingRequest.id,
                    reason: canExecute.reason,
                    gateMetrics: canExecute.gateMetrics || null,
                    releaseGateMetrics: canExecute.releaseGateMetrics || null
                });
            }
        } catch (error) {
            this.recordDecision(false, `processing_error: ${error.message}`);
            this.trackOperationError(opContext, 'process_request', error);
            LoggerService.error('Error processing new request', {
                requestId: tradingRequest.id,
                error: error.message
            });
        } finally {
            this.processingLock = false;
        }
    }

    /**
     * Обновление статистики после сделки
     */
    async updateStats(tradeResult, options = {}) {
        try {
            this.stats.dailyTrades += 1;
            this.stats.totalTrades += 1;
            this.stats.lastTradeTime = new Date();
            
            // Обновление PnL (только для SELL сделок)
            if (tradeResult.trade && tradeResult.trade.pnl !== undefined) {
                this.stats.dailyPnL += tradeResult.trade.pnl;
            }
            
            // Сохранение в БД
            if (options.transaction) {
                // Сохраняем после commit транзакции
                setImmediate(() => this.saveDailyStats());
            } else {
                await this.saveDailyStats();
            }
        } catch (error) {
            LoggerService.error('Failed to update stats', {
                error: error.message
            });
        }
    }

    /**
     * Сброс дневной статистики (вызывается планировщиком)
     */
    async resetDailyStats() {
        try {
            this.stats.dailyTrades = 0;
            this.stats.dailyPnL = 0;
            this.stats.lastTradeTime = null;
            this.stats.decisionQuality = {
                considered: 0,
                approved: 0,
                blocked: 0,
                blockedByReason: {}
            };
            this.stats.admissionQuality = {
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
            this.stats.errorTracking = {
                totalErrors: 0,
                byOperation: {},
                recent: []
            };
            
            await this.saveDailyStats();
            
            LoggerService.info('Daily stats reset', {
                totalTrades: this.stats.totalTrades
            });
        } catch (error) {
            LoggerService.error('Failed to reset daily stats', {
                error: error.message
            });
        }
    }

    /**
     * Переход на следующую фазу
     */
    async advancePhase() {
        const phases = ['phase1', 'phase2', 'phase3'];
        const currentIndex = phases.indexOf(this.stats.currentPhase);
        
        if (currentIndex < phases.length - 1) {
            this.stats.currentPhase = phases[currentIndex + 1];
            await this.saveDailyStats();
            
            LoggerService.info('Advanced to next phase', {
                newPhase: this.stats.currentPhase
            });
        }
    }

    /**
     * Проверка условий перехода на следующую фазу
     */
    async checkPhaseAdvancement() {
        // Реализация критериев из config/autoPaperTrading.js
        // Пока упрощенная версия
        const stats = await AutoPaperTradingStats.getTodayStats();
        
        // Проверка критериев перехода
        // В реальной реализации здесь была бы проверка:
        // - Минимум дней в фазе
        // - Минимум сделок
        // - Win rate >= 55%
        // - Просадка < 10%
        
        // Пока оставляем пустым для будущей реализации
    }

    /**
     * Включение автоматической торговли
     */
    async enable() {
        this.isEnabled = true;
        
        // СИНХРОНИЗАЦИЯ: Убеждаемся, что виртуальный портфель загружен и синхронизирован
        try {
            await TradingEngine.loadVirtualPortfolio();
            LoggerService.info('Virtual portfolio loaded for auto-paper trading', {
                positionsCount: Object.keys(TradingEngine.virtualPortfolio?.positions || {}).length,
                cash: TradingEngine.virtualPortfolio?.cash || 0
            });
        } catch (error) {
            LoggerService.warn('Failed to load virtual portfolio during enable', {
                error: error.message
            });
        }
        
        // Обработать только свежие заявки (созданные в последние 4 часа)
        const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
        const pendingRequests = await TradingRequest.findAll({
            where: {
                status: 'PENDING',
                tradingMode: 'paper',
                createdAt: { [Op.gte]: fourHoursAgo }
            },
            order: [['createdAt', 'ASC']],
            limit: 50 // Ограничение на количество обработки
        });
        
        // Обработать заявки последовательно
        for (const request of pendingRequests) {
            try {
                await this.processNewRequest(request);
            } catch (error) {
                LoggerService.warn('Failed to process old request', {
                    requestId: request.id,
                    error: error.message
                });
            }
        }
        
        LoggerService.info('Auto-paper trading enabled', {
            pendingRequestsProcessed: pendingRequests.length,
            positionsInPortfolio: Object.keys(TradingEngine.virtualPortfolio?.positions || {}).length
        });
    }

    /**
     * Выключение автоматической торговли
     */
    async disable() {
        this.isEnabled = false;
        LoggerService.info('Auto-paper trading disabled');
    }

    /**
     * Планирование RL обучения
     */
    async scheduleRLTraining(figi, tradeResult) {
        try {
            const ReinforcementLearningService = (await import('./ReinforcementLearningService.js')).default;
            if (!ReinforcementLearningService || !ReinforcementLearningService.isInitialized) {
                return;
            }
            
            const lastTraining = this.rlTrainingCache.get(figi) || 0;
            const now = Date.now();
            const fiveMinutes = 5 * 60 * 1000;
            
            if (now - lastTraining < fiveMinutes) {
                // Сохранить для батч-обучения позже
                // Пока просто пропускаем
                return;
            }
            
            // Проверка наличия модели для инструмента
            // В реальной реализации здесь была бы проверка hasModelForFigi()
            // Пока упрощенная версия
            
            // Обучить немедленно
            // await ReinforcementLearningService.incrementalTrainFromTrades(figi, [tradeResult]);
            this._evictRlTrainingCache();
            this.rlTrainingCache.set(figi, now);
        } catch (error) {
            LoggerService.warn('RL training scheduling failed', {
                figi,
                error: error.message
            });
        }
    }

    /**
     * Eviction для rlTrainingCache
     */
    _evictRlTrainingCache() {
        const now = Date.now();
        for (const [key, ts] of this.rlTrainingCache.entries()) {
            if ((now - ts) > this.rlTrainingCacheTTL) this.rlTrainingCache.delete(key);
        }
        if (this.rlTrainingCache.size > this.maxRlTrainingCacheSize) {
            const entries = [...this.rlTrainingCache.entries()].sort((a, b) => a[1] - b[1]);
            for (let i = 0; i < this.rlTrainingCache.size - this.maxRlTrainingCacheSize; i++) {
                this.rlTrainingCache.delete(entries[i][0]);
            }
        }
    }

    /**
     * Получение статуса сервиса
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            isEnabled: this.isEnabled,
            currentPhase: this.stats.currentPhase,
            stats: {
                dailyTrades: this.stats.dailyTrades,
                dailyPnL: this.stats.dailyPnL,
                totalTrades: this.stats.totalTrades,
                lastTradeTime: this.stats.lastTradeTime,
                decisionQuality: this.stats.decisionQuality,
                admissionQuality: this.stats.admissionQuality,
                errorTracking: this.stats.errorTracking
            },
            settings: this.getCurrentSettings()
            ,
            gates: {
                walkForward: this.walkForwardGateCache?.result || null,
                release: this.releaseGateCache?.result || null
            }
        };
    }

    /**
     * Валидация настроек
     */
    validateSettings(newSettings) {
        const errors = [];
        
        // Проверка диапазонов
        if (newSettings.minConfidence !== undefined) {
            if (newSettings.minConfidence < 0.5 || newSettings.minConfidence > 0.95) {
                errors.push('minConfidence must be between 0.5 and 0.95');
            }
        }
        
        if (newSettings.maxDailyTrades !== undefined) {
            if (newSettings.maxDailyTrades < 1 || newSettings.maxDailyTrades > 50) {
                errors.push('maxDailyTrades must be between 1 and 50');
            }
        }
        
        if (newSettings.maxPositionSize !== undefined) {
            if (newSettings.maxPositionSize < 0.01 || newSettings.maxPositionSize > 0.1) {
                errors.push('maxPositionSize must be between 0.01 and 0.1');
            }
        }
        
        // Проверка логики
        if (newSettings.minScore !== undefined && newSettings.maxScore !== undefined) {
            if (newSettings.minScore >= newSettings.maxScore) {
                errors.push('minScore must be less than maxScore');
            }
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Обновление настроек
     */
    async updateSettings(newSettings) {
        const validation = this.validateSettings(newSettings);
        if (!validation.isValid) {
            throw new Error(`Invalid settings: ${validation.errors.join(', ')}`);
        }
        
        // Обновляем настройки
        Object.assign(this.settings, newSettings);
        
        // Сохраняем в БД (если нужно)
        await this.saveDailyStats();
    }
}

// Создаем единственный экземпляр
const autoPaperTradingService = new AutoPaperTradingService();

export default autoPaperTradingService;

