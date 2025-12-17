import sequelize from '../config/database.js';
import CachedInstrument from '../models/CachedInstrument.js';
import CachedCandle from '../models/CachedCandle.js';
import CachedNews from '../models/CachedNews.js';
import CachedTelegramSentiment from '../models/CachedTelegramSentiment.js';
import CachedTradingHours from '../models/CachedTradingHours.js';
import CachedSignal from '../models/CachedSignal.js';
import PortfolioItem from '../models/PortfolioItem.js';
import TradingRequest from '../models/TradingRequest.js';
import VirtualPortfolio from '../models/VirtualPortfolio.js';
import RealPortfolio from '../models/RealPortfolio.js';
import Recommendation from '../models/Recommendation.js';
import Company from '../models/Company.js';
import Settings from '../models/Settings.js';
import MigrationStatus from '../models/MigrationStatus.js';
import TradingStrategy from '../models/TradingStrategy.js';
import PortfolioAllocation from '../models/PortfolioAllocation.js';
import PositionStrategy from '../models/PositionStrategy.js';
import PositionExit from '../models/PositionExit.js';
import TriggeredSignal from '../models/TriggeredSignal.js';
import TrainingState from '../models/TrainingState.js';
import BacktestResult from '../models/BacktestResult.js';
import { Op } from 'sequelize';

/**
 * Очистка только тестовых данных (FIGI начинающиеся с TEST_FIGI_ или TEST_)
 */
async function clearTestData() {
  try {
    await sequelize.authenticate();
    console.log('✅ Подключение к БД успешно\n');

    console.log('🧹 Начинаем очистку тестовых данных...\n');

    const testFigiPattern = { [Op.like]: 'TEST_FIGI_%' };
    const testPattern = { [Op.like]: 'TEST_%' };
    const testFigiConditions = {
      [Op.or]: [
        testFigiPattern,
        testPattern
      ]
    };

    let totalDeleted = 0;

    // 1. Сработавшие сигналы
    console.log('⚡ Очистка тестовых сработавших сигналов...');
    const deletedSignals = await TriggeredSignal.destroy({ where: testFigiConditions });
    console.log(`   ✅ Удалено ${deletedSignals} записей`);
    totalDeleted += deletedSignals;

    // 2. Частичные закрытия позиций (через TradingRequest)
    console.log('📊 Очистка тестовых частичных закрытий...');
    const testRequests = await TradingRequest.findAll({
      where: testFigiConditions,
      attributes: ['id']
    });
    const testRequestIds = testRequests.map(r => r.id);
    if (testRequestIds.length > 0) {
      const deletedExits = await PositionExit.destroy({
        where: { tradingRequestId: { [Op.in]: testRequestIds } }
      });
      console.log(`   ✅ Удалено ${deletedExits} записей`);
      totalDeleted += deletedExits;
    }

    // 3. Торговые заявки
    console.log('🎯 Очистка тестовых торговых заявок...');
    const deletedRequests = await TradingRequest.destroy({ where: testFigiConditions });
    console.log(`   ✅ Удалено ${deletedRequests} записей`);
    totalDeleted += deletedRequests;

    // 4. Рекомендации
    console.log('💡 Очистка тестовых рекомендаций...');
    const deletedRecommendations = await Recommendation.destroy({ where: testFigiConditions });
    console.log(`   ✅ Удалено ${deletedRecommendations} записей`);
    totalDeleted += deletedRecommendations;

    // 5. Кешированные свечи
    console.log('📈 Очистка тестовых свечей...');
    const deletedCandles = await CachedCandle.destroy({ where: testFigiConditions });
    console.log(`   ✅ Удалено ${deletedCandles} записей`);
    totalDeleted += deletedCandles;

    // 6. Кешированные сигналы
    console.log('📡 Очистка тестовых сигналов...');
    const deletedCachedSignals = await CachedSignal.destroy({ where: testFigiConditions });
    console.log(`   ✅ Удалено ${deletedCachedSignals} записей`);
    totalDeleted += deletedCachedSignals;

    // 7. Кешированные новости
    console.log('📰 Очистка тестовых новостей...');
    const deletedNews = await CachedNews.destroy({ where: testFigiConditions });
    console.log(`   ✅ Удалено ${deletedNews} записей`);
    totalDeleted += deletedNews;

    // 8. Кешированные инструменты
    console.log('🔧 Очистка тестовых инструментов...');
    const deletedInstruments = await CachedInstrument.destroy({ where: testFigiConditions });
    console.log(`   ✅ Удалено ${deletedInstruments} записей`);
    totalDeleted += deletedInstruments;

    // 9. Позиции в портфелях
    console.log('💼 Очистка тестовых позиций в портфелях...');
    const deletedPortfolioItems = await PortfolioItem.destroy({ where: testFigiConditions });
    console.log(`   ✅ Удалено ${deletedPortfolioItems} записей`);
    totalDeleted += deletedPortfolioItems;

    console.log(`\n✅ Очистка тестовых данных завершена! Всего удалено: ${totalDeleted} записей`);
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Ошибка очистки тестовых данных:', err);
    process.exit(1);
  }
}

