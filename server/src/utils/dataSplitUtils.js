/**
 * Утилиты для разделения данных на train/validation/test
 */

/**
 * Разделение данных на train, validation и test множества
 * @param {Array} features - Массив фичей
 * @param {Array} labels - Массив меток
 * @param {Object} options - Опции разделения
 * @param {number} options.trainRatio - Доля обучающей выборки (по умолчанию 0.7)
 * @param {number} options.validationRatio - Доля валидационной выборки (по умолчанию 0.15)
 * @param {number} options.testRatio - Доля тестовой выборки (по умолчанию 0.15)
 * @param {boolean} options.shuffle - Перемешивать ли данные перед разделением (по умолчанию true)
 * @param {boolean} options.timeBased - Использовать ли временное разделение (по умолчанию false)
 * @returns {Object} - {train: {features, labels}, validation: {features, labels}, test: {features, labels}}
 */
export function trainValidationTestSplit(features, labels, options = {}) {
    const {
        trainRatio = 0.7,
        validationRatio = 0.15,
        testRatio = 0.15,
        shuffle = true,
        timeBased = false
    } = options;

    // Проверка корректности пропорций
    const totalRatio = trainRatio + validationRatio + testRatio;
    if (Math.abs(totalRatio - 1.0) > 0.001) {
        throw new Error(`Sum of ratios must equal 1.0, got ${totalRatio}`);
    }

    if (features.length !== labels.length) {
        throw new Error(`Features and labels must have the same length. Got ${features.length} and ${labels.length}`);
    }

    if (features.length === 0) {
        return {
            train: { features: [], labels: [] },
            validation: { features: [], labels: [] },
            test: { features: [], labels: [] }
        };
    }

    // Создаем индексы
    let indices = Array.from({ length: features.length }, (_, i) => i);

    // Перемешиваем, если нужно (но не для временных данных)
    if (shuffle && !timeBased) {
        indices = shuffleArray(indices);
    }

    // Вычисляем границы разделения
    const trainEnd = Math.floor(features.length * trainRatio);
    const validationEnd = trainEnd + Math.floor(features.length * validationRatio);

    // Разделяем индексы
    const trainIndices = indices.slice(0, trainEnd);
    const validationIndices = indices.slice(trainEnd, validationEnd);
    const testIndices = indices.slice(validationEnd);

    // Создаем разделенные данные
    const train = {
        features: trainIndices.map(i => features[i]),
        labels: trainIndices.map(i => labels[i])
    };

    const validation = {
        features: validationIndices.map(i => features[i]),
        labels: validationIndices.map(i => labels[i])
    };

    const test = {
        features: testIndices.map(i => features[i]),
        labels: testIndices.map(i => labels[i])
    };

    return { train, validation, test };
}

/**
 * Перемешивание массива (Fisher-Yates shuffle)
 * @param {Array} array - Массив для перемешивания
 * @returns {Array} - Перемешанный массив
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
 * Стратифицированное разделение (сохраняет пропорции классов)
 * @param {Array} features - Массив фичей
 * @param {Array} labels - Массив меток
 * @param {Object} options - Опции разделения
 * @returns {Object} - {train: {features, labels}, validation: {features, labels}, test: {features, labels}}
 */
export function stratifiedSplit(features, labels, options = {}) {
    const {
        trainRatio = 0.7,
        validationRatio = 0.15,
        testRatio = 0.15
    } = options;

    if (features.length !== labels.length) {
        throw new Error(`Features and labels must have the same length`);
    }

    // Группируем по классам
    const classGroups = {};
    for (let i = 0; i < labels.length; i++) {
        const label = labels[i];
        if (!classGroups[label]) {
            classGroups[label] = { features: [], labels: [], indices: [] };
        }
        classGroups[label].features.push(features[i]);
        classGroups[label].labels.push(labels[i]);
        classGroups[label].indices.push(i);
    }

    // Разделяем каждый класс отдельно
    const train = { features: [], labels: [] };
    const validation = { features: [], labels: [] };
    const test = { features: [], labels: [] };

    for (const [label, group] of Object.entries(classGroups)) {
        const groupSplit = trainValidationTestSplit(
            group.features,
            group.labels,
            { trainRatio, validationRatio, testRatio, shuffle: true, timeBased: false }
        );

        train.features.push(...groupSplit.train.features);
        train.labels.push(...groupSplit.train.labels);
        validation.features.push(...groupSplit.validation.features);
        validation.labels.push(...groupSplit.validation.labels);
        test.features.push(...groupSplit.test.features);
        test.labels.push(...groupSplit.test.labels);
    }

    // Перемешиваем результаты
    const trainShuffled = shufflePairs(train.features, train.labels);
    const validationShuffled = shufflePairs(validation.features, validation.labels);
    const testShuffled = shufflePairs(test.features, test.labels);

    return {
        train: { features: trainShuffled.features, labels: trainShuffled.labels },
        validation: { features: validationShuffled.features, labels: validationShuffled.labels },
        test: { features: testShuffled.features, labels: testShuffled.labels }
    };
}

/**
 * Перемешивание пар features-labels
 */
function shufflePairs(features, labels) {
    const pairs = features.map((f, i) => ({ feature: f, label: labels[i] }));
    const shuffled = shuffleArray(pairs);
    return {
        features: shuffled.map(p => p.feature),
        labels: shuffled.map(p => p.label)
    };
}

/**
 * Временное разделение (для временных рядов)
 * @param {Array} features - Массив фичей
 * @param {Array} labels - Массив меток
 * @param {Object} options - Опции разделения
 * @returns {Object} - {train: {features, labels}, validation: {features, labels}, test: {features, labels}}
 */
export function timeBasedSplit(features, labels, options = {}) {
    return trainValidationTestSplit(features, labels, {
        ...options,
        shuffle: false,
        timeBased: true
    });
}

