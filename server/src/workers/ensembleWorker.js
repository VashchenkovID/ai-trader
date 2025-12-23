import { parentPort, workerData } from 'worker_threads';
import EnsembleService from '../services/EnsembleService.js';
import ServiceManager from '../services/ServiceManager.js';
import { setGlobalServiceManager } from '../services/GlobalServiceManager.js';
import ServiceInitializationTracker from '../utils/ServiceInitializationTracker.js';

// Устанавливаем флаг воркера
process.env.WORKER = 'true';

async function run() {
    const { figi, options } = workerData;
    try {
        // Устанавливаем глобальный ServiceManager для использования в сервисах
        setGlobalServiceManager(ServiceManager);
        
        // Проверяем, не инициализирован ли ServiceManager глобально
        const isServiceManagerGlobal = await ServiceInitializationTracker.isServiceInitializedGlobally('ServiceManager');
        
        if (!isServiceManagerGlobal && !ServiceManager.isInitialized) {
            console.log('🔧 ServiceManager not initialized globally, initializing in worker...');
            await ServiceManager.initialize();
        } else if (isServiceManagerGlobal) {
            console.log('ℹ️ ServiceManager already initialized globally, skipping full initialization in worker');
        }
        
        // Проверяем, не инициализирован ли EnsembleService глобально
        const isEnsembleGlobal = await ServiceInitializationTracker.isServiceInitializedGlobally('EnsembleService');
        
        if (!isEnsembleGlobal && !EnsembleService.isInitialized) {
            console.log('🔧 EnsembleService not initialized globally, initializing in worker...');
            await EnsembleService.initialize();
        } else if (isEnsembleGlobal) {
            console.log('ℹ️ EnsembleService already initialized globally, using existing instance');
            // Если сервис уже инициализирован глобально, просто используем его
            // (в воркере будет создан новый экземпляр, но без тяжелой инициализации)
            if (!EnsembleService.isInitialized) {
                // Легковесная инициализация только для доступа к методам
                if (typeof EnsembleService.initializeLightweight === 'function') {
                    await EnsembleService.initializeLightweight();
                } else {
                    // Если легковесной инициализации нет, делаем обычную, но это будет только локально
                    await EnsembleService.initialize();
                }
            }
        }
        
        const result = await EnsembleService.trainEnsemble(figi, options || {});
        parentPort.postMessage({ type: 'done', data: { success: true, result } });
    } catch (error) {
        console.error('❌ Ensemble worker error:', error);
        parentPort.postMessage({ type: 'error', data: { success: false, error: error.message } });
    }
}

run();