async function clearDatabase() {
  try {
    await sequelize.authenticate();
    console.log('✅ Подключение к БД успешно\n');

    console.log('🗑️  Начинаем очистку базы данных...\n');

    // Очищаем таблицы в безопасном порядке (сначала зависимые, потом основные)
    
    // 1. Зависимые таблицы стратегий (самые зависимые)
    console.log('🔗 Очистка зависимых таблиц стратегий...');
    await BacktestResult.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    await PositionStrategy.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    await PortfolioAllocation.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    console.log('   ✅ Зависимые таблицы стратегий очищены');

    // 2. Рекомендации (зависят от TradingStrategy)
    console.log('💡 Очистка рекомендаций...');
    await Recommendation.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    console.log('   ✅ Рекомендации очищены');

    // 3. Сработавшие сигналы (зависят от TradingRequest)
    console.log('⚡ Очистка сработавших сигналов...');
    await TriggeredSignal.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    console.log('   ✅ Сработавшие сигналы очищены');

    // 4. Частичные закрытия позиций (зависят от TradingRequest)
    console.log('📊 Очистка частичных закрытий позиций...');
    await PositionExit.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    console.log('   ✅ Частичные закрытия позиций очищены');

    // 5. Торговые заявки (зависят от TradingStrategy)
    console.log('🎯 Очистка торговых заявок...');
    await TradingRequest.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    console.log('   ✅ Торговые заявки очищены');

    // 5. Стратегии торговли (основная таблица)
    console.log('📈 Очистка торговых стратегий...');
    await TradingStrategy.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    console.log('   ✅ Торговые стратегии очищены');

    // 6. Портфели
    console.log('💼 Очистка портфелей...');
    await RealPortfolio.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    await VirtualPortfolio.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    await PortfolioItem.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    console.log('   ✅ Портфели очищены');

    // 7. Состояние обучения
    console.log('🧠 Очистка состояния обучения...');
    await TrainingState.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    console.log('   ✅ Состояние обучения очищено');

    // 8. Кешированные данные
    console.log('📊 Очистка кешированных данных...');
    await CachedSignal.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    await CachedCandle.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    await CachedNews.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    await CachedTelegramSentiment.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    await CachedTradingHours.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    await CachedInstrument.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    console.log('   ✅ Кешированные данные очищены');

    // 9. Компании
    console.log('🏢 Очистка компаний...');
    await Company.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    console.log('   ✅ Компании очищены');

    // 10. Миграции
    console.log('🔄 Очистка данных миграций...');
    await MigrationStatus.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    console.log('   ✅ Данные миграций очищены');

    // 11. Настройки (опционально - можно закомментировать, если нужно сохранить настройки)
    console.log('⚙️  Очистка настроек...');
    await Settings.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    console.log('   ✅ Настройки очищены');

    console.log('\n✅ База данных полностью очищена!');
    console.log('💡 Для восстановления структуры запустите: npm run init-db');
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Ошибка очистки БД:', err);
    process.exit(1);
  }
}

// Проверяем аргументы командной строки
const args = process.argv.slice(2);
if (args.includes('--test-only') || args.includes('-t')) {
  clearTestData();
} else {
  clearDatabase();
}

