import {api, CacheStatus, PerformanceMetrics, SystemResources} from "../apiService.ts";


export const monitoringService = {
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
            const response = await api.get('/api/system/cache/status');
            return response.data.data;
        } catch (error) {
            console.error('Error fetching cache status:', error);
            throw error;
        }
    },

    /**
     * Получить статистику кеша
     */
    async getCacheStats(): Promise<any> {
        try {
            const response = await api.get('/api/system/cache/stats');
            return response.data.data;
        } catch (error) {
            console.error('Error fetching cache stats:', error);
            throw error;
        }
    },

    /**
     * Получить статус планировщика
     */
    async getSchedulerStatus(): Promise<any> {
        try {
            const response = await api.get('/api/system/scheduler/status');
            return response.data.data;
        } catch (error) {
            console.error('Error fetching scheduler status:', error);
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
    // УВЕДОМЛЕНИЯ
    // ============================================================================

    /**
     * Получить настройки уведомлений
     */
    async getNotificationSettings(): Promise<any> {
        try {
            const response = await api.get('/api/notifications/settings');
            return response.data.data;
        } catch (error) {
            console.error('Error fetching notification settings:', error);
            throw error;
        }
    },

    /**
     * Обновить настройки уведомлений
     */
    async updateNotificationSettings(settings: Record<string, any>): Promise<any> {
        try {
            const response = await api.put('/api/notifications/settings', settings);
            return response.data.data;
        } catch (error) {
            console.error('Error updating notification settings:', error);
            throw error;
        }
    },

    /**
     * Тестировать Telegram подключение
     */
    async testTelegramConnection(token: string, chatId: string): Promise<any> {
        try {
            const response = await api.post('/api/telegram/test', {token, chatId});
            return response.data.data;
        } catch (error) {
            console.error('Error testing Telegram connection:', error);
            throw error;
        }
    },

    /**
     * Отправить тестовое уведомление
     */
    async sendTestNotification(type: string = 'telegram'): Promise<any> {
        try {
            const response = await api.post('/api/notifications/test', {type});
            return response.data.data;
        } catch (error) {
            console.error('Error sending test notification:', error);
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
}