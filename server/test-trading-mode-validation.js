/**
 * Тесты для валидации и смены режимов торговли
 * 
 * Тестирует:
 * 1. SwitchValidator - валидацию перехода между режимами
 * 2. TradingModeManager - смену режимов
 * 3. Проверку критериев для каждого режима
 * 4. Проверку текущих значений метрик
 * 5. API endpoints для режимов торговли
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';
import { URL } from 'url';
import express from 'express';
import sequelize from './src/config/database.js';
import { initDatabase } from './src/utils/initDatabase.js';
import TradingModeManager from './src/services/TradingModeManager.js';
import SwitchValidator from './src/services/SwitchValidator.js';
import RiskManagementService from './src/services/RiskManagementService.js';
import optimizedRoutes from './src/routes/optimized-routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загрузка переменных окружения
const envPaths = [
    join(__dirname, '.env'),
    join(__dirname, '..', '.env'),
    join(process.cwd(), '.env'),
    join(process.cwd(), 'server', '.env')
];

let envLoaded = false;
for (const envPath of envPaths) {
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
        envLoaded = true;
        console.log(`✅ Loaded .env from: ${envPath}`);
        break;
    }
}

if (!envLoaded) {
    dotenv.config();
    console.log('⚠️ .env file not found, using system environment variables');
}

// Helper для цветного вывода
const log = (message, color = 'white') => {
    const colors = {
        red: '\x1b[31m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        blue: '\x1b[34m',
        magenta: '\x1b[35m',
        cyan: '\x1b[36m',
        white: '\x1b[37m',
        reset: '\x1b[0m'
    };
    console.log(`${colors[color]}${message}${colors.reset}`);
};

const logSection = (title) => {
    log('\n' + '='.repeat(60), 'cyan');
    log(title, 'cyan');
    log('='.repeat(60), 'cyan');
};

const logTest = (name, passed, details = '') => {
    const icon = passed ? '✅' : '❌';
    const color = passed ? 'green' : 'red';
    log(`${icon} ${name}`, color);
    if (details) {
        log(`   ${details}`, 'yellow');
    }
};

// Результаты тестов
const results = {
    passed: 0,
    failed: 0,
    tests: []
};

// Вспомогательная функция для HTTP запросов
async function makeRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, `http://localhost:${testPort}`);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (body) {
            options.headers['Content-Length'] = JSON.stringify(body).length;
        }

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({
                        status: res.statusCode,
                        data: parsed
                    });
                } catch (e) {
                    resolve({
                        status: res.statusCode,
                        data: data
                    });
                }
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(JSON.stringify(body));
        }

        req.end();
    });
}

let testServer = null;
let testPort = 0;

// Тест 1: Инициализация сервисов
async function testInitialization() {
    logSection('1. Инициализация сервисов');
    
    try {
        // Инициализация БД
        await initDatabase();
        logTest('Инициализация базы данных', true);
        results.passed++;
        
        // Инициализация TradingModeManager
        if (!TradingModeManager.isInitialized) {
            await TradingModeManager.initialize();
        }
        logTest('Инициализация TradingModeManager', true);
        results.passed++;
        
        // Инициализация SwitchValidator
        if (!SwitchValidator.isInitialized) {
            await SwitchValidator.initialize();
        }
        logTest('Инициализация SwitchValidator', true);
        results.passed++;
        
        // Регистрируем SwitchValidator в ServiceManager для доступа через getService
        try {
            const ServiceManager = (await import('./src/services/ServiceManager.js')).default;
            // Используем initializeService для правильной регистрации
            await ServiceManager.initializeService('SwitchValidator', async () => ({ default: SwitchValidator }));
            logTest('Регистрация SwitchValidator в ServiceManager', true);
            results.passed++;
        } catch (error) {
            logTest('Регистрация SwitchValidator в ServiceManager', false, error.message);
            results.failed++;
        }
        
        // Инициализация RiskManagementService (если нужно)
        if (RiskManagementService && !RiskManagementService.isInitialized) {
            try {
                await RiskManagementService.initialize();
                logTest('Инициализация RiskManagementService', true);
                results.passed++;
            } catch (error) {
                logTest('Инициализация RiskManagementService', false, error.message);
                results.failed++;
            }
        }
        
        // Запуск тестового сервера
        const app = express();
        app.use(express.json());
        app.use('/api', optimizedRoutes);
        
        testServer = await new Promise((resolve, reject) => {
            const server = app.listen(0, () => {
                testPort = server.address().port;
                log(`✅ Тестовый сервер запущен на порту ${testPort}`, 'green');
                resolve(server);
            });
            server.on('error', reject);
        });
        
        logTest('Запуск тестового сервера', true);
        results.passed++;
        
        return true;
    } catch (error) {
        logTest('Инициализация', false, error.message);
        results.failed++;
        console.error(error);
        return false;
    }
}

// Тест 2: Получение текущего режима
async function testGetCurrentMode() {
    logSection('2. Получение текущего режима');
    
    try {
        const currentMode = TradingModeManager.getCurrentMode();
        logTest('Получение текущего режима', !!currentMode, `Режим: ${currentMode?.mode || 'не определен'}`);
        
        if (currentMode && currentMode.mode) {
            results.passed++;
            return currentMode;
        } else {
            results.failed++;
            return null;
        }
    } catch (error) {
        logTest('Получение текущего режима', false, error.message);
        results.failed++;
        return null;
    }
}

// Тест 3: Валидация перехода к микро-капиталу
async function testValidateMicroMode() {
    logSection('3. Валидация перехода к микро-капиталу');
    
    try {
        const validation = await SwitchValidator.canSwitchToMicro();
        
        logTest('Проверка canSwitchToMicro', typeof validation === 'object', 
            `canSwitch: ${validation.canSwitch}, targetMode: ${validation.targetMode}`);
        
        if (validation.canSwitch !== undefined) {
            results.passed++;
        } else {
            results.failed++;
        }
        
        // Проверка структуры ответа
        const hasChecks = !!validation.checks;
        const hasCriteria = !!validation.criteria;
        const hasRecommendations = Array.isArray(validation.recommendations);
        
        logTest('Структура валидации (checks)', hasChecks);
        logTest('Структура валидации (criteria)', hasCriteria);
        logTest('Структура валидации (recommendations)', hasRecommendations);
        
        if (hasChecks) results.passed++; else results.failed++;
        if (hasCriteria) results.passed++; else results.failed++;
        if (hasRecommendations) results.passed++; else results.failed++;
        
        // Проверка деталей проверок
        if (validation.checks) {
            const checkKeys = ['profitability', 'consistency', 'riskMetrics', 'technicalReadiness'];
            for (const key of checkKeys) {
                if (validation.checks[key]) {
                    const check = validation.checks[key];
                    const hasDetails = !!check.details;
                    const hasScore = check.score !== undefined || check.passed !== undefined;
                    
                    logTest(`Проверка ${key} (details)`, hasDetails);
                    logTest(`Проверка ${key} (score/passed)`, hasScore);
                    
                    if (hasDetails) results.passed++; else results.failed++;
                    if (hasScore) results.passed++; else results.failed++;
                    
                    // Проверка текущих значений в details
                    if (check.details) {
                        const detailKeys = Object.keys(check.details);
                        for (const detailKey of detailKeys) {
                            const detail = check.details[detailKey];
                            const hasValue = detail.value !== undefined;
                            const hasThreshold = detail.threshold !== undefined;
                            const passed = detail.passed !== undefined ? detail.passed : false;
                            
                            if (hasValue && hasThreshold) {
                                logTest(`  ${detailKey}: текущее значение`, true, 
                                    `${detail.value} / ${detail.threshold} (${passed ? '✅' : '❌'})`);
                                results.passed++;
                            } else {
                                logTest(`  ${detailKey}: текущее значение`, false, 'Отсутствуют value или threshold');
                                results.failed++;
                            }
                        }
                    }
                }
            }
        }
        
        return validation;
    } catch (error) {
        logTest('Валидация перехода к микро-капиталу', false, error.message);
        results.failed++;
        console.error(error);
        return null;
    }
}

// Тест 4: Валидация перехода к полной торговле
async function testValidateFullMode() {
    logSection('4. Валидация перехода к полной торговле');
    
    try {
        const validation = await SwitchValidator.canSwitchToFull();
        
        logTest('Проверка canSwitchToFull', typeof validation === 'object', 
            `canSwitch: ${validation.canSwitch}, targetMode: ${validation.targetMode}`);
        
        if (validation.canSwitch !== undefined) {
            results.passed++;
        } else {
            results.failed++;
        }
        
        // Проверка структуры (аналогично микро-капиталу)
        const hasChecks = !!validation.checks;
        const hasCriteria = !!validation.criteria;
        
        logTest('Структура валидации (checks)', hasChecks);
        logTest('Структура валидации (criteria)', hasCriteria);
        
        if (hasChecks) results.passed++; else results.failed++;
        if (hasCriteria) results.passed++; else results.failed++;
        
        return validation;
    } catch (error) {
        logTest('Валидация перехода к полной торговле', false, error.message);
        results.failed++;
        console.error(error);
        return null;
    }
}

// Тест 5: Проверка возможности переключения через TradingModeManager
async function testCanSwitchTo() {
    logSection('5. Проверка возможности переключения (TradingModeManager)');
    
    const modes = ['paper', 'micro', 'real'];
    
    for (const mode of modes) {
        try {
            const result = await TradingModeManager.canSwitchTo(mode);
            
            logTest(`canSwitchTo('${mode}')`, typeof result === 'object', 
                `canSwitch: ${result.canSwitch}, warnings: ${result.warnings?.length || 0}`);
            
            if (result.canSwitch !== undefined) {
                results.passed++;
                
                // Проверка наличия checks для micro и real
                if ((mode === 'micro' || mode === 'real') && result.checks) {
                    logTest(`  ${mode}: наличие checks`, true);
                    results.passed++;
                } else if (mode === 'paper') {
                    logTest(`  ${mode}: paper всегда доступен`, true);
                    results.passed++;
                }
            } else {
                results.failed++;
            }
        } catch (error) {
            logTest(`canSwitchTo('${mode}')`, false, error.message);
            results.failed++;
        }
    }
}

// Тест 6: API endpoint - получение текущего режима
async function testAPIGetCurrentMode() {
    logSection('6. API: Получение текущего режима');
    
    try {
        const response = await makeRequest('GET', '/api/trading-mode/current');
        
        logTest('GET /api/trading-mode/current', response.status === 200, 
            `Status: ${response.status}`);
        
        if (response.status === 200 && response.data.success) {
            results.passed++;
            
            const mode = response.data.data;
            logTest('  Структура ответа', !!mode.mode, `Режим: ${mode.mode}`);
            if (mode.mode) results.passed++; else results.failed++;
        } else {
            results.failed++;
        }
    } catch (error) {
        logTest('GET /api/trading-mode/current', false, error.message);
        results.failed++;
    }
}

// Тест 7: API endpoint - валидация режима
async function testAPIGetValidation() {
    logSection('7. API: Валидация режима');
    
    try {
        const response = await makeRequest('GET', '/api/trading-mode/validation');
        
        logTest('GET /api/trading-mode/validation', response.status === 200, 
            `Status: ${response.status}`);
        
        if (response.status === 200 && response.data.success) {
            results.passed++;
            
            const validation = response.data.data;
            logTest('  Структура валидации', !!validation, 
                `isValid: ${validation.isValid}, mode: ${validation.mode}`);
            if (validation) results.passed++; else results.failed++;
        } else {
            results.failed++;
        }
    } catch (error) {
        logTest('GET /api/trading-mode/validation', false, error.message);
        results.failed++;
    }
}

// Тест 8: API endpoint - проверка возможности переключения
async function testAPICanSwitch() {
    logSection('8. API: Проверка возможности переключения');
    
    const modes = ['paper', 'micro', 'real'];
    
    for (const mode of modes) {
        try {
            const response = await makeRequest('GET', `/api/trading-mode/can-switch/${mode}`);
            
            logTest(`GET /api/trading-mode/can-switch/${mode}`, response.status === 200, 
                `Status: ${response.status}`);
            
            if (response.status === 200 && response.data.success) {
                results.passed++;
                
                const canSwitch = response.data.data;
                logTest(`  ${mode}: canSwitch`, canSwitch.canSwitch !== undefined, 
                    `canSwitch: ${canSwitch.canSwitch}`);
                if (canSwitch.canSwitch !== undefined) results.passed++; else results.failed++;
                
                // Проверка checks для micro и real
                if ((mode === 'micro' || mode === 'real') && canSwitch.checks) {
                    logTest(`  ${mode}: наличие checks`, true);
                    results.passed++;
                }
            } else {
                results.failed++;
            }
        } catch (error) {
            logTest(`GET /api/trading-mode/can-switch/${mode}`, false, error.message);
            results.failed++;
        }
    }
}

// Тест 9: Проверка критериев и текущих значений
async function testCriteriaAndCurrentValues() {
    logSection('9. Проверка критериев и текущих значений');
    
    try {
        // Получаем валидацию для микро-капитала
        const validation = await SwitchValidator.canSwitchToMicro();
        
        if (!validation || !validation.checks || !validation.criteria) {
            logTest('Наличие validation.checks и validation.criteria', false);
            results.failed++;
            return;
        }
        
        logTest('Наличие validation.checks и validation.criteria', true);
        results.passed++;
        
        // Проверяем, что для каждого критерия есть текущее значение
        const criteriaKeys = Object.keys(validation.criteria);
        log(`Проверяем ${criteriaKeys.length} критериев...`, 'blue');
        
        let criteriaWithValues = 0;
        for (const criteriaKey of criteriaKeys) {
            // Ищем текущее значение в checks.details
            let found = false;
            const checkKeys = ['profitability', 'consistency', 'riskMetrics'];
            
            for (const checkKey of checkKeys) {
                const check = validation.checks[checkKey];
                if (check?.details) {
                    // Маппинг ключей
                    const keyMapping = {
                        minProfitableMonths: 'profitableMonths',
                        minWinRate: 'winRate',
                        maxDrawdown: 'maxDrawdown',
                        minTotalTrades: 'totalTrades',
                        minProfitFactor: 'profitFactor',
                        maxConsecutiveLosses: 'consecutiveLosses',
                        minConfidence: 'confidence',
                        minSharpeRatio: 'sharpeRatio',
                        minConsistency: 'consistency'
                    };
                    
                    const detailKey = keyMapping[criteriaKey];
                    if (detailKey && check.details[detailKey]) {
                        const detail = check.details[detailKey];
                        if (detail.value !== undefined && detail.threshold !== undefined) {
                            found = true;
                            criteriaWithValues++;
                            logTest(`  ${criteriaKey}: текущее значение`, true, 
                                `${detail.value} / ${detail.threshold} (${detail.passed ? '✅' : '❌'})`);
                            results.passed++;
                            break;
                        }
                    }
                }
            }
            
            if (!found) {
                logTest(`  ${criteriaKey}: текущее значение`, false, 'Не найдено в checks.details');
                results.failed++;
            }
        }
        
        log(`Найдено текущих значений: ${criteriaWithValues} из ${criteriaKeys.length}`, 
            criteriaWithValues === criteriaKeys.length ? 'green' : 'yellow');
        
    } catch (error) {
        logTest('Проверка критериев и текущих значений', false, error.message);
        results.failed++;
        console.error(error);
    }
}

// Тест 10: Проверка рекомендаций
async function testRecommendations() {
    logSection('10. Проверка рекомендаций');
    
    try {
        const validation = await SwitchValidator.canSwitchToMicro();
        
        if (!validation || !validation.recommendations) {
            logTest('Наличие рекомендаций', false, 'Рекомендации отсутствуют');
            results.failed++;
            return;
        }
        
        logTest('Наличие рекомендаций', true, `Количество: ${validation.recommendations.length}`);
        results.passed++;
        
        // Проверяем структуру рекомендаций
        for (let i = 0; i < validation.recommendations.length; i++) {
            const rec = validation.recommendations[i];
            
            if (typeof rec === 'string') {
                logTest(`  Рекомендация ${i + 1}: строка`, true, rec.substring(0, 50));
                results.passed++;
            } else if (typeof rec === 'object') {
                const hasCategory = !!rec.category;
                const hasPriority = !!rec.priority;
                const hasActions = Array.isArray(rec.actions) && rec.actions.length > 0;
                
                logTest(`  Рекомендация ${i + 1}: category`, hasCategory, rec.category);
                logTest(`  Рекомендация ${i + 1}: priority`, hasPriority, rec.priority);
                logTest(`  Рекомендация ${i + 1}: actions`, hasActions, `${rec.actions?.length || 0} действий`);
                
                if (hasCategory) results.passed++; else results.failed++;
                if (hasPriority) results.passed++; else results.failed++;
                if (hasActions) results.passed++; else results.failed++;
            } else {
                logTest(`  Рекомендация ${i + 1}: неверный формат`, false);
                results.failed++;
            }
        }
        
    } catch (error) {
        logTest('Проверка рекомендаций', false, error.message);
        results.failed++;
        console.error(error);
    }
}

// Тест 11: Фактическое переключение режима (switchMode)
async function testSwitchMode() {
    logSection('11. Фактическое переключение режима (switchMode)');
    
    try {
        // Сохраняем исходный режим
        const originalMode = TradingModeManager.getCurrentMode();
        log(`Исходный режим: ${originalMode.mode}`, 'blue');
        
        // Тест 1: Переключение на paper (всегда доступно)
        try {
            const result = await TradingModeManager.switchMode('paper');
            logTest('switchMode("paper")', result.success === true, 
                `previousMode: ${result.previousMode}, currentMode: ${result.currentMode}`);
            
            if (result.success && result.currentMode === 'paper') {
                results.passed++;
                
                // Проверяем, что режим действительно изменился
                const current = TradingModeManager.getCurrentMode();
                if (current.mode === 'paper') {
                    logTest('  Режим сохранен в getCurrentMode()', true);
                    results.passed++;
                } else {
                    logTest('  Режим сохранен в getCurrentMode()', false, 
                        `Ожидался paper, получен ${current.mode}`);
                    results.failed++;
                }
            } else {
                results.failed++;
            }
        } catch (error) {
            logTest('switchMode("paper")', false, error.message);
            results.failed++;
        }
        
        // Тест 2: Попытка переключения на micro (должна провалиться, если не готово)
        try {
            const canSwitch = await TradingModeManager.canSwitchTo('micro');
            if (!canSwitch.canSwitch) {
                // Ожидаем ошибку при переключении
                try {
                    await TradingModeManager.switchMode('micro');
                    logTest('switchMode("micro") без валидации', false, 
                        'Должна была быть ошибка, но переключение прошло');
                    results.failed++;
                } catch (switchError) {
                    logTest('switchMode("micro") отклонено (ожидаемо)', true, 
                        `Ошибка: ${switchError.message}`);
                    results.passed++;
                }
            } else {
                // Если готово, переключаем
                const result = await TradingModeManager.switchMode('micro');
                logTest('switchMode("micro")', result.success === true, 
                    `currentMode: ${result.currentMode}`);
                if (result.success) {
                    results.passed++;
                } else {
                    results.failed++;
                }
            }
        } catch (error) {
            logTest('switchMode("micro")', false, error.message);
            results.failed++;
        }
        
        // Тест 3: Попытка переключения на недопустимый режим
        try {
            await TradingModeManager.switchMode('invalid_mode');
            logTest('switchMode("invalid_mode")', false, 'Должна была быть ошибка');
            results.failed++;
        } catch (error) {
            logTest('switchMode("invalid_mode") отклонено (ожидаемо)', true, 
                `Ошибка: ${error.message}`);
            results.passed++;
        }
        
        // Возвращаем исходный режим
        try {
            await TradingModeManager.switchMode(originalMode.mode);
            logTest('Восстановление исходного режима', true, `Режим: ${originalMode.mode}`);
            results.passed++;
        } catch (error) {
            logTest('Восстановление исходного режима', false, error.message);
            results.failed++;
        }
        
    } catch (error) {
        logTest('Фактическое переключение режима', false, error.message);
        results.failed++;
        console.error(error);
    }
}

// Тест 12: История переключений режимов
async function testModeHistory() {
    logSection('12. История переключений режимов');
    
    try {
        const historyResult = await TradingModeManager.getHistory();
        
        logTest('Получение истории переключений', typeof historyResult === 'object', 
            `Тип: ${typeof historyResult}`);
        
        if (typeof historyResult === 'object' && historyResult.history) {
            results.passed++;
            
            const history = historyResult.history;
            const isArray = Array.isArray(history);
            logTest('  История - массив', isArray, 
                `Записей в истории: ${isArray ? history.length : 'не массив'}`);
            
            if (isArray) {
                results.passed++;
                
                // Проверяем структуру записей истории
                if (history.length > 0) {
                    const firstRecord = history[0];
                    const hasMode = !!firstRecord.mode;
                    const hasTimestamp = !!firstRecord.timestamp;
                    const hasPreviousMode = firstRecord.previousMode !== undefined;
                    
                    logTest('  Структура записи (mode)', hasMode, firstRecord.mode);
                    logTest('  Структура записи (timestamp)', hasTimestamp);
                    logTest('  Структура записи (previousMode)', hasPreviousMode);
                    
                    if (hasMode) results.passed++; else results.failed++;
                    if (hasTimestamp) results.passed++; else results.failed++;
                    if (hasPreviousMode) results.passed++; else results.failed++;
                } else {
                    logTest('  История пуста (нормально для новой системы)', true);
                    results.passed++;
                }
            } else {
                results.failed++;
            }
            
            // Проверяем наличие currentMode в результате
            const hasCurrentMode = historyResult.currentMode !== undefined;
            logTest('  Результат содержит currentMode', hasCurrentMode, 
                `Текущий режим: ${historyResult.currentMode}`);
            if (hasCurrentMode) results.passed++; else results.failed++;
        } else {
            results.failed++;
        }
        
    } catch (error) {
        logTest('Получение истории переключений', false, error.message);
        results.failed++;
        console.error(error);
    }
}

// Тест 13: API endpoint для переключения режима
async function testAPISwitchMode() {
    logSection('13. API: Переключение режима');
    
    try {
        // Тест 1: Переключение на paper через API
        const response1 = await makeRequest('POST', '/api/trading-mode/switch', { mode: 'paper' });
        
        logTest('POST /api/trading-mode/switch (paper)', response1.status === 200, 
            `Status: ${response1.status}`);
        
        if (response1.status === 200 && response1.data.success) {
            results.passed++;
            
            const result = response1.data.data;
            logTest('  Структура ответа (success)', result.success === true);
            logTest('  Структура ответа (currentMode)', !!result.currentMode, 
                `Режим: ${result.currentMode}`);
            
            if (result.success) results.passed++; else results.failed++;
            if (result.currentMode) results.passed++; else results.failed++;
        } else {
            results.failed++;
        }
        
        // Тест 2: Попытка переключения на недопустимый режим через API
        const response2 = await makeRequest('POST', '/api/trading-mode/switch', { mode: 'invalid' });
        
        logTest('POST /api/trading-mode/switch (invalid)', 
            response2.status === 400 || response2.status === 500, 
            `Status: ${response2.status} (ожидается ошибка)`);
        
        if (response2.status === 400 || response2.status === 500) {
            results.passed++;
        } else {
            results.failed++;
        }
        
        // Тест 3: Переключение без указания режима
        const response3 = await makeRequest('POST', '/api/trading-mode/switch', {});
        
        logTest('POST /api/trading-mode/switch (без mode)', 
            response3.status === 400 || response3.status === 500, 
            `Status: ${response3.status} (ожидается ошибка)`);
        
        if (response3.status === 400 || response3.status === 500) {
            results.passed++;
        } else {
            results.failed++;
        }
        
    } catch (error) {
        logTest('API: Переключение режима', false, error.message);
        results.failed++;
        console.error(error);
    }
}

// Тест 14: API endpoint для истории переключений
async function testAPIModeHistory() {
    logSection('14. API: История переключений режимов');
    
    try {
        const response = await makeRequest('GET', '/api/trading-mode/history');
        
        logTest('GET /api/trading-mode/history', response.status === 200, 
            `Status: ${response.status}`);
        
        if (response.status === 200 && response.data.success) {
            results.passed++;
            
            const historyData = response.data.data;
            // API может возвращать либо массив, либо объект с полем history
            const history = Array.isArray(historyData) ? historyData : (historyData.history || []);
            const isArray = Array.isArray(history);
            
            logTest('  История - массив', isArray, 
                `Записей: ${isArray ? history.length : 'не массив'}`);
            
            if (isArray) {
                results.passed++;
            } else {
                results.failed++;
            }
        } else {
            results.failed++;
        }
        
    } catch (error) {
        logTest('API: История переключений', false, error.message);
        results.failed++;
        console.error(error);
    }
}

// Основная функция запуска тестов
async function runAllTests() {
    logSection('ТЕСТИРОВАНИЕ ВАЛИДАЦИИ И СМЕНЫ РЕЖИМОВ ТОРГОВЛИ');
    
    try {
        // 1. Инициализация
        const initSuccess = await testInitialization();
        if (!initSuccess) {
            log('\n❌ Инициализация не удалась, тесты прерваны', 'red');
            return;
        }
        
        // 2. Получение текущего режима
        await testGetCurrentMode();
        
        // 3. Валидация микро-капитала
        await testValidateMicroMode();
        
        // 4. Валидация полной торговли
        await testValidateFullMode();
        
        // 5. Проверка возможности переключения
        await testCanSwitchTo();
        
        // 6. API тесты
        await testAPIGetCurrentMode();
        await testAPIGetValidation();
        await testAPICanSwitch();
        
        // 7. Проверка критериев и текущих значений
        await testCriteriaAndCurrentValues();
        
        // 8. Проверка рекомендаций
        
        // 9. Фактическое переключение режима
        await testSwitchMode();
        
        // 10. История переключений
        await testModeHistory();
        
        // 11. API: Переключение режима
        await testAPISwitchMode();
        
        // 12. API: История переключений
        await testAPIModeHistory();
        
        // 13. Проверка рекомендаций (перенесено в конец, чтобы не мешать переключениям)
        await testRecommendations();
        
    } catch (error) {
        log(`\n❌ Критическая ошибка: ${error.message}`, 'red');
        console.error(error);
    } finally {
        // Закрытие сервера
        if (testServer) {
            testServer.close();
            log('\n✅ Тестовый сервер остановлен', 'green');
        }
        
        // Закрытие БД
        try {
            await sequelize.close();
            log('✅ Соединение с БД закрыто', 'green');
        } catch (error) {
            // Игнорируем ошибки закрытия
        }
        
        // Вывод результатов
        logSection('РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ');
        log(`✅ Пройдено: ${results.passed}`, 'green');
        log(`❌ Провалено: ${results.failed}`, 'red');
        log(`📊 Всего: ${results.passed + results.failed}`, 'cyan');
        
        const successRate = ((results.passed / (results.passed + results.failed)) * 100).toFixed(1);
        log(`📈 Процент успеха: ${successRate}%`, 
            parseFloat(successRate) >= 80 ? 'green' : parseFloat(successRate) >= 50 ? 'yellow' : 'red');
        
        process.exit(results.failed > 0 ? 1 : 0);
    }
}

// Запуск тестов
runAllTests().catch((error) => {
    console.error('❌ Критическая ошибка при запуске тестов:', error);
    process.exit(1);
});

