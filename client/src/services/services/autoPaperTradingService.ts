import { api } from '../apiService';

export interface AutoPaperTradingStatus {
  isInitialized: boolean;
  isEnabled: boolean;
  currentPhase: 'phase1' | 'phase2' | 'phase3';
  stats: {
    dailyTrades: number;
    dailyPnL: number;
    totalTrades: number;
    lastTradeTime: string | null;
  };
  settings: {
    minConfidence: number;
    maxDailyTrades: number;
    maxPositionSize: number;
    minTimeBetweenTrades: number;
    maxDailyLoss: number;
    enableRealisticExecution: boolean;
  };
}

export interface AutoPaperTradingStats {
  id: number;
  date: string;
  dailyTrades: number;
  dailyPnL: number;
  totalTrades: number;
  currentPhase: 'phase1' | 'phase2' | 'phase3';
  settings: any;
}

export interface AutoPaperTradingSettings {
  minConfidence?: number;
  maxDailyTrades?: number;
  maxPositionSize?: number;
  minTimeBetweenTrades?: number;
  maxDailyLoss?: number;
}

export const autoPaperTradingService = {
  /**
   * Получить статус автоматической торговли
   */
  async getStatus(): Promise<AutoPaperTradingStatus> {
    const response = await api.get('/api/auto-paper-trading/status');
    return response.data.data;
  },

  /**
   * Включить автоматическую торговлю
   */
  async enable(): Promise<void> {
    await api.post('/api/auto-paper-trading/enable');
  },

  /**
   * Выключить автоматическую торговлю
   */
  async disable(): Promise<void> {
    await api.post('/api/auto-paper-trading/disable');
  },

  /**
   * Получить статистику за период
   */
  async getStats(startDate?: string, endDate?: string): Promise<AutoPaperTradingStats[]> {
    const params: any = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    
    const response = await api.get('/api/auto-paper-trading/stats', { params });
    return response.data.data;
  },

  /**
   * Обновить настройки
   */
  async updateSettings(settings: AutoPaperTradingSettings): Promise<void> {
    await api.put('/api/auto-paper-trading/settings', settings);
  },

  /**
   * Перейти на следующую фазу
   */
  async advancePhase(): Promise<{ currentPhase: string }> {
    const response = await api.post('/api/auto-paper-trading/advance-phase');
    return { currentPhase: response.data.currentPhase };
  }
};

