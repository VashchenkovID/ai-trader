import NeuralNetworkService from '../services/NeuralNetworkService.js';
import OptimizedTelegramService from '../services/OptimizedTelegramService.js';
import IntegratedAIService from '../services/IntegratedAIService.js';
import EnsembleService from '../services/EnsembleService.js';
import MetaLearningService from '../services/MetaLearningService.js';
import ReinforcementLearningService from '../services/ReinforcementLearningService.js';
import WebSocketService from '../services/WebSocketService.js';
import TradingEngine from '../services/TradingEngine.js';
import CacheService from '../services/CacheService.js';
import sequelize from '../config/database.js';

async function diagnose() {
    console.log('🔍 ДИАГНОСТИКА СИСТЕМЫ\n');

    try {
        // 1. Проверка базы данных
        console.log('1. 📊 База данных:');
        await sequelize.authenticate();
        console.log('   ✅ Подключение к БД успешно');

        // 2. Проверка кеша
        console.log('\n2. 💾 Кеш данных:');
        const instruments = await CacheService.getAllInstruments(10);
        console.log(`   📈 Инструментов в кеше: ${instruments.length}`);
        
        if (instruments.length > 0) {
            console.log(`   📋 Примеры: ${instruments.slice(0, 3).map(i => i.ticker).join(', ')}`);
        }

        // 3. Проверка интегрированного AI сервиса
        console.log('\n3. 🧠 Интегрированный AI сервис:');
        const aiStatus = IntegratedAIService.getStatus();
        console.log(`   🔧 Инициализирован: ${aiStatus.isInitialized ? 'Да' : 'Нет'}`);
        console.log(`   📊 Активных сетей: ${Object.values(aiStatus.activeNetworks).filter(Boolean).length}/4`);
        console.log(`   🕐 Последнее обновление: ${aiStatus.lastUpdate || 'Неизвестно'}`);

        // 3.1. Традиционная нейросеть
        console.log('\n3.1. 🧠 Традиционная нейросеть:');
        const traditionalStatus = NeuralNetworkService.getStatus();
        console.log(`   📊 Статус: ${traditionalStatus.status}`);
        console.log(`   🔄 Активна: ${traditionalStatus.isActive ? 'Да' : 'Нет'}`);
        console.log(`   📚 Модель загружена: ${traditionalStatus.hasModel ? 'Да' : 'Нет'}`);
        console.log(`   🎓 Обучение: ${traditionalStatus.isTraining ? 'В процессе' : 'Не активно'}`);

        // 3.2. Ансамбль нейросетей
        console.log('\n3.2. 🎭 Ансамбль нейросетей:');
        try {
            const ensembleStatus = EnsembleService.getStatus();
            console.log(`   🔧 Инициализирован: ${ensembleStatus.isInitialized ? 'Да' : 'Нет'}`);
            console.log(`   📊 Моделей в ансамбле: ${ensembleStatus.modelsCount || 0}`);
            console.log(`   🎯 Последнее обучение: ${ensembleStatus.lastTrainingTime || 'Никогда'}`);
        } catch (error) {
            console.log(`   ❌ Ошибка получения статуса: ${error.message}`);
        }

        // 3.3. Meta-Learning система
        console.log('\n3.3. 🧩 Meta-Learning система:');
        try {
            const metaStatus = MetaLearningService.getStats();
            console.log(`   🔧 Инициализирован: ${metaStatus.isInitialized ? 'Да' : 'Нет'}`);
            console.log(`   📊 Обучающих задач: ${metaStatus.tasksCount || 0}`);
            console.log(`   🎯 Точность: ${metaStatus.accuracy ? (metaStatus.accuracy * 100).toFixed(1) + '%' : 'Неизвестно'}`);
        } catch (error) {
            console.log(`   ❌ Ошибка получения статуса: ${error.message}`);
        }

        // 3.4. Reinforcement Learning агент
        console.log('\n3.4. 🤖 RL агент:');
        try {
            const rlStatus = ReinforcementLearningService.getStats();
            console.log(`   🔧 Инициализирован: ${rlStatus.isInitialized ? 'Да' : 'Нет'}`);
            console.log(`   📊 Эпизодов обучения: ${rlStatus.episodes || 0}`);
            console.log(`   🎯 Средняя награда: ${rlStatus.averageReward ? rlStatus.averageReward.toFixed(3) : 'Неизвестно'}`);
        } catch (error) {
            console.log(`   ❌ Ошибка получения статуса: ${error.message}`);
        }

        // 4. Проверка WebSocket
        console.log('\n4. 🌐 WebSocket:');
        try {
            const wsStatus = WebSocketService.getStatus();
            console.log(`   🔌 Подключен: ${wsStatus.isConnected ? 'Да' : 'Нет'}`);
            console.log(`   👥 Клиентов: ${wsStatus.clientsCount || 0}`);
            console.log(`   🔧 Инициализирован: ${wsStatus.isInitialized ? 'Да' : 'Нет'}`);
        } catch (error) {
            console.log(`   ❌ Ошибка получения статуса: ${error.message}`);
        }

        // 5. Проверка торгового движка
        console.log('\n5. 💼 Торговый движок:');
        try {
            const tradingStatus = TradingEngine.getStatus();
            console.log(`   🔧 Инициализирован: ${tradingStatus.isInitialized ? 'Да' : 'Нет'}`);
            console.log(`   📊 Режим торговли: ${tradingStatus.mode || 'Неизвестно'}`);
            console.log(`   💰 Виртуальный капитал: ${tradingStatus.virtualCapital ? tradingStatus.virtualCapital.toFixed(2) + ' ₽' : 'Неизвестно'}`);
        } catch (error) {
            console.log(`   ❌ Ошибка получения статуса: ${error.message}`);
        }

        // 6. Проверка Telegram
        console.log('\n6. 📱 Telegram:');
        console.log(`   🤖 Бот инициализирован: ${OptimizedTelegramService.isInitialized ? 'Да' : 'Нет'}`);
        if (OptimizedTelegramService.isInitialized) {
            console.log(`   💬 Chat ID: ${OptimizedTelegramService.chatId}`);
        }

        // 7. Проверка портфеля
        console.log('\n7. 💼 Портфель:');
        const PortfolioItem = (await import('../models/PortfolioItem.js')).default;
        const portfolioItems = await PortfolioItem.findAll();
        console.log(`   📦 Элементов в портфеле: ${portfolioItems.length}`);

        // 8. Тест интегрированного анализа
        console.log('\n8. 🔍 Тест интегрированного анализа:');
        if (aiStatus.isInitialized && Object.values(aiStatus.activeNetworks).some(Boolean)) {
            try {
                // Получаем первый доступный инструмент для теста
                const testInstrument = instruments[0];
                if (testInstrument) {
                    console.log(`   🧪 Тестируем на инструменте: ${testInstrument.ticker}`);
                    const recommendation = await IntegratedAIService.getIntegratedRecommendation(testInstrument.figi);
                    console.log(`   📊 Рекомендация: ${recommendation.recommendation}`);
                    console.log(`   🎯 Уверенность: ${(recommendation.confidence * 100).toFixed(1)}%`);
                    console.log(`   📈 Источников: ${recommendation.sources}`);
                    console.log('   ✅ Интегрированный анализ выполнен успешно');
                } else {
                    console.log('   ⏭️ Нет доступных инструментов для тестирования');
                }
            } catch (error) {
                console.log(`   ❌ Ошибка интегрированного анализа: ${error.message}`);
            }
        } else {
            console.log('   ⏭️ Пропущен (AI сервисы не инициализированы)');
        }

        // 9. Тест традиционного анализа (если возможно)
        if (traditionalStatus.isActive && traditionalStatus.hasModel) {
            console.log('\n9. 🔍 Тест традиционного анализа:');
            try {
                await NeuralNetworkService.performMarketAnalysis();
                console.log('   ✅ Традиционный анализ выполнен успешно');
            } catch (error) {
                console.log(`   ❌ Ошибка традиционного анализа: ${error.message}`);
            }
        } else {
            console.log('\n9. 🔍 Тест традиционного анализа:');
            console.log('   ⏭️ Пропущен (традиционная нейросеть не активна)');
        }

        console.log('\n✅ Диагностика завершена');

    } catch (error) {
        console.error('❌ Ошибка диагностики:', error);
    } finally {
        process.exit(0);
    }
}

diagnose();
