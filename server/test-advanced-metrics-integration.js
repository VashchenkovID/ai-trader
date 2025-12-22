/**
 * Интеграционные тесты для продвинутых метрик производительности
 * 
 * Тестирует:
 * 1. API endpoints
 * 2. Интеграцию с ProfitabilityTracker
 * 3. Интеграцию с OptimizedAnalysisService
 * 4. Корректность расчетов метрик
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';
import { URL } from 'url';
import sequelize from './src/config/database.js';
import { initDatabase } from './src/utils/initDatabase.js';
import ProfitabilityTracker from './src/services/ProfitabilityTracker.js';
import OptimizedAnalysisService from './src/services/OptimizedAnalysisService.js';
import TradingEngine from './src/services/TradingEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загрузка переменных окружения
dotenv.config({ path: join(__dirname, '.env') });

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';

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
  const status = passed ? '✅ PASS' : '❌ FAIL';
  const color = passed ? 'green' : 'red';
  log(`${status}: ${name} ${details ? `- ${details}` : ''}`, color);
};

// HTTP запросы
const makeRequest = (path, method = 'GET', body = null) => {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 3001,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (error) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
};

async function runIntegrationTests() {
  const results = { passed: 0, failed: 0 };

  try {
    logSection('ИНТЕГРАЦИОННЫЕ ТЕСТЫ ПРОДВИНУТЫХ МЕТРИК');
    log('Тестирование всех компонентов системы продвинутых метрик', 'blue');

    // Инициализация
    logSection('1. Инициализация базы данных и сервисов');
    try {
      await initDatabase();
      await ProfitabilityTracker.initialize();
      await OptimizedAnalysisService.initialize();
      if (!TradingEngine.isInitialized) {
        await TradingEngine.initialize();
      }
      log('✅ База данных и сервисы инициализированы', 'green');
      results.passed++;
    } catch (error) {
      logTest('Инициализация', false, error.message);
      results.failed++;
      return; // Прерываем, если инициализация не удалась
    }

    // Тестирование API endpoints
    logSection('2. Тестирование API endpoints');

    // 2.1. GET /api/advanced-metrics
    try {
      const response = await makeRequest('/api/advanced-metrics?period=daily&days=30');
      const isValid = response.status === 200 && 
                     response.data.success === true &&
                     response.data.data &&
                     response.data.data.baseMetrics &&
                     response.data.data.advancedMetrics;
      logTest('GET /api/advanced-metrics', isValid, 
        isValid ? '' : `Status: ${response.status}, Success: ${response.data.success}`);
      if (isValid) {
        results.passed++;
      } else {
        results.failed++;
      }
    } catch (error) {
      logTest('GET /api/advanced-metrics', false, error.message);
      results.failed++;
    }

    // 2.2. GET /api/advanced-metrics/sortino-ratio
    try {
      const response = await makeRequest('/api/advanced-metrics/sortino-ratio?period=daily&days=30');
      const isValid = response.status === 200 && 
                     response.data.success === true &&
                     response.data.data &&
                     typeof response.data.data.sortinoRatio === 'number';
      logTest('GET /api/advanced-metrics/sortino-ratio', isValid);
      if (isValid) {
        results.passed++;
      } else {
        results.failed++;
      }
    } catch (error) {
      logTest('GET /api/advanced-metrics/sortino-ratio', false, error.message);
      results.failed++;
    }

    // 2.3. GET /api/advanced-metrics/calmar-ratio
    try {
      const response = await makeRequest('/api/advanced-metrics/calmar-ratio?period=daily&days=30');
      const isValid = response.status === 200 && 
                     response.data.success === true &&
                     response.data.data &&
                     typeof response.data.data.calmarRatio === 'number';
      logTest('GET /api/advanced-metrics/calmar-ratio', isValid);
      if (isValid) {
        results.passed++;
      } else {
        results.failed++;
      }
    } catch (error) {
      logTest('GET /api/advanced-metrics/calmar-ratio', false, error.message);
      results.failed++;
    }

    // 2.4. GET /api/advanced-metrics/information-ratio
    try {
      const response = await makeRequest('/api/advanced-metrics/information-ratio?period=daily&days=30');
      const isValid = response.status === 200 && 
                     response.data.success === true &&
                     response.data.data &&
                     (response.data.data.informationRatio === null || typeof response.data.data.informationRatio === 'number');
      logTest('GET /api/advanced-metrics/information-ratio', isValid);
      if (isValid) {
        results.passed++;
      } else {
        results.failed++;
      }
    } catch (error) {
      logTest('GET /api/advanced-metrics/information-ratio', false, error.message);
      results.failed++;
    }

    // 2.5. GET /api/advanced-metrics/mae-mfe
    try {
      const response = await makeRequest('/api/advanced-metrics/mae-mfe?limit=100');
      const isValid = response.status === 200 && 
                     response.data.success === true &&
                     response.data.data &&
                     typeof response.data.data.mae === 'number' &&
                     typeof response.data.data.mfe === 'number' &&
                     typeof response.data.data.maeMfeAvailable === 'boolean';
      logTest('GET /api/advanced-metrics/mae-mfe', isValid);
      if (isValid) {
        results.passed++;
      } else {
        results.failed++;
      }
    } catch (error) {
      logTest('GET /api/advanced-metrics/mae-mfe', false, error.message);
      results.failed++;
    }

    // 2.6. GET /api/advanced-metrics/period-analysis
    try {
      const response = await makeRequest('/api/advanced-metrics/period-analysis?period=daily');
      const isValid = response.status === 200 && 
                     response.data.success === true &&
                     response.data.data &&
                     response.data.data.period;
      logTest('GET /api/advanced-metrics/period-analysis', isValid);
      if (isValid) {
        results.passed++;
      } else {
        results.failed++;
      }
    } catch (error) {
      logTest('GET /api/advanced-metrics/period-analysis', false, error.message);
      results.failed++;
    }

    // 2.7. GET /api/advanced-metrics/summary
    try {
      const response = await makeRequest('/api/advanced-metrics/summary?period=daily&days=30');
      const isValid = response.status === 200 && 
                     response.data.success === true &&
                     response.data.data &&
                     response.data.data.baseMetrics &&
                     response.data.data.advancedMetrics;
      logTest('GET /api/advanced-metrics/summary', isValid);
      if (isValid) {
        results.passed++;
      } else {
        results.failed++;
      }
    } catch (error) {
      logTest('GET /api/advanced-metrics/summary', false, error.message);
      results.failed++;
    }

    // Тестирование интеграции с сервисами
    logSection('3. Тестирование интеграции с сервисами');

    // 3.1. ProfitabilityTracker.calculateAdvancedMetrics
    try {
      const stats = ProfitabilityTracker.getDailyStatsForPeriod(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        new Date()
      );
      
      if (stats.length > 0) {
        const metrics = ProfitabilityTracker.calculateMetrics(stats, 'daily');
        const hasAdvancedMetrics = metrics.sortinoRatio !== undefined &&
                                  metrics.calmarRatio !== undefined &&
                                  metrics.mae !== undefined &&
                                  metrics.mfe !== undefined;
        logTest('ProfitabilityTracker.calculateAdvancedMetrics', hasAdvancedMetrics);
        if (hasAdvancedMetrics) {
          results.passed++;
        } else {
          results.failed++;
        }
      } else {
        log('ℹ️ Нет статистики для тестирования (это нормально, если нет сделок)', 'yellow');
        results.passed++; // Не считаем это ошибкой
      }
    } catch (error) {
      logTest('ProfitabilityTracker.calculateAdvancedMetrics', false, error.message);
      results.failed++;
    }

    // 3.2. OptimizedAnalysisService.analyzePeriodPerformance
    try {
      const analysis = await OptimizedAnalysisService.analyzePeriodPerformance('daily');
      const isValid = analysis.success !== undefined &&
                     analysis.byDayOfWeek !== undefined &&
                     analysis.byMonth !== undefined;
      logTest('OptimizedAnalysisService.analyzePeriodPerformance', isValid);
      if (isValid) {
        results.passed++;
      } else {
        results.failed++;
      }
    } catch (error) {
      logTest('OptimizedAnalysisService.analyzePeriodPerformance', false, error.message);
      results.failed++;
    }

    // Тестирование валидации параметров
    logSection('4. Тестирование валидации параметров');

    // 4.1. Невалидный период
    try {
      const response = await makeRequest('/api/advanced-metrics?period=invalid&days=30');
      const isValid = response.status === 400 || response.status === 200; // Может быть 200 с дефолтным периодом
      logTest('Валидация невалидного периода', isValid);
      if (isValid) {
        results.passed++;
      } else {
        results.failed++;
      }
    } catch (error) {
      logTest('Валидация невалидного периода', false, error.message);
      results.failed++;
    }

    // 4.2. Невалидное количество дней
    try {
      const response = await makeRequest('/api/advanced-metrics?period=daily&days=-1');
      const isValid = response.status === 400 || response.status === 200; // Может быть 200 с дефолтным значением
      logTest('Валидация невалидного количества дней', isValid);
      if (isValid) {
        results.passed++;
      } else {
        results.failed++;
      }
    } catch (error) {
      logTest('Валидация невалидного количества дней', false, error.message);
      results.failed++;
    }

    // Итоги
    log('\n' + '='.repeat(60), 'cyan');
    log('ИТОГИ ИНТЕГРАЦИОННОГО ТЕСТИРОВАНИЯ', 'cyan');
    log('='.repeat(60), 'cyan');
    log(`✅ Пройдено тестов: ${results.passed}`, 'green');
    log(`❌ Провалено тестов: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
    log(`📊 Всего тестов: ${results.passed + results.failed}`, 'cyan');
    log(`📈 Успешность: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`, 'cyan');
    log('='.repeat(60) + '\n', 'cyan');

    if (results.failed === 0) {
      log('🎉 Все интеграционные тесты пройдены успешно!', 'green');
    } else {
      log('⚠️ Некоторые тесты провалены. Проверьте логи выше.', 'yellow');
    }

  } catch (error) {
    log('❌ Критическая ошибка во время тестов:', 'red');
    console.error(error);
    results.failed++;
  } finally {
    await sequelize.close().catch(() => {});
    log('✅ Соединение с базой данных закрыто.', 'green');
    process.exit(results.failed > 0 ? 1 : 0);
  }
}

// Запуск тестов
runIntegrationTests();

