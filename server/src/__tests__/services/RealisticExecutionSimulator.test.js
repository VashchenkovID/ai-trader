/**
 * Unit тесты для RealisticExecutionSimulator
 */

import dotenv from 'dotenv';
import { describe, it } from '@jest/globals';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sequelize from '../../config/database.js';
import RealisticExecutionSimulator from '../../services/RealisticExecutionSimulator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Пробуем несколько путей к .env файлу
const envPaths = [
    join(__dirname, '../../../../.env'),
    join(__dirname, '../../../.env'),
    join(process.cwd(), '.env'),
    join(process.cwd(), 'server', '.env')
];

for (const envPath of envPaths) {
    try {
        const result = dotenv.config({ path: envPath });
        if (!result.error) break;
    } catch (error) {
        // Игнорируем ошибки
    }
}

describe.skip('RealisticExecutionSimulator manual scenario script', () => {
    it('manual script is excluded from jest unit run', () => {});
});

function log(message, color = 'reset') {
    const colors = {
        reset: '\x1b[0m',
        green: '\x1b[32m',
        red: '\x1b[31m',
        yellow: '\x1b[33m',
        blue: '\x1b[34m',
        cyan: '\x1b[36m'
    };
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testInitialization() {
    log('\n🧪 Тест 1: Инициализация RealisticExecutionSimulator', 'cyan');
    
    try {
        await RealisticExecutionSimulator.initialize();
        
        if (!RealisticExecutionSimulator.isInitialized) {
            throw new Error('Сервис должен быть инициализирован');
        }
        
        log('  ✅ Инициализация прошла успешно', 'green');
        return true;
    } catch (error) {
        log(`  ❌ Ошибка: ${error.message}`, 'red');
        return false;
    }
}

async function testSimulateExecutionBuy() {
    log('\n🧪 Тест 2: Симуляция исполнения BUY ордера', 'cyan');
    
    try {
        const order = {
            figi: 'BBG000B9XRY4',
            action: 'BUY',
            quantity: 100,
            price: 250.0
        };
        
        const result = await RealisticExecutionSimulator.simulateExecution(order);
        
        // Проверки
        if (result.executedPrice <= 0) {
            throw new Error('executedPrice должен быть положительным');
        }
        
        if (result.executedPrice < order.price) {
            throw new Error('Для BUY executedPrice должен быть >= исходной цены (из-за спреда)');
        }
        
        if (result.executedQuantity !== order.quantity) {
            throw new Error('executedQuantity должен совпадать с quantity');
        }
        
        if (result.commission <= 0) {
            throw new Error('commission должен быть положительным');
        }
        
        if (result.slippage === undefined) {
            throw new Error('slippage должен быть определен');
        }
        
        if (result.spread === undefined) {
            throw new Error('spread должен быть определен');
        }
        
        log(`  ✅ BUY симуляция: цена=${result.executedPrice.toFixed(2)}, комиссия=${result.commission.toFixed(2)}`, 'green');
        return true;
    } catch (error) {
        log(`  ❌ Ошибка: ${error.message}`, 'red');
        return false;
    }
}

async function testSimulateExecutionSell() {
    log('\n🧪 Тест 3: Симуляция исполнения SELL ордера', 'cyan');
    
    try {
        const order = {
            figi: 'BBG000B9XRY4',
            action: 'SELL',
            quantity: 100,
            price: 250.0
        };
        
        const result = await RealisticExecutionSimulator.simulateExecution(order);
        
        // Для SELL цена должна быть <= исходной (из-за спреда)
        if (result.executedPrice > order.price) {
            throw new Error('Для SELL executedPrice должен быть <= исходной цены (из-за спреда)');
        }
        
        if (result.executedPrice <= 0) {
            throw new Error('executedPrice должен быть положительным');
        }
        
        log(`  ✅ SELL симуляция: цена=${result.executedPrice.toFixed(2)}, комиссия=${result.commission.toFixed(2)}`, 'green');
        return true;
    } catch (error) {
        log(`  ❌ Ошибка: ${error.message}`, 'red');
        return false;
    }
}

async function testLiquidityLevels() {
    log('\n🧪 Тест 4: Определение уровней ликвидности', 'cyan');
    
    try {
        const levels = ['high', 'medium', 'low'];
        const results = [];
        
        for (const level of levels) {
            const liquidityLevel = await RealisticExecutionSimulator.getLiquidityLevel('BBG000B9XRY4', {
                dailyVolume: level === 'high' ? 20000000 : level === 'medium' ? 5000000 : 500000
            });
            
            results.push(liquidityLevel);
        }
        
        // Проверяем, что все уровни определены
        if (results.some(r => !levels.includes(r))) {
            throw new Error('Все уровни ликвидности должны быть определены');
        }
        
        log(`  ✅ Уровни ликвидности: ${results.join(', ')}`, 'green');
        return true;
    } catch (error) {
        log(`  ❌ Ошибка: ${error.message}`, 'red');
        return false;
    }
}

async function testSpreadCalculation() {
    log('\n🧪 Тест 5: Расчет спреда', 'cyan');
    
    try {
        const price = 250.0;
        const levels = ['high', 'medium', 'low'];
        
        for (const level of levels) {
            const spread = RealisticExecutionSimulator.calculateSpread(price, level, 'BUY');
            
            if (spread <= 0) {
                throw new Error(`Спред для ${level} должен быть положительным`);
            }
            
            if (spread > price * 0.01) {
                throw new Error(`Спред для ${level} слишком большой (>1%)`);
            }
        }
        
        log('  ✅ Расчет спреда работает корректно для всех уровней', 'green');
        return true;
    } catch (error) {
        log(`  ❌ Ошибка: ${error.message}`, 'red');
        return false;
    }
}

async function testSlippageCalculation() {
    log('\n🧪 Тест 6: Расчет проскальзывания', 'cyan');
    
    try {
        const price = 250.0;
        const orderSize = 100; // количество акций
        const dailyVolume = 1000000; // дневной объем в рублях
        
        const slippage = RealisticExecutionSimulator.calculateSlippage(orderSize, price, dailyVolume);
        
        if (slippage <= 0) {
            throw new Error('Проскальзывание должно быть положительным');
        }
        
        if (slippage > price * 0.01) {
            throw new Error('Проскальзывание слишком большое (>1%)');
        }
        
        log(`  ✅ Проскальзывание рассчитано: ${slippage.toFixed(4)}`, 'green');
        return true;
    } catch (error) {
        log(`  ❌ Ошибка: ${error.message}`, 'red');
        return false;
    }
}

async function testErrorHandling() {
    log('\n🧪 Тест 7: Обработка ошибок', 'cyan');
    
    try {
        // Тест с невалидными данными
        const order = {
            figi: 'INVALID_FIGI',
            action: 'BUY',
            quantity: 100,
            price: 250.0
        };
        
        // Должен вернуть результат с дефолтными значениями
        const result = await RealisticExecutionSimulator.simulateExecution(order);
        
        if (!result.executedPrice || result.executedPrice <= 0) {
            throw new Error('При ошибке должен использоваться дефолтный результат');
        }
        
        log('  ✅ Обработка ошибок работает корректно', 'green');
        return true;
    } catch (error) {
        log(`  ❌ Ошибка: ${error.message}`, 'red');
        return false;
    }
}

async function testPartialFill() {
    log('\n🧪 Тест 8: Частичное исполнение', 'cyan');
    
    try {
        const quantity = 1000;
        const price = 250.0;
        const orderAmount = quantity * price; // Сумма ордера в рублях
        const dailyVolume = 100000; // Низкий дневной объем в рублях
        
        const executedQuantity = RealisticExecutionSimulator.checkPartialFill(quantity, dailyVolume);
        
        if (executedQuantity <= 0) {
            throw new Error('executedQuantity должен быть положительным');
        }
        
        if (executedQuantity > quantity) {
            throw new Error('executedQuantity не должен превышать quantity');
        }
        
        log(`  ✅ Частичное исполнение: ${executedQuantity}/${quantity}`, 'green');
        return true;
    } catch (error) {
        log(`  ❌ Ошибка: ${error.message}`, 'red');
        return false;
    }
}

async function runAllTests() {
    log('\n🚀 Запуск unit тестов для RealisticExecutionSimulator\n', 'cyan');
    
    try {
        await sequelize.authenticate();
        log('✅ Подключение к БД установлено\n', 'green');
        
        const results = [];
        
        results.push(await testInitialization());
        results.push(await testSimulateExecutionBuy());
        results.push(await testSimulateExecutionSell());
        results.push(await testLiquidityLevels());
        results.push(await testSpreadCalculation());
        results.push(await testSlippageCalculation());
        results.push(await testErrorHandling());
        results.push(await testPartialFill());
        
        const passed = results.filter(r => r === true).length;
        const total = results.length;
        
        log(`\n📊 Результаты: ${passed}/${total} тестов пройдено\n`, passed === total ? 'green' : 'yellow');
        
        await sequelize.close();
        
        process.exit(passed === total ? 0 : 1);
    } catch (error) {
        log(`\n❌ Критическая ошибка: ${error.message}`, 'red');
        console.error(error.stack);
        if (sequelize) {
            await sequelize.close();
        }
        process.exit(1);
    }
}

if (process.env.RUN_MANUAL_AUTO_PAPER_TESTS === 'true') {
    runAllTests();
}

