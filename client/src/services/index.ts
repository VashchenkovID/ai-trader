// Экспорт всех API сервисов
export { apiService, default as api } from './apiService';
export { ApiUtils, useApiHooks } from './apiUtils';
export { API_CONSTANTS, ApiConstantsUtils } from './apiConstants';

// Экспорт типов
export type {
  SystemStatus,
  HealthStatus,
  Portfolio,
  TradingStats,
  Recommendation,
  TradingMode,
  RiskManagementStatus,
  PerformanceMetrics,
  Settings,
  PreflightCheckResults,
  MigrationPlan,
  CapitalScalingStatus,
  NewsAnalysis,
  TelegramSentiment
} from './apiService';

export type {
  TradingMode as TradingModeType,
  Recommendation as RecommendationType,
  SettingsCategory,
  SettingsDataType,
  AnalysisPeriod,
  RiskLevel,
  WebSocketEvent
} from './apiConstants';

// Создание единого объекта для удобного импорта
export const services = {
  api: apiService,
  utils: ApiUtils,
  constants: API_CONSTANTS,
  constantsUtils: ApiConstantsUtils,
  hooks: useApiHooks
};

// Экспорт по умолчанию
export default services;
