import {api, MigrationPlan} from "../apiService.ts";

// ============================================================================
// МИГРАЦИЯ ПОРТФЕЛЯ
// ============================================================================

export const migrationService = {

    /**
     * Создать план миграции портфеля
     */
    async createMigrationPlan(realCapital: number): Promise<MigrationPlan> {
        try {
            const response = await api.post('/api/portfolio-migrator/create-plan', {realCapital});
            return response.data.result;
        } catch (error) {
            console.error('Error creating migration plan:', error);
            throw error;
        }
    },

    /**
     * Выполнить миграцию портфеля
     */
    async executeMigration(migrationPlan: any[]): Promise<any> {
        try {
            const response = await api.post('/api/portfolio-migrator/execute', {migrationPlan});
            return response.data.result;
        } catch (error) {
            console.error('Error executing migration:', error);
            throw error;
        }
    },

    /**
     * Получить статус миграции
     */
    async getPortfolioMigratorStatus(): Promise<any> {
        try {
            const response = await api.get('/api/portfolio-migrator/status');
            return response.data.status;
        } catch (error) {
            console.error('Error fetching migration status:', error);
            throw error;
        }
    },

    /**
     * Получить историю миграций
     */
    async getMigrationHistory(limit: number = 50): Promise<any[]> {
        try {
            const response = await api.get(`/api/portfolio-migrator/history?limit=${limit}`);
            return response.data.history;
        } catch (error) {
            console.error('Error fetching migration history:', error);
            throw error;
        }
    },
}