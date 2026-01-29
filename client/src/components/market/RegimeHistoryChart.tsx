import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card/Card';
import { Chart } from '../ui/Chart/Chart';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import { Select } from '../ui/Select/Select';
import './RegimeHistoryChart.css';

export type MarketRegime = 'trend' | 'flat' | 'volatile' | 'normal';

interface RegimeHistoryPoint {
  date: string;
  regime: MarketRegime;
  confidence: number;
  volatility: number;
  trendStrength: number;
}

interface RegimeHistoryChartProps {
  figi: string;
  className?: string;
  days?: number;
}

const REGIME_COLORS: Record<MarketRegime, string> = {
  trend: 'var(--color-accent-success)',
  flat: 'var(--color-text-secondary)',
  volatile: 'var(--color-accent-error)',
  normal: 'var(--color-accent-primary)',
};

export const RegimeHistoryChart: React.FC<RegimeHistoryChartProps> = ({
  figi,
  className = '',
  days = 30
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RegimeHistoryPoint[]>([]);
  const [selectedDays, setSelectedDays] = useState(days);

  const daysOptions = [
    { value: '7', label: '7 дней' },
    { value: '14', label: '14 дней' },
    { value: '30', label: '30 дней' },
    { value: '60', label: '60 дней' },
    { value: '90', label: '90 дней' },
  ];

  useEffect(() => {
    if (figi) {
      loadHistory();
    }
  }, [figi, selectedDays]);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${(window as any).env?.REACT_APP_API_URL || ''}/api/market-regime/${figi}/history?days=${selectedDays}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch regime history');
      }
      
      const result = await response.json();
      setHistory(result.data || result.history || []);
    } catch (err: any) {
      console.error('Error loading regime history:', err);
      setError(err.message || 'Ошибка загрузки истории');
    } finally {
      setLoading(false);
    }
  };

  const chartData = React.useMemo(() => {
    if (history.length === 0) return null;

    const labels = history.map(point => 
      new Date(point.date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
    );

    // Создаем датасеты для каждого режима
    const regimes: MarketRegime[] = ['trend', 'flat', 'volatile', 'normal'];
    const datasets = regimes.map(regime => ({
      label: regime === 'trend' ? 'Тренд' : 
             regime === 'flat' ? 'Флэт' : 
             regime === 'volatile' ? 'Волатильность' : 'Нормальный',
      data: history.map(point => point.regime === regime ? point.confidence * 100 : null),
      borderColor: REGIME_COLORS[regime],
      backgroundColor: REGIME_COLORS[regime] + '40',
      borderWidth: 2,
      fill: false,
      tension: 0.4,
    }));

    return { labels, datasets };
  }, [history]);

  const chartOptions = React.useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false
    },
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: 'var(--color-text-primary)',
          padding: 15,
          usePointStyle: true,
        },
      },
      tooltip: {
        backgroundColor: 'var(--color-surface-elevated)',
        titleColor: 'var(--color-text-primary)',
        bodyColor: 'var(--color-text-primary)',
        borderColor: 'var(--color-border-default)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: function(context: any) {
            const point = history[context.dataIndex];
            if (!point) return '';
            return [
              `Режим: ${point.regime}`,
              `Уверенность: ${(point.confidence * 100).toFixed(1)}%`,
              `Волатильность: ${(point.volatility * 100).toFixed(2)}%`,
              `Сила тренда: ${(point.trendStrength * 100).toFixed(2)}%`
            ];
          }
        }
      },
    },
    scales: {
      x: {
        ticks: {
          color: 'var(--color-text-secondary)',
        },
        grid: {
          color: 'var(--color-border-default)',
        },
      },
      y: {
        beginAtZero: true,
        max: 100,
        ticks: {
          color: 'var(--color-text-secondary)',
          callback: function(value: any) {
            return `${value}%`;
          },
        },
        grid: {
          color: 'var(--color-border-default)',
        },
      },
    },
  }), [history]);

  if (loading) {
    return (
      <Card variant="glass" className={`regime-history-chart ${className}`}>
        <Skeleton width="100%" height={400} />
      </Card>
    );
  }

  if (error) {
    return (
      <Card variant="glass" className={`regime-history-chart ${className}`}>
        <div className="error-message">
          <p>{error}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card variant="glass" className={`regime-history-chart ${className}`}>
      <div className="chart-header">
        <h3 className="chart-title">История рыночных режимов</h3>
        <Select
          value={String(selectedDays)}
          onChange={(e) => setSelectedDays(parseInt(e.target.value))}
          options={daysOptions}
          size="sm"
        />
      </div>
      <div className="chart-content">
        {chartData ? (
          <Chart
            type="line"
            data={chartData}
            options={chartOptions}
            height={350}
          />
        ) : (
          <div className="empty-message">
            Нет данных для отображения
          </div>
        )}
      </div>
    </Card>
  );
};

export default RegimeHistoryChart;

