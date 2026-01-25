


// ============================================================================
// ТОРГОВЫЕ РОУТЫ
// ============================================================================
import {api, CapitalScalingStatus, Portfolio, TradingMode, TradingStats} from "../apiService.ts";

export const tradingService = {
    /**
     * Получить портфель
     */
    async getPortfolio(): Promise<Portfolio> {
        try {
            // Используем /api/portfolio вместо /api/trading/portfolio
            const response = await api.get('/api/portfolio');
            return response.data.data;
        } catch (error) {
            console.error('Error fetching portfolio:', error);
            throw error;
        }
    },

    /**
     * Получить реальный портфель
     */
    async getRealPortfolio(): Promise<Portfolio | null> {
        try {
            const response = await api.get('/api/portfolio/real');
            return response.data.data;
        } catch (error) {
            console.error('Error fetching real portfolio:', error);
            // Возвращаем null если реальный портфель недоступен
            return null;
        }
    },

    /**
     * Синхронизировать реальный портфель из Tinkoff API
     */
    async syncRealPortfolio(): Promise<any> {
        try {
            const response = await api.post('/api/portfolio/real/sync');
            return response.data;
        } catch (error) {
            console.error('Error syncing real portfolio:', error);
            throw error;
        }
    },

    /**
     * Синхронизировать портфель со стратегиями (Фаза 1, задача 1.2)
     */
    async syncPortfolioWithStrategies(options?: {
        maxLookbackHours?: number;
        silent?: boolean;
        createMissingPositions?: boolean
    }): Promise<any> {
        try {
            const response = await api.post('/api/portfolio/sync', options || {});
            return response.data;
        } catch (error) {
            console.error('Error syncing portfolio with strategies:', error);
            throw error;
        }
    },

    /**
     * Получить статус последней синхронизации портфеля
     */
    async getPortfolioSyncStatus(): Promise<any> {
        try {
            const response = await api.get('/api/portfolio/sync/status');
            return response.data;
        } catch (error) {
            console.error('Error fetching portfolio sync status:', error);
            throw error;
        }
    },

    /**
     * Получить несоответствия портфеля (позиции без стратегии, заявки без позиций)
     */
    async getPortfolioMismatches(): Promise<any> {
        try {
            const response = await api.get('/api/portfolio/mismatches');
            return response.data;
        } catch (error) {
            console.error('Error fetching portfolio mismatches:', error);
            throw error;
        }
    },

    /**
     * Назначить стратегию позиции вручную
     */
    async assignStrategyToPosition(figi: string, strategyId: number, requestId?: string): Promise<any> {
        try {
            const response = await api.post(`/api/portfolio/positions/${figi}/assign-strategy`, {
                strategyId,
                requestId
            });
            return response.data;
        } catch (error) {
            console.error('Error assigning strategy to position:', error);
            throw error;
        }
    },

    /**
     * Получить статистику торговли
     */
    async getTradingStats(): Promise<TradingStats> {
        try {
            const response = await api.get('/api/trading/stats');
            return response.data.data;
        } catch (error) {
            console.error('Error fetching trading stats:', error);
            throw error;
        }
    },

    /**
     * Получить историю сделок
     */
    async getTradingTrades(): Promise<any[]> {
        try {
            const response = await api.get('/api/trading/trades');
            return response.data.data;
        } catch (error) {
            console.error('Error fetching trading trades:', error);
            throw error;
        }
    },

    /**
     * Выполнить сделку
     */
    async executeTrade(action: 'BUY' | 'SELL', figi: string, quantity: number, price?: number): Promise<any> {
        try {
            const response = await api.post('/api/trading/execute', {action, figi, quantity, price});
            return response.data.data;
        } catch (error) {
            console.error('Error executing trade:', error);
            throw error;
        }
    },
    /**
     * Получить текущий режим торговли
     */
    async getTradingMode(): Promise<TradingMode> {
        try {
            const response = await api.get('/api/trading-mode/current');
            return response.data;
        } catch (error) {
            console.error('Error fetching trading mode:', error);
            throw error;
        }
    },

    /**
     * Получить текущий торговый режим (алиас)
     */
    async getCurrentTradingMode(): Promise<TradingMode> {
        return this.getTradingMode();
    },

    /**
     * Проверить возможность переключения на микро-капитал
     */
    async canSwitchToMicro(): Promise<any> {
        try {
            const response = await api.get('/api/switch-validator/micro');
            return response.data;
        } catch (error) {
            console.error('Error checking micro switch readiness:', error);
            throw error;
        }
    },

    /**
     * Проверить возможность переключения на полный режим
     */
    async canSwitchToFull(): Promise<any> {
        try {
            const response = await api.get('/api/switch-validator/full');
            return response.data;
        } catch (error) {
            console.error('Error checking full switch readiness:', error);
            throw error;
        }
    },

    /**
     * Переключить режим торговли
     */
    async switchTradingMode(mode: 'paper' | 'micro' | 'real'): Promise<any> {
        try {
            const response = await api.post('/api/trading-mode/switch', {mode});
            return response.data;
        } catch (error) {
            console.error('Error switching trading mode:', error);
            throw error;
        }
    },

    /**
     * Активация торгового движка
     */
    async activateTradingEngine(): Promise<any> {
        try {
            const response = await api.post('/api/trading/activate');
            return response.data;
        } catch (error) {
            console.error('Error activating trading engine:', error);
            throw error;
        }
    },

    /**
     * Деактивация торгового движка
     */
    async deactivateTradingEngine(): Promise<any> {
        try {
            const response = await api.post('/api/trading/deactivate');
            return response.data;
        } catch (error) {
            console.error('Error deactivating trading engine:', error);
            throw error;
        }
    },

    /**
     * Получить статус торгового движка
     */
    async getTradingEngineStatus(): Promise<any> {
        try {
            const response = await api.get('/api/trading/status');
            return response.data;
        } catch (error) {
            console.error('Error getting trading engine status:', error);
            throw error;
        }
    },

    /**
     * Проверить возможность переключения на режим
     */
    async canSwitchToMode(mode: 'paper' | 'micro' | 'real'): Promise<any> {
        try {
            const response = await api.get(`/api/trading-mode/can-switch/${mode}`);
            return response.data;
        } catch (error) {
            console.error('Error checking if can switch to mode:', error);
            throw error;
        }
    },


    /**
     * Получить статус масштабирования капитала
     */
    async getCapitalScalingStatus(): Promise<CapitalScalingStatus> {
        try {
            const response = await api.get('/api/capital-scaling/status');
            return response.data.data;
        } catch (error) {
            console.error('Error fetching capital scaling status:', error);
            throw error;
        }
    },

    /**
     * Анализ производительности
     */
    async analyzeCapitalPerformance(period: string = 'month', days: number = 30): Promise<any> {
        try {
            const response = await api.get(`/api/capital-scaling/performance?period=${period}&days=${days}`);
            return response.data.data;
        } catch (error) {
            console.error('Error analyzing capital performance:', error);
            throw error;
        }
    },

    /**
     * Проверить готовность к увеличению капитала
     */
    async checkCapitalIncreaseReadiness(): Promise<any> {
        try {
            const response = await api.get('/api/capital-scaling/can-increase');
            return response.data.data;
        } catch (error) {
            console.error('Error checking capital increase readiness:', error);
            throw error;
        }
    },

    /**
     * Увеличить капитал
     */
    async increaseCapital(amount: number, reason: string): Promise<any> {
        try {
            const response = await api.post('/api/capital-scaling/increase', {amount, reason});
            return response.data.data;
        } catch (error) {
            console.error('Error increasing capital:', error);
            throw error;
        }
    },
    /**
     * Получить статус отслеживания прибыльности
     */
    async getProfitabilityStatus(): Promise<any> {
        try {
            const response = await api.get('/api/profitability/status');
            return response.data.data;
        } catch (error) {
            console.error('Error fetching profitability status:', error);
            throw error;
        }
    },

    /**
     * Анализ прибыльности
     */
    async analyzeProfitability(period: string = 'month', days: number = 30): Promise<any> {
        try {
            const response = await api.get(`/api/profitability/analysis?period=${period}&days=${days}`);
            return response.data.data;
        } catch (error) {
            console.error('Error analyzing profitability:', error);
            throw error;
        }
    },

    /**
     * Генерация отчета о прибыльности
     */
    async generateProfitabilityReport(period: string = 'month', days: number = 30): Promise<any> {
        try {
            const response = await api.get(`/api/profitability/report?period=${period}&days=${days}`);
            return response.data.data;
        } catch (error) {
            console.error('Error generating profitability report:', error);
            throw error;
        }
    },

    /**
     * Уменьшить капитал
     */
    async decreaseCapital(amount: number, reason: string): Promise<any> {
        try {
            const response = await api.post('/api/capital-scaling/decrease', {amount, reason});
            return response.data.data;
        } catch (error) {
            console.error('Error decreasing capital:', error);
            throw error;
        }
    },

    /**
     * Автоматическая корректировка капитала
     */
    async autoAdjustCapital(): Promise<any> {
        try {
            const response = await api.post('/api/capital-scaling/auto-adjust');
            return response.data.data;
        } catch (error) {
            console.error('Error auto adjusting capital:', error);
            throw error;
        }
    },

    /**
     * Получить историю масштабирования капитала
     */
    async getCapitalScalingHistory(limit: number = 50): Promise<any[]> {
        try {
            const response = await api.get(`/api/capital-scaling/history?limit=${limit}`);
            return response.data.data;
        } catch (error) {
            console.error('Error fetching capital scaling history:', error);
            throw error;
        }
    },

    /**
     * Получить уровни капитала
     */
    async getCapitalLevels(): Promise<any> {
        try {
            const response = await api.get('/api/capital-scaling/levels');
            return response.data.data;
        } catch (error) {
            console.error('Error fetching capital levels:', error);
            throw error;
        }
    },

    /**
     * Обновить уровни капитала
     */
    async updateCapitalLevels(levels: any): Promise<any> {
        try {
            const response = await api.post('/api/capital-scaling/levels', {levels});
            return response.data.data;
        } catch (error) {
            console.error('Error updating capital levels:', error);
            throw error;
        }
    },

    /**
     * Обновить настройки масштабирования капитала
     */
    async updateCapitalScalingSettings(settings: any): Promise<any> {
        try {
            const response = await api.post('/api/capital-scaling/settings', {settings});
            return response.data.data;
        } catch (error) {
            console.error('Error updating capital scaling settings:', error);
            throw error;
        }
    },

    /**
     * Получить статус распределения капитала
     */
    async getCapitalAllocationStatus(): Promise<any> {
        try {
            const response = await api.get('/api/capital-allocation/status');
            return response.data.data;
        } catch (error) {
            console.error('Error fetching capital allocation status:', error);
            throw error;
        }
    },

    /**
     * Получить анализ портфеля для распределения
     */
    async getCapitalAllocationPortfolioAnalysis(): Promise<any> {
        try {
            const response = await api.get('/api/capital-allocation/portfolio-analysis');
            return response.data.data;
        } catch (error) {
            console.error('Error fetching capital allocation portfolio analysis:', error);
            throw error;
        }
    },

    /**
     * Оптимизировать распределение капитала
     */
    async optimizeCapitalAllocation(strategy: string = 'balanced', options: any = {}): Promise<any> {
        try {
            const response = await api.post('/api/capital-allocation/optimize', {strategy, options});
            return response.data.data;
        } catch (error) {
            console.error('Error optimizing capital allocation:', error);
            throw error;
        }
    },

    /**
     * Автоматическая ребалансировка портфеля
     */
    async autoRebalancePortfolio(strategy: string = 'balanced', options: any = {}): Promise<any> {
        try {
            const response = await api.post('/api/capital-allocation/auto-rebalance', {strategy, options});
            return response.data.data;
        } catch (error) {
            console.error('Error auto rebalancing portfolio:', error);
            throw error;
        }
    },

    /**
     * Получить доступные инструменты для распределения
     */
    async getCapitalAllocationInstruments(): Promise<any[]> {
        try {
            const response = await api.get('/api/capital-allocation/instruments');
            return response.data.data;
        } catch (error) {
            console.error('Error fetching capital allocation instruments:', error);
            throw error;
        }
    },

    /**
     * Получить историю ребалансировки
     */
    async getCapitalAllocationHistory(limit: number = 50): Promise<any[]> {
        try {
            const response = await api.get(`/api/capital-allocation/history?limit=${limit}`);
            return response.data.data;
        } catch (error) {
            console.error('Error fetching capital allocation history:', error);
            throw error;
        }
    },

    /**
     * Обновить настройки распределения капитала
     */
    async updateCapitalAllocationSettings(settings: any): Promise<any> {
        try {
            const response = await api.post('/api/capital-allocation/settings', {settings});
            return response.data.data;
        } catch (error) {
            console.error('Error updating capital allocation settings:', error);
            throw error;
        }
    },

    /**
     * Получить активные миграции
     */
    async getActiveMigrations(): Promise<any[]> {
        try {
            const response = await api.get('/api/portfolio-migrator/active');
            return response.data.data;
        } catch (error) {
            console.error('Error fetching active migrations:', error);
            throw error;
        }
    },

    /**
     * Очистить старые миграции
     */
    async cleanupMigrations(daysOld: number = 30): Promise<any> {
        try {
            const response = await api.post('/api/portfolio-migrator/cleanup', {daysOld});
            return response.data.data;
        } catch (error) {
            console.error('Error cleaning up migrations:', error);
            throw error;
        }
    },

    /**
     * Остановить миграцию
     */
    async stopMigration(migrationId: string): Promise<any> {
        try {
            const response = await api.post('/api/portfolio-migrator/stop', {migrationId});
            return response.data.data;
        } catch (error) {
            console.error('Error stopping migration:', error);
            throw error;
        }
    },

    /**
     * Получить настройки миграции
     */
    async getMigrationSettings(): Promise<any> {
        try {
            const response = await api.get('/api/portfolio-migrator/settings');
            return response.data.data;
        } catch (error) {
            console.error('Error fetching migration settings:', error);
            throw error;
        }
    },

    /**
     * Обновить настройки миграции
     */
    async updateMigrationSettings(settings: any): Promise<any> {
        try {
            const response = await api.post('/api/portfolio-migrator/settings', {settings});
            return response.data.data;
        } catch (error) {
            console.error('Error updating migration settings:', error);
            throw error;
        }
    },
    // ============================================================================
    // ТОРГОВЫЕ ЗАЯВКИ (TRADING REQUESTS)
    // ============================================================================

    /**
     * Получить список торговых заявок
     */
    async getTradingRequests(status?: string, limit?: number, tradingMode?: string): Promise<any> {
        try {
            const params = new URLSearchParams();
            if (status) params.append('status', status);
            if (limit) params.append('limit', limit.toString());
            if (tradingMode) params.append('tradingMode', tradingMode);

            const response = await api.get(`/api/trading-requests?${params.toString()}`);
            return response.data.data;
        } catch (error) {
            console.error('Error getting trading requests:', error);
            throw error;
        }
    },

    /**
     * Получить ожидающие заявки
     */
    async getPendingTradingRequests(tradingMode?: string): Promise<any> {
        try {
            const params = new URLSearchParams();
            if (tradingMode) params.append('tradingMode', tradingMode);

            const response = await api.get(`/api/trading-requests/pending?${params.toString()}`);
            return response.data.data;
        } catch (error) {
            console.error('Error getting pending trading requests:', error);
            throw error;
        }
    },

    /**
     * Получить одобренные заявки
     */
    async getApprovedTradingRequests(tradingMode?: string): Promise<any> {
        try {
            const params = new URLSearchParams();
            if (tradingMode) params.append('tradingMode', tradingMode);

            const response = await api.get(`/api/trading-requests/approved?${params.toString()}`);
            return response.data.data;
        } catch (error) {
            console.error('Error getting approved trading requests:', error);
            throw error;
        }
    },

    /**
     * Получить статистику торговых заявок
     */
    async getTradingRequestsStats(tradingMode?: string): Promise<any> {
        try {
            const params = new URLSearchParams();
            if (tradingMode) params.append('tradingMode', tradingMode);

            const response = await api.get(`/api/trading-requests/stats?${params.toString()}`);
            return response.data;
        } catch (error) {
            console.error('Error getting trading requests stats:', error);
            throw error;
        }
    },

    /**
     * Создать торговую заявку из рекомендации
     */
    async createTradingRequest(recommendationFigi: string, options?: any, recommendationData?: any): Promise<any> {
        try {
            const response = await api.post('/api/trading-requests/create', {
                recommendationFigi,
                recommendationData, // Передаем полные данные рекомендации как fallback
                options
            });
            return response.data.data;
        } catch (error) {
            console.error('Error creating trading request:', error);
            throw error;
        }
    },

    /**
     * Массовое создание торговых заявок
     */
    async createBulkTradingRequests(recommendationFigis: string[], options?: any): Promise<any> {
        try {
            const response = await api.post('/api/trading-requests/create-bulk', {
                recommendationFigis,
                options
            });
            return response.data.data;
        } catch (error) {
            console.error('Error creating bulk trading requests:', error);
            throw error;
        }
    },

    /**
     * Подтвердить торговую заявку
     */
    async approveTradingRequest(requestId: string, comment?: string): Promise<any> {
        try {
            const response = await api.post(`/api/trading-requests/${requestId}/approve`, {
                comment
            });
            return response.data.data;
        } catch (error) {
            console.error('Error approving trading request:', error);
            throw error;
        }
    },

    /**
     * Отклонить торговую заявку
     */
    async rejectTradingRequest(requestId: string, reason: string): Promise<any> {
        try {
            const response = await api.post(`/api/trading-requests/${requestId}/reject`, {
                reason
            });
            return response.data.data;
        } catch (error) {
            console.error('Error rejecting trading request:', error);
            throw error;
        }
    },

    /**
     * Исполнить торговую заявку
     */
    async executeTradingRequest(requestId: string): Promise<any> {
        try {
            const response = await api.post(`/api/trading-requests/${requestId}/execute`);
            return response.data.data;
        } catch (error) {
            console.error('Error executing trading request:', error);
            throw error;
        }
    },

    /**
     * Отменить торговую заявку
     */
    async cancelTradingRequest(requestId: string, reason?: string): Promise<any> {
        try {
            const response = await api.post(`/api/trading-requests/${requestId}/cancel`, {
                reason
            });
            return response.data.data;
        } catch (error) {
            console.error('Error cancelling trading request:', error);
            throw error;
        }
    },

    /**
     * Массовое подтверждение заявок
     */
    async bulkApproveTradingRequests(requestIds: string[], comment?: string): Promise<any> {
        try {
            const response = await api.post('/api/trading-requests/bulk-approve', {
                requestIds,
                comment
            });
            return response.data.data;
        } catch (error) {
            console.error('Error bulk approving trading requests:', error);
            throw error;
        }
    },

    /**
     * Массовое отклонение заявок
     */
    async bulkRejectTradingRequests(requestIds: string[], reason: string): Promise<any> {
        try {
            const response = await api.post('/api/trading-requests/bulk-reject', {
                requestIds,
                reason
            });
            return response.data.data;
        } catch (error) {
            console.error('Error bulk rejecting trading requests:', error);
            throw error;
        }
    },

    /**
     * Получить статистику торговых заявок
     */
    async getTradingRequestStats(tradingMode?: string): Promise<any> {
        try {
            const params = new URLSearchParams();
            if (tradingMode) params.append('tradingMode', tradingMode);

            const response = await api.get(`/api/trading-requests/stats?${params.toString()}`);
            return response.data.data;
        } catch (error) {
            console.error('Error getting trading request stats:', error);
            throw error;
        }
    },

    /**
     * Получить статистику по всем режимам торговли
     */
    async getTradingRequestStatsByMode(): Promise<any> {
        try {
            const response = await api.get('/api/trading-requests/stats-by-mode');
            return response.data.data;
        } catch (error) {
            console.error('Error getting trading request stats by mode:', error);
            throw error;
        }
    },

    /**
     * Очистка завершенных заявок (одобренных и отклоненных)
     */
    async cleanupCompletedRequests(options?: { olderThanDays?: number; tradingMode?: string }): Promise<any> {
        try {
            const params = new URLSearchParams();
            if (options?.olderThanDays) params.append('olderThanDays', options.olderThanDays.toString());
            if (options?.tradingMode) params.append('tradingMode', options.tradingMode);

            const response = await api.delete(`/api/trading-requests/cleanup?${params.toString()}`);
            return response.data;
        } catch (error) {
            console.error('Error cleaning up completed requests:', error);
            throw error;
        }
    },

    /**
     * Получить статистику завершенных заявок (перед очисткой)
     */
    async getCompletedRequestsStats(tradingMode?: string): Promise<any> {
        try {
            const params = new URLSearchParams();
            if (tradingMode) params.append('tradingMode', tradingMode);

            const response = await api.get(`/api/trading-requests/cleanup/stats?${params.toString()}`);
            return response.data.data;
        } catch (error) {
            console.error('Error getting completed requests stats:', error);
            throw error;
        }
    },
    // ========================================
    // TRADING MODE DASHBOARD API METHODS
    // ========================================

    /**
     * Получить историю переходов между режимами торговли
     */
    async getTradingModeHistory(): Promise<any[]> {
        try {
            const response = await api.get('/api/trading-mode/history');
            return response.data;
        } catch (error) {
            console.error('Error fetching trading mode history:', error);
            throw error;
        }
    },

    /**
     * Получить настройки режима торговли
     */
    async getTradingModeSettings(): Promise<any> {
        try {
            const response = await api.get('/api/trading-mode/settings');
            return response.data;
        } catch (error) {
            console.error('Error fetching trading mode settings:', error);
            throw error;
        }
    },

    /**
     * Обновить настройки режима торговли
     */
    async updateTradingModeSettings(settings: any): Promise<any> {
        try {
            const response = await api.put('/api/trading-mode/settings', settings);
            return response.data;
        } catch (error) {
            console.error('Error updating trading mode settings:', error);
            throw error;
        }
    },

    /**
     * Получить результаты валидации для переходов между режимами
     */
    async getTradingModeValidation(): Promise<any> {
        try {
            const response = await api.get('/api/trading-mode/validation');
            return response.data;
        } catch (error) {
            console.error('Error fetching trading mode validation:', error);
            throw error;
        }
    },

    /**
     * Получить данные производительности по режимам торговли
     */
    async getTradingModePerformance(): Promise<any> {
        try {
            const response = await api.get('/api/trading-mode/performance');
            return response.data;
        } catch (error) {
            console.error('Error fetching trading mode performance:', error);
            throw error;
        }
    },

    /**
     * Запустить миграцию портфеля между режимами
     */
    async startPortfolioMigration(fromMode: string, toMode: string, options: any = {}): Promise<any> {
        try {
            const response = await api.post('/api/trading-mode/migrate', {fromMode, toMode, options});
            return response.data;
        } catch (error) {
            console.error('Error starting portfolio migration:', error);
            throw error;
        }
    },

    /**
     * Получить статус миграции портфеля
     */
    async getMigrationStatus(): Promise<any> {
        try {
            const response = await api.get('/api/trading-mode/migration-status');
            return response.data;
        } catch (error) {
            console.error('Error fetching migration status:', error);
            throw error;
        }
    },

    // ========================================
    // PORTFOLIO VISUALIZATION API METHODS
    // ========================================

    /**
     * Получить позиции портфеля
     */
    async getPortfolioPositions(): Promise<any> {
        try {
            const response = await api.get('/api/portfolio/positions');
            return response.data;
        } catch (error) {
            console.error('Error fetching portfolio positions:', error);
            throw error;
        }
    },

    /**
     * Получить детальную информацию о позиции
     */
    async getPositionDetails(figi: string): Promise<any> {
        try {
            const response = await api.get(`/api/portfolio/positions/${figi}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching position details:', error);
            throw error;
        }
    },

    /**
     * Получить историю портфеля
     */
    async getPortfolioHistory(period: string = '1M'): Promise<any> {
        try {
            const response = await api.get(`/api/portfolio/history?period=${period}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching portfolio history:', error);
            throw error;
        }
    },

    /**
     * Получить аналитику портфеля
     */
    async getPortfolioAnalytics(): Promise<any> {
        try {
            const response = await api.get('/api/portfolio/analytics');
            return response.data;
        } catch (error) {
            console.error('Error fetching portfolio analytics:', error);
            throw error;
        }
    },

    /**
     * Получить распределение портфеля по секторам
     */
    async getPortfolioSectorAllocation(): Promise<any> {
        try {
            const response = await api.get('/api/portfolio/sector-allocation');
            return response.data;
        } catch (error) {
            console.error('Error fetching sector allocation:', error);
            throw error;
        }
    },

    /**
     * Получить риск-метрики портфеля
     */
    async getPortfolioRiskMetrics(): Promise<any> {
        try {
            const response = await api.get('/api/portfolio/risk-metrics');
            return response.data;
        } catch (error) {
            console.error('Error fetching portfolio risk metrics:', error);
            throw error;
        }
    },

    /**
     * Анализ портфеля с рекомендациями по продаже/удержанию
     */
    async analyzePortfolio(): Promise<any> {
        try {
            const response = await api.post('/api/neural-network/analyze-portfolio');
            return response.data;
        } catch (error: any) {
            console.error('Error analyzing portfolio:', error);
            throw error;
        }
    },

    /**
     * Анализ только позиций портфеля (без сканирования рынка), сразу с результатом
     */
    async analyzePortfolioPositionsOnly(portfolioType: 'real' | 'virtual' | 'paper' = 'virtual'): Promise<any> {
        try {
            const response = await api.post('/api/neural-network/analyze-portfolio/positions-only', {portfolioType});
            return response.data;
        } catch (error: any) {
            console.error('Error analyzing portfolio positions only:', error);
            throw error;
        }
    },

}