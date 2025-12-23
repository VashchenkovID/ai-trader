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

// Load environment variables
dotenv.config();

// ES modules __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
    const start = Date.now();
    const userAgent = req.get('User-Agent') || 'Unknown';
    const ip = req.ip || req.connection.remoteAddress || 'Unknown';
    
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        if (duration > 1000) {
            console.log(`🐌 Slow request: ${req.method} ${req.path} (${duration}ms)`);
        }
    });
    
    next();
});

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

// Catch-all handler for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('❌ Server error:', error);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

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
                console.error('❌ Error sending startup notification:', error);
            }
        }
        
    } catch (error) {
        console.error('❌ Failed to initialize services:', error);
        process.exit(1);
    }
}

// Start server
async function startServer() {
    try {
        await initializeServices();
        
        server.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📊 Dashboard: http://localhost:${PORT}`);
            console.log(`🔧 API: http://localhost:${PORT}/api`);
        });
        
    } catch (error) {
        console.error('❌ Failed to start server:', error);
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
                console.error('❌ Error sending shutdown notification:', error);
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
            console.error('❌ Error force stopping cron tasks:', error);
        }
        
        // Ждем немного, чтобы cron задачи успели завершиться
        console.log('⏳ Waiting for cron tasks to finish...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        await sequelize.close();
        
        server.close(() => {
            process.exit(0);
        });
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
}

// Обработка необработанных исключений
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    gracefulShutdown('uncaughtException').catch(() => {
        process.exit(1);
    });
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('unhandledRejection').catch(() => {
        process.exit(1);
    });
});

// Start the server
startServer();export default app;


