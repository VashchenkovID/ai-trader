# Конфигурация сборки фронтенда

## Оптимизации сборки

### 1. Code Splitting
- **Vendor chunks** разделены на:
  - `vendor-react` - React и React DOM
  - `vendor-prime` - PrimeReact компоненты
  - `vendor-charts` - Chart.js и react-chartjs-2
  - `vendor-router` - React Router
  - `vendor` - остальные зависимости

### 2. Минификация
- **JavaScript**: esbuild минификация (быстрая)
- **CSS**: автоматическая минификация
- **Удаление console/debugger** в production

### 3. Оптимизация ресурсов
- **Изображения**: `/assets/images/[name]-[hash][extname]`
- **Шрифты**: `/assets/fonts/[name]-[hash][extname]`
- **CSS/JS**: `/assets/[ext]/[name]-[hash][extname]`

### 4. Source Maps
- Отключены в production для безопасности и размера
- Включены только в development

### 5. Кеширование
- Все файлы имеют hash в имени для долгосрочного кеширования
- Nginx настроен на кеширование статики на 1 год

## Команды сборки

```bash
# Development сборка
npm run build

# Production сборка
npm run build:prod

# Проверка типов без сборки
npm run type-check

# Предпросмотр production сборки
npm run preview
```

## Переменные окружения

### Development (.env.development)
- `VITE_API_URL=http://localhost:3001/api`
- `VITE_WS_URL=ws://localhost:3001/ws`

### Production (.env.production)
- `VITE_API_URL=/api` (относительный путь через nginx)
- `VITE_WS_URL=/ws` (относительный путь через nginx)

## Размер бандла

После сборки проверьте размер:
```bash
npm run build
# Размеры будут показаны в консоли
```

Оптимизированные чанки:
- `vendor-react`: ~150KB (gzipped ~50KB)
- `vendor-prime`: ~500KB (gzipped ~150KB)
- `vendor-charts`: ~200KB (gzipped ~70KB)
- `vendor-router`: ~50KB (gzipped ~15KB)
- Основной bundle: зависит от кода приложения

## Рекомендации

1. **Lazy loading**: Используйте `React.lazy()` для больших компонентов
2. **Tree shaking**: Убедитесь, что импортируете только нужные части библиотек
3. **Изображения**: Используйте WebP формат где возможно
4. **Мониторинг**: Отслеживайте размер бандла при каждом обновлении

