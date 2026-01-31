import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import sequelize from './config/database.js';

// Import optimized routes
import optimizedRoutes from './routes/optimized-routes.js';

// Import ServiceManager
import ServiceManager from './services/ServiceManager.js';
import { setGlobalServiceManager } from './services/GlobalServiceManager.js';

// Import error handlers
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
// Import request tracing
import { requestTracing, errorTracing } from './middleware/requestTracing.js';
// Import rate limiting
import { generalLimiter } from './middleware/rateLimiter.js';
// Import secret masking middleware
import { maskSecretsInResponse, maskSecretsInRequest, checkSecretsInRequest } from './middleware/secretMasking.js';
// Import LoggerService (будет инициализирован через ServiceManager)
import LoggerService from './services/LoggerService.js';

// Load environment variables
dotenv.config();

// ES modules __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate required environment variables before starting
try {
    const { validateRequiredEnvVars, validateProductionEnv } = await import('./utils/envValidator.js');
    validateRequiredEnvVars();
    validateProductionEnv();
} catch (error) {
    console.error('❌ Environment validation failed:', error.message);
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy для правильного определения IP адреса (важно для rate limiting)
app.set('trust proxy', true);

// CORS configuration
const getCorsOrigin = () => {
    const frontendUrl = process.env.FRONTEND_URL;
    
    if (!frontendUrl) {
        if (process.env.NODE_ENV === 'production') {
            console.warn('⚠️ FRONTEND_URL is not set in production. CORS may not work correctly.');
            return false; // В продакшене без FRONTEND_URL отключаем CORS для безопасности
        }
        return 'http://localhost:3000';
    }
    
    // Поддержка нескольких доменов через запятую
    if (frontendUrl.includes(',')) {
        return frontendUrl.split(',').map(url => url.trim());
    }
    
    return frontendUrl;
};

const corsOptions = {
    origin: getCorsOrigin(),
    credentials: true, // Разрешаем отправку куки
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Authorization'],
    optionsSuccessStatus: 200
};

// Middleware
// Security headers (helmet)
app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false, // Отключаем в dev для удобства разработки
    crossOriginEmbedderPolicy: false, // Для работы с внешними API
    crossOriginResourcePolicy: { policy: "cross-origin" } // Для работы с внешними ресурсами
}));

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request tracing middleware (добавляет requestId и логирует запросы)
app.use(requestTracing);

// Secret masking middleware (маскирует секреты в запросах и ответах)
app.use(checkSecretsInRequest);
app.use(maskSecretsInRequest);
app.use(maskSecretsInResponse);

// Rate limiting middleware (применяется ко всем API запросам, кроме rate-limit endpoints)
if (process.env.DISABLE_RATE_LIMIT !== 'true') {
    app.use('/api', (req, res, next) => {
        // Пропускаем rate-limit endpoints без ограничений
        if (req.path.startsWith('/rate-limit')) {
            return next();
        }
        return generalLimiter(req, res, next);
    });
} else {
    console.log('⚠️ Rate limiting отключен (DISABLE_RATE_LIMIT=true)');
}

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// API Routes
app.use('/api', optimizedRoutes);

// Serve static files from client build
const clientDistPath = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDistPath));

// 404 handler - должен быть перед catch-all для SPA
app.use('/api/*', notFoundHandler);

// Catch-all handler for SPA (должен быть последним перед error handler)
app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Error tracing middleware (добавляет requestId к ошибкам)
app.use(errorTracing);

// Centralized error handling middleware (должен быть последним)
app.use(errorHandler);

// Create HTTP server
const server = createServer(app);

