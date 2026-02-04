import WorkerMonitoringService from '../src/services/WorkerMonitoringService.js';
import ServiceManager from '../src/services/ServiceManager.js';
import { setGlobalServiceManager } from '../src/services/GlobalServiceManager.js';

// Устанавливаем глобальный ServiceManager
setGlobalServiceManager(ServiceManager);

/**
 * Тест системы мониторинга воркеров
 */
async function testWorkerMonitoring() {
    console.log('🧪 Начало тестирования WorkerMonitoringService\n');

    try {
        // 1. Инициализация
        console.log('1️⃣ Инициализация сервиса...');
        await WorkerMonitoringService.initialize();
        console.log('✅ Сервис инициализирован\n');

        // 2. Регистрация воркеров
        console.log('2️⃣ Регистрация тестовых воркеров...');
        const worker1 = WorkerMonitoringService.registerWorker(
            'training',
            'Обучение модели для AAPL',
            { figi: 'BBG000B9XRY4', instrument: 'AAPL', epochs: 50 }
        );
        console.log(`✅ Воркер 1 зарегистрирован: ${worker1}`);

        const worker2 = WorkerMonitoringService.registerWorker(
            'analysis',
            'Анализ портфеля',
            { portfolioType: 'virtual' }
        );
        console.log(`✅ Воркер 2 зарегистрирован: ${worker2}`);

        const worker3 = WorkerMonitoringService.registerWorker(
            'price-update',
            'Обновление цен',
            { instruments: ['BBG000B9XRY4', 'BBG000BVPV84'] }
        );
        console.log(`✅ Воркер 3 зарегистрирован: ${worker3}\n`);

        // 3. Получение активных воркеров
        console.log('3️⃣ Получение списка активных воркеров...');
        const activeWorkers = WorkerMonitoringService.getActiveWorkers();
        console.log(`✅ Найдено активных воркеров: ${activeWorkers.length}`);
        activeWorkers.forEach(w => {
            console.log(`   - ${w.name} (${w.type}): ${w.status}, прогресс: ${w.progress}%`);
        });
        console.log('');

        // 4. Обновление прогресса
        console.log('4️⃣ Обновление прогресса воркеров...');
        WorkerMonitoringService.updateWorkerStatus(worker1, {
            progress: 25,
            metadata: { epoch: 12, loss: 0.45, accuracy: 0.78 }
        });
        console.log(`✅ Прогресс воркера 1 обновлен до 25%`);

        WorkerMonitoringService.updateWorkerStatus(worker2, {
            progress: 50,
            metadata: { stage: 'analyzing_positions' }
        });
        console.log(`✅ Прогресс воркера 2 обновлен до 50%`);

        WorkerMonitoringService.updateWorkerStatus(worker3, {
            progress: 75,
            metadata: { updated: 15, total: 20 }
        });
        console.log(`✅ Прогресс воркера 3 обновлен до 75%\n`);

        // 5. Пауза воркера
        console.log('5️⃣ Тест паузы воркера...');
        WorkerMonitoringService.pauseWorker(worker2);
        console.log(`✅ Воркер 2 поставлен на паузу\n`);

        // 6. Получение воркера по ID
        console.log('6️⃣ Получение детальной информации о воркере...');
        const workerDetails = WorkerMonitoringService.getWorker(worker1);
        if (workerDetails) {
            console.log(`✅ Воркер найден: ${workerDetails.name}`);
            console.log(`   Статус: ${workerDetails.status}`);
            console.log(`   Прогресс: ${workerDetails.progress}%`);
            console.log(`   Длительность: ${Math.round(workerDetails.duration / 1000)}с`);
            console.log(`   Метаданные:`, workerDetails.metadata);
        }
        console.log('');

        // 7. Получение воркеров по типу
        console.log('7️⃣ Получение воркеров по типу "training"...');
        const trainingWorkers = WorkerMonitoringService.getWorkersByType('training');
        console.log(`✅ Найдено воркеров типа "training": ${trainingWorkers.length}`);
        trainingWorkers.forEach(w => {
            console.log(`   - ${w.name}: ${w.status}`);
        });
        console.log('');

        // 8. Возобновление воркера
        console.log('8️⃣ Тест возобновления воркера...');
        WorkerMonitoringService.resumeWorker(worker2);
        console.log(`✅ Воркер 2 возобновлен\n`);

        // 9. Завершение воркеров
        console.log('9️⃣ Завершение воркеров...');
        WorkerMonitoringService.completeWorker(worker1, true, {
            result: { accuracy: 0.85, loss: 0.32 }
        });
        console.log(`✅ Воркер 1 завершен успешно`);

        WorkerMonitoringService.completeWorker(worker2, true, {
            result: { recommendations: 5 }
        });
        console.log(`✅ Воркер 2 завершен успешно`);

        // Симулируем ошибку для воркера 3
        WorkerMonitoringService.reportWorkerError(worker3, new Error('Connection timeout'));
        WorkerMonitoringService.completeWorker(worker3, false, {
            error: 'Connection timeout'
        });
        console.log(`✅ Воркер 3 завершен с ошибкой\n`);

        // 10. Проверка активных воркеров после завершения
        console.log('🔟 Проверка активных воркеров после завершения...');
        const remainingWorkers = WorkerMonitoringService.getActiveWorkers();
        console.log(`✅ Осталось активных воркеров: ${remainingWorkers.length}\n`);

        // 11. Получение истории
        console.log('1️⃣1️⃣ Получение истории воркеров...');
        const history = WorkerMonitoringService.getWorkerHistory(null, 10);
        console.log(`✅ Найдено записей в истории: ${history.length}`);
        history.forEach((w, index) => {
            console.log(`   ${index + 1}. ${w.name} (${w.type}): ${w.status}, длительность: ${Math.round(w.duration / 1000)}с`);
        });
        console.log('');

        // 12. Статистика
        console.log('1️⃣2️⃣ Получение статистики...');
        const stats = WorkerMonitoringService.getWorkerStats('1h');
        console.log('✅ Статистика за последний час:');
        console.log(`   Активных: ${stats.active.total}`);
        console.log(`   По типам:`, stats.active.byType);
        console.log(`   По статусам:`, stats.active.byStatus);
        console.log(`   Завершено: ${stats.completed.total}`);
        console.log(`   Успешных: ${stats.completed.successful}`);
        console.log(`   С ошибками: ${stats.completed.failed}`);
        console.log(`   Успешность: ${stats.completed.successRate}%`);
        console.log(`   Средняя длительность: ${Math.round(stats.completed.avgDuration / 1000)}с\n`);

        // 13. Временная линия
        console.log('1️⃣3️⃣ Получение временной линии...');
        const startDate = new Date(Date.now() - 60 * 60 * 1000); // Последний час
        const endDate = new Date();
        const timeline = WorkerMonitoringService.getWorkerTimeline(startDate, endDate);
        console.log(`✅ Найдено событий в временной линии: ${timeline.length}`);
        timeline.forEach((event, index) => {
            const duration = Math.round(event.duration / 1000);
            console.log(`   ${index + 1}. ${event.name} (${event.type}): ${event.status}, ${duration}с`);
        });
        console.log('');

        console.log('✅ Все тесты пройдены успешно!\n');

    } catch (error) {
        console.error('❌ Ошибка при тестировании:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

// Запускаем тесты
testWorkerMonitoring()
    .then(() => {
        console.log('🎉 Тестирование завершено');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Критическая ошибка:', error);
        process.exit(1);
    });

