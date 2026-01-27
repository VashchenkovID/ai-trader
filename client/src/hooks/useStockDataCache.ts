import { useCallback } from 'react';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const CACHE_TTL = {
  stockDetail: 5 * 60 * 1000, // 5 минут
  candles: 2 * 60 * 1000, // 2 минуты
  news: 10 * 60 * 1000, // 10 минут
  signals: 5 * 60 * 1000, // 5 минут
  recommendation: 5 * 60 * 1000, // 5 минут
};

class StockDataCache {
  private cache: Map<string, CacheEntry<any>> = new Map();

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  set<T>(key: string, data: T, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  clear(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }
}

const stockDataCache = new StockDataCache();

export const useStockDataCache = () => {
  const getCacheKey = useCallback((type: string, figi: string, ...params: any[]) => {
    return `${type}_${figi}_${params.join('_')}`;
  }, []);

  const getCached = useCallback(<T,>(type: string, figi: string, ...params: any[]): T | null => {
    const key = getCacheKey(type, figi, ...params);
    return stockDataCache.get<T>(key);
  }, [getCacheKey]);

  const setCached = useCallback(<T,>(type: string, figi: string, data: T, ttl?: number, ...params: any[]): void => {
    const key = getCacheKey(type, figi, ...params);
    const cacheTtl = ttl || CACHE_TTL[type as keyof typeof CACHE_TTL] || 5 * 60 * 1000;
    stockDataCache.set(key, data, cacheTtl);
  }, [getCacheKey]);

  const clearCache = useCallback((type?: string, figi?: string, ...params: any[]) => {
    if (type && figi) {
      const key = getCacheKey(type, figi, ...params);
      stockDataCache.clear(key);
    } else {
      stockDataCache.clear();
    }
  }, [getCacheKey]);

  const hasCached = useCallback((type: string, figi: string, ...params: any[]): boolean => {
    const key = getCacheKey(type, figi, ...params);
    return stockDataCache.has(key);
  }, [getCacheKey]);

  return {
    getCached,
    setCached,
    clearCache,
    hasCached,
    CACHE_TTL,
  };
};

export default useStockDataCache;

