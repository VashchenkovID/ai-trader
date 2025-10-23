// Константы для API
export const API_CONSTANTS = {
  // Базовые настройки
  BASE_URL: (window as any).env?.REACT_APP_API_URL || 'http://localhost:3001',
  TIMEOUT: 10000,
  
  // Таймауты для разных типов запросов
  TIMEOUTS: {
    QUICK: 5000,      // Быстрые запросы (статус, health check)
    NORMAL: 10000,    // Обычные запросы (данные, настройки)
    LONG: 30000,      // Долгие запросы (обучение, миграция)
    VERY_LONG: 60000  // Очень долгие запросы (полное обучение)
  },

  // Интервалы обновления данных
  REFRESH_INTERVALS: {
    SYSTEM_STATUS: 5000,        // 5 секунд
    PORTFOLIO: 10000,           // 10 секунд
    RECOMMENDATIONS: 30000,     // 30 секунд
    PERFORMANCE: 60000,         // 1 минута
    SETTINGS: 300000,           // 5 минут
    NEWS: 300000,               // 5 минут
    TELEGRAM: 300000            // 5 минут
  },

  // Лимиты для пагинации
  PAGINATION: {
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
    RECOMMENDATIONS_LIMIT: 50,
    TRADES_LIMIT: 100,
    MIGRATION_HISTORY_LIMIT: 50
  },

  // Статусы системы
  STATUS: {
    OK: 'ok',
    ERROR: 'error',
    WARNING: 'warning',
    PENDING: 'pending',
    HEALTHY: 'healthy',
    UNHEALTHY: 'unhealthy'
  },

  // Режимы торговли
  TRADING_MODES: {
    PAPER: 'paper',
    MICRO: 'micro',
    REAL: 'real'
  } as const,

  // Рекомендации
  RECOMMENDATIONS: {
    BUY: 'BUY',
    SELL: 'SELL',
    HOLD: 'HOLD'
  } as const,

  // Категории настроек
  SETTINGS_CATEGORIES: {
    GENERAL: 'general',
    PORTFOLIO: 'portfolio',
    NEURAL_NETWORK: 'neural_network',
    SCHEDULER: 'scheduler',
    NOTIFICATIONS: 'notifications',
    TRADING_HOURS: 'trading_hours',
    RISK_MANAGEMENT: 'risk_management',
    MIGRATION: 'migration',
    CAPITAL_SCALING: 'capital_scaling',
    ALLOCATION: 'allocation',
    STAGE3_VALIDATION: 'stage3_validation'
  } as const,

  // Типы данных настроек
  SETTINGS_DATA_TYPES: {
    STRING: 'string',
    NUMBER: 'number',
    BOOLEAN: 'boolean',
    JSON: 'json',
    ARRAY: 'array'
  } as const,

  // Периоды для анализа
  ANALYSIS_PERIODS: {
    DAY: 'day',
    WEEK: 'week',
    MONTH: 'month',
    QUARTER: 'quarter',
    YEAR: 'year'
  } as const,

  // Уровни риска
  RISK_LEVELS: {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical'
  } as const,

  // Цвета для UI
  COLORS: {
    SUCCESS: '#10B981',
    WARNING: '#F59E0B',
    ERROR: '#EF4444',
    INFO: '#3B82F6',
    NEUTRAL: '#6B7280'
  },

  // Иконки для статусов
  ICONS: {
    SUCCESS: '✅',
    WARNING: '⚠️',
    ERROR: '❌',
    INFO: 'ℹ️',
    LOADING: '⏳',
    BUY: '📈',
    SELL: '📉',
    HOLD: '⏸️',
    PAPER: '📄',
    MICRO: '💰',
    REAL: '💸'
  },

  // Сообщения об ошибках
  ERROR_MESSAGES: {
    NETWORK_ERROR: 'Ошибка сети. Проверьте подключение к интернету.',
    SERVER_ERROR: 'Ошибка сервера. Попробуйте позже.',
    TIMEOUT_ERROR: 'Превышено время ожидания запроса.',
    UNAUTHORIZED: 'Необходима авторизация.',
    FORBIDDEN: 'Доступ запрещен.',
    NOT_FOUND: 'Ресурс не найден.',
    VALIDATION_ERROR: 'Ошибка валидации данных.',
    UNKNOWN_ERROR: 'Произошла неизвестная ошибка.'
  },

  // Сообщения об успехе
  SUCCESS_MESSAGES: {
    SETTINGS_UPDATED: 'Настройки успешно обновлены.',
    TRADE_EXECUTED: 'Сделка успешно выполнена.',
    MODE_SWITCHED: 'Режим торговли изменен.',
    MIGRATION_STARTED: 'Миграция портфеля запущена.',
    MIGRATION_COMPLETED: 'Миграция портфеля завершена.',
    AI_TRAINED: 'Обучение AI завершено.',
    CAPITAL_INCREASED: 'Капитал успешно увеличен.'
  },

  // Валидация
  VALIDATION: {
    MIN_FIGI_LENGTH: 1,
    MAX_FIGI_LENGTH: 50,
    MIN_QUANTITY: 1,
    MAX_QUANTITY: 1000000,
    MIN_PRICE: 0.01,
    MAX_PRICE: 1000000,
    MIN_CONFIDENCE: 0,
    MAX_CONFIDENCE: 1,
    MIN_SCORE: 0,
    MAX_SCORE: 1
  },

  // Кеширование
  CACHE: {
    TTL: {
      SHORT: 60000,      // 1 минута
      MEDIUM: 300000,    // 5 минут
      LONG: 1800000,     // 30 минут
      VERY_LONG: 3600000 // 1 час
    },
    KEYS: {
      SYSTEM_STATUS: 'system_status',
      PORTFOLIO: 'portfolio',
      RECOMMENDATIONS: 'recommendations',
      SETTINGS: 'settings',
      TRADING_MODE: 'trading_mode',
      RISK_MANAGEMENT: 'risk_management',
      PERFORMANCE: 'performance',
      NEWS: 'news',
      TELEGRAM: 'telegram'
    }
  },

  // WebSocket события
  WEBSOCKET_EVENTS: {
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    ERROR: 'error',
    STATUS: 'status',
    RECOMMENDATION: 'recommendation',
    TRADE: 'trade',
    PORTFOLIO_UPDATE: 'portfolio_update',
    PERFORMANCE_UPDATE: 'performance_update',
    RISK_ALERT: 'risk_alert',
    MIGRATION_UPDATE: 'migration_update'
  },

  // Логирование
  LOG_LEVELS: {
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'info',
    DEBUG: 'debug'
  }
} as const;

