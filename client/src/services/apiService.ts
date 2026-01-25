import axios from 'axios';
import {systemService} from "./services/systemService.ts";
import {neuralNetworkService} from "./services/neuralNetworkService.ts";
import {tradingService} from "./services/tradingService.ts";
import {recommendationService} from "./services/recommendationService.ts";
import {monitoringService} from "./services/monitoringService.ts";
import {settingsService} from "./services/settingsService.ts";
import {riskManagementService} from "./services/riskManagementService.ts";
import {validationService} from "./services/validationService.ts";
import {migrationService} from "./services/migrationService.ts";
import {newsService} from "./services/newsService.ts";
import {telegramService} from "./services/telegramService.ts";
import {cacheService} from "./services/cacheService.ts";
import {stockService} from "./services/stockService.ts";
import {macroDataService} from "./services/macroDataService.ts";

const API_BASE_URL = (window as any).env?.REACT_APP_API_URL || 'http://localhost:3001';

export const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
} as any);

// Интерфейсы для типизации
export interface SystemStatus {
    neuralNetwork: any;
    websocket: any;
    tradingEngine: any;
    ensemble: any;
    database: any;
    timestamp: string;
}

export interface CacheStatus {
    lastUpdate: string | null;
    timeSinceLastUpdate: number | null; // в минутах
    updateInterval: number; // в минутах
    needsUpdate: boolean;
    nextUpdateIn: number | null; // в минутах
}

export interface SystemResources {
    cpu: {
        usage: number;
        cores: number;
        loadAverage: number[];
    };
    memory: {
        used: number;
        total: number;
        free: number;
        usage: number;
    };
    timestamp: string;
}

export interface HealthStatus {
    status: string;
    timestamp: string;
    uptime: number;
    memory: any;
    version: string;
}

export interface Portfolio {
    cash: number;
    positions: Record<string, any>;
    totalValue: number;
    trades: any[];
}

export interface TradingStats {
    portfolioValue: number;
    cash: number;
    totalPnL: number;
    winRate: number;
    totalTrades: number;
    successfulTrades: number;
    recommendations?: {
        figi: string;
        ticker: string;
        name: string;
        recommendation: 'BUY' | 'SELL' | 'HOLD';
        confidence: number;
        score: number;
    }[];
}

export interface Recommendation {
    figi: string;
    ticker: string;
    name: string;
    recommendation: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    score: number;
    analysis: any;
    explanation: any;
    priceAtAnalysis: number;
    targetPrice: number;
    stopLoss: number;
    takeProfit: number;
    analysisDate: string;
}

export interface TradingMode {
    mode: 'paper' | 'micro' | 'real';
    settings: any;
    timestamp: string;
}

export interface InstrumentStat {
    id?: number;
    figi: string;
    ticker: string;
    winRate: number;
    averageWin: number;
    averageLoss: number;
    totalTrades: number;
    profitableTrades: number;
    losingTrades: number;
    volatility: number | null;
    volatilityPeriod: number | null;
    kellyFraction: number | null;
    conservativeKelly: number | null;
    lastUpdated: string;
    lastTradeDate: string | null;
    metadata?: any;
}

export interface KellySettings {
    enabled: boolean;
    conservativeFactor: number;
    minTrades: number;
    volatilityPeriod: number;
}

export interface KellyCalculation {
    figi: string;
    ticker: string;
    winRate: number;
    averageWin: number;
    averageLoss: number;
    totalTrades: number;
    kellyFraction: number;
    conservativeKelly: number;
    recommendedPositionSize: number;
    volatility: number | null;
    insufficientData: boolean;
}

export interface RiskManagementStatus {
    isActive: boolean;
    maxPositionSize: number;
    maxDrawdown: number;
    maxConsecutiveLosses: number;
    emergencyStop: boolean;
    currentDrawdown: number;
    consecutiveLosses: number;
}

export interface PerformanceMetrics {
    neuralNetwork: any;
    trading: any;
    system: any;
    timestamp: string;
}

export interface Settings {
    key: string;
    value: any;
    description: string;
    category: string;
    dataType: string;
    isEditable: boolean;
    minValue?: number;
    maxValue?: number;
    options?: any[];
    lastUpdated: string;
}

export interface PreflightCheckResults {
    allPassed: boolean;
    details: {
        api: any;
        risk: any;
        monitoring: any;
        backup: any;
    };
    recommendations: string[];
}

export interface MigrationPlan {
    steps: any[];
    totalSteps: number;
    estimatedDuration: number;
    riskAssessment: any;
}

export interface CapitalScalingStatus {
    currentLevel: number;
    maxLevel: number;
    canIncrease: boolean;
    canDecrease: boolean;
    nextLevel: number;
    requirements: any;
}

export interface NewsAnalysis {
    figi: string;
    news: any[];
    sentiment: any;
    impact: any;
    timestamp: string;
}

export interface TelegramSentiment {
    figi: string;
    sentiment: any;
    channels: string[];
    confidence: number;
    timestamp: string;
}

// Основной API сервис
export const apiService = {
    ...systemService,
    ...neuralNetworkService,
    ...tradingService,
    ...recommendationService,
    ...monitoringService,
    ...settingsService,
    ...riskManagementService,
    ...validationService,
    ...migrationService,
    ...newsService,
    ...telegramService,
    ...cacheService,
    ...stockService,
    ...macroDataService,
};

export default apiService;
