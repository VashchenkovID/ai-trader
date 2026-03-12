# Frontend Project

React приложение на TypeScript с Vite.

## Технологии

- ⚡️ [Vite](https://vitejs.dev/) - быстрый сборщик
- ⚛️ [React](https://react.dev/) - библиотека для UI
- 📘 [TypeScript](https://www.typescriptlang.org/) - типизированный JavaScript
- 🎨 [SCSS](https://sass-lang.com/) - препроцессор CSS
- 🐻 [Zustand](https://zustand-demo.pmnd.rs/) - легковесное управление состоянием
- 🌐 [Axios](https://axios-http.com/) - HTTP клиент
- 🔄 [openapi-typescript-codegen](https://github.com/ferdikoomen/openapi-typescript-codegen) - автогенерация API клиента
- 🎯 [Consta Design System](https://consta.design/libs) - библиотека компонентов (темная тема)
- ✨ [Prettier](https://prettier.io/) - форматирование кода
- 🔍 [ESLint](https://eslint.org/) - линтинг кода
- 🧪 [Jest](https://jestjs.io/) + [React Testing Library](https://testing-library.com/react) - тестирование
- 🪝 [Husky](https://typicode.github.io/husky/) + [lint-staged](https://github.com/okonet/lint-staged) - Git hooks

## Структура проекта

```
frontend/
├── src/
│   ├── api/              # API клиент (сгенерированный и настроенный)
│   │   ├── generated/    # Сгенерированный код (игнорируется в покрытии)
│   │   └── client.ts     # Настроенный клиент API
│   ├── components/       # React компоненты
│   │   └── ErrorBoundary/ # Error Boundary для обработки ошибок
│   ├── services/         # Сервисы (axios конфигурация)
│   ├── store/            # Zustand stores
│   ├── styles/           # SCSS утилиты (константы, функции, миксины)
│   ├── test/             # Настройки для тестов
│   └── __mocks__/        # Моки для тестов
├── public/               # Статические файлы
└── package.json
```

## Установка

```bash
yarn install
# или
npm install
```

После установки запустите Husky для настройки Git hooks:

```bash
yarn prepare
```

## Path Aliases

Проект использует алиасы для удобных импортов:

```typescript
import { Button } from '@components/ErrorBoundary'
import { useApiStore } from '@store/apiStore'
import { getToken } from '@services/api'
import { ApiService } from '@api/client'
import styles from '@styles/mixins'
```

Доступные алиасы:

- `@/*` → `src/*`
- `@components/*` → `src/components/*`
- `@pages/*` → `src/pages/*`
- `@store/*` → `src/store/*`
- `@services/*` → `src/services/*`
- `@api/*` → `src/api/*`
- `@styles/*` → `src/styles/*`
- `@utils/*` → `src/utils/*`
- `@hooks/*` → `src/hooks/*`

## Генерация API клиента

Проект использует `openapi-typescript-codegen` для генерации API клиента.

### Генерация

```bash
yarn generate:api
```

API клиент будет сгенерирован в папке `src/api/generated/` и доступен через `src/api/client.ts`.

### Пример использования

API клиент настроен для автоматической передачи токена из `localStorage`:

```typescript
import { ApiService } from '@api/client'
import type { MessageDto, RoomEntity } from '@api/client'

const messages = await ApiService.messages({
  roomId: 1,
  take: 20,
})

const room: RoomEntity = {
  // поля из API
}
```

Токен автоматически добавляется в заголовки через `OpenAPI.TOKEN`, который читает значение из `localStorage.getItem('token')`.

## Разработка

```bash
yarn dev
# или
npm run dev
```

## Сборка

```bash
yarn build
# или
npm run build
```

## Предпросмотр

```bash
yarn preview
# или
npm run preview
```

## Линтинг и форматирование

### ESLint

Проверка кода:

```bash
yarn lint
```

Автоматическое исправление:

```bash
yarn lint:fix
```

### Prettier

Форматирование всего кода:

```bash
yarn format
```

Проверка форматирования:

```bash
yarn format:check
```

### Git Hooks (Husky + lint-staged)

При коммите автоматически запускаются:

- ESLint с автоисправлением для `*.{ts,tsx,js,jsx}`
- Prettier для всех файлов

## Тестирование

Проект использует [Jest](https://jestjs.io/) и [React Testing Library](https://testing-library.com/react) для тестирования.

### Запуск тестов

```bash
# Запуск тестов
yarn test

# Запуск тестов в watch режиме
yarn test:watch

# Запуск тестов с покрытием кода
yarn test:coverage

# Запуск тестов для CI/CD
yarn test:ci
```

### Структура тестов

Тесты находятся в папках `__tests__` рядом с тестируемыми файлами:

```
src/
├── components/
│   └── ErrorBoundary/
│       ├── __tests__/
│       │   └── ErrorBoundary.test.tsx
│       └── ErrorBoundary.tsx
├── store/
│   ├── __tests__/
│   │   └── apiStore.test.ts
│   └── apiStore.ts
└── test/
    └── setup.ts
```

### Покрытие кода

Отчет о покрытии генерируется в папке `coverage/`. Откройте `coverage/index.html` в браузере для просмотра.

**Исключения из покрытия:**

- `src/api/generated/**` - сгенерированный код
- `src/App.tsx` - главный компонент
- `src/api/client.ts` - конфигурация клиента
- `src/services/api.ts` - конфигурация axios
- `src/components/ErrorBoundary/index.ts` - только экспорт

**Пороги покрытия:**

- Branches: 70%
- Functions: 70%
- Lines: 70%
- Statements: 70%

## Error Boundary

Проект включает Error Boundary для обработки ошибок React компонентов. Компонент автоматически обернут вокруг приложения в `main.tsx`.

### Использование

```typescript
import ErrorBoundary from '@components/ErrorBoundary'

function App() {
  return (
    <ErrorBoundary fallback={<div>Custom error message</div>}>
      <YourComponent />
    </ErrorBoundary>
  )
}
```

## Работа со стилями

Проект использует SCSS с набором готовых миксинов, функций и констант для создания адаптивных стилей.

### Импорт утилит

```scss
@use '../styles' as *;

// или если файл находится в src/
@use './styles' as *;
```

**Важно:** Проект использует современный модульный синтаксис Sass (`@use` вместо `@import`).

### Медиа-запросы

#### Базовые миксины

```scss
.my-component {
  @include media-breakpoint-mobile {
    padding: 1rem;
    font-size: 14px;
  }

  @include media-breakpoint-deckstop {
    padding: 2rem;
    font-size: 16px;
  }

  @include media-breakpoint-deckstop-small {
    padding: 1.5rem;
  }
}
```

#### Скрытие элементов

```scss
.mobile-only {
  @include media-hide-in-deckstop;
}

.desktop-only {
  @include media-hide-in-mobile;
}
```

#### Брейкпоинты по именам

```scss
.responsive-element {
  @include media-breakpoint-up(sm) {
    // от 537px
  }

  @include media-breakpoint-up(md) {
    // от 768px
  }

  @include media-breakpoint-up(lg) {
    // от 1024px
  }

  @include media-breakpoint-up(xl) {
    // от 1920px
  }
}
```

### Адаптивные значения (Fluid)

#### Миксин `fluid`

Создает плавно изменяющиеся значения между брейкпоинтами:

```scss
.title {
  @include fluid(font-size, 14px, 16px, 18px, 20px);
}

.container {
  @include fluid(padding, 10px, 20px, 30px, 40px);
  @include fluid(margin-top, 20px);
}
```

#### Функция `px-to-adaptive`

Создает адаптивные значения для CSS переменных:

```scss
:root {
  --space-m: #{px-to-adaptive(16px)};
}
```

#### Миксин `fluidImportant`

То же самое, но с `!important`:

```scss
.override {
  @include fluidImportant(width, 100px, 200px, 300px, 400px);
}
```

#### Функция `calc-clamp`

Создает clamp() значение для плавного изменения размера:

```scss
.dynamic-size {
  font-size: calc-clamp(14px, 24px);
}
```

### Функции для работы с единицами

#### Конвертация единиц

```scss
.element {
  font-size: px-to-rem(16px);
  width: rem-to-px(2rem);
  width: px2vw(100px);
  margin: px2rem(20px);
}
```

#### Утилиты

```scss
.value {
  $number: strip-unit(16px);
  $number: strip-units(24px);
}
```

### Брейкпоинты

Доступные брейкпоинты определены в `$grid-breakpoints`:

- `x`: 320px
- `xs`: 375px
- `sm`: 537px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1920px

### Примеры использования

#### Адаптивный компонент

```scss
@use '../styles' as *;

.card {
  padding: 1rem;
  border-radius: 8px;

  @include fluid(font-size, 14px, 16px, 18px, 20px);
  @include fluid(padding, 10px, 15px, 20px, 24px);

  @include media-breakpoint-mobile {
    margin-bottom: 1rem;
  }

  @include media-breakpoint-deckstop {
    margin-bottom: 2rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }
}
```

#### Конвертация единиц

```scss
@use '../styles' as *;

.container {
  width: px-to-rem(1200px);
  max-width: px2vw(1920px);
  padding: px2rem(20px);
}
```

## Настройка темы Consta

Проект использует темную тему Consta Design System с кастомными адаптивными переменными. Все размерные переменные (отступы, размеры текста, графика) адаптируются:

- **Мобильные (до 536px):** фиксированные `rem` значения
- **Десктопные (от 537px):** адаптивные значения через `clamp` с `vw`

Переменные темы находятся в `src/styles/consta-dark-theme.scss` и автоматически применяются через классы Consta.

## Кастомная SCSS дизайн-система (v1)

В проекте добавлена собственная дизайн-система на SCSS (без внешней UI-библиотеки) с базовыми primitives:

- `Button`
- `Input`
- `Textarea`
- `Select`
- `Checkbox`
- `Radio`
- `Switch`

Импорт:

```typescript
import { Button, Input, Select } from '@components/ui'
```

### Responsive contract

- **Mobile (до `md`)**: статичные размеры (фиксированные токены).
- **Desktop (от `md`)**: адаптивное масштабирование через `px-to-adaptive` и миксины.

### Где лежит foundation

- `src/styles/const.variables.scss` — токены и брейкпоинты
- `src/styles/functions.scss` — функции адаптивности
- `src/styles/mixins.scss` — медиамиксины и fluid-правила
- `src/index.scss` — глобальные semantic CSS variables и reset
