import axios from 'axios';

const API_BASE_URL = (window as any).env?.REACT_APP_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Интерфейсы для типизации
export interface SystemStatus {
  neuralNetwork: any;
  websocket: any;
  tradingEngine: any;
  ensemble: any;
  database: any;
  timestamp: string;
}

export interface CacheStatus {
  lastUpdate: string | null;
  timeSinceLastUpdate: number | null; // в минутах
  updateInterval: number; // в минутах
  needsUpdate: boolean;
  nextUpdateIn: number | null; // в минутах
}

export interface SystemResources {
  cpu: {
    usage: number;
    cores: number;
    loadAverage: number[];
  };
  memory: {
    used: number;
    total: number;
    free: number;
    usage: number;
  };
  timestamp: string;
}

export interface HealthStatus {
  status: string;
  timestamp: string;
  uptime: number;
  memory: any;
  version: string;
}

export interface Portfolio {
  cash: number;
  positions: Record<string, any>;
  totalValue: number;
  trades: any[];
}

export interface TradingStats {
  portfolioValue: number;
  cash: number;
  totalPnL: number;
  winRate: number;
  totalTrades: number;
  successfulTrades: number;
  recommendations?: {
    figi: string;
    ticker: string;
    name: string;
    recommendation: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    score: number;
  }[];
}

export interface Recommendation {
  figi: string;
  ticker: string;
  name: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  score: number;
  analysis: any;
  explanation: any;
  priceAtAnalysis: number;
  targetPrice: number;
  stopLoss: number;
  takeProfit: number;
  analysisDate: string;
}

export interface TradingMode {
  mode: 'paper' | 'micro' | 'real';
  settings: any;
  timestamp: string;
}

export interface RiskManagementStatus {
  isActive: boolean;
  maxPositionSize: number;
  maxDrawdown: number;
  maxConsecutiveLosses: number;
  emergencyStop: boolean;
  currentDrawdown: number;
  consecutiveLosses: number;
}

export interface PerformanceMetrics {
  neuralNetwork: any;
  trading: any;
  system: any;
  timestamp: string;
}

export interface Settings {
  key: string;
  value: any;
  description: string;
  category: string;
  dataType: string;
  isEditable: boolean;
  minValue?: number;
  maxValue?: number;
  options?: any[];
  lastUpdated: string;
}

export interface PreflightCheckResults {
  allPassed: boolean;
  details: {
    api: any;
    risk: any;
    monitoring: any;
    backup: any;
  };
  recommendations: string[];
}

export interface MigrationPlan {
  steps: any[];
  totalSteps: number;
  estimatedDuration: number;
  riskAssessment: any;
}

export interface CapitalScalingStatus {
  currentLevel: number;
  maxLevel: number;
  canIncrease: boolean;
  canDecrease: boolean;
  nextLevel: number;
  requirements: any;
}

export interface NewsAnalysis {
  figi: string;
  news: any[];
  sentiment: any;
  impact: any;
  timestamp: string;
}

export interface TelegramSentiment {
  figi: string;
  sentiment: any;
  channels: string[];
  confidence: number;
  timestamp: string;
}

