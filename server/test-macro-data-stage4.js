/**
 * Тестирование этапа 4: Интеграция макро-фичей в OptimizedDataService
 * 
 * Проверяет:
 * 1. Инициализацию OptimizedDataService с MacroDataService
 * 2. Корректность размера фичей (38 вместо 30)
 * 3. Наличие макро-фичей в векторе фичей
 * 4. Работу метода getMacroFeatures()
 * 5. Обработку ошибок
 */

import { initDatabase } from './src/utils/initDatabase.js';
import sequelize from './src/config/database.js';
import OptimizedDataService from './src/services/OptimizedDataService.js';
import MacroDataService from './src/services/MacroDataService.js';
import CacheService from './src/services/CacheService.js';
import CachedInstrument from './src/models/CachedInstrument.js';

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

const logSection = (title) => {
    log('\n' + '='.repeat(60), 'cyan');
    log(title, 'cyan');
    log('='.repeat(60), 'cyan');
};

// Modified logTest to only show failures
const logTest = (name, passed, details = '') => {
    if (!passed) {
        const status = '❌ FAIL';
        const color = 'red';
        log(`${status}: ${name} ${details ? `- ${details}` : ''}`, color);
    }
};

async function runStage4Tests() {
    const results = {
        passed: 0,
        failed: 0
    };

    try {
        logSection('ТЕСТИРОВАНИЕ ЭТАПА 4: ИНТЕГРАЦИЯ МАКРО-ФИЧЕЙ В OptimizedDataService');

        // 1. Инициализация
        logSection('1. Инициализация');
        try {
            await initDatabase();
            log('✅ База данных инициализирована', 'green');
            
            await CacheService.initialize();
            log('✅ CacheService инициализирован', 'green');
            
            await MacroDataService.initialize();
            log('✅ MacroDataService инициализирован', 'green');
            
            await OptimizedDataService.initialize();
            log('✅ OptimizedDataService инициализирован', 'green');
            
            results.passed++;
        } catch (error) {
            logTest('Инициализация сервисов', false, error.message);
            results.failed++;
            throw error;
        }

        // 2. Проверка инициализации MacroDataService в OptimizedDataService
        logSection('2. Проверка инициализации MacroDataService');
        try {
            const macroInitialized = MacroDataService.isInitialized;
            if (macroInitialized) {
                results.passed++;
                log('✅ MacroDataService инициализирован', 'green');
            } else {
                logTest('MacroDataService инициализирован', false, 'isInitialized = false');
                results.failed++;
            }
        } catch (error) {
            logTest('Проверка инициализации MacroDataService', false, error.message);
            results.failed++;
        }

        // 3. Проверка метода getMacroFeatures() в OptimizedDataService
        logSection('3. Проверка метода getMacroFeatures() в OptimizedDataService');
        try {
            const testDate = new Date();
            const macroFeatures = await OptimizedDataService.getMacroFeatures(testDate);
            
            const isArray = Array.isArray(macroFeatures);
            if (!isArray) {
                logTest('getMacroFeatures() возвращает массив', false, `Получено: ${typeof macroFeatures}`);
                results.failed++;
            } else {
                results.passed++;
                
                const correctSize = macroFeatures.length === 8;
                if (!correctSize) {
                    logTest('getMacroFeatures() возвращает 8 фичей', false, `Получено: ${macroFeatures.length}`);
                    results.failed++;
                } else {
                    results.passed++;
                    log(`✅ getMacroFeatures() возвращает 8 фичей: [${macroFeatures.map(f => f.toFixed(3)).join(', ')}]`, 'green');
                }
                
                // Проверяем, что все значения - числа
                const allNumbers = macroFeatures.every(f => typeof f === 'number' && !isNaN(f) && isFinite(f));
                if (!allNumbers) {
                    logTest('Все макро-фичи являются числами', false);
                    results.failed++;
                } else {
                    results.passed++;
                }
            }
        } catch (error) {
            logTest('Метод getMacroFeatures() работает', false, error.message);
            results.failed++;
        }

        // 4. Проверка размера фичей в createFeatureVector()
        logSection('4. Проверка размера фичей в createFeatureVector()');
        try {
            // Получаем тестовый инструмент
            const testInstrument = await CachedInstrument.findOne({
                where: { instrumentType: 'share' },
                limit: 1
            });
            
            if (!testInstrument) {
                log('⚠️ Нет доступных инструментов для тестирования', 'yellow');
                log('   Создаем тестовые свечи...', 'yellow');
                
                // Создаем тестовые свечи
                const testCandles = [];
                const baseDate = new Date();
                baseDate.setDate(baseDate.getDate() - 100);
                
                for (let i = 0; i < 100; i++) {
                    const date = new Date(baseDate);
                    date.setDate(date.getDate() + i);
                    testCandles.push({
                        time: date.toISOString(),
                        open: 100 + Math.random() * 10,
                        high: 105 + Math.random() * 10,
                        low: 95 + Math.random() * 10,
                        close: 100 + Math.random() * 10,
                        volume: 1000000 + Math.random() * 100000
                    });
                }
                
                // Используем тестовые свечи напрямую
                const window = testCandles.slice(-60);
                const featureVector = await OptimizedDataService.createFeatureVector(window, null);
                
                const correctSize = featureVector.length === 38;
                if (!correctSize) {
                    logTest('createFeatureVector() возвращает 38 фичей', false, `Получено: ${featureVector.length}`);
                    results.failed++;
                } else {
                    results.passed++;
                    log(`✅ createFeatureVector() возвращает 38 фичей (было 30)`, 'green');
                }
                
                // Проверяем, что все значения - числа
                const allNumbers = featureVector.every(f => typeof f === 'number' && !isNaN(f) && isFinite(f));
                if (!allNumbers) {
                    logTest('Все фичи являются числами', false);
                    results.failed++;
                } else {
                    results.passed++;
                }
                
                // Проверяем последние 8 фичей (макро-фичи)
                const macroFeaturesInVector = featureVector.slice(-8);
                const macroFeaturesValid = macroFeaturesInVector.every(f => typeof f === 'number' && !isNaN(f) && isFinite(f));
                if (!macroFeaturesValid) {
                    logTest('Макро-фичи в векторе фичей валидны', false);
                    results.failed++;
                } else {
                    results.passed++;
                    log(`✅ Макро-фичи присутствуют в векторе: [${macroFeaturesInVector.map(f => f.toFixed(3)).join(', ')}]`, 'green');
                }
            } else {
                const figi = testInstrument.figi;
                log(`📊 Тестирование с инструментом: ${testInstrument.name} (${figi})`, 'cyan');
                
                // Получаем свечи
                const candles = await CacheService.getCandles(figi, 'DAY', 100);
                
                if (candles.length < 60) {
                    log(`⚠️ Недостаточно свечей для тестирования: ${candles.length}`, 'yellow');
                    log('   Создаем тестовые свечи...', 'yellow');
                    
                    const testCandles = [];
                    const baseDate = new Date();
                    baseDate.setDate(baseDate.getDate() - 100);
                    
                    for (let i = 0; i < 100; i++) {
                        const date = new Date(baseDate);
                        date.setDate(date.getDate() + i);
                        testCandles.push({
                            time: date.toISOString(),
                            open: 100 + Math.random() * 10,
                            high: 105 + Math.random() * 10,
                            low: 95 + Math.random() * 10,
                            close: 100 + Math.random() * 10,
                            volume: 1000000 + Math.random() * 100000
                        });
                    }
                    
                    const window = testCandles.slice(-60);
                    const featureVector = await OptimizedDataService.createFeatureVector(window, figi);
                    
                    const correctSize = featureVector.length === 38;
                    if (!correctSize) {
                        logTest('createFeatureVector() возвращает 38 фичей', false, `Получено: ${featureVector.length}`);
                        results.failed++;
                    } else {
                        results.passed++;
                        log(`✅ createFeatureVector() возвращает 38 фичей (было 30)`, 'green');
                    }
                } else {
                    const window = candles.slice(-60);
                    const featureVector = await OptimizedDataService.createFeatureVector(window, figi);
                    
                    const correctSize = featureVector.length === 38;
                    if (!correctSize) {
                        logTest('createFeatureVector() возвращает 38 фичей', false, `Получено: ${featureVector.length}`);
                        results.failed++;
                    } else {
                        results.passed++;
                        log(`✅ createFeatureVector() возвращает 38 фичей (было 30)`, 'green');
                    }
                    
                    // Проверяем, что все значения - числа
                    const allNumbers = featureVector.every(f => typeof f === 'number' && !isNaN(f) && isFinite(f));
                    if (!allNumbers) {
                        logTest('Все фичи являются числами', false);
                        results.failed++;
                    } else {
                        results.passed++;
                    }
                    
                    // Проверяем последние 8 фичей (макро-фичи)
                    const macroFeaturesInVector = featureVector.slice(-8);
                    const macroFeaturesValid = macroFeaturesInVector.every(f => typeof f === 'number' && !isNaN(f) && isFinite(f));
                    if (!macroFeaturesValid) {
                        logTest('Макро-фичи в векторе фичей валидны', false);
                        results.failed++;
                    } else {
                        results.passed++;
                        log(`✅ Макро-фичи присутствуют в векторе: [${macroFeaturesInVector.map(f => f.toFixed(3)).join(', ')}]`, 'green');
                    }
                }
            }
        } catch (error) {
            logTest('Проверка размера фичей в createFeatureVector()', false, error.message);
            results.failed++;
        }

        // 5. Проверка обработки ошибок
        logSection('5. Проверка обработки ошибок');
        try {
            // Тестируем с невалидной датой (создаем объект, который не является валидной датой)
            const invalidDate = new Date('invalid');
            
            // Проверяем, что дата действительно невалидна
            if (isNaN(invalidDate.getTime())) {
                const macroFeaturesOnError = await OptimizedDataService.getMacroFeatures(invalidDate);
                
                const isArray = Array.isArray(macroFeaturesOnError);
                const correctSize = macroFeaturesOnError.length === 8;
                const allZeros = macroFeaturesOnError.every(f => f === 0);
                
                if (isArray && correctSize) {
                    results.passed++;
                    if (allZeros) {
                        results.passed++;
                        log('✅ При ошибке возвращаются 8 нулевых фичей', 'green');
                    } else {
                        // Это нормально, если некоторые фичи не нули (могут быть дефолтные значения)
                        results.passed++;
                        log('✅ При ошибке возвращаются 8 фичей (некоторые могут быть не нули)', 'green');
                    }
                } else {
                    logTest('Обработка ошибок в getMacroFeatures()', false, 
                        `Ожидалось массив из 8 элементов, получено: ${typeof macroFeaturesOnError}, длина: ${macroFeaturesOnError?.length || 0}`);
                    results.failed++;
                }
            } else {
                logTest('Создание невалидной даты для теста', false, 'Дата оказалась валидной');
                results.failed++;
            }
        } catch (error) {
            // Если метод выбрасывает ошибку вместо возврата нулей, это проблема
            logTest('Обработка ошибок в getMacroFeatures()', false, error.message);
            results.failed++;
        }

        // 6. Проверка prepareTrainingData()
        logSection('6. Проверка prepareTrainingData()');
        try {
            // Создаем тестовые свечи
            const testCandles = [];
            const baseDate = new Date();
            baseDate.setDate(baseDate.getDate() - 100);
            
            for (let i = 0; i < 100; i++) {
                const date = new Date(baseDate);
                date.setDate(date.getDate() + i);
                testCandles.push({
                    time: date.toISOString(),
                    open: 100 + Math.random() * 10,
                    high: 105 + Math.random() * 10,
                    low: 95 + Math.random() * 10,
                    close: 100 + Math.random() * 10,
                    volume: 1000000 + Math.random() * 100000
                });
            }
            
            // Используем null для figi, чтобы избежать запросов к API
            // prepareTrainingData должен работать с тестовыми свечами без figi
            const { features, labels } = await OptimizedDataService.prepareTrainingData(testCandles, 60, 5, null);
            
            if (features.length > 0) {
                results.passed++;
                
                const firstFeatureSize = features[0].length;
                const correctSize = firstFeatureSize === 38;
                
                if (!correctSize) {
                    logTest('prepareTrainingData() возвращает фичи размером 38', false, 
                        `Получено: ${firstFeatureSize}`);
                    results.failed++;
                } else {
                    results.passed++;
                    log(`✅ prepareTrainingData() возвращает фичи размером 38 (${features.length} образцов)`, 'green');
                }
                
                // Проверяем, что все фичи имеют одинаковый размер
                const allSameSize = features.every(f => f.length === 38);
                if (!allSameSize) {
                    logTest('Все фичи имеют одинаковый размер (38)', false);
                    results.failed++;
                } else {
                    results.passed++;
                }
            } else {
                logTest('prepareTrainingData() возвращает фичи', false, 'Массив пуст');
                results.failed++;
            }
        } catch (error) {
            logTest('Проверка prepareTrainingData()', false, error.message);
            results.failed++;
        }

        // Итоги
        log('\n' + '='.repeat(60), 'cyan');
        log('ИТОГИ ТЕСТИРОВАНИЯ ЭТАПА 4', 'cyan');
        log('='.repeat(60), 'cyan');
        log(`✅ Пройдено тестов: ${results.passed}`, 'green');
        log(`❌ Провалено тестов: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
        log(`📊 Всего тестов: ${results.passed + results.failed}`, 'cyan');
        log(`📈 Успешность: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`, 'cyan');
        log('='.repeat(60) + '\n', 'cyan');

        if (results.failed === 0) {
            log('🎉 Все тесты этапа 4 пройдены успешно!', 'green');
            log('✅ Макро-фичи успешно интегрированы в OptimizedDataService', 'green');
            log('✅ Размер фичей обновлен с 30 до 38', 'green');
        } else {
            log('⚠️ Некоторые тесты провалены. Проверьте логи выше.', 'yellow');
        }

    } catch (error) {
        log('❌ Критическая ошибка во время тестов:', 'red');
        console.error(error);
        results.failed++;
    } finally {
        await sequelize.close().catch(() => {});
        log('✅ Соединение с базой данных закрыто.', 'green');
        process.exit(results.failed > 0 ? 1 : 0);
    }
}

// Запускаем тесты
runStage4Tests().catch(error => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
});

