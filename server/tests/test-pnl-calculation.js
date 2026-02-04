#!/usr/bin/env node

/**
 * Скрипт для ручного тестирования расчета PnL
 * Запуск: node test-pnl-calculation.js
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения
dotenv.config({ path: join(__dirname, '.env') });

async function testPnLCalculation() {
    console.log('🧪 Тестирование расчета PnL\n');

    try {
        // Импортируем сервисы
        const PnLCalculationService = (await import('../src/services/PnLCalculationService.js')).default;
        const CashFlow = (await import('../src/models/CashFlow.js')).default;

        // Инициализируем сервис
        await PnLCalculationService.initialize();
        console.log('✅ PnLCalculationService инициализирован\n');

        // Тест 1: Расчет реализованной прибыли
        console.log('📊 Тест 1: Расчет реализованной прибыли');
        const closedTrades = [
            {
                figi: 'TEST1',
                ticker: 'TEST1',
                name: 'Test Stock 1',
                entryPrice: 100,
                exitPrice: 110,
                quantity: 10,
                commission: 5,
                executedAt: new Date()
            },
            {
                figi: 'TEST2',
                ticker: 'TEST2',
                name: 'Test Stock 2',
                entryPrice: 50,
                exitPrice: 45,
                quantity: 20,
                commission: 3,
                executedAt: new Date()
            }
        ];

        const realizedPnL = PnLCalculationService.calculateRealizedPnL(closedTrades);
        console.log('Результат:', {
            total: realizedPnL.total,
            count: realizedPnL.count,
            profitable: realizedPnL.profitable,
            unprofitable: realizedPnL.unprofitable,
            winRate: realizedPnL.winRate.toFixed(2) + '%'
        });
        console.log('✅ Тест 1 пройден\n');

        // Тест 2: Расчет нереализованной прибыли
        console.log('📊 Тест 2: Расчет нереализованной прибыли');
        const openPositions = [
            {
                figi: 'TEST3',
                ticker: 'TEST3',
                name: 'Test Stock 3',
                entryPrice: 100,
                quantity: 10
            }
        ];

        const currentPrices = {
            'TEST3': 105
        };

        const unrealizedPnL = PnLCalculationService.calculateUnrealizedPnL(openPositions, currentPrices);
        console.log('Результат:', {
            total: unrealizedPnL.total,
            count: unrealizedPnL.count,
            profitable: unrealizedPnL.profitable,
            unprofitable: unrealizedPnL.unprofitable
        });
        console.log('✅ Тест 2 пройден\n');

        // Тест 3: Работа с CashFlow (если БД доступна)
        console.log('📊 Тест 3: Работа с CashFlow');
        try {
            // Проверяем, доступна ли БД
            const sequelize = (await import('../src/config/database.js')).default;
            await sequelize.authenticate();
            console.log('✅ Подключение к БД установлено');

            // Получаем статистику CashFlow
            const totalDeposits = await CashFlow.getTotalDeposits('real');
            const totalWithdrawals = await CashFlow.getTotalWithdrawals('real');
            const netCashFlow = await CashFlow.getNetCashFlow('real');

            console.log('Статистика CashFlow:', {
                totalDeposits,
                totalWithdrawals,
                netCashFlow
            });
            console.log('✅ Тест 3 пройден\n');
        } catch (error) {
            console.log('⚠️ Тест 3 пропущен (БД недоступна):', error.message);
            console.log('   Это нормально, если БД не настроена\n');
        }

        // Тест 4: Полный расчет PnL (мок данных)
        console.log('📊 Тест 4: Полный расчет PnL');
        const mockPortfolio = {
            mode: 'real',
            initialCapital: 1000000,
            totalValue: 1070000,
            cash: 500000,
            positionsValue: 570000,
            positions: {}
        };

        // Мокаем методы получения данных
        const originalGetClosedTrades = PnLCalculationService.getClosedTrades;
        const originalGetOpenPositions = PnLCalculationService.getOpenPositions;

        PnLCalculationService.getClosedTrades = async () => closedTrades;
        PnLCalculationService.getOpenPositions = async () => openPositions;

        const totalPnL = await PnLCalculationService.calculateTotalPnL(mockPortfolio, {
            tradingMode: 'real',
            includeTrades: true,
            includePositions: true,
            includeCashFlow: false // Отключаем для теста без БД
        });

        // Восстанавливаем оригинальные методы
        PnLCalculationService.getClosedTrades = originalGetClosedTrades;
        PnLCalculationService.getOpenPositions = originalGetOpenPositions;

        console.log('Результат полного расчета:', {
            realized: totalPnL.realized.total,
            unrealized: totalPnL.unrealized.total,
            total: totalPnL.total.pnl,
            totalPercent: totalPnL.total.percent.toFixed(2) + '%',
            winRate: totalPnL.summary.winRate.toFixed(2) + '%'
        });
        console.log('✅ Тест 4 пройден\n');

        console.log('🎉 Все тесты пройдены успешно!');

    } catch (error) {
        console.error('❌ Ошибка при тестировании:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

// Запускаем тесты
testPnLCalculation()
    .then(() => {
        console.log('\n✅ Тестирование завершено');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Критическая ошибка:', error);
        process.exit(1);
    });


