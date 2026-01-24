/**
 * Утилиты для кросс-валидации
 */

/**
 * K-fold кросс-валидация
 * @param {Array} features - Массив фичей
 * @param {Array} labels - Массив меток
 * @param {number} k - Количество фолдов (по умолчанию 5)
 * @param {boolean} shuffle - Перемешивать ли данные (по умолчанию true)
 * @param {boolean} stratified - Использовать ли стратификацию (по умолчанию false)
 * @returns {Array} - Массив фолдов [{train: {features, labels}, test: {features, labels}}, ...]
 */
export function kFoldSplit(features, labels, k = 5, shuffle = true, stratified = false) {
    if (features.length !== labels.length) {
        throw new Error(`Features and labels must have the same length`);
    }

    if (features.length === 0) {
        return [];
    }

    if (k < 2 || k > features.length) {
        throw new Error(`k must be between 2 and ${features.length}, got ${k}`);
    }

    // Создаем индексы
    let indices = Array.from({ length: features.length }, (_, i) => i);

    if (stratified) {
        // Стратифицированное разделение
        return stratifiedKFoldSplit(features, labels, k, shuffle);
    }

    // Обычное разделение
    if (shuffle) {
        indices = shuffleArray(indices);
    }

    const foldSize = Math.floor(features.length / k);
    const folds = [];

    for (let i = 0; i < k; i++) {
        const testStart = i * foldSize;
        const testEnd = i === k - 1 ? features.length : (i + 1) * foldSize;

        const testIndices = indices.slice(testStart, testEnd);
        const trainIndices = [
            ...indices.slice(0, testStart),
            ...indices.slice(testEnd)
        ];

        folds.push({
            train: {
                features: trainIndices.map(idx => features[idx]),
                labels: trainIndices.map(idx => labels[idx])
            },
            test: {
                features: testIndices.map(idx => features[idx]),
                labels: testIndices.map(idx => labels[idx])
            }
        });
    }

    return folds;
}

/**
 * Стратифицированная K-fold кросс-валидация
 */
function stratifiedKFoldSplit(features, labels, k, shuffle) {
    // Группируем по классам
    const classGroups = {};
    for (let i = 0; i < labels.length; i++) {
        const label = labels[i];
        if (!classGroups[label]) {
            classGroups[label] = [];
        }
        classGroups[label].push(i);
    }

    // Перемешиваем индексы в каждой группе
    for (const label in classGroups) {
        if (shuffle) {
            classGroups[label] = shuffleArray(classGroups[label]);
        }
    }

    // Создаем фолды для каждого класса
    const classFolds = {};
    for (const [label, indices] of Object.entries(classGroups)) {
        const foldSize = Math.floor(indices.length / k);
        classFolds[label] = [];
        
        for (let i = 0; i < k; i++) {
            const start = i * foldSize;
            const end = i === k - 1 ? indices.length : (i + 1) * foldSize;
            classFolds[label].push(indices.slice(start, end));
        }
    }

    // Объединяем фолды
    const folds = [];
    for (let i = 0; i < k; i++) {
        const testIndices = [];
        const trainIndices = [];

        for (const [label, labelFolds] of Object.entries(classFolds)) {
            testIndices.push(...labelFolds[i]);
            for (let j = 0; j < k; j++) {
                if (j !== i) {
                    trainIndices.push(...labelFolds[j]);
                }
            }
        }

        // Перемешиваем, если нужно
        if (shuffle) {
            testIndices.sort(() => Math.random() - 0.5);
            trainIndices.sort(() => Math.random() - 0.5);
        }

        folds.push({
            train: {
                features: trainIndices.map(idx => features[idx]),
                labels: trainIndices.map(idx => labels[idx])
            },
            test: {
                features: testIndices.map(idx => features[idx]),
                labels: testIndices.map(idx => labels[idx])
            }
        });
    }

    return folds;
}

/**
 * Перемешивание массива (Fisher-Yates shuffle)
 */
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Выполнение кросс-валидации с функцией обучения
 * @param {Array} features - Массив фичей
 * @param {Array} labels - Массив меток
 * @param {Function} trainFunction - Функция обучения (features, labels) => Promise<{metrics}>
 * @param {Object} options - Опции
 * @returns {Promise<Object>} - Результаты кросс-валидации
 */
export async function performCrossValidation(features, labels, trainFunction, options = {}) {
    const {
        k = 5,
        shuffle = true,
        stratified = false
    } = options;

    const folds = kFoldSplit(features, labels, k, shuffle, stratified);
    const results = [];

    for (let i = 0; i < folds.length; i++) {
        const fold = folds[i];
        try {
            const metrics = await trainFunction(fold.train.features, fold.train.labels, fold.test.features, fold.test.labels);
            results.push({
                fold: i + 1,
                metrics,
                trainSize: fold.train.features.length,
                testSize: fold.test.features.length
            });
        } catch (error) {
            console.error(`Error in fold ${i + 1}:`, error);
            results.push({
                fold: i + 1,
                error: error.message,
                trainSize: fold.train.features.length,
                testSize: fold.test.features.length
            });
        }
    }

    // Вычисляем средние метрики
    const validResults = results.filter(r => r.metrics && !r.error);
    if (validResults.length === 0) {
        return {
            success: false,
            error: 'All folds failed',
            results
        };
    }

    const avgMetrics = {};
    const metricKeys = Object.keys(validResults[0].metrics);
    
    for (const key of metricKeys) {
        const values = validResults.map(r => r.metrics[key]).filter(v => typeof v === 'number');
        if (values.length > 0) {
            avgMetrics[key] = {
                mean: values.reduce((sum, v) => sum + v, 0) / values.length,
                std: calculateStdDev(values),
                min: Math.min(...values),
                max: Math.max(...values)
            };
        }
    }

    return {
        success: true,
        k,
        totalFolds: folds.length,
        successfulFolds: validResults.length,
        results,
        averageMetrics: avgMetrics
    };
}

/**
 * Расчет стандартного отклонения
 */
function calculateStdDev(values) {
    if (values.length === 0) return 0;
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
}

