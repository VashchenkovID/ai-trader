# План оптимизации и перехода портфеля на новую дизайн-систему

## 📊 Анализ текущего состояния

### Структура компонентов портфеля

1. **Portfolio.tsx** - простая обертка (минимальные изменения)
2. **PortfolioVisualization.tsx** - основной контейнер (средние изменения)
3. **PortfolioSummaryCard.tsx** - карточка сводки портфеля (критические изменения)
4. **PortfolioPositionsTable.tsx** - таблица позиций (критические изменения)
5. **PortfolioCharts.tsx** - графики распределения (средние изменения)
6. **PortfolioAnalytics.tsx** - статистика портфеля (средние изменения)
7. **PortfolioAnalysisResults.tsx** - модальное окно результатов (критические изменения)
8. **StrategyPositionsTable.tsx** - таблица позиций по стратегиям (критические изменения)

### Проблемы текущей реализации

#### 1. Использование PrimeReact компонентов
- ❌ `Card` из `primereact/card` → ✅ Заменить на `Card` из `./ui/Card/Card`
- ❌ `Badge` из `primereact/badge` → ✅ Заменить на `Badge` из `./ui/Badge/Badge`
- ❌ `Tag` из `primereact/tag` → ✅ Заменить на `Badge` с соответствующим variant
- ❌ `Button` из `primereact/button` → ✅ Заменить на `Button` из `./ui/Button/Button`
- ❌ `DataTable` из `primereact/datatable` → ✅ Заменить на `Table` из `./ui/Table/Table`
- ❌ `Dialog` из `primereact/dialog` → ✅ Заменить на `Modal` из `./ui/Modal/Modal`
- ❌ `Toast` из `primereact/toast` → ⚠️ Оставить (глобальный компонент)
- ❌ `Message` из `primereact/message` → ✅ Создать компонент `Alert` или использовать `Card` с variant
- ❌ `ProgressBar` из `primereact/progressbar` → ✅ Заменить на `ProgressBar` из `./ui/ProgressBar/ProgressBar`
- ❌ `Skeleton` из `primereact/skeleton` → ✅ Заменить на `Skeleton` из `./ui/Skeleton/Skeleton`
- ❌ `Chart` из `primereact/chart` → ✅ Заменить на `Chart` из `./ui/Chart/Chart`
- ❌ `Divider` из `primereact/divider` → ✅ Создать простой `Divider` компонент или использовать CSS
- ❌ `InputNumber` из `primereact/inputnumber` → ✅ Заменить на `Input` с type="number" из `./ui/Input/Input`

#### 2. Использование устаревших классов стилей
- ❌ Tailwind-подобные классы (`p-4`, `mb-4`, `grid`, `col-12`, `text-600`, `surface-100`)
- ❌ PrimeReact классы (`p-button-text`, `p-datatable-sm`, `p-fluid`)
- ✅ Заменить на CSS переменные и семантические классы из дизайн-системы

#### 3. Отсутствие стилей
- ❌ Нет CSS файлов для компонентов портфеля
- ✅ Создать CSS файлы для каждого компонента с использованием CSS переменных

#### 4. Несоответствие дизайн-системе
- ❌ Нет использования glassmorphism эффектов
- ❌ Нет градиентов где уместно
- ❌ Не используется типографика из дизайн-системы
- ❌ Не используются spacing переменные

---

## 🎯 План оптимизации

### Этап 1: Подготовка инфраструктуры (Приоритет: Высокий)

#### 1.1 Создать недостающие компоненты UI
- [ ] **Alert/Message компонент** - для отображения сообщений об ошибках и предупреждений
  - Варианты: `info`, `success`, `warning`, `error`
  - Использовать CSS переменные для цветов
  - Добавить иконки и анимации
  
- [ ] **Divider компонент** - простой разделитель
  - Горизонтальный и вертикальный варианты
  - Использовать `--color-border-default`

- [ ] **Tag компонент** (если нужен отдельно от Badge)
  - Или расширить Badge для поддержки всех вариантов Tag

