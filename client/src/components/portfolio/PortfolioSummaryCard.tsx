import React from 'react';
import { Card } from 'primereact/card';
import { Badge } from 'primereact/badge';
import { Skeleton } from 'primereact/skeleton';

export interface PortfolioSummary {
  totalValue: number;
  cash: number;
  investedAmount: number;
  totalPnL: number;
  totalPnLPercent: number;
  positionsCount: number;
  dayChange: number;
  dayChangePercent: number;
}

interface PortfolioSummaryCardProps {
  portfolio: PortfolioSummary | null;
  loading?: boolean;
  isConnected?: boolean;
  className?: string;
}

const PortfolioSummaryCard: React.FC<PortfolioSummaryCardProps> = ({
  portfolio,
  loading = false,
  isConnected = false,
  className = ''
}) => {
  const formatCurrency = (amount: number, currency: string = 'RUB') => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatPercent = (value: number) => {
    return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  if (loading && !portfolio) {
    return (
      <Card title="💼 Сводка портфеля" className={className}>
        <div className="grid">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="col-12 md:col-3">
              <Skeleton width="100%" height="4rem" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (!portfolio) {
    return (
      <Card title="💼 Сводка портфеля" className={className}>
        <div className="text-center p-4 text-600">
          Нет данных о портфеле
        </div>
      </Card>
    );
  }

  return (
    <Card title="💼 Сводка портфеля" className={className}>
      <div className="grid">
        <div className="col-12 md:col-3">
          <div className="text-center p-3 border-round surface-100">
            <div className="text-2xl font-bold text-primary mb-2">
              {formatCurrency(portfolio.totalValue)}
            </div>
            <div className="text-600">Общая стоимость</div>
            {isConnected && (
              <Badge value="LIVE" severity="success" className="mt-2" />
            )}
          </div>
        </div>
        
        <div className="col-12 md:col-3">
          <div className="text-center p-3 border-round surface-100">
            <div className={`text-2xl font-bold mb-2 ${
              portfolio.totalPnL >= 0 ? 'text-green-500' : 'text-red-500'
            }`}>
              {formatCurrency(portfolio.totalPnL)}
            </div>
            <div className="text-600">Общая прибыль/убыток</div>
            <div className={`text-sm ${
              portfolio.totalPnLPercent >= 0 ? 'text-green-500' : 'text-red-500'
            }`}>
              {formatPercent(portfolio.totalPnLPercent)}
            </div>
          </div>
        </div>
        
        <div className="col-12 md:col-3">
          <div className="text-center p-3 border-round surface-100">
            <div className={`text-2xl font-bold mb-2 ${
              portfolio.dayChange >= 0 ? 'text-green-500' : 'text-red-500'
            }`}>
              {formatCurrency(portfolio.dayChange)}
            </div>
            <div className="text-600">Изменение за день</div>
            <div className={`text-sm ${
              portfolio.dayChangePercent >= 0 ? 'text-green-500' : 'text-red-500'
            }`}>
              {formatPercent(portfolio.dayChangePercent)}
            </div>
          </div>
        </div>
        
        <div className="col-12 md:col-3">
          <div className="text-center p-3 border-round surface-100">
            <div className="text-2xl font-bold text-blue-500 mb-2">
              {portfolio.positionsCount}
            </div>
            <div className="text-600">Позиций в портфеле</div>
            <div className="text-sm text-600">
              Наличные: {formatCurrency(portfolio.cash)}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default PortfolioSummaryCard;

