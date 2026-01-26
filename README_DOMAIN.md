# 🌐 Настройка домена vashchenkovaitrader.ru

## Быстрая настройка

### 1. Обновите .env файл

```env
FRONTEND_URL=https://vashchenkovaitrader.ru,https://www.vashchenkovaitrader.ru,http://vashchenkovaitrader.ru,http://www.vashchenkovaitrader.ru
```

### 2. Настройте DNS

```
A     @              -> IP_ВАШЕГО_СЕРВЕРА
A     www            -> IP_ВАШЕГО_СЕРВЕРА
```

### 3. Настройте SSL (для HTTPS)

#### Вариант A: Let's Encrypt (рекомендуется)

```bash
# Установите certbot
sudo apt-get install certbot

# Получите сертификат
sudo certbot certonly --standalone -d vashchenkovaitrader.ru -d www.vashchenkovaitrader.ru

# Обновите docker-compose.yml - раскомментируйте:
volumes:
  - /etc/letsencrypt:/etc/letsencrypt:ro
```

#### Вариант B: Собственные сертификаты

Создайте папку `ssl/` и поместите туда:
- `cert.pem` - сертификат
- `key.pem` - приватный ключ

В `docker-compose.yml` раскомментируйте:
```yaml
volumes:
  - ./ssl:/etc/nginx/ssl:ro
```

В `client/nginx.conf` закомментируйте Let's Encrypt пути и раскомментируйте:
```nginx
ssl_certificate /etc/nginx/ssl/cert.pem;
ssl_certificate_key /etc/nginx/ssl/key.pem;
```

### 4. Запустите приложение

```bash
docker-compose up -d --build
```

## Проверка

- ✅ HTTP: http://vashchenkovaitrader.ru → редирект на HTTPS
- ✅ HTTPS: https://vashchenkovaitrader.ru
- ✅ WWW: https://www.vashchenkovaitrader.ru

## Документация

Подробная документация: [DOMAIN_SETUP.md](./DOMAIN_SETUP.md)

