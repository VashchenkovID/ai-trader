import {api, RiskManagementStatus} from "../apiService.ts";

// ============================================================================
// РИСК-МЕНЕДЖМЕНТ
// ============================================================================
export const riskManagementService = {
    /**
     * Получить статус риск-менеджмента
     */
    async getRiskManagementStatus(): Promise<RiskManagementStatus> {
        try {
            const response = await api.get('/api/risk-management/status');
            return response.data.data || response.data;
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
            const response = await api.post('/api/risk-management/limits', {limits});
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
            const response = await api.post('/api/risk-adjustment/settings', {settings});
            return response.data.data;
        } catch (error) {
            console.error('Error updating risk adjustment settings:', error);
            throw error;
        }
    },
}