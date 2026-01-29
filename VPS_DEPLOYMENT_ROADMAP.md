# 🚀 Полный роадмап развертывания AI Trader на VPS Beget

Пошаговое руководство для запуска проекта на VPS сервере Beget с нуля.

**Сервер:** Beget Cloud VPS  
**URL панели:** https://cp.beget.com/cloud/servers/hearty-lazure  
**IP адрес сервера:** `217.114.3.127`  
**DNS серверы:** `ns1.reg.ru`, `ns2.reg.ru`

---

## 📋 Содержание

1. [Подключение к серверу](#1-подключение-к-серверу)
2. [Первоначальная настройка сервера](#2-первоначальная-настройка-сервера)
3. [Установка необходимого ПО](#3-установка-необходимого-по)
4. [Настройка Git и клонирование проекта](#4-настройка-git-и-клонирование-проекта)
5. [Настройка переменных окружения](#5-настройка-переменных-окружения)
6. [Регистрация и настройка домена](#6-регистрация-и-настройка-домена)
7. [Настройка SSL/HTTPS](#7-настройка-sslhttps)
8. [Запуск приложения](#8-запуск-приложения)
9. [Настройка автозапуска](#9-настройка-автозапуска)
10. [Проверка и тестирование](#10-проверка-и-тестирование)
11. [Мониторинг и обслуживание](#11-мониторинг-и-обслуживание)

---

## 1. Подключение к серверу

### 1.1. Получение данных для подключения

1. Войдите в панель Beget: https://cp.beget.com/cloud/servers/hearty-lazure
2. Информация о сервере:
   - **IP адрес сервера:** `217.114.3.127`
   - **Логин** (обычно `root` или указан в панели)
   - **Пароль** (установлен при создании сервера или в панели)

### 1.2. Подключение через SSH

#### Windows (PowerShell или CMD):
```bash
ssh root@217.114.3.127
```

#### Windows (PuTTY):
1. Скачайте PuTTY: https://www.putty.org/
2. Введите IP адрес сервера: `217.114.3.127`
3. Порт: 22
4. Нажмите "Open"
5. Введите логин и пароль

#### Linux/Mac:
```bash
ssh root@217.114.3.127
```

**При первом подключении** подтвердите добавление сервера в known_hosts (введите `yes`).

---

## 2. Первоначальная настройка сервера

### 2.1. Обновление системы

```bash
# Обновление списка пакетов
sudo apt update

# Обновление установленных пакетов
sudo apt upgrade -y

# Перезагрузка (если требуется)
sudo reboot
```

### 2.2. Установка базовых утилит

```bash
# Установка необходимых утилит
sudo apt install -y \
    curl \
    wget \
    git \
    nano \
    htop \
    ufw \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release
```

### 2.3. Настройка часового пояса

```bash
# Установка часового пояса (Москва)
sudo timedatectl set-timezone Europe/Moscow

# Проверка
timedatectl
```

### 2.4. Настройка firewall (UFW)

```bash
# Разрешить SSH (важно сделать первым!)
sudo ufw allow 22/tcp

# Разрешить HTTP и HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Включить firewall
sudo ufw enable

# Проверка статуса
sudo ufw status
```

---

## 3. Установка необходимого ПО

### 3.1. Установка Docker

```bash
# Удаление старых версий (если есть)
sudo apt remove -y docker docker-engine docker.io containerd runc

# Установка зависимостей
sudo apt install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Добавление официального GPG ключа Docker
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Настройка репозитория
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Обновление списка пакетов
sudo apt update

# Установка Docker Engine, Docker CLI и Containerd
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Проверка установки
sudo docker --version
sudo docker compose version

# Добавление текущего пользователя в группу docker (чтобы не использовать sudo)
sudo usermod -aG docker $USER

# Применение изменений (требуется переподключение)
newgrp docker

# Проверка без sudo
docker ps
```

### 3.2. Установка Docker Compose (если не установлен через плагин)

```bash
# Docker Compose обычно устанавливается как плагин
# Если нужна отдельная установка:
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose

# Установка прав на выполнение
sudo chmod +x /usr/local/bin/docker-compose

# Проверка
docker-compose --version
```

### 3.3. Настройка автозапуска Docker

```bash
# Включение автозапуска Docker при загрузке системы
sudo systemctl enable docker
sudo systemctl start docker

# Проверка статуса
sudo systemctl status docker
```

---

## 4. Настройка Git и клонирование проекта

### 4.1. Настройка Git

```bash
# Настройка имени пользователя (замените на ваше)
git config --global user.name "Ваше Имя"

# Настройка email (замените на ваш)
git config --global user.email "your.email@example.com"

# Проверка
git config --list
```

### 4.2. Клонирование проекта

```bash
# Переход в домашнюю директорию
cd ~

# Создание директории для проектов
mkdir -p ~/projects
cd ~/projects

# Клонирование репозитория (замените URL на ваш)
# Если репозиторий приватный, используйте SSH ключ или токен
git clone https://github.com/your-username/ai-trader.git

# Или через SSH (если настроен ключ):
# git clone git@github.com:your-username/ai-trader.git

# Переход в директорию проекта
cd ai-trader

# Проверка содержимого
ls -la
```

### 4.3. Настройка SSH ключа для Git (опционально, но рекомендуется)

```bash
# Генерация SSH ключа
ssh-keygen -t ed25519 -C "your.email@example.com"

# Просмотр публичного ключа
cat ~/.ssh/id_ed25519.pub

# Скопируйте вывод и добавьте в GitHub/GitLab:
# GitHub: Settings -> SSH and GPG keys -> New SSH key
# GitLab: Preferences -> SSH Keys
```

---

## 5. Настройка переменных окружения

### 5.1. Создание .env файла

```bash
# Переход в директорию проекта
cd ~/projects/ai-trader

# Копирование примера конфигурации
cp server/env.example .env

# Открытие файла для редактирования
nano .env
```

### 5.2. Настройка обязательных переменных

Отредактируйте `.env` файл и установите следующие значения:

```env
# ============================================
# БАЗА ДАННЫХ
# ============================================
DB_HOST=postgres
DB_PORT=5432
DB_NAME=smart_exchange
DB_USER=postgres
DB_PASSWORD=ВАШ_НАДЕЖНЫЙ_ПАРОЛЬ_БД

# Генерация надежного пароля:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# ============================================
# БЕЗОПАСНОСТЬ
# ============================================
JWT_SECRET=ВАШ_JWT_SECRET_МИНИМУМ_32_СИМВОЛА

# Генерация JWT_SECRET:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# ============================================
# ФРОНТЕНД URL (для CORS)
# ============================================
# Замените на ваш домен после регистрации
FRONTEND_URL=https://yourdomain.com,https://www.yourdomain.com,http://yourdomain.com,http://www.yourdomain.com

# ============================================
# ТИНЬКОФФ API (обязательно для работы)
# ============================================
TINKOFF_TOKEN=ВАШ_ТОКЕН_ТИНЬКОФФ
TINKOFF_ACCOUNT_ID=ВАШ_ACCOUNT_ID

# ============================================
# ОКРУЖЕНИЕ
# ============================================
NODE_ENV=production

# ============================================
# ПОРТЫ
# ============================================
PORT=3001
CLIENT_PORT=80

# ============================================
# TELEGRAM (опционально)
# ============================================
# TELEGRAM_BOT_TOKEN=ваш_токен_бота
# TELEGRAM_CHAT_ID=ваш_chat_id
```

**Важно:**
- Замените все значения `ВАШ_...` на реальные
- `DB_PASSWORD` и `JWT_SECRET` должны быть надежными (минимум 32 символа)
- `FRONTEND_URL` обновите после регистрации домена

### 5.3. Сохранение файла

В nano:
- Нажмите `Ctrl + O` для сохранения
- Нажмите `Enter` для подтверждения
- Нажмите `Ctrl + X` для выхода

---

## 6. Регистрация и настройка домена

### 6.1. Регистрация домена

#### Вариант A: Регистрация через Beget

1. Войдите в панель Beget: https://cp.beget.com
2. Перейдите в раздел "Домены"
3. Нажмите "Зарегистрировать домен"
4. Выберите и зарегистрируйте домен (например: `yourdomain.ru`)

#### Вариант B: Регистрация через другого регистратора

1. Зарегистрируйте домен у любого регистратора (Reg.ru, Timeweb, etc.)
2. После регистрации перейдите к настройке DNS

### 6.2. Настройка DNS записей

#### Если домен зарегистрирован в Beget:

1. Войдите в панель Beget
2. Перейдите в "Домены" -> выберите ваш домен
3. Перейдите в "DNS-зона"
4. Добавьте/измените записи:

```
Тип    Имя    Значение              TTL
A      @      217.114.3.127         3600
A      www    217.114.3.127         3600
```

**IP адрес сервера:** `217.114.3.127`

#### Если домен зарегистрирован у другого регистратора (например, Reg.ru):

**📖 Подробная инструкция:** См. файл [DNS_SETUP_REG_RU.md](./DNS_SETUP_REG_RU.md)

**Краткая инструкция:**

1. Войдите в панель управления Reg.ru: https://www.reg.ru/
2. Перейдите в раздел **"Домены"** -> выберите ваш домен
3. Убедитесь, что DNS серверы настроены на:
   - `ns1.reg.ru`
   - `ns2.reg.ru`
4. Перейдите в раздел **"DNS-зона"** или **"Управление DNS"**
5. Добавьте/измените записи:

```
Тип    Имя    Значение              TTL
A      @      217.114.3.127         3600
A      www    217.114.3.127         3600
```

**IP адрес сервера:** `217.114.3.127`  
**DNS серверы:** `ns1.reg.ru`, `ns2.reg.ru`

**Примечание:** Для подробной пошаговой инструкции с скриншотами см. файл `DNS_SETUP_REG_RU.md`

### 6.3. Проверка DNS записей

```bash
# Проверка A записи для основного домена
dig yourdomain.com +short

# Проверка A записи для www поддомена
dig www.yourdomain.com +short

# Ожидаемый результат: IP адрес вашего сервера
```

**Время распространения DNS:** Обычно 5-30 минут, но может занять до 24 часов.

---

## 7. Настройка SSL/HTTPS Вернуться сюда

### 7.1. Установка Certbot (Let's Encrypt)

```bash
# Установка Certbot
sudo apt install -y certbot python3-certbot-nginx

# Проверка установки
certbot --version
```

### 7.2. Получение SSL сертификата

**Важно:** DNS записи должны быть настроены и распространены перед получением сертификата!

#### Проверка занятости порта 80

Перед получением сертификата убедитесь, что порт 80 свободен:

```bash
# Проверка, что занимает порт 80
sudo lsof -i :80
# или
sudo netstat -tulpn | grep :80

# Если порт занят, нужно временно освободить его
```

#### Вариант 1: Получение сертификата (если порт 80 свободен)

```bash
# Получение сертификата для домена и www поддомена
# Замените yourdomain.com на ваш реальный домен
sudo certbot certonly --standalone \
  -d yourdomain.com \
  -d www.yourdomain.com

# Следуйте инструкциям:
# - Введите email для уведомлений
# - Примите условия использования (A)
# - Подтвердите email (Y или N)
```

#### Вариант 2: Если порт 80 занят (nginx или Docker контейнеры запущены)

Если у вас уже запущены Docker контейнеры или nginx на хосте:

```bash
# Шаг 1: Определите, что занимает порт 80
sudo lsof -i :80
# или
sudo netstat -tulpn | grep :80

# Вы увидите что-то вроде:
# nginx   14905     root    5u  IPv4  36749      0t0  TCP *:http (LISTEN)
# Это означает, что nginx запущен на хосте

# Шаг 2: Остановите процесс
# Если это nginx на хосте (наиболее вероятно):
sudo systemctl stop nginx

# Или если это Docker контейнеры:
cd ~/projects/ai-trader
docker compose down

# Шаг 3: Проверьте, что порт 80 свободен
sudo lsof -i :80
# Должно быть пусто (или "command not found" если lsof не установлен)

# Шаг 4: Получите сертификат
sudo certbot certonly --standalone \
  -d yourdomain.com \
  -d www.yourdomain.com

# Шаг 5: После получения сертификата
# Если останавливали nginx на хосте, его можно оставить остановленным,
# так как мы будем использовать nginx внутри Docker контейнера.
# Или если хотите запустить обратно:
sudo systemctl start nginx

# Если останавливали Docker контейнеры:
cd ~/projects/ai-trader
docker compose up -d
```

**Примечание:** Если nginx был установлен автоматически при установке certbot (`python3-certbot-nginx`), его можно оставить остановленным, так как мы будем использовать nginx внутри Docker контейнера.

#### Вариант 3: Использование webroot (если веб-сервер уже работает)

Если вы не можете остановить веб-сервер, можно использовать метод webroot:

```bash
# Создайте директорию для проверки
sudo mkdir -p /var/www/certbot

# Получите сертификат через webroot
sudo certbot certonly --webroot \
  -w /var/www/certbot \
  -d yourdomain.com \
  -d www.yourdomain.com

# Примечание: Для этого метода нужно настроить nginx так,
# чтобы он отдавал файлы из /var/www/certbot по пути /.well-known/acme-challenge/
```

**Где сертификаты сохраняются:**
- Сертификат: `/etc/letsencrypt/live/yourdomain.com/fullchain.pem`
- Приватный ключ: `/etc/letsencrypt/live/yourdomain.com/privkey.pem`

### 7.2.1. Подготовка nginx.conf с вашим доменом

После получения SSL сертификата нужно обновить конфигурацию nginx с вашим доменом.

**Важно:** Замените `yourdomain.com` на ваш реальный домен во всех командах ниже!

#### Вариант 1: Использовать шаблон (рекомендуется)

Этот способ автоматически подставит ваш домен во все нужные места в конфигурации.

```bash
# Переход в директорию проекта
cd ~/projects/ai-trader

# Установка gettext для утилиты envsubst (если не установлен)
sudo apt install -y gettext-base

# Создание nginx.conf из шаблона
# ЗАМЕНИТЕ yourdomain.com на ваш реальный домен!
export DOMAIN=yourdomain.com
envsubst '${DOMAIN}' < client/nginx.conf.template > client/nginx.conf

# Проверка результата
cat client/nginx.conf | grep server_name
# Должно показать: server_name yourdomain.com www.yourdomain.com;

# Проверка SSL путей
cat client/nginx.conf | grep ssl_certificate
# Должно показать пути с вашим доменом: /etc/letsencrypt/live/yourdomain.com/...
```

**Пример для домена `example.ru`:**
```bash
export DOMAIN=example.ru
envsubst '${DOMAIN}' < client/nginx.conf.template > client/nginx.conf
```

#### Вариант 2: Редактировать вручную

Если вы предпочитаете редактировать вручную или у вас нет доступа к `envsubst`:

```bash
# Переход в директорию проекта
cd ~/projects/ai-trader

# Создание резервной копии (на всякий случай)
cp client/nginx.conf client/nginx.conf.backup

# Открытие файла для редактирования
nano client/nginx.conf
```

**Что нужно заменить:**
1. Найдите все вхождения `vashchenkovaitrader.ru` (или другого старого домена)
2. Замените на ваш домен (например, `yourdomain.com`)
3. Проверьте следующие места:
   - `server_name` (должно быть: `yourdomain.com www.yourdomain.com`)
   - `ssl_certificate` (должно быть: `/etc/letsencrypt/live/yourdomain.com/fullchain.pem`)
   - `ssl_certificate_key` (должно быть: `/etc/letsencrypt/live/yourdomain.com/privkey.pem`)
   - `Content-Security-Policy` (должно содержать: `wss://yourdomain.com https://yourdomain.com`)

**Быстрая замена через sed (альтернатива):**
```bash
# ЗАМЕНИТЕ yourdomain.com на ваш реальный домен!
sed -i 's/vashchenkovaitrader\.ru/yourdomain.com/g' client/nginx.conf

# Проверка результата
grep -n "yourdomain.com" client/nginx.conf
```

#### Проверка конфигурации nginx

После создания/редактирования файла проверьте его корректность:

```bash
# Переход в директорию проекта (если еще не там)
cd ~/projects/ai-trader

# Вариант 1: Проверка через Docker (рекомендуется)
# Это проверит синтаксис без установки nginx на хост
docker run --rm \
  -v $(pwd)/client/nginx.conf:/etc/nginx/conf.d/default.conf:ro \
  nginx:alpine \
  nginx -t

# ⚠️ ВАЖНО: client/nginx.conf - это конфигурация виртуального хоста (server block),
# а не полный конфигурационный файл nginx. Она предназначена для использования
# внутри Docker контейнера. 
#
# НЕ используйте команду: sudo nginx -t -c "/root/projects/ai-trader/client/nginx.conf"
# Это НЕ СРАБОТАЕТ, так как nginx ожидает полный конфигурационный файл с директивой http {},
# а не только server block.
#
# Используйте ТОЛЬКО проверку через Docker (команда выше) - это правильный способ.
```

**Ожидаемый результат:**

При проверке вы можете увидеть:
1. ✅ Предупреждение о deprecated директиве (если еще не исправлено) - это исправлено в обновленной версии
2. ⚠️ Ошибку `host not found in upstream "server"` - **это нормально!**

**Пример вывода:**
```
nginx: [warn] the "listen ... http2" directive is deprecated... (если не исправлено)
nginx: [emerg] host not found in upstream "server" in /etc/nginx/conf.d/default.conf:61
nginx: configuration file /etc/nginx/nginx.conf test failed
```

**⚠️ Почему это нормально:**

Ошибка `host not found in upstream "server"` возникает потому, что:
- Имя "server" - это имя сервиса из docker-compose
- Оно доступно только когда контейнеры запущены в одной docker-compose сети
- При проверке через отдельный Docker контейнер этот хост недоступен
- **Это НЕ означает, что конфигурация неправильная!**

**Что проверить вручную:**

Вместо автоматической проверки, убедитесь вручную:
1. ✅ Синтаксис правильный (все директивы закрыты, нет опечаток)
2. ✅ `server_name` содержит ваш домен
3. ✅ `ssl_certificate` указывает на правильный путь
4. ✅ `proxy_pass http://server:3001` - это правильно для docker-compose

**В реальной работе:**
Когда контейнеры запущены через `docker compose up`, они будут в одной сети, и имя "server" будет резолвиться корректно. Конфигурация будет работать правильно.

**Альтернативная проверка (только визуальная):**

```bash
# Просто проверьте, что файл существует и читается
cat client/nginx.conf | head -20

# Проверьте основные директивы
grep -E "server_name|ssl_certificate|proxy_pass" client/nginx.conf
```

**Примечание:** Если в выводе вы видите домен `vashchenkovaitrader.ru` - это нормально, если это ваш актуальный домен. Если у вас другой домен, используйте шаблон или замените вручную (см. раздел выше).

#### Что проверяет конфигурация

Убедитесь, что в созданном `client/nginx.conf`:

1. ✅ `server_name` содержит ваш домен (2 раза: для HTTP и HTTPS)
2. ✅ `ssl_certificate` указывает на правильный путь с вашим доменом
3. ✅ `ssl_certificate_key` указывает на правильный путь с вашим доменом
4. ✅ `Content-Security-Policy` содержит `wss://yourdomain.com` и `https://yourdomain.com`

**Пример правильной конфигурации:**
```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;
    
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    # ...
}
```

### 7.3. Настройка автоматического обновления сертификата

```bash
# Проверка автоматического обновления (должно быть включено по умолчанию)
sudo systemctl status certbot.timer

# Если не включено, включите:
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

# Тест обновления (dry-run)
sudo certbot renew --dry-run
```

### 7.4. Обновление .env файла

```bash
# Откройте .env файл
nano ~/projects/ai-trader/.env

# Обновите FRONTEND_URL (замените yourdomain.com на ваш домен)
FRONTEND_URL=https://yourdomain.com,https://www.yourdomain.com,http://yourdomain.com,http://www.yourdomain.com
```

### 7.5. Обновление docker-compose.yml для SSL

```bash
# Откройте docker-compose.yml
nano ~/projects/ai-trader/docker-compose.yml

# Раскомментируйте строки для монтирования SSL сертификатов (строки 87-88):
# Найдите секцию client -> volumes и раскомментируйте:
volumes:
  - /etc/letsencrypt:/etc/letsencrypt:ro
```

---

## 8. Запуск приложения

### 8.1. Проверка docker-compose.yml

```bash
# Переход в директорию проекта
cd ~/projects/ai-trader

# Просмотр конфигурации
cat docker-compose.yml
```

Убедитесь, что в `docker-compose.yml` настроены правильные порты и volumes для SSL.

### 8.2. Сборка и запуск контейнеров

```bash
# Сборка и запуск всех сервисов в фоновом режиме
docker compose up -d --build

# Если сборка клиента падает с ошибкой, попробуйте собрать с более подробными логами:
docker compose build client --progress=plain --no-cache

# Или соберите только клиент для диагностики:
cd ~/projects/ai-trader
docker build -t ai-trader-client:test -f client/Dockerfile client/ --progress=plain

# Просмотр статуса контейнеров
docker compose ps

# Просмотр логов
docker compose logs -f

# Просмотр логов конкретного сервиса при сборке
docker compose logs client
```

**✅ Важно: Nginx запускается автоматически!**

Контейнер `client` использует образ `nginx:alpine` и автоматически запускает nginx при старте контейнера. Nginx будет:
- ✅ Слушать на портах 80 (HTTP) и 443 (HTTPS)
- ✅ Отдавать собранное React приложение из `/usr/share/nginx/html`
- ✅ Использовать конфигурацию из `client/nginx.conf`
- ✅ Проксировать запросы `/api` на backend контейнер `server:3001`
- ✅ Проксировать WebSocket соединения `/ws` на backend
- ✅ Редиректить HTTP на HTTPS (если настроено)

**Проверка работы nginx после запуска:**

```bash
# Проверка, что контейнер client запущен
docker compose ps client

# Проверка логов nginx
docker compose logs client

# Проверка health check nginx
docker compose exec client wget -qO- http://localhost/health
# Должно вернуть: healthy

# Проверка снаружи контейнера
curl http://localhost/
# или
curl http://217.114.3.127/
```

### 8.3. Инициализация базы данных

```bash
# Выполнение миграций и создание пользователя
docker compose exec server npm run init-db

# Проверка подключения к БД
docker compose exec postgres psql -U postgres -d smart_exchange -c "SELECT version();"
```

### 8.4. Проверка работы сервисов

```bash
# Проверка статуса всех контейнеров
docker compose ps

# Проверка логов сервера
docker compose logs server --tail=50

# Проверка логов клиента
docker compose logs client --tail=50

# Проверка логов PostgreSQL
docker compose logs postgres --tail=50
```

---

## 9. Настройка автозапуска

### 9.1. Настройка автозапуска Docker Compose

Создайте systemd service для автоматического запуска приложения:

```bash
# Создание файла сервиса
sudo nano /etc/systemd/system/ai-trader.service
```

Вставьте следующее содержимое (замените пути на ваши):

```ini
[Unit]
Description=AI Trader Application
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/root/projects/ai-trader
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

**Если используете docker-compose (старая версия):**
```ini
[Unit]
Description=AI Trader Application
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/root/projects/ai-trader
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

### 9.2. Активация автозапуска

```bash
# Перезагрузка systemd
sudo systemctl daemon-reload

# Включение автозапуска
sudo systemctl enable ai-trader.service

# Запуск сервиса
sudo systemctl start ai-trader.service

# Проверка статуса
sudo systemctl status ai-trader.service
```

### 9.3. Тестирование автозапуска

```bash
# Остановка контейнеров
docker compose down

# Перезагрузка сервера
sudo reboot

# После перезагрузки проверьте, что контейнеры запустились
docker compose ps
```

---

## 10. Проверка и тестирование

### 10.1. Проверка доступности сервисов

```bash
# Проверка бэкенда (локально на сервере)
curl http://localhost:3001/health

# Проверка фронтенда (локально на сервере)
curl http://localhost/

# Проверка через внешний IP
curl http://217.114.3.127/

# Проверка через домен (после настройки DNS)
curl http://yourdomain.com/
```

### 10.2. Проверка SSL сертификата

```bash
# Проверка сертификата
sudo certbot certificates

# Проверка через curl
curl -I https://yourdomain.com/

# Проверка через браузер
# Откройте https://yourdomain.com/ в браузере
# Должен быть зеленый замочек и "Secure"
```

### 10.3. Проверка WebSocket соединения

```bash
# Проверка WebSocket (требует специальных инструментов)
# Можно проверить через браузерную консоль:
# new WebSocket('wss://yourdomain.com/ws')
```

### 10.4. Проверка API endpoints

```bash
# Health check
curl https://yourdomain.com/api/health

# Проверка авторизации (должна вернуть 401 без токена)
curl https://yourdomain.com/api/auth/me
```

---

## 11. Мониторинг и обслуживание

### 11.1. Мониторинг ресурсов

```bash
# Установка htop (если не установлен)
sudo apt install -y htop

# Запуск мониторинга
htop

# Мониторинг Docker контейнеров
docker stats

# Проверка использования диска
df -h

# Проверка использования памяти
free -h
```

### 11.2. Просмотр логов

```bash
# Все логи
docker compose logs

# Логи конкретного сервиса
docker compose logs server
docker compose logs client
docker compose logs postgres

# Логи с фильтрацией
docker compose logs server | grep ERROR

# Логи в реальном времени
docker compose logs -f server
```

### 11.3. Резервное копирование базы данных

```bash
# Создание бэкапа БД
docker compose exec postgres pg_dump -U postgres smart_exchange > ~/backup_$(date +%Y%m%d_%H%M%S).sql

# Восстановление из бэкапа
docker compose exec -T postgres psql -U postgres smart_exchange < ~/backup_YYYYMMDD_HHMMSS.sql
```

### 11.4. Автоматическое резервное копирование

Создайте скрипт для автоматического бэкапа:

```bash
# Создание скрипта
nano ~/backup-db.sh
```

Вставьте:

```bash
#!/bin/bash
BACKUP_DIR=~/backups
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Создание бэкапа
docker compose exec -T postgres pg_dump -U postgres smart_exchange > $BACKUP_DIR/backup_$DATE.sql

# Удаление старых бэкапов (старше 7 дней)
find $BACKUP_DIR -name "backup_*.sql" -mtime +7 -delete

echo "Backup created: $BACKUP_DIR/backup_$DATE.sql"
```

```bash
# Установка прав на выполнение
chmod +x ~/backup-db.sh

# Добавление в crontab (ежедневно в 3:00)
crontab -e

# Добавьте строку:
0 3 * * * /root/backup-db.sh >> /root/backup.log 2>&1
```

### 11.5. Обновление приложения

```bash
# Переход в директорию проекта
cd ~/projects/ai-trader

# Остановка контейнеров
docker compose down

# Обновление кода из репозитория
git pull

# Пересборка и запуск
docker compose up -d --build

# Выполнение миграций (если есть)
docker compose exec server npm run init-db

# Проверка статуса
docker compose ps
```

---

## 🔧 Дополнительные настройки

### Настройка Nginx для проксирования (если нужно)

Если вы хотите использовать внешний Nginx вместо встроенного в клиенте:

```bash
# Установка Nginx
sudo apt install -y nginx

# Создание конфигурации
sudo nano /etc/nginx/sites-available/ai-trader
```

Вставьте:

```nginx
upstream backend {
    server 127.0.0.1:3001;
}

server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    # Редирект на HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    # SSL настройки
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location /api {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket
    location /ws {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

```bash
# Активация конфигурации
sudo ln -s /etc/nginx/sites-available/ai-trader /etc/nginx/sites-enabled/

# Проверка конфигурации
sudo nginx -t

# Перезапуск Nginx
sudo systemctl restart nginx
```

---

## 🐛 Решение проблем

### Проблема: Не могу подключиться по SSH

**Решение:**
1. IP адрес сервера: `217.114.3.127`
2. Проверьте, что порт 22 открыт в firewall
3. Убедитесь, что используете правильный логин и пароль
4. Команда подключения: `ssh root@217.114.3.127`

### Проблема: Docker не запускается

**Решение:**
```bash
# Проверка статуса Docker
sudo systemctl status docker

# Перезапуск Docker
sudo systemctl restart docker

# Проверка логов
sudo journalctl -u docker
```

### Проблема: Контейнеры не запускаются

**Решение:**
```bash
# Просмотр логов
docker compose logs

# Проверка конфигурации
docker compose config

# Проверка портов
sudo netstat -tulpn | grep LISTEN
```

### Проблема: База данных не подключается

**Решение:**
```bash
# Проверка, что postgres запущен
docker compose ps postgres

# Проверка логов postgres
docker compose logs postgres

# Проверка переменных окружения
docker compose exec server env | grep DB_
```

### Проблема: SSL сертификат не получается

**Решение:**
1. Убедитесь, что DNS записи настроены и распространены
2. Проверьте, что порты 80 и 443 открыты
3. Убедитесь, что на портах 80/443 нет других сервисов

```bash
# Проверка DNS (должен вернуть IP сервера)
dig yourdomain.com +short
# Ожидаемый результат: 217.114.3.127

# Проверка портов
sudo netstat -tulpn | grep -E ':(80|443)'
```

### Проблема: Порт 80 уже занят при получении SSL сертификата

**Ошибка:** `Could not bind TCP port 80 because it is already in use by another process`

**Решение:**

```bash
# Шаг 1: Определите, что занимает порт 80
sudo lsof -i :80
# или
sudo netstat -tulpn | grep :80

# Шаг 2: Остановите процесс
# Если это nginx на хосте (наиболее вероятно):
sudo systemctl stop nginx

# Или если это Docker контейнеры:
cd ~/projects/ai-trader
docker compose down

# Если это другой процесс, найдите его PID и остановите:
# sudo kill -9 <PID>

# Шаг 3: Проверьте, что порт свободен
sudo lsof -i :80
# Должно быть пусто

# Шаг 4: Получите сертификат
sudo certbot certonly --standalone \
  -d yourdomain.com \
  -d www.yourdomain.com

# Шаг 5: После получения сертификата запустите сервисы обратно
cd ~/projects/ai-trader
docker compose up -d
# или
sudo systemctl start nginx
```

### Проблема: Ошибка сборки клиента (npm run build failed)

**Ошибка:** `process "/bin/sh -c npm run build" did not complete successfully: exit code: 1`

**Решение:**

```bash
# Шаг 1: Проверьте детальные логи сборки
cd ~/projects/ai-trader
docker compose build client --progress=plain --no-cache 2>&1 | tee build.log

# Шаг 2: Если видите ошибки TypeScript, проверьте код
# Попробуйте собрать с проверкой типов:
cd client
npm run type-check

# Шаг 3: Проверьте, что все зависимости установлены
rm -rf node_modules package-lock.json
npm install

# Шаг 4: Если проблема с памятью, увеличьте лимит памяти для Docker
# В docker-compose.yml можно добавить:
# services:
#   client:
#     build:
#       context: ./client
#     deploy:
#       resources:
#         limits:
#           memory: 2G

# Шаг 5: Попробуйте собрать только клиент для диагностики
cd ~/projects/ai-trader
docker build -t ai-trader-client:test -f client/Dockerfile client/ --progress=plain
```

**Частые причины:**
- Ошибки TypeScript (проверьте `npm run type-check` в директории client)
- Недостаточно памяти (увеличьте лимит Docker или используйте swap)
- Проблемы с зависимостями (удалите `node_modules` и `package-lock.json`, затем `npm install`)
- Предупреждение о "W3tkqq" можно игнорировать, если это не критично (возможно, это случайная переменная в каком-то файле)

**Если проблема не решается:**
```bash
# Попробуйте собрать без кеша
docker compose build client --no-cache

# Или соберите только сервер и postgres, клиент соберете позже
docker compose up -d postgres server
```

### Проблема: Ошибка "Неподдерживаемый протокол" или "Protocol not supported"

**Ошибка:** `Протокол не поддерживается. Клиент и сервер используют либо разные версии протокола SSL, либо разные наборы шифров`

**Причины:**
1. Устаревшая конфигурация SSL/TLS в nginx
2. Несовместимые наборы шифров
3. Проблемы с сертификатами

**Решение:**

```bash
# Шаг 1: Проверьте текущую конфигурацию nginx
docker compose exec client cat /etc/nginx/conf.d/default.conf | grep -A 10 "ssl_protocols"

# Шаг 2: Проверьте логи nginx на ошибки SSL
docker compose logs client | grep -i ssl
docker compose logs client | grep -i error

# Шаг 3: Проверьте, что сертификаты существуют и доступны
docker compose exec client ls -la /etc/letsencrypt/live/vashchenkovaitrader.ru/

# Шаг 4: Если сертификаты отсутствуют, получите их
sudo certbot certonly --standalone \
  -d vashchenkovaitrader.ru \
  -d www.vashchenkovaitrader.ru

# Шаг 5: Убедитесь, что сертификаты смонтированы в docker-compose.yml
# В docker-compose.yml должно быть (раскомментируйте):
# volumes:
#   - /etc/letsencrypt:/etc/letsencrypt:ro

# Шаг 6: Пересоберите и перезапустите контейнер клиента
cd ~/projects/ai-trader
docker compose up -d --build client

# Шаг 7: Проверьте конфигурацию nginx
docker compose exec client nginx -t

# Шаг 8: Проверьте SSL соединение
openssl s_client -connect vashchenkovaitrader.ru:443 -servername vashchenkovaitrader.ru

# Или через curl
curl -vI https://vashchenkovaitrader.ru/
```

**Если проблема сохраняется:**

```bash
# Временно отключите OCSP stapling (может вызывать проблемы)
# Отредактируйте client/nginx.conf и закомментируйте:
# ssl_stapling on;
# ssl_stapling_verify on;

# Затем пересоберите:
docker compose up -d --build client
```

**Проверка совместимости SSL:**

```bash
# Проверка через SSL Labs (онлайн)
# Откройте: https://www.ssllabs.com/ssltest/analyze.html?d=vashchenkovaitrader.ru

# Проверка поддерживаемых протоколов
nmap --script ssl-enum-ciphers -p 443 vashchenkovaitrader.ru
```

**Важно:** После обновления конфигурации SSL обязательно перезапустите контейнер:
```bash
docker compose restart client
```

### Проблема: Домен не открывается

**Решение:**
1. Проверьте DNS записи (должны указывать на IP сервера)
2. Проверьте firewall (должны быть открыты порты 80 и 443)
3. Проверьте, что контейнеры запущены: `docker compose ps`

---

## 📝 Чеклист развертывания

- [ ] Подключение к серверу по SSH
- [ ] Обновление системы
- [ ] Установка базовых утилит
- [ ] Настройка firewall
- [ ] Установка Docker и Docker Compose
- [ ] Настройка Git
- [ ] Клонирование проекта
- [ ] Создание и настройка .env файла
- [ ] Регистрация домена
- [ ] Настройка DNS записей
- [ ] Установка Certbot
- [ ] Получение SSL сертификата
- [ ] Запуск приложения (docker compose up -d)
- [ ] Инициализация базы данных
- [ ] Настройка автозапуска
- [ ] Проверка работы через домен
- [ ] Настройка резервного копирования

---

## 🔗 Полезные ссылки

- [Beget Cloud Documentation](https://beget.com/ru/kb/articles/cloud)
- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [Certbot Documentation](https://certbot.eff.org/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

---

## 📞 Поддержка

Если возникли проблемы:
1. Проверьте логи: `docker compose logs`
2. Проверьте статус контейнеров: `docker compose ps`
3. Проверьте документацию проекта
4. Обратитесь в поддержку Beget: https://beget.com/ru/support

---

*Документ создан: 2026-01-29*  
*Последнее обновление: 2026-01-29*

