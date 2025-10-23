import TinkoffApiService from './services/TinkoffApiService.js';
import DataPreparationService from './services/DataPreparationService.js';
import NewsAnalysisService from './services/NewsAnalysisService.js';
import MacroEconomicService from './services/MacroEconomicService.js';
import CompanySyncService from './services/CompanySyncService.js';

async function analyzeTrainingData() {
    console.log('📊 Анализ данных для обучения нейросети...\n');

    try {
        // 1. Анализ исторических данных
        console.log('1️⃣ Анализ исторических данных от Тинькофф...');
        
        const testFigi = 'BBG004730N88'; // Сбербанк
        const days = 365; // Год данных
        
        try {
            const candles = await TinkoffApiService.getCandles(testFigi, days);
            
            if (candles && candles.length > 0) {
                console.log(`✅ Получено ${candles.length} свечей за ${days} дней`);
                
                // Анализ качества данных
                const priceRange = {
                    min: Math.min(...candles.map(c => c.low)),
                    max: Math.max(...candles.map(c => c.high)),
                    avg: candles.reduce((sum, c) => sum + c.close, 0) / candles.length
                };
                
                console.log(`📈 Ценовой диапазон: ${priceRange.min.toFixed(2)} - ${priceRange.max.toFixed(2)}`);
                console.log(`📊 Средняя цена: ${priceRange.avg.toFixed(2)}`);
                
                // Проверка на пропуски данных
                const dateGaps = [];
                for (let i = 1; i < candles.length; i++) {
                    const prevDate = new Date(candles[i-1].time);
                    const currDate = new Date(candles[i].time);
                    const diffDays = (currDate - prevDate) / (1000 * 60 * 60 * 24);
                    
                    if (diffDays > 1.5) { // Более 1.5 дня между свечами
                        dateGaps.push({
                            from: prevDate.toISOString().split('T')[0],
                            to: currDate.toISOString().split('T')[0],
                            gap: diffDays
                        });
                    }
                }
                
                if (dateGaps.length > 0) {
                    console.log(`⚠️ Найдено ${dateGaps.length} пропусков в данных`);
                    dateGaps.slice(0, 3).forEach(gap => {
                        console.log(`   ${gap.from} → ${gap.to} (${gap.gap.toFixed(1)} дней)`);
                    });
                } else {
                    console.log('✅ Пропусков в данных не найдено');
                }
                
            } else {
                console.log('❌ Не удалось получить исторические данные');
            }
        } catch (error) {
            console.log('❌ Ошибка получения исторических данных:', error.message);
        }
        
        console.log('');

        // 2. Анализ технических индикаторов
        console.log('2️⃣ Анализ технических индикаторов...');
        
        try {
            const candles = await TinkoffApiService.getCandles(testFigi, 100);
            
            if (candles && candles.length > 0) {
                const prices = candles.map(c => c.close);
                const volumes = candles.map(c => c.volume);
                
                // Получаем все индикаторы
                const indicators = OptimizedAnalysisService.getAllIndicators(prices);
                
                console.log('📊 Доступные технические индикаторы:');
                Object.keys(indicators).forEach(key => {
                    const values = indicators[key];
                    if (Array.isArray(values) && values.length > 0) {
                        const validValues = values.filter(v => v !== null && v !== undefined && !isNaN(v));
                        if (validValues.length > 0) {
                            const avg = validValues.reduce((sum, v) => sum + v, 0) / validValues.length;
                            console.log(`   ${key}: ${validValues.length} значений, среднее: ${avg.toFixed(2)}`);
                        }
                    }
                });
                
                // Тестируем подготовку фичей
                const features = OptimizedAnalysisService.prepareFeatures(indicators, prices.length - 1);
                console.log(`🔧 Подготовлено ${features.length} технических фичей`);
                
            } else {
                console.log('❌ Недостаточно данных для анализа индикаторов');
            }
        } catch (error) {
            console.log('❌ Ошибка анализа технических индикаторов:', error.message);
        }
        
        console.log('');

        // 3. Анализ подготовки данных для обучения
        console.log('3️⃣ Анализ подготовки данных для обучения...');
        
        try {
            const candles = await TinkoffApiService.getCandles(testFigi, 200);
            
            if (candles && candles.length >= 100) {
                const lookbackPeriod = 60;
                const predictionHorizon = 5;
                
                const { features, labels } = await DataPreparationService.prepareTrainingData(
                    candles,
                    lookbackPeriod,
                    predictionHorizon,
                    testFigi
                );
                
                console.log(`📊 Подготовлено ${features.length} примеров для обучения`);
                console.log(`📏 Размер фичей: ${features[0]?.length || 0}`);
                
                // Анализ распределения классов
                const positiveCount = labels.filter(l => l === 1).length;
                const negativeCount = labels.filter(l => l === 0).length;
                const totalCount = labels.length;
                
                console.log(`📈 Распределение классов:`);
                console.log(`   Положительные (рост >1%): ${positiveCount} (${(positiveCount/totalCount*100).toFixed(1)}%)`);
                console.log(`   Отрицательные (рост ≤1%): ${negativeCount} (${(negativeCount/totalCount*100).toFixed(1)}%)`);
                
                // Проверка на дисбаланс классов
                const imbalance = Math.abs(positiveCount - negativeCount) / totalCount;
                if (imbalance > 0.3) {
                    console.log(`⚠️ Обнаружен дисбаланс классов: ${(imbalance*100).toFixed(1)}%`);
                    console.log('💡 Рекомендуется использовать балансировку данных');
                } else {
                    console.log('✅ Классы сбалансированы');
                }
                
                // Анализ качества фичей
                const featureStats = features[0]?.map((_, index) => {
                    const values = features.map(f => f[index]).filter(v => !isNaN(v) && v !== null);
                    if (values.length === 0) return null;
                    
                    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
                    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
                    const std = Math.sqrt(variance);
                    
                    return {
                        index,
                        mean: mean.toFixed(3),
                        std: std.toFixed(3),
                        min: Math.min(...values).toFixed(3),
                        max: Math.max(...values).toFixed(3),
                        zeroCount: values.filter(v => v === 0).length
                    };
                }) || [];
                
                console.log(`🔍 Статистика фичей (первые 10):`);
                featureStats.slice(0, 10).forEach((stat, i) => {
                    if (stat) {
                        console.log(`   Фича ${i}: mean=${stat.mean}, std=${stat.std}, range=[${stat.min}, ${stat.max}], zeros=${stat.zeroCount}`);
                    }
                });
                
            } else {
                console.log('❌ Недостаточно данных для подготовки обучения');
            }
        } catch (error) {
            console.log('❌ Ошибка подготовки данных:', error.message);
        }
        
        console.log('');

        // 4. Анализ дополнительных источников данных
        console.log('4️⃣ Анализ дополнительных источников данных...');
        
        // Новостные данные
        try {
            console.log('📰 Проверка новостных данных...');
            const news = await NewsAnalysisService.fetchNews(testFigi, { limit: 5 });
            console.log(`✅ Получено ${news.length} новостей`);
            
            if (news.length > 0) {
                const avgRelevance = news.reduce((sum, n) => sum + n.relevance, 0) / news.length;
                console.log(`📊 Средняя релевантность: ${avgRelevance.toFixed(3)}`);
            }
        } catch (error) {
            console.log('❌ Ошибка получения новостей:', error.message);
        }
        
        // Макроэкономические данные
        try {
            console.log('🌍 Проверка макроэкономических данных...');
            const macroData = await MacroEconomicService.getCurrentData();
            console.log(`✅ Получены макроэкономические данные: ${Object.keys(macroData).length} показателей`);
        } catch (error) {
            console.log('❌ Ошибка получения макроэкономических данных:', error.message);
        }
        
        // Данные компаний
        try {
            console.log('🏢 Проверка данных компаний...');
            const companies = await CompanySyncService.getAllActiveCompanies();
            console.log(`✅ В базе ${companies.length} активных компаний`);
        } catch (error) {
            console.log('❌ Ошибка получения данных компаний:', error.message);
        }
        
        console.log('');

        // 5. Рекомендации по улучшению данных
        console.log('5️⃣ Рекомендации по улучшению данных...');
        
        const recommendations = [];
        
        // Проверка объема данных
        try {
            const candles = await TinkoffApiService.getCandles(testFigi, 365);
            if (candles && candles.length < 200) {
                recommendations.push('📈 Увеличить период сбора данных (минимум 200 дней)');
            }
        } catch (error) {
            recommendations.push('📈 Улучшить стабильность получения исторических данных');
        }
        
        // Проверка новостных данных
        try {
            const news = await NewsAnalysisService.fetchNews(testFigi, { limit: 1 });
            if (news.length === 0) {
                recommendations.push('📰 Настроить получение новостных данных');
            }
        } catch (error) {
            recommendations.push('📰 Исправить интеграцию с NewsAPI');
        }
        
        // Проверка макроэкономических данных
        try {
            const macroData = await MacroEconomicService.getCurrentData();
            if (Object.keys(macroData).length < 5) {
                recommendations.push('🌍 Расширить макроэкономические показатели');
            }
        } catch (error) {
            recommendations.push('🌍 Настроить получение макроэкономических данных');
        }
        
        if (recommendations.length > 0) {
            console.log('💡 Рекомендации:');
            recommendations.forEach(rec => console.log(`   ${rec}`));
        } else {
            console.log('✅ Все источники данных работают корректно');
        }
        
        console.log('\n✅ Анализ данных завершен!');

    } catch (error) {
        console.error('❌ Ошибка анализа данных:', error);
    }
}

// Запускаем анализ
analyzeTrainingData();
