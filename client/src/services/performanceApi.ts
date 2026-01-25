import axios from 'axios';

const API_BASE_URL = (window as any).env?.REACT_APP_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Интерфейсы для типизации
export interface ReturnsChartData {
  labels: string[];
  returns: number[];
  cumulativeReturns: number[];
}

export interface PnLDistributionData {
  bins: number[];
  frequencies: number[];
  mean: number;
  median: number;
  stdDev: number;
}

export interface DrawdownChartData {
  labels: string[];
  drawdown: number[];
  maxDrawdown: number;
  maxDrawdownDate: string;
}

export interface PerformanceHeatmapData {
  sectors: string[];
  strategies: string[];
  data: Array<{
    sector: string;
    strategy: string;
    value: number;
    profit: number;
    trades: number;
  }>;
}

export interface DashboardData {
  summary: {
    totalProfit: number;
    totalTrades: number;
    winRate: number;
    sharpeRatio: number;
    maxDrawdown: number;
    volatility: number;
  };
  returns: ReturnsChartData;
  pnlDistribution: PnLDistributionData;
  drawdown: DrawdownChartData;
  heatmap: PerformanceHeatmapData;
}

export interface SectorPerformance {
  sector: string;
  instruments: number;
  trades: number;
  profit: number;
  winRate: number;
  sharpeRatio: number;
  portfolioWeight: number;
}

export interface SectorAnalysis {
  sectors: Record<string, SectorPerformance>;
  recommendations: Array<{
    type: 'overexposure' | 'underexposure' | 'poor_performance';
    sector: string;
    message: string;
    currentWeight: number;
    recommendedWeight?: number;
  }>;
  diversification: {
    concentration: number;
    recommendations: Array<{
      type: 'high_concentration' | 'low_diversification';
      message: string;
      sectors: string[];
    }>;
  };
}

export interface BenchmarkData {
  benchmarkId: string;
  name: string;
  data: Array<{
    date: string;
    value: number;
    return: number;
  }>;
}

export interface BenchmarkComparison {
  portfolio: {
    returns: number[];
    dates: string[];
  };
  benchmark: {
    returns: number[];
    dates: string[];
  };
  metrics: {
    alpha: number;
    beta: number;
    trackingError: number;
    portfolioReturn: number;
    benchmarkReturn: number;
    portfolioVolatility: number;
    benchmarkVolatility: number;
    portfolioSharpe: number;
    benchmarkSharpe: number;
  };
  alerts: Array<{
    type: 'significant_deviation' | 'underperformance' | 'overperformance';
    message: string;
    severity: 'low' | 'medium' | 'high';
  }>;
}

export interface AvailableBenchmark {
  id: string;
  name: string;
  description: string;
  figi?: string;
}

export type ChartPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year';