#### 1.2 Обновить существующие компоненты (если нужно)
- [ ] Проверить `Table` компонент - поддержка всех функций DataTable
- [ ] Проверить `Modal` компонент - поддержка footer, header, размеров
- [ ] Проверить `Input` компонент - поддержка type="number" с кнопками +/- (или создать InputNumber)
- [ ] Проверить `Chart` компонент - совместимость с Chart.js

### Этап 2: Рефакторинг основных компонентов (Приоритет: Критический)

#### 2.1 PortfolioSummaryCard.tsx
**Текущие проблемы:**
- Использует PrimeReact `Card`, `Badge`, `Tag`, `ProgressBar`, `Skeleton`
- Использует Tailwind классы (`grid`, `col-12`, `text-600`, `surface-100`)
- Нет стилей (нет CSS файла)

**План действий:**
1. Заменить импорты:
   ```tsx
   // Было
   import { Card } from 'primereact/card';
   import { Badge } from 'primereact/badge';
   import { Tag } from 'primereact/tag';
   import { ProgressBar } from 'primereact/progressbar';
   import { Skeleton } from 'primereact/skeleton';
   
   // Станет
   import { Card } from '../ui/Card/Card';
   import { Badge } from '../ui/Badge/Badge';
   import { ProgressBar } from '../ui/ProgressBar/ProgressBar';
   import { Skeleton } from '../ui/Skeleton/Skeleton';
   ```

2. Создать `PortfolioSummaryCard.css`:
   - Использовать CSS Grid для layout (вместо PrimeReact grid)
   - Применить glassmorphism для карточек метрик
   - Использовать градиенты для фона метрик (как в HeroMetricsCard)
   - Применить типографику из дизайн-системы
   - Добавить hover эффекты и анимации

3. Заменить классы:
   - `grid` → `.portfolio-summary-grid`
   - `col-12 md:col-2` → `.portfolio-summary-metric`
   - `text-600` → `.portfolio-summary-label`
   - `surface-100` → `.portfolio-summary-card`
   - `border-round` → `border-radius: var(--radius-base)`

4. Улучшения дизайна:
   - Добавить градиентные фоны для метрик (как в Dashboard)
   - Применить glassmorphism эффект
   - Улучшить визуализацию распределения по стратегиям
   - Добавить иконки для метрик

#### 2.2 PortfolioPositionsTable.tsx
**Текущие проблемы:**
- Использует PrimeReact `Card`, `DataTable`, `Column`, `Button`, `Tag`, `Message`, `Toast`, `Dialog`, `InputNumber`
- Использует Tailwind классы
- Нет стилей

**План действий:**
1. Заменить импорты:
   ```tsx
   // Было
   import { Card } from 'primereact/card';
   import { DataTable } from 'primereact/datatable';
   import { Column } from 'primereact/column';
   import { Button } from 'primereact/button';
   import { Tag } from 'primereact/tag';
   import { Message } from 'primereact/message';
   import { Dialog } from 'primereact/dialog';
   import { InputNumber } from 'primereact/inputnumber';
   
   // Станет
   import { Card } from '../ui/Card/Card';
   import { Table } from '../ui/Table/Table';
   import { Button } from '../ui/Button/Button';
   import { Badge } from '../ui/Badge/Badge';
   import { Modal } from '../ui/Modal/Modal';
   import { Input } from '../ui/Input/Input';
   import { Alert } from '../ui/Alert/Alert'; // или создать
   ```

2. Создать `PortfolioPositionsTable.css`:
   - Стили для таблицы (используя Table компонент)
   - Стили для ячеек с данными
   - Стили для кнопок действий
   - Стили для модального окна продажи
   - Hover эффекты для строк

3. Адаптировать DataTable функциональность:
   - Сортировка
   - Пагинация
   - Фильтрация (если используется)
   - Frozen columns (для колонки действий)

4. Улучшения дизайна:
   - Применить glassmorphism для таблицы
   - Улучшить визуализацию PnL (цвета, иконки)
   - Улучшить модальное окно продажи
   - Добавить анимации для действий

