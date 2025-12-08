/**
 * Миграция: Добавление полей предсказаний в таблицу cached_instruments
 */

export const up = async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('cached_instruments', 'predictionScore', {
        type: Sequelize.FLOAT,
        allowNull: true,
        comment: 'Оценка предсказания (0-1)'
    });

    await queryInterface.addColumn('cached_instruments', 'predictionConfidence', {
        type: Sequelize.FLOAT,
        allowNull: true,
        comment: 'Уверенность предсказания (0-1)'
    });

    await queryInterface.addColumn('cached_instruments', 'predictionRecommendation', {
        type: Sequelize.ENUM('BUY', 'SELL', 'HOLD'),
        allowNull: true,
        comment: 'Рекомендация на основе предсказания'
    });

    await queryInterface.addColumn('cached_instruments', 'predictionDate', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Дата и время последнего предсказания'
    });

    await queryInterface.addColumn('cached_instruments', 'predictionExplanation', {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Объяснение предсказания (JSON)'
    });

    // Добавляем индекс для быстрого поиска по предсказаниям
    await queryInterface.addIndex('cached_instruments', ['predictionDate'], {
        name: 'idx_cached_instruments_prediction_date'
    });

    await queryInterface.addIndex('cached_instruments', ['predictionRecommendation', 'predictionScore'], {
        name: 'idx_cached_instruments_prediction_recommendation'
    });
};

export const down = async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('cached_instruments', 'idx_cached_instruments_prediction_recommendation');
    await queryInterface.removeIndex('cached_instruments', 'idx_cached_instruments_prediction_date');
    
    await queryInterface.removeColumn('cached_instruments', 'predictionExplanation');
    await queryInterface.removeColumn('cached_instruments', 'predictionDate');
    await queryInterface.removeColumn('cached_instruments', 'predictionRecommendation');
    await queryInterface.removeColumn('cached_instruments', 'predictionConfidence');
    await queryInterface.removeColumn('cached_instruments', 'predictionScore');
};

