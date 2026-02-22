import {api} from "../apiService.ts";


export const newsService = {
    /**
     * Получить новости для инструмента
     */
    async getNews(figi: string, limit: number = 10, days: number = 7): Promise<any[]> {
        try {
            const response = await api.get(`/api/news/${figi}?limit=${limit}&days=${days}`);
            return response.data.data;
        } catch (error) {
            console.error('Error fetching news:', error);
            throw error;
        }
    },

    /**
     * Запросить свежие новости для инструмента по FIGI
     */
    async fetchFreshNews(figi: string): Promise<any> {
        try {
            const response = await api.post(`/api/news/${figi}/fresh`);
            return response.data;
        } catch (error: any) {
            console.error('Error fetching fresh news:', error);
            throw error;
        }
    },

    /**
     * Анализ влияния новостей
     */
    async analyzeNewsImpact(figi: string, days: number = 30): Promise<any> {
        try {
            const response = await api.get(`/api/news/${figi}/impact?days=${days}`);
            return response.data.data;
        } catch (error) {
            console.error('Error analyzing news impact:', error);
            throw error;
        }
    },

    /**
     * Получить статус сервиса новостей
     */
    async getNewsStatus(): Promise<any> {
        try {
            const response = await api.get('/api/news/status');
            return response.data.data;
        } catch (error) {
            console.error('Error fetching news status:', error);
            throw error;
        }
    },

    /**
     * Проверка статуса исторических новостей
     */
    async getHistoricalNewsStatus(): Promise<any> {
        try {
            const response = await api.get('/api/news/status/historical');
            return response.data.data;
        } catch (error) {
            console.error('Error fetching historical news status:', error);
            throw error;
        }
    },

    /**
     * Получение даты последней новости для FIGI
     */
    async getLastNewsDate(figi?: string): Promise<any> {
        try {
            const url = figi ? `/api/news/last-date/${figi}` : '/api/news/last-date';
            const response = await api.get(url);
            return response.data.data;
        } catch (error) {
            console.error('Error fetching last news date:', error);
            throw error;
        }
    },

    /**
     * Получение списка доступных инструментов для тестирования
     */
    async getNewsInstruments(limit: number = 50, currency: string = 'RUB', instrumentType: string = 'share'): Promise<any> {
        try {
            const response = await api.get('/api/news/instruments', {
                params: {limit, currency, instrumentType}
            } as any);
            return response.data;
        } catch (error) {
            console.error('Error getting news instruments:', error);
            throw error;
        }
    },

    /**
     * Тестовый запрос новостей через NewsAPI.org для одного тикера
     */
    async testNewsApiNews(ticker: string): Promise<any> {
        try {
            const response = await api.post('/api/news/test-newsapi', {ticker});
            return response.data;
        } catch (error) {
            console.error('Error testing NewsAPI news:', error);
            throw error;
        }
    },

    /**
     * Загрузка исторических новостей за год для всех акций
     */
    async loadHistoricalNews(year?: number): Promise<any> {
        try {
            const response = await api.post('/api/news/load-historical', {
                year: year || new Date().getFullYear()
            });
            return response.data;
        } catch (error) {
            console.error('Error loading historical news:', error);
            throw error;
        }
    },
}