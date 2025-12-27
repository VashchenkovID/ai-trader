/**
 * Тестовый скрипт для проверки функциональности экспорта/импорта данных
 */

import BackupService from './src/services/BackupService.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api/backup`;

// Цвета для консоли
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

/**
 * Тест экспорта настроек
 */
async function testExportSettings() {
    logInfo('Тест экспорта настроек...');
    try {
        const result = await BackupService.exportSettings('json');
        
        if (result.success && result.file) {
            logSuccess(`Настройки экспортированы: ${result.file}`);
            logInfo(`  Размер: ${(result.size / 1024).toFixed(2)} KB`);
            logInfo(`  Количество: ${result.count} настроек`);
            
            // Проверяем, что файл существует
            const fileExists = await fs.access(result.path).then(() => true).catch(() => false);
            if (fileExists) {
                logSuccess(`  Файл существует: ${result.path}`);
            } else {
                logError(`  Файл не найден: ${result.path}`);
            }
            
            return true;
        } else {
            logError('Экспорт настроек не удался');
            return false;
        }
    } catch (error) {
        logError(`Ошибка экспорта настроек: ${error.message}`);
        return false;
    }
}

/**
 * Тест экспорта портфеля
 */
async function testExportPortfolio() {
    logInfo('Тест экспорта портфеля...');
    try {
        // Тест JSON экспорта
        const jsonResult = await BackupService.exportPortfolio('virtual', 'json');
        if (jsonResult.success) {
            logSuccess(`Портфель экспортирован в JSON: ${jsonResult.file}`);
            logInfo(`  Размер: ${(jsonResult.size / 1024).toFixed(2)} KB`);
        }
        
        // Тест CSV экспорта
        const csvResult = await BackupService.exportPortfolio('virtual', 'csv');
        if (csvResult.success) {
            logSuccess(`Портфель экспортирован в CSV: ${csvResult.file}`);
            logInfo(`  Размер: ${(csvResult.size / 1024).toFixed(2)} KB`);
            logInfo(`  Позиций: ${csvResult.positionsCount}`);
        }
        
        return jsonResult.success && csvResult.success;
    } catch (error) {
        logError(`Ошибка экспорта портфеля: ${error.message}`);
        return false;
    }
}

/**
 * Тест экспорта сделок
 */
async function testExportTrades() {
    logInfo('Тест экспорта сделок...');
    try {
        // Тест JSON экспорта
        const jsonResult = await BackupService.exportTrades('json');
        if (jsonResult.success) {
            logSuccess(`Сделки экспортированы в JSON: ${jsonResult.file}`);
            logInfo(`  Размер: ${(jsonResult.size / 1024).toFixed(2)} KB`);
            logInfo(`  Количество: ${jsonResult.count} сделок`);
        }
        
        // Тест CSV экспорта
        const csvResult = await BackupService.exportTrades('csv');
        if (csvResult.success) {
            logSuccess(`Сделки экспортированы в CSV: ${csvResult.file}`);
            logInfo(`  Размер: ${(csvResult.size / 1024).toFixed(2)} KB`);
            logInfo(`  Количество: ${csvResult.count} сделок`);
        }
        
        return jsonResult.success && csvResult.success;
    } catch (error) {
        logError(`Ошибка экспорта сделок: ${error.message}`);
        return false;
    }
}

/**
 * Тест экспорта метрик
 */
async function testExportMetrics() {
    logInfo('Тест экспорта метрик...');
    try {
        const result = await BackupService.exportMetrics('json');
        
        if (result.success && result.file) {
            logSuccess(`Метрики экспортированы: ${result.file}`);
            logInfo(`  Размер: ${(result.size / 1024).toFixed(2)} KB`);
            
            // Проверяем содержимое файла
            const fileContent = await fs.readFile(result.path, 'utf-8');
            const data = JSON.parse(fileContent);
            
            if (data.metrics && data.performance && data.health) {
                logSuccess('  Структура данных корректна');
                logInfo(`  Метрики приложения: ${Object.keys(data.metrics.application || {}).length} показателей`);
                logInfo(`  Метрики БД: ${Object.keys(data.metrics.database || {}).length} показателей`);
            } else {
                logWarning('  Структура данных неполная');
            }
            
            return true;
        } else {
            logError('Экспорт метрик не удался');
            return false;
        }
    } catch (error) {
        logError(`Ошибка экспорта метрик: ${error.message}`);
        return false;
    }
}

/**
 * Тест предпросмотра импорта
 */
async function testPreviewImport() {
    logInfo('Тест предпросмотра импорта...');
    try {
        // Создаем тестовый файл настроек
        const testSettings = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            count: 2,
            settings: [
                {
                    key: 'test_setting_1',
                    value: 'test_value_1',
                    description: 'Test setting 1',
                    category: 'test',
                    isEditable: true,
                    dataType: 'string'
                },
                {
                    key: 'test_setting_2',
                    value: '100',
                    description: 'Test setting 2',
                    category: 'test',
                    isEditable: true,
                    dataType: 'number'
                }
            ]
        };
        
        const testFilePath = path.join(__dirname, 'backups', 'test_settings.json');
        await fs.mkdir(path.dirname(testFilePath), { recursive: true });
        await fs.writeFile(testFilePath, JSON.stringify(testSettings, null, 2));
        
        const result = await BackupService.previewImport(testFilePath, 'settings');
        
        if (result.success && result.validation) {
            logSuccess('Предпросмотр импорта успешен');
            logInfo(`  Тип данных: ${result.dataType}`);
            logInfo(`  Количество: ${result.preview.count}`);
            logInfo(`  Валидация: ${result.validation.valid ? '✅' : '❌'}`);
            
            if (result.validation.errors.length > 0) {
                logWarning(`  Ошибки: ${result.validation.errors.join(', ')}`);
            }
            if (result.validation.warnings.length > 0) {
                logWarning(`  Предупреждения: ${result.validation.warnings.join(', ')}`);
            }
            
            // Удаляем тестовый файл
            await fs.unlink(testFilePath).catch(() => {});
            
            return result.validation.valid;
        } else {
            logError('Предпросмотр импорта не удался');
            await fs.unlink(testFilePath).catch(() => {});
            return false;
        }
    } catch (error) {
        logError(`Ошибка предпросмотра импорта: ${error.message}`);
        return false;
    }
}

