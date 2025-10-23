import NeuralNetworkService from '../services/NeuralNetworkService.js';
import sequelize from '../config/database.js';

async function testNeuralNetwork() {
    console.log('🔍 ТЕСТИРОВАНИЕ НЕЙРОСЕТИ\n');

    try {
        // Подключаемся к БД
        await sequelize.authenticate();
        console.log('✅ Подключение к БД успешно\n');

        // Проверяем статус нейросети
        const status = NeuralNetworkService.getStatus();
        console.log('🧠 Статус нейросети:');
        console.log(`   Активна: ${status.isActive}`);
        console.log(`   Модель загружена: ${status.hasModel}`);
        console.log(`   Статус: ${status.status}`);
        console.log(`   Обучение: ${status.isTraining}\n`);

        if (!status.isActive) {
            console.log('❌ Нейросеть не активна!');
            return;
        }

        if (!status.hasModel) {
            console.log('❌ Модель не загружена!');
            console.log('💡 Попробуйте обучить нейросеть через API или интерфейс');
            return;
        }

        console.log('✅ Нейросеть готова к работе');

    } catch (error) {
        console.error('❌ Ошибка тестирования:', error);
    } finally {
        process.exit(0);
    }
}

testNeuralNetwork();
