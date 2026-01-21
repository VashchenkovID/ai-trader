/**
 * Конфигурация Jest для тестирования
 * Поддержка ES modules
 */

export default {
    testEnvironment: 'node',
    transform: {},
    extensionsToTreatAsEsm: ['.js'],
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
    testMatch: [
        '**/__tests__/**/*.test.js',
        '**/?(*.)+(spec|test).js'
    ],
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/**/*.test.js',
        '!src/**/__tests__/**',
        '!src/**/node_modules/**'
    ],
    coverageDirectory: 'coverage',
    verbose: true,
    testTimeout: 10000,
    // Игнорируем node_modules
    modulePathIgnorePatterns: ['<rootDir>/node_modules/'],
    // Настройки для ES modules
    globals: {
        'ts-jest': {
            useESM: true
        }
    }
};

