# 🎨 План реализации редизайна фронтенда

## 🎯 Цель
Создать современную дизайн-систему "Modern Minimal Trading" с темной темой, glassmorphism эффектами и качественными анимациями.

**Стиль:** Гибридный (минимализм для структуры, информативность для данных)  
**Тема:** Темная по умолчанию, светлая опционально  
**Glassmorphism:** Выборочно (модалки, dropdown, карточки)  
**Градиенты:** Минимально (CTA, акценты)  
**Анимации:** Умеренно (обязательные + качественные hover)

---

## 📁 Структура файлов

```
client/src/
├── styles/
│   ├── design-system/
│   │   ├── colors.ts          # Цветовая палитра
│   │   ├── typography.ts      # Типографика
│   │   ├── spacing.ts         # Отступы и размеры
│   │   ├── shadows.ts         # Тени и эффекты
│   │   ├── animations.ts      # Анимации и transitions
│   │   └── themes.ts          # Темная/светлая тема
│   ├── components/
│   │   ├── buttons.css        # Стили кнопок
│   │   ├── inputs.css        # Стили форм
│   │   ├── cards.css         # Стили карточек
│   │   ├── modals.css        # Стили модальных окон
│   │   └── tables.css        # Стили таблиц
│   └── global.css            # Глобальные стили
├── components/
│   ├── ui/                    # UI-kit компоненты
│   │   ├── Button/
│   │   │   ├── Button.tsx
│   │   │   └── Button.module.css
│   │   ├── Input/
│   │   ├── Select/
│   │   ├── Card/
│   │   ├── Modal/
│   │   ├── Table/
│   │   ├── Badge/
│   │   ├── ProgressBar/
│   │   └── Skeleton/
│   └── ...
└── contexts/
    └── ThemeContext.tsx      # Контекст темы
```

---

## 🎨 Фаза 1: Дизайн-система (1-2 недели)

### 1.1 Цветовая палитра

**Файл:** `client/src/styles/design-system/colors.ts`

```typescript
// Базовые цвета (темная тема)
export const darkColors = {
  // Фоны
  background: {
    primary: '#0A0A0F',      // Основной фон
    secondary: '#0F0F1A',    // Вторичный фон
    tertiary: '#1A1A24',     // Третичный фон (карточки)
    elevated: '#242430',     // Поднятые элементы
  },
  
  // Поверхности
  surface: {
    default: '#1A1A24',
    hover: '#242430',
    active: '#2A2A38',
    glass: 'rgba(26, 26, 36, 0.8)', // Для glassmorphism
  },
  
  // Текст
  text: {
    primary: '#F9FAFB',      // Основной текст
    secondary: '#9CA3AF',    // Вторичный текст
    tertiary: '#6B7280',     // Третичный текст
    disabled: '#4B5563',     // Отключенный текст
  },
  
  // Акценты
  accent: {
    primary: '#3B82F6',      // Синий (основной)
    primaryHover: '#2563EB',
    success: '#10B981',      // Зеленый (прибыль)
    error: '#EF4444',         // Красный (убыток)
    warning: '#F59E0B',       // Желтый (предупреждение)
    info: '#06B6D4',          // Голубой (информация)
  },
  
  // Границы
  border: {
    default: 'rgba(255, 255, 255, 0.1)',
    hover: 'rgba(255, 255, 255, 0.2)',
    focus: 'rgba(59, 130, 246, 0.5)',
  },
  
  // Градиенты
  gradients: {
    primary: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
    success: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
    error: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
    glass: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(16, 185, 129, 0.1) 100%)',
  },
};

// Светлая тема (базовая реализация)
export const lightColors = {
  // ... аналогичная структура
};
```

**Задачи:**
- [ ] Создать файл `colors.ts` с полной палитрой
- [ ] Определить все семантические цвета
- [ ] Добавить градиенты для акцентов
- [ ] Создать цвета для glassmorphism

### 1.2 Типографика

**Файл:** `client/src/styles/design-system/typography.ts`

```typescript
export const typography = {
  // Шрифты
  fontFamily: {
    primary: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    mono: "'JetBrains Mono', 'Courier New', monospace', // Для чисел
  },
  
  // Размеры
  fontSize: {
    xs: '12px',
    sm: '14px',
    base: '16px',
    lg: '18px',
    xl: '20px',
    '2xl': '24px',
    '3xl': '30px',
    '4xl': '36px',
    '5xl': '48px',
    '6xl': '64px',
  },
  
  // Веса
  fontWeight: {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  
  // Высота строк
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
  
  // Стили для чисел (моноширинный)
  number: {
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 500,
    letterSpacing: '0.02em',
  },
};
```

