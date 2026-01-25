import {api, Settings} from "../apiService.ts";

// ============================================================================
// НАСТРОЙКИ
// ============================================================================

export const settingsService = {
    /**
     * Получить все настройки
     */
    async getSettings(): Promise<Settings[]> {
        try {
            const response = await api.get('/api/settings');
            return response.data.data;
        } catch (error) {
            console.error('Error fetching settings:', error);
            throw error;
        }
    },

    /**
     * Обновить настройки
     */
    async updateSettings(settings: Record<string, any>): Promise<any> {
        try {
            const response = await api.put('/api/settings', {settings});
            return response.data.data;
        } catch (error) {
            console.error('Error updating settings:', error);
            throw error;
        }
    },
}