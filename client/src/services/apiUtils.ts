// import { apiService } from './apiService';

// Утилиты для работы с API
export class ApiUtils {
  /**
   * Обработка ошибок API
   */
  static handleApiError(error: any): string {
    if (error.response) {
      // Сервер ответил с кодом ошибки
      const status = error.response.status;
      const message = error.response.data?.message || error.response.data?.error || 'Unknown error';
      
      switch (status) {
        case 400:
          return `Некорректный запрос: ${message}`;
        case 401:
          return 'Необходима авторизация';
        case 403:
          return 'Доступ запрещен';
        case 404:
          return 'Ресурс не найден';
        case 500:
          return `Ошибка сервера: ${message}`;
        default:
          return `Ошибка ${status}: ${message}`;
      }
    } else if (error.request) {
      // Запрос был отправлен, но ответа не получено
      return 'Сервер не отвечает. Проверьте подключение к интернету.';
    } else {
      // Ошибка при настройке запроса
      return `Ошибка: ${error.message}`;
    }
  }

  /**
   * Форматирование чисел для отображения
   */
  static formatNumber(value: number, decimals: number = 2): string {
    return new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  }

  /**
   * Форматирование валюты
   */
  static formatCurrency(value: number, currency: string = 'RUB'): string {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: currency,
    }).format(value);
  }

  /**
   * Форматирование процентов
   */
  static formatPercentage(value: number, decimals: number = 1): string {
    return `${(value * 100).toFixed(decimals)}%`;
  }

  /**
   * Форматирование даты
   */
  static formatDate(date: string | Date): string {
    const d = new Date(date);
    return new Intl.DateTimeFormat('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  }

  /**
   * Форматирование времени
   */
  static formatTime(date: string | Date): string {
    const d = new Date(date);
    return new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(d);
  }

  /**
   * Получить цвет для значения (зеленый/красный)
   */
  static getValueColor(value: number): string {
    if (value > 0) return 'text-green-600';
    if (value < 0) return 'text-red-600';
    return 'text-gray-600';
  }

  /**
   * Получить цвет для статуса
   */
  static getStatusColor(status: string): string {
    switch (status.toLowerCase()) {
      case 'ok':
      case 'healthy':
      case 'active':
      case 'success':
        return 'text-green-600';
      case 'warning':
      case 'pending':
        return 'text-yellow-600';
      case 'error':
      case 'failed':
      case 'inactive':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  }

  /**
   * Получить иконку для статуса
   */
  static getStatusIcon(status: string): string {
    switch (status.toLowerCase()) {
      case 'ok':
      case 'healthy':
      case 'active':
      case 'success':
        return '✅';
      case 'warning':
      case 'pending':
        return '⚠️';
      case 'error':
      case 'failed':
      case 'inactive':
        return '❌';
      default:
        return '❓';
    }
  }

  /**
   * Получить цвет для рекомендации
   */
  static getRecommendationColor(recommendation: string): string {
    switch (recommendation.toUpperCase()) {
      case 'BUY':
        return 'text-green-600 bg-green-100';
      case 'SELL':
        return 'text-red-600 bg-red-100';
      case 'HOLD':
        return 'text-yellow-600 bg-yellow-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  }

  /**
   * Получить иконку для рекомендации
   */
  static getRecommendationIcon(recommendation: string): string {
    switch (recommendation.toUpperCase()) {
      case 'BUY':
        return '📈';
      case 'SELL':
        return '📉';
      case 'HOLD':
        return '⏸️';
      default:
        return '❓';
    }
  }

  /**
   * Получить цвет для режима торговли
   */
  static getTradingModeColor(mode: string): string {
    switch (mode.toLowerCase()) {
      case 'paper':
        return 'text-blue-600 bg-blue-100';
      case 'micro':
        return 'text-yellow-600 bg-yellow-100';
      case 'real':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  }

  /**
   * Получить иконку для режима торговли
   */
  static getTradingModeIcon(mode: string): string {
    switch (mode.toLowerCase()) {
      case 'paper':
        return '📄';
      case 'micro':
        return '💰';
      case 'real':
        return '💸';
      default:
        return '❓';
    }
  }

  /**
   * Дебаунс функция для API запросов
   */
  static debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: number;
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = window.setTimeout(() => func(...args), wait);
    };
  }

  /**
   * Тротлинг функция для API запросов
   */
  static throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
  ): (...args: Parameters<T>) => void {
    let inThrottle: boolean;
    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }

  /**
   * Проверка валидности FIGI
   */
  static isValidFigi(figi: string): boolean {
    return Boolean(figi && figi.length > 0 && typeof figi === 'string');
  }

  /**
   * Проверка валидности количества
   */
  static isValidQuantity(quantity: number): boolean {
    return quantity > 0 && Number.isInteger(quantity);
  }

  /**
   * Проверка валидности цены
   */
  static isValidPrice(price: number): boolean {
    return price > 0 && !isNaN(price);
  }

  /**
   * Генерация уникального ID
   */
  static generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  /**
   * Клонирование объекта
   */
  static deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Проверка на пустой объект
   */
  static isEmpty(obj: any): boolean {
    return obj == null || (typeof obj === 'object' && Object.keys(obj).length === 0);
  }

  /**
   * Получить вложенное значение объекта
   */
  static getNestedValue(obj: any, path: string, defaultValue?: any): any {
    return path.split('.').reduce((current, key) => current?.[key], obj) ?? defaultValue;
  }

  /**
   * Установить вложенное значение объекта
   */
  static setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      if (!(key in current)) current[key] = {};
      return current[key];
    }, obj);
    if (lastKey) target[lastKey] = value;
  }
}

// Хуки для работы с API
export const useApiHooks = {
  /**
   * Хук для получения данных с обработкой ошибок
   */
  async withErrorHandling<T>(
    apiCall: () => Promise<T>,
    onError?: (error: string) => void
  ): Promise<T | null> {
    try {
      return await apiCall();
    } catch (error) {
      const errorMessage = ApiUtils.handleApiError(error);
      console.error('API Error:', errorMessage);
      if (onError) onError(errorMessage);
      return null;
    }
  },

  /**
   * Хук для получения данных с ретраем
   */
  async withRetry<T>(
    apiCall: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T | null> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await apiCall();
      } catch (error) {
        if (i === maxRetries - 1) {
          console.error('API Error after retries:', error);
          return null;
        }
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    }
    return null;
  },

  /**
   * Хук для получения данных с кешированием
   */
  async withCache<T>(
    key: string,
    apiCall: () => Promise<T>,
    ttl: number = 5 * 60 * 1000 // 5 минут
  ): Promise<T | null> {
    const cacheKey = `api_cache_${key}`;
    const cached = localStorage.getItem(cacheKey);
    
    if (cached) {
      try {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < ttl) {
          return data;
        }
      } catch (error) {
        console.warn('Cache parse error:', error);
      }
    }

    try {
      const data = await apiCall();
      localStorage.setItem(cacheKey, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
      return data;
    } catch (error) {
      console.error('API Error:', error);
      return null;
    }
  }
};

export default ApiUtils;