#### 2.3 PortfolioAnalysisResults.tsx
**Текущие проблемы:**
- Использует PrimeReact `Dialog`, `DataTable`, `Column`, `Tag`, `Badge`
- Использует Tailwind классы
- Нет стилей

**План действий:**
1. Заменить импорты на кастомные компоненты
2. Создать `PortfolioAnalysisResults.css`
3. Улучшить визуализацию сводки (карточки с метриками)
4. Применить glassmorphism эффекты

#### 2.4 StrategyPositionsTable.tsx
**Текущие проблемы:**
- Использует PrimeReact `Card`, `DataTable`, `Column`, `Tag`
- Использует Tailwind классы
- Нет стилей

**План действий:**
1. Заменить импорты на кастомные компоненты
2. Создать `StrategyPositionsTable.css`
3. Применить стили аналогично PortfolioPositionsTable

### Этап 3: Рефакторинг вспомогательных компонентов (Приоритет: Средний)

#### 3.1 PortfolioCharts.tsx
**Текущие проблемы:**
- Использует PrimeReact `Card`, `Chart`
- Использует Tailwind классы
- Нет стилей

**План действий:**
1. Заменить `Card` на кастомный
2. Заменить `Chart` на кастомный (если нужно)
3. Создать `PortfolioCharts.css`
4. Улучшить стили графиков (цвета из дизайн-системы)
5. Применить glassmorphism для карточек графиков

#### 3.2 PortfolioAnalytics.tsx
**Текущие проблемы:**
- Использует PrimeReact `Card`, `ProgressBar`, `Divider`, `Badge`
- Использует Tailwind классы
- Нет стилей

**План действий:**
1. Заменить все импорты на кастомные компоненты
2. Создать `PortfolioAnalytics.css`
3. Улучшить визуализацию статистики
4. Применить glassmorphism эффекты

### Этап 4: Рефакторинг контейнера (Приоритет: Средний)

#### 4.1 PortfolioVisualization.tsx
**Текущие проблемы:**
- Использует PrimeReact `Message`, `Toast`
- Использует Tailwind классы (`mb-4`, `grid`, `col-12`)
- Нет стилей

**План действий:**
1. Заменить `Message` на `Alert` (или создать)
2. Оставить `Toast` (глобальный компонент)
3. Создать `PortfolioVisualization.css`
4. Заменить Tailwind классы на семантические классы
5. Улучшить layout с использованием CSS Grid/Flexbox

#### 4.2 Portfolio.tsx
**Текущие проблемы:**
- Использует Tailwind класс `p-4`

**План действий:**
1. Создать `Portfolio.css`
2. Заменить `p-4` на семантический класс
3. Применить spacing из дизайн-системы

### Этап 5: Улучшения UX/UI (Приоритет: Средний)

#### 5.1 Визуальные улучшения
- [ ] Добавить градиентные фоны для метрик (как в Dashboard)
- [ ] Применить glassmorphism эффекты везде где уместно
- [ ] Улучшить цветовую схему для PnL (положительные/отрицательные значения)
- [ ] Добавить иконки для метрик и действий
- [ ] Улучшить типографику (использовать переменные шрифтов)
- [ ] Добавить плавные анимации и переходы

#### 5.2 Интерактивность
- [ ] Улучшить hover эффекты для таблиц и карточек
- [ ] Добавить loading состояния с использованием Skeleton
- [ ] Улучшить модальные окна (анимации появления/исчезновения)
- [ ] Добавить tooltips где необходимо

#### 5.3 Адаптивность
- [ ] Проверить и улучшить responsive дизайн
- [ ] Оптимизировать для мобильных устройств
- [ ] Улучшить отображение таблиц на маленьких экранах

---

## 📝 Детальный план выполнения

### Фаза 1: Подготовка (1-2 часа)
1. Создать недостающие компоненты UI (Alert, Divider, возможно InputNumber)
2. Проверить и обновить существующие компоненты при необходимости
3. Создать базовые CSS файлы для всех компонентов портфеля

