import sequelize from '../config/database.js';
import CachedInstrument from '../models/CachedInstrument.js';
import CachedCandle from '../models/CachedCandle.js';
import CachedNews from '../models/CachedNews.js';
import CachedTelegramSentiment from '../models/CachedTelegramSentiment.js';
import CachedTradingHours from '../models/CachedTradingHours.js';
import PortfolioItem from '../models/PortfolioItem.js';
import TradingRequest from '../models/TradingRequest.js';
import VirtualPortfolio from '../models/VirtualPortfolio.js';
import Recommendation from '../models/Recommendation.js';
import Company from '../models/Company.js';
import Settings from '../models/Settings.js';
import MigrationStatus from '../models/MigrationStatus.js';

async function clearDatabase() {
  try {
    await sequelize.authenticate();
    console.log('✅ Подключение к БД успешно\n');

    console.log('🗑️  Начинаем очистку базы данных...\n');

    // Очищаем таблицы в безопасном порядке (сначала зависимые, потом основные)
    
    // 1. Кешированные данные
    console.log('📊 Очистка кешированных данных...');
    await CachedCandle.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    await CachedNews.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    await CachedTelegramSentiment.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    await CachedTradingHours.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    await CachedInstrument.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    console.log('   ✅ Кешированные данные очищены');

    // 2. Торговые данные
    console.log('🎯 Очистка торговых данных...');
    await TradingRequest.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    await VirtualPortfolio.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    await PortfolioItem.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    console.log('   ✅ Торговые данные очищены');

    // 3. Рекомендации и компании
    console.log('💡 Очистка рекомендаций и компаний...');
    await Recommendation.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    await Company.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    console.log('   ✅ Рекомендации и компании очищены');

    // 4. Миграции
    console.log('🔄 Очистка данных миграций...');
    await MigrationStatus.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    console.log('   ✅ Данные миграций очищены');

    // 5. Настройки (опционально - можно закомментировать, если нужно сохранить настройки)
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


