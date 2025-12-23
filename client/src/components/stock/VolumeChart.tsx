import React, { useMemo } from 'react';
import { Card, Chart, Tabs } from '../ui';
import './VolumeChart.css';

export type TimePeriod = 'day' | 'week' | 'month' | 'year';

interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface VolumeChartProps {
  candles: Candle[];
  period: TimePeriod;
  onPeriodChange: (period: TimePeriod) => void;
}

export const VolumeChart: React.FC<VolumeChartProps> = ({
  candles,
  period,
  onPeriodChange,
}) => {
  const periodOptions = [
    { label: 'День', value: 'day' },
    { label: 'Неделя', value: 'week' },
    { label: 'Месяц', value: 'month' },
    { label: 'Год', value: 'year' }
  ];

  const formatDateShort = (dateString: string) => {
    const date = new Date(dateString);
    return new Date(date).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'short'
    });
  };

  const chartData = useMemo(() => ({
    labels: candles.map(c => formatDateShort(c.time)),
    datasets: [
      {
        label: 'Объем торгов',
        data: candles.map(c => c.volume),
        backgroundColor: 'rgba(102, 187, 106, 0.5)',
        borderColor: '#66BB6A',
        borderWidth: 1
      }
    ]
  }), [candles]);

  const chartOptions = useMemo(() => ({
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
            if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
            if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
            return value;
          }
        }
      }
    }
  }), []);

  return (
    <Card variant="default" className="mb-4 volume-chart">
      <div className="volume-chart-header">
        <h3 style={{ margin: 0 }}>Объем торгов</h3>
        <Tabs
          value={period}
          options={periodOptions}
          onChange={(value) => onPeriodChange(value as TimePeriod)}
          size="sm"
          variant="default"
        />
      </div>
      <div className="chart-container" style={{ height: '300px' }}>
        {candles.length > 0 ? (
          <Chart type="bar" data={chartData} options={chartOptions} height={300} />
        ) : (
          <div className="chart-empty">
            Нет данных для отображения
          </div>
        )}
      </div>
    </Card>
  );
};

export default VolumeChart;