**Задачи:**
- [ ] Создать файл `typography.ts`
- [ ] Подключить шрифты Inter и JetBrains Mono
- [ ] Определить scale для заголовков и текста
- [ ] Создать стили для финансовых чисел

### 1.3 Spacing & Layout

**Файл:** `client/src/styles/design-system/spacing.ts`

```typescript
export const spacing = {
  // Отступы (4px grid)
  0: '0',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
  20: '80px',
  24: '96px',
};

export const borderRadius = {
  none: '0',
  sm: '4px',
  base: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  full: '9999px',
};

export const layout = {
  // Grid система
  grid: {
    columns: 12,
    gap: spacing[4], // 16px
  },
  
  // Контейнеры
  container: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },
  
  // Z-index слои
  zIndex: {
    base: 0,
    dropdown: 1000,
    sticky: 1020,
    fixed: 1030,
    modalBackdrop: 1040,
    modal: 1050,
    popover: 1060,
    tooltip: 1070,
  },
};
```

**Задачи:**
- [ ] Создать файл `spacing.ts`
- [ ] Определить систему отступов (4px grid)
- [ ] Определить border-radius для всех элементов
- [ ] Создать z-index систему

### 1.4 Shadows & Effects

**Файл:** `client/src/styles/design-system/shadows.ts`

```typescript
export const shadows = {
  // Тени для depth
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
  base: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
  md: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
  lg: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
  xl: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
  
  // Glow эффекты
  glow: {
    primary: '0 0 20px rgba(59, 130, 246, 0.3)',
    success: '0 0 20px rgba(16, 185, 129, 0.3)',
    error: '0 0 20px rgba(239, 68, 68, 0.3)',
  },
  
  // Glassmorphism blur
  glass: {
    backdrop: 'blur(12px)',
    backdropStrong: 'blur(20px)',
  },
};
```

**Задачи:**
- [ ] Создать файл `shadows.ts`
- [ ] Определить систему теней
- [ ] Добавить glow эффекты для акцентов
- [ ] Определить blur для glassmorphism

### 1.5 Анимации

**Файл:** `client/src/styles/design-system/animations.ts`

```typescript
export const animations = {
  // Длительности
  duration: {
    fast: '150ms',
    base: '200ms',
    slow: '300ms',
    slower: '500ms',
  },
  
  // Easing функции
  easing: {
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    spring: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },
  
  // Стандартные transitions
  transitions: {
    default: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
    colors: 'color 200ms, background-color 200ms, border-color 200ms',
    transform: 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1)',
    opacity: 'opacity 200ms ease-in-out',
  },
  
  // Keyframes
  keyframes: {
    fadeIn: '@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }',
    slideUp: '@keyframes slideUp { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }',
    scaleIn: '@keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }',
    pulse: '@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }',
  },
};
```

**Задачи:**
- [ ] Создать файл `animations.ts`
- [ ] Определить стандартные transitions
- [ ] Создать keyframes для анимаций
- [ ] Определить easing функции

### 1.6 Темы

**Файл:** `client/src/styles/design-system/themes.ts`

```typescript
import { darkColors } from './colors';
import { lightColors } from './colors';

export const themes = {
  dark: {
    ...darkColors,
    name: 'dark',
  },
  light: {
    ...lightColors,
    name: 'light',
  },
};

export type Theme = typeof themes.dark;
```

**Задачи:**
- [ ] Создать файл `themes.ts`
- [ ] Объединить все части дизайн-системы
- [ ] Создать типы для TypeScript

---

## 🧩 Фаза 2: UI-kit компоненты (2-3 недели)

### 2.1 Button компонент

**Файлы:**
- `client/src/components/ui/Button/Button.tsx`
- `client/src/components/ui/Button/Button.module.css`

**Варианты:**
- Primary (градиент)
- Secondary (outline)
- Ghost (прозрачный)
- Danger (красный)
- Success (зеленый)

**Размеры:**
- Small (32px)
- Medium (40px)
- Large (48px)

**Состояния:**
- Default, Hover, Active, Disabled, Loading