// Initialize services
async function initializeServices() {
    try {
        // Проверяем наличие критических таблиц для быстрой проверки
        // Если все таблицы существуют, initDatabase() быстро пройдет проверку
        // Если нет - создаст отсутствующие таблицы и столбцы безопасно
        console.log('🔄 Проверка и инициализация базы данных...');
        const { initDatabase } = await import('./utils/initDatabase.js');
        await initDatabase();
        console.log('✅ База данных проверена и инициализирована');
        
        // Импортируем трекер для отметки сервисов как глобально инициализированных
        const ServiceInitializationTracker = (await import('./utils/ServiceInitializationTracker.js')).default;
        
        // Initialize complete system through ServiceManager
        await ServiceManager.initializeSystem(server, sequelize);
        
        // Отмечаем ServiceManager как глобально инициализированный
        await ServiceInitializationTracker.markServiceInitialized('ServiceManager');
        
        // Устанавливаем глобальный ServiceManager
        setGlobalServiceManager(ServiceManager);
        
        // Initialize Telegram (optional) - ПОСЛЕ всех остальных сервисов
        if (process.env.TELEGRAM_BOT_TOKEN) {
            // Небольшая задержка, чтобы все сервисы были готовы
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const OptimizedTelegramService = (await import('./services/OptimizedTelegramService.js')).default;
            
            // Проверяем, не инициализирован ли уже бот
            if (!OptimizedTelegramService.isInitialized) {
                await OptimizedTelegramService.initialize();
                // Отмечаем Telegram сервис как глобально инициализированный
                const ServiceInitializationTracker = (await import('./utils/ServiceInitializationTracker.js')).default;
                await ServiceInitializationTracker.markServiceInitialized('OptimizedTelegramService');
            }
            
            // Отправляем уведомление о старте сервера
            try {
                if (OptimizedTelegramService.isInitialized) {
                    await OptimizedTelegramService.sendAlert(
                        'SERVER_STARTUP',
                        `🚀 <b>СЕРВЕР ЗАПУЩЕН</b>\n\n⏰ Время: ${new Date().toLocaleString('ru-RU')}\n✅ Все сервисы инициализированы`,
                        'info'
                    );
                }
            } catch (error) {
                LoggerService.error('Error sending startup notification', {
                    service: 'app',
                    operation: 'sendStartupNotification',
                    error: {
                        message: error.message,
                        stack: error.stack
                    }
                });
            }
        }
        
    } catch (error) {
        LoggerService.error('Failed to initialize services', {
            service: 'app',
            operation: 'initializeServices',
            error: {
                message: error.message,
                stack: error.stack
            }
        });
        process.exit(1);
    }
}

// Start server
async function startServer() {
    try {
        await initializeServices();
        
        server.listen(PORT, () => {
            // Сервер запущен, логирование не требуется
        });
        
    } catch (error) {
        LoggerService.error('Failed to start server', {
            service: 'app',
            operation: 'startServer',
            error: {
                message: error.message,
                stack: error.stack
            }
        });
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    await gracefulShutdown('SIGTERM');
});

process.on('SIGINT', async () => {
    await gracefulShutdown('SIGINT');
});

// Обработка других сигналов завершения
process.on('SIGQUIT', async () => {
    await gracefulShutdown('SIGQUIT');
});

process.on('SIGHUP', async () => {
    await gracefulShutdown('SIGHUP');
});

