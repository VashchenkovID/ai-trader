import { parentPort, workerData } from 'worker_threads';

async function run() {
    const { figi, options, services } = workerData;
    try {
        // Используем переданные сервисы вместо импорта
        const { EnsembleService, CacheService, OptimizedTelegramService } = services;
        
        // Проверяем, инициализирован ли сервис
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

