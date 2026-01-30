# 🐳 Шпаргалка по развертыванию приложения через Docker

Краткая инструкция по работе с Docker Compose для развертывания AI Trader.

## 📋 Быстрый старт

### 1. Первоначальное развертывание

```bash
# Перейдите в папку проекта
cd ~/projects/ai-trader

# Создайте .env файл в КОРНЕ проекта (ВАЖНО! Docker Compose ищет .env в корне, рядом с docker-compose.yml)
cp server/env.example .env
nano .env  # Заполните все необходимые переменные (DB_PASSWORD, JWT_SECRET, и т.д.)

# Проверьте, что .env находится в правильном месте
ls -la .env  # Должен быть в корне проекта

# Создайте необходимые директории
mkdir -p server/logs server/backups server/models

# Запустите все сервисы
docker compose up -d

# Исправьте права доступа (если возникают ошибки EACCES)
docker compose exec -u root server sh -c "chown -R nodejs:nodejs /app && chmod -R 777 /app"

# Проверьте статус
docker compose ps
```

### 2. Просмотр логов

```bash
# Все логи
docker compose logs

# Логи конкретного сервиса
docker compose logs server
docker compose logs client
docker compose logs postgres

# Логи в реальном времени
docker compose logs -f server

# Последние 100 строк
docker compose logs --tail=100 server
```

### 3. Остановка и запуск

```bash
# Остановить все сервисы
docker compose down

# Остановить с удалением volumes (ОСТОРОЖНО! Удалит данные БД)
docker compose down -v

# Запустить сервисы
docker compose up -d

# Перезапустить конкретный сервис
docker compose restart server
docker compose restart client
docker compose restart postgres
```

## 🔄 Обновление приложения

### Вариант 1: Обновление кода и пересборка

```bash
# 1. Обновите код из репозитория
cd ~/projects/ai-trader
git pull

# 2. Остановите контейнеры
docker compose down

# 3. Пересоберите и запустите
docker compose up -d --build

# 4. Проверьте логи
docker compose logs -f server
```

### Вариант 2: Только пересборка образа

```bash
# Пересобрать конкретный сервис
docker compose build server
docker compose build client

# Пересобрать и перезапустить
docker compose up -d --build server
```

## 🛠️ Полезные команды

### Работа с контейнерами

```bash
# Список запущенных контейнеров
docker compose ps

# Войти в контейнер
docker compose exec server sh
docker compose exec postgres psql -U postgres -d smart_exchange

# Выполнить команду в контейнере
docker compose exec server node src/utils/initDatabase.js
docker compose exec server ls -la /app/logs

# Просмотр использования ресурсов
docker stats
```

### Работа с базой данных

```bash
# Создать бэкап БД
docker compose exec postgres pg_dump -U postgres smart_exchange > backup_$(date +%Y%m%d_%H%M%S).sql

# Восстановить из бэкапа
docker compose exec -T postgres psql -U postgres smart_exchange < backup.sql

# Подключиться к БД
docker compose exec postgres psql -U postgres -d smart_exchange

# Выполнить SQL запрос
docker compose exec postgres psql -U postgres -d smart_exchange -c "SELECT COUNT(*) FROM users;"
```

### Очистка

```bash
# Остановить и удалить контейнеры
docker compose down

# Удалить неиспользуемые образы
docker image prune -a

# Удалить неиспользуемые volumes
docker volume prune

# Полная очистка (ОСТОРОЖНО!)
docker system prune -a --volumes
```

## 🔍 Диагностика проблем

### Проверка статуса сервисов

```bash
# Статус всех сервисов
docker compose ps

# Health check
docker compose ps | grep healthy

# Детальная информация о контейнере
docker inspect ai-trader-server
```

### Просмотр ошибок

```bash
# Логи ошибок
docker compose logs server | grep -i error
docker compose logs server | grep -i exception

# Логи за последний час
docker compose logs --since 1h server

# Логи с временными метками
docker compose logs -t server
```

