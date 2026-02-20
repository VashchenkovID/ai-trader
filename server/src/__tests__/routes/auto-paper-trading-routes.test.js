/**
 * Тесты для API endpoints автоматической торговли
 * Тестирует логику endpoints через прямые вызовы сервисов
 */

import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sequelize from '../../config/database.js';
import AutoPaperTradingService from '../../services/AutoPaperTradingService.js';
import AutoPaperTradingStats from '../../models/AutoPaperTradingStats.js';

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

async function testGetStatus() {
    log('\n🧪 Тест 1: GET /api/auto-paper-trading/status (логика)', 'cyan');
    
    try {
        await AutoPaperTradingService.initialize();
        
        // Симулируем вызов endpoint - проверяем логику
        if (!AutoPaperTradingService.isInitialized) {
            throw new Error('Сервис должен быть инициализирован');
        }
        
        const status = AutoPaperTradingService.getStatus();
        
        if (status.isInitialized === undefined) {
            throw new Error('status должен содержать isInitialized');
        }
        
        if (status.isEnabled === undefined) {
            throw new Error('status должен содержать isEnabled');
        }
        
        if (!status.stats) {
            throw new Error('status должен содержать stats');
        }
        
        if (!status.settings) {
            throw new Error('status должен содержать settings');
        }
        
        log('  ✅ GET /status логика работает корректно', 'green');
        return true;
    } catch (error) {
        log(`  ❌ Ошибка: ${error.message}`, 'red');
        return false;
    }
}

async function testEnable() {
    log('\n🧪 Тест 2: POST /api/auto-paper-trading/enable (логика)', 'cyan');
    
    try {
        await AutoPaperTradingService.disable(); // Сначала выключаем
        
        // Симулируем вызов endpoint
        await AutoPaperTradingService.enable();
        
        if (!AutoPaperTradingService.isEnabled) {
            throw new Error('Сервис должен быть включен');
        }
        
        log('  ✅ POST /enable логика работает корректно', 'green');
        return true;
    } catch (error) {
        log(`  ❌ Ошибка: ${error.message}`, 'red');
        return false;
    }
}

async function testDisable() {
    log('\n🧪 Тест 3: POST /api/auto-paper-trading/disable (логика)', 'cyan');
    
    try {
        await AutoPaperTradingService.enable(); // Сначала включаем
        
        // Симулируем вызов endpoint
        await AutoPaperTradingService.disable();
        
        if (AutoPaperTradingService.isEnabled) {
            throw new Error('Сервис должен быть выключен');
        }
        
        log('  ✅ POST /disable логика работает корректно', 'green');
        return true;
    } catch (error) {
        log(`  ❌ Ошибка: ${error.message}`, 'red');
        return false;
    }
}

async function testGetStats() {
    log('\n🧪 Тест 4: GET /api/auto-paper-trading/stats (логика)', 'cyan');
    
    try {
        // Симулируем вызов endpoint - получаем статистику
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const stats = await AutoPaperTradingStats.getStatsForPeriod(startDate, endDate);
        
        if (!Array.isArray(stats)) {
            throw new Error('stats должен быть массивом');
        }
        
        log(`  ✅ GET /stats логика работает корректно, получено ${stats.length} записей`, 'green');
        return true;
    } catch (error) {
        log(`  ❌ Ошибка: ${error.message}`, 'red');
        return false;
    }
}