### Фаза 2: Критические компоненты (4-6 часов)
1. **PortfolioSummaryCard** - полный рефакторинг
2. **PortfolioPositionsTable** - полный рефакторинг
3. **PortfolioAnalysisResults** - полный рефакторинг
4. **StrategyPositionsTable** - полный рефакторинг

### Фаза 3: Вспомогательные компоненты (2-3 часа)
1. **PortfolioCharts** - рефакторинг
2. **PortfolioAnalytics** - рефакторинг

### Фаза 4: Контейнеры (1-2 часа)
1. **PortfolioVisualization** - рефакторинг
2. **Portfolio** - рефакторинг

### Фаза 5: Полировка (2-3 часа)
1. Визуальные улучшения
2. Анимации и переходы
3. Тестирование и исправление багов
4. Оптимизация производительности

**Общее время: 10-16 часов**

---

## 🎨 Дизайн-решения

### Цветовая схема
- Использовать CSS переменные из `global.css`
- PnL положительные: `--color-accent-success` / `--gradient-success`
- PnL отрицательные: `--color-accent-error` / `--gradient-error`
- Метрики: градиенты как в Dashboard (primary, success, info)

### Типографика
- Заголовки: `--font-family-primary`, размеры из дизайн-системы
- Числа: `--font-family-mono` для точности
- Использовать `--color-text-primary`, `--color-text-secondary`, `--color-text-tertiary`

### Spacing
- Использовать `--spacing-*` переменные
- Убрать все hardcoded значения (px, rem)

### Эффекты
- Glassmorphism: `backdrop-filter: blur()`, полупрозрачные фоны
- Градиенты: использовать `--gradient-*` переменные
- Тени: использовать `--shadow-*` переменные
- Анимации: использовать `--transition-*` переменные

---

## ✅ Чеклист готовности

### Компоненты
- [ ] Все PrimeReact компоненты заменены на кастомные
- [ ] Все Tailwind классы заменены на семантические классы
- [ ] Все CSS файлы созданы и используют CSS переменные
- [ ] Все компоненты используют типографику из дизайн-системы

### Стили
- [ ] Применены glassmorphism эффекты где уместно
- [ ] Использованы градиенты для метрик
- [ ] Применены правильные цвета из дизайн-системы
- [ ] Использованы spacing переменные
- [ ] Добавлены анимации и переходы

### Функциональность
- [ ] Все функции работают корректно
- [ ] Таблицы поддерживают сортировку и пагинацию
- [ ] Модальные окна работают корректно
- [ ] Формы валидируются правильно

### Тестирование
- [ ] Проверено на разных размерах экрана
- [ ] Проверена производительность
- [ ] Исправлены все баги
- [ ] Проверена совместимость с браузерами

---

## 📚 Ссылки на примеры

- **Dashboard.tsx** - пример использования кастомных компонентов
- **HeroMetricsCard.tsx** - пример glassmorphism и градиентов
- **Navigation.tsx** - пример использования дизайн-системы
- **DesignSystemTest.tsx** - примеры всех компонентов дизайн-системы

---

## 🚀 Приоритеты выполнения

1. **Критический**: PortfolioSummaryCard, PortfolioPositionsTable
2. **Высокий**: PortfolioAnalysisResults, StrategyPositionsTable
3. **Средний**: PortfolioCharts, PortfolioAnalytics, PortfolioVisualization
4. **Низкий**: Полировка и улучшения UX

---

## 📅 История изменений

### 2025-01-XX (Сегодня)
- ✅ **Создан план оптимизации портфеля**
  - Проведен полный анализ всех компонентов портфеля
  - Выявлены все проблемы с использованием PrimeReact компонентов
  - Создан детальный план рефакторинга с приоритетами
  - Определены этапы выполнения (5 фаз)
  - Оценка времени: 10-16 часов

### Следующие шаги
- [ ] Создать недостающие компоненты UI (Alert, Divider, InputNumber)
- [ ] Начать рефакторинг PortfolioSummaryCard
- [ ] Начать рефакторинг PortfolioPositionsTable

---

*План создан: 2025-01-XX*
*Версия: 1.0*
*Последнее обновление: 2025-01-XX*
