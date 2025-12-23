import React from 'react';
import { Card } from '../ui/Card/Card';
import { ProgressBar } from '../ui/ProgressBar/ProgressBar';
import { Divider } from '../ui/Divider/Divider';
import { Badge } from '../ui/Badge/Badge';
import { Position } from './PortfolioPositionsTable';
import { PortfolioSummary } from './PortfolioSummaryCard';
import './PortfolioAnalytics.css';

interface PortfolioAnalyticsProps {
  portfolio: PortfolioSummary | null;
  positions: Position[];
  className?: string;
}

const PortfolioAnalytics: React.FC<PortfolioAnalyticsProps> = ({
  portfolio,
  positions,
  className = ''
}) => {
  if (!portfolio || !positions.length) {
    return (
      <Card 
        header={<h3 className="portfolio-analytics-title">📊 Статистика портфеля</h3>}
        className={`portfolio-analytics-card ${className}`}
      >
        <div className="portfolio-analytics-empty">
          Нет данных для анализа
        </div>
      </Card>
    );
  }

  const diversificationPercent = Math.min((positions.length / 20) * 100, 100);
  const investedPercent = portfolio.totalValue > 0 
    ? ((portfolio.investedAmount / portfolio.totalValue) * 100).toFixed(1)
    : '0';
  const cashPercent = portfolio.totalValue > 0
    ? ((portfolio.cash / portfolio.totalValue) * 100).toFixed(1)
    : '0';

  return (
    <Card 
      header={<h3 className="portfolio-analytics-title">📊 Статистика портфеля</h3>}
      className={`portfolio-analytics-card ${className}`}
    >
      <div className="portfolio-analytics-content">
        <div className="portfolio-analytics-section">
          <div className="portfolio-analytics-label">Диверсификация</div>
          <ProgressBar 
            value={diversificationPercent}
            variant={diversificationPercent >= 75 ? 'success' : diversificationPercent >= 50 ? 'warning' : 'error'}
            size="sm"
          />
          <div className="portfolio-analytics-hint">
            {positions.length} позиций (рекомендуется 15-25)
          </div>
        </div>
        
        <Divider spacing="md" />
        
        <div className="portfolio-analytics-metrics">
          <div className="portfolio-analytics-metric">
            <div className="portfolio-analytics-metric-value portfolio-analytics-metric-info">
              {investedPercent}%
            </div>
            <div className="portfolio-analytics-metric-label">Инвестировано</div>
          </div>
          <div className="portfolio-analytics-metric">
            <div className="portfolio-analytics-metric-value portfolio-analytics-metric-success">
              {cashPercent}%
            </div>
            <div className="portfolio-analytics-metric-label">Наличные</div>
          </div>
        </div>
        
        <Divider spacing="md" />
        
        <div className="portfolio-analytics-top-positions">
          <div className="portfolio-analytics-label">Топ позиции по весу</div>
          {positions
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 3)
            .map((pos) => (
              <div key={pos.figi} className="portfolio-analytics-position">
                <span className="portfolio-analytics-position-ticker">{pos.ticker}</span>
                <Badge variant="info" size="sm">
                  {pos.weight.toFixed(1)}%
                </Badge>
              </div>
            ))}
        </div>
      </div>
    </Card>
  );
};

export default PortfolioAnalytics;