// Функция для graceful shutdown
async function gracefulShutdown(signal) {
    try {
        // Отправляем уведомление об остановке сервера
        if (process.env.TELEGRAM_BOT_TOKEN) {
            try {
                const OptimizedTelegramService = (await import('./services/OptimizedTelegramService.js')).default;
                await OptimizedTelegramService.sendAlert(
                    'SERVER_SHUTDOWN',
                    `🛑 <b>СЕРВЕР ОСТАНОВЛЕН</b>\n\n⏰ Время: ${new Date().toLocaleString('ru-RU')}\n🔍 Причина: ${signal}`,
                    'warning'
                );
            } catch (error) {
                LoggerService.error('Error sending shutdown notification', {
                    service: 'app',
                    operation: 'gracefulShutdown',
                    error: {
                        message: error.message,
                        stack: error.stack
                    }
                });
            }
        }
        
        await ServiceManager.stop();
        try {
            const cron = await import('node-cron');
            // Останавливаем все активные cron задачи
            cron.getTasks().forEach(task => {
                if (task && typeof task.stop === 'function') {
                    task.stop();
                    if (typeof task.destroy === 'function') {
                        task.destroy();
                    }
                }
            });
        } catch (error) {
            LoggerService.error('Error force stopping cron tasks', {
                service: 'app',
                operation: 'gracefulShutdown',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        await sequelize.close();
        
        server.close(() => {
            process.exit(0);
        });
    } catch (error) {
        LoggerService.error('Error during shutdown', {
            service: 'app',
            operation: 'gracefulShutdown',
            signal,
            error: {
                message: error.message,
                stack: error.stack
            }
        });
        process.exit(1);
    }
}

// Обработка необработанных исключений
process.on('uncaughtException', (error) => {
    LoggerService.logCritical('Uncaught Exception', {
        service: 'app',
        error: {
            message: error.message,
            stack: error.stack,
            name: error.name
        }
    });
    
    // Не перезапускаем сервер для ошибок ONNX Runtime / BERT модели
    const errorMessage = error.message || '';
    const isONNXError = errorMessage.includes('Ort::Exception') ||
                       errorMessage.includes('onnxruntime') ||
                       errorMessage.includes('transformers') ||
                       errorMessage.includes('BERT') ||
                       error.name === 'Ort::Exception';
    
    if (isONNXError) {
        console.error('⚠️ ONNX Runtime error (non-critical, server continues):', errorMessage);
        // Не перезапускаем сервер - это некритичная ошибка
        return;
    }
    
    gracefulShutdown('uncaughtException').catch(() => {
        process.exit(1);
    });
});

process.on('unhandledRejection', (reason, promise) => {
    LoggerService.logCritical('Unhandled Rejection', {
        service: 'app',
        reason: reason instanceof Error ? {
            message: reason.message,
            stack: reason.stack,
            name: reason.name
        } : String(reason),
        promise: promise?.toString()
    });
    
    // Не перезапускаем сервер для некритичных ошибок (например, ошибки обновления новостей)
    // Только для критичных ошибок вызываем gracefulShutdown
    const errorMessage = reason instanceof Error ? reason.message : String(reason);
    const errorName = reason instanceof Error ? reason.name : '';
    
    // Критичные ошибки - только проблемы с БД и подключениями
    const isCritical = errorMessage.includes('database') || 
                       errorMessage.includes('connection') ||
                       errorMessage.includes('sequelize') ||
                       errorMessage.includes('ECONNREFUSED') ||
                       errorMessage.includes('ENOTFOUND') ||
                       errorMessage.includes('EACCES') && errorMessage.includes('database');
    
    // Некритичные ошибки - новости, BERT модель, анализ тональности, HTTP ошибки внешних API, макро-данные
    const isNonCritical = errorMessage.includes('news') ||
                          errorMessage.includes('NewsAPI') ||
                          errorMessage.includes('NewsApiService') ||
                          errorMessage.includes('sentiment') ||
                          errorMessage.includes('BERT') ||
                          errorMessage.includes('transformers') ||
                          errorMessage.includes('NewsAnalysis') ||
                          errorMessage.includes('loadFreshNews') ||
                          errorMessage.includes('performDailyNewsUpdate') ||
                          errorMessage.includes('performLimitedNewsUpdate') ||
                          errorMessage.includes('fetchNewsByCompanyName') ||
                          errorMessage.includes('MacroData') ||
                          errorMessage.includes('MacroDataService') ||
                          errorMessage.includes('performMacroDataUpdate') ||
                          errorMessage.includes('HTTP error! status: 500') ||
                          errorMessage.includes('HTTP error! status: 502') ||
                          errorMessage.includes('HTTP error! status: 503') ||
                          errorMessage.includes('HTTP error! status: 504') ||
                          errorMessage.includes('status: 500') ||
                          errorMessage.includes('status: 502') ||
                          errorMessage.includes('status: 503') ||
                          errorMessage.includes('status: 504') ||
                          errorMessage.includes('HTTP 500') ||
                          errorMessage.includes('HTTP 502') ||
                          errorMessage.includes('HTTP 503') ||
                          errorMessage.includes('HTTP 504') ||
                          (reason instanceof Error && (reason.status === 500 || reason.statusCode === 500 || reason.status === 502 || reason.statusCode === 502 || reason.status === 503 || reason.statusCode === 503 || reason.status === 504 || reason.statusCode === 504)) ||
                          errorName === 'TypeError' && errorMessage.includes('model');
    
    if (isCritical && !isNonCritical) {
        gracefulShutdown('unhandledRejection').catch(() => {
            process.exit(1);
        });
    } else {
        // Логируем, но не перезапускаем сервер для некритичных ошибок
        console.error('⚠️ Non-critical unhandled rejection (server continues):', errorMessage);
    }
});

// Start the server
startServer();

export default app;