### Проверка подключений

```bash
# Проверить доступность API
curl http://localhost:3001/health

# Проверить WebSocket
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" http://localhost:3001/ws

# Проверить подключение к БД из контейнера
docker compose exec server sh -c "nc -zv postgres 5432"
```

## 📦 Работа с volumes

### Просмотр volumes

```bash
# Список volumes
docker volume ls

# Информация о volume
docker volume inspect ai-trader_postgres_data

# Просмотр файлов в volume
docker compose exec server ls -la /app/logs
docker compose exec server ls -la /app/backups
docker compose exec server ls -la /app/models
```

### Резервное копирование volumes

```bash
# Бэкап данных БД
docker compose exec postgres pg_dump -U postgres smart_exchange > db_backup.sql

# Бэкап логов (на хосте)
tar -czf logs_backup_$(date +%Y%m%d).tar.gz server/logs/

# Бэкап моделей (на хосте)
tar -czf models_backup_$(date +%Y%m%d).tar.gz server/models/
```

## 🔐 Безопасность

### Обновление переменных окружения

```bash
# Отредактировать .env
nano .env

# Перезапустить сервисы для применения изменений
docker compose down
docker compose up -d
```

### Исправление прав доступа

```bash
# Выдать все права пользователю nodejs на все папки (РЕКОМЕНДУЕТСЯ при ошибках прав доступа)
docker compose exec -u root server sh -c "
    mkdir -p /app/logs /app/models /app/backups/database /app/backups/settings /app/backups/models /app/backups/full /app/backups/exports /app/backups/uploads &&
    chown -R nodejs:nodejs /app &&
    chmod -R 755 /app &&
    chmod -R 777 /app/backups/full /app/backups/database /app/backups/settings /app/backups/models /app/backups/exports /app/backups/uploads &&
    chmod -R 777 /app/logs /app/models
"

# Или более простая команда (выдает все права на все папки)
docker compose exec -u root server sh -c "chown -R nodejs:nodejs /app && chmod -R 777 /app"
```

## 📊 Мониторинг

### Использование ресурсов

```bash
# Статистика использования ресурсов
docker stats

# Использование дискового пространства
docker system df

# Детальная информация
docker system df -v
```

### Проверка производительности

```bash
# Время ответа API
time curl http://localhost:3001/health

# Проверка памяти контейнера
docker stats ai-trader-server --no-stream
```

## 🚀 Автоматизация

### Скрипт для обновления

Создайте файл `update.sh`:

```bash
#!/bin/bash
set -e

echo "🔄 Обновление приложения..."

cd ~/projects/ai-trader

# Обновление кода
echo "📥 Получение обновлений из репозитория..."
git pull

# Остановка контейнеров
echo "⏹️ Остановка контейнеров..."
docker compose down

# Пересборка и запуск
echo "🔨 Пересборка и запуск..."
docker compose up -d --build

# Ожидание запуска
echo "⏳ Ожидание запуска сервисов..."
sleep 10

# Проверка статуса
echo "✅ Проверка статуса..."
docker compose ps

echo "🎉 Обновление завершено!"
```

```bash
# Сделать скрипт исполняемым
chmod +x update.sh

# Запустить
./update.sh
```

### Автоматический бэкап БД

Создайте файл `backup-db.sh`:

```bash
#!/bin/bash
BACKUP_DIR=~/backups
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

cd ~/projects/ai-trader

echo "💾 Создание бэкапа БД..."
docker compose exec -T postgres pg_dump -U postgres smart_exchange > $BACKUP_DIR/db_$DATE.sql

# Удаление старых бэкапов (старше 7 дней)
find $BACKUP_DIR -name "db_*.sql" -mtime +7 -delete

echo "✅ Бэкап создан: $BACKUP_DIR/db_$DATE.sql"
```

```bash
# Добавить в crontab (ежедневно в 3:00)
crontab -e
# Добавить строку:
0 3 * * * /root/backup-db.sh >> /root/backup.log 2>&1
```

