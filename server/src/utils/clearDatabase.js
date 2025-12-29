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
import MacroIndicator from '../models/MacroIndicator.js';
import PortfolioRebalancing from '../models/PortfolioRebalancing.js';
import InstrumentStats from '../models/InstrumentStats.js';
import CorrelationCache from '../models/CorrelationCache.js';
import FundamentalData from '../models/FundamentalData.js';
import Asset from '../models/Asset.js';
import PortfolioAnalysis from '../models/PortfolioAnalysis.js';
import TrailingStop from '../models/TrailingStop.js';
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
      
      // Очистка трейлинг-стопов для тестовых заявок
      const deletedTrailingStops = await TrailingStop.destroy({
        where: { tradingRequestId: { [Op.in]: testRequestIds } }
      });
      console.log(`   ✅ Удалено ${deletedTrailingStops} трейлинг-стопов`);
      totalDeleted += deletedTrailingStops;
    }
    
    // 2.1. Трейлинг-стопы по FIGI
    console.log('🛑 Очистка тестовых трейлинг-стопов...');
    const deletedTrailingStopsByFigi = await TrailingStop.destroy({ where: testFigiConditions });
    console.log(`   ✅ Удалено ${deletedTrailingStopsByFigi} записей`);
    totalDeleted += deletedTrailingStopsByFigi;

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
    
    // 10. Статистика инструментов
    console.log('📊 Очистка тестовой статистики инструментов...');
    const deletedInstrumentStats = await InstrumentStats.destroy({ where: testFigiConditions });
    console.log(`   ✅ Удалено ${deletedInstrumentStats} записей`);
    totalDeleted += deletedInstrumentStats;
    
    // 10.1. Активы
    console.log('📊 Очистка тестовых активов...');
    const deletedAssets = await Asset.destroy({ where: testFigiConditions });
    console.log(`   ✅ Удалено ${deletedAssets} записей`);
    totalDeleted += deletedAssets;
    
    // 10.2. Фундаментальные данные
    console.log('📊 Очистка тестовых фундаментальных данных...');
    const deletedFundamentalData = await FundamentalData.destroy({ where: testFigiConditions });
    console.log(`   ✅ Удалено ${deletedFundamentalData} записей`);
    totalDeleted += deletedFundamentalData;
    
    // 11. Кеш корреляций (по figi1 или figi2)
    console.log('🔗 Очистка тестового кеша корреляций...');
    const deletedCorrelations = await CorrelationCache.destroy({
      where: {
        [Op.or]: [
          { figi1: testFigiPattern },
          { figi1: testPattern },
          { figi2: testFigiPattern },
          { figi2: testPattern }
        ]
      }
    });
    console.log(`   ✅ Удалено ${deletedCorrelations} записей`);
    totalDeleted += deletedCorrelations;
    
    // 12. Анализ портфеля (может содержать ссылки на тестовые инструменты в метаданных)
    // Очищаем только если в метаданных есть тестовые FIGI - это сложно проверить,
    // поэтому пропускаем или очищаем все, если нужно
    // console.log('📈 Очистка тестового анализа портфеля...');
    // (пропускаем, так как сложно определить тестовые данные в JSONB)

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

    // 1.1. Макроиндикаторы (независимая таблица)
    console.log('📊 Очистка макроиндикаторов...');
    await MacroIndicator.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    console.log('   ✅ Макроиндикаторы очищены');
    
    // 1.1.1. Активы (независимая таблица)
    console.log('📊 Очистка активов...');
    await Asset.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    console.log('   ✅ Активы очищены');
    
    // 1.1.2. Фундаментальные данные (независимая таблица)
    console.log('📊 Очистка фундаментальных данных...');
    await FundamentalData.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    console.log('   ✅ Фундаментальные данные очищены');
    
    // 1.2. История ребалансировок портфеля (независимая таблица)
    console.log('🔄 Очистка истории ребалансировок портфеля...');
    await PortfolioRebalancing.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    console.log('   ✅ История ребалансировок портфеля очищена');
    
    // 1.3. Статистика инструментов (независимая таблица)
    console.log('📊 Очистка статистики инструментов...');
    await InstrumentStats.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    console.log('   ✅ Статистика инструментов очищена');
    
    // 1.4. Кеш корреляций (независимая таблица)
    console.log('🔗 Очистка кеша корреляций...');
    await CorrelationCache.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    console.log('   ✅ Кеш корреляций очищен');
    
    // 1.5. Анализ портфеля (независимая таблица)
    console.log('📈 Очистка анализа портфеля...');
    await PortfolioAnalysis.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    console.log('   ✅ Анализ портфеля очищен');
    
    // 1.6. Трейлинг-стопы (зависят от TradingRequest)
    console.log('🛑 Очистка трейлинг-стопов...');
    await TrailingStop.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    console.log('   ✅ Трейлинг-стопы очищены');

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
    
    // 4.1. Трейлинг-стопы уже очищены выше, но на всякий случай еще раз (если есть зависимости)
    // (уже очищено выше в разделе 1.6)

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
    // CorrelationCache уже очищен выше в разделе 1.4
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
    // ВАЖНО: При очистке удаляются ВСЕ настройки, включая:
    // - Настройки портфеля и торговли
    // - Настройки планировщика
    // - Настройки нейросети
    // - Настройки формулы Келли (kelly_enabled, kelly_conservative_factor, kelly_min_trades, kelly_volatility_period)
    // - Настройки макро-данных
    // - Настройки масштабирования капитала
    // - Настройки риск-менеджмента
    // - И все остальные настройки
    // Все настройки будут восстановлены при следующем запуске initDatabase через Settings.initializeDefaults() и initializeRecommendedSettings()
    console.log('⚙️  Очистка настроек...');
    await Settings.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    console.log('   ✅ Настройки очищены (включая настройки формулы Келли)');

    // 12. Индексы автоматически удаляются при удалении таблиц (CASCADE)
    // Но можно явно удалить пользовательские индексы, если нужно
    // (обычно не требуется, так как они удаляются вместе с таблицами)
    console.log('🔍 Индексы будут автоматически удалены при удалении таблиц');

    console.log('\n✅ База данных полностью очищена!');
    console.log('💡 Для восстановления структуры и всех настроек (включая формулу Келли) запустите: npm run init-db');
    
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

