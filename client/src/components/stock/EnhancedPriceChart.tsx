import React, { useMemo } from 'react';
import { Card, Chart, Tabs } from '../ui';
import { WeeklyForecastCandle } from '../../services/weeklyForecastApi';
import './EnhancedPriceChart.css';

export type TimePeriod = 'day' | 'week' | 'month' | 'year' | 'all';

interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface EnhancedPriceChartProps {
  candles: Candle[];
  period: TimePeriod;
  onPeriodChange: (period: TimePeriod) => void;
  currency: string;
  // Ключевые уровни
  currentPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  targetPrice?: number;
  // Weekly Forecast
  weeklyForecast?: WeeklyForecastCandle[];
  // Технические индикаторы (опционально)
  sma20?: number[];
  ema12?: number[];
  bollingerUpper?: number[];
  bollingerLower?: number[];
}

export const EnhancedPriceChart: React.FC<EnhancedPriceChartProps> = ({
  candles,
  period,
  onPeriodChange,
  currency,
  currentPrice,
  stopLoss,
  takeProfit,
  targetPrice,
  weeklyForecast,
  sma20,
  ema12,
  bollingerUpper,
  bollingerLower
}) => {
  const periodOptions = [
    { label: 'День', value: 'day' },
    { label: 'Неделя', value: 'week' },
    { label: 'Месяц', value: 'month' },
    { label: 'Год', value: 'year' },
    { label: 'Все', value: 'all' }
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
    if (isNaN(date.getTime())) return '';
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

    const labels = validCandles.map(c => formatDateShort(c.time));
    const datasets: any[] = [];

    // Основная линия цены закрытия
    datasets.push({
      label: 'Цена закрытия',
      data: validCandles.map(c => c.close),
      borderColor: '#42A5F5',
      backgroundColor: 'rgba(66, 165, 245, 0.1)',
      borderWidth: 2,
      tension: 0.4,
      fill: true,
      pointRadius: 0,
      pointHoverRadius: 4
    });

    // Максимумы и минимумы (пунктирные линии)
    datasets.push({
      label: 'Максимум',
      data: validCandles.map(c => c.high),
      borderColor: '#66BB6A',
      backgroundColor: 'transparent',
      borderWidth: 1,
      tension: 0.4,
      borderDash: [5, 5],
      pointRadius: 0
    });

    datasets.push({
      label: 'Минимум',
      data: validCandles.map(c => c.low),
      borderColor: '#EF5350',
      backgroundColor: 'transparent',
      borderWidth: 1,
      tension: 0.4,
      borderDash: [5, 5],
      pointRadius: 0
    });

    // Технические индикаторы
    if (sma20 && sma20.length === validCandles.length) {
      datasets.push({
        label: 'SMA 20',
        data: sma20,
        borderColor: '#FFA726',
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        tension: 0.4,
        pointRadius: 0,
        borderDash: [3, 3]
      });
    }

    if (ema12 && ema12.length === validCandles.length) {
      datasets.push({
        label: 'EMA 12',
        data: ema12,
        borderColor: '#AB47BC',
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        tension: 0.4,
        pointRadius: 0,
        borderDash: [3, 3]
      });
    }

    if (bollingerUpper && bollingerLower && 
        bollingerUpper.length === validCandles.length && 
        bollingerLower.length === validCandles.length) {
      datasets.push({
        label: 'Bollinger Upper',
        data: bollingerUpper,
        borderColor: '#78909C',
        backgroundColor: 'transparent',
        borderWidth: 1,
        tension: 0.4,
        pointRadius: 0,
        borderDash: [2, 2]
      });

      datasets.push({
        label: 'Bollinger Lower',
        data: bollingerLower,
        borderColor: '#78909C',
        backgroundColor: 'transparent',
        borderWidth: 1,
        tension: 0.4,
        pointRadius: 0,
        borderDash: [2, 2]
      });
    }

    // Ключевые уровни (горизонтальные линии)
    // const lastPrice = validCandles[validCandles.length - 1]?.close || 0;
    // const priceRange = Math.max(...validCandles.map(c => c.high)) - Math.min(...validCandles.map(c => c.low));
    // const minPrice = Math.min(...validCandles.map(c => c.low));
    
    // Текущая цена
    if (currentPrice !== undefined) {
      const currentPriceData = new Array(validCandles.length).fill(currentPrice);
      datasets.push({
        label: 'Текущая цена',
        data: currentPriceData,
        borderColor: '#3B82F6',
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 0,
        borderDash: [0, 0]
      });
    }

    // Стоп-лосс
    if (stopLoss !== undefined) {
      const stopLossData = new Array(validCandles.length).fill(stopLoss);
      datasets.push({
        label: 'Стоп-лосс',
        data: stopLossData,
        borderColor: '#EF4444',
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 0,
        borderDash: [8, 4]
      });
    }

    // Тейк-профит
    if (takeProfit !== undefined) {
      const takeProfitData = new Array(validCandles.length).fill(takeProfit);
      datasets.push({
        label: 'Тейк-профит',
        data: takeProfitData,
        borderColor: '#10B981',
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 0,
        borderDash: [8, 4]
      });
    }

    // Целевая цена
    if (targetPrice !== undefined) {
      const targetPriceData = new Array(validCandles.length).fill(targetPrice);
      datasets.push({
        label: 'Целевая цена',
        data: targetPriceData,
        borderColor: '#8B5CF6',
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 0,
        borderDash: [4, 4]
      });
    }

    // Weekly Forecast (если есть)
    if (weeklyForecast && weeklyForecast.length > 0) {
      // Добавляем даты прогноза к лейблам
      const forecastLabels = weeklyForecast.map(f => formatDateShort(f.date));
      const extendedLabels = [...labels, ...forecastLabels];
      
      // Создаем массив данных для прогноза (null для исторических данных)
      const forecastCloseData = [
        ...new Array(validCandles.length).fill(null),
        ...weeklyForecast.map(f => f.close)
      ];

      const forecastHighData = [
        ...new Array(validCandles.length).fill(null),
        ...weeklyForecast.map(f => f.high)
      ];

      const forecastLowData = [
        ...new Array(validCandles.length).fill(null),
        ...weeklyForecast.map(f => f.low)
      ];

      datasets.push({
        label: 'Weekly Forecast (закрытие)',
        data: forecastCloseData,
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        tension: 0.4,
        fill: false,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: '#3B82F6',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        borderDash: [0, 0],
        spanGaps: false
      });

      datasets.push({
        label: 'Weekly Forecast (максимум)',
        data: forecastHighData,
        borderColor: '#10B981',
        backgroundColor: 'transparent',
        borderWidth: 1,
        tension: 0.4,
        borderDash: [5, 5],
        pointRadius: 0,
        spanGaps: false
      });

      datasets.push({
        label: 'Weekly Forecast (минимум)',
        data: forecastLowData,
        borderColor: '#EF4444',
        backgroundColor: 'transparent',
        borderWidth: 1,
        tension: 0.4,
        borderDash: [5, 5],
        pointRadius: 0,
        spanGaps: false
      });

      return {
        labels: extendedLabels,
        datasets
      };
    }

    return {
      labels,
      datasets
    };
  }, [candles, currentPrice, stopLoss, takeProfit, targetPrice, weeklyForecast, sma20, ema12, bollingerUpper, bollingerLower]);

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
          padding: 15,
          filter: (item: any) => {
            // Показываем только основные линии в легенде
            const label = item.text;
            return label === 'Цена закрытия' || 
                   label === 'Текущая цена' ||
                   label === 'Стоп-лосс' ||
                   label === 'Тейк-профит' ||
                   label === 'Целевая цена' ||
                   label === 'Weekly Forecast (закрытие)';
          }
        }
      },
      tooltip: {
        filter: (tooltipItem: any) => {
          // Показываем только основные данные в тултипе
          const datasetLabel = tooltipItem.dataset.label || '';
          return datasetLabel === 'Цена закрытия' || 
                 datasetLabel === 'Текущая цена' ||
                 datasetLabel === 'Стоп-лосс' ||
                 datasetLabel === 'Тейк-профит' ||
                 datasetLabel === 'Целевая цена' ||
                 datasetLabel === 'Weekly Forecast (закрытие)';
        },
        callbacks: {
          label: function(context: any) {
            const datasetLabel = context.dataset.label || '';
            const value = context.parsed.y;
            
            if (value === null || value === undefined) return '';
            
            if (datasetLabel.includes('Weekly Forecast')) {
              const forecastIndex = context.dataIndex - candles.length;
              if (forecastIndex >= 0 && weeklyForecast && weeklyForecast[forecastIndex]) {
                const candle = weeklyForecast[forecastIndex];
                return [
                  `${datasetLabel}: ${formatCurrency(value)}`,
                  `Открытие: ${formatCurrency(candle.open)}`,
                  `Максимум: ${formatCurrency(candle.high)}`,
                  `Минимум: ${formatCurrency(candle.low)}`,
                  candle.confidence !== undefined ? `Уверенность: ${(candle.confidence * 100).toFixed(1)}%` : ''
                ].filter(Boolean);
              }
            }
            
            return `${datasetLabel}: ${formatCurrency(value)}`;
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
  }), [candles, weeklyForecast, currency]);

  return (
    <Card variant="default" className="enhanced-price-chart">
      <div className="enhanced-price-chart__header">
        <h3 className="enhanced-price-chart__title">Динамика цены с прогнозами</h3>
        <Tabs
          value={period}
          options={periodOptions}
          onChange={(value) => onPeriodChange(value as TimePeriod)}
          size="sm"
          variant="default"
        />
      </div>
      <div className="enhanced-price-chart__container" style={{ height: '500px' }}>
        {candles.length > 0 ? (
          <Chart type="line" data={chartData} options={chartOptions} height={500} />
        ) : (
          <div className="enhanced-price-chart__empty">
            Нет данных для отображения
          </div>
        )}
      </div>
    </Card>
  );
};

export default EnhancedPriceChart;