## 🆘 Решение проблем

### Docker не видит переменные из .env файла

**Проблема:** Docker Compose показывает предупреждения `WARN[0000] The "VARIABLE_NAME" variable is not set.`

**Причина:** Docker Compose ищет `.env` файл в той же директории, где находится `docker-compose.yml` (корень проекта).

**Решение:**

```bash
# 1. Проверьте, где находится ваш .env файл
ls -la .env
ls -la server/.env

# 2. Если .env находится в server/.env, скопируйте его в корень проекта
cp server/.env .env

# 3. Или создайте .env в корне проекта на основе примера
cp server/env.example .env

# 4. Отредактируйте .env файл и заполните все необходимые переменные
nano .env

# 5. Проверьте, что файл находится в правильном месте
pwd  # Должно быть: ~/projects/ai-trader
ls -la .env  # Файл должен существовать

# 6. Перезапустите контейнеры
docker compose down
docker compose up -d

# 7. Проверьте, что переменные загружены (не должно быть WARN)
docker compose config | grep -i password
```

**Важно:**
- `.env` файл должен быть в корне проекта (там же, где `docker-compose.yml`)
- Не коммитьте `.env` в git (он уже в `.gitignore`)
- Все переменные должны быть заполнены без пробелов вокруг `=`

**Пример правильного .env файла:**

```env
DB_PASSWORD=your_secure_password
JWT_SECRET=your_jwt_secret_minimum_32_characters
TINKOFF_TOKEN=your_token
TINKOFF_ACCOUNT_ID=your_account_id
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
NEWS_API_KEY=your_news_api_key
USER_PASSWORD=your_user_password
```

### Ошибки прав доступа (EACCES: permission denied)

```bash
# Выдать все права пользователю nodejs на все папки (РЕКОМЕНДУЕТСЯ)
docker compose exec -u root server sh -c "
    mkdir -p /app/logs /app/models /app/backups/database /app/backups/settings /app/backups/models /app/backups/full /app/backups/exports /app/backups/uploads &&
    chown -R nodejs:nodejs /app &&
    chmod -R 755 /app &&
    chmod -R 777 /app/backups/full /app/backups/database /app/backups/settings /app/backups/models /app/backups/exports /app/backups/uploads &&
    chmod -R 777 /app/logs /app/models
"

# Или быстрая команда (выдает все права на все папки)
docker compose exec -u root server sh -c "chown -R nodejs:nodejs /app && chmod -R 777 /app"

# Проверить права после исправления
docker compose exec server ls -la /app
docker compose exec server ls -la /app/backups
```

### Контейнер не запускается

```bash
# Проверить логи
docker compose logs server

# Проверить конфигурацию
docker compose config

# Пересобрать образ
docker compose build --no-cache server
```

### Проблемы с базой данных

```bash
# Проверить подключение
docker compose exec postgres pg_isready -U postgres

# Перезапустить БД
docker compose restart postgres

# Проверить логи БД
docker compose logs postgres
```

### Проблемы с сетью

```bash
# Проверить сеть
docker network ls
docker network inspect ai-trader_ai-trader-network

# Пересоздать сеть
docker compose down
docker network prune
docker compose up -d
```

## 📝 Чек-лист развертывания

- [ ] `.env` файл создан и заполнен
- [ ] Директории `server/logs`, `server/backups`, `server/models` созданы
- [ ] Docker и Docker Compose установлены
- [ ] Порты 3001, 80, 443 свободны
- [ ] `docker compose up -d` выполнен успешно
- [ ] Все контейнеры в статусе `healthy` или `running`
- [ ] API доступен: `curl http://localhost:3001/health`
- [ ] Логи не содержат критических ошибок
- [ ] Бэкап БД создан

## 🔗 Полезные ссылки

- [Docker Compose документация](https://docs.docker.com/compose/)
- [Docker CLI reference](https://docs.docker.com/engine/reference/commandline/cli/)