// Основной API сервис
export const apiService = {
  // ============================================================================
  // СИСТЕМНЫЕ РОУТЫ
  // ============================================================================

  /**
   * Получить статус системы
   */
  async getSystemStatus(): Promise<SystemStatus> {
    try {
      const response = await api.get('/api/system/status');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching system status:', error);
      throw error;
    }
  },

  /**
   * Health check
   */
  async getHealthStatus(): Promise<HealthStatus> {
    try {
      const response = await api.get('/api/system/health');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching health status:', error);
      throw error;
    }
  },

  // ============================================================================
  // ОБУЧЕНИЕ НЕЙРОСЕТЕЙ
  // ============================================================================

  /**
   * Получить статус нейросети
   */
  async getNeuralNetworkStatus(): Promise<any> {
    try {
      const response = await api.get('/api/neural-network/status');
      return response.data;
    } catch (error) {
      console.error('Error fetching neural network status:', error);
      throw error;
    }
  },

  /**
   * Активировать нейросеть
   */
  async activateNeuralNetwork(): Promise<any> {
    try {
      const response = await api.post('/api/neural-network/activate');
      return response.data;
    } catch (error) {
      console.error('Error activating neural network:', error);
      throw error;
    }
  },

  /**
   * Запустить обучение одного инструмента
   */
  async trainNeuralNetwork(figi: string, options: any = {}): Promise<any> {
    try {
      const response = await api.post('/api/neural-network/train', { figi, options });
      return response.data.data;
    } catch (error) {
      console.error('Error training neural network:', error);
      throw error;
    }
  },

  /**
   * Запустить пакетное обучение
   */
  async trainBatchNeuralNetwork(instruments: string[], options: any = {}): Promise<any> {
    try {
      // Полный запуск обучения всех сетей на бэке
      const response = await api.post('/api/training/batch-train-all', { instruments, options });
      return response.data.data ?? response.data;
    } catch (error) {
      console.error('Error training all neural networks:', error);
      throw error;
    }
  },

  /**
   * Получить доступные инструменты для обучения
   */
  async getNeuralNetworkInstruments(): Promise<any[]> {
    try {
      const response = await api.get('/api/neural-network/instruments');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching neural network instruments:', error);
      throw error;
    }
  },

  /**
   * Обновить кеш данных (инкрементальное обновление)
   */
  async refreshCache(): Promise<any> {
    try {
      const response = await api.post('/api/system/cache/update');
      return response.data;
    } catch (error) {
      console.error('Error refreshing cache:', error);
      throw error;
    }
  },

  /**
   * Полное обновление кеша данных
   */
  async fullRefreshCache(): Promise<any> {
    try {
      const response = await api.post('/api/system/cache/full-update');
      return response.data;
    } catch (error) {
      console.error('Error full refreshing cache:', error);
      throw error;
    }
  },


  // ============================================================================
  // ТОРГОВЫЕ РОУТЫ
  // ============================================================================

  /**
   * Получить портфель
   */
  async getPortfolio(): Promise<Portfolio> {
    try {
      // Используем /api/portfolio вместо /api/trading/portfolio
      const response = await api.get('/api/portfolio');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching portfolio:', error);
      throw error;
    }
  },

  /**
   * Получить статистику торговли
   */
  async getTradingStats(): Promise<TradingStats> {
    try {
      const response = await api.get('/api/trading/stats');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching trading stats:', error);
      throw error;
    }
  },

  /**
   * Получить историю сделок
   */
  async getTradingTrades(): Promise<any[]> {
    try {
      const response = await api.get('/api/trading/trades');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching trading trades:', error);
      throw error;
    }
  },

  /**
   * Выполнить сделку
   */
  async executeTrade(action: 'BUY' | 'SELL', figi: string, quantity: number, price?: number): Promise<any> {
    try {
      const response = await api.post('/api/trading/execute', { action, figi, quantity, price });
      return response.data.data;
    } catch (error) {
      console.error('Error executing trade:', error);
      throw error;
    }
  },

  // ============================================================================
  // РЕКОМЕНДАЦИИ
  // ============================================================================

  /**
   * Получить торговые рекомендации
   */
  async getRecommendations(): Promise<Recommendation[]> {
    try {
      const response = await api.get('/api/recommendations');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      throw error;
    }
  },

  /**
   * Получить доступные инструменты
   */
  async getInstruments(): Promise<any[]> {
    try {
      const response = await api.get('/api/market/instruments');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching instruments:', error);
      throw error;
    }
  },

  // ============================================================================
  // МОНИТОРИНГ ПРОИЗВОДИТЕЛЬНОСТИ
  // ============================================================================

  /**
   * Получить метрики производительности
   */
  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    try {
      const response = await api.get('/api/performance/metrics');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching performance metrics:', error);
      throw error;
    }
  },

  /**
   * Получить статус кеша
   */
  async getCacheStatus(): Promise<CacheStatus> {
    try {
      const response = await api.get('/api/debug/cache-status');
      return response.data.data.cacheStatus;
    } catch (error) {
      console.error('Error fetching cache status:', error);
      throw error;
    }
  },

  /**
   * Получить системные ресурсы (CPU, Memory)
   */
  async getSystemResources(): Promise<SystemResources> {
    try {
      const response = await api.get('/api/system/resources');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching system resources:', error);
      throw error;
    }
  },

  /**
   * Получить алерты системы
   */
  async getAlerts(): Promise<any[]> {
    try {
      const response = await api.get('/api/system/status');
      // Извлекаем алерты из статуса системы
      return response.data.data?.alerts || [];
    } catch (error) {
      console.error('Error fetching alerts:', error);
      throw error;
    }
  },

  /**
   * Получить статус ансамбля
   */
  async getEnsembleStatus(): Promise<any> {
    try {
      const response = await api.get('/api/ensemble/status');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching ensemble status:', error);
      throw error;
    }
  },

  /**
   * Получить модели ансамбля
   */
  async getEnsembleModels(): Promise<any> {
    try {
      const response = await api.get('/api/ensemble/status');
      return response.data;
    } catch (error) {
      console.error('Error fetching ensemble models:', error);
      throw error;
    }
  },

  /**
   * Получить метрики ансамбля
   */
  async getEnsembleMetrics(): Promise<any> {
    try {
      const response = await api.get('/api/ensemble/status');
      return response.data;
    } catch (error) {
      console.error('Error fetching ensemble metrics:', error);
      throw error;
    }
  },

  /**
   * Обучить модель ансамбля
   */
  async trainEnsembleModel(modelType: string): Promise<any> {
    try {
      const response = await api.post('/api/ensemble/train', { modelType });
      return response.data;
    } catch (error) {
      console.error('Error training ensemble model:', error);
      throw error;
    }
  },

  /**
   * Обучить все модели ансамбля
   */
  async trainAllEnsembleModels(figi: string, options: any = {}): Promise<any> {
    try {
      const response = await api.post('/api/ensemble/train', { figi, options });
      return response.data;
    } catch (error) {
      console.error('Error training all ensemble models:', error);
      throw error;
    }
  },

  /**
   * Пакетное обучение ансамбля по множеству инструментов
   */
  async trainBatchEnsemble(instruments: string[], options: any = {}): Promise<any> {
    try {
      const response = await api.post('/api/ensemble/batch-train', { instruments, options });
      return response.data;
    } catch (error) {
      console.error('Error batch training ensemble:', error);
      throw error;
    }
  },

  /**
   * Пакетное обучение Meta-Learning по множеству инструментов
   */
  async trainBatchMetaLearning(instruments: string[], options: any = {}): Promise<any> {
    try {
      // Используем существующий полный маршрут обучения
      const response = await api.post('/api/training/meta-learning/train', { instruments, options });
      return response.data;
    } catch (error) {
      console.error('Error training meta-learning:', error);
      throw error;
    }
  },

  /**
   * Пакетное обучение Reinforcement Learning по множеству инструментов
   */
  async trainBatchReinforcementLearning(instruments: string[], options: any = {}): Promise<any> {
    try {
      // Используем существующий полный маршрут обучения
      const response = await api.post('/api/training/reinforcement-learning/train', { instruments, options });
      return response.data;
    } catch (error) {
      console.error('Error training reinforcement learning:', error);
      throw error;
    }
  },

  /**
   * Получить прогресс обучения
   */
  async getTrainingProgress(figi: string): Promise<any> {
    try {
      const response = await api.get(`/api/neural-network/status?figi=${figi}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching training progress:', error);
      throw error;
    }
  },

  /**
   * Остановить обучение
   */
  async stopTraining(figi: string): Promise<any> {
    try {
      const response = await api.post('/api/neural-network/stop-training', { figi });
      return response.data;
    } catch (error) {
      console.error('Error stopping training:', error);
      throw error;
    }
  },

  // ============================================================================
  // НАСТРОЙКИ
  // ============================================================================

  /**
   * Получить все настройки
   */
  async getSettings(): Promise<Settings[]> {
    try {
      const response = await api.get('/api/settings');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching settings:', error);
      throw error;
    }
  },

  /**
   * Обновить настройки
   */
  async updateSettings(settings: Record<string, any>): Promise<any> {
    try {
      const response = await api.put('/api/settings', { settings });
      return response.data.data;
    } catch (error) {
      console.error('Error updating settings:', error);
      throw error;
    }
  },

  // ============================================================================
  // УПРАВЛЕНИЕ РЕЖИМАМИ ТОРГОВЛИ
  // ============================================================================

  /**
   * Получить текущий режим торговли
   */
  async getTradingMode(): Promise<TradingMode> {
    try {
      const response = await api.get('/api/trading-mode/current');
      return response.data;
    } catch (error) {
      console.error('Error fetching trading mode:', error);
      throw error;
    }
  },

  /**
   * Получить текущий торговый режим (алиас)
   */
  async getCurrentTradingMode(): Promise<TradingMode> {
    return this.getTradingMode();
  },

  /**
   * Проверить возможность переключения на микро-капитал
   */
  async canSwitchToMicro(): Promise<any> {
    try {
      const response = await api.get('/api/switch-validator/micro');
      return response.data;
    } catch (error) {
      console.error('Error checking micro switch readiness:', error);
      throw error;
    }
  },

  /**
   * Проверить возможность переключения на полный режим
   */
  async canSwitchToFull(): Promise<any> {
    try {
      const response = await api.get('/api/switch-validator/full');
      return response.data;
    } catch (error) {
      console.error('Error checking full switch readiness:', error);
      throw error;
    }
  },

  /**
   * Переключить режим торговли
   */
  async switchTradingMode(mode: 'paper' | 'micro' | 'real'): Promise<any> {
    try {
      const response = await api.post('/api/trading-mode/switch', { mode });
      return response.data;
    } catch (error) {
      console.error('Error switching trading mode:', error);
      throw error;
    }
  },

  /**
   * Активация торгового движка
   */
  async activateTradingEngine(): Promise<any> {
    try {
      const response = await api.post('/api/trading/activate');
      return response.data;
    } catch (error) {
      console.error('Error activating trading engine:', error);
      throw error;
    }
  },

  /**
   * Деактивация торгового движка
   */
  async deactivateTradingEngine(): Promise<any> {
    try {
      const response = await api.post('/api/trading/deactivate');
      return response.data;
    } catch (error) {
      console.error('Error deactivating trading engine:', error);
      throw error;
    }
  },

  /**
   * Получить статус торгового движка
   */
  async getTradingEngineStatus(): Promise<any> {
    try {
      const response = await api.get('/api/trading/status');
      return response.data;
    } catch (error) {
      console.error('Error getting trading engine status:', error);
      throw error;
    }
  },

  /**
   * Проверить возможность переключения на режим
   */
  async canSwitchToMode(mode: 'paper' | 'micro' | 'real'): Promise<any> {
    try {
      const response = await api.get(`/api/trading-mode/can-switch/${mode}`);
      return response.data;
    } catch (error) {
      console.error('Error checking if can switch to mode:', error);
      throw error;
    }
  },

  // ============================================================================
  // РИСК-МЕНЕДЖМЕНТ
  // ============================================================================

  /**
   * Получить статус риск-менеджмента
   */
  async getRiskManagementStatus(): Promise<RiskManagementStatus> {
    try {
      const response = await api.get('/api/risk-management/status');
      return response.data.status;
    } catch (error) {
      console.error('Error fetching risk management status:', error);
      throw error;
    }
  },

  /**
   * Получить детальную статистику риск-менеджмента
   */
  async getRiskManagementStats(): Promise<any> {
    try {
      const response = await api.get('/api/risk-management/stats');
      return response.data.stats;
    } catch (error) {
      console.error('Error fetching risk management stats:', error);
      throw error;
    }
  },

  /**
   * Обновить лимиты риск-менеджмента
   */
  async updateRiskManagementLimits(limits: any): Promise<any> {
    try {
      const response = await api.post('/api/risk-management/limits', { limits });
      return response.data;
    } catch (error) {
      console.error('Error updating risk management limits:', error);
      throw error;
    }
  },

  /**
   * Сбросить экстренную остановку
   */
  async resetEmergencyStop(): Promise<any> {
    try {
      const response = await api.post('/api/risk-management/reset-emergency');
      return response.data;
    } catch (error) {
      console.error('Error resetting emergency stop:', error);
      throw error;
    }
  },

  // ============================================================================
  // ВАЛИДАЦИЯ ПЕРЕХОДОВ
  // ============================================================================

  /**
   * Проверить готовность к переходу к микро-капиталу
   */
  async checkMicroCapitalReadiness(): Promise<any> {
    try {
      const response = await api.get('/api/switch-validator/micro');
      return response.data.validation;
    } catch (error) {
      console.error('Error checking micro capital readiness:', error);
      throw error;
    }
  },

  /**
   * Проверить готовность к переходу к полной торговле
   */
  async checkFullTradingReadiness(): Promise<any> {
    try {
      const response = await api.get('/api/switch-validator/full');
      return response.data.validation;
    } catch (error) {
      console.error('Error checking full trading readiness:', error);
      throw error;
    }
  },

  /**
   * Получить историю валидаций
   */
  async getValidationHistory(): Promise<any[]> {
    try {
      const response = await api.get('/api/switch-validator/history');
      return response.data.history;
    } catch (error) {
      console.error('Error fetching validation history:', error);
      throw error;
    }
  },

  // ============================================================================
  // МИГРАЦИЯ ПОРТФЕЛЯ
  // ============================================================================

  /**
   * Создать план миграции портфеля
   */
  async createMigrationPlan(realCapital: number): Promise<MigrationPlan> {
    try {
      const response = await api.post('/api/portfolio-migrator/create-plan', { realCapital });
      return response.data.result;
    } catch (error) {
      console.error('Error creating migration plan:', error);
      throw error;
    }
  },

  /**
   * Выполнить миграцию портфеля
   */
  async executeMigration(migrationPlan: any[]): Promise<any> {
    try {
      const response = await api.post('/api/portfolio-migrator/execute', { migrationPlan });
      return response.data.result;
    } catch (error) {
      console.error('Error executing migration:', error);
      throw error;
    }
  },

  /**
   * Получить статус миграции
   */
  async getPortfolioMigratorStatus(): Promise<any> {
    try {
      const response = await api.get('/api/portfolio-migrator/status');
      return response.data.status;
    } catch (error) {
      console.error('Error fetching migration status:', error);
      throw error;
    }
  },

  /**
   * Получить историю миграций
   */
  async getMigrationHistory(limit: number = 50): Promise<any[]> {
    try {
      const response = await api.get(`/api/portfolio-migrator/history?limit=${limit}`);
      return response.data.history;
    } catch (error) {
      console.error('Error fetching migration history:', error);
      throw error;
    }
  },

  // ============================================================================
  // ПРЕДВАРИТЕЛЬНЫЕ ПРОВЕРКИ
  // ============================================================================

  /**
   * Выполнить предварительную проверку системы
   */
  async runPreflightCheck(): Promise<PreflightCheckResults> {
    try {
      const response = await api.post('/api/preflight-check/run');
      return response.data.results;
    } catch (error) {
      console.error('Error running preflight check:', error);
      throw error;
    }
  },

  /**
   * Получить статус предварительной проверки
   */
  async getPreflightStatus(): Promise<any> {
    try {
      const response = await api.get('/api/preflight-check/status');
      return response.data.status;
    } catch (error) {
      console.error('Error fetching preflight status:', error);
      throw error;
    }
  },

  /**
   * Получить детальные результаты проверки
   */
  async getPreflightResults(): Promise<any> {
    try {
      const response = await api.get('/api/preflight-check/results');
      return response.data.results;
    } catch (error) {
      console.error('Error fetching preflight results:', error);
      throw error;
    }
  },

  // ============================================================================
  // ИНТЕГРИРОВАННЫЕ AI СЕРВИСЫ
  // ============================================================================

  /**
   * Инициализировать интегрированный AI сервис
   */
  async initializeAI(): Promise<any> {
    try {
      const response = await api.post('/api/ai/initialize');
      return response.data.data;
    } catch (error) {
      console.error('Error initializing AI:', error);
      throw error;
    }
  },

  /**
   * Получить интегрированную рекомендацию
   */
  async getAIRecommendation(figi: string, portfolio?: any): Promise<any> {
    try {
      const response = await api.post('/api/ai/recommendation', { figi, portfolio });
      return response.data.data;
    } catch (error) {
      console.error('Error getting AI recommendation:', error);
      throw error;
    }
  },

  /**
   * Обучить все AI сети
   */
  async trainAllAI(figi: string, options: any = {}): Promise<any> {
    try {
      const response = await api.post('/api/ai/train', { figi, options });
      return response.data.data;
    } catch (error) {
      console.error('Error training all AI:', error);
      throw error;
    }
  },

  /**
   * Анализ одного инструмента с сохранением в рекомендации (для отладки)
   */
  async analyzeSingleInstrument(figi: string): Promise<any> {
    try {
      const response = await api.post('/api/ai/analyze-single-instrument', { figi });
      return response.data;
    } catch (error: any) {
      console.error('Error analyzing single instrument:', error);
      throw error;
    }
  },

  /**
   * Частичное обучение AI
   */
  async partialTrainAI(figi: string, options: any = {}): Promise<any> {
    try {
      const response = await api.post('/api/ai/partial-train', { figi, options });
      return response.data.data;
    } catch (error) {
      console.error('Error partial training AI:', error);
      throw error;
    }
  },

  /**
   * Получить статус AI
   */
  async getAIStatus(): Promise<any> {
    try {
      const response = await api.get('/api/ai/status');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching AI status:', error);
      throw error;
    }
  },

  /**
   * Загрузить все модели
   */
  async loadAllModels(): Promise<any> {
    try {
      const response = await api.post('/api/ai/load-models');
      return response.data;
    } catch (error) {
      console.error('Error loading all models:', error);
      throw error;
    }
  },

  /**
   * Сохранить все модели
   */
  async saveAllModels(): Promise<any> {
    try {
      const response = await api.post('/api/ai/save-models');
      return response.data;
    } catch (error) {
      console.error('Error saving all models:', error);
      throw error;
    }
  },

  // ============================================================================
  // МАСШТАБИРОВАНИЕ КАПИТАЛА (ЭТАП 3)
  // ============================================================================

  /**
   * Получить статус масштабирования капитала
   */
  async getCapitalScalingStatus(): Promise<CapitalScalingStatus> {
    try {
      const response = await api.get('/api/capital-scaling/status');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching capital scaling status:', error);
      throw error;
    }
  },

  /**
   * Анализ производительности
   */
  async analyzeCapitalPerformance(period: string = 'month', days: number = 30): Promise<any> {
    try {
      const response = await api.get(`/api/capital-scaling/performance?period=${period}&days=${days}`);
      return response.data.data;
    } catch (error) {
      console.error('Error analyzing capital performance:', error);
      throw error;
    }
  },

  /**
   * Проверить готовность к увеличению капитала
   */
  async checkCapitalIncreaseReadiness(): Promise<any> {
    try {
      const response = await api.get('/api/capital-scaling/can-increase');
      return response.data.data;
    } catch (error) {
      console.error('Error checking capital increase readiness:', error);
      throw error;
    }
  },

  /**
   * Увеличить капитал
   */
  async increaseCapital(amount: number, reason: string): Promise<any> {
    try {
      const response = await api.post('/api/capital-scaling/increase', { amount, reason });
      return response.data.data;
    } catch (error) {
      console.error('Error increasing capital:', error);
      throw error;
    }
  },

  // ============================================================================
  // АНАЛИЗ НОВОСТЕЙ
  // ============================================================================

  /**
   * Получить новости для инструмента
   */
  async getNews(figi: string, limit: number = 10, days: number = 7): Promise<NewsAnalysis> {
    try {
      const response = await api.get(`/api/news/${figi}?limit=${limit}&days=${days}`);
      return response.data.data;
    } catch (error) {
      console.error('Error fetching news:', error);
      throw error;
    }
  },

  /**
   * Запросить свежие новости для инструмента по FIGI
   */
  async fetchFreshNews(figi: string): Promise<any> {
    try {
      const response = await api.post(`/api/news/${figi}/fresh`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching fresh news:', error);
      throw error;
    }
  },

  /**
   * Анализ влияния новостей
   */
  async analyzeNewsImpact(figi: string, days: number = 30): Promise<any> {
    try {
      const response = await api.get(`/api/news/${figi}/impact?days=${days}`);
      return response.data.data;
    } catch (error) {
      console.error('Error analyzing news impact:', error);
      throw error;
    }
  },

  /**
   * Получить статус сервиса новостей
   */
  async getNewsStatus(): Promise<any> {
    try {
      const response = await api.get('/api/news/status');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching news status:', error);
      throw error;
    }
  },

  /**
   * Проверка статуса исторических новостей
   */
  async getHistoricalNewsStatus(): Promise<any> {
    try {
      const response = await api.get('/api/news/status/historical');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching historical news status:', error);
      throw error;
    }
  },

  /**
   * Получение даты последней новости для FIGI
   */
  async getLastNewsDate(figi?: string): Promise<any> {
    try {
      const url = figi ? `/api/news/last-date/${figi}` : '/api/news/last-date';
      const response = await api.get(url);
      return response.data.data;
    } catch (error) {
      console.error('Error fetching last news date:', error);
      throw error;
    }
  },

  /**
   * Получение списка доступных инструментов для тестирования
   */
  async getNewsInstruments(limit: number = 50, currency: string = 'RUB', instrumentType: string = 'share'): Promise<any> {
    try {
      const response = await api.get('/api/news/instruments', {
        params: { limit, currency, instrumentType }
      });
      return response.data;
    } catch (error) {
      console.error('Error getting news instruments:', error);
      throw error;
    }
  },

  /**
   * Тестовый запрос новостей через NewsAPI.org для одного тикера
   */
  async testNewsApiNews(ticker: string): Promise<any> {
    try {
      const response = await api.post('/api/news/test-newsapi', { ticker });
      return response.data;
    } catch (error) {
      console.error('Error testing NewsAPI news:', error);
      throw error;
    }
  },

  /**
   * Загрузка исторических новостей за год для всех акций
   */
  async loadHistoricalNews(year?: number): Promise<any> {
    try {
      const response = await api.post('/api/news/load-historical', {
        year: year || new Date().getFullYear()
      });
      return response.data;
    } catch (error) {
      console.error('Error loading historical news:', error);
      throw error;
    }
  },

  // ============================================================================
  // АНАЛИЗ TELEGRAM КАНАЛОВ
  // ============================================================================

  /**
   * Анализ настроений в Telegram каналах
   */
  async getTelegramSentiment(figi: string, days: number = 7, limit: number = 100): Promise<TelegramSentiment> {
    try {
      const response = await api.get(`/api/telegram/sentiment/${figi}?days=${days}&limit=${limit}`);
      return response.data.data;
    } catch (error) {
      console.error('Error fetching telegram sentiment:', error);
      throw error;
    }
  },

  /**
   * Добавить канал для мониторинга
   */
  async addTelegramChannel(channel: string): Promise<any> {
    try {
      const response = await api.post('/api/telegram/channels', { channel });
      return response.data;
    } catch (error) {
      console.error('Error adding telegram channel:', error);
      throw error;
    }
  },

  /**
   * Удалить канал
   */
  async removeTelegramChannel(channel: string): Promise<any> {
    try {
      const response = await api.delete(`/api/telegram/channels/${channel}`);
      return response.data;
    } catch (error) {
      console.error('Error removing telegram channel:', error);
      throw error;
    }
  },

  /**
   * Получить список каналов
   */
  async getTelegramChannels(): Promise<string[]> {
    try {
      const response = await api.get('/api/telegram/channels');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching telegram channels:', error);
      throw error;
    }
  },

  /**
   * Получить статус сервиса Telegram
   */
  async getTelegramStatus(): Promise<any> {
    try {
      const response = await api.get('/api/telegram/status');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching telegram status:', error);
      throw error;
    }
  },

  // ============================================================================
  // ОТСЛЕЖИВАНИЕ ПРИБЫЛЬНОСТИ
  // ============================================================================

  /**
   * Получить статус отслеживания прибыльности
   */
  async getProfitabilityStatus(): Promise<any> {
    try {
      const response = await api.get('/api/profitability/status');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching profitability status:', error);
      throw error;
    }
  },

  /**
   * Анализ прибыльности
   */
  async analyzeProfitability(period: string = 'month', days: number = 30): Promise<any> {
    try {
      const response = await api.get(`/api/profitability/analysis?period=${period}&days=${days}`);
      return response.data.data;
    } catch (error) {
      console.error('Error analyzing profitability:', error);
      throw error;
    }
  },

  /**
   * Генерация отчета о прибыльности
   */
  async generateProfitabilityReport(period: string = 'month', days: number = 30): Promise<any> {
    try {
      const response = await api.get(`/api/profitability/report?period=${period}&days=${days}`);
      return response.data.data;
    } catch (error) {
      console.error('Error generating profitability report:', error);
      throw error;
    }
  },

  // ============================================================================
  // МАСШТАБИРОВАНИЕ КАПИТАЛА (ДОПОЛНИТЕЛЬНЫЕ РОУТЫ)
  // ============================================================================

  /**
   * Уменьшить капитал
   */
  async decreaseCapital(amount: number, reason: string): Promise<any> {
    try {
      const response = await api.post('/api/capital-scaling/decrease', { amount, reason });
      return response.data.data;
    } catch (error) {
      console.error('Error decreasing capital:', error);
      throw error;
    }
  },

  /**
   * Автоматическая корректировка капитала
   */
  async autoAdjustCapital(): Promise<any> {
    try {
      const response = await api.post('/api/capital-scaling/auto-adjust');
      return response.data.data;
    } catch (error) {
      console.error('Error auto adjusting capital:', error);
      throw error;
    }
  },

  /**
   * Получить историю масштабирования капитала
   */
  async getCapitalScalingHistory(limit: number = 50): Promise<any[]> {
    try {
      const response = await api.get(`/api/capital-scaling/history?limit=${limit}`);
      return response.data.data;
    } catch (error) {
      console.error('Error fetching capital scaling history:', error);
      throw error;
    }
  },

  /**
   * Получить уровни капитала
   */
  async getCapitalLevels(): Promise<any> {
    try {
      const response = await api.get('/api/capital-scaling/levels');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching capital levels:', error);
      throw error;
    }
  },

  /**
   * Обновить уровни капитала
   */
  async updateCapitalLevels(levels: any): Promise<any> {
    try {
      const response = await api.post('/api/capital-scaling/levels', { levels });
      return response.data.data;
    } catch (error) {
      console.error('Error updating capital levels:', error);
      throw error;
    }
  },

  /**
   * Обновить настройки масштабирования капитала
   */
  async updateCapitalScalingSettings(settings: any): Promise<any> {
    try {
      const response = await api.post('/api/capital-scaling/settings', { settings });
      return response.data.data;
    } catch (error) {
      console.error('Error updating capital scaling settings:', error);
      throw error;
    }
  },

  // ============================================================================
  // КОРРЕКТИРОВКА РИСКОВ
  // ============================================================================

  /**
   * Получить статус корректировки рисков
   */
  async getRiskAdjustmentStatus(): Promise<any> {
    try {
      const response = await api.get('/api/risk-adjustment/status');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching risk adjustment status:', error);
      throw error;
    }
  },

  /**
   * Получить анализ корректировки рисков
   */
  async getRiskAdjustmentAnalysis(period: string = 'month', days: number = 30): Promise<any> {
    try {
      const response = await api.get(`/api/risk-adjustment/analysis?period=${period}&days=${days}`);
      return response.data.data;
    } catch (error) {
      console.error('Error fetching risk adjustment analysis:', error);
      throw error;
    }
  },

  /**
   * Автоматическая корректировка рисков
   */
  async autoAdjustRisk(): Promise<any> {
    try {
      const response = await api.post('/api/risk-adjustment/auto-adjust');
      return response.data.data;
    } catch (error) {
      console.error('Error auto adjusting risk:', error);
      throw error;
    }
  },

  /**
   * Получить историю корректировок рисков
   */
  async getRiskAdjustmentHistory(limit: number = 50): Promise<any[]> {
    try {
      const response = await api.get(`/api/risk-adjustment/history?limit=${limit}`);
      return response.data.data;
    } catch (error) {
      console.error('Error fetching risk adjustment history:', error);
      throw error;
    }
  },

  /**
   * Обновить настройки корректировки рисков
   */
  async updateRiskAdjustmentSettings(settings: any): Promise<any> {
    try {
      const response = await api.post('/api/risk-adjustment/settings', { settings });
      return response.data.data;
    } catch (error) {
      console.error('Error updating risk adjustment settings:', error);
      throw error;
    }
  },

  // ============================================================================
  // АНАЛИЗАТОР ПРОИЗВОДИТЕЛЬНОСТИ
  // ============================================================================

  /**
   * Получить статус анализатора производительности
   */
  async getPerformanceAnalyzerStatus(): Promise<any> {
    try {
      const response = await api.get('/api/performance-analyzer/status');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching performance analyzer status:', error);
      throw error;
    }
  },

  /**
   * Получить анализ производительности
   */
  async getPerformanceAnalysis(period: string = 'month', days: number = 30): Promise<any> {
    try {
      const response = await api.get(`/api/performance-analyzer/analysis?period=${period}&days=${days}`);
      return response.data.data;
    } catch (error) {
      console.error('Error fetching performance analysis:', error);
      throw error;
    }
  },

  /**
   * Получить отчет производительности
   */
  async getPerformanceReport(period: string = 'month', days: number = 30): Promise<any> {
    try {
      const response = await api.get(`/api/performance-analyzer/report?period=${period}&days=${days}`);
      return response.data.data;
    } catch (error) {
      console.error('Error fetching performance report:', error);
      throw error;
    }
  },

  /**
   * Очистить кеш анализатора производительности
   */
  async clearPerformanceAnalyzerCache(): Promise<any> {
    try {
      const response = await api.post('/api/performance-analyzer/clear-cache');
      return response.data.data;
    } catch (error) {
      console.error('Error clearing performance analyzer cache:', error);
      throw error;
    }
  },

  // ============================================================================
  // РАСПРЕДЕЛЕНИЕ КАПИТАЛА
  // ============================================================================

  /**
   * Получить статус распределения капитала
   */
  async getCapitalAllocationStatus(): Promise<any> {
    try {
      const response = await api.get('/api/capital-allocation/status');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching capital allocation status:', error);
      throw error;
    }
  },

  /**
   * Получить анализ портфеля для распределения
   */
  async getCapitalAllocationPortfolioAnalysis(): Promise<any> {
    try {
      const response = await api.get('/api/capital-allocation/portfolio-analysis');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching capital allocation portfolio analysis:', error);
      throw error;
    }
  },

  /**
   * Оптимизировать распределение капитала
   */
  async optimizeCapitalAllocation(strategy: string = 'balanced', options: any = {}): Promise<any> {
    try {
      const response = await api.post('/api/capital-allocation/optimize', { strategy, options });
      return response.data.data;
    } catch (error) {
      console.error('Error optimizing capital allocation:', error);
      throw error;
    }
  },

  /**
   * Автоматическая ребалансировка портфеля
   */
  async autoRebalancePortfolio(strategy: string = 'balanced', options: any = {}): Promise<any> {
    try {
      const response = await api.post('/api/capital-allocation/auto-rebalance', { strategy, options });
      return response.data.data;
    } catch (error) {
      console.error('Error auto rebalancing portfolio:', error);
      throw error;
    }
  },

  /**
   * Получить доступные инструменты для распределения
   */
  async getCapitalAllocationInstruments(): Promise<any[]> {
    try {
      const response = await api.get('/api/capital-allocation/instruments');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching capital allocation instruments:', error);
      throw error;
    }
  },

  /**
   * Получить историю ребалансировки
   */
  async getCapitalAllocationHistory(limit: number = 50): Promise<any[]> {
    try {
      const response = await api.get(`/api/capital-allocation/history?limit=${limit}`);
      return response.data.data;
    } catch (error) {
      console.error('Error fetching capital allocation history:', error);
      throw error;
    }
  },

  /**
   * Обновить настройки распределения капитала
   */
  async updateCapitalAllocationSettings(settings: any): Promise<any> {
    try {
      const response = await api.post('/api/capital-allocation/settings', { settings });
      return response.data.data;
    } catch (error) {
      console.error('Error updating capital allocation settings:', error);
      throw error;
    }
  },

  // ============================================================================
  // ВАЛИДАЦИЯ ЭТАПА 3
  // ============================================================================

  /**
   * Получить статус валидации Этапа 3
   */
  async getStage3ValidatorStatus(): Promise<any> {
    try {
      const response = await api.get('/api/stage3-validator/status');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching stage3 validator status:', error);
      throw error;
    }
  },

  /**
   * Выполнить валидацию Этапа 3
   */
  async validateStage3(): Promise<any> {
    try {
      const response = await api.post('/api/stage3-validator/validate');
      return response.data.data;
    } catch (error) {
      console.error('Error validating stage3:', error);
      throw error;
    }
  },

  /**
   * Получить историю валидации Этапа 3
   */
  async getStage3ValidatorHistory(limit: number = 50): Promise<any[]> {
    try {
      const response = await api.get(`/api/stage3-validator/history?limit=${limit}`);
      return response.data.data;
    } catch (error) {
      console.error('Error fetching stage3 validator history:', error);
      throw error;
    }
  },

  // ============================================================================
  // АНСАМБЛЬ (ДОПОЛНИТЕЛЬНЫЕ РОУТЫ)
  // ============================================================================

  /**
   * Инициализировать ансамбль
   */
  async initializeEnsemble(): Promise<any> {
    try {
      const response = await api.post('/api/ensemble/initialize');
      return response.data.data;
    } catch (error) {
      console.error('Error initializing ensemble:', error);
      throw error;
    }
  },

  /**
   * Обучить ансамбль
   */
  async trainEnsemble(figi: string, options: any = {}): Promise<any> {
    try {
      const response = await api.post('/api/ensemble/train', { figi, options });
      return response.data.data;
    } catch (error) {
      console.error('Error training ensemble:', error);
      throw error;
    }
  },

  /**
   * Получить предсказание ансамбля
   */
  async getEnsemblePrediction(figi: string, portfolio?: any): Promise<any> {
    try {
      // Используем интегрированный ИИ, который внутри опирается на EnsembleService и другие модели
      const response = await api.post('/api/ai/recommendation', { figi, context: { portfolio } });
      return response.data.data;
    } catch (error) {
      console.error('Error getting ensemble prediction:', error);
      throw error;
    }
  },

  // ============================================================================
  // МЕТА-ОБУЧЕНИЕ
  // ============================================================================

  /**
   * Инициализировать мета-обучение
   */
  async initializeMetaLearning(): Promise<any> {
    try {
      const response = await api.post('/api/meta-learning/initialize');
      return response.data.data;
    } catch (error) {
      console.error('Error initializing meta learning:', error);
      throw error;
    }
  },

  /**
   * Адаптировать модель мета-обучения
   */
  async adaptMetaLearning(figi: string, options: any = {}): Promise<any> {
    try {
      const response = await api.post('/api/meta-learning/adapt', { figi, options });
      return response.data.data;
    } catch (error) {
      console.error('Error adapting meta learning:', error);
      throw error;
    }
  },

  /**
   * Найти похожие задачи для мета-обучения
   */
  async findSimilarMetaLearningTasks(figi: string, options: any = {}): Promise<any> {
    try {
      const response = await api.post('/api/meta-learning/find-similar', { figi, options });
      return response.data.data;
    } catch (error) {
      console.error('Error finding similar meta learning tasks:', error);
      throw error;
    }
  },

  /**
   * Получить статистику мета-обучения
   */
  async getMetaLearningStats(): Promise<any> {
    try {
      const response = await api.get('/api/meta-learning/stats');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching meta learning stats:', error);
      throw error;
    }
  },

  /**
   * Получить статус мета-обучения
   */
  async getMetaLearningStatus(): Promise<any> {
    try {
      const response = await api.get('/api/meta-learning/stats');
      return response.data;
    } catch (error) {
      console.error('Error fetching meta-learning status:', error);
      throw error;
    }
  },

  /**
   * Получить историю мета-обучения
   */
  async getMetaLearningHistory(): Promise<any> {
    try {
      const response = await api.get('/api/meta-learning/stats');
      return response.data;
    } catch (error) {
      console.error('Error fetching meta-learning history:', error);
      throw error;
    }
  },

  /**
   * Запустить адаптацию мета-обучения
   */
  async startMetaLearningAdaptation(): Promise<any> {
    try {
      const response = await api.post('/api/meta-learning/adapt');
      return response.data;
    } catch (error) {
      console.error('Error starting meta-learning adaptation:', error);
      throw error;
    }
  },

  /**
   * Остановить адаптацию мета-обучения
   */
  async stopMetaLearningAdaptation(): Promise<any> {
    try {
      const response = await api.post('/api/meta-learning/stop');
      return response.data;
    } catch (error) {
      console.error('Error stopping meta-learning adaptation:', error);
      throw error;
    }
  },

  // ============================================================================
  // ОБУЧЕНИЕ С ПОДКРЕПЛЕНИЕМ
  // ============================================================================

  /**
   * Инициализировать обучение с подкреплением
   */
  async initializeReinforcementLearning(): Promise<any> {
    try {
      const response = await api.post('/api/reinforcement-learning/initialize');
      return response.data.data;
    } catch (error) {
      console.error('Error initializing reinforcement learning:', error);
      throw error;
    }
  },

  /**
   * Обучить модель с подкреплением
   */
  async trainReinforcementLearning(figi: string, options: any = {}): Promise<any> {
    try {
      const response = await api.post('/api/training/reinforcement-learning/train', { figi, options });
      return response.data.data;
    } catch (error) {
      console.error('Error training reinforcement learning:', error);
      throw error;
    }
  },

  /**
   * Обучить Meta-Learning модель
   */
  async trainMetaLearning(figi: string, options: any = {}): Promise<any> {
    try {
      const response = await api.post('/api/training/meta-learning/train', { figi, options });
      return response.data.data;
    } catch (error) {
      console.error('Error training meta learning:', error);
      throw error;
    }
  },

  /**
   * Получить рекомендацию от обучения с подкреплением
   */
  async getReinforcementLearningRecommendation(figi: string, portfolio?: any): Promise<any> {
    try {
      const response = await api.post('/api/reinforcement-learning/recommendation', { figi, portfolio });
      return response.data.data;
    } catch (error) {
      console.error('Error getting reinforcement learning recommendation:', error);
      throw error;
    }
  },

  /**
   * Получить статистику обучения с подкреплением
   */
  async getReinforcementLearningStats(): Promise<any> {
    try {
      const response = await api.get('/api/reinforcement-learning/stats');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching reinforcement learning stats:', error);
      throw error;
    }
  },

  /**
   * Получить статус RL
   */
  async getRLStatus(): Promise<any> {
    try {
      const response = await api.get('/api/reinforcement-learning/stats');
      return response.data;
    } catch (error) {
      console.error('Error fetching RL status:', error);
      throw error;
    }
  },

  /**
   * Получить историю RL
   */
  async getRLHistory(): Promise<any> {
    try {
      const response = await api.get('/api/reinforcement-learning/stats');
      return response.data;
    } catch (error) {
      console.error('Error fetching RL history:', error);
      throw error;
    }
  },

  /**
   * Запустить обучение RL
   */
  async startRLTraining(): Promise<any> {
    try {
      const response = await api.post('/api/training/reinforcement-learning/train');
      return response.data;
    } catch (error) {
      console.error('Error starting RL training:', error);
      throw error;
    }
  },

  /**
   * Остановить обучение RL
   */
  async stopRLTraining(): Promise<any> {
    try {
      const response = await api.post('/api/reinforcement-learning/stop');
      return response.data;
    } catch (error) {
      console.error('Error stopping RL training:', error);
      throw error;
    }
  },

  /**
   * Сбросить агента RL
   */
  async resetRLAgent(): Promise<any> {
    try {
      const response = await api.post('/api/reinforcement-learning/reset');
      return response.data;
    } catch (error) {
      console.error('Error resetting RL agent:', error);
      throw error;
    }
  },

  // ============================================================================
  // КЕШИРОВАНИЕ УВЕДОМЛЕНИЙ
  // ============================================================================

  /**
   * Кешировать новости
   */
  async cacheNews(figi: string, options: any = {}): Promise<any> {
    try {
      const response = await api.post('/api/notifications/cache/news', { figi, options });
      return response.data.data;
    } catch (error) {
      console.error('Error caching news:', error);
      throw error;
    }
  },

  /**
   * Кешировать данные Telegram
   */
  async cacheTelegram(figi: string, options: any = {}): Promise<any> {
    try {
      const response = await api.post('/api/notifications/cache/telegram', { figi, options });
      return response.data.data;
    } catch (error) {
      console.error('Error caching telegram:', error);
      throw error;
    }
  },

  /**
   * Получить статус кеша новостей
   */
  async getNewsCacheStatus(): Promise<any> {
    try {
      const response = await api.get('/api/notifications/cache/news/status');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching news cache status:', error);
      throw error;
    }
  },

  /**
   * Получить статус кеша Telegram
   */
  async getTelegramCacheStatus(): Promise<any> {
    try {
      const response = await api.get('/api/notifications/cache/telegram/status');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching telegram cache status:', error);
      throw error;
    }
  },

  /**
   * Очистить кеш новостей
   */
  async cleanupNewsCache(): Promise<any> {
    try {
      const response = await api.post('/api/notifications/cache/news/cleanup');
      return response.data.data;
    } catch (error) {
      console.error('Error cleaning up news cache:', error);
      throw error;
    }
  },

  /**
   * Очистить кеш Telegram
   */
  async cleanupTelegramCache(): Promise<any> {
    try {
      const response = await api.post('/api/notifications/cache/telegram/cleanup');
      return response.data.data;
    } catch (error) {
      console.error('Error cleaning up telegram cache:', error);
      throw error;
    }
  },

  // ============================================================================
  // МИГРАЦИЯ ПОРТФЕЛЯ (ДОПОЛНИТЕЛЬНЫЕ РОУТЫ)
  // ============================================================================

  /**
   * Получить активные миграции
   */
  async getActiveMigrations(): Promise<any[]> {
    try {
      const response = await api.get('/api/portfolio-migrator/active');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching active migrations:', error);
      throw error;
    }
  },

  /**
   * Очистить старые миграции
   */
  async cleanupMigrations(daysOld: number = 30): Promise<any> {
    try {
      const response = await api.post('/api/portfolio-migrator/cleanup', { daysOld });
      return response.data.data;
    } catch (error) {
      console.error('Error cleaning up migrations:', error);
      throw error;
    }
  },

  /**
   * Остановить миграцию
   */
  async stopMigration(migrationId: string): Promise<any> {
    try {
      const response = await api.post('/api/portfolio-migrator/stop', { migrationId });
      return response.data.data;
    } catch (error) {
      console.error('Error stopping migration:', error);
      throw error;
    }
  },

  /**
   * Получить настройки миграции
   */
  async getMigrationSettings(): Promise<any> {
    try {
      const response = await api.get('/api/portfolio-migrator/settings');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching migration settings:', error);
      throw error;
    }
  },

  /**
   * Обновить настройки миграции
   */
  async updateMigrationSettings(settings: any): Promise<any> {
    try {
      const response = await api.post('/api/portfolio-migrator/settings', { settings });
      return response.data.data;
    } catch (error) {
      console.error('Error updating migration settings:', error);
      throw error;
    }
  },

  // ============================================================================
  // TELEGRAM (ДОПОЛНИТЕЛЬНЫЕ РОУТЫ)
  // ============================================================================

  /**
   * Проверить канал Telegram
   */
  async checkTelegramChannel(channel: string): Promise<any> {
    try {
      const response = await api.get(`/api/telegram/channels/${channel}/check`);
      return response.data.data;
    } catch (error) {
      console.error('Error checking telegram channel:', error);
      throw error;
    }
  },

  // ============================================================================
  // ТОРГОВЫЕ ЗАЯВКИ (TRADING REQUESTS)
  // ============================================================================

  /**
   * Получить список торговых заявок
   */
  async getTradingRequests(status?: string, limit?: number, tradingMode?: string): Promise<any> {
    try {
      const params = new URLSearchParams();
      if (status) params.append('status', status);
      if (limit) params.append('limit', limit.toString());
      if (tradingMode) params.append('tradingMode', tradingMode);
      
      const response = await api.get(`/api/trading-requests?${params.toString()}`);
      return response.data.data;
    } catch (error) {
      console.error('Error getting trading requests:', error);
      throw error;
    }
  },

  /**
   * Получить ожидающие заявки
   */
  async getPendingTradingRequests(tradingMode?: string): Promise<any> {
    try {
      const params = new URLSearchParams();
      if (tradingMode) params.append('tradingMode', tradingMode);
      
      const response = await api.get(`/api/trading-requests/pending?${params.toString()}`);
      return response.data.data;
    } catch (error) {
      console.error('Error getting pending trading requests:', error);
      throw error;
    }
  },

  /**
   * Получить одобренные заявки
   */
  async getApprovedTradingRequests(tradingMode?: string): Promise<any> {
    try {
      const params = new URLSearchParams();
      if (tradingMode) params.append('tradingMode', tradingMode);
      
      const response = await api.get(`/api/trading-requests/approved?${params.toString()}`);
      return response.data.data;
    } catch (error) {
      console.error('Error getting approved trading requests:', error);
      throw error;
    }
  },

  /**
   * Создать торговую заявку из рекомендации
   */
  async createTradingRequest(recommendationFigi: string, options?: any, recommendationData?: any): Promise<any> {
    try {
      const response = await api.post('/api/trading-requests/create', {
        recommendationFigi,
        recommendationData, // Передаем полные данные рекомендации как fallback
        options
      });
      return response.data.data;
    } catch (error) {
      console.error('Error creating trading request:', error);
      throw error;
    }
  },

  /**
   * Массовое создание торговых заявок
   */
  async createBulkTradingRequests(recommendationFigis: string[], options?: any): Promise<any> {
    try {
      const response = await api.post('/api/trading-requests/create-bulk', {
        recommendationFigis,
        options
      });
      return response.data.data;
    } catch (error) {
      console.error('Error creating bulk trading requests:', error);
      throw error;
    }
  },

  /**
   * Подтвердить торговую заявку
   */
  async approveTradingRequest(requestId: string, comment?: string): Promise<any> {
    try {
      const response = await api.post(`/api/trading-requests/${requestId}/approve`, {
        comment
      });
      return response.data.data;
    } catch (error) {
      console.error('Error approving trading request:', error);
      throw error;
    }
  },

  /**
   * Отклонить торговую заявку
   */
  async rejectTradingRequest(requestId: string, reason: string): Promise<any> {
    try {
      const response = await api.post(`/api/trading-requests/${requestId}/reject`, {
        reason
      });
      return response.data.data;
    } catch (error) {
      console.error('Error rejecting trading request:', error);
      throw error;
    }
  },

  /**
   * Исполнить торговую заявку
   */
  async executeTradingRequest(requestId: string): Promise<any> {
    try {
      const response = await api.post(`/api/trading-requests/${requestId}/execute`);
      return response.data.data;
    } catch (error) {
      console.error('Error executing trading request:', error);
      throw error;
    }
  },

  /**
   * Отменить торговую заявку
   */
  async cancelTradingRequest(requestId: string, reason?: string): Promise<any> {
    try {
      const response = await api.post(`/api/trading-requests/${requestId}/cancel`, {
        reason
      });
      return response.data.data;
    } catch (error) {
      console.error('Error cancelling trading request:', error);
      throw error;
    }
  },

  /**
   * Массовое подтверждение заявок
   */
  async bulkApproveTradingRequests(requestIds: string[], comment?: string): Promise<any> {
    try {
      const response = await api.post('/api/trading-requests/bulk-approve', {
        requestIds,
        comment
      });
      return response.data.data;
    } catch (error) {
      console.error('Error bulk approving trading requests:', error);
      throw error;
    }
  },

  /**
   * Массовое отклонение заявок
   */
  async bulkRejectTradingRequests(requestIds: string[], reason: string): Promise<any> {
    try {
      const response = await api.post('/api/trading-requests/bulk-reject', {
        requestIds,
        reason
      });
      return response.data.data;
    } catch (error) {
      console.error('Error bulk rejecting trading requests:', error);
      throw error;
    }
  },

  /**
   * Получить статистику торговых заявок
   */
  async getTradingRequestStats(tradingMode?: string): Promise<any> {
    try {
      const params = new URLSearchParams();
      if (tradingMode) params.append('tradingMode', tradingMode);
      
      const response = await api.get(`/api/trading-requests/stats?${params.toString()}`);
      return response.data.data;
    } catch (error) {
      console.error('Error getting trading request stats:', error);
      throw error;
    }
  },

  /**
   * Получить статистику по всем режимам торговли
   */
  async getTradingRequestStatsByMode(): Promise<any> {
    try {
      const response = await api.get('/api/trading-requests/stats-by-mode');
      return response.data.data;
    } catch (error) {
      console.error('Error getting trading request stats by mode:', error);
      throw error;
    }
  },

  /**
   * Очистка завершенных заявок (одобренных и отклоненных)
   */
  async cleanupCompletedRequests(options?: { olderThanDays?: number; tradingMode?: string }): Promise<any> {
    try {
      const params = new URLSearchParams();
      if (options?.olderThanDays) params.append('olderThanDays', options.olderThanDays.toString());
      if (options?.tradingMode) params.append('tradingMode', options.tradingMode);
      
      const response = await api.delete(`/api/trading-requests/cleanup?${params.toString()}`);
      return response.data;
    } catch (error) {
      console.error('Error cleaning up completed requests:', error);
      throw error;
    }
  },

  /**
   * Получить статистику завершенных заявок (перед очисткой)
   */
  async getCompletedRequestsStats(tradingMode?: string): Promise<any> {
    try {
      const params = new URLSearchParams();
      if (tradingMode) params.append('tradingMode', tradingMode);
      
      const response = await api.get(`/api/trading-requests/cleanup/stats?${params.toString()}`);
      return response.data.data;
    } catch (error) {
      console.error('Error getting completed requests stats:', error);
      throw error;
    }
  },

  // ============================================================================
  // РЕКОМЕНДАЦИИ (RECOMMENDATIONS)
  // ============================================================================

  /**
   * Получить все рекомендации
   */
  async getAllRecommendations(): Promise<any> {
    try {
      // Используем /api/recommendations (из БД) вместо /api/market/recommendations (из кеша)
      const response = await api.get('/api/recommendations');
      return response.data.data;
    } catch (error) {
      console.error('Error getting all recommendations:', error);
      throw error;
    }
  },

  // ============================================================================
  // СТРАТЕГИИ ТОРГОВЛИ
  // ============================================================================

  /**
   * Получить все стратегии с распределением бюджета
   */
  async getAllStrategies(): Promise<any> {
    try {
      const response = await api.get('/api/strategies');
      return response.data.data || response.data;
    } catch (error) {
      console.error('Error fetching strategies:', error);
      throw error;
    }
  },

  /**
   * Получить детали стратегии
   */
  async getStrategy(id: number): Promise<any> {
    try {
      const response = await api.get(`/api/strategies/${id}`);
      return response.data.data || response.data;
    } catch (error) {
      console.error('Error fetching strategy:', error);
      throw error;
    }
  },

  /**
   * Обновить стратегию
   */
  async updateStrategy(id: number, data: any): Promise<any> {
    try {
      const response = await api.put(`/api/strategies/${id}`, data);
      return response.data.data || response.data;
    } catch (error) {
      console.error('Error updating strategy:', error);
      throw error;
    }
  },

  /**
   * Перебалансировать стратегии
   */
  async rebalanceStrategies(allocations: Record<number, number>): Promise<any> {
    try {
      const response = await api.post('/api/strategies/rebalance', { allocations });
      return response.data.data || response.data;
    } catch (error) {
      console.error('Error rebalancing strategies:', error);
      throw error;
    }
  },

  /**
   * Получить распределение бюджета
   */
  async getStrategyAllocations(): Promise<any> {
    try {
      const response = await api.get('/api/strategies/allocations/summary');
      // Endpoint возвращает { success: true, data: { strategies: [...], totalAllocated, ... } }
      // Возвращаем весь объект data, чтобы фронтенд мог получить и strategies, и summary данные
      return response.data.data || response.data;
    } catch (error) {
      console.error('Error fetching strategy allocations:', error);
      // Возвращаем пустой объект вместо throw, чтобы не ломать загрузку портфеля
      return { strategies: [], totalAllocated: 0, totalUsed: 0, totalAvailable: 0 };
    }
  },

  /**
   * Получить статистику по стратегии
   */
  async getStrategyStats(id: number): Promise<any> {
    try {
      const response = await api.get(`/api/strategies/${id}/stats`);
      return response.data.data || response.data;
    } catch (error) {
      console.error('Error fetching strategy stats:', error);
      throw error;
    }
  },

  /**
   * Получить статистику по всем стратегиям
   */
  async getAllStrategyStats(): Promise<any> {
    try {
      const response = await api.get('/api/strategies/stats/all');
      return response.data.data || response.data;
    } catch (error) {
      console.error('Error fetching all strategy stats:', error);
      throw error;
    }
  },

  /**
   * Получить доступный бюджет стратегии
   */
  async getStrategyAvailableBudget(id: number): Promise<any> {
    try {
      const response = await api.get(`/api/strategies/${id}/available-budget`);
      return response.data.data || response.data;
    } catch (error) {
      console.error('Error fetching strategy available budget:', error);
      throw error;
    }
  },

  /**
   * Получить рекомендации по типу
   */
  async getRecommendationsByType(type: string): Promise<any> {
    try {
      const response = await api.get(`/api/recommendations/type/${type}`);
      return response.data.data;
    } catch (error) {
      console.error('Error getting recommendations by type:', error);
      throw error;
    }
  },

  /**
   * Получить топ рекомендации
   */
  async getTopRecommendations(limit: number = 10): Promise<any> {
    try {
      const response = await api.get(`/api/recommendations/top?limit=${limit}`);
      return response.data.data;
    } catch (error) {
      console.error('Error getting top recommendations:', error);
      throw error;
    }
  },

  /**
   * Получить недавние рекомендации
   */
  async getRecentRecommendations(limit: number = 20): Promise<any> {
    try {
      const response = await api.get(`/api/recommendations/recent?limit=${limit}`);
      return response.data.data;
    } catch (error) {
      console.error('Error getting recent recommendations:', error);
      throw error;
    }
  },

  // ========================================
  // TRADING MODE DASHBOARD API METHODS
  // ========================================

  /**
   * Получить историю переходов между режимами торговли
   */
  async getTradingModeHistory(): Promise<any[]> {
    try {
      const response = await api.get('/api/trading-mode/history');
      return response.data;
    } catch (error) {
      console.error('Error fetching trading mode history:', error);
      throw error;
    }
  },

  /**
   * Получить настройки режима торговли
   */
  async getTradingModeSettings(): Promise<any> {
    try {
      const response = await api.get('/api/trading-mode/settings');
      return response.data;
    } catch (error) {
      console.error('Error fetching trading mode settings:', error);
      throw error;
    }
  },

  /**
   * Обновить настройки режима торговли
   */
  async updateTradingModeSettings(settings: any): Promise<any> {
    try {
      const response = await api.put('/api/trading-mode/settings', settings);
      return response.data;
    } catch (error) {
      console.error('Error updating trading mode settings:', error);
      throw error;
    }
  },

  /**
   * Получить результаты валидации для переходов между режимами
   */
  async getTradingModeValidation(): Promise<any> {
    try {
      const response = await api.get('/api/trading-mode/validation');
      return response.data;
    } catch (error) {
      console.error('Error fetching trading mode validation:', error);
      throw error;
    }
  },

  /**
   * Получить данные производительности по режимам торговли
   */
  async getTradingModePerformance(): Promise<any> {
    try {
      const response = await api.get('/api/trading-mode/performance');
      return response.data;
    } catch (error) {
      console.error('Error fetching trading mode performance:', error);
      throw error;
    }
  },

  /**
   * Запустить миграцию портфеля между режимами
   */
  async startPortfolioMigration(fromMode: string, toMode: string, options: any = {}): Promise<any> {
    try {
      const response = await api.post('/api/trading-mode/migrate', { fromMode, toMode, options });
      return response.data;
    } catch (error) {
      console.error('Error starting portfolio migration:', error);
      throw error;
    }
  },

  /**
   * Получить статус миграции портфеля
   */
  async getMigrationStatus(): Promise<any> {
    try {
      const response = await api.get('/api/trading-mode/migration-status');
      return response.data;
    } catch (error) {
      console.error('Error fetching migration status:', error);
      throw error;
    }
  },

  // ========================================
  // PORTFOLIO VISUALIZATION API METHODS
  // ========================================

  /**
   * Получить позиции портфеля
   */
  async getPortfolioPositions(): Promise<any> {
    try {
      const response = await api.get('/api/portfolio/positions');
      return response.data;
    } catch (error) {
      console.error('Error fetching portfolio positions:', error);
      throw error;
    }
  },

  /**
   * Получить детальную информацию о позиции
   */
  async getPositionDetails(figi: string): Promise<any> {
    try {
      const response = await api.get(`/api/portfolio/positions/${figi}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching position details:', error);
      throw error;
    }
  },

  /**
   * Получить историю портфеля
   */
  async getPortfolioHistory(period: string = '1M'): Promise<any> {
    try {
      const response = await api.get(`/api/portfolio/history?period=${period}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching portfolio history:', error);
      throw error;
    }
  },

  /**
   * Получить аналитику портфеля
   */
  async getPortfolioAnalytics(): Promise<any> {
    try {
      const response = await api.get('/api/portfolio/analytics');
      return response.data;
    } catch (error) {
      console.error('Error fetching portfolio analytics:', error);
      throw error;
    }
  },

  /**
   * Получить распределение портфеля по секторам
   */
  async getPortfolioSectorAllocation(): Promise<any> {
    try {
      const response = await api.get('/api/portfolio/sector-allocation');
      return response.data;
    } catch (error) {
      console.error('Error fetching sector allocation:', error);
      throw error;
    }
  },

  /**
   * Получить риск-метрики портфеля
   */
  async getPortfolioRiskMetrics(): Promise<any> {
    try {
      const response = await api.get('/api/portfolio/risk-metrics');
      return response.data;
    } catch (error) {
      console.error('Error fetching portfolio risk metrics:', error);
      throw error;
    }
  },

  /**
   * Анализ портфеля с рекомендациями по продаже/удержанию
   */
  async analyzePortfolio(): Promise<any> {
    try {
      const response = await api.post('/api/neural-network/analyze-portfolio');
      return response.data;
    } catch (error: any) {
      console.error('Error analyzing portfolio:', error);
      throw error;
    }
  },

  /**
   * Анализ только позиций портфеля (без сканирования рынка), сразу с результатом
   */
  async analyzePortfolioPositionsOnly(portfolioType: 'real' | 'virtual' | 'paper' = 'virtual'): Promise<any> {
    try {
      const response = await api.post('/api/neural-network/analyze-portfolio/positions-only', { portfolioType });
      return response.data;
    } catch (error: any) {
      console.error('Error analyzing portfolio positions only:', error);
      throw error;
    }
  },

  // ============================================================================
  // ДЕТАЛЬНАЯ ИНФОРМАЦИЯ ОБ АКЦИИ
  // ============================================================================

  /**
   * Получить детальную информацию об акции
   */
  async getStockDetail(figi: string): Promise<any> {
    try {
      const response = await api.get(`/api/market/stock/${figi}`);
      return response.data.data;
    } catch (error: any) {
      console.error('Error getting stock detail:', error);
      throw error;
    }
  },

  /**
   * Получить свечи для акции
   */
  async getStockCandles(figi: string, days: number = 365, interval: string = 'DAY'): Promise<any[]> {
    try {
      const response = await api.get(`/api/market/stock/${figi}/candles`, {
        params: { days, interval }
      });
      return response.data.data || [];
    } catch (error: any) {
      console.error('Error getting stock candles:', error);
      throw error;
    }
  },

  /**
   * Получить историю предсказаний для акции
   */
  /**
   * Получить последнюю рекомендацию из БД (если свежая, меньше maxAgeHours)
   */
  async getLatestStockRecommendation(figi: string, maxAgeHours: number = 1): Promise<any> {
    try {
      const response = await api.get(`/api/market/stock/${figi}/latest-recommendation`, {
        params: { maxAgeHours }
      });
      return response.data;
    } catch (error: any) {
      console.error('Error getting latest stock recommendation:', error);
      throw error;
    }
  },

  async getStockPredictionHistory(figi: string): Promise<any[]> {
    try {
      const response = await api.get(`/api/market/stock/${figi}/predictions`);
      return response.data.data || [];
    } catch (error: any) {
      console.error('Error getting stock prediction history:', error);
      throw error;
    }
  },

  /**
   * Получить все торговые сигналы из БД
   */
  async getAllSignals(limit: number = 50, activeOnly: boolean = false, direction?: string): Promise<any> {
    try {
      const params = new URLSearchParams();
      if (limit) params.append('limit', limit.toString());
      if (activeOnly) params.append('activeOnly', 'true');
      if (direction) params.append('direction', direction);
      
      const response = await api.get(`/api/market/signals?${params.toString()}`);
      return response.data;
    } catch (error: any) {
      console.error('Error getting all signals:', error);
      throw error;
    }
  },

  /**
   * Получить торговые сигналы для инструмента из БД
   */
  async getStockSignals(figi: string, limit: number = 20, activeOnly: boolean = false): Promise<any> {
    try {
      const params = new URLSearchParams();
      if (limit) params.append('limit', limit.toString());
      if (activeOnly) params.append('activeOnly', 'true');
      
      const response = await api.get(`/api/market/stock/${figi}/signals?${params.toString()}`);
      return response.data;
    } catch (error: any) {
      console.error('Error getting stock signals:', error);
      throw error;
    }
  },

  /**
   * Запрос и кеширование торговых сигналов для инструмента
   */
  async fetchAndCacheSignals(figi: string): Promise<any> {
    try {
      const response = await api.post(`/api/market/stock/${figi}/signals/fetch`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching and caching signals:', error);
      throw error;
    }
  }
};

export default apiService;
