



// ============================================================================
// РЕКОМЕНДАЦИИ
// ============================================================================
import {api, Recommendation} from "../apiService.ts";

export const recommendationService = {
    /**
     * Получить торговые рекомендации
     */
    async getRecommendations(): Promise<Recommendation[]> {
        try {
            const response = await api.get('/api/recommendations');
            return response.data.data;
        } catch (error) {
            console.error('Error fetching recommendations:', error);
            throw error;
        }
    },

    /**
     * Получить доступные инструменты
     */
    async getInstruments(): Promise<any[]> {
        try {
            const response = await api.get('/api/market/instruments');
            return response.data.data;
        } catch (error) {
            console.error('Error fetching instruments:', error);
            throw error;
        }
    },
    // ============================================================================
    // РЕКОМЕНДАЦИИ (RECOMMENDATIONS)
    // ============================================================================

    /**
     * Получить все рекомендации
     */
    async getAllRecommendations(): Promise<any> {
        try {
            // Используем /api/recommendations (из БД) вместо /api/market/recommendations (из кеша)
            const response = await api.get('/api/recommendations');
            return response.data.data;
        } catch (error) {
            console.error('Error getting all recommendations:', error);
            throw error;
        }
    },

    // ============================================================================
    // СТРАТЕГИИ ТОРГОВЛИ
    // ============================================================================

    /**
     * Получить все стратегии с распределением бюджета
     */
    async getAllStrategies(): Promise<any> {
        try {
            const response = await api.get('/api/strategies');
            return response.data.data || response.data;
        } catch (error) {
            console.error('Error fetching strategies:', error);
            throw error;
        }
    },

    /**
     * Получить детали стратегии
     */
    async getStrategy(id: number): Promise<any> {
        try {
            const response = await api.get(`/api/strategies/${id}`);
            return response.data.data || response.data;
        } catch (error) {
            console.error('Error fetching strategy:', error);
            throw error;
        }
    },

    /**
     * Обновить стратегию
     */
    async updateStrategy(id: number, data: any): Promise<any> {
        try {
            const response = await api.put(`/api/strategies/${id}`, data);
            return response.data.data || response.data;
        } catch (error) {
            console.error('Error updating strategy:', error);
            throw error;
        }
    },

    /**
     * Перебалансировать стратегии
     */
    async rebalanceStrategies(allocations: Record<number, number>): Promise<any> {
        try {
            const response = await api.post('/api/strategies/rebalance', {allocations});
            return response.data.data || response.data;
        } catch (error) {
            console.error('Error rebalancing strategies:', error);
            throw error;
        }
    },

    /**
     * Получить распределение бюджета
     */
    async getStrategyAllocations(): Promise<any> {
        try {
            const response = await api.get('/api/strategies/allocations/summary');
            // Endpoint возвращает { success: true, data: { strategies: [...], totalAllocated, ... } }
            // Возвращаем весь объект data, чтобы фронтенд мог получить и strategies, и summary данные
            return response.data.data || response.data;
        } catch (error) {
            console.error('Error fetching strategy allocations:', error);
            // Возвращаем пустой объект вместо throw, чтобы не ломать загрузку портфеля
            return {strategies: [], totalAllocated: 0, totalUsed: 0, totalAvailable: 0};
        }
    },

    /**
     * Получить статистику по стратегии
     */
    async getStrategyStats(id: number): Promise<any> {
        try {
            const response = await api.get(`/api/strategies/${id}/stats`);
            return response.data.data || response.data;
        } catch (error) {
            console.error('Error fetching strategy stats:', error);
            throw error;
        }
    },

    /**
     * Получить статистику по всем стратегиям
     */
    async getAllStrategyStats(): Promise<any> {
        try {
            const response = await api.get('/api/strategies/stats/all');
            return response.data.data || response.data;
        } catch (error) {
            console.error('Error fetching all strategy stats:', error);
            throw error;
        }
    },

    /**
     * Получить доступный бюджет стратегии
     */
    async getStrategyAvailableBudget(id: number): Promise<any> {
        try {
            const response = await api.get(`/api/strategies/${id}/available-budget`);
            return response.data.data || response.data;
        } catch (error) {
            console.error('Error fetching strategy available budget:', error);
            throw error;
        }
    },

    /**
     * Получить рекомендации по типу
     */
    async getRecommendationsByType(type: string): Promise<any> {
        try {
            const response = await api.get(`/api/recommendations/type/${type}`);
            return response.data.data;
        } catch (error) {
            console.error('Error getting recommendations by type:', error);
            throw error;
        }
    },

    /**
     * Получить топ рекомендации
     */
    async getTopRecommendations(limit: number = 10): Promise<any> {
        try {
            const response = await api.get(`/api/recommendations/top?limit=${limit}`);
            return response.data.data;
        } catch (error) {
            console.error('Error getting top recommendations:', error);
            throw error;
        }
    },
}