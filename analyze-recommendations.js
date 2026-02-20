const fs = require('fs');

// Пороги автоторговли
// Вариант 1: Рекомендуемые настройки в БД
const SETTINGS_VARIANT_1 = {
    minConfidence: 0.7,
    minScore: 0.65,
    minAgreement: 0.6,
    holdMinConfidence: 0.7 * 0.8, // 0.56
    holdMinScore: 0.65 * 0.8      // 0.52
};

// Вариант 2: Значения по умолчанию из кода (если настройки не найдены)
const SETTINGS_VARIANT_2 = {
    minConfidence: 0.85,
    minScore: 0.8,
    minAgreement: 0.6,
    holdMinConfidence: 0.85 * 0.8, // 0.68
    holdMinScore: 0.8 * 0.8         // 0.64
};

// Вариант 3: Сниженные пороги (после обсуждения с пользователем)
const SETTINGS_VARIANT_3 = {
    minConfidence: 0.7,
    minScore: 0.6,  // Снижено с 0.65
    minAgreement: 0.6,
    holdMinConfidence: 0.7 * 0.8, // 0.56
    holdMinScore: 0.6 * 0.8       // 0.48
};

function checkRecommendation(rec, settings) {
    const { recommendation, confidence, score, analysis } = rec;
    const agreement = analysis?.agreement ?? null;
    
    const isBuyOrSell = recommendation === 'BUY' || recommendation === 'SELL';
    const isHold = recommendation === 'HOLD';
    
    // Проверка confidence
    let meetsConfidence = false;
    if (isBuyOrSell) {
        meetsConfidence = confidence >= settings.minConfidence;
    } else if (isHold) {
        meetsConfidence = confidence >= settings.holdMinConfidence;
    }
    
    // Проверка score
    let meetsScore = false;
    if (recommendation === 'BUY') {
        meetsScore = score >= settings.minScore;
    } else if (recommendation === 'SELL') {
        // Для SELL нужен низкий score (но это не используется в текущей логике для создания заявок)
        meetsScore = true; // Пока не проверяем для SELL
    } else if (isHold) {
        meetsScore = score >= settings.holdMinScore;
    }
    
    // Проверка agreement
    const meetsAgreement = agreement !== null && agreement >= settings.minAgreement;
    
    const passes = meetsConfidence && meetsScore && meetsAgreement;
    
    return {
        passes,
        meetsConfidence,
        meetsScore,
        meetsAgreement,
        confidence,
        score,
        agreement,
        recommendation
    };
}

function analyzeRecommendations(recommendations, settings, variantName) {
    const results = {
        total: recommendations.length,
        passed: 0,
        failed: 0,
        byRecommendation: {
            BUY: { total: 0, passed: 0, failed: 0 },
            SELL: { total: 0, passed: 0, failed: 0 },
            HOLD: { total: 0, passed: 0, failed: 0 }
        },
        passedRecommendations: [],
        failedByReason: {
            confidence: 0,
            score: 0,
            agreement: 0,
            multiple: 0
        }
    };
    
    recommendations.forEach(rec => {
        const check = checkRecommendation(rec, settings);
        const type = rec.recommendation;
        
        results.byRecommendation[type].total++;
        
        if (check.passes) {
            results.passed++;
            results.byRecommendation[type].passed++;
            results.passedRecommendations.push({
                figi: rec.figi,
                ticker: rec.ticker,
                name: rec.name,
                recommendation: type,
                confidence: check.confidence,
                score: check.score,
                agreement: check.agreement
            });
        } else {
            results.failed++;
            results.byRecommendation[type].failed++;
            
            // Подсчет причин отказа
            const reasons = [];
            if (!check.meetsConfidence) reasons.push('confidence');
            if (!check.meetsScore) reasons.push('score');
            if (!check.meetsAgreement) reasons.push('agreement');
            
            if (reasons.length === 1) {
                results.failedByReason[reasons[0]]++;
            } else {
                results.failedByReason.multiple++;
            }
        }
    });
    
    return {
        variant: variantName,
        settings,
        ...results
    };
}

// Чтение файла
console.log('Чтение файла result.json...');
const data = JSON.parse(fs.readFileSync('result.json', 'utf8'));
console.log(`Загружено рекомендаций: ${data.length}\n`);

// Анализ с разными вариантами настроек
console.log('='.repeat(80));
console.log('АНАЛИЗ РЕКОМЕНДАЦИЙ ДЛЯ АВТОТОРГОВЛИ');
console.log('='.repeat(80));
console.log();

const variants = [
    { name: 'Вариант 1: Рекомендуемые настройки (minConfidence=0.7, minScore=0.65)', settings: SETTINGS_VARIANT_1 },
    { name: 'Вариант 2: Значения по умолчанию (minConfidence=0.85, minScore=0.8)', settings: SETTINGS_VARIANT_2 },
    { name: 'Вариант 3: Сниженные пороги (minConfidence=0.7, minScore=0.6)', settings: SETTINGS_VARIANT_3 }
];

variants.forEach(variant => {
    const result = analyzeRecommendations(data, variant.settings, variant.name);
    
    console.log(variant.name);
    console.log('-'.repeat(80));
    console.log(`Всего рекомендаций: ${result.total}`);
    console.log(`✅ Прошло проверку: ${result.passed} (${(result.passed / result.total * 100).toFixed(2)}%)`);
    console.log(`❌ Не прошло: ${result.failed} (${(result.failed / result.total * 100).toFixed(2)}%)`);
    console.log();
    
    console.log('По типам рекомендаций:');
    ['BUY', 'SELL', 'HOLD'].forEach(type => {
        const stats = result.byRecommendation[type];
        if (stats.total > 0) {
            const passRate = (stats.passed / stats.total * 100).toFixed(2);
            console.log(`  ${type}: ${stats.passed}/${stats.total} прошло (${passRate}%)`);
        }
    });
    console.log();
    
    console.log('Причины отказа:');
    console.log(`  - Низкая confidence: ${result.failedByReason.confidence}`);
    console.log(`  - Низкий score: ${result.failedByReason.score}`);
    console.log(`  - Низкая agreement: ${result.failedByReason.agreement}`);
    console.log(`  - Несколько причин: ${result.failedByReason.multiple}`);
    console.log();
    
    if (result.passedRecommendations.length > 0) {
        console.log(`✅ Подходящие рекомендации (первые 10):`);
        result.passedRecommendations.slice(0, 10).forEach(rec => {
            console.log(`  ${rec.ticker} (${rec.name}): ${rec.recommendation}, confidence=${rec.confidence.toFixed(3)}, score=${rec.score.toFixed(3)}, agreement=${rec.agreement?.toFixed(3) ?? 'N/A'}`);
        });
        if (result.passedRecommendations.length > 10) {
            console.log(`  ... и еще ${result.passedRecommendations.length - 10} рекомендаций`);
        }
    } else {
        console.log('❌ Нет подходящих рекомендаций');
    }
    
    console.log();
    console.log('='.repeat(80));
    console.log();
});

// Сохранение результатов
const allResults = variants.map(v => analyzeRecommendations(data, v.settings, v.name));
fs.writeFileSync('recommendations-analysis.json', JSON.stringify(allResults, null, 2));
console.log('Результаты сохранены в recommendations-analysis.json');

