import {api, InstrumentStat, KellyCalculation, KellySettings} from "../apiService.ts";

export const stockService = {
    // ============================================================================
    // ДЕТАЛЬНАЯ ИНФОРМАЦИЯ ОБ АКЦИИ
    // ============================================================================

    /**
     * Получить детальную информацию об акции
     */
    async getStockDetail(figi: string): Promise<any> {
        try {
            const response = await api.get(`/api/market/stock/${figi}`);
            return response.data.data;
        } catch (error: any) {
            console.error('Error getting stock detail:', error);
            throw error;
        }
    },

    /**
     * Получить свечи для акции
     */
    async getStockCandles(figi: string, days: number = 365, interval: string = 'DAY'): Promise<any[]> {
        try {
            const response = await api.get(`/api/market/stock/${figi}/candles`, {
                params: {days, interval}
            } as any);
            return response.data.data || [];
        } catch (error: any) {
            console.error('Error getting stock candles:', error);
            throw error;
        }
    },

    /**
     * Получить историю предсказаний для акции
     */
    /**
     * Получить последнюю рекомендацию из БД (если свежая, меньше maxAgeHours)
     */
    async getLatestStockRecommendation(figi: string, maxAgeHours: number = 1): Promise<any> {
        try {
            const response = await api.get(`/api/market/stock/${figi}/latest-recommendation`, {
                params: {maxAgeHours}
            } as any);
            return response.data;
        } catch (error: any) {
            console.error('Error getting latest stock recommendation:', error);
            throw error;
        }
    },

    async getStockPredictionHistory(figi: string): Promise<any[]> {
        try {
            const response = await api.get(`/api/market/stock/${figi}/predictions`);
            return response.data.data || [];
        } catch (error: any) {
            console.error('Error getting stock prediction history:', error);
            throw error;
        }
    },

    /**
     * Получить все торговые сигналы из БД
     */
    async getAllSignals(limit: number = 50, activeOnly: boolean = false, direction?: string): Promise<any> {
        try {
            const params = new URLSearchParams();
            if (limit) params.append('limit', limit.toString());
            if (activeOnly) params.append('activeOnly', 'true');
            if (direction) params.append('direction', direction);

            const response = await api.get(`/api/market/signals?${params.toString()}`);
            return response.data;
        } catch (error: any) {
            console.error('Error getting all signals:', error);
            throw error;
        }
    },

    /**
     * Получить торговые сигналы для инструмента из БД
     */
    async getStockSignals(figi: string, limit: number = 20, activeOnly: boolean = false): Promise<any> {
        try {
            const params = new URLSearchParams();
            if (limit) params.append('limit', limit.toString());
            if (activeOnly) params.append('activeOnly', 'true');

            const response = await api.get(`/api/market/stock/${figi}/signals?${params.toString()}`);
            return response.data;
        } catch (error: any) {
            console.error('Error getting stock signals:', error);
            throw error;
        }
    },

    /**
     * Запрос и кеширование торговых сигналов для инструмента
     */
    async fetchAndCacheSignals(figi: string): Promise<any> {
        try {
            const response = await api.post(`/api/market/stock/${figi}/signals/fetch`);
            return response.data;
        } catch (error: any) {
            console.error('Error fetching and caching signals:', error);
            throw error;
        }
    },

    /**
     * Получить статистику по всем инструментам
     */
    async getInstrumentStats(params?: {
        minTrades?: number;
        sortBy?: string;
        order?: string;
        limit?: number
    }): Promise<{ success: boolean; data: InstrumentStat[]; count: number }> {
        try {
            const queryParams = new URLSearchParams();
            if (params?.minTrades) queryParams.append('minTrades', params.minTrades.toString());
            if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
            if (params?.order) queryParams.append('order', params.order);
            if (params?.limit) queryParams.append('limit', params.limit.toString());

            const response = await api.get(`/api/instrument-stats?${queryParams.toString()}`);
            return response.data;
        } catch (error: any) {
            console.error('Error getting instrument stats:', error);
            throw error;
        }
    },

    /**
     * Получить статистику по конкретному инструменту
     */
    async getInstrumentStat(figi: string): Promise<{ success: boolean; data: InstrumentStat }> {
        try {
            const response = await api.get(`/api/instrument-stats/${figi}`);
            return response.data;
        } catch (error: any) {
            console.error(`Error getting instrument stat for ${figi}:`, error);
            throw error;
        }
    },

    /**
     * Рассчитать Келли для инструмента
     */
    async calculateKelly(figi: string, portfolioValue: number): Promise<{ success: boolean; data: KellyCalculation }> {
        try {
            const response = await api.post('/api/instrument-stats/calculate-kelly', {figi, portfolioValue});
            return response.data;
        } catch (error: any) {
            console.error('Error calculating Kelly:', error);
            throw error;
        }
    },

    /**
     * Обновить статистику по инструменту
     */
    async refreshInstrumentStat(figi: string): Promise<{ success: boolean; message: string; data: InstrumentStat }> {
        try {
            const response = await api.post(`/api/instrument-stats/${figi}/refresh`);
            return response.data;
        } catch (error: any) {
            console.error(`Error refreshing instrument stat for ${figi}:`, error);
            throw error;
        }
    },

    /**
     * Получить топ инструментов по метрике
     */
    async getTopInstruments(metric: 'winRate' | 'kellyFraction' | 'totalTrades' | 'averageWin', limit: number = 10): Promise<{
        success: boolean;
        data: InstrumentStat[];
        metric: string;
        count: number
    }> {
        try {
            const response = await api.get(`/api/instrument-stats/top/${metric}?limit=${limit}`);
            return response.data;
        } catch (error: any) {
            console.error(`Error getting top instruments by ${metric}:`, error);
            throw error;
        }
    },

    /**
     * Получить настройки формулы Келли
     */
    async getKellySettings(): Promise<{ success: boolean; data: KellySettings }> {
        try {
            const response = await api.get('/api/system/settings/kelly');
            return response.data;
        } catch (error: any) {
            console.error('Error getting Kelly settings:', error);
            throw error;
        }
    },

    /**
     * Обновить настройки формулы Келли
     */
    async updateKellySettings(settings: Partial<KellySettings>): Promise<{
        success: boolean;
        message: string;
        data: Partial<KellySettings>
    }> {
        try {
            const response = await api.put('/api/system/settings/kelly', settings);
            return response.data;
        } catch (error: any) {
            console.error('Error updating Kelly settings:', error);
            throw error;
        }
    },

    // Advanced Metrics API methods
    async getAdvancedMetrics(period: 'daily' | 'weekly' | 'monthly' = 'daily', days: number = 30) {
        try {
            const response = await api.get('/api/advanced-metrics', {
                params: {period, days}
            } as any);
            return response.data;
        } catch (error) {
            console.error('Error fetching advanced metrics:', error);
            return {success: false, data: null};
        }
    },

    async getSortinoRatio(period: 'daily' | 'weekly' | 'monthly' = 'daily', days: number = 30, riskFreeRate?: number) {
        try {
            const response = await api.get('/api/advanced-metrics/sortino-ratio', {
                params: {period, days, ...(riskFreeRate && {riskFreeRate})}
            } as any);
            return response.data;
        } catch (error) {
            console.error('Error fetching Sortino Ratio:', error);
            return {success: false, data: null};
        }
    },

    async getCalmarRatio(period: 'daily' | 'weekly' | 'monthly' = 'daily', days: number = 30) {
        try {
            const response = await api.get('/api/advanced-metrics/calmar-ratio', {
                params: {period, days}
            } as any);
            return response.data;
        } catch (error) {
            console.error('Error fetching Calmar Ratio:', error);
            return {success: false, data: null};
        }
    },

    async getInformationRatio(period: 'daily' | 'weekly' | 'monthly' = 'daily', days: number = 30) {
        try {
            const response = await api.get('/api/advanced-metrics/information-ratio', {
                params: {period, days}
            } as any);
            return response.data;
        } catch (error) {
            console.error('Error fetching Information Ratio:', error);
            return {success: false, data: null};
        }
    },

    async getMAEMFE(limit: number = 100) {
        try {
            const response = await api.get('/api/advanced-metrics/mae-mfe', {
                params: {limit}
            } as any);
            return response.data;
        } catch (error) {
            console.error('Error fetching MAE/MFE:', error);
            return {success: false, data: null};
        }
    },

    async getPeriodAnalysis(
        period: 'daily' | 'weekly' | 'monthly' = 'daily',
        startDate?: string,
        endDate?: string
    ) {
        try {
            const response = await api.get('/api/advanced-metrics/period-analysis', {
                params: {period, ...(startDate && {startDate}), ...(endDate && {endDate})}
            } as any);
            return response.data;
        } catch (error) {
            console.error('Error fetching period analysis:', error);
            return {success: false, data: null};
        }
    },

    async getAdvancedMetricsSummary(period: 'daily' | 'weekly' | 'monthly' = 'daily', days: number = 30) {
        try {
            const response = await api.get('/api/advanced-metrics/summary', {
                params: {period, days}
            } as any);
            return response.data;
        } catch (error) {
            console.error('Error fetching advanced metrics summary:', error);
            return {success: false, data: null};
        }
    },
}