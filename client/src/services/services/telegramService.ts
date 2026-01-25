import {api, TelegramSentiment} from "../apiService.ts";


export const telegramService ={
    /**
     * Анализ настроений в Telegram каналах
     */
    async getTelegramSentiment(figi: string, days: number = 7, limit: number = 100): Promise<TelegramSentiment> {
        try {
            const response = await api.get(`/api/telegram/sentiment/${figi}?days=${days}&limit=${limit}`);
            return response.data.data;
        } catch (error) {
            console.error('Error fetching telegram sentiment:', error);
            throw error;
        }
    },

    /**
     * Добавить канал для мониторинга
     */
    async addTelegramChannel(channel: string): Promise<any> {
        try {
            const response = await api.post('/api/telegram/channels', {channel});
            return response.data;
        } catch (error) {
            console.error('Error adding telegram channel:', error);
            throw error;
        }
    },

    /**
     * Удалить канал
     */
    async removeTelegramChannel(channel: string): Promise<any> {
        try {
            const response = await api.delete(`/api/telegram/channels/${channel}`);
            return response.data;
        } catch (error) {
            console.error('Error removing telegram channel:', error);
            throw error;
        }
    },

    /**
     * Получить список каналов
     */
    async getTelegramChannels(): Promise<string[]> {
        try {
            const response = await api.get('/api/telegram/channels');
            return response.data.data;
        } catch (error) {
            console.error('Error fetching telegram channels:', error);
            throw error;
        }
    },

    /**
     * Получить статус сервиса Telegram
     */
    async getTelegramStatus(): Promise<any> {
        try {
            const response = await api.get('/api/telegram/status');
            return response.data.data;
        } catch (error) {
            console.error('Error fetching telegram status:', error);
            throw error;
        }
    },
    /**
     * Проверить канал Telegram
     */
    async checkTelegramChannel(channel: string): Promise<any> {
        try {
            const response = await api.get(`/api/telegram/channels/${channel}/check`);
            return response.data.data;
        } catch (error) {
            console.error('Error checking telegram channel:', error);
            throw error;
        }
    },
}