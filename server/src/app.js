import express from 'express';
import cors from 'cors';
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

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy для правильного определения IP адреса (важно для rate limiting)
app.set('trust proxy', true);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request tracing middleware (добавляет requestId и логирует запросы)
app.use(requestTracing);

// Secret masking middleware (маскирует секреты в запросах и ответах)
app.use(checkSecretsInRequest);
app.use(maskSecretsInRequest);
app.use(maskSecretsInResponse);

// Rate limiting middleware (применяется ко всем API запросам, кроме rate-limit endpoints)
// Исключаем rate-limit endpoints из общего лимита, чтобы можно было мониторить даже после превышения
// Можно отключить через переменную окружения DISABLE_RATE_LIMIT=true для локальной разработки
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
            } else {
                console.log('⚠️ Optimized Telegram service already initialized, skipping...');
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
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    await gracefulShutdown('SIGTERM');
});

process.on('SIGINT', async () => {
    console.log('🛑 SIGINT received, shutting down gracefully...');
    await gracefulShutdown('SIGINT');
});

// Обработка других сигналов завершения
process.on('SIGQUIT', async () => {
    console.log('🛑 SIGQUIT received, shutting down gracefully...');
    await gracefulShutdown('SIGQUIT');
});

process.on('SIGHUP', async () => {
    console.log('🛑 SIGHUP received, shutting down gracefully...');
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
        
        // Останавливаем все сервисы через ServiceManager
        await ServiceManager.stop();
        
        // Принудительно завершаем все cron задачи
        console.log('🛑 Force stopping all cron tasks...');
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
        
        // Ждем немного, чтобы cron задачи успели завершиться
        console.log('⏳ Waiting for cron tasks to finish...');
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
    gracefulShutdown('unhandledRejection').catch(() => {
        process.exit(1);
    });
});

// Start the server
startServer();

export default app;


