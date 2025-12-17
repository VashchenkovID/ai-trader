import CacheService from '../../services/CacheService.js';
import SettingsService from '../../services/SettingsService.js';

/**
 * Утилиты для работы с кешем
 */

/**
 * Проверяет, устарел ли кеш (нет свежих данных)
 * @param {number} cacheUpdateInterval - Интервал обновления кеша в миллисекундах
 * @returns {Promise<boolean>} true если кеш устарел
 */
export async function isCacheStale(cacheUpdateInterval) {
    try {
        // Проверяем, есть ли свежие данные в кеше
        const instruments = await CacheService.getAllInstruments(1); // Берем только 1 инструмент для проверки
        console.log(`🔍 Cache staleness check: found ${instruments?.length || 0} instruments`);
        
        if (!instruments || instruments.length === 0) {
            console.log('📅 Cache is empty, update needed');
            return true;
        }
        
        // Проверяем время последнего обновления инструмента
        const lastUpdate = instruments[0].lastUpdated;
        console.log(`🔍 Last update time: ${lastUpdate ? new Date(lastUpdate).toISOString() : 'null'}`);
        
        if (!lastUpdate) {
            console.log('📅 No update time in cache, update needed');
            return true;
        }
        
        const timeSinceUpdate = Date.now() - new Date(lastUpdate).getTime();
        const isStale = timeSinceUpdate > cacheUpdateInterval;
        
        if (isStale) {
            const hoursSinceUpdate = Math.round(timeSinceUpdate / (60 * 60 * 1000));
            console.log(`📅 Cache is stale: ${hoursSinceUpdate}h since last update, update needed`);
        } else {
            const remainingTime = Math.round((cacheUpdateInterval - timeSinceUpdate) / (60 * 1000));
            console.log(`⏰ Cache is fresh: ${remainingTime}min until next update`);
        }
        
        return isStale;
    } catch (error) {
        console.error('❌ Error checking cache staleness:', error);
        // В случае ошибки считаем кеш устаревшим
        return true;
    }
}

/**
 * Проверяет, нужно ли обновлять кеш
 * @param {number|null} lastCacheUpdate - Время последнего обновления кеша (timestamp)
 * @param {number} cacheUpdateInterval - Интервал обновления кеша в миллисекундах
 * @param {Function} isCacheStaleFn - Функция проверки свежести кеша
 * @returns {Promise<boolean>} true если нужно обновить кеш
 */
export async function shouldUpdateCache(lastCacheUpdate, cacheUpdateInterval, isCacheStaleFn) {
    if (!lastCacheUpdate) {
        // Проверяем, есть ли свежие данные в кеше
        const stale = await isCacheStaleFn();
        return stale;
    }

    const timeSinceLastUpdate = Date.now() - lastCacheUpdate;
    const shouldUpdate = timeSinceLastUpdate >= cacheUpdateInterval;

    return shouldUpdate;
}

/**
 * Загружает время последнего обновления кеша из настроек
 * @param {Function} isCacheStaleFn - Функция проверки свежести кеша
 * @returns {Promise<number|null>} Время последнего обновления или null
 */
export async function loadLastCacheUpdateTime(isCacheStaleFn) {
    try {
        const lastUpdateSetting = await SettingsService.getSetting('last_cache_update_time');
        if (lastUpdateSetting) {
            return new Date(lastUpdateSetting).getTime();
        } else {
            // При первом запуске проверяем свежесть кеша
            const stale = await isCacheStaleFn();
            if (stale) {
                return null; // Устанавливаем null, чтобы shouldUpdateCache() вернул true
            } else {
                const now = Date.now();
                await saveLastCacheUpdateTime(now);
                return now;
            }
        }
    } catch (error) {
        console.error('❌ Error loading last cache update time:', error);
        // В случае ошибки проверяем свежесть кеша
        const stale = await isCacheStaleFn();
        return stale ? null : Date.now();
    }
}

/**
 * Сохраняет время последнего обновления кеша в настройки
 * @param {number} timestamp - Время обновления (timestamp)
 */
export async function saveLastCacheUpdateTime(timestamp) {
    try {
        if (!timestamp) {
            return;
        }
        await SettingsService.setSetting('last_cache_update_time', new Date(timestamp).toISOString());
        console.log(`💾 Saved last cache update time: ${new Date(timestamp).toISOString()}`);
    } catch (error) {
        console.error('❌ Error saving last cache update time:', error);
    }
}

/**
 * Ожидает обновления кеша с таймаутом
 * @param {Function} isCacheStaleFn - Функция проверки свежести кеша
 * @param {number} maxWait - Максимальное время ожидания в миллисекундах (по умолчанию 10 минут)
 * @returns {Promise<boolean>} true если кеш обновился, false если таймаут
 */
export async function waitForCacheUpdate(isCacheStaleFn, maxWait = 10 * 60 * 1000) {
    let waitTime = 0;
    const checkInterval = 60000; // Проверяем каждую минуту
    
    while (await isCacheStaleFn() && waitTime < maxWait) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        waitTime += checkInterval;
    }
    
    return waitTime < maxWait;
}