**Задачи:**
- [ ] Создать компонент Button
- [ ] Реализовать все варианты и размеры
- [ ] Добавить состояния (hover, active, disabled, loading)
- [ ] Добавить анимации (ripple или scale)
- [ ] Добавить иконки (опционально)

### 2.2 Input компонент

**Файлы:**
- `client/src/components/ui/Input/Input.tsx`
- `client/src/components/ui/Input/Input.module.css`

**Варианты:**
- Text, Number, Email, Password
- С иконкой (left/right)
- С label и placeholder
- С ошибкой

**Задачи:**
- [ ] Создать компонент Input
- [ ] Реализовать все типы
- [ ] Добавить состояния (focus, error, disabled)
- [ ] Добавить glow эффект при focus
- [ ] Добавить поддержку иконок

### 2.3 Select компонент

**Файлы:**
- `client/src/components/ui/Select/Select.tsx`
- `client/src/components/ui/Select/Select.module.css`

**Особенности:**
- Glassmorphism dropdown
- Поиск внутри (для длинных списков)
- Множественный выбор
- Группировка опций

**Задачи:**
- [ ] Создать компонент Select
- [ ] Реализовать glassmorphism dropdown
- [ ] Добавить поиск
- [ ] Добавить анимацию открытия/закрытия
- [ ] Поддержка множественного выбора

### 2.4 Card компонент

**Файлы:**
- `client/src/components/ui/Card/Card.tsx`
- `client/src/components/ui/Card/Card.module.css`

**Варианты:**
- Default (solid)
- Glass (glassmorphism)
- Interactive (с hover эффектом)
- Elevated (с тенью)

**Задачи:**
- [ ] Создать компонент Card
- [ ] Реализовать варианты (solid, glass)
- [ ] Добавить hover эффекты (lift + glow)
- [ ] Поддержка header, body, footer
- [ ] Адаптивность

### 2.5 Modal компонент

**Файлы:**
- `client/src/components/ui/Modal/Modal.tsx`
- `client/src/components/ui/Modal/Modal.module.css`

**Особенности:**
- Glassmorphism backdrop и content
- Плавная анимация открытия/закрытия
- Размеры: sm, md, lg, xl, fullscreen
- Закрытие по Escape и клику вне

**Задачи:**
- [x] Создать компонент Modal
- [x] Реализовать glassmorphism эффекты
- [x] Добавить анимации (fade + scale)
- [x] Поддержка разных размеров
- [x] Управление фокусом и accessibility

### 2.6 Table компонент

**Файлы:**
- `client/src/components/ui/Table/Table.tsx`
- `client/src/components/ui/Table/Table.module.css`

**Особенности:**
- Стилизованная таблица
- Сортировка
- Фильтрация
- Виртуализация для больших данных
- Hover эффекты на строках

**Задачи:**
- [x] Создать компонент Table
- [x] Стилизация (solid фон, читаемость)
- [x] Добавить сортировку
- [x] Добавить hover эффекты
- [ ] Виртуализация (опционально)

### 2.7 Badge компонент

**Файлы:**
- `client/src/components/ui/Badge/Badge.tsx`
- `client/src/components/ui/Badge/Badge.module.css`

**Варианты:**
- Success, Error, Warning, Info
- С иконкой
- Размеры: sm, md, lg

**Задачи:**
- [ ] Создать компонент Badge
- [ ] Реализовать цветовые варианты
- [ ] Поддержка иконок

### 2.8 ProgressBar компонент

**Файлы:**
- `client/src/components/ui/ProgressBar/ProgressBar.tsx`
- `client/src/components/ui/ProgressBar/ProgressBar.module.css`

**Особенности:**
- Анимированный прогресс
- Варианты: default, success, error
- С текстом или без

**Задачи:**
- [ ] Создать компонент ProgressBar
- [ ] Добавить анимацию заполнения
- [ ] Цветовые варианты

### 2.9 Skeleton компонент

**Файлы:**
- `client/src/components/ui/Skeleton/Skeleton.tsx`
- `client/src/components/ui/Skeleton/Skeleton.module.css`

**Особенности:**
- Pulse анимация
- Варианты: text, circle, rectangle
- Для loading состояний

**Задачи:**
- [ ] Создать компонент Skeleton
- [ ] Добавить pulse анимацию
- [ ] Разные варианты форм

---

## 🎨 Фаза 3: Применение к страницам (3-4 недели)

### 3.1 Dashboard

**Приоритет:** 🔴 Высокий

