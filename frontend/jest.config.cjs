/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@pages/(.*)$': '<rootDir>/src/pages/$1',
    '^@store/(.*)$': '<rootDir>/src/store/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@api/(.*)$': '<rootDir>/src/api/$1',
    '^@styles/(.*)$': '<rootDir>/src/styles/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@hooks/(.*)$': '<rootDir>/src/hooks/$1',
    // Обработка CSS файлов - должно быть в конце, чтобы обрабатывать все CSS импорты
    // Обрабатывает как абсолютные, так и относительные пути
    '\\.(css|scss|sass|less)$': '<rootDir>/src/__mocks__/styleMock.js',
  },
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{ts,tsx}',
    '!src/test/**',
    '!src/**/__tests__/**',
    '!src/api/generated/**', // Игнорируем сгенерированный код
    '!src/api/tradingRequestsExtras.ts',
    '!src/utils/labels.ts',
    '!src/utils/recommendationFormat.ts',
    '!src/main.tsx',
    '!src/App.tsx',
    '!src/pages/**',
    '!src/components/**',
    '!src/providers/**',
    '!src/theme/**',
    '!src/navigation/**',
    '!src/vite-env.d.ts',
    '!src/api/config.ts', // import.meta в Jest без Vite
    '!src/hooks/useVirtualPortfolioOverview.ts', // тонкая обёртка над API; покрывается страницей / e2e
    '!src/store/systemStatusStore.ts', // WebSocket — интеграционные сценарии вне jsdom
    '!src/api/client.ts', // Игнорируем client.ts
    '!src/services/api.ts', // Игнорируем api.ts
    '!src/components/ErrorBoundary/index.ts', // Игнорируем index.ts (только экспорт)
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      statements: 70,
      lines: 70,
      functions: 68,
      branches: 45,
    },
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react-jsx',
          types: ['jest', '@testing-library/jest-dom'],
          esModuleInterop: true,
        },
      },
    ],
    '^.+\\.(js|jsx|mjs)$': [
      'babel-jest',
      {
        presets: [
          [
            '@babel/preset-env',
            {
              targets: {
                node: 'current',
              },
              modules: 'commonjs',
            },
          ],
        ],
      },
    ],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'mjs'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/coverage/'],
}

module.exports = config
