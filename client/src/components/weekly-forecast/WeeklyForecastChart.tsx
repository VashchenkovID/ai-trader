import React, { useMemo } from 'react';
import { Chart } from '../ui';
import { WeeklyForecastCandle } from '../../services/weeklyForecastApi';
import './WeeklyForecastChart.css';

export interface WeeklyForecastChartProps {
  forecastData: WeeklyForecastCandle[];
  actualData?: WeeklyForecastCandle[];
  currency?: string;
  height?: number;
  className?: string;
}

export const WeeklyForecastChart: React.FC<WeeklyForecastChartProps> = ({
  forecastData,
  actualData,
  currency = 'RUB',
  height = 400,
  className = ''
}) => {
  const formatCurrency = (price: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'short'
    });
  };

  const chartData = useMemo(() => {
    if (!forecastData || forecastData.length === 0) {
      return {
        labels: [],
        datasets: []
      };
    }

    const labels = forecastData.map(c => formatDate(c.date));

    const datasets: any[] = [
      {
        label: 'Прогноз (закрытие)',
        data: forecastData.map(c => c.close),
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        tension: 0.4,
        fill: true,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#3B82F6',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        borderDash: [0, 0]
      },
      {
        label: 'Прогноз (максимум)',
        data: forecastData.map(c => c.high),
        borderColor: '#10B981',
        backgroundColor: 'transparent',
        borderWidth: 1,
        tension: 0.4,
        borderDash: [5, 5],
        pointRadius: 0
      },
      {
        label: 'Прогноз (минимум)',
        data: forecastData.map(c => c.low),
        borderColor: '#EF4444',
        backgroundColor: 'transparent',
        borderWidth: 1,
        tension: 0.4,
        borderDash: [5, 5],
        pointRadius: 0
      }
    ];

    // Добавляем реальные данные, если они есть
    if (actualData && actualData.length > 0) {
      // Сопоставляем реальные данные с прогнозом по датам
      const actualClose = forecastData.map(forecastCandle => {
        const actualCandle = actualData.find(ac => {
          const forecastDate = new Date(forecastCandle.date).toISOString().split('T')[0];
          const actualDate = new Date(ac.date).toISOString().split('T')[0];
          return forecastDate === actualDate;
        });
        return actualCandle ? actualCandle.close : null;
      });

      datasets.push({
        label: 'Реальность (закрытие)',
        data: actualClose,
        borderColor: '#F59E0B',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        borderWidth: 2,
        tension: 0.4,
        fill: false,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#F59E0B',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2
      });
    }

    return {
      labels,
      datasets
    };
  }, [forecastData, actualData]);

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
          usePointStyle: true,
          padding: 15
        }
      },
      tooltip: {
        filter: (tooltipItem: any) => {
          // Показываем только основные линии в тултипе
          return tooltipItem.datasetIndex === 0 || 
                 (actualData && tooltipItem.datasetIndex === 3);
        },
        callbacks: {
          label: function(context: any) {
            const datasetIndex = context.datasetIndex;
            const dataIndex = context.dataIndex;
            
            if (datasetIndex === 0) {
              // Прогноз
              const candle = forecastData[dataIndex];
              if (!candle) return '';
              return [
                `Прогноз закрытие: ${formatCurrency(candle.close)}`,
                `Прогноз максимум: ${formatCurrency(candle.high)}`,
                `Прогноз минимум: ${formatCurrency(candle.low)}`,
                `Прогноз открытие: ${formatCurrency(candle.open)}`,
                candle.confidence !== undefined ? `Уверенность: ${(candle.confidence * 100).toFixed(1)}%` : ''
              ].filter(Boolean);
            } else if (datasetIndex === 3 && actualData) {
              // Реальность
              const forecastCandle = forecastData[dataIndex];
              const actualCandle = actualData.find(ac => {
                const forecastDate = new Date(forecastCandle.date).toISOString().split('T')[0];
                const actualDate = new Date(ac.date).toISOString().split('T')[0];
                return forecastDate === actualDate;
              });
              if (!actualCandle) return '';
              return [
                `Реальность закрытие: ${formatCurrency(actualCandle.close)}`,
                `Реальность максимум: ${formatCurrency(actualCandle.high)}`,
                `Реальность минимум: ${formatCurrency(actualCandle.low)}`,
                `Реальность открытие: ${formatCurrency(actualCandle.open)}`
              ];
            }
            return '';
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
  }), [forecastData, actualData, currency]);

  if (!forecastData || forecastData.length === 0) {
    return (
      <div className={`weekly-forecast-chart-empty ${className}`}>
        <p>Нет данных для отображения</p>
      </div>
    );
  }

  return (
    <div className={`weekly-forecast-chart ${className}`}>
      <Chart
        type="line"
        data={chartData}
        options={chartOptions}
        height={height}
      />
    </div>
  );
};

export default WeeklyForecastChart;

