import {api} from "../apiService.ts";


export const macroDataService = {
    async getMacroDataLatest(country: string = 'RUS') {
        try {
            const response = await api.get('/api/macro-data/latest', {
                params: {country}
            } as any);
            return response.data;
        } catch (error) {
            console.error('Error fetching macro data latest:', error);
            return {success: false, data: null};
        }
    },

    async getMacroDataIndicators(indicatorType?: string, country: string = 'RUS', limit: number = 100) {
        try {
            const response = await api.get('/api/macro-data/indicators', {
                params: {indicatorType, country, limit}
            } as any);
            return response.data;
        } catch (error) {
            console.error('Error fetching macro data indicators:', error);
            return {success: false, data: null};
        }
    },

    async updateMacroData(sources?: { cbr?: boolean; rosstat?: boolean; moex?: boolean }) {
        try {
            const response = await api.post('/api/macro-data/update', {
                sources
            });
            return response.data;
        } catch (error: any) {
            console.error('Error updating macro data:', error);
            return {
                success: false,
                message: error.response?.data?.message || 'Ошибка обновления макро-данных',
                error: error.message
            };
        }
    },

    async loadMarketIndices() {
        try {
            const response = await api.post('/api/macro-data/load-indices');
            return response.data;
        } catch (error: any) {
            console.error('Error loading market indices:', error);
            return {
                success: false,
                message: error.response?.data?.message || 'Ошибка загрузки индексов',
                error: error.message
            };
        }
    },

    // Fundamental Data API methods
    async updateFundamentalData(options?: { forceUpdate?: boolean; syncAssets?: boolean }) {
        try {
            const response = await api.post('/api/fundamental-data/sync-and-fill', {
                syncAssets: options?.syncAssets !== false, // По умолчанию true
                forceUpdateFundamentals: options?.forceUpdate || false,
                delayMs: 1000
            });
            return response.data;
        } catch (error: any) {
            console.error('Error updating fundamental data:', error);
            return {
                success: false,
                message: error.response?.data?.message || 'Ошибка обновления фундаментальных данных',
                error: error.message
            };
        }
    },

    // Options Data API methods
    async updateOptionsData(options?: { forceUpdate?: boolean; delayMs?: number; limit?: number }) {
        try {
            const response = await api.post('/api/options-data/update-all', {
                forceUpdate: options?.forceUpdate || false,
                delayMs: options?.delayMs || 2000,
                limit: options?.limit || null
            });
            return response.data;
        } catch (error: any) {
            console.error('Error updating options data:', error);
            return {
                success: false,
                message: error.response?.data?.message || 'Ошибка обновления опционных данных',
                error: error.message
            };
        }
    },

    async updateOptionsForFigi(figi: string, options?: { forceUpdate?: boolean }) {
        try {
            const response = await api.post(`/api/options-data/update/${figi}`, {
                forceUpdate: options?.forceUpdate || false
            });
            return response.data;
        } catch (error: any) {
            console.error('Error updating options for figi:', error);
            throw error;
        }
    },

    async updateMissingIV(baseFigi?: string) {
        try {
            const response = await api.post('/api/options-data/update-missing-iv', {
                baseFigi: baseFigi || null
            });
            return response.data;
        } catch (error: any) {
            console.error('Error updating missing IV:', error);
            throw error;
        }
    },

    async getOptionsStats() {
        try {
            const response = await api.get('/api/options-data/stats');
            return response.data;
        } catch (error: any) {
            console.error('Error fetching options stats:', error);
            throw error;
        }
    },

    // Portfolio Rebalancing API methods
    async getRebalancingStatus() {
        try {
            const response = await api.get('/api/portfolio-rebalancing/status');
            return response.data;
        } catch (error) {
            console.error('Error fetching rebalancing status:', error);
            return {success: false, data: null};
        }
    },

    async checkRebalancingNeeded() {
        try {
            const response = await api.get('/api/portfolio-rebalancing/check');
            return response.data;
        } catch (error) {
            console.error('Error checking rebalancing:', error);
            return {success: false, data: null};
        }
    },

    async executeRebalancing(dryRun: boolean = false) {
        try {
            const response = await api.post('/api/portfolio-rebalancing/execute', {dryRun});
            return response.data;
        } catch (error) {
            console.error('Error executing rebalancing:', error);
            return {success: false, data: null};
        }
    },
}