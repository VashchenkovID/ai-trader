import axios from 'axios';

const API_BASE_URL = (window as any).env?.REACT_APP_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

export const apiService = {
  async getSystemStatus() {
    try {
      const response = await api.get('/api/system/status');
      return response.data;
    } catch (error) {
      console.error('Error fetching system status:', error);
      return {
        neuralNetwork: 'Unknown',
        websocket: 'Unknown',
        telegram: 'Unknown',
        scheduler: 'Unknown'
      };
    }
  },

  async getNeuralNetworkStatus() {
    try {
      const response = await api.get('/api/neural-network/status');
      return response.data;
    } catch (error) {
      console.error('Error fetching neural network status:', error);
      return null;
    }
  },

  async getPerformanceMetrics() {
    try {
      const response = await api.get('/api/performance-monitoring/metrics');
      return response.data;
    } catch (error) {
      console.error('Error fetching performance metrics:', error);
      return { metrics: [] };
    }
  },

  // Neural Network Management APIs
  async trainNeuralNetwork(figi: string, options: any = {}) {
    try {
      const response = await api.post('/api/neural-network/train', { figi, options });
      return response.data;
    } catch (error) {
      console.error('Error training neural network:', error);
      throw error;
    }
  },

  async trainBatchNeuralNetworks(instruments: string[], options: any = {}) {
    try {
      const response = await api.post('/api/neural-network/train-batch', { instruments, options });
      return response.data;
    } catch (error) {
      console.error('Error batch training neural networks:', error);
      throw error;
    }
  },

  async getAvailableInstruments() {
    try {
      const response = await api.get('/api/neural-network/instruments');
      return response.data;
    } catch (error) {
      console.error('Error fetching available instruments:', error);
      throw error;
    }
  },

  // AI Services APIs
  async initializeAIService() {
    try {
      const response = await api.post('/api/ai/initialize');
      return response.data;
    } catch (error) {
      console.error('Error initializing AI service:', error);
      throw error;
    }
  },

  async getAIStatus() {
    try {
      const response = await api.get('/api/ai/status');
      return response.data;
    } catch (error) {
      console.error('Error fetching AI status:', error);
      throw error;
    }
  },

  async trainAllNetworks(figi: string, options: any = {}) {
    try {
      const response = await api.post('/api/ai/train', { figi, options });
      return response.data;
    } catch (error) {
      console.error('Error training all networks:', error);
      throw error;
    }
  },

  async partialTraining(figi: string, options: any = {}) {
    try {
      const response = await api.post('/api/ai/partial-train', { figi, options });
      return response.data;
    } catch (error) {
      console.error('Error partial training:', error);
      throw error;
    }
  },

  async getIntegratedRecommendation(figi: string, portfolio: any) {
    try {
      const response = await api.post('/api/ai/recommendation', { figi, portfolio });
      return response.data;
    } catch (error) {
      console.error('Error getting integrated recommendation:', error);
      throw error;
    }
  },

  // Ensemble APIs
  async initializeEnsemble() {
    try {
      const response = await api.post('/api/ensemble/initialize');
      return response.data;
    } catch (error) {
      console.error('Error initializing ensemble:', error);
      throw error;
    }
  },

  async trainEnsemble(figi: string, options: any = {}) {
    try {
      const response = await api.post('/api/ensemble/train', { figi, options });
      return response.data;
    } catch (error) {
      console.error('Error training ensemble:', error);
      throw error;
    }
  },

  async getEnsembleStatus() {
    try {
      const response = await api.get('/api/ensemble/status');
      return response.data;
    } catch (error) {
      console.error('Error fetching ensemble status:', error);
      throw error;
    }
  },

  async predictEnsemble(figi: string, portfolio: any) {
    try {
      // Проксируем на интегрированный ИИ, который внутри использует EnsembleService и другие модели
      const response = await api.post('/api/ai/recommendation', { figi, context: { portfolio } });
      return response.data;
    } catch (error) {
      console.error('Error predicting with ensemble (integrated AI):', error);
      throw error;
    }
  },

  // Meta-Learning APIs
  async initializeMetaLearning() {
    try {
      const response = await api.post('/api/meta-learning/initialize');
      return response.data;
    } catch (error) {
      console.error('Error initializing meta-learning:', error);
      throw error;
    }
  },

  async adaptMetaLearning(taskData: any, targetModel: string, adaptationSteps: number = 5) {
    try {
      const response = await api.post('/api/meta-learning/adapt', { taskData, targetModel, adaptationSteps });
      return response.data;
    } catch (error) {
      console.error('Error adapting meta-learning:', error);
      throw error;
    }
  },

  async findSimilarTasks(marketData: any, taskType: string, performance: any, limit: number = 10) {
    try {
      const response = await api.post('/api/meta-learning/find-similar', { marketData, taskType, performance, limit });
      return response.data;
    } catch (error) {
      console.error('Error finding similar tasks:', error);
      throw error;
    }
  },

  async getMetaLearningStats() {
    try {
      const response = await api.get('/api/meta-learning/stats');
      return response.data;
    } catch (error) {
      console.error('Error fetching meta-learning stats:', error);
      throw error;
    }
  },

  // Reinforcement Learning APIs
  async initializeReinforcementLearning() {
    try {
      const response = await api.post('/api/reinforcement-learning/initialize');
      return response.data;
    } catch (error) {
      console.error('Error initializing reinforcement learning:', error);
      throw error;
    }
  },

  async trainReinforcementLearning(figi: string, episodes: number = 50, days: number = 30, initialPortfolio: any = null) {
    try {
      const response = await api.post('/api/training/reinforcement-learning/train', { figi, episodes, days, initialPortfolio });
      return response.data;
    } catch (error) {
      console.error('Error training reinforcement learning:', error);
      throw error;
    }
  },

  async getRLRecommendation(figi: string, portfolio: any) {
    try {
      const response = await api.post('/api/reinforcement-learning/recommendation', { figi, portfolio });
      return response.data;
    } catch (error) {
      console.error('Error getting RL recommendation:', error);
      throw error;
    }
  },

  async getRLStats() {
    try {
      const response = await api.get('/api/reinforcement-learning/stats');
      return response.data;
    } catch (error) {
      console.error('Error fetching RL stats:', error);
      throw error;
    }
  },

  // AI Models Management APIs
  async loadAllModels() {
    try {
      const response = await api.post('/api/ai/load-models');
      return response.data;
    } catch (error) {
      console.error('Error loading all models:', error);
      throw error;
    }
  },

  async saveAllModels() {
    try {
      const response = await api.post('/api/ai/save-models');
      return response.data;
    } catch (error) {
      console.error('Error saving all models:', error);
      throw error;
    }
  },

  // Trading Mode Management APIs
  async getCurrentTradingMode() {
    try {
      const response = await api.get('/api/trading-mode/current');
      return response.data;
    } catch (error) {
      console.error('Error getting current trading mode:', error);
      throw error;
    }
  },

  async switchTradingMode(mode: string) {
    try {
      const response = await api.post('/api/trading-mode/switch', { mode });
      return response.data;
    } catch (error) {
      console.error('Error switching trading mode:', error);
      throw error;
    }
  },

  async getTradingPortfolio() {
    try {
      const response = await api.get('/api/trading-mode/portfolio');
      return response.data;
    } catch (error) {
      console.error('Error getting trading portfolio:', error);
      throw error;
    }
  },

  async getTradingStats() {
    try {
      const response = await api.get('/api/trading-mode/stats');
      return response.data;
    } catch (error) {
      console.error('Error getting trading stats:', error);
      throw error;
    }
  },

  async getTradingTrades() {
    try {
      const response = await api.get('/api/trading-mode/trades');
      return response.data;
    } catch (error) {
      console.error('Error getting trading trades:', error);
      throw error;
    }
  },

  // Risk Management APIs
  async getRiskManagementStatus() {
    try {
      const response = await api.get('/api/risk-management/status');
      return response.data;
    } catch (error) {
      console.error('Error getting risk management status:', error);
      throw error;
    }
  },

  async getRiskManagementStats() {
    try {
      const response = await api.get('/api/risk-management/stats');
      return response.data;
    } catch (error) {
      console.error('Error getting risk management stats:', error);
      throw error;
    }
  },

  async updateRiskLimits(limits: any) {
    try {
      const response = await api.post('/api/risk-management/limits', { limits });
      return response.data;
    } catch (error) {
      console.error('Error updating risk limits:', error);
      throw error;
    }
  },

  // Switch Validation APIs
  async canSwitchToMicro() {
    try {
      const response = await api.get('/api/switch-validator/micro');
      return response.data;
    } catch (error) {
      console.error('Error checking micro switch validation:', error);
      throw error;
    }
  },

  async canSwitchToFull() {
    try {
      const response = await api.get('/api/switch-validator/full');
      return response.data;
    } catch (error) {
      console.error('Error checking full switch validation:', error);
      throw error;
    }
  },

  async getValidationHistory() {
    try {
      const response = await api.get('/api/switch-validator/history');
      return response.data;
    } catch (error) {
      console.error('Error getting validation history:', error);
      throw error;
    }
  },

  // Training Management APIs
  async runFullTraining(figi: string, options: any = {}) {
    try {
      const response = await api.post('/api/evaluation/run-full-training', { figi, options });
      return response.data;
    } catch (error) {
      console.error('Error running full training:', error);
      throw error;
    }
  },

  async getTrainingHistory(figi?: string) {
    try {
      const url = figi ? `/api/training/history/${figi}` : '/api/training/history';
      const response = await api.get(url);
      return response.data;
    } catch (error) {
      console.error('Error getting training history:', error);
      throw error;
    }
  },

  async getTrainingProgress(figi: string) {
    try {
      const response = await api.get(`/api/training/progress/${figi}`);
      return response.data;
    } catch (error) {
      console.error('Error getting training progress:', error);
      throw error;
    }
  },

  async stopTraining(figi: string) {
    try {
      const response = await api.post(`/api/training/stop/${figi}`);
      return response.data;
    } catch (error) {
      console.error('Error stopping training:', error);
      throw error;
    }
  },

  // Metrics and Monitoring APIs

  async getAlerts() {
    try {
      const response = await api.get('/api/performance-monitoring/alerts');
      return response.data;
    } catch (error) {
      console.error('Error getting alerts:', error);
      throw error;
    }
  },

  async getSystemHealth() {
    try {
      const response = await api.get('/api/system/health');
      return response.data;
    } catch (error) {
      console.error('Error getting system health:', error);
      throw error;
    }
  },

  async getDetailedMetrics() {
    try {
      const response = await api.get('/api/performance-monitoring/detailed');
      return response.data;
    } catch (error) {
      console.error('Error getting detailed metrics:', error);
      throw error;
    }
  },

  async resolveAlert(alertId: string) {
    try {
      const response = await api.post(`/api/performance-monitoring/alerts/${alertId}/resolve`);
      return response.data;
    } catch (error) {
      console.error('Error resolving alert:', error);
      throw error;
    }
  }
};

export default api;