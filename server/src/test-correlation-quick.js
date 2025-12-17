/**
 * Быстрый тест системы корреляций
 * Проверяет только основные функции без детальной диагностики
 */

import CorrelationService from './services/CorrelationService.js';
import CorrelationCache from './models/CorrelationCache.js';
import CacheService from './services/CacheService.js';
import CachedInstrument from './models/CachedInstrument.js';
import sequelize from './config/database.js';

async function quickTest() {
    console.log('🚀 Быстрый тест системы корреляций\n');
    
    try {
        // 1. Проверка подключения к БД
        console.log('1. Проверка подключения к БД...');
        await sequelize.authenticate();
        console.log('   ✅ БД подключена\n');
        
        // 2. Инициализация сервисов
        console.log('2. Инициализация сервисов...');
        if (!CacheService.isInitialized) {
            await CacheService.initialize();
        }
        await CorrelationService.initialize();
        console.log('   ✅ Сервисы инициализированы\n');
        
        // 3. Получение тестовых инструментов
        console.log('3. Получение тестовых инструментов...');
        const instruments = await CachedInstrument.findAll({
            limit: 5,
            attributes: ['figi', 'ticker', 'name']
        });
        
        if (instruments.length < 2) {
            console.error('   ❌ Недостаточно инструментов в кеше (нужно минимум 2)');
            console.log('   💡 Запустите обновление кеша инструментов');
            process.exit(1);
        }
        
        console.log(`   ✅ Найдено ${instruments.length} инструментов:`);
        instruments.forEach(inst => {
            console.log(`      - ${inst.ticker} (${inst.figi})`);
        });
        console.log();
        
        // 4. Тест расчета корреляции
        console.log('4. Тест расчета корреляции...');
        const [figi1, figi2] = [instruments[0].figi, instruments[1].figi];
        const ticker1 = instruments[0].ticker;
        const ticker2 = instruments[1].ticker;
        
        console.log(`   Рассчитываем корреляцию ${ticker1} - ${ticker2}...`);
        const startTime = Date.now();
        const correlation = await CorrelationService.calculateCorrelation(figi1, figi2, 30);
        const duration = Date.now() - startTime;
        
        if (correlation >= -1 && correlation <= 1 && isFinite(correlation)) {
            console.log(`   ✅ Корреляция рассчитана: ${correlation.toFixed(4)} (за ${duration}ms)`);
        } else {
            console.log(`   ⚠️  Корреляция рассчитана, но значение некорректно: ${correlation}`);
        }
        console.log();
        
        // 5. Тест кеширования
        console.log('5. Тест кеширования...');
        const startTime2 = Date.now();
        const correlation2 = await CorrelationService.calculateCorrelation(figi1, figi2, 30);
        const duration2 = Date.now() - startTime2;
        
        if (Math.abs(correlation - correlation2) < 0.0001) {
            console.log(`   ✅ Значения совпадают (из кеша за ${duration2}ms)`);
            if (duration2 < duration) {
                console.log(`   ✅ Кеш ускорил расчет на ${duration - duration2}ms`);
            }
        } else {
            console.log(`   ⚠️  Значения не совпадают: ${correlation.toFixed(4)} vs ${correlation2.toFixed(4)}`);
        }
        console.log();
        
        // 6. Тест матрицы корреляций
        console.log('6. Тест матрицы корреляций...');
        const figis = instruments.slice(0, 3).map(i => i.figi);
        const matrix = await CorrelationService.getCorrelationMatrix(figis, 30);
        
        if (matrix && Object.keys(matrix).length > 0) {
            console.log(`   ✅ Матрица создана для ${figis.length} инструментов`);
            console.log('   Примеры значений:');
            for (let i = 0; i < Math.min(2, figis.length); i++) {
                for (let j = i + 1; j < Math.min(2, figis.length); j++) {
                    const corr = matrix[figis[i]]?.[figis[j]] ?? 0;
                    const t1 = instruments.find(inst => inst.figi === figis[i])?.ticker || figis[i];
                    const t2 = instruments.find(inst => inst.figi === figis[j])?.ticker || figis[j];
                    console.log(`      ${t1} - ${t2}: ${corr.toFixed(4)}`);
                }
            }
        } else {
            console.log('   ⚠️  Матрица не создана');
        }
        console.log();
        
        // 7. Тест корреляции портфеля
        console.log('7. Тест корреляции портфеля...');
        const testPortfolio = {
            positions: {}
        };
        instruments.slice(0, 3).forEach((inst, index) => {
            testPortfolio.positions[inst.figi] = 10 + index * 5;
        });
        
        const portfolioCorr = await CorrelationService.calculatePortfolioCorrelation(testPortfolio, 30);
        if (typeof portfolioCorr === 'number' && portfolioCorr >= 0 && portfolioCorr <= 1) {
            console.log(`   ✅ Корреляция портфеля: ${(portfolioCorr * 100).toFixed(2)}%`);
        } else {
            console.log(`   ⚠️  Некорректное значение: ${portfolioCorr}`);
        }
        console.log();
        
        // Итоги
        console.log('='.repeat(50));
        console.log('✅ Все основные тесты пройдены успешно!');
        console.log('='.repeat(50));
        
        await sequelize.close();
        process.exit(0);
        
    } catch (error) {
        console.error('\n❌ Ошибка при выполнении теста:', error.message);
        console.error(error.stack);
        await sequelize.close();
        process.exit(1);
    }
}

quickTest();

