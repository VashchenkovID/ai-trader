import axios from 'axios';
import Cookies from 'js-cookie';
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
import {autoPaperTradingService} from "./services/autoPaperTradingService.ts";

// В продакшене используем относительный путь через nginx proxy
// В development можно установить window.env.REACT_APP_API_URL
// Если window.env не установлен, используем относительный путь (работает через nginx proxy)
const API_BASE_URL = (window as any).env?.REACT_APP_API_URL || '';

export const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    withCredentials: true,
} as any);

// Интерцептор для добавления токена в заголовки
api.interceptors.request.use(
    (config) => {
        const token = Cookies.get('auth_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Интерцептор для обработки ошибок авторизации
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Токен недействителен или истек
            Cookies.remove('auth_token');
            Cookies.remove('user');
            // Перенаправляем на страницу логина только если мы не на ней
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

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
    positionsValue?: number;
    totalValue: number;
    trades: any[];
    mode?: string;
    initialCapital?: number;
    pnl?: {
        total: number;
        totalPercent: number;
        realized: number;
        realizedPercent: number;
        unrealized: number;
        winRate: number;
        totalTrades: number;
    };
    totalPnL?: number; // Для обратной совместимости
    totalPnLPercent?: number; // Для обратной совместимости
}

export interface TradingStats {
    portfolioValue: number;
    cash: number;
    totalPnL: number;
    winRate: number;
    totalTrades: number;
    successfulTrades: number;
    dayChange?: number; // Опциональное поле для изменения за день
    dayChangePercent?: number; // Опциональное поле для процентного изменения за день
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
    explanation?: any; // Опциональное поле
    priceAtAnalysis: number;
    currentPrice?: number; // Опциональное поле для текущей цены
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
    // Дополнительные метрики производительности
    responseTime?: number;
    throughput?: number;
    errorRate?: number;
    cacheHitRate?: number;
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

// Экспорт типов для автоматической торговли
export type { AutoPaperTradingStatus, AutoPaperTradingStats, AutoPaperTradingSettings } from "./services/autoPaperTradingService.ts";

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
    ...autoPaperTradingService,
};

export default apiService;
