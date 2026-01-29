import axios from 'axios';
import Cookies from 'js-cookie';

const API_BASE_URL = (window as any).env?.REACT_APP_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Интерцептор для добавления токена в заголовки
api.interceptors.request.use(
  (config) => {
    const token = Cookies.get('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Интерцептор для обработки ошибок авторизации
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      Cookies.remove('auth_token');
      Cookies.remove('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Интерфейсы для типизации
export interface Worker {
  workerId: string;
  type: string;
  name: string;
  status: 'running' | 'paused' | 'completed' | 'error' | 'idle';
  startTime: string;
  endTime: string | null;
  duration: number;
  progress: number;
  metadata: {
    [key: string]: any;
    figi?: string;
    instrument?: string;
    currentStage?: string;
    error?: string;
    epoch?: number;
    loss?: number;
    accuracy?: number;
  };
  resourceUsage: {
    cpu?: number | null;
    memory?: number | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface WorkerStats {
  period: string;
  active: {
    total: number;
    byType: { [key: string]: number };
    byStatus: {
      running: number;
      paused: number;
      completed: number;
      error: number;
      idle: number;
    };
  };
  completed: {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
    avgDuration: number;
  };
  timeline: {
    startTime: string;
    endTime: string;
  };
}

export interface WorkerTimelineEvent {
  workerId: string;
  type: string;
  name: string;
  status: string;
  startTime: string;
  endTime: string;
  duration: number;
}

export interface WorkerTimeline {
  timeline: WorkerTimelineEvent[];
  count: number;
  startDate: string;
  endDate: string;
}

// API сервис для мониторинга воркеров
export const workerMonitoringApi = {
  /**
   * Получить статус всех активных воркеров
   */
  async getWorkersStatus(): Promise<{ workers: Worker[]; count: number }> {
    try {
      const response = await api.get('/api/workers/status');
      return response.data.data || { workers: [], count: 0 };
    } catch (error: any) {
      console.error('Error fetching workers status:', error);
      throw error;
    }
  },

  /**
   * Получить детальную информацию о воркере
   */
  async getWorkerDetails(workerId: string): Promise<Worker> {
    try {
      const response = await api.get(`/api/workers/${workerId}`);
      return response.data.data;
    } catch (error: any) {
      console.error('Error fetching worker details:', error);
      throw error;
    }
  },

  /**
   * Получить историю работы воркеров
   */
  async getWorkerHistory(workerId: string | null = null, limit: number = 50): Promise<Worker[]> {
    try {
      const url = workerId 
        ? `/api/workers/history/${workerId}?limit=${limit}`
        : `/api/workers/history?limit=${limit}`;
      const response = await api.get(url);
      return response.data.data.history || [];
    } catch (error: any) {
      console.error('Error fetching worker history:', error);
      throw error;
    }
  },

  /**
   * Получить статистику воркеров за период
   */
  async getWorkerStats(period: '1h' | '24h' | '7d' | '30d' = '24h'): Promise<WorkerStats> {
    try {
      const response = await api.get(`/api/workers/stats?period=${period}`);
      return response.data.data;
    } catch (error: any) {
      console.error('Error fetching worker stats:', error);
      throw error;
    }
  },

  /**
   * Получить временную линию работы воркеров
   */
  async getWorkerTimeline(
    startDate: Date,
    endDate: Date
  ): Promise<WorkerTimeline> {
    try {
      const response = await api.get('/api/workers/timeline', {
        params: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      });
      return response.data.data;
    } catch (error: any) {
      console.error('Error fetching worker timeline:', error);
      throw error;
    }
  },

  /**
   * Получить воркеры по типу
   */
  async getWorkersByType(type: string): Promise<Worker[]> {
    try {
      const response = await api.get(`/api/workers/type/${type}`);
      return response.data.data.workers || [];
    } catch (error: any) {
      console.error('Error fetching workers by type:', error);
      throw error;
    }
  },

  /**
   * Поставить воркер на паузу
   */
  async pauseWorker(workerId: string): Promise<void> {
    try {
      await api.post(`/api/workers/${workerId}/pause`);
    } catch (error: any) {
      console.error('Error pausing worker:', error);
      throw error;
    }
  },

  /**
   * Возобновить работу воркера
   */
  async resumeWorker(workerId: string): Promise<void> {
    try {
      await api.post(`/api/workers/${workerId}/resume`);
    } catch (error: any) {
      console.error('Error resuming worker:', error);
      throw error;
    }
  },
};

export default workerMonitoringApi;

