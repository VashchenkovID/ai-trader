import React from 'react';
import { Card } from '../ui';
import { Badge } from '../ui';
import { Button } from '../ui';
import { useNavigate } from 'react-router-dom';
import './RecommendationsSidebar.css';

interface PortfolioPosition {
  figi: string;
  ticker: string;
  name: string;
  size: number; // % от капитала
  pnl: number; // P&L в %
  currentPrice: number;
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  proximityToStopLoss?: number; // % до стоп-лосса
  proximityToTakeProfit?: number; // % до тейк-профита
}

interface RecommendationChange {
  figi: string;
  ticker: string;
  name: string;
  oldRecommendation: 'BUY' | 'SELL' | 'HOLD';
  newRecommendation: 'BUY' | 'SELL' | 'HOLD';
  timestamp: string;
}

interface RecommendationsSidebarProps {
  portfolioPositions: PortfolioPosition[];
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
  }>;
  recentChanges: RecommendationChange[];
  alerts: Array<{
    type: 'critical' | 'warning' | 'info';
    message: string;
    timestamp: string;
  }>;
  statistics?: {
    accuracy?: number;
    winRate?: number;
    averageProfitability?: number;
  };
  onPositionClick?: (figi: string) => void;
  onRecommendationClick?: (figi: string) => void;
}

