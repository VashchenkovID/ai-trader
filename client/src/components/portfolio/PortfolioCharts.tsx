import React from 'react';
import { Card } from 'primereact/card';
import { Chart } from 'primereact/chart';
import { Position } from './PortfolioPositionsTable';
import { PortfolioSummary } from './PortfolioSummaryCard';
import { translateSector } from '../../utils/sectorTranslator';

interface PortfolioChartsProps {
  positions: Position[];
  portfolio: PortfolioSummary | null;
  className?: string;
}

const PortfolioCharts: React.FC<PortfolioChartsProps> = ({
  positions,
  portfolio,
  className = ''
}) => {
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          padding: 20,
          usePointStyle: true
        }
      }
    }
  };

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value: any) {
            return new Intl.NumberFormat('ru-RU', {
              style: 'currency',
              currency: 'RUB',
              minimumFractionDigits: 0
            }).format(value);
          }
        }
      }
    }
  };

  const generateAllocationChart = () => {
    if (!positions.length) return null;

    const topPositions = positions
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 8);
    
    const othersWeight = positions
      .slice(8)
      .reduce((sum, pos) => sum + pos.weight, 0);

    const labels = topPositions.map(pos => pos.ticker);
    const data = topPositions.map(pos => pos.weight);
    
    if (othersWeight > 0) {
      labels.push('Другие');
      data.push(othersWeight);
    }

    // Добавляем наличные
    if (portfolio?.cash && portfolio.cash > 0 && portfolio.totalValue > 0) {
      const cashWeight = (portfolio.cash / portfolio.totalValue) * 100;
      labels.push('Наличные');
      data.push(cashWeight);
    }

    return {
      labels,
      datasets: [{
        data,
        backgroundColor: [
          '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0',
          '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF',
          '#4BC0C0', '#36A2EB'
        ],
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    };
  };

  const generatePnLChart = () => {
    if (!positions.length) return null;

    const sortedPositions = positions
      .sort((a, b) => Math.abs(b.unrealizedPnL) - Math.abs(a.unrealizedPnL))
      .slice(0, 10);

    return {
      labels: sortedPositions.map(pos => pos.ticker),
      datasets: [{
        label: 'Нереализованная прибыль/убыток (₽)',
        data: sortedPositions.map(pos => pos.unrealizedPnL),
        backgroundColor: sortedPositions.map(pos => 
          pos.unrealizedPnL >= 0 ? '#10B981' : '#EF4444'
        ),
        borderColor: sortedPositions.map(pos => 
          pos.unrealizedPnL >= 0 ? '#059669' : '#DC2626'
        ),
        borderWidth: 1
      }]
    };
  };

  const generateSectorChart = () => {
    if (!positions.length) return null;

    const sectorData = positions.reduce((acc, pos) => {
      const sector = translateSector(pos.sector || 'Неизвестно');
      acc[sector] = (acc[sector] || 0) + pos.marketValue;
      return acc;
    }, {} as Record<string, number>);

    const labels = Object.keys(sectorData);
    const data = Object.values(sectorData);

    return {
      labels,
      datasets: [{
        data,
        backgroundColor: [
          '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
          '#8B5CF6', '#06B6D4', '#84CC16', '#F97316'
        ]
      }]
    };
  };

  if (!positions.length) {
    return (
      <div className={className}>
        <div className="text-center p-4 text-600">
          Нет данных для отображения диаграмм
        </div>
      </div>
    );
  }

  return (
    <div className={`grid ${className}`}>
      {/* Распределение портфеля */}
      <div className="col-12 lg:col-6">
        <Card title="🥧 Распределение портфеля" className="h-full">
          <div style={{ height: '300px' }}>
            {generateAllocationChart() ? (
              <Chart 
                type="doughnut" 
                data={generateAllocationChart()} 
                options={chartOptions} 
              />
            ) : (
              <div className="flex align-items-center justify-content-center h-full text-600">
                Нет данных для отображения
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* P&L по позициям */}
      <div className="col-12 lg:col-6">
        <Card title="📈 Прибыль/убыток по позициям" className="h-full">
          <div style={{ height: '300px' }}>
            {generatePnLChart() ? (
              <Chart 
                type="bar" 
                data={generatePnLChart()} 
                options={barChartOptions} 
              />
            ) : (
              <div className="flex align-items-center justify-content-center h-full text-600">
                Нет данных для отображения
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Распределение по секторам */}
      <div className="col-12 lg:col-6">
        <Card title="🏭 Распределение по секторам" className="h-full">
          <div style={{ height: '300px' }}>
            {generateSectorChart() ? (
              <Chart 
                type="pie" 
                data={generateSectorChart()} 
                options={chartOptions} 
              />
            ) : (
              <div className="flex align-items-center justify-content-center h-full text-600">
                Нет данных для отображения
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default PortfolioCharts;