**Изменения:**
- Убрать технические виджеты (CacheStatusCard, NeuralNetworksControlCard)
- Упростить отображение статуса обучения (только индикатор)
- Большие карточки с метриками (HeroMetricsCard)
- Glassmorphism для карточек
- Плавные анимации при обновлении данных

**Компоненты для замены:**
- [ ] TradingSummaryCard → новый стиль (glassmorphism)
- [ ] HeroMetricsCard → новый стиль (большие числа)
- [ ] AdvancedMetricsPreview → упростить или скрыть
- [ ] Статус обучения → простой индикатор (Badge)

**Задачи:**
- [ ] Переделать Dashboard с новыми компонентами
- [ ] Убрать технические виджеты
- [ ] Упростить отображение метрик
- [ ] Добавить glassmorphism эффекты
- [ ] Добавить анимации обновления данных

### 3.2 Portfolio

**Приоритет:** 🔴 Высокий

**Изменения:**
- Новый стиль таблицы позиций
- Интерактивные графики (темная тема)
- Карточки позиций с hover эффектами
- Модальное окно для деталей инструмента (glassmorphism)

**Компоненты:**
- [ ] PortfolioPositionsTable → новый стиль Table
- [ ] PortfolioCharts → темная тема для графиков
- [ ] StockDetail → модальное окно вместо страницы

**Задачи:**
- [ ] Применить новый стиль к таблице
- [ ] Обновить графики (темная тема)
- [ ] Переделать StockDetail в модальное окно
- [ ] Добавить hover эффекты

### 3.3 Recommendations

**Приоритет:** 🟡 Средний

**Изменения:**
- Карточки рекомендаций (glassmorphism)
- Крупные CTA кнопки (градиент)
- Упростить отображение (убрать технические детали)
- Фильтры с новым стилем Select

**Компоненты:**
- [ ] RecommendationTemplate → новый стиль Card
- [ ] BuyButton/SellButton → новый стиль Button (градиент)
- [ ] Фильтры → новый Select

**Задачи:**
- [ ] Переделать карточки рекомендаций
- [ ] Обновить кнопки (градиент)
- [ ] Упростить отображение данных
- [ ] Обновить фильтры

### 3.4 TradingRequests

**Приоритет:** 🟡 Средний

**Изменения:**
- Новая стилизация таблицы
- Упростить статусы (Badge компоненты)
- Кнопки действий (новый стиль)

**Задачи:**
- [ ] Применить новый стиль Table
- [ ] Заменить статусы на Badge
- [ ] Обновить кнопки действий

### 3.5 Settings

**Приоритет:** 🔴 Высокий

**Изменения:**
- Вкладки (TabView с новым стилем)
- Группировка настроек
- Новые Input и Select компоненты
- Скрыть продвинутые настройки по умолчанию

**Задачи:**
- [ ] Создать структуру с вкладками
- [ ] Применить новые Input/Select
- [ ] Группировка настроек
- [ ] Скрыть продвинутые настройки

### 3.6 NeuralNetworks (Обучение)

**Приоритет:** 🟢 Низкий

**Изменения:**
- Упростить отображение статуса
- Новый стиль ProgressBar
- Кнопка "Обучить все сети" (градиент)

**Задачи:**
- [ ] Упростить интерфейс
- [ ] Применить новый ProgressBar
- [ ] Обновить кнопки

---

## 🎭 Фаза 4: Полировка (2 недели)

### 4.1 Анимации

**Задачи:**
- [ ] Page transitions между страницами
- [ ] Loading states (Skeleton компоненты)
- [ ] Hover эффекты на всех интерактивных элементах
- [ ] Плавные обновления данных (number transitions)
- [ ] Modal открытие/закрытие анимации

### 4.2 Glassmorphism эффекты

**Задачи:**
- [ ] Применить к модальным окнам
- [ ] Применить к dropdown/select
- [ ] Применить к карточкам Dashboard
- [ ] Оптимизировать производительность (backdrop-filter)

### 4.3 Градиенты

**Задачи:**
- [ ] Применить к Primary кнопкам
- [ ] Применить к акцентным карточкам
- [ ] Добавить hover эффекты с градиентами

### 4.4 Адаптивность

**Задачи:**
- [ ] Mobile-first подход
- [ ] Оптимизация для планшетов
- [ ] Touch-friendly элементы (минимум 44x44px)
- [ ] Swipe жесты (опционально)

---

## 🔧 Фаза 5: Техническая реализация (1 неделя)

