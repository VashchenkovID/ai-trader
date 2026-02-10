import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button } from '../../components/ui';
import { WeeklyForecastChart } from '../../components/weekly-forecast/WeeklyForecastChart';
import { weeklyForecastApi, WeeklyForecast, ForecastMetrics } from '../../services/weeklyForecastApi';
import './WeeklyForecastDetail.css';

export const WeeklyForecastDetail: React.FC = () => {
  const { figi } = useParams<{ figi: string }>();
  const navigate = useNavigate();
  const [forecast, setForecast] = useState<WeeklyForecast | null>(null);
  const [metrics, setMetrics] = useState<ForecastMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!figi) {
      setError('FIGI не указан');
      setLoading(false);
      return;
    }

    loadForecast();
    loadMetrics();
  }, [figi]);

  const loadForecast = async () => {
    if (!figi) return;
    
    try {
      setLoading(true);
      const data = await weeklyForecastApi.getForecast(figi, true);
      setForecast(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки прогноза');
      console.error('Error loading forecast:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMetrics = async () => {
    if (!figi) return;
    
    try {
      const data = await weeklyForecastApi.getMetrics(figi);
      setMetrics(data);
    } catch (err) {
      console.error('Error loading metrics:', err);
    }
  };

  const handleGenerate = async () => {
    if (!figi) return;
    
    try {
      setGenerating(true);
      const result = await weeklyForecastApi.generateForecast(figi, true);
      setForecast(result.forecast);
    } catch (err: any) {
      setError(err.message || 'Ошибка генерации прогноза');
    } finally {
      setGenerating(false);
    }
  };

  const handleUpdate = async () => {
    if (!figi || !forecast) return;
    
    try {
      setGenerating(true);
      await weeklyForecastApi.updateForecast(figi, forecast.id);
      await loadForecast();
    } catch (err: any) {
      setError(err.message || 'Ошибка обновления прогноза');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="weekly-forecast-detail">
        <div className="loading-container">
          <i className="pi pi-spin pi-spinner" style={{ fontSize: '2rem' }}></i>
          <p>Загрузка прогноза...</p>
        </div>
      </div>
    );
  }

  if (error && !forecast) {
    return (
      <div className="weekly-forecast-detail">
        <Card>
          <div className="error-container">
            <h2>Ошибка</h2>
            <p>{error}</p>
            <Button onClick={() => navigate(-1)}>Назад</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!forecast) {
    return (
      <div className="weekly-forecast-detail">
        <Card>
          <div className="empty-container">
            <h2>Прогноз не найден</h2>
            <p>Для этого инструмента еще нет прогноза</p>
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? 'Генерация...' : 'Сгенерировать прогноз'}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const trendColors = {
    BULLISH: '#10B981',
    BEARISH: '#EF4444',
    SIDEWAYS: '#F59E0B'
  };

  const trendLabels = {
    BULLISH: 'Бычий',
    BEARISH: 'Медвежий',
    SIDEWAYS: 'Боковой'
  };

  return (
    <div className="weekly-forecast-detail">
      <div className="forecast-header">
        <Button onClick={() => navigate(-1)} variant="secondary">
          ← Назад
        </Button>
        <h1>Недельный прогноз: {forecast.ticker}</h1>
        <div className="header-actions">
          <Button 
            onClick={handleUpdate} 
            disabled={generating || forecast.isCompleted}
            variant="secondary"
          >
            Обновить реальными данными
          </Button>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? 'Генерация...' : 'Перегенерировать'}
          </Button>
        </div>
      </div>

      <div className="forecast-content">
        {/* Основная информация */}
        <Card className="forecast-info-card">
          <h2>Информация о прогнозе</h2>
          <div className="info-grid">
            <div className="info-item">
              <label>Период прогноза:</label>
              <span>
                {new Date(forecast.startDate).toLocaleDateString('ru-RU')} - 
                {new Date(forecast.endDate).toLocaleDateString('ru-RU')}
              </span>
            </div>
            <div className="info-item">
              <label>Дата создания:</label>
              <span>{new Date(forecast.forecastDate).toLocaleString('ru-RU')}</span>
            </div>
            <div className="info-item">
              <label>Уверенность:</label>
              <span className="confidence-badge">
                {(forecast.confidenceScore * 100).toFixed(1)}%
              </span>
            </div>
            <div className="info-item">
              <label>Тренд:</label>
              <span 
                className="trend-badge"
                style={{ 
                  color: forecast.predictedTrend ? trendColors[forecast.predictedTrend] : undefined 
                }}
              >
                {forecast.predictedTrend ? trendLabels[forecast.predictedTrend] : 'Не определен'}
              </span>
            </div>
            <div className="info-item">
              <label>Изменение цены:</label>
              <span className={forecast.predictedPriceChange && forecast.predictedPriceChange >= 0 ? 'positive' : 'negative'}>
                {forecast.predictedPriceChange !== null && forecast.predictedPriceChange !== undefined
                  ? `${forecast.predictedPriceChange >= 0 ? '+' : ''}${forecast.predictedPriceChange.toFixed(2)}%`
                  : 'Не определено'}
              </span>
            </div>
            <div className="info-item">
              <label>Волатильность:</label>
              <span>
                {forecast.predictedVolatility !== null && forecast.predictedVolatility !== undefined
                  ? `${forecast.predictedVolatility.toFixed(2)}%`
                  : 'Не определена'}
              </span>
            </div>
            <div className="info-item">
              <label>Статус:</label>
              <span className={forecast.isCompleted ? 'completed' : 'active'}>
                {forecast.isCompleted ? 'Завершен' : 'Активен'}
              </span>
            </div>
            <div className="info-item">
              <label>Версия модели:</label>
              <span>{forecast.modelVersion}</span>
            </div>
          </div>
        </Card>

        {/* График */}
        <Card className="forecast-chart-card">
          <h2>График прогноза</h2>
          <WeeklyForecastChart
            forecastData={forecast.forecastData}
            actualData={forecast.actualData}
            height={400}
          />
        </Card>

        {/* Метрики точности */}
        {forecast.accuracyMetrics && (
          <Card className="metrics-card">
            <h2>Метрики точности</h2>
            <div className="metrics-grid">
              <div className="metric-item">
                <label>MAE (Средняя абсолютная ошибка):</label>
                <span>{forecast.accuracyMetrics.mae.toFixed(4)}</span>
              </div>
              <div className="metric-item">
                <label>RMSE (Среднеквадратичная ошибка):</label>
                <span>{forecast.accuracyMetrics.rmse.toFixed(4)}</span>
              </div>
              <div className="metric-item">
                <label>MAPE (Средняя процентная ошибка):</label>
                <span>{forecast.accuracyMetrics.mape.toFixed(2)}%</span>
              </div>
              <div className="metric-item">
                <label>Точность направления:</label>
                <span className="positive">
                  {(forecast.accuracyMetrics.directionAccuracy * 100).toFixed(1)}%
                </span>
              </div>
              <div className="metric-item">
                <label>Размер выборки:</label>
                <span>{forecast.accuracyMetrics.sampleSize} дней</span>
              </div>
            </div>
          </Card>
        )}

        {/* Средние метрики */}
        {metrics && metrics.averageMetrics && (
          <Card className="average-metrics-card">
            <h2>Средние метрики (по всем прогнозам)</h2>
            <div className="metrics-grid">
              <div className="metric-item">
                <label>Средний MAE:</label>
                <span>{metrics.averageMetrics.mae.toFixed(4)}</span>
              </div>
              <div className="metric-item">
                <label>Средний RMSE:</label>
                <span>{metrics.averageMetrics.rmse.toFixed(4)}</span>
              </div>
              <div className="metric-item">
                <label>Средний MAPE:</label>
                <span>{metrics.averageMetrics.mape.toFixed(2)}%</span>
              </div>
              <div className="metric-item">
                <label>Средняя точность направления:</label>
                <span className="positive">
                  {(metrics.averageMetrics.directionAccuracy * 100).toFixed(1)}%
                </span>
              </div>
              <div className="metric-item">
                <label>Всего прогнозов:</label>
                <span>{metrics.totalForecasts}</span>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default WeeklyForecastDetail;

