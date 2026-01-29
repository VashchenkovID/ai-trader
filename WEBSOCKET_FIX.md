# Исправление проблемы WebSocket подключения

## Проблема
Фронтенд показывает статус "Офлайн" и не подключается к WebSocket серверу через nginx proxy.

## Исправления

### 1. WebSocket сервер теперь слушает на пути `/ws`
- Изменено в `server/src/services/ServiceManager.js`
- WebSocket инициализируется с путем `/ws` вместо `/`

### 2. Nginx конфигурация обновлена
- `proxy_pass $backend/ws;` - правильный путь для проксирования
- Добавлено `proxy_buffering off;` для WebSocket
- Добавлен `proxy_connect_timeout 75s;`

## Проверка на VPS

### 1. Пересоберите и перезапустите контейнеры:
```bash
cd /path/to/ai-trader
docker compose build --no-cache server client
docker compose up -d
```

### 2. Проверьте логи:
```bash
# Логи сервера
docker compose logs server | grep -i websocket

# Логи nginx
docker compose logs client | grep -i ws

# Проверьте ошибки nginx
docker compose exec client cat /var/log/nginx/api_error.log
```

### 3. Проверьте подключение WebSocket:
```bash
# Из контейнера client
docker compose exec client wscat -c wss://vashchenkovaitrader.ru/ws

# Или из хоста (если установлен wscat)
wscat -c wss://vashchenkovaitrader.ru/ws
```

### 4. Проверьте конфигурацию nginx:
```bash
docker compose exec client nginx -t
```

### 5. Проверьте, что WebSocket сервер запущен:
```bash
# Проверьте статус сервера
curl https://vashchenkovaitrader.ru/api/status

# Проверьте WebSocket endpoint
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: test" https://vashchenkovaitrader.ru/ws
```

## Возможные проблемы

### 1. SSL сертификат не работает для WebSocket
- Убедитесь, что сертификат Let's Encrypt правильно смонтирован
- Проверьте, что `ssl_certificate` и `ssl_certificate_key` указывают на правильные файлы

### 2. Firewall блокирует WebSocket
- Убедитесь, что порты 80 и 443 открыты
- Проверьте настройки firewall на VPS

### 3. Проблемы с DNS резолвингом
- Убедитесь, что `resolver 127.0.0.11` работает в Docker сети
- Проверьте, что контейнер `server` доступен по имени `server` в Docker сети

## Дополнительная диагностика

### Проверьте переменные окружения:
```bash
docker compose exec server env | grep FRONTEND_URL
```

### Проверьте сеть Docker:
```bash
docker network inspect ai-trader_ai-trader-network
```

### Проверьте, что сервер слушает на правильном порту:
```bash
docker compose exec server netstat -tlnp | grep 3001
```

## Если проблема не решена

1. Проверьте логи браузера (F12 -> Console) на наличие ошибок WebSocket
2. Проверьте Network tab в DevTools на наличие запросов к `/ws`
3. Убедитесь, что в `.env` файле установлен `FRONTEND_URL` с правильным доменом

