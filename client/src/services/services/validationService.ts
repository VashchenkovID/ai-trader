import {api} from "../apiService.ts";

// ============================================================================
// ВАЛИДАЦИЯ ПЕРЕХОДОВ
// ============================================================================
export const validationService = {
    /**
     * Проверить готовность к переходу к микро-капиталу
     */
    async checkMicroCapitalReadiness(): Promise<any> {
        try {
            const response = await api.get('/api/switch-validator/micro');
            return response.data.validation;
        } catch (error) {
            console.error('Error checking micro capital readiness:', error);
            throw error;
        }
    },

    /**
     * Проверить готовность к переходу к полной торговле
     */
    async checkFullTradingReadiness(): Promise<any> {
        try {
            const response = await api.get('/api/switch-validator/full');
            return response.data.validation;
        } catch (error) {
            console.error('Error checking full trading readiness:', error);
            throw error;
        }
    },

    /**
     * Получить историю валидаций
     */
    async getValidationHistory(): Promise<any[]> {
        try {
            const response = await api.get('/api/switch-validator/history');
            return response.data.history;
        } catch (error) {
            console.error('Error fetching validation history:', error);
            throw error;
        }
    },

    /**
     * Получить статус валидации Этапа 3
     */
    async getStage3ValidatorStatus(): Promise<any> {
        try {
            const response = await api.get('/api/stage3-validator/status');
            return response.data.data;
        } catch (error) {
            console.error('Error fetching stage3 validator status:', error);
            throw error;
        }
    },

    /**
     * Выполнить валидацию Этапа 3
     */
    async validateStage3(): Promise<any> {
        try {
            const response = await api.post('/api/stage3-validator/validate');
            return response.data.data;
        } catch (error) {
            console.error('Error validating stage3:', error);
            throw error;
        }
    },

    /**
     * Получить историю валидации Этапа 3
     */
    async getStage3ValidatorHistory(limit: number = 50): Promise<any[]> {
        try {
            const response = await api.get(`/api/stage3-validator/history?limit=${limit}`);
            return response.data.data;
        } catch (error) {
            console.error('Error fetching stage3 validator history:', error);
            throw error;
        }
    },
}