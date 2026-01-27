import React, { useState } from 'react';
import { Card } from '../ui';
import { Button } from '../ui';
import { Badge } from '../ui';
import { useNavigate } from 'react-router-dom';
import { translateRecommendation } from '../../utils/recommendationTranslator';
import BuyButton from './BuyButton';
import './RecommendationInstrumentCard.css';

interface Recommendation {
  figi: string;
  ticker: string;
  name: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  score: number;
  priceAtAnalysis: number;
  currentPrice?: number; // Опциональное поле для текущей цены
  targetPrice?: number;
  stopLoss?: number;
  explanation?: any; // Опциональное поле для объяснения
  takeProfit?: number;
  sector?: string;
  analysisDate: string;
  isActive: boolean;
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
  portfolioPosition?: {
    size: number; // % от капитала
    pnl: number; // P&L в %
    entryDate: string;
    entryPrice: number;
  };
  risk?: {
    level: 'low' | 'medium' | 'high';
    volatility: number;
    maxRisk: number; // % от капитала
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

interface RecommendationInstrumentCardProps {
  recommendation: Recommendation;
  onBuy?: (figi: string) => void;
  onSell?: (figi: string) => void;
  onDetails?: (figi: string) => void;
  onWatchlist?: (figi: string) => void;
  loading?: boolean;
  isNew?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
}

export const RecommendationInstrumentCard: React.FC<RecommendationInstrumentCardProps> = ({
  recommendation,
  onBuy,
  onSell,
  onDetails,
  onWatchlist,
  loading: _loading = false,
  isNew = false,
  expanded = false,
  onToggleExpand,
}) => {
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(expanded);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  };

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const getRecommendationVariant = (rec: string): 'success' | 'error' | 'neutral' => {
    if (rec === 'BUY') return 'success';
    if (rec === 'SELL') return 'error';
    return 'neutral';
  };

  const getConfidenceVariant = (confidence: number): 'success' | 'warning' | 'error' => {
    if (confidence >= 0.7) return 'success';
    if (confidence >= 0.5) return 'warning';
    return 'error';
  };

  const getRiskVariant = (level: string): 'success' | 'warning' | 'error' => {
    if (level === 'low') return 'success';
    if (level === 'medium') return 'warning';
    return 'error';
  };

  const getPriorityVariant = (priority: string): 'error' | 'warning' | 'info' | 'neutral' => {
    if (priority === 'critical') return 'error';
    if (priority === 'high') return 'warning';
    if (priority === 'medium') return 'info';
    return 'neutral';
  };

  const calculatePotentialProfit = () => {
    if (!recommendation.targetPrice || recommendation.recommendation !== 'BUY') {
      return null;
    }
    const profitPercent = ((recommendation.targetPrice - recommendation.priceAtAnalysis) / recommendation.priceAtAnalysis) * 100;
    return {
      percent: profitPercent,
      amount: recommendation.targetPrice - recommendation.priceAtAnalysis,
    };
  };

  const calculateRisk = () => {
    if (!recommendation.stopLoss || recommendation.recommendation !== 'BUY') {
      return null;
    }
    const riskPercent = ((recommendation.priceAtAnalysis - recommendation.stopLoss) / recommendation.priceAtAnalysis) * 100;
    return {
      percent: riskPercent,
      amount: recommendation.priceAtAnalysis - recommendation.stopLoss,
    };
  };

  const calculateAgreement = () => {
    if (!recommendation.horizons) return null;
    const horizons = [
      recommendation.horizons.shortTerm,
      recommendation.horizons.mediumTerm,
      recommendation.horizons.longTerm,
    ].filter(Boolean);
    
    if (horizons.length === 0) return null;
    
    const sameRecommendation = horizons.filter(
      (h) => h?.recommendation === recommendation.recommendation
    ).length;
    
    return sameRecommendation / horizons.length;
  };

  const potentialProfit = calculatePotentialProfit();
  const risk = calculateRisk();
  const agreement = calculateAgreement();
  const priceChange = recommendation.currentPrice
    ? ((recommendation.currentPrice - recommendation.priceAtAnalysis) / recommendation.priceAtAnalysis) * 100
    : null;

  const handleToggleExpand = () => {
    setIsExpanded(!isExpanded);
    if (onToggleExpand) {
      onToggleExpand();
    }
  };

  // const _handleBuy = (e: React.MouseEvent) => { // Reserved for future use
  //   e.stopPropagation();
  //   if (onBuy) {
  //     onBuy(recommendation.figi);
  //   }
  // };

  // const _handleSell = (e: React.MouseEvent) => { // Reserved for future use
  //   e.stopPropagation();
  //   if (onSell) {
  //     onSell(recommendation.figi);
  //   }
  // };

  const handleDetails = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDetails) {
      onDetails(recommendation.figi);
    } else {
      navigate(`/stock/${recommendation.figi}`);
    }
  };

  const handleWatchlist = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onWatchlist) {
      onWatchlist(recommendation.figi);
    }
  };

  return (
    <Card
      variant="interactive"
      hover
      className={`recommendation-instrument-card ${isExpanded ? 'expanded' : ''} ${recommendation.priority ? `priority-${recommendation.priority}` : ''}`}
      onClick={handleToggleExpand}
    >
      {/* Заголовок */}
      <div className="recommendation-instrument-card-header">
        <div className="recommendation-instrument-card-title">
          <div className="recommendation-instrument-card-name-row">
            <h3 className="recommendation-instrument-card-name">{recommendation.name}</h3>
            {isNew && (
              <Badge variant="success" size="sm">
                Новое
              </Badge>
            )}
            {recommendation.priority && (
              <Badge variant={getPriorityVariant(recommendation.priority)} size="sm">
                {recommendation.priority === 'critical' && '🔴 Критический'}
                {recommendation.priority === 'high' && '🟠 Высокий'}
                {recommendation.priority === 'medium' && '🟡 Средний'}
                {recommendation.priority === 'low' && '⚪ Низкий'}
              </Badge>
            )}
          </div>
          <span className="recommendation-instrument-card-ticker">{recommendation.ticker}</span>
        </div>
        <div className="recommendation-instrument-card-header-badges">
          {recommendation.sector && (
            <Badge variant="info" size="sm">
              {recommendation.sector}
            </Badge>
          )}
          {agreement !== null && (
            <Badge
              variant={agreement >= 0.7 ? 'success' : agreement >= 0.5 ? 'warning' : 'error'}
              size="sm"
            >
              Согласованность: {Math.round(agreement * 100)}%
            </Badge>
          )}
        </div>
      </div>

      {/* Основная рекомендация */}
      <div className="recommendation-instrument-card-main">
        <div className="recommendation-instrument-card-action">
          <Badge variant={getRecommendationVariant(recommendation.recommendation)} size="lg">
            {recommendation.recommendation === 'BUY' && '💰 Покупать'}
            {recommendation.recommendation === 'SELL' && '💸 Продавать'}
            {recommendation.recommendation === 'HOLD' && '⏸️ Держать'}
          </Badge>
          <div className="recommendation-instrument-card-confidence">
            <span className="recommendation-instrument-card-confidence-label">Уверенность:</span>
            <Badge variant={getConfidenceVariant(recommendation.confidence)} size="md">
              {Math.round(recommendation.confidence * 100)}%
            </Badge>
          </div>
        </div>

        {/* Цена и изменение */}
        <div className="recommendation-instrument-card-price">
          <div className="recommendation-instrument-card-price-row">
            <span className="recommendation-instrument-card-price-label">Цена:</span>
            <span className="recommendation-instrument-card-price-value">
              {formatPrice(recommendation.priceAtAnalysis)}
            </span>
            {priceChange !== null && (
              <span
                className={`recommendation-instrument-card-price-change ${
                  priceChange >= 0 ? 'positive' : 'negative'
                }`}
              >
                {formatPercent(priceChange)}
              </span>
            )}
          </div>
          {recommendation.currentPrice && recommendation.currentPrice !== recommendation.priceAtAnalysis && (
            <div className="recommendation-instrument-card-current-price">
              Текущая: {formatPrice(recommendation.currentPrice)}
            </div>
          )}
        </div>
      </div>

      {/* Торговые параметры */}
      <div className="recommendation-instrument-card-trading">
        {potentialProfit && (
          <div className="recommendation-instrument-card-trading-item">
            <span className="recommendation-instrument-card-trading-label">🎯 Целевая цена:</span>
            <span className="recommendation-instrument-card-trading-value profit">
              {formatPrice(recommendation.targetPrice!)}
              <span className="recommendation-instrument-card-trading-percent">
                ({formatPercent(potentialProfit.percent)})
              </span>
            </span>
          </div>
        )}
        {risk && (
          <div className="recommendation-instrument-card-trading-item">
            <span className="recommendation-instrument-card-trading-label">⚠️ Стоп-лосс:</span>
            <span className="recommendation-instrument-card-trading-value risk">
              {formatPrice(recommendation.stopLoss!)}
              <span className="recommendation-instrument-card-trading-percent">
                ({formatPercent(-risk.percent)})
              </span>
            </span>
          </div>
        )}
        {recommendation.takeProfit && (
          <div className="recommendation-instrument-card-trading-item">
            <span className="recommendation-instrument-card-trading-label">✅ Тейк-профит:</span>
            <span className="recommendation-instrument-card-trading-value profit">
              {formatPrice(recommendation.takeProfit)}
            </span>
          </div>
        )}
      </div>

      {/* Позиция в портфеле */}
      {recommendation.portfolioPosition && (
        <div className="recommendation-instrument-card-portfolio">
          <div className="recommendation-instrument-card-portfolio-header">
            <span className="recommendation-instrument-card-portfolio-label">💼 Позиция в портфеле:</span>
            <Badge
              variant={recommendation.portfolioPosition.pnl >= 0 ? 'success' : 'error'}
              size="sm"
            >
              {formatPercent(recommendation.portfolioPosition.pnl)}
            </Badge>
          </div>
          <div className="recommendation-instrument-card-portfolio-details">
            <span>Размер: {recommendation.portfolioPosition.size.toFixed(2)}%</span>
            <span>Вход: {formatPrice(recommendation.portfolioPosition.entryPrice)}</span>
          </div>
        </div>
      )}

      {/* Риск-метрики */}
      {recommendation.risk && (
        <div className="recommendation-instrument-card-risk">
          <div className="recommendation-instrument-card-risk-header">
            <span className="recommendation-instrument-card-risk-label">📊 Риск:</span>
            <Badge variant={getRiskVariant(recommendation.risk.level)} size="sm">
              {recommendation.risk.level === 'low' && 'Низкий'}
              {recommendation.risk.level === 'medium' && 'Средний'}
              {recommendation.risk.level === 'high' && 'Высокий'}
            </Badge>
            {!recommendation.risk.withinLimits && (
              <Badge variant="error" size="sm">
                Превышен лимит
              </Badge>
            )}
          </div>
          <div className="recommendation-instrument-card-risk-details">
            <span>Волатильность: {formatPercent(recommendation.risk.volatility * 100)}</span>
            <span>Макс. риск: {recommendation.risk.maxRisk.toFixed(2)}%</span>
          </div>
        </div>
      )}

      {/* Предсказания по стратегиям (всегда видно) */}
      {recommendation.explanation && (recommendation.explanation as any)?.details?.ensemble?.horizons && (() => {
        const horizons = (recommendation.explanation as any).details.ensemble.horizons;
        const mainHorizon = horizons.mediumTerm || horizons.shortTerm || horizons.longTerm;
        
        if (!mainHorizon?.strategies) return null;
        
        const strategies = mainHorizon.strategies;
        const strategyTypes = [
          { key: 'conservative', name: 'Консервативная', variant: 'info' as const },
          { key: 'moderate', name: 'Умеренная', variant: 'warning' as const },
          { key: 'aggressive', name: 'Агрессивная', variant: 'error' as const }
        ];
        
        return (
          <div className="recommendation-instrument-card-strategies">
            <h4 className="recommendation-instrument-card-strategies-title">📊 Предсказания по стратегиям:</h4>
            <div className="recommendation-instrument-card-strategies-list">
              {strategyTypes.map(({ key, name, variant }) => {
                const strategy = strategies[key as 'conservative' | 'moderate' | 'aggressive'];
                if (!strategy || !strategy.recommendation) return null;
                
                const recVariant = strategy.recommendation === 'BUY' ? 'success' : 
                                  strategy.recommendation === 'SELL' ? 'error' : 'neutral';
                const confidence = strategy.strategyConfidence ?? strategy.confidence ?? 0;
                
                return (
                  <div key={key} className="recommendation-instrument-card-strategy">
                    <div className="recommendation-instrument-card-strategy-header">
                      <Badge variant={variant} size="sm">
                        {name}
                      </Badge>
                      <Badge variant={recVariant} size="sm">
                        {translateRecommendation(strategy.recommendation)}
                      </Badge>
                      <span className="recommendation-instrument-card-strategy-confidence">
                        {Math.round(confidence * 100)}%
                      </span>
                    </div>
                    {strategy.explanation && (
                      <div className="recommendation-instrument-card-strategy-explanation">
                        {strategy.explanation}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Горизонты (развернуто) */}
      {isExpanded && recommendation.horizons && (
        <div className="recommendation-instrument-card-horizons">
          <h4 className="recommendation-instrument-card-horizons-title">📅 Прогнозы по горизонтам:</h4>
          <div className="recommendation-instrument-card-horizons-list">
            {recommendation.horizons.shortTerm && (
              <div className="recommendation-instrument-card-horizon">
                <span className="recommendation-instrument-card-horizon-label">Краткосрочный:</span>
                <Badge variant={getRecommendationVariant(recommendation.horizons.shortTerm.recommendation)} size="sm">
                  {translateRecommendation(recommendation.horizons.shortTerm.recommendation)}
                </Badge>
                <span className="recommendation-instrument-card-horizon-confidence">
                  {Math.round(recommendation.horizons.shortTerm.confidence * 100)}%
                </span>
              </div>
            )}
            {recommendation.horizons.mediumTerm && (
              <div className="recommendation-instrument-card-horizon">
                <span className="recommendation-instrument-card-horizon-label">Среднесрочный:</span>
                <Badge variant={getRecommendationVariant(recommendation.horizons.mediumTerm.recommendation)} size="sm">
                  {translateRecommendation(recommendation.horizons.mediumTerm.recommendation)}
                </Badge>
                <span className="recommendation-instrument-card-horizon-confidence">
                  {Math.round(recommendation.horizons.mediumTerm.confidence * 100)}%
                </span>
              </div>
            )}
            {recommendation.horizons.longTerm && (
              <div className="recommendation-instrument-card-horizon">
                <span className="recommendation-instrument-card-horizon-label">Долгосрочный:</span>
                <Badge variant={getRecommendationVariant(recommendation.horizons.longTerm.recommendation)} size="sm">
                  {translateRecommendation(recommendation.horizons.longTerm.recommendation)}
                </Badge>
                <span className="recommendation-instrument-card-horizon-confidence">
                  {Math.round(recommendation.horizons.longTerm.confidence * 100)}%
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Контекст (развернуто) */}
      {isExpanded && (
        <div className="recommendation-instrument-card-context">
          {recommendation.news && (
            <div className="recommendation-instrument-card-context-item">
              <span className="recommendation-instrument-card-context-label">📰 Новости:</span>
              <span className="recommendation-instrument-card-context-value">
                {recommendation.news.count} новостей
                {recommendation.news.sentiment && (
                  <Badge
                    variant={
                      recommendation.news.sentiment === 'bullish'
                        ? 'success'
                        : recommendation.news.sentiment === 'bearish'
                        ? 'error'
                        : 'neutral'
                    }
                    size="sm"
                  >
                    {recommendation.news.sentiment === 'bullish' && 'Бычий'}
                    {recommendation.news.sentiment === 'bearish' && 'Медвежий'}
                    {recommendation.news.sentiment === 'neutral' && 'Нейтральный'}
                  </Badge>
                )}
              </span>
            </div>
          )}
          {recommendation.sentiment && (
            <div className="recommendation-instrument-card-context-item">
              <span className="recommendation-instrument-card-context-label">💬 Настроения:</span>
              <div className="recommendation-instrument-card-context-sentiment">
                <Badge
                  variant={
                    recommendation.sentiment.telegram === 'bullish'
                      ? 'success'
                      : recommendation.sentiment.telegram === 'bearish'
                      ? 'error'
                      : 'neutral'
                  }
                  size="sm"
                >
                  Telegram: {recommendation.sentiment.telegram === 'bullish' ? 'Бычий' : recommendation.sentiment.telegram === 'bearish' ? 'Медвежий' : 'Нейтральный'}
                </Badge>
                <Badge
                  variant={
                    recommendation.sentiment.analysts === 'bullish'
                      ? 'success'
                      : recommendation.sentiment.analysts === 'bearish'
                      ? 'error'
                      : 'neutral'
                  }
                  size="sm"
                >
                  Аналитики: {recommendation.sentiment.analysts === 'bullish' ? 'Бычий' : recommendation.sentiment.analysts === 'bearish' ? 'Медвежий' : 'Нейтральный'}
                </Badge>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Футер с действиями */}
      <div className="recommendation-instrument-card-footer" onClick={(e) => e.stopPropagation()}>
        <div className="recommendation-instrument-card-footer-actions">
          {/* Используем BuyButton для покупки и продажи */}
          {(recommendation.recommendation === 'BUY' || recommendation.recommendation === 'SELL' || recommendation.portfolioPosition) && (
            <div style={{ width: '100%' }}>
              <BuyButton
                rowData={recommendation}
                mode={recommendation.portfolioPosition ? 'sell' : 'buy'}
                portfolioPosition={recommendation.portfolioPosition ? {
                  size: recommendation.portfolioPosition.size,
                  entryPrice: recommendation.portfolioPosition.entryPrice
                } : undefined}
                onRequestCreated={() => {
                  if (recommendation.portfolioPosition && onSell) {
                    onSell(recommendation.figi);
                  } else if (onBuy) {
                    onBuy(recommendation.figi);
                  }
                }}
                onModalOpen={() => {
                  // Сброс лоадера при открытии модалки
                }}
              />
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', width: '100%', marginTop: '8px' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDetails}
              icon={<span>🔍</span>}
            >
              Детали
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleWatchlist}
              icon={<span>⭐</span>}
            >
              В наблюдение
            </Button>
          </div>
        </div>
        <div className="recommendation-instrument-card-footer-date">
          <span>Обновлено: {new Date(recommendation.analysisDate).toLocaleString('ru-RU')}</span>
        </div>
      </div>
    </Card>
  );
};

export default RecommendationInstrumentCard;

