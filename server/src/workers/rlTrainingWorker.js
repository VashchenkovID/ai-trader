import { parentPort, workerData } from 'worker_threads';
// Импортируем ServiceInitializationTracker динамически, чтобы избежать проблем с инициализацией в worker'е
let ServiceInitializationTracker = null;

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
            const LoggerService = (await import('../services/LoggerService.js')).default;
            
            // Проверяем, не инициализирован ли сервис глобально (динамический импорт)
            let isGlobal = false;
            try {
                if (!ServiceInitializationTracker) {
                    ServiceInitializationTracker = (await import('../utils/ServiceInitializationTracker.js')).default;
                }
                if (ServiceInitializationTracker && typeof ServiceInitializationTracker.isServiceInitializedGlobally === 'function') {
                    isGlobal = await ServiceInitializationTracker.isServiceInitializedGlobally('ReinforcementLearningService');
                }
            } catch (trackerError) {
                // Игнорируем ошибки трекера - это не критично
            }
            
            if (!isGlobal && !RLService.isInitialized) {
                if (LoggerService && LoggerService.isInitialized) {
                    LoggerService.info('ReinforcementLearningService not initialized globally, initializing in worker', {
                        service: 'rlTrainingWorker',
                        operation: 'run'
                    });
                } else {
                    console.log('🔧 ReinforcementLearningService not initialized globally, initializing in worker...');
                }
                await RLService.initialize();
            } else if (isGlobal) {
                if (LoggerService && LoggerService.isInitialized) {
                    LoggerService.info('ReinforcementLearningService already initialized globally, using lightweight initialization', {
                        service: 'rlTrainingWorker',
                        operation: 'run'
                    });
                } else {
                    console.log('ℹ️ ReinforcementLearningService already initialized globally, using lightweight initialization');
                }
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
        
        // Проверяем, инициализирован ли сервис (динамический импорт)
        let isGlobal = false;
        try {
            if (!ServiceInitializationTracker) {
                ServiceInitializationTracker = (await import('../utils/ServiceInitializationTracker.js')).default;
            }
            if (ServiceInitializationTracker && typeof ServiceInitializationTracker.isServiceInitializedGlobally === 'function') {
                isGlobal = await ServiceInitializationTracker.isServiceInitializedGlobally('ReinforcementLearningService');
            }
        } catch (trackerError) {
            // Игнорируем ошибки трекера - это не критично
        }
        
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

