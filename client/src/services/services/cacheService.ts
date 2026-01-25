import {api} from "../apiService.ts";


export const cacheService = {
    /**
     * Кешировать новости
     */
    async cacheNews(figi: string, options: any = {}): Promise<any> {
        try {
            const response = await api.post('/api/notifications/cache/news', {figi, options});
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
            const response = await api.post('/api/notifications/cache/telegram', {figi, options});
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
}