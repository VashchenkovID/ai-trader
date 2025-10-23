import { parentPort, workerData } from 'worker_threads';

async function run() {
    try {
        const { figi, options, services } = workerData || {};
        
        // Используем переданные сервисы
        const { ReinforcementLearningService, CacheService, OptimizedTelegramService } = services || {};
        
        // Если сервисы не переданы, импортируем их
        if (!ReinforcementLearningService) {
            const { default: RLService } = await import('../services/ReinforcementLearningService.js');
            if (!RLService.isInitialized) {
                await RLService.initialize();
            }
            const result = await RLService.train(figi, options || {});
            parentPort.postMessage({ type: 'done', data: result });
            return;
        }
        
        // Проверяем, инициализирован ли сервис
        if (!ReinforcementLearningService.isInitialized) {
            console.log('🔧 ReinforcementLearningService not initialized in worker, initializing...');
            await ReinforcementLearningService.initialize();
        }
        
        const result = await ReinforcementLearningService.train(figi, options || {});
        parentPort.postMessage({ type: 'done', data: result });
    } catch (error) {
        console.error('❌ RL worker error:', error);
        parentPort.postMessage({ type: 'error', data: { error: error.message } });
    }
}

run();

