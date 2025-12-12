/**
 * Тесты для утилиты sequelizeUtils
 * Запуск: node server/src/utils/testSequelizeUtils.js
 */

import { sequelizeToJSON, getField, getFields, isSequelizeModel } from './sequelizeUtils.js';

// Моки для Sequelize моделей
function createMockSequelizeModel(data) {
    return {
        dataValues: { ...data },
        toJSON: function() {
            return { ...this.dataValues };
        },
        get: function(field) {
            return this.dataValues[field];
        },
        _options: {
            isNewRecord: false
        }
    };
}

function createMockSequelizeModelWithAssociations(data, associations = {}) {
    const model = createMockSequelizeModel(data);
    const json = model.toJSON();
    
    // Добавляем ассоциации
    for (const [key, value] of Object.entries(associations)) {
        json[key] = value;
    }
    
    model.toJSON = function() {
        return json;
    };
    
    return model;
}

function createMockRawObject(data) {
    return {
        dataValues: { ...data },
        _previousDataValues: { ...data },
        uniqno: 1,
        _changed: new Set(),
        _options: {
            isNewRecord: false,
            raw: true
        }
    };
}

function createMockPlainObject(data) {
    return { ...data };
}

// Тестовые данные
const testData = {
    figi: 'BBG004730N88',
    ticker: 'SBER',
    name: 'Сбер Банк',
    sector: 'financial',
    lastPrice: 306.5,
    currency: 'RUB'
};

const testDataWithNested = {
    ...testData,
    strategy: {
        id: 1,
        name: 'Консервативная',
        type: 'conservative'
    }
};

console.log('🧪 Запуск тестов для sequelizeUtils...\n');

