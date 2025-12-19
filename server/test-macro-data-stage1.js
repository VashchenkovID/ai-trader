import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import MacroDataService from './src/services/MacroDataService.js';
import MacroIndicator from './src/models/MacroIndicator.js';
import Settings from './src/models/Settings.js';
import sequelize from './src/config/database.js';
import { initDatabase } from './src/utils/initDatabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
const envPaths = [
    join(__dirname, '.env'),
    join(__dirname, '..', '.env'),
    join(process.cwd(), '.env'),
    join(process.cwd(), 'server', '.env')
];

let envLoaded = false;
for (const envPath of envPaths) {
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
        envLoaded = true;
        console.log(`✅ Loaded .env from: ${envPath}`);
        break;
    }
}

if (!envLoaded) {
    dotenv.config();
    console.log('⚠️ .env file not found, using system environment variables');
}

// Helper for colored console output
const log = (message, color = 'white') => {
    const colors = {
        red: '\x1b[31m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        blue: '\x1b[34m',
        magenta: '\x1b[35m',
        cyan: '\x1b[36m',
        white: '\x1b[37m',
        reset: '\x1b[0m'
    };
    console.log(`${colors[color]}${message}${colors.reset}`);
};

const logTest = (name, passed, details = '') => {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    const color = passed ? 'green' : 'red';
    log(`${status}: ${name} ${details ? `- ${details}` : ''}`, color);
};

const logSection = (title) => {
    log(`\n${'='.repeat(60)}`, 'cyan');
    log(title, 'cyan');
    log(`${'='.repeat(60)}\n`, 'cyan');
};

async function runStage1Tests() {
    log('\n' + '='.repeat(60), 'cyan');
    log('ТЕСТИРОВАНИЕ ЭТАПА 1: БАЗОВАЯ ИНФРАСТРУКТУРА MACRO DATA', 'cyan');
    log('='.repeat(60) + '\n', 'cyan');

    const results = {
        passed: 0,
        failed: 0,
        tests: []
    };

    try {
        // 1. Инициализация базы данных
        logSection('1. Инициализация базы данных');
        try {
            await initDatabase();
            log('✅ База данных инициализирована', 'green');
            results.passed++;
        } catch (dbError) {
            if (dbError.message && dbError.message.includes('password must be a string')) {
                log('❌ Ошибка подключения к БД: пароль не установлен или не является строкой', 'red');
                await sequelize.close().catch(() => {});
                process.exit(1);
            }
            if (dbError.name === 'SequelizeUniqueConstraintError' && 
                dbError.original && dbError.original.code === '23505' &&
                dbError.original.detail && dbError.original.detail.includes('enum_')) {
                log('✅ База данных инициализирована (ENUM типы уже существуют)', 'green');
                results.passed++;
            } else {
                throw dbError;
            }
        }

        // 2. Проверка модели MacroIndicator
        logSection('2. Проверка модели MacroIndicator');
        const modelExists = MacroIndicator !== undefined && MacroIndicator !== null;
        logTest('Модель MacroIndicator существует', modelExists);
        if (modelExists) results.passed++;
        else results.failed++;

        const hasTableName = MacroIndicator.tableName === 'macro_indicators';
        logTest('Таблица macro_indicators определена', hasTableName);
        if (hasTableName) results.passed++;
        else results.failed++;

        // 3. Инициализация MacroDataService
        logSection('3. Инициализация MacroDataService');
        try {
            await MacroDataService.initialize();
            const isInitialized = MacroDataService.isInitialized;
            logTest('MacroDataService инициализирован', isInitialized);
            if (isInitialized) results.passed++;
            else results.failed++;
        } catch (error) {
            logTest('MacroDataService инициализирован', false, error.message);
            results.failed++;
        }

        // 4. Проверка загрузки настроек
        logSection('4. Проверка загрузки настроек');
        const updateInterval = MacroDataService.settings.updateInterval;
        const cacheTtl = MacroDataService.settings.cacheTtlHours;
        const hasSources = MacroDataService.settings.sources && typeof MacroDataService.settings.sources === 'object';
        
        logTest('Настройка updateInterval загружена', !!updateInterval, `Значение: ${updateInterval}`);
        if (updateInterval) results.passed++;
        else results.failed++;

        logTest('Настройка cacheTtlHours загружена', cacheTtl > 0, `Значение: ${cacheTtl} часов`);
        if (cacheTtl > 0) results.passed++;
        else results.failed++;

        logTest('Настройки источников загружены', hasSources, `Источники: ${JSON.stringify(MacroDataService.settings.sources)}`);
        if (hasSources) results.passed++;
        else results.failed++;

        // 5. Проверка настроек в Settings
        logSection('5. Проверка настроек в Settings');
        const macroUpdateInterval = await Settings.getSetting('macro_data_update_interval');
        const macroCacheTtl = await Settings.getSetting('macro_data_cache_ttl_hours');
        const macroSources = await Settings.getSetting('macro_data_sources');
        const cbrEnabled = await Settings.getSetting('macro_data_cbr_enabled');
        
        logTest('Настройка macro_data_update_interval существует', !!macroUpdateInterval, `Значение: ${macroUpdateInterval}`);
        if (macroUpdateInterval) results.passed++;
        else results.failed++;

        logTest('Настройка macro_data_cache_ttl_hours существует', macroCacheTtl !== null, `Значение: ${macroCacheTtl}`);
        if (macroCacheTtl !== null) results.passed++;
        else results.failed++;

        logTest('Настройка macro_data_sources существует', !!macroSources, `Тип: ${typeof macroSources}`);
        if (macroSources) results.passed++;
        else results.failed++;

        logTest('Настройка macro_data_cbr_enabled существует', cbrEnabled !== null, `Значение: ${cbrEnabled}`);
        if (cbrEnabled !== null) results.passed++;
        else results.failed++;

        // 6. Тестирование сохранения индикатора
        logSection('6. Тестирование сохранения индикатора');
        const testIndicator = {
            indicatorType: 'inflation',
            source: 'test',
            value: 5.5,
            period: new Date('2024-01-15'),
            periodType: 'monthly',
            unit: 'percent',
            metadata: {
                change: 0.2,
                previousValue: 5.3
            },
            country: 'RUS'
        };

        try {
            const savedIndicator = await MacroDataService.saveIndicator(testIndicator);
            const saved = savedIndicator && savedIndicator.id;
            logTest('Индикатор сохранен в БД', saved, `ID: ${savedIndicator?.id}`);
            if (saved) {
                results.passed++;
                
                // Проверяем получение сохраненного индикатора
                const retrieved = await MacroDataService.getIndicator('inflation', new Date('2024-01-15'), 'RUS');
                const retrievedSuccess = retrieved && retrieved.id === savedIndicator.id;
                logTest('Индикатор получен из БД', retrievedSuccess, `ID: ${retrieved?.id}`);
                if (retrievedSuccess) results.passed++;
                else results.failed++;
            } else {
                results.failed++;
            }
        } catch (error) {
            logTest('Индикатор сохранен в БД', false, error.message);
            results.failed++;
        }

        // 7. Тестирование метода getMacroFeatures
        logSection('7. Тестирование метода getMacroFeatures');
        try {
            const features = await MacroDataService.getMacroFeatures(new Date('2024-01-15'), 'RUS');
            const featuresValid = Array.isArray(features) && features.length === 8;
            logTest('Метод getMacroFeatures возвращает массив из 8 фичей', featuresValid, 
                `Получено фичей: ${features.length}`);
            if (featuresValid) {
                results.passed++;
                
                // Проверяем, что все значения в диапазоне [-1, 1]
                const allInRange = features.every(f => f >= -1 && f <= 1);
                logTest('Все фичи нормализованы в диапазоне [-1, 1]', allInRange, 
                    `Диапазоны: ${features.map(f => f.toFixed(3)).join(', ')}`);
                if (allInRange) results.passed++;
                else results.failed++;
            } else {
                results.failed++;
            }
        } catch (error) {
            logTest('Метод getMacroFeatures работает', false, error.message);
            results.failed++;
        }

        // 8. Тестирование кеширования
        logSection('8. Тестирование кеширования');
        // Очищаем кеш перед тестом
        MacroDataService.clearCache();
        const cacheSizeBefore = MacroDataService.dataCache.size;
        
        // Первый запрос - должен добавить в кеш
        await MacroDataService.getIndicator('inflation', new Date('2024-01-15'), 'RUS');
        const cacheSizeAfterFirst = MacroDataService.dataCache.size;
        
        // Второй запрос - должен использовать кеш (размер не должен измениться)
        await MacroDataService.getIndicator('inflation', new Date('2024-01-15'), 'RUS');
        const cacheSizeAfterSecond = MacroDataService.dataCache.size;
        
        const cacheWorks = cacheSizeAfterFirst > cacheSizeBefore && cacheSizeAfterSecond === cacheSizeAfterFirst;
        logTest('Кеширование работает', cacheWorks, 
            `Размер кеша: ${cacheSizeBefore} -> ${cacheSizeAfterFirst} -> ${cacheSizeAfterSecond}`);
        if (cacheWorks) results.passed++;
        else results.failed++;

        // Очистка кеша
        MacroDataService.clearCache();
        const cacheCleared = MacroDataService.dataCache.size === 0;
        logTest('Очистка кеша работает', cacheCleared, 
            `Размер кеша после очистки: ${MacroDataService.dataCache.size}`);
        if (cacheCleared) results.passed++;
        else results.failed++;

        // 9. Тестирование статуса сервиса
        logSection('9. Тестирование статуса сервиса');
        const status = MacroDataService.getStatus();
        const statusValid = status && status.isInitialized && status.settings && typeof status.cacheSize === 'number';
        logTest('Метод getStatus возвращает корректный статус', statusValid, 
            `Инициализирован: ${status.isInitialized}, Размер кеша: ${status.cacheSize}`);
        if (statusValid) results.passed++;
        else results.failed++;

        // 10. Очистка тестовых данных
        logSection('10. Очистка тестовых данных');
        try {
            await MacroIndicator.destroy({
                where: {
                    source: 'test'
                }
            });
            log('✅ Тестовые данные удалены', 'green');
            results.passed++;
        } catch (error) {
            log('⚠️ Не удалось удалить тестовые данные:', 'yellow');
            console.error(error);
            results.failed++;
        }

        // Итоги
        log('\n' + '='.repeat(60), 'cyan');
        log('ИТОГИ ТЕСТИРОВАНИЯ', 'cyan');
        log('='.repeat(60), 'cyan');
        log(`✅ Пройдено тестов: ${results.passed}`, 'green');
        log(`❌ Провалено тестов: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
        log(`📊 Всего тестов: ${results.passed + results.failed}`, 'cyan');
        log(`📈 Успешность: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`, 'cyan');
        log('='.repeat(60) + '\n', 'cyan');

        if (results.failed === 0) {
            log('🎉 Все тесты этапа 1 пройдены успешно!', 'green');
        } else {
            log('⚠️ Некоторые тесты провалены. Проверьте логи выше.', 'yellow');
        }

    } catch (error) {
        log('❌ Критическая ошибка во время тестов:', 'red');
        console.error(error);
        results.failed++;
    } finally {
        await sequelize.close();
        log('✅ Соединение с базой данных закрыто.', 'green');
        process.exit(results.failed > 0 ? 1 : 0);
    }
}

runStage1Tests();

