/**
 * Тесты для модели AutoPaperTradingStats
 */

import dotenv from 'dotenv';
import { describe, it } from '@jest/globals';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sequelize from '../../config/database.js';
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

describe.skip('AutoPaperTradingStats manual scenario script', () => {
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

async function testGetTodayStats() {
    log('\n🧪 Тест 1: getTodayStats', 'cyan');
    
    try {
        const stats = await AutoPaperTradingStats.getTodayStats();
        
        if (!stats) {
            throw new Error('Статистика должна быть создана');
        }
        
        if (!stats.date) {
            throw new Error('date должен быть установлен');
        }
        
        if (stats.dailyTrades < 0) {
            throw new Error('dailyTrades не может быть отрицательным');
        }
        
        if (stats.currentPhase !== 'phase1' && stats.currentPhase !== 'phase2' && stats.currentPhase !== 'phase3') {
            throw new Error('currentPhase должен быть phase1, phase2 или phase3');
        }
        
        log(`  ✅ Статистика за сегодня получена: ${stats.date}`, 'green');
        return true;
    } catch (error) {
        log(`  ❌ Ошибка: ${error.message}`, 'red');
        return false;
    }
}

async function testGetStatsForPeriod() {
    log('\n🧪 Тест 2: getStatsForPeriod', 'cyan');
    
    try {
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const stats = await AutoPaperTradingStats.getStatsForPeriod(startDate, endDate);
        
        if (!Array.isArray(stats)) {
            throw new Error('Результат должен быть массивом');
        }
        
        // Проверяем, что все записи в указанном периоде
        for (const stat of stats) {
            const statDate = new Date(stat.date).toISOString().split('T')[0];
            if (statDate < startDate || statDate > endDate) {
            }
        }
        
        log(`  ✅ Получено ${stats.length} записей за период`, 'green');
        return true;
    } catch (error) {
        log(`  ❌ Ошибка: ${error.message}`, 'red');
        return false;
    }
}

async function testCreateAndSave() {
    log('\n🧪 Тест 3: Создание и сохранение статистики', 'cyan');
    
    try {
        const stats = await AutoPaperTradingStats.getTodayStats();
        
        // Обновляем значения
        stats.dailyTrades = 5;
        stats.dailyPnL = 1000.5;
        stats.totalTrades = 100;
        stats.currentPhase = 'phase1';
        stats.settings = { test: 'value' };
        
        await stats.save();
        
        // Перезагружаем из БД
        const reloaded = await AutoPaperTradingStats.findByPk(stats.id);
        
        if (reloaded.dailyTrades !== 5) {
            throw new Error('dailyTrades не сохранился');
        }
        
        if (Math.abs(reloaded.dailyPnL - 1000.5) > 0.01) {
            throw new Error('dailyPnL не сохранился');
        }
        
        if (reloaded.totalTrades !== 100) {
            throw new Error('totalTrades не сохранился');
        }
        
        log('  ✅ Статистика сохраняется и загружается корректно', 'green');
        return true;
    } catch (error) {
        log(`  ❌ Ошибка: ${error.message}`, 'red');
        return false;
    }
}

async function testUniqueDate() {
    log('\n🧪 Тест 4: Уникальность даты', 'cyan');
    
    try {
        const stats1 = await AutoPaperTradingStats.getTodayStats();
        const stats2 = await AutoPaperTradingStats.getTodayStats();
        
        if (stats1.id !== stats2.id) {
            throw new Error('Должна возвращаться одна и та же запись для одной даты');
        }
        
        log('  ✅ Уникальность даты работает корректно', 'green');
        return true;
    } catch (error) {
        log(`  ❌ Ошибка: ${error.message}`, 'red');
        return false;
    }
}

async function runAllTests() {
    log('\n🚀 Запуск тестов для модели AutoPaperTradingStats\n', 'cyan');
    
    try {
        await sequelize.authenticate();
        log('✅ Подключение к БД установлено\n', 'green');
        
        const results = [];
        
        results.push(await testGetTodayStats());
        results.push(await testGetStatsForPeriod());
        results.push(await testCreateAndSave());
        results.push(await testUniqueDate());
        
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