async function testUpdateSettings() {
    log('\n🧪 Тест 5: PUT /api/auto-paper-trading/settings (логика)', 'cyan');
    
    try {
        const validSettings = {
            minConfidence: 0.75,
            maxDailyTrades: 12
        };
        
        // Сохраняем предыдущие настройки
        const previousMinConfidence = AutoPaperTradingService.settings.minConfidence;
        const previousMaxDailyTrades = AutoPaperTradingService.settings.maxDailyTrades;
        
        // Симулируем вызов endpoint - валидация и обновление
        const validation = AutoPaperTradingService.validateSettings(validSettings);
        if (!validation.isValid) {
            throw new Error('Валидные настройки должны проходить валидацию');
        }
        
        await AutoPaperTradingService.updateSettings(validSettings);
        
        // Проверяем, что настройки обновились в this.settings
        if (AutoPaperTradingService.settings.minConfidence !== 0.75) {
            // Восстанавливаем предыдущие настройки
            AutoPaperTradingService.settings.minConfidence = previousMinConfidence;
            AutoPaperTradingService.settings.maxDailyTrades = previousMaxDailyTrades;
            throw new Error(`minConfidence должен быть обновлен. Текущее значение: ${AutoPaperTradingService.settings.minConfidence}`);
        }
        
        if (AutoPaperTradingService.settings.maxDailyTrades !== 12) {
            // Восстанавливаем предыдущие настройки
            AutoPaperTradingService.settings.minConfidence = previousMinConfidence;
            AutoPaperTradingService.settings.maxDailyTrades = previousMaxDailyTrades;
            throw new Error(`maxDailyTrades должен быть обновлен. Текущее значение: ${AutoPaperTradingService.settings.maxDailyTrades}`);
        }
        
        // Восстанавливаем предыдущие настройки
        AutoPaperTradingService.settings.minConfidence = previousMinConfidence;
        AutoPaperTradingService.settings.maxDailyTrades = previousMaxDailyTrades;
        
        log('  ✅ PUT /settings логика работает корректно', 'green');
        return true;
    } catch (error) {
        log(`  ❌ Ошибка: ${error.message}`, 'red');
        return false;
    }
}

async function testUpdateSettingsInvalid() {
    log('\n🧪 Тест 6: PUT /api/auto-paper-trading/settings (невалидные данные, логика)', 'cyan');
    
    try {
        const invalidSettings = {
            minConfidence: 1.5, // Слишком высокое значение
            maxDailyTrades: -1  // Отрицательное значение
        };
        
        // Симулируем вызов endpoint - валидация
        const validation = AutoPaperTradingService.validateSettings(invalidSettings);
        
        if (validation.isValid) {
            throw new Error('Невалидные настройки не должны проходить валидацию');
        }
        
        if (!validation.errors || validation.errors.length === 0) {
            throw new Error('Должны быть указаны ошибки валидации');
        }
        
        log(`  ✅ Валидация работает, найдено ${validation.errors.length} ошибок`, 'green');
        return true;
    } catch (error) {
        log(`  ❌ Ошибка: ${error.message}`, 'red');
        return false;
    }
}

async function testAdvancePhase() {
    log('\n🧪 Тест 7: POST /api/auto-paper-trading/advance-phase (логика)', 'cyan');
    
    try {
        const initialPhase = AutoPaperTradingService.stats.currentPhase;
        
        // Симулируем вызов endpoint
        await AutoPaperTradingService.advancePhase();
        
        const newPhase = AutoPaperTradingService.stats.currentPhase;
        
        if (newPhase === initialPhase && initialPhase !== 'phase3') {
            throw new Error('Фаза должна измениться (если не была последней)');
        }
        
        log(`  ✅ POST /advance-phase логика работает: ${initialPhase} -> ${newPhase}`, 'green');
        return true;
    } catch (error) {
        log(`  ❌ Ошибка: ${error.message}`, 'red');
        return false;
    }
}

async function runAllTests() {
    log('\n🚀 Запуск тестов API endpoints для автоматической торговли\n', 'cyan');
    
    try {
        await sequelize.authenticate();
        log('✅ Подключение к БД установлено\n', 'green');
        
        const results = [];
        
        results.push(await testGetStatus());
        results.push(await testEnable());
        results.push(await testDisable());
        results.push(await testGetStats());
        results.push(await testUpdateSettings());
        results.push(await testUpdateSettingsInvalid());
        results.push(await testAdvancePhase());
        
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

runAllTests();

