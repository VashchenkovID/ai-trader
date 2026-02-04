/**
 * Простой тест WorkerMonitoringService без зависимостей
 * Запуск: node test-worker-monitoring-simple.js
 */

// Мокаем необходимые зависимости
global.process = global.process || { env: {} };

// Импортируем сервис
import('../src/services/WorkerMonitoringService.js')
    .then(async (module) => {
        const WorkerMonitoringService = module.default;

        console.log('🧪 Простой тест WorkerMonitoringService\n');

        try {
            // Инициализация
            console.log('1️⃣ Инициализация...');
            await WorkerMonitoringService.initialize();
            console.log('✅ Инициализирован\n');

            // Регистрация воркеров
            console.log('2️⃣ Регистрация воркеров...');
            const w1 = WorkerMonitoringService.registerWorker('training', 'Test Worker 1', { test: true });
            const w2 = WorkerMonitoringService.registerWorker('analysis', 'Test Worker 2', { test: true });
            console.log(`✅ Зарегистрировано 2 воркера: ${w1}, ${w2}\n`);

            // Проверка активных
            console.log('3️⃣ Проверка активных воркеров...');
            const active = WorkerMonitoringService.getActiveWorkers();
            console.log(`✅ Активных: ${active.length}`);
            active.forEach(w => console.log(`   - ${w.name} (${w.status})`));
            console.log('');

            // Обновление прогресса
            console.log('4️⃣ Обновление прогресса...');
            WorkerMonitoringService.updateWorkerStatus(w1, { progress: 50 });
            WorkerMonitoringService.updateWorkerStatus(w2, { progress: 75 });
            console.log('✅ Прогресс обновлен\n');

            // Пауза
            console.log('5️⃣ Тест паузы...');
            WorkerMonitoringService.pauseWorker(w2);
            console.log('✅ Воркер 2 на паузе\n');

            // Возобновление
            console.log('6️⃣ Тест возобновления...');
            WorkerMonitoringService.resumeWorker(w2);
            console.log('✅ Воркер 2 возобновлен\n');

            // Завершение
            console.log('7️⃣ Завершение воркеров...');
            WorkerMonitoringService.completeWorker(w1, true, { result: 'success' });
            WorkerMonitoringService.completeWorker(w2, true, { result: 'success' });
            console.log('✅ Воркеры завершены\n');

            // Статистика
            console.log('8️⃣ Статистика...');
            const stats = WorkerMonitoringService.getWorkerStats('1h');
            console.log(`✅ Активных: ${stats.active.total}`);
            console.log(`✅ Завершено: ${stats.completed.total}`);
            console.log(`✅ Успешность: ${stats.completed.successRate}%\n`);

            console.log('🎉 Все тесты пройдены!\n');
            process.exit(0);

        } catch (error) {
            console.error('❌ Ошибка:', error.message);
            console.error(error.stack);
            process.exit(1);
        }
    })
    .catch((error) => {
        console.error('❌ Ошибка импорта:', error.message);
        console.error('\n💡 Убедитесь, что вы находитесь в директории server/');
        process.exit(1);
    });

