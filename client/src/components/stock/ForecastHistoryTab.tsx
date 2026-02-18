import React, { useMemo } from 'react';
import { DataTable } from '../ui';
import { Chart } from '../ui';
import './ForecastHistoryTab.css';

interface WeeklyForecast {
  id: number;
  forecastDate: string;
  startDate: string;
  endDate: string;
  forecastData: any[];
  actualData?: any[];
  confidenceScore: number;
  predictedPriceChange?: number;
  accuracyMetrics?: {
    mae?: number;
    rmse?: number;
    mape?: number;
    directionAccuracy?: number;
  };
  isCompleted: boolean;
  completionDate?: string;
}

interface ForecastHistoryTabProps {
  figi: string;
  ticker: string;
  weeklyForecasts: WeeklyForecast[];
}

const ForecastHistoryTab: React.FC<ForecastHistoryTabProps> = ({
  // figi,
  // ticker,
  weeklyForecasts
}) => {
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const tableData = useMemo(() => {
    return weeklyForecasts.map(forecast => ({
      id: forecast.id,
      forecastDate: formatDate(forecast.forecastDate),
      startDate: formatDate(forecast.startDate),
      endDate: formatDate(forecast.endDate),
      predictedPrice: forecast.forecastData?.[forecast.forecastData.length - 1]?.close || 'N/A',
      actualPrice: forecast.actualData?.[forecast.actualData.length - 1]?.close || 'N/A',
      priceChange: forecast.predictedPriceChange != null ? (() => {
        const value = typeof forecast.predictedPriceChange === 'number' 
          ? forecast.predictedPriceChange 
          : parseFloat(String(forecast.predictedPriceChange || 0));
        const numValue = !isNaN(value) ? value : 0;
        return `${numValue > 0 ? '+' : ''}${numValue.toFixed(2)}%`;
      })() : 'N/A',
      confidence: (() => {
        const value = typeof forecast.confidenceScore === 'number' 
          ? forecast.confidenceScore 
          : parseFloat(String(forecast.confidenceScore || 0));
        return `${(!isNaN(value) ? value * 100 : 0).toFixed(1)}%`;
      })(),
      mae: forecast.accuracyMetrics?.mae != null ? (() => {
        const value = typeof forecast.accuracyMetrics.mae === 'number' 
          ? forecast.accuracyMetrics.mae 
          : parseFloat(String(forecast.accuracyMetrics.mae || 0));
        return (!isNaN(value) ? value : 0).toFixed(4);
      })() : 'N/A',
      rmse: forecast.accuracyMetrics?.rmse != null ? (() => {
        const value = typeof forecast.accuracyMetrics.rmse === 'number' 
          ? forecast.accuracyMetrics.rmse 
          : parseFloat(String(forecast.accuracyMetrics.rmse || 0));
        return (!isNaN(value) ? value : 0).toFixed(4);
      })() : 'N/A',
      directionAccuracy: forecast.accuracyMetrics?.directionAccuracy != null ? (() => {
        const value = typeof forecast.accuracyMetrics.directionAccuracy === 'number' 
          ? forecast.accuracyMetrics.directionAccuracy 
          : parseFloat(String(forecast.accuracyMetrics.directionAccuracy || 0));
        return `${(!isNaN(value) ? value * 100 : 0).toFixed(1)}%`;
      })() : 'N/A',
      status: forecast.isCompleted ? 'Завершен' : 'Активен'
    }));
  }, [weeklyForecasts]);

  const accuracyChartData = useMemo(() => {
    const completedForecasts = weeklyForecasts.filter(f => f.isCompleted && f.accuracyMetrics);
    if (completedForecasts.length === 0) return null;

    return {
      labels: completedForecasts.map((_f, i) => `Прогноз ${i + 1}`),
      datasets: [
        {
          label: 'MAE',
          data: completedForecasts.map(f => f.accuracyMetrics?.mae || 0),
          borderColor: '#EF4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          borderWidth: 2,
          tension: 0.4,
          fill: true
        },
        {
          label: 'RMSE',
          data: completedForecasts.map(f => f.accuracyMetrics?.rmse || 0),
          borderColor: '#F59E0B',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          borderWidth: 2,
          tension: 0.4,
          fill: true
        },
        {
          label: 'Точность направления (%)',
          data: completedForecasts.map(f => (f.accuracyMetrics?.directionAccuracy || 0) * 100),
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          yAxisID: 'y1'
        }
      ]
    };
  }, [weeklyForecasts]);

  const accuracyChartOptions = accuracyChartData ? {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false
    },
    plugins: {
      legend: {
        position: 'top' as const
      }
    },
    scales: {
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: {
          display: true,
          text: 'MAE / RMSE'
        }
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        title: {
          display: true,
          text: 'Точность направления (%)'
        },
        grid: {
          drawOnChartArea: false
        }
      }
    }
  } : null;

  const columns = [
    { key: 'forecastDate', header: 'Дата прогноза' },
    { key: 'startDate', header: 'Начало периода' },
    { key: 'endDate', header: 'Конец периода' },
    { key: 'predictedPrice', header: 'Прогнозируемая цена' },
    { key: 'actualPrice', header: 'Фактическая цена' },
    { key: 'priceChange', header: 'Изменение (%)' },
    { key: 'confidence', header: 'Уверенность' },
    { key: 'mae', header: 'MAE' },
    { key: 'rmse', header: 'RMSE' },
    { key: 'directionAccuracy', header: 'Точность направления' },
    { key: 'status', header: 'Статус' }
  ];

  if (weeklyForecasts.length === 0) {
    return (
      <div className="forecast-history-tab__empty">
        <p>История прогнозов пуста</p>
        <p className="forecast-history-tab__empty-hint">
          Прогнозы Weekly Forecast появятся здесь после их создания
        </p>
      </div>
    );
  }

  return (
    <div className="forecast-history-tab">
      <div className="forecast-history-tab__summary">
        <div className="forecast-history-tab__summary-item">
          <div className="forecast-history-tab__summary-label">Всего прогнозов:</div>
          <div className="forecast-history-tab__summary-value">{weeklyForecasts.length}</div>
        </div>
        <div className="forecast-history-tab__summary-item">
          <div className="forecast-history-tab__summary-label">Завершено:</div>
          <div className="forecast-history-tab__summary-value">
            {weeklyForecasts.filter(f => f.isCompleted).length}
          </div>
        </div>
        <div className="forecast-history-tab__summary-item">
          <div className="forecast-history-tab__summary-label">Активных:</div>
          <div className="forecast-history-tab__summary-value">
            {weeklyForecasts.filter(f => !f.isCompleted).length}
          </div>
        </div>
      </div>

      {accuracyChartData && (
        <div className="forecast-history-tab__chart">
          <h4 className="forecast-history-tab__chart-title">Точность прогнозов</h4>
          <div style={{ height: '300px' }}>
            <Chart type="line" data={accuracyChartData} options={accuracyChartOptions} height={300} />
          </div>
        </div>
      )}

      <div className="forecast-history-tab__table">
          <DataTable
            data={tableData}
            columns={columns}
            paginator
            rows={10}
            sortMode="multiple"
            emptyMessage="Нет данных"
          />
      </div>
    </div>
  );
};

export default ForecastHistoryTab;

