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

  // Данные уже конвертированы на сервере в абсолютные цены
  const convertedData = forecastData || [];

  const chartData = useMemo(() => {
    if (!convertedData || convertedData.length === 0) {
      return {
        labels: [],
        datasets: []
      };
    }

    const labels = convertedData.map(c => formatDate(c.date));

    const datasets: any[] = [
      {
        label: 'Прогноз (закрытие)',
        data: convertedData.map(c => c.close),
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        borderWidth: 2.5,
        tension: 0.4,
        fill: true,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#3B82F6',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        borderDash: [0, 0],
        fillOpacity: 0.1
      },
      {
        label: 'Прогноз (максимум)',
        data: convertedData.map(c => c.high),
        borderColor: '#10B981',
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        tension: 0.4,
        borderDash: [6, 4],
        pointRadius: 2,
        pointHoverRadius: 4,
        pointBackgroundColor: '#10B981',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 1
      },
      {
        label: 'Прогноз (минимум)',
        data: convertedData.map(c => c.low),
        borderColor: '#EF4444',
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        tension: 0.4,
        borderDash: [6, 4],
        pointRadius: 2,
        pointHoverRadius: 4,
        pointBackgroundColor: '#EF4444',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 1
      }
    ];

    // Добавляем реальные данные, если они есть
    if (actualData && actualData.length > 0) {
      // Сопоставляем реальные данные с прогнозом по датам
      const actualClose = convertedData.map(forecastCandle => {
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
  }, [convertedData, actualData]);

  const chartOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index' as const,
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top' as const,
          display: true,
          labels: {
            usePointStyle: true,
            padding: 12,
            font: {
              size: 11,
              weight: '500' as const
            },
            color: '#6b7280'
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: 12,
          titleFont: {
            size: 13,
            weight: '600' as const
          },
          bodyFont: {
            size: 12
          },
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          cornerRadius: 8,
          displayColors: true,
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
                // Прогноз - данные уже в абсолютных ценах
                const candle = convertedData[dataIndex];
                if (!candle) return '';
                return [
                  `Прогноз закрытие: ${formatCurrency(candle.close)}`,
                  `Прогноз максимум: ${formatCurrency(candle.high)}`,
                  `Прогноз минимум: ${formatCurrency(candle.low)}`,
                  `Прогноз открытие: ${formatCurrency(candle.open)}`
                ];
              } else if (datasetIndex === 3 && actualData) {
                // Реальность
                const forecastCandle = convertedData[dataIndex];
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
        x: {
          grid: {
            display: false
          },
          ticks: {
            font: {
              size: 11
            },
            color: '#9ca3af'
          }
        },
        y: {
          beginAtZero: false,
          grid: {
            color: 'rgba(0, 0, 0, 0.05)',
            drawBorder: false
          },
          ticks: {
            font: {
              size: 11
            },
            color: '#9ca3af',
            callback: function(value: any) {
              return formatCurrency(value);
            }
          }
        }
      }
    };
  }, [convertedData, actualData, currency]);

  if (!convertedData || convertedData.length === 0) {
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

