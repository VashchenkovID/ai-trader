# Запуск миграций в Docker

## Способ 1: Прямой запуск в контейнере (рекомендуется)

### Шаг 1: Убедитесь, что контейнеры запущены
```bash
docker-compose ps
```

### Шаг 2: Запустите миграцию в контейнере сервера
```bash
docker-compose exec server node migrations/fix-real-portfolio-indexes.js
```

Или если используете имя контейнера напрямую:
```bash
docker exec -it ai-trader-server node migrations/fix-real-portfolio-indexes.js
```

## Способ 2: Через MigrationService (если настроен)

Если в проекте настроен автоматический запуск миграций через `MigrationService`, миграция может быть выполнена автоматически при старте сервера или через API.

### Проверка статуса миграций
```bash
docker-compose exec server node -e "
import('./src/services/MigrationService.js').then(async (module) => {
  const MigrationService = module.default;
  await MigrationService.initialize();
  const result = await MigrationService.runPendingMigrations();
  console.log(result);
  process.exit(0);
});
"
```

## Способ 3: Через psql напрямую (для отладки)

Если нужно выполнить SQL напрямую:

```bash
# Подключение к базе данных
docker-compose exec postgres psql -U postgres -d smart_exchange

# Затем можно выполнить SQL запросы вручную
```

## Проверка результата

После выполнения миграции проверьте:

```bash
# Проверка индексов
docker-compose exec postgres psql -U postgres -d smart_exchange -c "
SELECT indexname, tablename 
FROM pg_indexes 
WHERE tablename = 'real_portfolio';
"

# Проверка колонок
docker-compose exec postgres psql -U postgres -d smart_exchange -c "
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'real_portfolio' 
ORDER BY ordinal_position;
"
```

## Откат миграции (если нужно)

Если нужно откатить миграцию:

```bash
docker-compose exec server node -e "
import('./migrations/fix-real-portfolio-indexes.js').then(async (module) => {
  const sequelize = (await import('./src/config/database.js')).default;
  const { DataTypes } = await import('sequelize');
  await sequelize.authenticate();
  const queryInterface = sequelize.getQueryInterface();
  await module.down(queryInterface, DataTypes);
  console.log('✅ Migration rolled back');
  await sequelize.close();
});
"
```

## Устранение проблем

### Ошибка подключения к базе данных
Убедитесь, что:
- Контейнер `postgres` запущен и здоров
- Переменные окружения `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` правильно настроены
- Сеть между контейнерами работает (`docker-compose ps` показывает все контейнеры)

### Ошибка прав доступа
Если возникают проблемы с правами:
```bash
docker-compose exec server chmod +x migrations/fix-real-portfolio-indexes.js
```

### Просмотр логов
```bash
# Логи сервера
docker-compose logs server

# Логи базы данных
docker-compose logs postgres
```

