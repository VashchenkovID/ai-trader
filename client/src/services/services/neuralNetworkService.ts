// ============================================================================
// ОБУЧЕНИЕ НЕЙРОСЕТЕЙ
// ============================================================================

import {api} from "../apiService.ts";

export const neuralNetworkService = {
    /**
     * Получить статус нейросети
     */
    async getNeuralNetworkStatus(): Promise<any> {
        try {
            const response = await api.get('/api/neural-network/status');
            return response.data;
        } catch (error) {
            console.error('Error fetching neural network status:', error);
            throw error;
        }
    },

    /**
     * Активировать нейросеть
     */
    async activateNeuralNetwork(): Promise<any> {
        try {
            const response = await api.post('/api/neural-network/activate');
            return response.data;
        } catch (error) {
            console.error('Error activating neural network:', error);
            throw error;
        }
    },

    /**
     * Запустить обучение одного инструмента
     */
    async trainNeuralNetwork(figi: string, options: any = {}): Promise<any> {
        try {
            const response = await api.post('/api/neural-network/train', {figi, options});
            return response.data.data;
        } catch (error) {
            console.error('Error training neural network:', error);
            throw error;
        }
    },

    /**
     * Запустить пакетное обучение
     */
    async trainBatchNeuralNetwork(instruments: string[], options: any = {}): Promise<any> {
        try {
            // Полный запуск обучения всех сетей на бэке
            const response = await api.post('/api/training/batch-train-all', {instruments, options});
            return response.data.data ?? response.data;
        } catch (error) {
            console.error('Error training all neural networks:', error);
            throw error;
        }
    },

    /**
     * Получить доступные инструменты для обучения
     */
    async getNeuralNetworkInstruments(): Promise<any[]> {
        try {
            const response = await api.get('/api/neural-network/instruments');
            return response.data.data;
        } catch (error) {
            console.error('Error fetching neural network instruments:', error);
            throw error;
        }
    },

    /**
     * Обновить кеш данных (инкрементальное обновление)
     */
    async refreshCache(): Promise<any> {
        try {
            const response = await api.post('/api/system/cache/update');
            return response.data;
        } catch (error) {
            console.error('Error refreshing cache:', error);
            throw error;
        }
    },

    /**
     * Полное обновление кеша данных
     */
    async fullRefreshCache(): Promise<any> {
        try {
            const response = await api.post('/api/system/cache/full-update');
            return response.data;
        } catch (error) {
            console.error('Error full refreshing cache:', error);
            throw error;
        }
    },

    /**
     * Обновление новостей (такой же запрос как в кроне)
     */
    async updateNews(): Promise<any> {
        try {
            const response = await api.post('/api/news/update-daily');
            return response.data;
        } catch (error) {
            console.error('Error updating news:', error);
            throw error;
        }
    },
    /**
     * Обучить модель ансамбля
     */
    async trainEnsembleModel(modelType: string): Promise<any> {
        try {
            const response = await api.post('/api/ensemble/train', {modelType});
            return response.data;
        } catch (error) {
            console.error('Error training ensemble model:', error);
            throw error;
        }
    },

    /**
     * Обучить все модели ансамбля
     */
    async trainAllEnsembleModels(figi: string, options: any = {}): Promise<any> {
        try {
            const response = await api.post('/api/ensemble/train', {figi, options});
            return response.data;
        } catch (error) {
            console.error('Error training all ensemble models:', error);
            throw error;
        }
    },

    /**
     * Пакетное обучение ансамбля по множеству инструментов
     */
    async trainBatchEnsemble(instruments: string[], options: any = {}): Promise<any> {
        try {
            const response = await api.post('/api/ensemble/batch-train', {instruments, options});
            return response.data;
        } catch (error) {
            console.error('Error batch training ensemble:', error);
            throw error;
        }
    },

    /**
     * Пакетное обучение Meta-Learning по множеству инструментов
     */
    async trainBatchMetaLearning(instruments: string[], options: any = {}): Promise<any> {
        try {
            // Используем существующий полный маршрут обучения
            const response = await api.post('/api/training/meta-learning/train', {instruments, options});
            return response.data;
        } catch (error) {
            console.error('Error training meta-learning:', error);
            throw error;
        }
    },

    /**
     * Пакетное обучение Reinforcement Learning по множеству инструментов
     */
    async trainBatchReinforcementLearning(instruments: string[], options: any = {}): Promise<any> {
        try {
            // Используем существующий полный маршрут обучения
            const response = await api.post('/api/training/reinforcement-learning/train', {instruments, options});
            return response.data;
        } catch (error) {
            console.error('Error training reinforcement learning:', error);
            throw error;
        }
    },

    /**
     * Получить прогресс обучения
     */
    async getTrainingProgress(figi: string): Promise<any> {
        try {
            const response = await api.get(`/api/neural-network/status?figi=${figi}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching training progress:', error);
            throw error;
        }
    },

    /**
     * Остановить обучение
     */
    async stopTraining(figi: string): Promise<any> {
        try {
            const response = await api.post('/api/neural-network/stop-training', {figi});
            return response.data;
        } catch (error) {
            console.error('Error stopping training:', error);
            throw error;
        }
    },

    /**
     * Инициализировать интегрированный AI сервис
     */
    async initializeAI(): Promise<any> {
        try {
            const response = await api.post('/api/ai/initialize');
            return response.data.data;
        } catch (error) {
            console.error('Error initializing AI:', error);
            throw error;
        }
    },

    /**
     * Получить интегрированную рекомендацию
     */
    async getAIRecommendation(figi: string, portfolio?: any): Promise<any> {
        try {
            const response = await api.post('/api/ai/recommendation', {figi, portfolio});
            return response.data.data;
        } catch (error) {
            console.error('Error getting AI recommendation:', error);
            throw error;
        }
    },

    /**
     * Обучить все AI сети
     */
    async trainAllAI(figi: string, options: any = {}): Promise<any> {
        try {
            const response = await api.post('/api/ai/train', {figi, options});
            return response.data.data;
        } catch (error) {
            console.error('Error training all AI:', error);
            throw error;
        }
    },

    /**
     * Анализ одного инструмента с сохранением в рекомендации (для отладки)
     */
    async analyzeSingleInstrument(figi: string): Promise<any> {
        try {
            const response = await api.post('/api/ai/analyze-single-instrument', {figi});
            return response.data;
        } catch (error: any) {
            console.error('Error analyzing single instrument:', error);
            throw error;
        }
    },

    /**
     * Частичное обучение AI
     */
    async partialTrainAI(figi: string, options: any = {}): Promise<any> {
        try {
            const response = await api.post('/api/ai/partial-train', {figi, options});
            return response.data.data;
        } catch (error) {
            console.error('Error partial training AI:', error);
            throw error;
        }
    },

    /**
     * Получить статус AI
     */
    async getAIStatus(): Promise<any> {
        try {
            const response = await api.get('/api/ai/status');
            return response.data.data;
        } catch (error) {
            console.error('Error fetching AI status:', error);
            throw error;
        }
    },

    /**
     * Загрузить все модели
     */
    async loadAllModels(): Promise<any> {
        try {
            const response = await api.post('/api/ai/load-models');
            return response.data;
        } catch (error) {
            console.error('Error loading all models:', error);
            throw error;
        }
    },

    /**
     * Сохранить все модели
     */
    async saveAllModels(): Promise<any> {
        try {
            const response = await api.post('/api/ai/save-models');
            return response.data;
        } catch (error) {
            console.error('Error saving all models:', error);
            throw error;
        }
    },

    /**
     * Инициализировать ансамбль
     */
    async initializeEnsemble(): Promise<any> {
        try {
            const response = await api.post('/api/ensemble/initialize');
            return response.data.data;
        } catch (error) {
            console.error('Error initializing ensemble:', error);
            throw error;
        }
    },

    /**
     * Обучить ансамбль
     */
    async trainEnsemble(figi: string, options: any = {}): Promise<any> {
        try {
            const response = await api.post('/api/ensemble/train', {figi, options});
            return response.data.data;
        } catch (error) {
            console.error('Error training ensemble:', error);
            throw error;
        }
    },

    /**
     * Получить предсказание ансамбля
     */
    async getEnsemblePrediction(figi: string, portfolio?: any): Promise<any> {
        try {
            // Используем интегрированный ИИ, который внутри опирается на EnsembleService и другие модели
            const response = await api.post('/api/ai/recommendation', {figi, context: {portfolio}});
            return response.data.data;
        } catch (error) {
            console.error('Error getting ensemble prediction:', error);
            throw error;
        }
    },

    /**
     * Инициализировать мета-обучение
     */
    async initializeMetaLearning(): Promise<any> {
        try {
            const response = await api.post('/api/meta-learning/initialize');
            return response.data.data;
        } catch (error) {
            console.error('Error initializing meta learning:', error);
            throw error;
        }
    },

    /**
     * Адаптировать модель мета-обучения
     */
    async adaptMetaLearning(figi: string, options: any = {}): Promise<any> {
        try {
            const response = await api.post('/api/meta-learning/adapt', {figi, options});
            return response.data.data;
        } catch (error) {
            console.error('Error adapting meta learning:', error);
            throw error;
        }
    },

    /**
     * Найти похожие задачи для мета-обучения
     */
    async findSimilarMetaLearningTasks(figi: string, options: any = {}): Promise<any> {
        try {
            const response = await api.post('/api/meta-learning/find-similar', {figi, options});
            return response.data.data;
        } catch (error) {
            console.error('Error finding similar meta learning tasks:', error);
            throw error;
        }
    },

    /**
     * Получить статистику мета-обучения
     */
    async getMetaLearningStats(): Promise<any> {
        try {
            const response = await api.get('/api/meta-learning/stats');
            return response.data.data;
        } catch (error) {
            console.error('Error fetching meta learning stats:', error);
            throw error;
        }
    },

    /**
     * Получить статус мета-обучения
     */
    async getMetaLearningStatus(): Promise<any> {
        try {
            const response = await api.get('/api/meta-learning/stats');
            return response.data;
        } catch (error) {
            console.error('Error fetching meta-learning status:', error);
            throw error;
        }
    },

    /**
     * Получить историю мета-обучения
     */
    async getMetaLearningHistory(): Promise<any> {
        try {
            const response = await api.get('/api/meta-learning/stats');
            return response.data;
        } catch (error) {
            console.error('Error fetching meta-learning history:', error);
            throw error;
        }
    },

    /**
     * Запустить адаптацию мета-обучения
     */
    async startMetaLearningAdaptation(): Promise<any> {
        try {
            const response = await api.post('/api/meta-learning/adapt');
            return response.data;
        } catch (error) {
            console.error('Error starting meta-learning adaptation:', error);
            throw error;
        }
    },

    /**
     * Остановить адаптацию мета-обучения
     */
    async stopMetaLearningAdaptation(): Promise<any> {
        try {
            const response = await api.post('/api/meta-learning/stop');
            return response.data;
        } catch (error) {
            console.error('Error stopping meta-learning adaptation:', error);
            throw error;
        }
    },

    /**
     * Инициализировать обучение с подкреплением
     */
    async initializeReinforcementLearning(): Promise<any> {
        try {
            const response = await api.post('/api/reinforcement-learning/initialize');
            return response.data.data;
        } catch (error) {
            console.error('Error initializing reinforcement learning:', error);
            throw error;
        }
    },

    /**
     * Обучить модель с подкреплением
     */
    async trainReinforcementLearning(figi: string, options: any = {}): Promise<any> {
        try {
            const response = await api.post('/api/training/reinforcement-learning/train', {figi, options});
            return response.data.data;
        } catch (error) {
            console.error('Error training reinforcement learning:', error);
            throw error;
        }
    },

    /**
     * Обучить Meta-Learning модель
     */
    async trainMetaLearning(figi: string, options: any = {}): Promise<any> {
        try {
            const response = await api.post('/api/training/meta-learning/train', {figi, options});
            return response.data.data;
        } catch (error) {
            console.error('Error training meta learning:', error);
            throw error;
        }
    },

    /**
     * Получить рекомендацию от обучения с подкреплением
     */
    async getReinforcementLearningRecommendation(figi: string, portfolio?: any): Promise<any> {
        try {
            const response = await api.post('/api/reinforcement-learning/recommendation', {figi, portfolio});
            return response.data.data;
        } catch (error) {
            console.error('Error getting reinforcement learning recommendation:', error);
            throw error;
        }
    },

    /**
     * Получить статистику обучения с подкреплением
     */
    async getReinforcementLearningStats(): Promise<any> {
        try {
            const response = await api.get('/api/reinforcement-learning/stats');
            return response.data.data;
        } catch (error) {
            console.error('Error fetching reinforcement learning stats:', error);
            throw error;
        }
    },

    /**
     * Получить статус RL
     */
    async getRLStatus(): Promise<any> {
        try {
            const response = await api.get('/api/reinforcement-learning/stats');
            return response.data;
        } catch (error) {
            console.error('Error fetching RL status:', error);
            throw error;
        }
    },

    /**
     * Получить историю RL
     */
    async getRLHistory(): Promise<any> {
        try {
            const response = await api.get('/api/reinforcement-learning/stats');
            return response.data;
        } catch (error) {
            console.error('Error fetching RL history:', error);
            throw error;
        }
    },

    /**
     * Запустить обучение RL
     */
    async startRLTraining(): Promise<any> {
        try {
            const response = await api.post('/api/training/reinforcement-learning/train');
            return response.data;
        } catch (error) {
            console.error('Error starting RL training:', error);
            throw error;
        }
    },

    /**
     * Остановить обучение RL
     */
    async stopRLTraining(): Promise<any> {
        try {
            const response = await api.post('/api/reinforcement-learning/stop');
            return response.data;
        } catch (error) {
            console.error('Error stopping RL training:', error);
            throw error;
        }
    },

    /**
     * Сбросить агента RL
     */
    async resetRLAgent(): Promise<any> {
        try {
            const response = await api.post('/api/reinforcement-learning/reset');
            return response.data;
        } catch (error) {
            console.error('Error resetting RL agent:', error);
            throw error;
        }
    },
    // Training Management
    async startBatchTraining(options?: { epochs?: number; batchSize?: number }) {
        try {
            const response = await api.post('/api/training/batch-train-all', options || {});
            return response.data;
        } catch (error: any) {
            console.error('Error starting batch training:', error);
            throw error;
        }
    },

    async getTrainingStatus(): Promise<any> {
        try {
            // TODO: Добавить endpoint для получения статуса обучения
            // const response = await api.get('/api/training/status');
            // return response.data;
            return {isTraining: false};
        } catch (error) {
            console.error('Error fetching training status:', error);
            return {isTraining: false};
        }
    }
}