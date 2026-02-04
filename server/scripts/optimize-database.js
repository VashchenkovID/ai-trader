/**
 * Скрипт для оптимизации базы данных
 * - Анализ текущих индексов
 * - Создание недостающих индексов
 * - Генерация отчета
 */

import DatabaseOptimization from '../src/utils/databaseOptimization.js';
import LoggerService from '../src/services/LoggerService.js';

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
    log(`✅ ${message}`, 'green');
}

function logError(message) {
    log(`❌ ${message}`, 'red');
}

function logInfo(message) {
    log(`ℹ️  ${message}`, 'cyan');
}

function logWarning(message) {
    log(`⚠️  ${message}`, 'yellow');
}

async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'report';
    
    try {
        // Инициализируем LoggerService
        await LoggerService.initialize();
        
        log('\n🚀 Оптимизация базы данных\n', 'blue');
        
        if (command === 'report') {
            // Генерируем отчет
            logInfo('Генерация отчета об оптимизации...');
            const report = await DatabaseOptimization.generateOptimizationReport();
            
            console.log('\n📊 Отчет об оптимизации БД:\n');
            console.log(`Всего таблиц: ${report.summary.totalTables}`);
            console.log(`Текущих индексов: ${report.summary.totalCurrentIndexes}`);
            console.log(`Рекомендуемых индексов: ${report.summary.totalRecommendedIndexes}`);
            console.log(`Недостающих индексов: ${report.summary.missingIndexesCount}`);
            
            if (Object.keys(report.missingIndexes).length > 0) {
                console.log('\n📋 Недостающие индексы:\n');
                for (const [tableName, indexes] of Object.entries(report.missingIndexes)) {
                    console.log(`  ${tableName}:`);
                    indexes.forEach(idx => {
                        console.log(`    - ${idx.name} (${idx.fields.join(', ')})`);
                        console.log(`      ${idx.description}`);
                    });
                }
            }
            
            if (report.slowQueries.available && report.slowQueries.queries) {
                console.log('\n🐌 Медленные запросы:\n');
                report.slowQueries.queries.slice(0, 5).forEach((query, index) => {
                    console.log(`  ${index + 1}. Среднее время: ${parseFloat(query.mean_exec_time).toFixed(2)}ms`);
                    console.log(`     Вызовов: ${query.calls}`);
                    console.log(`     Запрос: ${query.query.substring(0, 100)}...`);
                });
            }
            
        } else if (command === 'create') {
            // Создаем индексы
            const dryRun = args.includes('--dry-run');
            
            if (dryRun) {
                logWarning('Режим dry-run: индексы не будут созданы');
            }
            
            logInfo('Создание рекомендуемых индексов...');
            const results = await DatabaseOptimization.createRecommendedIndexes(dryRun);
            
            console.log('\n📊 Результаты создания индексов:\n');
            console.log(`Создано: ${results.created.length}`);
            console.log(`Пропущено: ${results.skipped.length}`);
            console.log(`Ошибок: ${results.errors.length}`);
            
            if (results.created.length > 0) {
                console.log('\n✅ Созданные индексы:');
                results.created.forEach(item => {
                    console.log(`  - ${item.table}.${item.index} (${item.fields.join(', ')})`);
                });
            }
            
            if (results.errors.length > 0) {
                console.log('\n❌ Ошибки:');
                results.errors.forEach(item => {
                    console.log(`  - ${item.table}.${item.index}: ${item.error}`);
                });
            }
            
        } else if (command === 'analyze') {
            // Анализ текущих индексов
            logInfo('Анализ текущих индексов...');
            const indexes = await DatabaseOptimization.analyzeIndexes();
            
            console.log('\n📊 Текущие индексы:\n');
            for (const [tableName, data] of Object.entries(indexes)) {
                console.log(`  ${tableName} (${data.count} индексов):`);
                data.indexes.forEach(idx => {
                    console.log(`    - ${idx.name}`);
                });
            }
            
        } else {
            logError(`Неизвестная команда: ${command}`);
            console.log('\nДоступные команды:');
            console.log('  report  - Генерация отчета об оптимизации');
            console.log('  create    - Создание недостающих индексов');
            console.log('  create --dry-run - Предпросмотр создания индексов');
            console.log('  analyze   - Анализ текущих индексов');
            process.exit(1);
        }
        
        logSuccess('\nОперация завершена успешно!');
        
    } catch (error) {
        logError(`Критическая ошибка: ${error.message}`);
        console.error(error);
        process.exit(1);
    } finally {
        // Закрываем соединение с БД
        await DatabaseOptimization.sequelize.close();
    }
}

main();

