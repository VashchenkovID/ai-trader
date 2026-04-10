# Деплой на VPS (Docker + хостовый nginx)

## Схема

- **Postgres, FastAPI, фронт** — `docker compose` из корня репозитория.
- Фронт-контейнер отдаёт **только HTTP:80** внутри сети compose; снаружи по умолчанию **8080→80**.
- **TLS и домен** — системный nginx на хосте, прокси на `127.0.0.1:8080`.

## Корневой `.env` (рядом с `docker-compose.yml`)

См. `.env.docker.example`: `DATABASE_URL_DOCKER`, `POSTGRES_*`, пустой `VITE_API_BASE_URL` для прод-сборки.

## Запуск стека

**Не задавайте `FRONTEND_PORT=80` в корневом `.env`,** если на сервере уже слушает хостовый nginx на 80/443 — получите `address already in use`. Оставьте дефолт **8080** (или уберите строку `FRONTEND_PORT` из `.env`).

```bash
docker compose build --no-cache frontend
docker compose up -d
curl -sI http://127.0.0.1:8080/health
```

## Хостовый nginx

1. Скопируйте [`nginx-host-reverse-proxy.example.conf`](nginx-host-reverse-proxy.example.conf) в `/etc/nginx/sites-available/vashchenkovaitrader.ru`. В `proxy_pass` укажите тот же порт, что у Docker (`8080`, если `FRONTEND_PORT` не меняли).
2. Убедитесь, что файлы сертификатов по путям `ssl_certificate` уже есть (выпустите через certbot). Пример конфига **не** подключает `options-ssl-nginx.conf`, чтобы `nginx -t` не падал, если certbot ещё не создал этот файл.
3. `sudo nginx -t && sudo systemctl reload nginx`

## Альтернатива без хостового nginx

Освободите порты 80/443 на хосте и только тогда задайте `FRONTEND_PORT=80` в корневом `.env`. Иначе контейнер фронта не поднимется.
