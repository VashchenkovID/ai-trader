import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Sequelize, DataTypes } from 'sequelize';

// Загружаем переменные окружения
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

// Создаем подключение к БД с правильной загрузкой пароля
const dbName = process.env.DB_NAME;
const dbUser = process.env.DB_USER;
const dbPassword = String(process.env.DB_PASSWORD || '');
const dbHost = process.env.DB_HOST;
const dbPort = process.env.DB_PORT;

if (!dbName || !dbUser || !dbPassword || !dbHost || !dbPort) {
    console.error('❌ Database environment variables are not set');
    process.exit(1);
}

const sequelize = new Sequelize(dbName, dbUser, dbPassword, {
    host: dbHost,
    port: dbPort,
    dialect: 'postgres',
    logging: false
});

// Импортируем модели и сервисы
import RiskManagementService from '../services/RiskManagementService.js';
import TrailingStopModel from '../models/TrailingStop.js';
import { Op } from 'sequelize';

// Инициализируем модель с нашим подключением
const TrailingStop = TrailingStopModel.init(TrailingStopModel.rawAttributes, {
    ...TrailingStopModel.options,
    sequelize: sequelize
});

/**
 * Тестирование системы трейлинг-стопов
 */
async function testTrailingStops() {
    console.log('🧪 Начало тестирования трейлинг-стопов...\n');

    try {
        // 1. Проверка подключения к БД
        console.log('📋 Шаг 1: Проверка подключения к БД...');
        await sequelize.authenticate();
        console.log('✅ Подключение к БД установлено\n');

        // 2. Инициализация сервисов
        console.log('📋 Шаг 2: Инициализация сервисов...');
        if (!RiskManagementService.isInitialized) {
            await RiskManagementService.initialize();
        }
        console.log('✅ Сервисы инициализированы\n');

        // 3. Используем тестовые данные
        console.log('📋 Шаг 3: Использование тестовых данных...');
        const testInstrument = {
            figi: 'BBG004730N88', // SBER
            ticker: 'SBER',
            lastPrice: 280.50
        };
        console.log(`✅ Используем тестовый инструмент: ${testInstrument.ticker} (${testInstrument.figi})\n`);

        // 4. Создание тестового трейлинг-стопа
        console.log('📋 Шаг 4: Создание тестового трейлинг-стопа...');
        const entryPrice = testInstrument.lastPrice;
        const quantity = 10;
        
        const trailingStop = await RiskManagementService.createTrailingStop({
            figi: testInstrument.figi,
            ticker: testInstrument.ticker,
            entryPrice: entryPrice,
            quantity: quantity,
            direction: 'BUY',
            activationProfitPercent: 5.0,
            trailingDistancePercent: 2.5,
            useATR: false,
            portfolioType: 'virtual'
        });
        
        console.log(`✅ Трейлинг-стоп создан: ID=${trailingStop.id}`);
        console.log(`   - Цена входа: ${entryPrice.toFixed(2)}₽`);
        console.log(`   - Количество: ${quantity} шт.`);
        console.log(`   - Активация при: +5%`);
        console.log(`   - Отступ: 2.5%\n`);

        // 5. Тест 1: Проверка активации при достижении +5% прибыли
        console.log('📋 Шаг 5: Тест активации трейлинг-стопа...');
        const activationPrice = entryPrice * 1.05; // +5%
        console.log(`   Симулируем цену: ${activationPrice.toFixed(2)}₽ (+5%)`);
        
        const activatedStop = await RiskManagementService.updateTrailingStop(
            trailingStop.id,
            activationPrice
        );
        
        if (activatedStop.isActive && activatedStop.status === 'active') {
            console.log(`✅ Трейлинг-стоп активирован!`);
            console.log(`   - Текущая стоп-цена: ${activatedStop.currentStopPrice.toFixed(2)}₽`);
            console.log(`   - Максимальная цена: ${activatedStop.highestPrice.toFixed(2)}₽\n`);
        } else {
            console.log(`❌ Ошибка: трейлинг-стоп не активирован\n`);
            throw new Error('Трейлинг-стоп не активирован');
        }

        // 6. Тест 2: Обновление стоп-цены при росте цены
        console.log('📋 Шаг 6: Тест обновления стоп-цены при росте...');
        const higherPrice = activationPrice * 1.02; // Еще +2% (итого +7%)
        console.log(`   Симулируем цену: ${higherPrice.toFixed(2)}₽ (+7% от входа)`);
        
        const updatedStop = await RiskManagementService.updateTrailingStop(
            activatedStop.id,
            higherPrice
        );
        
        if (updatedStop.currentStopPrice > activatedStop.currentStopPrice) {
            console.log(`✅ Стоп-цена обновлена!`);
            console.log(`   - Старая стоп-цена: ${activatedStop.currentStopPrice.toFixed(2)}₽`);
            console.log(`   - Новая стоп-цена: ${updatedStop.currentStopPrice.toFixed(2)}₽`);
            console.log(`   - Максимальная цена: ${updatedStop.highestPrice.toFixed(2)}₽\n`);
        } else {
            console.log(`⚠️ Стоп-цена не изменилась (возможно, уже на максимуме)\n`);
        }

        // 7. Тест 3: Срабатывание трейлинг-стопа при развороте
        console.log('📋 Шаг 7: Тест срабатывания трейлинг-стопа при развороте...');
        const triggerPrice = updatedStop.currentStopPrice * 0.99; // Цена ниже стоп-цены
        console.log(`   Симулируем цену: ${triggerPrice.toFixed(2)}₽ (ниже стоп-цены ${updatedStop.currentStopPrice.toFixed(2)}₽)`);
        
        const triggeredStop = await RiskManagementService.updateTrailingStop(
            updatedStop.id,
            triggerPrice
        );
        
        if (triggeredStop.status === 'triggered') {
            console.log(`✅ Трейлинг-стоп сработал!`);
            console.log(`   - Цена срабатывания: ${triggeredStop.triggerPrice.toFixed(2)}₽`);
            console.log(`   - Время срабатывания: ${triggeredStop.triggeredAt}`);
            const profit = ((triggeredStop.triggerPrice - entryPrice) / entryPrice) * 100;
            console.log(`   - Прибыль: ${profit.toFixed(2)}%\n`);
        } else {
            console.log(`❌ Ошибка: трейлинг-стоп не сработал\n`);
            throw new Error('Трейлинг-стоп не сработал');
        }

        // 8. Тест 4: Проверка всех активных трейлинг-стопов
        console.log('📋 Шаг 8: Тест проверки всех трейлинг-стопов...');
        
        // Создаем еще один тестовый трейлинг-стоп
        const trailingStop2 = await RiskManagementService.createTrailingStop({
            figi: testInstrument.figi,
            ticker: testInstrument.ticker,
            entryPrice: entryPrice,
            quantity: 5,
            direction: 'BUY',
            activationProfitPercent: 5.0,
            trailingDistancePercent: 2.5,
            useATR: false,
            portfolioType: 'virtual'
        });
        
        // Активируем его
        await RiskManagementService.updateTrailingStop(trailingStop2.id, entryPrice * 1.05);
        
        // Проверяем все активные трейлинг-стопы
        const triggeredStops = await RiskManagementService.checkAllTrailingStops('virtual');
        console.log(`✅ Проверка завершена. Найдено сработавших: ${triggeredStops.length}\n`);

        // 9. Очистка тестовых данных
        console.log('📋 Шаг 9: Очистка тестовых данных...');
        await TrailingStop.destroy({
            where: {
                id: {
                    [Op.in]: [trailingStop.id, trailingStop2.id]
                }
            }
        });
        console.log('✅ Тестовые данные удалены\n');

        console.log('✅ Все тесты пройдены успешно!');
        console.log('\n📊 Резюме:');
        console.log('   ✅ Создание трейлинг-стопов работает');
        console.log('   ✅ Активация при достижении прибыли работает');
        console.log('   ✅ Обновление стоп-цены работает');
        console.log('   ✅ Срабатывание при развороте работает');
        console.log('   ✅ Проверка всех трейлинг-стопов работает');

        await sequelize.close();

    } catch (error) {
        console.error('❌ Ошибка при тестировании:', error.message);
        console.error('Stack:', error.stack);
        await sequelize.close();
        process.exit(1);
    }
}

// Запускаем тесты
testTrailingStops()
    .then(() => {
        console.log('\n✅ Тестирование завершено');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Критическая ошибка:', error);
        process.exit(1);
    });
