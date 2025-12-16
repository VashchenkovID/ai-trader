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

async function clearDatabase() {
  try {
    await sequelize.authenticate();
    console.log('✅ Подключение к БД успешно\n');

    console.log('🗑️  Начинаем очистку базы данных...\n');

    // Очищаем таблицы в безопасном порядке (сначала зависимые, потом основные)
    
    // 1. Зависимые таблицы стратегий (самые зависимые)
    console.log('🔗 Очистка зависимых таблиц стратегий...');
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

clearDatabase();


