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
                await ServiceManager.initialize();
        } else if (isServiceManagerGlobal) {
        }
        
        // Проверяем, не инициализирован ли EnsembleService глобально
        const isEnsembleGlobal = await ServiceInitializationTracker.isServiceInitializedGlobally('EnsembleService');
        
        if (!isEnsembleGlobal && !EnsembleService.isInitialized) {
                await EnsembleService.initialize();
        } else if (isEnsembleGlobal) {
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
        try {
            const LoggerService = (await import('../services/LoggerService.js')).default;
            if (LoggerService && LoggerService.isInitialized) {
                LoggerService.error('Ensemble worker error', {
                    service: 'EnsembleWorker',
                    operation: 'run',
                    error: { message: error.message, stack: error.stack }
                });
            }
        } catch {
            // LoggerService недоступен в воркере, игнорируем
        }
        parentPort.postMessage({ type: 'error', data: { success: false, error: error.message } });
    }
}

run();

