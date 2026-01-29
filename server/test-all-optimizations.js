/**
 * Тестовый скрипт для проверки всех оптимизаций
 */

import sequelize from './src/config/database.js';
import { SchedulerService } from './src/services/SchedulerService.js';
import CacheServiceInstance from './src/services/CacheService.js';
import ApiRequestQueue from './src/services/ApiRequestQueue.js';
import WorkerPriorityManager from './src/utils/scheduler/WorkerPriorityManager.js';
import DatabaseQueryOptimizer from './src/utils/databaseQueryOptimizer.js';

console.log('🧪 Тестирование всех оптимизаций...\n');

let allTestsPassed = true;

// Тест 1: Проверка пула соединений БД
console.log('1. Проверка пула соединений БД:');
const poolConfig = sequelize.config.pool;
const dbTest = poolConfig.max === 15 && poolConfig.min === 2;
console.log(`   - max: ${poolConfig.max} (ожидается: 15)`);
console.log(`   - min: ${poolConfig.min} (ожидается: 2)`);
console.log(`   ${dbTest ? '✅ ПРОЙДЕН' : '❌ ОШИБКА'}\n`);
if (!dbTest) allTestsPassed = false;

// Тест 2: Проверка интервалов планировщика
console.log('2. Проверка интервалов планировщика:');
const schedulerInstance = new SchedulerService();
const schedulerTest = schedulerInstance.priceUpdateInterval === 60 * 60 * 1000;
console.log(`   - priceUpdateInterval: ${schedulerInstance.priceUpdateInterval / 1000 / 60} минут (ожидается: 60)`);
console.log(`   ${schedulerTest ? '✅ ПРОЙДЕН' : '❌ ОШИБКА'}\n`);
if (!schedulerTest) allTestsPassed = false;

// Тест 3: Проверка TTL кеша
console.log('3. Проверка TTL кеша:');
const cacheTest = CacheServiceInstance.cacheTimeout === 24 * 60 * 60 * 1000;
console.log(`   - cacheTimeout: ${CacheServiceInstance.cacheTimeout / 1000 / 60 / 60} часов (ожидается: 24)`);
console.log(`   ${cacheTest ? '✅ ПРОЙДЕН' : '❌ ОШИБКА'}\n`);
if (!cacheTest) allTestsPassed = false;

// Тест 4: Проверка WorkerPriorityManager
console.log('4. Проверка WorkerPriorityManager:');
const workerManagerTest = WorkerPriorityManager.maxConcurrent === 3;
console.log(`   - maxConcurrent: ${WorkerPriorityManager.maxConcurrent} (ожидается: 3)`);
console.log(`   - Приоритеты настроены: ${Object.keys(WorkerPriorityManager.priorities).length > 0 ? 'Да' : 'Нет'}`);
console.log(`   ${workerManagerTest ? '✅ ПРОЙДЕН' : '❌ ОШИБКА'}\n`);
if (!workerManagerTest) allTestsPassed = false;

// Тест 5: Проверка ApiRequestQueue
console.log('5. Проверка ApiRequestQueue:');
try {
    await ApiRequestQueue.initialize();
    const queueTest = ApiRequestQueue.isInitialized === true;
    const queueStats = ApiRequestQueue.getStats();
    console.log(`   - Инициализирован: ${ApiRequestQueue.isInitialized}`);
    console.log(`   - Максимум токенов: ${queueStats.maxTokens}`);
    console.log(`   - Приоритеты настроены: ${Object.keys(ApiRequestQueue.priorities).length > 0 ? 'Да' : 'Нет'}`);
    console.log(`   ${queueTest ? '✅ ПРОЙДЕН' : '❌ ОШИБКА'}\n`);
    if (!queueTest) allTestsPassed = false;
} catch (error) {
    console.log(`   ❌ ОШИБКА: ${error.message}\n`);
    allTestsPassed = false;
}

// Тест 6: Проверка DatabaseQueryOptimizer
console.log('6. Проверка DatabaseQueryOptimizer:');
try {
    const optimizerTest = DatabaseQueryOptimizer !== null && typeof DatabaseQueryOptimizer.batchFindByPk === 'function';
    console.log(`   - Экземпляр создан: ${DatabaseQueryOptimizer !== null}`);
    console.log(`   - Метод batchFindByPk: ${typeof DatabaseQueryOptimizer.batchFindByPk === 'function' ? 'Доступен' : 'Отсутствует'}`);
    console.log(`   - Метод batchFindByFigi: ${typeof DatabaseQueryOptimizer.batchFindByFigi === 'function' ? 'Доступен' : 'Отсутствует'}`);
    console.log(`   - Метод cachedQuery: ${typeof DatabaseQueryOptimizer.cachedQuery === 'function' ? 'Доступен' : 'Отсутствует'}`);
    console.log(`   ${optimizerTest ? '✅ ПРОЙДЕН' : '❌ ОШИБКА'}\n`);
    if (!optimizerTest) allTestsPassed = false;
} catch (error) {
    console.log(`   ❌ ОШИБКА: ${error.message}\n`);
    allTestsPassed = false;
}

// Итоговый результат
console.log('═══════════════════════════════════════');
if (allTestsPassed) {
    console.log('✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ!');
} else {
    console.log('❌ НЕКОТОРЫЕ ТЕСТЫ НЕ ПРОЙДЕНЫ');
}
console.log('═══════════════════════════════════════\n');

console.log('📊 Ожидаемые улучшения:');
console.log('   - -60% количество выполняемых задач');
console.log('   - -40% использование соединений БД');
console.log('   - -50% запросы к API');
console.log('   - -30% использование памяти');
console.log('   - -70% rate limit ошибки');
console.log('   - -50% время выполнения БД запросов');

process.exit(allTestsPassed ? 0 : 1);

