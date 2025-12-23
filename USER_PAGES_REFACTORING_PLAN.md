# План рефакторинга основных пользовательских страниц

## ✅ Завершено

1. **StockDetail.tsx** - Полностью рефакторена
2. **Dashboard.tsx** - Удален неиспользуемый ConfirmDialog
3. **Recommendations.tsx** - Использует UI-kit компоненты (Toast оставлен как есть)

## 🎯 В работе

### 1. **Portfolio.tsx / PortfolioVisualization.tsx** 🟡
**Статус**: Минимальное использование PrimeReact
**Используемые PrimeReact компоненты**:
- Toast (используется через ref)

**План рефакторинга**:
- [ ] Оставить Toast как есть (минимальное использование)
- [ ] Проверить дочерние компоненты на использование PrimeReact

**Оценка сложности**: Низкая

### 2. **TradingRequests.tsx / TradingRequestManager.tsx** 🔴
**Статус**: Требует полного рефакторинга
**Используемые PrimeReact компоненты**:
- Card, DataTable, Column, Button, Badge, Tag
- Dialog, InputTextarea, Toast, ConfirmDialog
- TabView, TabPanel, Skeleton, Message
- Toolbar, SplitButton, Dropdown

**План рефакторинга**:
- [ ] Заменить Card на UI-kit Card
- [ ] Заменить DataTable на UI-kit Table (или создать кастомную таблицу)
- [ ] Заменить Button на UI-kit Button
- [ ] Заменить Badge/Tag на UI-kit Badge
- [ ] Заменить Dialog на UI-kit Modal
- [ ] Заменить InputTextarea на UI-kit Input (textarea)
- [ ] Заменить TabView/TabPanel на UI-kit Tabs
- [ ] Заменить Skeleton на UI-kit Skeleton
- [ ] Заменить Message на UI-kit Alert
- [ ] Создать компонент Toolbar для UI-kit
- [ ] Создать компонент SplitButton для UI-kit
- [ ] Заменить Dropdown на UI-kit Select
- [ ] Создать компонент ConfirmDialog для UI-kit
- [ ] Toast оставить как есть (минимальное использование)

**Оценка сложности**: Высокая (много компонентов, сложная логика таблиц)

## 📋 Порядок выполнения

1. **PortfolioVisualization.tsx** (быстро, только проверка)
2. **TradingRequestManager.tsx** (долго, требует создания новых компонентов UI-kit)

## 🛠️ Компоненты UI-kit, которые нужно создать

### Для TradingRequestManager:
- [ ] **Table** - расширенная таблица с сортировкой, фильтрацией, пагинацией
- [ ] **Toolbar** - панель инструментов
- [ ] **SplitButton** - кнопка с выпадающим меню
- [ ] **ConfirmDialog** - диалог подтверждения действий

---

**Дата создания**: 2024
**Статус**: План готов к реализации
**Следующий шаг**: Проверить PortfolioVisualization, затем начать рефакторинг TradingRequestManager

