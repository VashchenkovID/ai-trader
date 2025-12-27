/**
 * Тестовый скрипт для проверки MonitoringService
 * Запуск: node server/test-monitoring.js
 */

import MonitoringService from './src/services/MonitoringService.js';

async function testMonitoringService() {
    console.log('🧪 Тестирование MonitoringService...\n');
    
    try {
        // 1. Инициализация
        console.log('1️⃣ Инициализация сервиса...');
        await MonitoringService.initialize();
        console.log('✅ Сервис инициализирован\n');
        
        // 2. Обновление метрик приложения
        console.log('2️⃣ Обновление метрик приложения...');
        MonitoringService.updateApplicationMetrics({
            requests: 10,
            errors: 1,
            responseTime: 150
        });
        console.log('✅ Метрики приложения обновлены\n');
        
        // 3. Обновление метрик БД
        console.log('3️⃣ Обновление метрик БД...');
        MonitoringService.updateDatabaseMetrics({
            queries: 50,
            slowQueries: 2,
            errors: 0
        });
        console.log('✅ Метрики БД обновлены\n');
        
        // 4. Обновление метрик нейросети
        console.log('4️⃣ Обновление метрик нейросети...');
        MonitoringService.updateNeuralNetworkMetrics({
            trainings: 5,
            errors: 0,
            status: 'active',
            lastTraining: new Date().toISOString()
        });
        console.log('✅ Метрики нейросети обновлены\n');
        
        // 5. Создание алертов
        console.log('5️⃣ Создание тестовых алертов...');
        MonitoringService.createAlert('application', 'low', 'Тестовый алерт низкого приоритета');
        MonitoringService.createAlert('database', 'medium', 'Тестовый алерт среднего приоритета');
        MonitoringService.createAlert('system', 'high', 'Тестовый алерт высокого приоритета');
        console.log('✅ Алерты созданы\n');
        
        // 6. Получение всех метрик
        console.log('6️⃣ Получение всех метрик...');
        const metrics = MonitoringService.getMetrics();
        console.log('📊 Метрики:', JSON.stringify(metrics, null, 2));
        console.log('✅ Метрики получены\n');
        
        // 7. Получение алертов
        console.log('7️⃣ Получение алертов...');
        const alerts = MonitoringService.getAlerts({ limit: 10 });
        console.log(`📢 Найдено алертов: ${alerts.length}`);
        alerts.forEach((alert, index) => {
            console.log(`   ${index + 1}. [${alert.severity.toUpperCase()}] ${alert.category}: ${alert.message}`);
        });
        console.log('✅ Алерты получены\n');
        
        // 8. Статистика производительности
        console.log('8️⃣ Получение статистики производительности...');
        const performance = MonitoringService.getPerformanceStats();
        console.log('⚡ Статистика:', JSON.stringify(performance, null, 2));
        console.log('✅ Статистика получена\n');
        
        // 9. Health check
        console.log('9️⃣ Health check...');
        const health = MonitoringService.getHealthStatus();
        console.log('🏥 Health status:', JSON.stringify(health, null, 2));
        console.log('✅ Health check выполнен\n');
        
        // 10. Разрешение алерта
        console.log('🔟 Разрешение алерта...');
        if (alerts.length > 0) {
            const alertId = alerts[0].id;
            const resolved = MonitoringService.resolveAlert(alertId);
            if (resolved) {
                console.log(`✅ Алерт ${alertId} разрешен`);
            }
        }
        console.log('✅ Тест разрешения алерта выполнен\n');
        
        // 11. Проверка системных метрик
        console.log('1️⃣1️⃣ Проверка системных метрик...');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Ждем обновления
        const systemMetrics = MonitoringService.getMetrics().system;
        console.log('💻 Системные метрики:', JSON.stringify(systemMetrics, null, 2));
        console.log('✅ Системные метрики проверены\n');
        
        console.log('✅✅✅ Все тесты пройдены успешно! ✅✅✅\n');
        
        // Остановка обновления метрик
        MonitoringService.stopSystemMetricsUpdate();
        console.log('🛑 Обновление системных метрик остановлено');
        
    } catch (error) {
        console.error('❌ Ошибка при тестировании:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Запуск тестов
testMonitoringService()
    .then(() => {
        console.log('\n🎉 Тестирование завершено');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Критическая ошибка:', error);
        process.exit(1);
    });

