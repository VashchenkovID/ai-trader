

// ============================================================================
// СИСТЕМНЫЕ РОУТЫ
// ============================================================================
import {api, HealthStatus, SystemStatus} from "../apiService.ts";

export const systemService = {

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

    /**
     * Запустить анализ рынка
     */
    async startMarketAnalysis(): Promise<any> {
        try {
            const response = await api.post('/api/system/market-analysis');
            return response.data;
        } catch (error) {
            console.error('Error starting market analysis:', error);
            throw error;
        }
    },

    /**
     * Выполнить предварительную проверку системы
     */
    async runPreflightCheck(): Promise<any> {
        try {
            const response = await api.post('/api/preflight-check/run');
            // API возвращает { success: true, results: {...} }
            return response.data;
        } catch (error) {
            console.error('Error running preflight check:', error);
            // Возвращаем безопасный результат вместо выброса ошибки
            return {
                success: false,
                results: {
                    passed: false,
                    checks: [{
                        name: 'error',
                        passed: false,
                        message: 'Ошибка выполнения проверки'
                    }]
                }
            };
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

}