// Типы для констант
export type TradingMode = typeof API_CONSTANTS.TRADING_MODES[keyof typeof API_CONSTANTS.TRADING_MODES];
export type Recommendation = typeof API_CONSTANTS.RECOMMENDATIONS[keyof typeof API_CONSTANTS.RECOMMENDATIONS];
export type SettingsCategory = typeof API_CONSTANTS.SETTINGS_CATEGORIES[keyof typeof API_CONSTANTS.SETTINGS_CATEGORIES];
export type SettingsDataType = typeof API_CONSTANTS.SETTINGS_DATA_TYPES[keyof typeof API_CONSTANTS.SETTINGS_DATA_TYPES];
export type AnalysisPeriod = typeof API_CONSTANTS.ANALYSIS_PERIODS[keyof typeof API_CONSTANTS.ANALYSIS_PERIODS];
export type RiskLevel = typeof API_CONSTANTS.RISK_LEVELS[keyof typeof API_CONSTANTS.RISK_LEVELS];
export type WebSocketEvent = typeof API_CONSTANTS.WEBSOCKET_EVENTS[keyof typeof API_CONSTANTS.WEBSOCKET_EVENTS];

// Утилиты для работы с константами
export const ApiConstantsUtils = {
  /**
   * Получить таймаут для типа запроса
   */
  getTimeout(type: keyof typeof API_CONSTANTS.TIMEOUTS): number {
    return API_CONSTANTS.TIMEOUTS[type];
  },

  /**
   * Получить интервал обновления для типа данных
   */
  getRefreshInterval(type: keyof typeof API_CONSTANTS.REFRESH_INTERVALS): number {
    return API_CONSTANTS.REFRESH_INTERVALS[type];
  },

  /**
   * Получить цвет для статуса
   */
  getStatusColor(status: string): string {
    switch (status.toLowerCase()) {
      case API_CONSTANTS.STATUS.OK:
      case API_CONSTANTS.STATUS.HEALTHY:
        return API_CONSTANTS.COLORS.SUCCESS;
      case API_CONSTANTS.STATUS.WARNING:
        return API_CONSTANTS.COLORS.WARNING;
      case API_CONSTANTS.STATUS.ERROR:
      case API_CONSTANTS.STATUS.UNHEALTHY:
        return API_CONSTANTS.COLORS.ERROR;
      default:
        return API_CONSTANTS.COLORS.NEUTRAL;
    }
  },

  /**
   * Получить иконку для статуса
   */
  getStatusIcon(status: string): string {
    switch (status.toLowerCase()) {
      case API_CONSTANTS.STATUS.OK:
      case API_CONSTANTS.STATUS.HEALTHY:
        return API_CONSTANTS.ICONS.SUCCESS;
      case API_CONSTANTS.STATUS.WARNING:
        return API_CONSTANTS.ICONS.WARNING;
      case API_CONSTANTS.STATUS.ERROR:
      case API_CONSTANTS.STATUS.UNHEALTHY:
        return API_CONSTANTS.ICONS.ERROR;
      default:
        return API_CONSTANTS.ICONS.INFO;
    }
  },

  /**
   * Получить цвет для рекомендации
   */
  getRecommendationColor(recommendation: string): string {
    switch (recommendation.toUpperCase()) {
      case API_CONSTANTS.RECOMMENDATIONS.BUY:
        return API_CONSTANTS.COLORS.SUCCESS;
      case API_CONSTANTS.RECOMMENDATIONS.SELL:
        return API_CONSTANTS.COLORS.ERROR;
      case API_CONSTANTS.RECOMMENDATIONS.HOLD:
        return API_CONSTANTS.COLORS.WARNING;
      default:
        return API_CONSTANTS.COLORS.NEUTRAL;
    }
  },

  /**
   * Получить иконку для рекомендации
   */
  getRecommendationIcon(recommendation: string): string {
    switch (recommendation.toUpperCase()) {
      case API_CONSTANTS.RECOMMENDATIONS.BUY:
        return API_CONSTANTS.ICONS.BUY;
      case API_CONSTANTS.RECOMMENDATIONS.SELL:
        return API_CONSTANTS.ICONS.SELL;
      case API_CONSTANTS.RECOMMENDATIONS.HOLD:
        return API_CONSTANTS.ICONS.HOLD;
      default:
        return API_CONSTANTS.ICONS.INFO;
    }
  },

  /**
   * Получить цвет для режима торговли
   */
  getTradingModeColor(mode: string): string {
    switch (mode.toLowerCase()) {
      case API_CONSTANTS.TRADING_MODES.PAPER:
        return API_CONSTANTS.COLORS.INFO;
      case API_CONSTANTS.TRADING_MODES.MICRO:
        return API_CONSTANTS.COLORS.WARNING;
      case API_CONSTANTS.TRADING_MODES.REAL:
        return API_CONSTANTS.COLORS.ERROR;
      default:
        return API_CONSTANTS.COLORS.NEUTRAL;
    }
  },

  /**
   * Получить иконку для режима торговли
   */
  getTradingModeIcon(mode: string): string {
    switch (mode.toLowerCase()) {
      case API_CONSTANTS.TRADING_MODES.PAPER:
        return API_CONSTANTS.ICONS.PAPER;
      case API_CONSTANTS.TRADING_MODES.MICRO:
        return API_CONSTANTS.ICONS.MICRO;
      case API_CONSTANTS.TRADING_MODES.REAL:
        return API_CONSTANTS.ICONS.REAL;
      default:
        return API_CONSTANTS.ICONS.INFO;
    }
  },

  /**
   * Валидация FIGI
   */
  isValidFigi(figi: string): boolean {
    return Boolean(figi && 
           figi.length >= API_CONSTANTS.VALIDATION.MIN_FIGI_LENGTH && 
           figi.length <= API_CONSTANTS.VALIDATION.MAX_FIGI_LENGTH);
  },

  /**
   * Валидация количества
   */
  isValidQuantity(quantity: number): boolean {
    return quantity >= API_CONSTANTS.VALIDATION.MIN_QUANTITY && 
           quantity <= API_CONSTANTS.VALIDATION.MAX_QUANTITY &&
           Number.isInteger(quantity);
  },

  /**
   * Валидация цены
   */
  isValidPrice(price: number): boolean {
    return price >= API_CONSTANTS.VALIDATION.MIN_PRICE && 
           price <= API_CONSTANTS.VALIDATION.MAX_PRICE &&
           !isNaN(price);
  },

  /**
   * Валидация уверенности
   */
  isValidConfidence(confidence: number): boolean {
    return confidence >= API_CONSTANTS.VALIDATION.MIN_CONFIDENCE && 
           confidence <= API_CONSTANTS.VALIDATION.MAX_CONFIDENCE;
  },

  /**
   * Валидация оценки
   */
  isValidScore(score: number): boolean {
    return score >= API_CONSTANTS.VALIDATION.MIN_SCORE && 
           score <= API_CONSTANTS.VALIDATION.MAX_SCORE;
  }
};

export default API_CONSTANTS;
