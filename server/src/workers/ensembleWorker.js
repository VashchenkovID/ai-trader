import { parentPort, workerData } from 'worker_threads';
import EnsembleService from '../services/EnsembleService.js';
import ServiceManager from '../services/ServiceManager.js';
import { setGlobalServiceManager } from '../services/GlobalServiceManager.js';

async function run() {
    const { figi, options } = workerData;
    try {
        // Устанавливаем глобальный ServiceManager для использования в сервисах
        setGlobalServiceManager(ServiceManager);
        
        // Инициализируем ServiceManager, если еще не инициализирован
        if (!ServiceManager.isInitialized) {
            console.log('🔧 ServiceManager not initialized in worker, initializing...');
            await ServiceManager.initialize();
        }
        
        // Проверяем, инициализирован ли EnsembleService
        if (!EnsembleService.isInitialized) {
            console.log('🔧 EnsembleService not initialized in worker, initializing...');
            await EnsembleService.initialize();
        }
        
        const result = await EnsembleService.trainEnsemble(figi, options || {});
        parentPort.postMessage({ type: 'done', data: { success: true, result } });
    } catch (error) {
        console.error('❌ Ensemble worker error:', error);
        parentPort.postMessage({ type: 'error', data: { success: false, error: error.message } });
    }
}

run();

