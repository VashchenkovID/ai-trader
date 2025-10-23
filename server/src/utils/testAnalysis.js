import NeuralNetworkService from '../services/NeuralNetworkService.js';
import CacheService from '../services/CacheService.js';
import sequelize from '../config/database.js';

async function testAnalysis() {
    console.log('🔍 ТЕСТИРОВАНИЕ АНАЛИЗА РЫНКА\n');

    try {
        // Подключаемся к БД
        await sequelize.authenticate();
        console.log('✅ Подключение к БД успешно\n');

        // Проверяем статус нейросети
        const status = NeuralNetworkService.getStatus();
        console.log('🧠 Статус нейросети:');
        console.log(`   Активна: ${status.isActive}`);
        console.log(`   Модель загружена: ${status.hasModel}`);
        console.log(`   Статус: ${status.status}\n`);

        if (!status.isActive || !status.hasModel) {
            console.log('❌ Нейросеть не активна или модель не загружена');
            return;
        }

        // Проверяем кеш инструментов
        const instruments = await CacheService.getAllInstruments(10);
        console.log(`📊 Инструментов в кеше: ${instruments.length}`);
        
        if (instruments.length > 0) {
            console.log('📋 Примеры инструментов:');
            instruments.slice(0, 3).forEach(instr => {
                console.log(`   ${instr.ticker}: ${instr.lastPrice} ₽`);
            });
        }

        // Запускаем анализ
        console.log('\n🚀 Запускаем анализ рынка...');
        await NeuralNetworkService.performMarketAnalysis();
        console.log('✅ Анализ завершен');

    } catch (error) {
        console.error('❌ Ошибка тестирования:', error);
    } finally {
        process.exit(0);
    }
}

testAnalysis();
