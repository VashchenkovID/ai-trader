import React from 'react';
import { Card } from '../ui/Card/Card';
import { Chart } from '../ui/Chart/Chart';
import { Position } from './PortfolioPositionsTable';
import { PortfolioSummary } from './PortfolioSummaryCard';
import { translateSector } from '../../utils/sectorTranslator';
import './PortfolioCharts.css';

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
  // Цвета из дизайн-системы для графиков
  const chartColors = {
    primary: '#3B82F6',
    primaryHover: '#2563EB',
    success: '#10B981',
    successHover: '#059669',
    error: '#EF4444',
    errorHover: '#DC2626',
    warning: '#F59E0B',
    warningHover: '#D97706',
    info: '#06B6D4',
    infoHover: '#0891B2',
    purple: '#8B5CF6',
    purpleHover: '#7C3AED',
    orange: '#F97316',
    orangeHover: '#EA580C',
    pink: '#EC4899',
    pinkHover: '#DB2777',
    cyan: '#14B8A6',
    cyanHover: '#0D9488',
  };

  // Палитра цветов для графиков (используем цвета из дизайн-системы)
  const colorPalette = [
    chartColors.primary,
    chartColors.success,
    chartColors.warning,
    chartColors.info,
    chartColors.purple,
    chartColors.orange,
    chartColors.pink,
    chartColors.cyan,
    '#84CC16', // lime
    '#F59E0B', // amber
  ];

  const chartOptions = {
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          padding: 20,
          usePointStyle: true,
        }
      }
    }
  };

  const barChartOptions = {
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
        backgroundColor: colorPalette.slice(0, labels.length).map(color => `${color}CC`), // Добавляем прозрачность
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        hoverBorderWidth: 3,
        hoverBorderColor: 'rgba(255, 255, 255, 0.3)',
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
          pos.unrealizedPnL >= 0 ? `${chartColors.success}CC` : `${chartColors.error}CC`
        ),
        borderColor: sortedPositions.map(pos => 
          pos.unrealizedPnL >= 0 ? chartColors.success : chartColors.error
        ),
        borderWidth: 2,
        hoverBorderWidth: 3,
        hoverBorderColor: sortedPositions.map(pos => 
          pos.unrealizedPnL >= 0 ? chartColors.successHover : chartColors.errorHover
        ),
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
        backgroundColor: colorPalette.slice(0, labels.length).map(color => `${color}CC`), // Добавляем прозрачность
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        hoverBorderWidth: 3,
        hoverBorderColor: 'rgba(255, 255, 255, 0.3)',
      }]
    };
  };

  if (!positions.length) {
    return (
      <div className={`portfolio-charts-empty ${className}`}>
        Нет данных для отображения диаграмм
      </div>
    );
  }

  return (
    <div className={`portfolio-charts-grid ${className}`}>
      {/* Распределение портфеля */}
      <div className="portfolio-charts-item">
        <Card 
          header={<h3 className="portfolio-charts-title">🥧 Распределение портфеля</h3>}
          className="portfolio-charts-card"
        >
          <div className="portfolio-charts-container">
            {generateAllocationChart() ? (
              <Chart 
                type="doughnut" 
                data={generateAllocationChart()} 
                options={chartOptions}
                height={300}
              />
            ) : (
              <div className="portfolio-charts-empty-chart">
                Нет данных для отображения
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* P&L по позициям */}
      <div className="portfolio-charts-item">
        <Card 
          header={<h3 className="portfolio-charts-title">📈 Прибыль/убыток по позициям</h3>}
          className="portfolio-charts-card"
        >
          <div className="portfolio-charts-container">
            {generatePnLChart() ? (
              <Chart 
                type="bar" 
                data={generatePnLChart()} 
                options={barChartOptions}
                height={300}
              />
            ) : (
              <div className="portfolio-charts-empty-chart">
                Нет данных для отображения
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Распределение по секторам */}
      <div className="portfolio-charts-item">
        <Card 
          header={<h3 className="portfolio-charts-title">🏭 Распределение по секторам</h3>}
          className="portfolio-charts-card"
        >
          <div className="portfolio-charts-container">
            {generateSectorChart() ? (
              <Chart 
                type="pie" 
                data={generateSectorChart()} 
                options={chartOptions}
                height={300}
              />
            ) : (
              <div className="portfolio-charts-empty-chart">
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