// Performance API сервис
export const performanceApi = {
  /**
   * Получить данные для графика доходности
   */
  async getReturnsChartData(period: 'day' | 'week' | 'month' | 'quarter' | 'year' = 'month'): Promise<ReturnsChartData> {
    try {
      const response = await api.get('/api/performance/visualization/returns', {
        params: { period }
      } as any);
      return response.data.data || response.data;
    } catch (error: any) {
      console.error('Error fetching returns chart data:', error);
      throw error;
    }
  },

  /**
   * Получить данные для распределения PnL
   */
  async getPnLDistributionData(period: 'day' | 'week' | 'month' | 'quarter' | 'year' = 'month'): Promise<PnLDistributionData> {
    try {
      const response = await api.get('/api/performance/visualization/pnl-distribution', {
        params: { period }
      } as any);
      return response.data.data || response.data;
    } catch (error: any) {
      console.error('Error fetching PnL distribution data:', error);
      throw error;
    }
  },

  /**
   * Получить данные для графика drawdown
   */
  async getDrawdownChartData(period: 'day' | 'week' | 'month' | 'quarter' | 'year' = 'month'): Promise<DrawdownChartData> {
    try {
      const response = await api.get('/api/performance/visualization/drawdown', {
        params: { period }
      });
      return response.data.data || response.data;
    } catch (error: any) {
      console.error('Error fetching drawdown chart data:', error);
      throw error;
    }
  },

  /**
   * Получить данные для heatmap производительности
   */
  async getPerformanceHeatmapData(period: 'day' | 'week' | 'month' | 'quarter' | 'year' = 'month'): Promise<PerformanceHeatmapData> {
    try {
      const response = await api.get('/api/performance/visualization/heatmap', {
        params: { period }
      });
      return response.data.data || response.data;
    } catch (error: any) {
      console.error('Error fetching performance heatmap data:', error);
      throw error;
    }
  },

  /**
   * Получить агрегированные данные для дашборда
   */
  async getDashboardData(period: 'day' | 'week' | 'month' | 'quarter' | 'year' = 'month'): Promise<DashboardData> {
    try {
      const response = await api.get('/api/performance/visualization/dashboard', {
        params: { period }
      });
      return response.data.data || response.data;
    } catch (error: any) {
      console.error('Error fetching dashboard data:', error);
      throw error;
    }
  },

  /**
   * Получить секторный анализ
   */
  async getSectorAnalysis(period: 'day' | 'week' | 'month' | 'quarter' | 'year' = 'month'): Promise<SectorAnalysis> {
    try {
      const response = await api.get('/api/performance/sector-analysis', {
        params: { period }
      });
      return response.data.data || response.data;
    } catch (error: any) {
      console.error('Error fetching sector analysis:', error);
      throw error;
    }
  },

  /**
   * Получить список доступных бенчмарков
   */
  async getAvailableBenchmarks(): Promise<AvailableBenchmark[]> {
    try {
      const response = await api.get('/api/performance/benchmark/list');
      return response.data.data || response.data;
    } catch (error: any) {
      console.error('Error fetching available benchmarks:', error);
      throw error;
    }
  },

  /**
   * Сравнить портфель с бенчмарком
   */
  async compareWithBenchmark(
    benchmarkId: string,
    period: 'day' | 'week' | 'month' | 'quarter' | 'year' = 'month'
  ): Promise<BenchmarkComparison> {
    try {
      // Преобразуем period в days для бэкенда
      const periodDaysMap: Record<string, number> = {
        day: 1,
        week: 7,
        month: 30,
        quarter: 90,
        year: 365
      };
      const days = periodDaysMap[period] || 30;
      
      const response = await api.get(`/api/performance/benchmark/${benchmarkId}/compare`, {
        params: { days }
      });
      return response.data.data || response.data;
    } catch (error: any) {
      console.error('Error comparing with benchmark:', error);
      throw error;
    }
  },

  /**
   * Получить алерты по бенчмаркам
   */
  async getBenchmarkAlerts(): Promise<Array<{
    type: 'significant_deviation' | 'underperformance' | 'overperformance';
    message: string;
    severity: 'low' | 'medium' | 'high';
    benchmarkId: string;
    benchmarkName: string;
  }>> {
    try {
      const response = await api.get('/api/performance/benchmark/alerts');
      return response.data.data || response.data;
    } catch (error: any) {
      console.error('Error fetching benchmark alerts:', error);
      throw error;
    }
  },

  /**
   * Сгенерировать ежедневный отчет PDF
   */
  async generateDailyReportPDF(): Promise<{ filepath: string; downloadUrl: string }> {
    try {
      const response = await api.post('/api/performance/report/daily');
      return response.data.data || response.data;
    } catch (error: any) {
      console.error('Error generating daily report PDF:', error);
      throw error;
    }
  },

  /**
   * Сгенерировать еженедельный отчет PDF
   */
  async generateWeeklyReportPDF(): Promise<{ filepath: string; downloadUrl: string }> {
    try {
      const response = await api.post('/api/performance/report/weekly');
      return response.data.data || response.data;
    } catch (error: any) {
      console.error('Error generating weekly report PDF:', error);
      throw error;
    }
  },

  /**
   * Сгенерировать месячный отчет PDF
   */
  async generateMonthlyReportPDF(): Promise<{ filepath: string; downloadUrl: string }> {
    try {
      const response = await api.post('/api/performance/report/monthly');
      return response.data.data || response.data;
    } catch (error: any) {
      console.error('Error generating monthly report PDF:', error);
      throw error;
    }
  },

  /**
   * Сгенерировать Excel отчет
   */
  async generateExcelReport(
    reportType: 'daily' | 'weekly' | 'monthly',
    days: number = 30
  ): Promise<{ filepath: string; downloadUrl: string }> {
    try {
      const response = await api.post('/api/performance/report/excel', {
        reportType,
        days
      });
      return response.data.data || response.data;
    } catch (error: any) {
      console.error('Error generating Excel report:', error);
      throw error;
    }
  },

  /**
   * Скачать отчет
   */
  async downloadReport(reportId: string): Promise<Blob> {
    try {
      const response = await api.get(`/api/performance/report/${reportId}/download`, {
        responseType: 'blob'
      });
      return response.data;
    } catch (error: any) {
      console.error('Error downloading report:', error);
      throw error;
    }
  },
};

export default performanceApi;

