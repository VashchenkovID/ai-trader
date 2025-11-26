import React from 'react';
import { Card } from 'primereact/card';
import { ProgressBar } from 'primereact/progressbar';
import { Divider } from 'primereact/divider';
import { Badge } from 'primereact/badge';
import { Position } from './PortfolioPositionsTable';
import { PortfolioSummary } from './PortfolioSummaryCard';

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
      <Card title="📊 Статистика портфеля" className={className}>
        <div className="text-center text-600">
          Нет данных для анализа
        </div>
      </Card>
    );
  }

  return (
    <Card title="📊 Статистика портфеля" className={className}>
      <div className="flex flex-column gap-3">
        <div>
          <div className="text-600 mb-2">Диверсификация</div>
          <ProgressBar 
            value={Math.min((positions.length / 20) * 100, 100)} 
            className="mb-2"
          />
          <small className="text-500">
            {positions.length} позиций (рекомендуется 15-25)
          </small>
        </div>
        
        <Divider />
        
        <div className="grid text-center">
          <div className="col-6">
            <div className="text-xl font-bold text-blue-500">
              {((portfolio.investedAmount / portfolio.totalValue) * 100).toFixed(1)}%
            </div>
            <div className="text-sm text-600">Инвестировано</div>
          </div>
          <div className="col-6">
            <div className="text-xl font-bold text-green-500">
              {((portfolio.cash / portfolio.totalValue) * 100).toFixed(1)}%
            </div>
            <div className="text-sm text-600">Наличные</div>
          </div>
        </div>
        
        <Divider />
        
        <div>
          <div className="text-600 mb-2">Топ позиции по весу</div>
          {positions
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 3)
            .map((pos, index) => (
              <div key={pos.figi} className="flex justify-content-between align-items-center mb-2">
                <span className="text-sm">{pos.ticker}</span>
                <Badge value={`${pos.weight.toFixed(1)}%`} severity="info" />
              </div>
            ))}
        </div>
      </div>
    </Card>
  );
};

export default PortfolioAnalytics;

