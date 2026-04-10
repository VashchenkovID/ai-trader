# Деплой на VPS (Docker + хостовый nginx)

## Схема

- **Postgres, FastAPI, фронт** — `docker compose` из корня репозитория.
- Фронт-контейнер отдаёт **только HTTP:80** внутри сети compose; снаружи по умолчанию **8080→80**.
- **TLS и домен** — системный nginx на хосте, прокси на `127.0.0.1:8080`.

## Корневой `.env` (рядом с `docker-compose.yml`)

См. `.env.docker.example`: `DATABASE_URL_DOCKER`, `POSTGRES_*`, пустой `VITE_API_BASE_URL` для прод-сборки.

## Запуск стека

```bash
docker compose build --no-cache frontend
docker compose up -d
curl -sI http://127.0.0.1:8080/health
```

## Хостовый nginx

1. Скопируйте [`nginx-host-reverse-proxy.example.conf`](nginx-host-reverse-proxy.example.conf) в `/etc/nginx/sites-available/`, при необходимости поправьте порт, если `FRONTEND_PORT` не 8080.
2. Включите сайт в `sites-enabled`, проверьте `nginx -t`, перезагрузите nginx.
3. Если `ssl_dhparams.pem` нет — строка `ssl_dhparam` в примере закомментирована; при необходимости создайте через certbot или уберите include, если certbot выдаёт ошибку.

## Альтернатива без хостового nginx

Освободите порты 80/443 на хосте и в корневом `.env` задайте `FRONTEND_PORT=80` и при необходимости `FRONTEND_PORT_HTTPS=443`; тогда нужен снова TLS **внутри** контейнера (отдельный `nginx.conf` с ssl — не в текущем репозитории по умолчанию).
