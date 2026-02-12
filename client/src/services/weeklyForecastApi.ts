/**
 * API сервис для работы с недельными прогнозами
 */

import api from './api';

export interface WeeklyForecastCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  confidence?: number;
}

export interface WeeklyForecast {
  id: number;
  figi: string;
  ticker: string;
  forecastDate: string;
  startDate: string;
  endDate: string;
  forecastData: WeeklyForecastCandle[];
  modelVersion: string;
  modelType: string;
  confidenceScore: number;
  predictedVolatility?: number;
  predictedTrend?: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  predictedPriceChange?: number;
  actualData?: WeeklyForecastCandle[];
  accuracyMetrics?: {
    mae: number;
    mse: number;
    rmse: number;
    mape: number;
    directionAccuracy: number;
    priceError: number;
    volumeError: number;
    sampleSize: number;
  };
  isCompleted: boolean;
  completionDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ForecastMetrics {
  totalForecasts: number;
  averageMetrics: {
    mae: number;
    mse: number;
    rmse: number;
    mape: number;
    directionAccuracy: number;
    sampleSize: number;
  } | null;
  recentMetrics: {
    mae: number;
    mse: number;
    rmse: number;
    mape: number;
    directionAccuracy: number;
    priceError: number;
    volumeError: number;
    sampleSize: number;
  } | null;
  allMetrics: Array<{
    forecastId: number;
    forecastDate: string;
    completionDate: string;
    metrics: any;
  }>;
}

export const weeklyForecastApi = {
  /**
   * Получить активный прогноз для инструмента
   */
  async getForecast(figi: string, includeCompleted: boolean = false): Promise<WeeklyForecast> {
    const response = await api.get(`/api/weekly-forecast/${figi}`, {
      params: { includeCompleted }
    });
    return response.data.data;
  },

  /**
   * Получить историю прогнозов
   */
  async getForecastHistory(figi: string, limit: number = 10, includeCompleted: boolean = true): Promise<WeeklyForecast[]> {
    const response = await api.get(`/api/weekly-forecast/${figi}/history`, {
      params: { limit, includeCompleted }
    });
    return response.data.data.forecasts;
  },

  /**
   * Сгенерировать новый прогноз
   */
  async generateForecast(figi: string, forceRegenerate: boolean = false): Promise<{ forecast: WeeklyForecast; cached: boolean }> {
    const response = await api.post(`/api/weekly-forecast/${figi}/generate`, {
      forceRegenerate
    });
    return response.data.data;
  },

  /**
   * Получить метрики точности
   */
  async getMetrics(figi: string, limit: number = 10): Promise<ForecastMetrics> {
    const response = await api.get(`/api/weekly-forecast/${figi}/metrics`, {
      params: { limit }
    });
    return response.data.data;
  },

  /**
   * Обновить прогноз реальными данными
   */
  async updateForecast(figi: string, forecastId?: number): Promise<{
    forecast: WeeklyForecast;
    metrics: any;
    matchedDays: number;
  }> {
    const response = await api.post(`/api/weekly-forecast/${figi}/update`, {
      forecastId
    });
    return response.data.data;
  },

  /**
   * Получить конкретный прогноз по ID
   */
  async getForecastById(figi: string, forecastId: number): Promise<WeeklyForecast> {
    const response = await api.get(`/api/weekly-forecast/${figi}/${forecastId}`);
    return response.data.data;
  },

  /**
   * Запустить обучение моделей Weekly Forecast
   */
  async trainModels(options?: {
    figi?: string;
    maxInstruments?: number | null;
    trainingOptions?: {
      historicalDays?: number;
      lookbackDays?: number;
      forecastDays?: number;
      epochs?: number;
      batchSize?: number;
    };
  }): Promise<{
    success: boolean;
    data: any;
  }> {
    // Увеличиваем таймаут для обучения (5 минут), так как обучение может занимать много времени
    const response = await api.post('/api/weekly-forecast/train', options || {}, {
      timeout: 300000 // 5 минут
    });
    return response.data;
  }
};

