# UI-kit компоненты

## Использование

### Button

```tsx
import { Button } from '@/components/ui';

// Primary кнопка (градиент)
<Button variant="primary" size="md">
  Купить
</Button>

// Secondary кнопка (outline)
<Button variant="secondary" size="md">
  Отмена
</Button>

// Ghost кнопка (прозрачная)
<Button variant="ghost" size="sm">
  Подробнее
</Button>

// С иконкой
<Button variant="primary" icon={<Icon />} iconPosition="left">
  Сохранить
</Button>

// Loading состояние
<Button variant="primary" loading>
  Загрузка...
</Button>

// Full width
<Button variant="primary" fullWidth>
  Подтвердить
</Button>
```

### Варианты:
- `primary` - градиентная кнопка (по умолчанию)
- `secondary` - outline кнопка
- `ghost` - прозрачная кнопка
- `danger` - красная кнопка (для опасных действий)
- `success` - зеленая кнопка

### Размеры:
- `sm` - 32px высота
- `md` - 40px высота (по умолчанию)
- `lg` - 48px высота

## Использование темы

```tsx
import { useTheme } from '@/contexts/ThemeContext';

function MyComponent() {
  const { theme, themeName, toggleTheme, setTheme } = useTheme();
  
  // Доступ к цветам
  const primaryColor = theme.colors.accent.primary;
  
  // Переключение темы
  <button onClick={toggleTheme}>
    Текущая тема: {themeName}
  </button>
}
```

## CSS переменные

Все цвета доступны через CSS переменные в `global.css`:

```css
.my-element {
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-default);
}
```

## Glassmorphism эффект

```css
.glass-card {
  background: var(--color-surface-glass);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-lg);
}
```

Или используйте готовый класс:
```tsx
<div className="glass">
  Контент с glassmorphism эффектом
</div>
```
