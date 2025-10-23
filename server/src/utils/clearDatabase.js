import sequelize from '../config/database.js';
import CachedInstrument from '../models/CachedInstrument.js';
import CachedCandle from '../models/CachedCandle.js';
import PortfolioItem from '../models/PortfolioItem.js';

async function clearDatabase() {
  try {
    await sequelize.authenticate();
    console.log('DB connected');

    // Truncate tables in safe order
    await CachedCandle.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    await CachedInstrument.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    await PortfolioItem.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });

    console.log('✅ Tables truncated: cached_candles, cached_instruments, portfolio_items');
    process.exit(0);
  } catch (err) {
    console.error('❌ Clear failed:', err);
    process.exit(1);
  }
}

clearDatabase();


