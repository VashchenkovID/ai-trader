export interface Recommendation {
    figi: string;
    ticker: string;
    name: string;
    recommendation: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    score: number;
    priceAtAnalysis: number;
    currentPrice?: number;
    targetPrice?: number;
    stopLoss?: number;
    takeProfit?: number;
    sector?: string;
    analysisDate: string;
    isActive: boolean;
    explanation?: any;
    analysis?: any;
    // Дополнительные поля для совместимости с API
    id?: string;
    price?: number;
    action?: 'BUY' | 'SELL' | 'HOLD';
    createdAt?: string;
    strategyId?: number;
    horizons?: {
        shortTerm?: {
            recommendation: 'BUY' | 'SELL' | 'HOLD';
            score: number;
            confidence: number;
            name: string;
            description: string;
        };
        mediumTerm?: {
            recommendation: 'BUY' | 'SELL' | 'HOLD';
            score: number;
            confidence: number;
            name: string;
            description: string;
        };
        longTerm?: {
            recommendation: 'BUY' | 'SELL' | 'HOLD';
            score: number;
            confidence: number;
            name: string;
            description: string;
        };
    };
    strategy?: {
        id: number;
        name: string;
        type: 'conservative' | 'moderate' | 'aggressive';
    };
    suggestedStrategy?: {
        id: number;
        name: string;
        type: 'conservative' | 'moderate' | 'aggressive';
    };
    // Дополнительные поля для расширенной карточки
    portfolioPosition?: {
        size: number;
        pnl: number;
        entryDate: string;
        entryPrice: number;
    };
    risk?: {
        level: 'low' | 'medium' | 'high';
        volatility: number;
        maxRisk: number;
        withinLimits: boolean;
    };
    news?: {
        count: number;
        sentiment: 'bullish' | 'bearish' | 'neutral';
        latest?: string;
    };
    sentiment?: {
        telegram: 'bullish' | 'bearish' | 'neutral';
        analysts: 'bullish' | 'bearish' | 'neutral';
    };
    priority?: 'critical' | 'high' | 'medium' | 'low';
}

export interface PortfolioPosition {
    figi: string;
    ticker: string;
    name: string;
    size: number;
    pnl: number;
    currentPrice: number;
    entryPrice: number;
    stopLoss?: number;
    takeProfit?: number;
    proximityToStopLoss?: number;
    proximityToTakeProfit?: number;
}