let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✅ ${name}`);
        passedTests++;
    } catch (error) {
        console.error(`❌ ${name}`);
        console.error(`   Ошибка: ${error.message}`);
        failedTests++;
    }
}

// ============================================================================
// Тесты для sequelizeToJSON
// ============================================================================

console.log('📦 Тесты sequelizeToJSON:\n');

test('Конвертация Sequelize модели в JSON', () => {
    const model = createMockSequelizeModel(testData);
    const result = sequelizeToJSON(model);
    
    if (!result || typeof result !== 'object') {
        throw new Error('Результат должен быть объектом');
    }
    
    if (result.figi !== testData.figi) {
        throw new Error(`Ожидался figi=${testData.figi}, получен ${result.figi}`);
    }
    
    if (result.ticker !== testData.ticker) {
        throw new Error(`Ожидался ticker=${testData.ticker}, получен ${result.ticker}`);
    }
    
    // Проверяем, что это не Sequelize модель
    if (typeof result.toJSON === 'function') {
        throw new Error('Результат не должен быть Sequelize моделью');
    }
});

test('Конвертация массива Sequelize моделей', () => {
    const models = [
        createMockSequelizeModel({ ...testData, figi: 'FIGI1', ticker: 'TICK1' }),
        createMockSequelizeModel({ ...testData, figi: 'FIGI2', ticker: 'TICK2' }),
        createMockSequelizeModel({ ...testData, figi: 'FIGI3', ticker: 'TICK3' })
    ];
    
    const result = sequelizeToJSON(models);
    
    if (!Array.isArray(result)) {
        throw new Error('Результат должен быть массивом');
    }
    
    if (result.length !== 3) {
        throw new Error(`Ожидался массив из 3 элементов, получен из ${result.length}`);
    }
    
    result.forEach((item, index) => {
        if (typeof item.toJSON === 'function') {
            throw new Error(`Элемент ${index} не должен быть Sequelize моделью`);
        }
    });
});

test('Конвертация модели с вложенными ассоциациями', () => {
    const strategyModel = createMockSequelizeModel({
        id: 1,
        name: 'Консервативная',
        type: 'conservative'
    });
    
    const model = createMockSequelizeModelWithAssociations(testData, {
        strategy: strategyModel
    });
    
    const result = sequelizeToJSON(model);
    
    if (!result.strategy) {
        throw new Error('Вложенная ассоциация strategy должна быть обработана');
    }
    
    if (typeof result.strategy.toJSON === 'function') {
        throw new Error('Вложенная ассоциация не должна быть Sequelize моделью');
    }
    
    if (result.strategy.name !== 'Консервативная') {
        throw new Error(`Ожидалось strategy.name='Консервативная', получено '${result.strategy.name}'`);
    }
});

test('Конвертация raw объекта (dataValues)', () => {
    const rawModel = createMockRawObject(testData);
    const result = sequelizeToJSON(rawModel);
    
    if (!result || typeof result !== 'object') {
        throw new Error('Результат должен быть объектом');
    }
    
    if (result.figi !== testData.figi) {
        throw new Error(`Ожидался figi=${testData.figi}, получен ${result.figi}`);
    }
});

test('Конвертация обычного объекта (без изменений)', () => {
    const plainObj = createMockPlainObject(testData);
    const result = sequelizeToJSON(plainObj);
    
    if (result !== plainObj) {
        throw new Error('Обычный объект должен возвращаться без изменений');
    }
});

test('Обработка null и undefined', () => {
    if (sequelizeToJSON(null) !== null) {
        throw new Error('null должен возвращать null');
    }
    
    if (sequelizeToJSON(undefined) !== null) {
        throw new Error('undefined должен возвращать null');
    }
});

test('Обработка пустого массива', () => {
    const result = sequelizeToJSON([]);
    
    if (!Array.isArray(result)) {
        throw new Error('Пустой массив должен возвращать массив');
    }
    
    if (result.length !== 0) {
        throw new Error('Пустой массив должен оставаться пустым');
    }
});

// ============================================================================
// Тесты для getField
// ============================================================================

console.log('\n📋 Тесты getField:\n');

test('Извлечение поля из Sequelize модели через toJSON()', () => {
    const model = createMockSequelizeModel(testData);
    const figi = getField(model, 'figi');
    
    if (figi !== testData.figi) {
        throw new Error(`Ожидался figi=${testData.figi}, получен ${figi}`);
    }
});

test('Извлечение поля из raw объекта через dataValues', () => {
    const rawModel = createMockRawObject(testData);
    const ticker = getField(rawModel, 'ticker');
    
    if (ticker !== testData.ticker) {
        throw new Error(`Ожидался ticker=${testData.ticker}, получен ${ticker}`);
    }
});

test('Извлечение поля из обычного объекта', () => {
    const plainObj = createMockPlainObject(testData);
    const name = getField(plainObj, 'name');
    
    if (name !== testData.name) {
        throw new Error(`Ожидалось name=${testData.name}, получено ${name}`);
    }
});

test('Извлечение несуществующего поля (возврат defaultValue)', () => {
    const model = createMockSequelizeModel(testData);
    const missing = getField(model, 'missingField', 'DEFAULT');
    
    if (missing !== 'DEFAULT') {
        throw new Error(`Ожидалось значение по умолчанию 'DEFAULT', получено '${missing}'`);
    }
});

test('Извлечение несуществующего поля без defaultValue (возврат null)', () => {
    const model = createMockSequelizeModel(testData);
    const missing = getField(model, 'missingField');
    
    if (missing !== null) {
        throw new Error(`Ожидалось null для несуществующего поля, получено '${missing}'`);
    }
});

test('Извлечение поля из null/undefined', () => {
    const result1 = getField(null, 'figi', 'DEFAULT');
    const result2 = getField(undefined, 'ticker', 'DEFAULT');
    
    if (result1 !== 'DEFAULT' || result2 !== 'DEFAULT') {
        throw new Error('Для null/undefined должен возвращаться defaultValue');
    }
});

test('Извлечение поля через get() метод', () => {
    const model = createMockSequelizeModel(testData);
    const sector = getField(model, 'sector');
    
    if (sector !== testData.sector) {
        throw new Error(`Ожидался sector=${testData.sector}, получен ${sector}`);
    }
});

// ============================================================================
// Тесты для getFields
// ============================================================================

console.log('\n📊 Тесты getFields:\n');

test('Извлечение нескольких полей из Sequelize модели', () => {
    const model = createMockSequelizeModel(testData);
    const fields = getFields(model, ['figi', 'ticker', 'name']);
    
    if (fields.figi !== testData.figi) {
        throw new Error(`Ожидался figi=${testData.figi}, получен ${fields.figi}`);
    }
    
    if (fields.ticker !== testData.ticker) {
        throw new Error(`Ожидался ticker=${testData.ticker}, получен ${fields.ticker}`);
    }
    
    if (fields.name !== testData.name) {
        throw new Error(`Ожидалось name=${testData.name}, получено ${fields.name}`);
    }
});

test('Извлечение полей из обычного объекта', () => {
    const plainObj = createMockPlainObject(testData);
    const fields = getFields(plainObj, ['sector', 'currency']);
    
    if (fields.sector !== testData.sector) {
        throw new Error(`Ожидался sector=${testData.sector}, получен ${fields.sector}`);
    }
    
    if (fields.currency !== testData.currency) {
        throw new Error(`Ожидалась currency=${testData.currency}, получена ${fields.currency}`);
    }
});

test('Извлечение несуществующих полей', () => {
    const model = createMockSequelizeModel(testData);
    const fields = getFields(model, ['figi', 'missing1', 'ticker', 'missing2']);
    
    if (fields.figi !== testData.figi) {
        throw new Error('Существующее поле должно быть извлечено');
    }
    
    if (fields.ticker !== testData.ticker) {
        throw new Error('Существующее поле должно быть извлечено');
    }
    
    if (fields.missing1 !== null || fields.missing2 !== null) {
        throw new Error('Несуществующие поля должны быть null');
    }
});

test('Извлечение полей из null/undefined', () => {
    const fields1 = getFields(null, ['figi', 'ticker']);
    const fields2 = getFields(undefined, ['figi', 'ticker']);
    
    if (Object.keys(fields1).length !== 0 || Object.keys(fields2).length !== 0) {
        throw new Error('Для null/undefined должен возвращаться пустой объект');
    }
});

test('Извлечение полей с пустым массивом полей', () => {
    const model = createMockSequelizeModel(testData);
    const fields = getFields(model, []);
    
    if (Object.keys(fields).length !== 0) {
        throw new Error('Для пустого массива полей должен возвращаться пустой объект');
    }
});

// ============================================================================
// Тесты для isSequelizeModel
// ============================================================================

console.log('\n🔍 Тесты isSequelizeModel:\n');

test('Определение Sequelize модели с toJSON()', () => {
    const model = createMockSequelizeModel(testData);
    
    if (!isSequelizeModel(model)) {
        throw new Error('Модель с toJSON() должна определяться как Sequelize модель');
    }
});

test('Определение Sequelize модели с get() и dataValues', () => {
    const model = createMockSequelizeModel(testData);
    
    if (!isSequelizeModel(model)) {
        throw new Error('Модель с get() и dataValues должна определяться как Sequelize модель');
    }
});

test('Определение raw объекта как Sequelize модели', () => {
    const rawModel = createMockRawObject(testData);
    
    if (!isSequelizeModel(rawModel)) {
        throw new Error('Raw объект с _options должен определяться как Sequelize модель');
    }
});

test('Обычный объект не должен определяться как Sequelize модель', () => {
    const plainObj = createMockPlainObject(testData);
    
    if (isSequelizeModel(plainObj)) {
        throw new Error('Обычный объект не должен определяться как Sequelize модель');
    }
});

test('null/undefined не должны определяться как Sequelize модель', () => {
    if (isSequelizeModel(null)) {
        throw new Error('null не должен определяться как Sequelize модель');
    }
    
    if (isSequelizeModel(undefined)) {
        throw new Error('undefined не должен определяться как Sequelize модель');
    }
});

test('Примитивные типы не должны определяться как Sequelize модель', () => {
    if (isSequelizeModel('string')) {
        throw new Error('Строка не должна определяться как Sequelize модель');
    }
    
    if (isSequelizeModel(123)) {
        throw new Error('Число не должно определяться как Sequelize модель');
    }
    
    if (isSequelizeModel(true)) {
        throw new Error('Булево значение не должно определяться как Sequelize модель');
    }
});

// ============================================================================
// Интеграционные тесты
// ============================================================================

console.log('\n🔗 Интеграционные тесты:\n');

test('Комплексный тест: конвертация модели с последующим извлечением полей', () => {
    const model = createMockSequelizeModel(testData);
    const json = sequelizeToJSON(model);
    
    const figi = getField(json, 'figi');
    const ticker = getField(json, 'ticker');
    const fields = getFields(json, ['name', 'sector', 'lastPrice']);
    
    if (figi !== testData.figi || ticker !== testData.ticker) {
        throw new Error('Извлечение полей из конвертированного JSON не работает');
    }
    
    if (fields.name !== testData.name || fields.sector !== testData.sector) {
        throw new Error('Извлечение нескольких полей из конвертированного JSON не работает');
    }
});

test('Комплексный тест: работа с массивом моделей', () => {
    const models = [
        createMockSequelizeModel({ ...testData, figi: 'FIGI1', ticker: 'TICK1' }),
        createMockSequelizeModel({ ...testData, figi: 'FIGI2', ticker: 'TICK2' })
    ];
    
    const jsonArray = sequelizeToJSON(models);
    
    jsonArray.forEach((item, index) => {
        const figi = getField(item, 'figi');
        const expectedFigi = `FIGI${index + 1}`;
        
        if (figi !== expectedFigi) {
            throw new Error(`Ожидался figi=${expectedFigi}, получен ${figi}`);
        }
    });
});

// ============================================================================
// Итоги
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log(`📊 Итоги тестирования:`);
console.log(`   ✅ Пройдено: ${passedTests}`);
console.log(`   ❌ Провалено: ${failedTests}`);
console.log(`   📈 Успешность: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`);
console.log('='.repeat(60));

if (failedTests === 0) {
    console.log('\n🎉 Все тесты пройдены успешно!');
    process.exit(0);
} else {
    console.log('\n⚠️ Некоторые тесты провалены. Проверьте ошибки выше.');
    process.exit(1);
}

