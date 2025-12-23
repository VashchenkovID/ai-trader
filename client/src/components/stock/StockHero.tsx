import React from 'react';
import { Card, Badge, InfoTooltip } from '../ui';
import BuyButton from '../recommendations/BuyButton';
import AnalyzeButton from '../recommendations/AnalyzeButton';
import TrainButton from '../recommendations/TrainButton';
import { translateRecommendation } from '../../utils/recommendationTranslator';
import { translateSector } from '../../utils/sectorTranslator';
import './StockHero.css';

interface StockHeroProps {
  stockDetail: {
    figi: string;
    ticker: string;
    name: string;
    sector?: string;
    currentPrice: number;
    currency: string;
    lot: number;
    dividendYield?: number;
    lastPrice?: number;
    lastPriceTime?: string;
  };
  currentPrediction?: {
    figi: string;
    ticker: string;
    name: string;
    recommendation: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    score: number;
    priceAtAnalysis: number;
    targetPrice?: number;
    stopLoss?: number;
    takeProfit?: number;
    explanation?: any;
    horizons?: any;
    analysisDate?: string;
  };
  onAnalysisComplete?: () => void;
  onTrainingComplete?: () => void;
}

export const StockHero: React.FC<StockHeroProps> = ({
  stockDetail,
  currentPrediction,
  onAnalysisComplete,
  onTrainingComplete,
}) => {
  const formatCurrency = (price: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: stockDetail.currency || 'RUB',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffHours / 24);

      if (diffHours < 1) {
        return 'Только что';
      } else if (diffHours < 24) {
        return `${diffHours} ${diffHours === 1 ? 'час' : diffHours < 5 ? 'часа' : 'часов'} назад`;
      } else if (diffDays < 7) {
        return `${diffDays} ${diffDays === 1 ? 'день' : diffDays < 5 ? 'дня' : 'дней'} назад`;
      } else {
        return date.toLocaleDateString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
      }
    } catch {
      return '—';
    }
  };

  // Вычисляем изменение цены (если есть lastPrice)
  const priceChange = stockDetail.lastPrice 
    ? stockDetail.currentPrice - stockDetail.lastPrice 
    : null;
  const priceChangePercent = priceChange && stockDetail.lastPrice
    ? ((priceChange / stockDetail.lastPrice) * 100)
    : null;

  // Вычисляем потенциальную прибыль и риск
  const potentialProfit = currentPrediction?.targetPrice
    ? ((currentPrediction.targetPrice - stockDetail.currentPrice) / stockDetail.currentPrice) * 100
    : null;
  
  const risk = currentPrediction?.stopLoss
    ? ((stockDetail.currentPrice - currentPrediction.stopLoss) / stockDetail.currentPrice) * 100
    : null;

  const confidencePercent = currentPrediction 
    ? Math.round(currentPrediction.confidence * 100)
    : null;

  const getAnalysisStatus = (analysisDate?: string) => {
    if (!analysisDate) return null;
    const date = new Date(analysisDate);
    const now = new Date();
    const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffHours <= 6) {
      return { status: 'fresh', label: 'Актуально', variant: 'success' as const };
    }
    if (diffHours <= 24) {
      return { status: 'warning', label: 'Нужно обновить скоро', variant: 'warning' as const };
    }
    return { status: 'stale', label: 'Требуется обновление', variant: 'error' as const };
  };

  const analysisStatus = currentPrediction ? getAnalysisStatus(currentPrediction.analysisDate) : null;

  const getRecommendationVariant = (recommendation: string): 'success' | 'error' | 'neutral' => {
    if (recommendation === 'BUY') return 'success';
    if (recommendation === 'SELL') return 'error';
    return 'neutral';
  };

  const getConfidenceVariant = (confidence: number): 'success' | 'warning' | 'error' => {
    if (confidence >= 0.7) return 'success';
    if (confidence >= 0.5) return 'warning';
    return 'error';
  };

  // Данные для кнопки покупки: всегда показываем, даже без прогноза
  const buyRowData = currentPrediction
    ? {
        figi: currentPrediction.figi || stockDetail.figi,
        ticker: currentPrediction.ticker || stockDetail.ticker,
        name: currentPrediction.name || stockDetail.name,
        recommendation: currentPrediction.recommendation || 'HOLD',
        confidence: currentPrediction.confidence || 0,
        score: currentPrediction.score || 0,
        priceAtAnalysis: currentPrediction.priceAtAnalysis || stockDetail.currentPrice,
        targetPrice: currentPrediction.targetPrice,
        stopLoss: currentPrediction.stopLoss,
        takeProfit: currentPrediction.takeProfit,
        explanation: currentPrediction.explanation,
        horizons: currentPrediction.horizons,
      }
    : {
        figi: stockDetail.figi,
        ticker: stockDetail.ticker,
        name: stockDetail.name,
        recommendation: 'HOLD' as const,
        confidence: 0,
        score: 0,
        priceAtAnalysis: stockDetail.currentPrice,
        targetPrice: undefined,
        stopLoss: undefined,
        takeProfit: undefined,
        explanation: null,
        horizons: null,
      };

  return (
    <Card variant="default" className="stock-hero">
      {/* Заголовок */}
      <div className="stock-hero-header">
        <div className="stock-hero-title">
          <h1 className="stock-hero-name">{stockDetail.name}</h1>
          <div className="stock-hero-meta">
            <Badge variant="info" size="sm">{stockDetail.ticker}</Badge>
            {stockDetail.sector && (
            <Badge variant="info" size="sm">
                {translateSector(stockDetail.sector)}
              </Badge>
            )}
            {stockDetail.dividendYield && (
              <Badge variant="info" size="sm">
                Див. {((stockDetail.dividendYield || 0) * 100).toFixed(2)}%
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Основная информация */}
      <div className="stock-hero-main">
        {/* Цена */}
        <div className="stock-hero-price-section">
          <div className="stock-hero-price-label">Текущая цена</div>
          <div className="stock-hero-price-value">
            {formatCurrency(stockDetail.currentPrice)}
          </div>
          {priceChange !== null && priceChangePercent !== null && (
            <div className={`stock-hero-price-change ${priceChange >= 0 ? 'positive' : 'negative'}`}>
              {priceChange >= 0 ? '↑' : '↓'} {Math.abs(priceChangePercent).toFixed(2)}%
              {priceChange !== 0 && ` (${formatCurrency(Math.abs(priceChange))})`}
            </div>
          )}
          {stockDetail.lastPriceTime && (
            <div className="stock-hero-price-time">
              Обновлено: {formatDate(stockDetail.lastPriceTime)}
            </div>
          )}
        </div>

        {/* Рекомендация */}
        {currentPrediction && (
          <div className="stock-hero-recommendation-section">
            <div className="stock-hero-recommendation-label">
              Рекомендация AI
              <InfoTooltip
                explanation="Рекомендация основана на анализе множества факторов: технических индикаторов, фундаментальных данных и прогнозах нейросетей. BUY - покупка, SELL - продажа, HOLD - удержание."
                title="Что означает рекомендация?"
                variant="info"
              />
            </div>
            <div className="stock-hero-recommendation-content">
              <Badge 
                variant={getRecommendationVariant(currentPrediction.recommendation)} 
                size="md"
              >
                {translateRecommendation(currentPrediction.recommendation)}
              </Badge>
              {confidencePercent !== null && (
                <div className="stock-hero-confidence" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Badge variant={getConfidenceVariant(currentPrediction.confidence)} size="sm">
                    Уверенность: {confidencePercent}%
                  </Badge>
                  <InfoTooltip
                    explanation="Насколько AI уверен в своей рекомендации. Чем выше значение, тем надежнее прогноз. Высокая уверенность (70%+) означает, что модель видит четкие сигналы."
                    title="Уверенность AI"
                    variant="info"
                  />
                </div>
              )}
              {currentPrediction.analysisDate && (
                <div className="stock-hero-analysis-date">
                  Анализ: {formatDate(currentPrediction.analysisDate)}
                  {analysisStatus && (
                    <Badge
                      variant={analysisStatus.variant}
                      size="sm"
                      style={{ marginLeft: '8px' }}
                    >
                      {analysisStatus.label}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Целевая цена и стоп-лосс */}
        {(potentialProfit !== null || risk !== null) && (
          <div className="stock-hero-targets-section">
            {potentialProfit !== null && potentialProfit > 0 && (
              <div className="stock-hero-target">
                <div className="stock-hero-target-label">
                  🎯 Целевая цена
                  <InfoTooltip
                    explanation="Цена, до которой AI прогнозирует рост акции. При достижении этой цены рекомендуется рассмотреть продажу для фиксации прибыли."
                    title="Целевая цена"
                    variant="success"
                  />
                </div>
                <div className="stock-hero-target-value positive">
                  {formatCurrency(currentPrediction!.targetPrice!)}
                  <span className="stock-hero-target-percent">+{potentialProfit.toFixed(1)}%</span>
                </div>
              </div>
            )}
            {risk !== null && (
              <div className="stock-hero-target">
                <div className="stock-hero-target-label">
                  ⚠️ Стоп-лосс
                  <InfoTooltip
                    explanation="Цена, при достижении которой рекомендуется продать акцию для ограничения убытков. Это защитный механизм, который помогает минимизировать потери при неблагоприятном движении цены."
                    title="Стоп-лосс"
                    variant="warning"
                  />
                </div>
                <div className="stock-hero-target-value negative">
                  {formatCurrency(currentPrediction!.stopLoss!)}
                  <span className="stock-hero-target-percent">-{risk.toFixed(1)}%</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Кнопки действий */}
      <div className="stock-hero-actions">
        <BuyButton
          rowData={buyRowData}
          onRequestCreated={onAnalysisComplete}
        />
        <AnalyzeButton
          rowData={{
            figi: buyRowData.figi,
            ticker: buyRowData.ticker,
            name: buyRowData.name,
          }}
          onAnalysisComplete={onAnalysisComplete}
        />
        <TrainButton
          rowData={{
            figi: buyRowData.figi,
            ticker: buyRowData.ticker,
            name: buyRowData.name,
          }}
          onTrainingComplete={onTrainingComplete}
        />
      </div>

      {/* Дополнительная информация */}
      <div className="stock-hero-details">
        <div className="stock-hero-detail-item">
          <span className="stock-hero-detail-label">FIGI:</span>
          <span className="stock-hero-detail-value">{stockDetail.figi}</span>
        </div>
        <div className="stock-hero-detail-item">
          <span className="stock-hero-detail-label">Лот:</span>
          <span className="stock-hero-detail-value">{stockDetail.lot}</span>
        </div>
      </div>
    </Card>
  );
};

export default StockHero;

