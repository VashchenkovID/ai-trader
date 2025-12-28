import React from 'react';
import { Card } from '../ui';
import { Badge } from '../ui';
import './RecommendationsSummary.css';

interface RecommendationsSummaryProps {
  totalRecommendations: number;
  buyCount: number;
  sellCount: number;
  holdCount: number;
  highConfidenceCount: number;
  agreementScore: number; // 0-1, согласованность между стратегиями
  topBuyRecommendations: Array<{
    figi: string;
    ticker: string;
    name: string;
    confidence: number;
    potentialProfit?: number;
  }>;
  topSellRecommendations: Array<{
    figi: string;
    ticker: string;
    name: string;
    confidence: number;
    currentLoss?: number;
  }>;
}

export const RecommendationsSummary: React.FC<RecommendationsSummaryProps> = ({
  totalRecommendations,
  buyCount,
  sellCount,
  holdCount,
  highConfidenceCount,
  agreementScore,
  topBuyRecommendations,
  topSellRecommendations,
}) => {
  const getAgreementVariant = (score: number): 'success' | 'warning' | 'error' => {
    if (score >= 0.7) return 'success';
    if (score >= 0.5) return 'warning';
    return 'error';
  };

  const getAgreementLabel = (score: number): string => {
    if (score >= 0.7) return 'Высокая согласованность';
    if (score >= 0.5) return 'Умеренная согласованность';
    return 'Низкая согласованность';
  };

  const overallSignal = buyCount > sellCount ? 'BUY' : sellCount > buyCount ? 'SELL' : 'HOLD';
  const overallSignalVariant = overallSignal === 'BUY' ? 'success' : overallSignal === 'SELL' ? 'error' : 'neutral';

  return (
    <div className="recommendations-summary">
      <Card variant="default" className="recommendations-summary-card">
        <div className="recommendations-summary-header">
          <h2 className="recommendations-summary-title">📊 Сводка рекомендаций</h2>
          <div className="recommendations-summary-stats">
            <Badge variant="info" size="md">
              Всего: {totalRecommendations}
            </Badge>
          </div>
        </div>

        <div className="recommendations-summary-content">
          {/* Общий статус */}
          <div className="recommendations-summary-section">
            <div className="recommendations-summary-overall">
              <div className="recommendations-summary-overall-signal">
                <span className="recommendations-summary-overall-label">Общий сигнал:</span>
                <Badge variant={overallSignalVariant} size="lg">
                  {overallSignal === 'BUY' && '🟢 Покупка'}
                  {overallSignal === 'SELL' && '🔴 Продажа'}
                  {overallSignal === 'HOLD' && '🟡 Удержание'}
                </Badge>
              </div>
              <div className="recommendations-summary-agreement">
                <span className="recommendations-summary-agreement-label">Согласованность:</span>
                <Badge variant={getAgreementVariant(agreementScore)} size="md">
                  {getAgreementLabel(agreementScore)} ({Math.round(agreementScore * 100)}%)
                </Badge>
              </div>
            </div>
          </div>

          {/* Статистика по типам */}
          <div className="recommendations-summary-section">
            <div className="recommendations-summary-breakdown">
              <div className="recommendations-summary-breakdown-item">
                <span className="recommendations-summary-breakdown-icon">💰</span>
                <span className="recommendations-summary-breakdown-label">Покупка:</span>
                <Badge variant="success" size="md">
                  {buyCount}
                </Badge>
              </div>
              <div className="recommendations-summary-breakdown-item">
                <span className="recommendations-summary-breakdown-icon">💸</span>
                <span className="recommendations-summary-breakdown-label">Продажа:</span>
                <Badge variant="error" size="md">
                  {sellCount}
                </Badge>
              </div>
              <div className="recommendations-summary-breakdown-item">
                <span className="recommendations-summary-breakdown-icon">⏸️</span>
                <span className="recommendations-summary-breakdown-label">Удержание:</span>
                <Badge variant="neutral" size="md">
                  {holdCount}
                </Badge>
              </div>
              <div className="recommendations-summary-breakdown-item">
                <span className="recommendations-summary-breakdown-icon">⭐</span>
                <span className="recommendations-summary-breakdown-label">Высокая уверенность:</span>
                <Badge variant="warning" size="md">
                  {highConfidenceCount}
                </Badge>
              </div>
            </div>
          </div>

          {/* Топ рекомендации */}
          <div className="recommendations-summary-section">
            <div className="recommendations-summary-top">
              <div className="recommendations-summary-top-buy">
                <h3 className="recommendations-summary-top-title">🔥 Топ покупок</h3>
                {topBuyRecommendations.length > 0 ? (
                  <div className="recommendations-summary-top-list">
                    {topBuyRecommendations.slice(0, 3).map((rec) => (
                      <div key={rec.figi} className="recommendations-summary-top-item">
                        <span className="recommendations-summary-top-ticker">{rec.ticker}</span>
                        <span className="recommendations-summary-top-name">{rec.name}</span>
                        <Badge variant="success" size="sm">
                          {Math.round(rec.confidence * 100)}%
                        </Badge>
                        {rec.potentialProfit && (
                          <span className="recommendations-summary-top-profit">
                            +{rec.potentialProfit.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="recommendations-summary-top-empty">Нет рекомендаций на покупку</div>
                )}
              </div>

              <div className="recommendations-summary-top-sell">
                <h3 className="recommendations-summary-top-title">⚠️ Топ продаж</h3>
                {topSellRecommendations.length > 0 ? (
                  <div className="recommendations-summary-top-list">
                    {topSellRecommendations.slice(0, 3).map((rec) => (
                      <div key={rec.figi} className="recommendations-summary-top-item">
                        <span className="recommendations-summary-top-ticker">{rec.ticker}</span>
                        <span className="recommendations-summary-top-name">{rec.name}</span>
                        <Badge variant="error" size="sm">
                          {Math.round(rec.confidence * 100)}%
                        </Badge>
                        {rec.currentLoss && (
                          <span className="recommendations-summary-top-loss">
                            {rec.currentLoss.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="recommendations-summary-top-empty">Нет рекомендаций на продажу</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default RecommendationsSummary;

