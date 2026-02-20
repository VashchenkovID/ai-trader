/**
 * Скрипт для диагностики проблем с автоторговлей
 * Проверяет настройки и рекомендации в БД
 */

const { Sequelize } = require('sequelize');

// Настройки подключения к БД (из docker-compose или .env)
const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'postgres',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    dialect: 'postgres'
};

async function checkSettings() {
    const sequelize = new Sequelize(DB_CONFIG.database, DB_CONFIG.username, DB_CONFIG.password, {
        host: DB_CONFIG.host,
        port: DB_CONFIG.port,
        dialect: DB_CONFIG.dialect,
        logging: false
    });

    try {
        console.log('Проверка настроек автоторговли...\n');
        
        const [settings] = await sequelize.query(`
            SELECT key, value, "dataType" 
            FROM settings 
            WHERE key LIKE 'auto_trade%'
            ORDER BY key;
        `);

        if (settings.length === 0) {
            console.log('❌ Настройки автоторговли не найдены в БД!');
            console.log('\nСоздайте их командой:');
            console.log(`
docker exec ai-trader-db psql -U postgres -d postgres << 'EOF'
INSERT INTO settings (key, value, description, category, "dataType", "lastUpdated")
VALUES 
    ('auto_trade_enabled', 'true', 'Включить автоматическое создание торговых заявок', 'trading', 'boolean', NOW()),
    ('auto_trade_min_confidence', '0.7', 'Минимальная уверенность модели', 'trading', 'number', NOW()),
    ('auto_trade_min_score', '0.6', 'Минимальный score для BUY', 'trading', 'number', NOW()),
    ('auto_trade_min_agreement', '0.6', 'Минимальная согласованность моделей', 'trading', 'number', NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "lastUpdated" = NOW();
EOF
            `);
            return;
        }

        console.log('Найденные настройки:');
        settings.forEach(setting => {
            console.log(`  ${setting.key}: ${setting.value} (${setting.dataType})`);
        });

        // Проверяем значения
        const autoTradeEnabled = settings.find(s => s.key === 'auto_trade_enabled');
        const minConfidence = parseFloat(settings.find(s => s.key === 'auto_trade_min_confidence')?.value || '0.85');
        const minScore = parseFloat(settings.find(s => s.key === 'auto_trade_min_score')?.value || '0.8');
        const minAgreement = parseFloat(settings.find(s => s.key === 'auto_trade_min_agreement')?.value || '0.6');

        console.log('\nПроверка значений:');
        console.log(`  auto_trade_enabled: ${autoTradeEnabled?.value} (должно быть 'true' или true)`);
        console.log(`  auto_trade_min_confidence: ${minConfidence}`);
        console.log(`  auto_trade_min_score: ${minScore}`);
        console.log(`  auto_trade_min_agreement: ${minAgreement}`);

        const holdMinConfidence = minConfidence * 0.8;
        const holdMinScore = minScore * 0.8;

        console.log('\nПороги для HOLD рекомендаций:');
        console.log(`  holdMinConfidence: ${holdMinConfidence.toFixed(3)}`);
        console.log(`  holdMinScore: ${holdMinScore.toFixed(3)}`);
        console.log(`  minAgreement: ${minAgreement}`);

        // Проверяем рекомендации
        console.log('\nПроверка рекомендаций...\n');
        
        const [recommendations] = await sequelize.query(`
            SELECT 
                figi, 
                ticker, 
                name,
                recommendation,
                confidence,
                score,
                analysis,
                "analysisDate"
            FROM "Recommendations"
            WHERE "isActive" = true
            ORDER BY "analysisDate" DESC
            LIMIT 10;
        `);

        console.log(`Найдено ${recommendations.length} активных рекомендаций (показываем первые 10):\n`);

        let passedCount = 0;
        recommendations.forEach(rec => {
            const isHold = rec.recommendation === 'HOLD';
            const analysis = typeof rec.analysis === 'string' ? JSON.parse(rec.analysis) : (rec.analysis || {});
            const agreement = analysis.agreement;

            const meetsConfidence = isHold 
                ? rec.confidence >= holdMinConfidence
                : rec.confidence >= minConfidence;
            
            const meetsScore = isHold
                ? rec.score >= holdMinScore
                : rec.score >= minScore;
            
            const meetsAgreement = agreement !== null && agreement !== undefined && agreement >= minAgreement;

            const passes = meetsConfidence && meetsScore && meetsAgreement;

            if (passes) {
                passedCount++;
                console.log(`✅ ${rec.ticker} (${rec.name}):`);
            } else {
                console.log(`❌ ${rec.ticker} (${rec.name}):`);
            }
            
            console.log(`   Recommendation: ${rec.recommendation}`);
            console.log(`   Confidence: ${rec.confidence.toFixed(3)} (порог: ${isHold ? holdMinConfidence.toFixed(3) : minConfidence.toFixed(3)}) ${meetsConfidence ? '✅' : '❌'}`);
            console.log(`   Score: ${rec.score.toFixed(3)} (порог: ${isHold ? holdMinScore.toFixed(3) : minScore.toFixed(3)}) ${meetsScore ? '✅' : '❌'}`);
            console.log(`   Agreement: ${agreement !== null && agreement !== undefined ? agreement.toFixed(3) : 'null'} (порог: ${minAgreement}) ${meetsAgreement ? '✅' : '❌'}`);
            console.log();
        });

        console.log(`\nИтого: ${passedCount} из ${recommendations.length} рекомендаций проходят проверку`);

        // Проверяем существующие заявки
        console.log('\nПроверка существующих заявок...\n');
        
        const [requests] = await sequelize.query(`
            SELECT COUNT(*) as count, status
            FROM "TradingRequests"
            WHERE status IN ('pending', 'approved')
            GROUP BY status;
        `);

        if (requests.length === 0) {
            console.log('Нет активных заявок (pending или approved)');
        } else {
            requests.forEach(req => {
                console.log(`  ${req.status}: ${req.count}`);
            });
        }

    } catch (error) {
        console.error('Ошибка:', error.message);
        console.error(error.stack);
    } finally {
        await sequelize.close();
    }
}

// Запуск
checkSettings().catch(console.error);

