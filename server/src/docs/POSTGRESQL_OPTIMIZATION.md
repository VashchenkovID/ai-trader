# Оптимизация настроек PostgreSQL для предотвращения реконнектов

## Вариант 5: Оптимизация настроек PostgreSQL

Для предотвращения реконнектов рекомендуется настроить следующие параметры в PostgreSQL:

### 1. Настройки соединений

```sql
-- Увеличить максимальное количество соединений (если нужно)
ALTER SYSTEM SET max_connections = 100;

-- Увеличить время простоя транзакции перед закрытием
ALTER SYSTEM SET idle_in_transaction_session_timeout = 300000; -- 5 минут

-- Увеличить время ожидания запроса
ALTER SYSTEM SET statement_timeout = 300000; -- 5 минут
```

### 2. TCP Keep-Alive настройки

В файле `postgresql.conf` или через `ALTER SYSTEM`:

```sql
-- TCP keep-alive настройки для предотвращения закрытия соединений
ALTER SYSTEM SET tcp_keepalives_idle = 600;      -- 10 минут
ALTER SYSTEM SET tcp_keepalives_interval = 30;   -- 30 секунд
ALTER SYSTEM SET tcp_keepalives_count = 3;       -- 3 попытки
```

### 3. Настройки пула соединений

Если используется PgBouncer или другой connection pooler:

```ini
# PgBouncer настройки
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 20
reserve_pool_size = 5
reserve_pool_timeout = 3
```

### 4. Применение изменений

После изменения настроек:

```sql
-- Перезагрузить конфигурацию (без перезапуска сервера)
SELECT pg_reload_conf();

-- Или перезапустить PostgreSQL сервер
-- sudo systemctl restart postgresql
```

### 5. Проверка текущих настроек

```sql
-- Проверить текущие настройки
SHOW max_connections;
SHOW idle_in_transaction_session_timeout;
SHOW statement_timeout;
SHOW tcp_keepalives_idle;
SHOW tcp_keepalives_interval;
SHOW tcp_keepalives_count;
```

### 6. Мониторинг активных соединений

```sql
-- Показать все активные соединения
SELECT 
    pid,
    usename,
    application_name,
    client_addr,
    state,
    state_change,
    query_start,
    now() - state_change AS idle_duration
FROM pg_stat_activity
WHERE datname = current_database()
ORDER BY state_change;

-- Показать количество соединений по состоянию
SELECT state, COUNT(*) 
FROM pg_stat_activity 
WHERE datname = current_database()
GROUP BY state;
```

### 7. Рекомендации

1. **idle_in_transaction_session_timeout**: Установить в 5-10 минут для предотвращения зависших транзакций
2. **tcp_keepalives_idle**: Установить в 10 минут для поддержания TCP соединений
3. **statement_timeout**: Установить в 5 минут для предотвращения долгих запросов
4. **max_connections**: Установить достаточное значение (100-200) в зависимости от нагрузки

### 8. Проверка логов

Проверьте логи PostgreSQL на наличие сообщений о закрытии соединений:

```bash
# В логах PostgreSQL ищите:
# - "connection received"
# - "connection closed"
# - "unexpected EOF on client connection"
```

### Примечания

- Изменения в `postgresql.conf` требуют перезагрузки или перезапуска PostgreSQL
- Некоторые настройки могут быть ограничены на уровне ОС (например, TCP keep-alive)
- Рекомендуется тестировать изменения на тестовой среде перед применением в продакшене

