/**
 * Тесты для функционала сработавших сигналов
 * Проверяет сохранение, очистку и связь с заявками
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
import TradingRequest from '../models/TradingRequest.js';
import Recommendation from '../models/Recommendation.js';
import TradingStrategy from '../models/TradingStrategy.js';
import PositionStrategy from '../models/PositionStrategy.js';

const { Op } = sequelize.Sequelize;

async function runTests() {
    console.log('🧪 Запуск тестов для TriggeredSignal...\n');

    let passedTests = 0;
    let failedTests = 0;

    try {
        await sequelize.authenticate();
        console.log('✅ Подключение к БД успешно\n');

        // Создаем или находим тестовый инструмент один раз для всех тестов
        let testInstrument = await CachedInstrument.findOne({
            where: { currency: 'RUB', instrumentType: 'share' },
            limit: 1
        });

        if (!testInstrument) {
            // Создаем тестовый инструмент, если его нет
            testInstrument = await CachedInstrument.findOrCreate({
                where: { figi: 'TEST_FIGI_TRIGGERED_SIGNAL' },
                defaults: {
                    figi: 'TEST_FIGI_TRIGGERED_SIGNAL',
                    ticker: 'TEST',
                    name: 'Тестовый инструмент для TriggeredSignal',
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

        // Тест 1: Сохранение сработавшего сигнала (целевая цена достигнута)
        console.log('📋 Тест 1: Сохранение сработавшего сигнала (target_reached)');
        try {

            // Создаем тестовый сигнал в кеше
            const testSignal = await CachedSignal.create({
                signalId: `TEST_SIGNAL_${Date.now()}`,
                strategyId: 'TEST_STRATEGY',
                strategyName: 'Тестовая стратегия',
                instrumentUid: testInstrument.figi,
                figi: testInstrument.figi,
                createDt: new Date(),
                endDt: new Date(Date.now() + 86400000), // +1 день
                direction: 'SIGNAL_DIRECTION_BUY',
                initialPrice: { units: 100, nano: 0 },
                targetPrice: { units: 110, nano: 0 },
                stoploss: { units: 95, nano: 0 },
                probability: 75,
                name: 'Тестовый сигнал',
                info: 'Тестовая информация'
            });

            // Создаем сработавший сигнал
            const triggered = await TriggeredSignal.create({
                signalId: testSignal.signalId,
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
                triggeredAt: new Date(),
                signalCreateDt: testSignal.createDt,
                signalEndDt: testSignal.endDt
            });

            if (triggered.id) {
                console.log('   ✅ Сигнал успешно сохранен');
                passedTests++;
            } else {
                throw new Error('Сигнал не был сохранен');
            }

            // Очистка
            await TriggeredSignal.destroy({ where: { signalId: testSignal.signalId } });
            await testSignal.destroy();
        } catch (error) {
            console.error(`   ❌ Тест провален: ${error.message}`);
            failedTests++;
        }

        // Тест 2: Сохранение сработавшего сигнала (стоп-лосс)
        console.log('\n📋 Тест 2: Сохранение сработавшего сигнала (stoploss_triggered)');
        try {

            const testSignal = await CachedSignal.create({
                signalId: `TEST_SIGNAL_STOP_${Date.now()}`,
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
                name: 'Тестовый сигнал стоп-лосс',
                info: 'Тестовая информация'
            });

            const triggered = await TriggeredSignal.create({
                signalId: testSignal.signalId,
                strategyId: testSignal.strategyId,
                strategyName: testSignal.strategyName,
                figi: testInstrument.figi,
                ticker: testInstrument.ticker,
                name: testInstrument.name,
                direction: testSignal.direction,
                triggerType: 'stoploss_triggered',
                initialPrice: 100,
                currentPrice: 94,
                targetPrice: 110,
                stoploss: 95,
                signalName: testSignal.name,
                probability: testSignal.probability,
                status: 'triggered',
                triggerCount: 1,
                lastTriggeredAt: new Date(),
                triggeredAt: new Date(),
                signalCreateDt: testSignal.createDt,
                signalEndDt: testSignal.endDt
            });

            if (triggered.id && triggered.triggerType === 'stoploss_triggered') {
                console.log('   ✅ Сигнал стоп-лосс успешно сохранен');
                passedTests++;
            } else {
                throw new Error('Сигнал стоп-лосс не был сохранен корректно');
            }

            // Очистка
            await TriggeredSignal.destroy({ where: { signalId: testSignal.signalId } });
            await testSignal.destroy();
        } catch (error) {
            console.error(`   ❌ Тест провален: ${error.message}`);
            failedTests++;
        }

        // Тест 3: Один сигнал может сработать дважды (цель и стоп-лосс)
        console.log('\n📋 Тест 3: Один сигнал может сработать дважды');
        try {

            const testSignalId = `TEST_SIGNAL_DOUBLE_${Date.now()}`;
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
                name: 'Тестовый сигнал двойной',
                info: 'Тестовая информация'
            });

            // Первое срабатывание - цель
            const triggered1 = await TriggeredSignal.create({
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
                triggeredAt: new Date(),
                signalCreateDt: testSignal.createDt,
                signalEndDt: testSignal.endDt
            });

            // Второе срабатывание - стоп-лосс (должно быть разрешено)
            const triggered2 = await TriggeredSignal.create({
                signalId: testSignalId,
                strategyId: testSignal.strategyId,
                strategyName: testSignal.strategyName,
                figi: testInstrument.figi,
                ticker: testInstrument.ticker,
                name: testInstrument.name,
                direction: testSignal.direction,
                triggerType: 'stoploss_triggered',
                initialPrice: 100,
                currentPrice: 94,
                targetPrice: 110,
                stoploss: 95,
                signalName: testSignal.name,
                probability: testSignal.probability,
                status: 'triggered',
                triggerCount: 1,
                lastTriggeredAt: new Date(),
                triggeredAt: new Date(),
                signalCreateDt: testSignal.createDt,
                signalEndDt: testSignal.endDt
            });

            if (triggered1.id && triggered2.id && triggered1.id !== triggered2.id) {
                console.log('   ✅ Один сигнал может сработать дважды (цель и стоп-лосс)');
                passedTests++;
            } else {
                throw new Error('Не удалось создать два срабатывания для одного сигнала');
            }

            // Очистка
            await TriggeredSignal.destroy({ where: { signalId: testSignalId } });
            await testSignal.destroy();
        } catch (error) {
            console.error(`   ❌ Тест провален: ${error.message}`);
            failedTests++;
        }

        // Тест 4: Связь с торговой заявкой
        console.log('\n📋 Тест 4: Связь с торговой заявкой');
        try {

            // Создаем стратегию
            const strategy = await TradingStrategy.findOne({
                where: { type: 'moderate' },
                limit: 1
            });

            if (!strategy) {
                throw new Error('Не найдена тестовая стратегия');
            }

            // Создаем рекомендацию с уникальным figi для теста
            const testFigi = `TEST_FIGI_RECOMMENDATION_${Date.now()}`;
            const recommendationResult = await Recommendation.findOrCreate({
                where: { figi: testFigi },
                defaults: {
                    figi: testFigi,
                    ticker: testInstrument.ticker,
                    name: testInstrument.name,
                    recommendation: 'BUY',
                    confidence: 0.7,
                    score: 0.75,
                    priceAtAnalysis: 100,
                    analysisDate: new Date(),
                    isActive: true,
                    strategyId: strategy.id
                }
            });
            
            const recommendation = recommendationResult[0];
            
            if (!recommendation || !recommendation.figi) {
                throw new Error('Не удалось создать или найти рекомендацию');
            }

            // Создаем торговую заявку
            // recommendationId в TradingRequest ссылается на figi (первичный ключ Recommendation)
            const tradingRequest = await TradingRequest.create({
                recommendationId: recommendation.figi,
                figi: testFigi,
                ticker: testInstrument.ticker,
                name: testInstrument.name,
                action: 'BUY',
                quantity: 10,
                priceAtRequest: 100,
                estimatedAmount: 1000,
                confidence: 0.7,
                score: 0.75,
                status: 'PENDING',
                tradingMode: 'paper',
                strategyId: strategy.id
            });

            // Создаем сработавший сигнал с привязкой к заявке
            const testSignalId = `TEST_SIGNAL_REQUEST_${Date.now()}`;
            const triggered = await TriggeredSignal.create({
                signalId: testSignalId,
                strategyId: 'TEST_STRATEGY',
                strategyName: 'Тестовая стратегия',
                figi: testFigi,
                ticker: testInstrument.ticker,
                name: testInstrument.name,
                direction: 'SIGNAL_DIRECTION_BUY',
                triggerType: 'target_reached',
                initialPrice: 100,
                currentPrice: 110,
                targetPrice: 110,
                stoploss: 95,
                signalName: 'Тестовый сигнал с заявкой',
                probability: 75,
                status: 'executed',
                triggerCount: 1,
                lastTriggeredAt: new Date(),
                tradingRequestId: tradingRequest.id,
                triggeredAt: new Date()
            });

            // Проверяем связь
            const foundSignal = await TriggeredSignal.findOne({
                where: { tradingRequestId: tradingRequest.id }
            });

            if (foundSignal && foundSignal.tradingRequestId === tradingRequest.id) {
                console.log('   ✅ Связь с торговой заявкой работает корректно');
                passedTests++;
            } else {
                throw new Error('Связь с торговой заявкой не работает');
            }

            // Очистка
            await TriggeredSignal.destroy({ where: { signalId: testSignalId } });
            await PositionStrategy.destroy({ where: { positionId: tradingRequest.id } });
            await tradingRequest.destroy();
            await recommendation.destroy();
        } catch (error) {
            console.error(`   ❌ Тест провален: ${error.message}`);
            failedTests++;
        }

        // Тест 5: Очистка старых сигналов
        console.log('\n📋 Тест 5: Очистка старых сигналов');
        try {

            // Создаем старый сигнал (2 дня назад)
            const oldDate = new Date();
            oldDate.setDate(oldDate.getDate() - 2);

            const oldSignalId = `TEST_SIGNAL_OLD_${Date.now()}`;
            const oldTriggered = await TriggeredSignal.create({
                signalId: oldSignalId,
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
                signalName: 'Старый сигнал',
                probability: 75,
                status: 'triggered',
                triggerCount: 1,
                lastTriggeredAt: oldDate,
                triggeredAt: oldDate
            });

            // Создаем новый сигнал (сегодня)
            const newSignalId = `TEST_SIGNAL_NEW_${Date.now()}`;
            const newTriggered = await TriggeredSignal.create({
                signalId: newSignalId,
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
                signalName: 'Новый сигнал',
                probability: 75,
                status: 'triggered',
                triggerCount: 1,
                lastTriggeredAt: new Date(),
                triggeredAt: new Date()
            });

            // Очищаем сигналы старше 1 дня
            const oneDayAgo = new Date();
            oneDayAgo.setDate(oneDayAgo.getDate() - 1);

            const deletedCount = await TriggeredSignal.destroy({
                where: {
                    triggeredAt: {
                        [Op.lt]: oneDayAgo
                    }
                }
            });

            // Проверяем, что старый удален, а новый остался
            const oldExists = await TriggeredSignal.findByPk(oldTriggered.id);
            const newExists = await TriggeredSignal.findByPk(newTriggered.id);

            if (!oldExists && newExists && deletedCount >= 1) {
                console.log(`   ✅ Очистка работает корректно (удалено ${deletedCount} старых сигналов)`);
                passedTests++;
            } else {
                throw new Error(`Очистка не работает: старый=${!!oldExists}, новый=${!!newExists}, удалено=${deletedCount}`);
            }

            // Очистка
            await TriggeredSignal.destroy({ where: { signalId: newSignalId } });
        } catch (error) {
            console.error(`   ❌ Тест провален: ${error.message}`);
            failedTests++;
        }

        // Тест 6: Проверка статусов сигналов
        console.log('\n📋 Тест 6: Проверка статусов сигналов');
        try {

            const testSignalId = `TEST_SIGNAL_STATUS_${Date.now()}`;
            const triggered = await TriggeredSignal.create({
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
                signalName: 'Тестовый сигнал',
                probability: 75,
                status: 'triggered',
                triggerCount: 1,
                lastTriggeredAt: new Date(),
                triggeredAt: new Date()
            });

            // Обновляем статус на executed
            await triggered.update({ status: 'executed' });
            const updated = await TriggeredSignal.findByPk(triggered.id);

            if (updated.status === 'executed') {
                console.log('   ✅ Обновление статуса работает корректно');
                passedTests++;
            } else {
                throw new Error('Статус не обновился');
            }

            // Очистка
            await TriggeredSignal.destroy({ where: { signalId: testSignalId } });
        } catch (error) {
            console.error(`   ❌ Тест провален: ${error.message}`);
            failedTests++;
        }

        // Итоги
        console.log('\n' + '='.repeat(50));
        console.log(`📊 Результаты тестирования:`);
        console.log(`   ✅ Пройдено: ${passedTests}`);
        console.log(`   ❌ Провалено: ${failedTests}`);
        console.log(`   📈 Успешность: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`);
        console.log('='.repeat(50));

        if (failedTests === 0) {
            console.log('\n🎉 Все тесты пройдены успешно!');
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

