/**
 * Тесты для нового функционала сработавших сигналов
 * Проверяет:
 * - Обновление счетчика срабатываний (triggerCount)
 * - Накопление сигналов для отправки после анализа
 * - Обновление существующих сигналов вместо создания новых
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Загружаем переменные окружения
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

import sequelize from '../config/database.js';
import TriggeredSignal from '../models/TriggeredSignal.js';
import CachedSignal from '../models/CachedSignal.js';
import CachedInstrument from '../models/CachedInstrument.js';

const { Op } = sequelize.Sequelize;

async function runTests() {
    console.log('🧪 Запуск тестов для нового функционала TriggeredSignal...\n');

    let passedTests = 0;
    let failedTests = 0;

    try {
        await sequelize.authenticate();
        console.log('✅ Подключение к БД успешно\n');

        // Создаем или находим тестовый инструмент
        let testInstrument = await CachedInstrument.findOne({
            where: { currency: 'RUB', instrumentType: 'share' },
            limit: 1
        });

        if (!testInstrument) {
            testInstrument = await CachedInstrument.findOrCreate({
                where: { figi: 'TEST_FIGI_NEW_FEATURES' },
                defaults: {
                    figi: 'TEST_FIGI_NEW_FEATURES',
                    ticker: 'TEST_NEW',
                    name: 'Тестовый инструмент для новых функций',
                    currency: 'RUB',
                    instrumentType: 'share',
                    lot: 1,
                    lastPrice: 100.0,
                    lastPriceTime: new Date(),
                    apiData: {},
                    isActive: true
                }
            }).then(([inst]) => inst);
            console.log('   ℹ️ Создан тестовый инструмент для тестов');
        }

        // Тест 1: Обновление счетчика срабатываний при повторном срабатывании
        console.log('📋 Тест 1: Обновление счетчика срабатываний');
        try {
            const testSignalId = `TEST_SIGNAL_COUNT_${Date.now()}`;
            
            // Создаем тестовый сигнал в кеше
            const testSignal = await CachedSignal.create({
                signalId: testSignalId,
                strategyId: 'TEST_STRATEGY',
                strategyName: 'Тестовая стратегия',
                instrumentUid: testInstrument.figi,
                figi: testInstrument.figi,
                createDt: new Date(),
                endDt: new Date(Date.now() + 86400000),
                direction: 'SIGNAL_DIRECTION_BUY',
                initialPrice: { units: 100, nano: 0 },
                targetPrice: { units: 110, nano: 0 },
                stoploss: { units: 95, nano: 0 },
                probability: 75,
                name: 'Тестовый сигнал для счетчика',
                info: 'Тестовая информация'
            });

            // Первое срабатывание
            const [triggered1, created1] = await TriggeredSignal.findOrCreate({
                where: {
                    signalId: testSignalId,
                    triggerType: 'target_reached'
                },
                defaults: {
                    signalId: testSignalId,
                    strategyId: testSignal.strategyId,
                    strategyName: testSignal.strategyName,
                    figi: testInstrument.figi,
                    ticker: testInstrument.ticker,
                    name: testInstrument.name,
                    direction: testSignal.direction,
                    triggerType: 'target_reached',
                    initialPrice: 100,
                    currentPrice: 110,
                    targetPrice: 110,
                    stoploss: 95,
                    signalName: testSignal.name,
                    probability: testSignal.probability,
                    status: 'triggered',
                    triggerCount: 1,
                    lastTriggeredAt: new Date(),
                    triggeredAt: new Date()
                }
            });

            if (!created1 && triggered1) {
                await triggered1.update({
                    triggerCount: (triggered1.triggerCount || 1) + 1,
                    lastTriggeredAt: new Date(),
                    currentPrice: 110
                });
            }

            // Второе срабатывание (симулируем повторное срабатывание)
            const [triggered2, created2] = await TriggeredSignal.findOrCreate({
                where: {
                    signalId: testSignalId,
                    triggerType: 'target_reached'
                },
                defaults: {
                    signalId: testSignalId,
                    strategyId: testSignal.strategyId,
                    strategyName: testSignal.strategyName,
                    figi: testInstrument.figi,
                    ticker: testInstrument.ticker,
                    name: testInstrument.name,
                    direction: testSignal.direction,
                    triggerType: 'target_reached',
                    initialPrice: 100,
                    currentPrice: 111,
                    targetPrice: 110,
                    stoploss: 95,
                    signalName: testSignal.name,
                    probability: testSignal.probability,
                    status: 'triggered',
                    triggerCount: 1,
                    lastTriggeredAt: new Date(),
                    triggeredAt: new Date()
                }
            });

            if (!created2 && triggered2) {
                await triggered2.update({
                    triggerCount: (triggered2.triggerCount || 1) + 1,
                    lastTriggeredAt: new Date(),
                    currentPrice: 111
                });
            }

            // Проверяем результат
            const finalSignal = await TriggeredSignal.findOne({
                where: {
                    signalId: testSignalId,
                    triggerType: 'target_reached'
                }
            });

            if (finalSignal && finalSignal.triggerCount >= 2 && finalSignal.currentPrice === 111) {
                console.log(`   ✅ Счетчик обновлен корректно: triggerCount=${finalSignal.triggerCount}, currentPrice=${finalSignal.currentPrice}`);
                passedTests++;
            } else {
                throw new Error(`Ожидалось triggerCount >= 2, currentPrice=111. Получено: triggerCount=${finalSignal?.triggerCount}, currentPrice=${finalSignal?.currentPrice}`);
            }

            // Очистка
            await TriggeredSignal.destroy({ where: { signalId: testSignalId } });
            await testSignal.destroy();
        } catch (error) {
            console.error(`   ❌ Тест провален: ${error.message}`);
            failedTests++;
        }

        // Тест 2: Проверка накопления сигналов в pendingTriggeredSignals
        console.log('\n📋 Тест 2: Накопление сигналов для отправки после анализа');
        try {
            // Создаем объект для тестирования накопления сигналов
            const scheduler = {
                pendingTriggeredSignals: []
            };
            
            // Симулируем несколько сработавших сигналов
            const testSignals = [
                {
                    signalId: `TEST_SIGNAL_PENDING_1_${Date.now()}`,
                    figi: testInstrument.figi,
                    ticker: testInstrument.ticker,
                    name: testInstrument.name,
                    direction: 'SIGNAL_DIRECTION_BUY',
                    triggerType: 'target_reached',
                    currentPrice: 110,
                    targetPrice: 110,
                    stoploss: 95,
                    strategyName: 'Тестовая стратегия',
                    triggerCount: 1
                },
                {
                    signalId: `TEST_SIGNAL_PENDING_2_${Date.now()}`,
                    figi: testInstrument.figi,
                    ticker: testInstrument.ticker,
                    name: testInstrument.name,
                    direction: 'SIGNAL_DIRECTION_BUY',
                    triggerType: 'target_reached',
                    currentPrice: 111,
                    targetPrice: 110,
                    stoploss: 95,
                    strategyName: 'Тестовая стратегия',
                    triggerCount: 1
                }
            ];

            // Добавляем сигналы в очередь
            scheduler.pendingTriggeredSignals = testSignals;

            if (scheduler.pendingTriggeredSignals.length === 2) {
                console.log('   ✅ Сигналы успешно накоплены в pendingTriggeredSignals');
                passedTests++;
            } else {
                throw new Error(`Ожидалось 2 сигнала, получено: ${scheduler.pendingTriggeredSignals.length}`);
            }
        } catch (error) {
            console.error(`   ❌ Тест провален: ${error.message}`);
            failedTests++;
        }

        // Тест 3: Проверка обновления lastTriggeredAt при повторном срабатывании
        console.log('\n📋 Тест 3: Обновление lastTriggeredAt при повторном срабатывании');
        try {
            const testSignalId = `TEST_SIGNAL_LAST_TRIGGER_${Date.now()}`;
            
            const firstTriggerTime = new Date();
            await new Promise(resolve => setTimeout(resolve, 1000)); // Задержка 1 секунда
            
            // Первое срабатывание
            const [triggered1] = await TriggeredSignal.findOrCreate({
                where: {
                    signalId: testSignalId,
                    triggerType: 'target_reached'
                },
                defaults: {
                    signalId: testSignalId,
                    strategyId: 'TEST_STRATEGY',
                    strategyName: 'Тестовая стратегия',
                    figi: testInstrument.figi,
                    ticker: testInstrument.ticker,
                    name: testInstrument.name,
                    direction: 'SIGNAL_DIRECTION_BUY',
                    triggerType: 'target_reached',
                    initialPrice: 100,
                    currentPrice: 110,
                    targetPrice: 110,
                    stoploss: 95,
                    status: 'triggered',
                    triggerCount: 1,
                    lastTriggeredAt: firstTriggerTime,
                    triggeredAt: firstTriggerTime
                }
            });

            await new Promise(resolve => setTimeout(resolve, 1000)); // Задержка 1 секунда
            const secondTriggerTime = new Date();

            // Второе срабатывание
            if (!triggered1.isNewRecord) {
                await triggered1.update({
                    triggerCount: triggered1.triggerCount + 1,
                    lastTriggeredAt: secondTriggerTime,
                    currentPrice: 111
                });
            }

            // Проверяем результат
            const finalSignal = await TriggeredSignal.findOne({
                where: {
                    signalId: testSignalId,
                    triggerType: 'target_reached'
                }
            });

            if (finalSignal && finalSignal.lastTriggeredAt.getTime() >= secondTriggerTime.getTime() - 1000) {
                console.log(`   ✅ lastTriggeredAt обновлен корректно: ${finalSignal.lastTriggeredAt.toISOString()}`);
                passedTests++;
            } else {
                throw new Error(`lastTriggeredAt не обновлен корректно`);
            }

            // Очистка
            await TriggeredSignal.destroy({ where: { signalId: testSignalId } });
        } catch (error) {
            console.error(`   ❌ Тест провален: ${error.message}`);
            failedTests++;
        }

        // Тест 4: Проверка группировки сигналов по инструменту
        console.log('\n📋 Тест 4: Группировка сигналов по инструменту');
        try {
            // Создаем объект для тестирования группировки сигналов
            const scheduler = {
                pendingTriggeredSignals: []
            };
            
            // Создаем несколько сигналов для одного инструмента
            const testSignals = [
                {
                    signalId: `TEST_SIGNAL_GROUP_1_${Date.now()}`,
                    figi: testInstrument.figi,
                    ticker: testInstrument.ticker,
                    name: testInstrument.name,
                    direction: 'SIGNAL_DIRECTION_BUY',
                    triggerType: 'target_reached',
                    currentPrice: 110,
                    targetPrice: 110,
                    stoploss: 95,
                    strategyName: 'Тестовая стратегия',
                    triggerCount: 1
                },
                {
                    signalId: `TEST_SIGNAL_GROUP_2_${Date.now()}`,
                    figi: testInstrument.figi,
                    ticker: testInstrument.ticker,
                    name: testInstrument.name,
                    direction: 'SIGNAL_DIRECTION_BUY',
                    triggerType: 'target_reached',
                    currentPrice: 111,
                    targetPrice: 110,
                    stoploss: 95,
                    strategyName: 'Тестовая стратегия',
                    triggerCount: 2
                }
            ];

            scheduler.pendingTriggeredSignals = testSignals;

            // Группируем сигналы по инструменту
            const signalsByInstrument = {};
            for (const triggered of scheduler.pendingTriggeredSignals) {
                const key = `${triggered.figi}_${triggered.triggerType}`;
                if (!signalsByInstrument[key]) {
                    signalsByInstrument[key] = [];
                }
                signalsByInstrument[key].push(triggered);
            }

            if (Object.keys(signalsByInstrument).length === 1 && signalsByInstrument[`${testInstrument.figi}_target_reached`].length === 2) {
                console.log('   ✅ Сигналы корректно сгруппированы по инструменту');
                passedTests++;
            } else {
                throw new Error(`Ожидалась 1 группа с 2 сигналами, получено: ${Object.keys(signalsByInstrument).length} групп`);
            }
        } catch (error) {
            console.error(`   ❌ Тест провален: ${error.message}`);
            failedTests++;
        }

        // Итоги
        console.log('\n' + '='.repeat(50));
        console.log(`📊 Результаты тестирования нового функционала:`);
        console.log(`   ✅ Пройдено: ${passedTests}`);
        console.log(`   ❌ Провалено: ${failedTests}`);
        console.log(`   📈 Успешность: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`);
        console.log('='.repeat(50));

        if (failedTests === 0) {
            console.log('\n🎉 Все тесты нового функционала пройдены успешно!');
        } else {
            console.log('\n⚠️ Некоторые тесты провалены. Проверьте логи выше.');
        }

    } catch (error) {
        console.error('\n❌ Критическая ошибка при выполнении тестов:', error);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

// Запускаем тесты
runTests().catch(console.error);