export const RecommendationsSidebar: React.FC<RecommendationsSidebarProps> = ({
  portfolioPositions,
  topBuyRecommendations,
  topSellRecommendations,
  recentChanges,
  alerts,
  statistics,
  onPositionClick,
  onRecommendationClick,
}) => {
  const navigate = useNavigate();

  const handlePositionClick = (figi: string) => {
    if (onPositionClick) {
      onPositionClick(figi);
    } else {
      navigate(`/stock/${figi}`);
    }
  };

  const handleRecommendationClick = (figi: string) => {
    if (onRecommendationClick) {
      onRecommendationClick(figi);
    } else {
      navigate(`/stock/${figi}`);
    }
  };

  // const _criticalPositions = portfolioPositions.filter( // Reserved for future use
  //   (p) => p.proximityToStopLoss !== undefined && p.proximityToStopLoss < 5
  // );

  return (
    <div className="recommendations-sidebar">
      {/* Текущие позиции */}
      <Card variant="default" className="recommendations-sidebar-section">
        <div className="recommendations-sidebar-section-header">
          <h3 className="recommendations-sidebar-section-title">💼 Текущие позиции</h3>
          <Badge variant="info" size="sm">
            {portfolioPositions.length}
          </Badge>
        </div>
        {portfolioPositions.length > 0 ? (
          <div className="recommendations-sidebar-positions">
            {portfolioPositions.slice(0, 5).map((position) => (
              <div
                key={position.figi}
                className={`recommendations-sidebar-position ${
                  position.proximityToStopLoss !== undefined && position.proximityToStopLoss < 5
                    ? 'critical'
                    : ''
                }`}
                onClick={() => handlePositionClick(position.figi)}
              >
                <div className="recommendations-sidebar-position-header">
                  <div className="recommendations-sidebar-position-info">
                    <span className="recommendations-sidebar-position-ticker">{position.ticker}</span>
                    <span className="recommendations-sidebar-position-name">{position.name}</span>
                  </div>
                  <Badge
                    variant={position.pnl >= 0 ? 'success' : 'error'}
                    size="sm"
                  >
                    {position.pnl >= 0 ? '+' : ''}
                    {position.pnl.toFixed(2)}%
                  </Badge>
                </div>
                <div className="recommendations-sidebar-position-details">
                  <span>Размер: {position.size.toFixed(2)}%</span>
                  {position.proximityToStopLoss !== undefined && position.proximityToStopLoss < 10 && (
                    <span className="recommendations-sidebar-position-alert">
                      ⚠️ Стоп-лосс: {position.proximityToStopLoss.toFixed(1)}%
                    </span>
                  )}
                  {position.proximityToTakeProfit !== undefined && position.proximityToTakeProfit < 5 && (
                    <span className="recommendations-sidebar-position-success">
                      ✅ Тейк-профит: {position.proximityToTakeProfit.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            ))}
            {portfolioPositions.length > 5 && (
              <Button
                variant="ghost"
                size="sm"
                fullWidth
                onClick={() => navigate('/portfolio')}
              >
                Показать все ({portfolioPositions.length})
              </Button>
            )}
          </div>
        ) : (
          <div className="recommendations-sidebar-empty">
            Нет активных позиций
          </div>
        )}
      </Card>

      {/* Топ покупок */}
      <Card variant="default" className="recommendations-sidebar-section">
        <div className="recommendations-sidebar-section-header">
          <h3 className="recommendations-sidebar-section-title">🔥 Топ покупок</h3>
        </div>
        {topBuyRecommendations.length > 0 ? (
          <div className="recommendations-sidebar-recommendations">
            {topBuyRecommendations.slice(0, 5).map((rec) => (
              <div
                key={rec.figi}
                className="recommendations-sidebar-recommendation"
                onClick={() => handleRecommendationClick(rec.figi)}
              >
                <div className="recommendations-sidebar-recommendation-info">
                  <span className="recommendations-sidebar-recommendation-ticker">{rec.ticker}</span>
                  <span className="recommendations-sidebar-recommendation-name">{rec.name}</span>
                </div>
                <div className="recommendations-sidebar-recommendation-metrics">
                  <Badge variant="success" size="sm">
                    {Math.round(rec.confidence * 100)}%
                  </Badge>
                  {rec.potentialProfit && (
                    <span className="recommendations-sidebar-recommendation-profit">
                      +{rec.potentialProfit.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="recommendations-sidebar-empty">
            Нет рекомендаций на покупку
          </div>
        )}
      </Card>

      {/* Топ продаж */}
      <Card variant="default" className="recommendations-sidebar-section">
        <div className="recommendations-sidebar-section-header">
          <h3 className="recommendations-sidebar-section-title">⚠️ Топ продаж</h3>
        </div>
        {topSellRecommendations.length > 0 ? (
          <div className="recommendations-sidebar-recommendations">
            {topSellRecommendations.slice(0, 5).map((rec) => (
              <div
                key={rec.figi}
                className="recommendations-sidebar-recommendation"
                onClick={() => handleRecommendationClick(rec.figi)}
              >
                <div className="recommendations-sidebar-recommendation-info">
                  <span className="recommendations-sidebar-recommendation-ticker">{rec.ticker}</span>
                  <span className="recommendations-sidebar-recommendation-name">{rec.name}</span>
                </div>
                <div className="recommendations-sidebar-recommendation-metrics">
                  <Badge variant="error" size="sm">
                    {Math.round(rec.confidence * 100)}%
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="recommendations-sidebar-empty">
            Нет рекомендаций на продажу
          </div>
        )}
      </Card>

      {/* Изменения рекомендаций */}
      {recentChanges.length > 0 && (
        <Card variant="default" className="recommendations-sidebar-section">
          <div className="recommendations-sidebar-section-header">
            <h3 className="recommendations-sidebar-section-title">🔄 Изменения (24ч)</h3>
          </div>
          <div className="recommendations-sidebar-changes">
            {recentChanges.slice(0, 5).map((change, index) => (
              <div key={`${change.figi}-${index}`} className="recommendations-sidebar-change">
                <div className="recommendations-sidebar-change-info">
                  <span className="recommendations-sidebar-change-ticker">{change.ticker}</span>
                  <div className="recommendations-sidebar-change-recommendation">
                    <Badge
                      variant={
                        change.oldRecommendation === 'BUY'
                          ? 'success'
                          : change.oldRecommendation === 'SELL'
                          ? 'error'
                          : 'neutral'
                      }
                      size="sm"
                    >
                      {change.oldRecommendation}
                    </Badge>
                    <span>→</span>
                    <Badge
                      variant={
                        change.newRecommendation === 'BUY'
                          ? 'success'
                          : change.newRecommendation === 'SELL'
                          ? 'error'
                          : 'neutral'
                      }
                      size="sm"
                    >
                      {change.newRecommendation}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Алерты */}
      {alerts.length > 0 && (
        <Card variant="default" className="recommendations-sidebar-section">
          <div className="recommendations-sidebar-section-header">
            <h3 className="recommendations-sidebar-section-title">🚨 Алерты</h3>
            <Badge variant="error" size="sm">
              {alerts.length}
            </Badge>
          </div>
          <div className="recommendations-sidebar-alerts">
            {alerts.slice(0, 5).map((alert, index) => (
              <div
                key={index}
                className={`recommendations-sidebar-alert alert-${alert.type}`}
              >
                <div className="recommendations-sidebar-alert-icon">
                  {alert.type === 'critical' && '🔴'}
                  {alert.type === 'warning' && '🟠'}
                  {alert.type === 'info' && '🔵'}
                </div>
                <div className="recommendations-sidebar-alert-content">
                  <p className="recommendations-sidebar-alert-message">{alert.message}</p>
                  <span className="recommendations-sidebar-alert-time">
                    {new Date(alert.timestamp).toLocaleTimeString('ru-RU')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Статистика */}
      {statistics && (
        <Card variant="default" className="recommendations-sidebar-section">
          <div className="recommendations-sidebar-section-header">
            <h3 className="recommendations-sidebar-section-title">📊 Статистика</h3>
          </div>
          <div className="recommendations-sidebar-statistics">
            {statistics.accuracy !== undefined && (
              <div className="recommendations-sidebar-statistic">
                <span className="recommendations-sidebar-statistic-label">Точность:</span>
                <Badge variant={statistics.accuracy >= 0.7 ? 'success' : statistics.accuracy >= 0.5 ? 'warning' : 'error'} size="sm">
                  {Math.round(statistics.accuracy * 100)}%
                </Badge>
              </div>
            )}
            {statistics.winRate !== undefined && (
              <div className="recommendations-sidebar-statistic">
                <span className="recommendations-sidebar-statistic-label">Win Rate:</span>
                <Badge variant={statistics.winRate >= 0.6 ? 'success' : statistics.winRate >= 0.5 ? 'warning' : 'error'} size="sm">
                  {Math.round(statistics.winRate * 100)}%
                </Badge>
              </div>
            )}
            {statistics.averageProfitability !== undefined && (
              <div className="recommendations-sidebar-statistic">
                <span className="recommendations-sidebar-statistic-label">Средняя прибыльность:</span>
                <Badge
                  variant={statistics.averageProfitability >= 0 ? 'success' : 'error'}
                  size="sm"
                >
                  {statistics.averageProfitability >= 0 ? '+' : ''}
                  {statistics.averageProfitability.toFixed(2)}%
                </Badge>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};

export default RecommendationsSidebar;