### 5.1 Theme Context

**Файл:** `client/src/contexts/ThemeContext.tsx`

**Функциональность:**
- Управление темой (dark/light)
- Сохранение в localStorage
- Переключение темы

**Задачи:**
- [ ] Создать ThemeContext
- [ ] Реализовать переключение темы
- [ ] Сохранение выбора в localStorage
- [ ] Применить тему ко всем компонентам

### 5.2 Глобальные стили

**Файл:** `client/src/styles/global.css`

**Содержимое:**
- CSS переменные для темы
- Сброс стилей
- Базовые стили
- Утилиты

**Задачи:**
- [ ] Создать global.css
- [ ] Определить CSS переменные
- [ ] Добавить базовые стили
- [ ] Подключить шрифты

### 5.3 Интеграция с PrimeReact

**Задачи:**
- [ ] Переопределить стили PrimeReact компонентов
- [ ] Использовать наши компоненты где возможно
- [ ] Кастомизировать PrimeReact тема

---

## 📋 Чек-лист реализации

### Неделя 1-2: Дизайн-система
- [x] Создать структуру папок `styles/design-system/`
- [x] Реализовать `colors.ts`
- [x] Реализовать `typography.ts`
- [x] Реализовать `spacing.ts`
- [x] Реализовать `shadows.ts`
- [x] Реализовать `animations.ts`
- [x] Реализовать `themes.ts`
- [x] Подключить шрифты (Inter, JetBrains Mono)
- [x] Создать `global.css` с CSS переменными
- [x] Создать `ThemeContext` для управления темами
- [x] Интегрировать ThemeProvider в App.tsx

### Неделя 3-4: UI-kit компоненты
- [x] Button компонент (базовая версия готова)
- [ ] Input компонент
- [ ] Select компонент
- [x] Card компонент
- [x] Modal компонент
- [x] Table компонент
- [x] Badge компонент
- [x] ProgressBar компонент
- [x] Skeleton компонент

### Неделя 5-6: Dashboard и Portfolio
- [ ] Переделать Dashboard
- [ ] Переделать Portfolio
- [ ] Применить новые компоненты
- [ ] Добавить glassmorphism эффекты
- [ ] Добавить анимации

### Неделя 7-8: Остальные страницы
- [ ] Переделать Recommendations
- [ ] Переделать TradingRequests
- [ ] Переделать Settings
- [ ] Обновить NeuralNetworks

### Неделя 9-10: Полировка
- [ ] Добавить все анимации
- [ ] Оптимизировать glassmorphism
- [ ] Адаптивность
- [ ] Тестирование

---

## 🚀 Начало работы

### Первые шаги (сегодня):

1. **Создать структуру папок:**
   ```bash
   mkdir -p client/src/styles/design-system
   mkdir -p client/src/components/ui
   mkdir -p client/src/contexts
   ```

2. **Создать базовые файлы:**
   - `client/src/styles/design-system/colors.ts`
   - `client/src/styles/design-system/typography.ts`
   - `client/src/styles/global.css`

3. **Подключить шрифты:**
   - Добавить Inter и JetBrains Mono в `index.html` или через npm

4. **Создать первый компонент:**
   - `client/src/components/ui/Button/Button.tsx`

---

## 📊 Метрики успеха

После реализации должно быть:
- ✅ Единая дизайн-система для всех компонентов
- ✅ Темная тема по умолчанию
- ✅ Glassmorphism эффекты на модалках и dropdown
- ✅ Градиенты на CTA кнопках
- ✅ Плавные анимации на всех интерактивных элементах
- ✅ Адаптивный дизайн для всех устройств
- ✅ Производительность (60 FPS анимации)

---

**Дата создания:** 2025-12-22  
**Статус:** В процессе реализации  
**Оценка времени:** 8-10 недель

---

## ✅ Текущий прогресс

### Завершено:
- ✅ Базовая структура дизайн-системы создана
- ✅ Все файлы дизайн-системы реализованы (colors, typography, spacing, shadows, animations, themes)
- ✅ Глобальные стили подключены (global.css)
- ✅ ThemeContext создан и интегрирован
- ✅ Первый компонент Button создан (базовая версия)

### В процессе:
- 🔄 Создание остальных UI-kit компонентов

### Следующие шаги:
1. Протестировать Button компонент
2. Создать Input компонент
3. Создать Card компонент
4. Применить к Dashboard
