# 🚀 Быстрый старт с Docker

## Установка и запуск

```bash
# 1. Создайте .env файл
cp server/env.example .env

# 2. Отредактируйте .env и установите:
#    - JWT_SECRET (минимум 32 символа)
#    - DB_PASSWORD
#    - FRONTEND_URL (для продакшена)

# 3. Запустите приложение
docker-compose up -d

# 4. Инициализируйте базу данных
docker-compose exec server npm run init-db

# 5. Откройте в браузере
#    Frontend: http://localhost
#    Backend API: http://localhost:3001
#    Health: http://localhost/health
```

## Полезные команды

```bash
# Просмотр логов
docker-compose logs -f

# Остановка
docker-compose down

# Перезапуск
docker-compose restart

# Пересборка
docker-compose up -d --build
```

## Структура

- **PostgreSQL** - порт 5432
- **Backend** - порт 3001
- **Frontend (Nginx)** - порт 80

Подробная документация: [DOCKER_SETUP.md](./DOCKER_SETUP.md)

