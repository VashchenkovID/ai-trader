import React, { useMemo } from 'react';
import { Card, Chart, Tabs } from '../ui';
import './PriceChart.css';

export type TimePeriod = 'day' | 'week' | 'month' | 'year';

interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PriceChartProps {
  candles: Candle[];
  period: TimePeriod;
  onPeriodChange: (period: TimePeriod) => void;
  currency: string;
}

export const PriceChart: React.FC<PriceChartProps> = ({
  candles,
  period,
  onPeriodChange,
  currency,
}) => {
  const periodOptions = [
    { label: 'День', value: 'day' },
    { label: 'Неделя', value: 'week' },
    { label: 'Месяц', value: 'month' },
    { label: 'Год', value: 'year' }
  ];

  const formatCurrency = (price: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: currency || 'RUB',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  };

  const formatDateShort = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return '';
    }
    try {
      return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: 'short'
      });
    } catch (e) {
      return '';
    }
  };

  const chartData = useMemo(() => {
    // Фильтруем невалидные даты
    const validCandles = candles.filter(c => {
      if (!c || !c.time) return false;
      const date = new Date(c.time);
      return !isNaN(date.getTime()) && 
             c.close !== undefined && c.close !== null &&
             c.high !== undefined && c.high !== null &&
             c.low !== undefined && c.low !== null;
    });
    
    if (validCandles.length === 0) {
      return {
        labels: [],
        datasets: []
      };
    }
    
    return {
    labels: validCandles.map(c => formatDateShort(c.time)),
    datasets: [
      {
        label: 'Цена закрытия',
        data: validCandles.map(c => c.close),
        borderColor: '#42A5F5',
        backgroundColor: 'rgba(66, 165, 245, 0.1)',
        tension: 0.4,
        fill: true
      },
      {
        label: 'Максимум',
        data: validCandles.map(c => c.high),
        borderColor: '#66BB6A',
        backgroundColor: 'transparent',
        tension: 0.4,
        borderDash: [5, 5],
        pointRadius: 0
      },
      {
        label: 'Минимум',
        data: validCandles.map(c => c.low),
        borderColor: '#EF5350',
        backgroundColor: 'transparent',
        tension: 0.4,
        borderDash: [5, 5],
        pointRadius: 0
      }
    ]
    };
  }, [candles]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true
        }
      },
      tooltip: {
        filter: (tooltipItem: any) => tooltipItem.datasetIndex === 0,
        callbacks: {
          label: function(context: any) {
            // Используем отфильтрованные данные для получения правильного индекса
            const validCandles = candles.filter(c => {
              if (!c || !c.time) return false;
              const date = new Date(c.time);
              return !isNaN(date.getTime());
            });
            const candle = validCandles[context.dataIndex];
            if (!candle) return '';
            return [
              `Открытие: ${formatCurrency(candle.open)}`,
              `Максимум: ${formatCurrency(candle.high)}`,
              `Минимум: ${formatCurrency(candle.low)}`,
              `Закрытие: ${formatCurrency(candle.close)}`
            ];
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: false,
        ticks: {
          callback: function(value: any) {
            return formatCurrency(value);
          }
        }
      }
    }
  }), [candles, currency]);

  return (
    <Card variant="default" className="mb-4 price-chart">
      <div className="price-chart-header">
        <h3 style={{ margin: 0 }}>Динамика цены</h3>
        <Tabs
          value={period}
          options={periodOptions}
          onChange={(value) => onPeriodChange(value as TimePeriod)}
          size="sm"
          variant="default"
        />
      </div>
      <div className="chart-container" style={{ height: '400px' }}>
        {candles.length > 0 ? (
          <Chart type="line" data={chartData} options={chartOptions} height={400} />
        ) : (
          <div className="chart-empty">
            Нет данных для отображения
          </div>
        )}
      </div>
    </Card>
  );
};

export default PriceChart;

