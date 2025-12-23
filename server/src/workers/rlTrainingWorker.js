import { parentPort, workerData } from 'worker_threads';
import ServiceInitializationTracker from '../utils/ServiceInitializationTracker.js';

// Устанавливаем флаг воркера
process.env.WORKER = 'true';

async function run() {
    try {
        const { figi, options, services } = workerData || {};
        
        // Используем переданные сервисы
        const { ReinforcementLearningService, CacheService, OptimizedTelegramService } = services || {};
        
        // Если сервисы не переданы, импортируем их
        if (!ReinforcementLearningService) {
            const { default: RLService } = await import('../services/ReinforcementLearningService.js');
            
            // Проверяем, не инициализирован ли сервис глобально
            const isGlobal = await ServiceInitializationTracker.isServiceInitializedGlobally('ReinforcementLearningService');
            
            if (!isGlobal && !RLService.isInitialized) {
                console.log('🔧 ReinforcementLearningService not initialized globally, initializing in worker...');
                await RLService.initialize();
            } else if (isGlobal) {
                console.log('ℹ️ ReinforcementLearningService already initialized globally, using lightweight initialization');
                if (!RLService.isInitialized) {
                    if (typeof RLService.initializeLightweight === 'function') {
                        await RLService.initializeLightweight();
                    } else {
                        await RLService.initialize();
                    }
                }
            }
            
            const result = await RLService.train(figi, options || {});
            parentPort.postMessage({ type: 'done', data: result });
            return;
        }
        
        // Проверяем, инициализирован ли сервис
        const isGlobal = await ServiceInitializationTracker.isServiceInitializedGlobally('ReinforcementLearningService');
        
        if (!isGlobal && !ReinforcementLearningService.isInitialized) {
            console.log('🔧 ReinforcementLearningService not initialized globally, initializing in worker...');
            await ReinforcementLearningService.initialize();
        } else if (isGlobal) {
            console.log('ℹ️ ReinforcementLearningService already initialized globally, skipping full initialization');
            if (!ReinforcementLearningService.isInitialized) {
                if (typeof ReinforcementLearningService.initializeLightweight === 'function') {
                    await ReinforcementLearningService.initializeLightweight();
                } else {
                    await ReinforcementLearningService.initialize();
                }
            }
        }
        
        const result = await ReinforcementLearningService.train(figi, options || {});
        parentPort.postMessage({ type: 'done', data: result });
    } catch (error) {
        console.error('❌ RL worker error:', error);
        parentPort.postMessage({ type: 'error', data: { error: error.message } });
    }
}

run();