/**
 * Тест импорта настроек (preview mode)
 */
async function testImportSettings() {
    logInfo('Тест импорта настроек (preview mode)...');
    try {
        // Создаем тестовый файл настроек
        const testSettings = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            count: 1,
            settings: [
                {
                    key: 'test_import_setting',
                    value: 'test_import_value',
                    description: 'Test import setting',
                    category: 'test',
                    isEditable: true,
                    dataType: 'string'
                }
            ]
        };
        
        const testFilePath = path.join(__dirname, 'backups', 'test_import_settings.json');
        await fs.mkdir(path.dirname(testFilePath), { recursive: true });
        await fs.writeFile(testFilePath, JSON.stringify(testSettings, null, 2));
        
        const result = await BackupService.importSettings(testFilePath, { preview: true });
        
        if (result.success && result.preview) {
            logSuccess('Импорт настроек (preview) успешен');
            logInfo(`  Количество: ${result.count}`);
            logInfo(`  Валидация: ${result.validation.valid ? '✅' : '❌'}`);
            
            // Удаляем тестовый файл
            await fs.unlink(testFilePath).catch(() => {});
            
            return true;
        } else {
            logError('Импорт настроек (preview) не удался');
            await fs.unlink(testFilePath).catch(() => {});
            return false;
        }
    } catch (error) {
        logError(`Ошибка импорта настроек: ${error.message}`);
        return false;
    }
}

/**
 * Тест импорта портфеля (preview mode)
 */
async function testImportPortfolio() {
    logInfo('Тест импорта портфеля (preview mode)...');
    try {
        // Создаем тестовый CSV файл
        const testCsv = `FIGI,Quantity
BBG0013HJJ31,10
BBG004730N88,5
BBG004730ZJ9,3`;
        
        const testFilePath = path.join(__dirname, 'backups', 'test_portfolio.csv');
        await fs.mkdir(path.dirname(testFilePath), { recursive: true });
        await fs.writeFile(testFilePath, testCsv);
        
        const result = await BackupService.importPortfolio(testFilePath, 'virtual', { preview: true });
        
        if (result.success && result.preview) {
            logSuccess('Импорт портфеля (preview) успешен');
            logInfo(`  Позиций: ${result.positionsCount}`);
            logInfo(`  Пример: ${JSON.stringify(result.sample)}`);
            
            // Удаляем тестовый файл
            await fs.unlink(testFilePath).catch(() => {});
            
            return true;
        } else {
            logError('Импорт портфеля (preview) не удался');
            await fs.unlink(testFilePath).catch(() => {});
            return false;
        }
    } catch (error) {
        logError(`Ошибка импорта портфеля: ${error.message}`);
        return false;
    }
}

/**
 * Главная функция тестирования
 */
async function runTests() {
    log('\n🚀 Запуск тестов экспорта/импорта данных\n', 'blue');
    
    // Инициализируем BackupService
    try {
        await BackupService.initialize();
        logSuccess('BackupService инициализирован');
    } catch (error) {
        logError(`Ошибка инициализации BackupService: ${error.message}`);
        return;
    }
    
    const results = {
        exportSettings: false,
        exportPortfolio: false,
        exportTrades: false,
        exportMetrics: false,
        previewImport: false,
        importSettings: false,
        importPortfolio: false
    };
    
    // Запускаем тесты
    results.exportSettings = await testExportSettings();
    console.log('');
    
    results.exportPortfolio = await testExportPortfolio();
    console.log('');
    
    results.exportTrades = await testExportTrades();
    console.log('');
    
    results.exportMetrics = await testExportMetrics();
    console.log('');
    
    results.previewImport = await testPreviewImport();
    console.log('');
    
    results.importSettings = await testImportSettings();
    console.log('');
    
    results.importPortfolio = await testImportPortfolio();
    console.log('');
    
    // Итоги
    log('\n📊 Итоги тестирования:\n', 'blue');
    const total = Object.keys(results).length;
    const passed = Object.values(results).filter(r => r).length;
    const failed = total - passed;
    
    Object.entries(results).forEach(([test, result]) => {
        if (result) {
            logSuccess(`${test}: PASSED`);
        } else {
            logError(`${test}: FAILED`);
        }
    });
    
    console.log('');
    log(`Всего тестов: ${total}`, 'cyan');
    log(`Пройдено: ${passed}`, 'green');
    log(`Провалено: ${failed}`, failed > 0 ? 'red' : 'green');
    
    if (failed === 0) {
        log('\n✅ Все тесты пройдены успешно!', 'green');
    } else {
        log(`\n❌ ${failed} тест(ов) провалено`, 'red');
    }
}

// Запускаем тесты
runTests().catch(error => {
    logError(`Критическая ошибка: ${error.message}`);
    console.error(error);
    process.exit(1);
});

