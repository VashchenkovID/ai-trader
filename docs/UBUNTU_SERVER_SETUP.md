# 🖥️ Руководство по настройке домашнего сервера на Ubuntu

Полное пошаговое руководство по настройке домашнего сервера Ubuntu с нуля для запуска приложения через Docker.

**Целевая система:** Ubuntu Server 22.04 LTS (или новее)  
**Тип сервера:** Домашний сервер (не облачный)  
**Домен:** vashchenkovaitrader.ru  
**Приложение:** AI Trader (Docker Compose)

## 🏠 Особенности домашнего сервера

Это руководство специально адаптировано для домашнего сервера:
- ✅ Работа в локальной сети (192.168.x.x)
- ✅ Настройка доступа из интернета (опционально)
- ✅ Настройка статического IP в локальной сети
- ✅ Проброс портов на роутере (для доступа из интернета)
- ✅ Динамический DNS (если нет статического внешнего IP)

---

## 📋 Содержание

1. [Первоначальная настройка сервера](#1-первоначальная-настройка-сервера)
2. [Установка Docker и Docker Compose](#2-установка-docker-и-docker-compose)
3. [Настройка firewall](#3-настройка-firewall)
4. [Настройка домена и DNS](#4-настройка-домена-и-dns)
5. [Подготовка проекта](#5-подготовка-проекта)
6. [Настройка SSL сертификатов](#6-настройка-ssl-сертификатов)
7. [Запуск приложения](#7-запуск-приложения)
8. [Настройка автоматического запуска](#8-настройка-автоматического-запуска)
9. [Мониторинг и обслуживание](#9-мониторинг-и-обслуживание)
10. [Резервное копирование](#10-резервное-копирование)

---

## 1. Первоначальная настройка сервера

### 1.1. Подключение к серверу

#### Как узнать IP адрес домашнего сервера

Подключите монитор и клавиатуру к серверу, или используйте локальную консоль:

```bash
# Узнать локальный IP адрес в сети
ip addr show
# или
ifconfig
# или
hostname -I

# Пример вывода:
# inet 192.168.1.100/24  <- это ваш локальный IP
```

**Расшифровка вывода `ip addr show`:**

```bash
# Пример вывода:
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc pfifo_fast state UP group default qlen 1000
    link/ether 00:1a:2b:3c:4d:5e brd ff:ff:ff:ff:ff:ff
    inet 192.168.1.100/24 brd 192.168.1.255 scope global eth0
       valid_lft forever preferred_lft forever
```

В этом примере:
- `eth0` - имя сетевого интерфейса
- `192.168.1.100` - ваш локальный IP адрес
- `/24` - маска подсети (255.255.255.0)

**Узнать внешний IP адрес (для доступа из интернета):**

```bash
# На сервере узнайте внешний IP
curl ifconfig.me
# или
curl ipinfo.io/ip
# или
wget -qO- ifconfig.me
```

⚠️ **Важно:** Для доступа из интернета вам также нужно:
- Настроить проброс портов на роутере (port forwarding) - см. раздел 4.1
- Настроить динамический DNS (DDNS) через DuckDNS - см. ниже

#### Настройка DuckDNS для динамического IP

Поскольку у вашего провайдера динамический IP, который может меняться, нужно настроить динамический DNS (DDNS). Мы будем использовать **DuckDNS** - полностью бесплатный и простой сервис.

**Шаг 1: Регистрация на DuckDNS**

1. Откройте https://www.duckdns.org/
2. Войдите через один из доступных провайдеров (Google, Reddit, Twitter, GitHub)
3. После входа вы попадете на панель управления

**Шаг 2: Создание поддомена**

1. В поле "Domain" введите желаемое имя: `vashchenkovaitrader`
2. Нажмите "Add domain"
3. Запишите ваш **токен** (Token) - он понадобится для настройки

**Шаг 3: Установка DuckDNS клиента на сервере**

```bash
# Создать директорию для DuckDNS
mkdir -p ~/duckdns
cd ~/duckdns

# Создать скрипт обновления IP
nano duck.sh
```

Добавьте следующий код (замените `YOUR_TOKEN` на ваш токен из DuckDNS, а `vashchenkovaitrader` на ваше имя домена):

```bash
#!/bin/bash
echo url="https://www.duckdns.org/update?domains=vashchenkovaitrader&token=YOUR_TOKEN&ip=" | curl -k -o ~/duckdns/duck.log -K -
```

```bash
# Сделать скрипт исполняемым
chmod 700 duck.sh

# Протестировать скрипт
./duck.sh

# Проверить результат
cat ~/duckdns/duck.log
# Должно вывести: OK

# Проверить что IP обновился на сайте DuckDNS
```

**Шаг 4: Настройка автоматического обновления**

Настроим автоматическое обновление IP каждые 5 минут:

```bash
# Открыть crontab для редактирования
crontab -e

# Если это первый раз, выберите редактор (например, nano)
# Добавьте следующую строку в конец файла:
*/5 * * * * ~/duckdns/duck.sh >/dev/null 2>&1

# Сохраните и закройте (Ctrl+X, затем Y, затем Enter)
```

**Проверка работы:**

```bash
# Проверить что cron задача добавлена
crontab -l

# Проверить логи (через несколько минут)
cat ~/duckdns/duck.log
```

**Шаг 5: Настройка DNS записей для вашего домена**

После настройки DuckDNS, ваш поддомен будет доступен как `vashchenkovaitrader.duckdns.org`. Теперь нужно настроить ваш основной домен `vashchenkovaitrader.ru` чтобы он указывал на DuckDNS.

В панели управления вашего доменного регистратора создайте CNAME записи:

```
Тип     Имя    Значение                           TTL
CNAME   @      vashchenkovaitrader.duckdns.org    3600
CNAME   www    vashchenkovaitrader.duckdns.org    3600
```

**Альтернатива: Настройка DuckDNS через роутер (если поддерживается)**

Если ваш роутер поддерживает DuckDNS встроенными средствами:

1. Войдите в панель управления роутера
2. Найдите раздел "DDNS" или "Динамический DNS"
3. Выберите провайдера "DuckDNS"
4. Введите:
   - Домен: `vashchenkovaitrader`
   - Токен: `YOUR_TOKEN` (из DuckDNS)
5. Сохраните настройки

Роутер будет автоматически обновлять IP адрес при его изменении.

**Проверка работы DuckDNS:**

```bash
# Проверить текущий IP на DuckDNS
curl https://www.duckdns.org/checkip

# Проверить что поддомен работает
ping vashchenkovaitrader.duckdns.org

# Проверить что основной домен работает (после настройки DNS)
ping vashchenkovaitrader.ru
```

#### Настройка статического локального IP (рекомендуется)

Чтобы IP адрес сервера в локальной сети не менялся при перезагрузке:

```bash
# Узнайте имя сетевого интерфейса
ip addr show
# Примеры: eth0, enp0s3, enp0s8, wlan0

# Редактировать конфигурацию сети
sudo nano /etc/netplan/01-netcfg.yaml
```

Пример конфигурации для статического IP:

```yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    eth0:  # Замените на ваш интерфейс (enp0s3, enp0s8 и т.д.)
      dhcp4: no
      addresses:
        - 192.168.1.100/24  # Ваш желаемый IP (замените на нужный)
      gateway4: 192.168.1.1  # IP вашего роутера (обычно .1)
      nameservers:
        addresses:
          - 8.8.8.8
          - 8.8.4.4
```

```bash
# Применить изменения
sudo netplan apply

# Проверить
ip addr show

# Если есть ошибки, проверьте синтаксис
sudo netplan --debug apply
```

**Важно:**
- Убедитесь, что выбранный IP не занят другим устройством
- Проверьте диапазон IP вашего роутера (обычно 192.168.1.2 - 192.168.1.254)
- Выберите IP вне диапазона DHCP (чтобы роутер не выдал его другому устройству)

#### Подключение по SSH

После того как вы узнали IP адрес:

```bash
# Подключение по локальной сети (если вы в той же сети)
ssh username@192.168.1.100

# Подключение из интернета (если настроен проброс портов)
ssh username@YOUR_EXTERNAL_IP

# Если SSH работает на нестандартном порту
ssh -p 2222 username@YOUR_SERVER_IP

# Если используете ключ SSH
ssh -i ~/.ssh/id_rsa username@YOUR_SERVER_IP
```

**Примеры:**

```bash
# Локальная сеть
ssh deploy@192.168.1.100

# С указанием пользователя root (если разрешен)
ssh root@192.168.1.100

# Если сервер в другой подсети
ssh deploy@10.0.0.50
```

#### Настройка статического IP (рекомендуется для домашнего сервера)

Чтобы IP адрес не менялся при перезагрузке:

```bash
# Редактировать конфигурацию сети
sudo nano /etc/netplan/01-netcfg.yaml
```

Пример конфигурации:

```yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    eth0:  # или enp0s3, enp0s8 - проверьте через 'ip addr'
      dhcp4: no
      addresses:
        - 192.168.1.100/24  # Ваш желаемый IP
      gateway4: 192.168.1.1  # IP вашего роутера
      nameservers:
        addresses:
          - 8.8.8.8
          - 8.8.4.4
```

```bash
# Применить изменения
sudo netplan apply

# Проверить
ip addr show
```

### 1.2. Обновление системы

```bash
# Обновление списка пакетов
sudo apt update

# Обновление всех пакетов
sudo apt upgrade -y

# Перезагрузка (если требуется)
sudo reboot
```

### 1.3. Создание пользователя (если используете root)

```bash
# Создание нового пользователя
sudo adduser deploy

# Добавление пользователя в группу sudo
sudo usermod -aG sudo deploy

# Добавление пользователя в группу docker (будет создана позже)
# sudo usermod -aG docker deploy

# Переключение на нового пользователя
su - deploy
```

### 1.4. Настройка SSH ключей (рекомендуется)

```bash
# На вашем локальном компьютере создайте SSH ключ (если еще нет)
ssh-keygen -t ed25519 -C "your_email@example.com"

# Скопируйте публичный ключ на сервер
ssh-copy-id deploy@YOUR_SERVER_IP

# Отключите вход по паролю (опционально, после проверки ключа)
# sudo nano /etc/ssh/sshd_config
# Установите: PasswordAuthentication no
# sudo systemctl restart sshd
```

### 1.5. Настройка часового пояса

```bash
# Установка часового пояса (Москва)
sudo timedatectl set-timezone Europe/Moscow

# Проверка
timedatectl
```

### 1.6. Установка необходимых утилит

```bash
# Установка базовых утилит
sudo apt install -y \
    curl \
    wget \
    git \
    vim \
    nano \
    htop \
    ufw \
    fail2ban \
    unattended-upgrades \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release
```

---

## 2. Установка Docker и Docker Compose

### 2.1. Установка Docker

```bash
# Удаление старых версий (если есть)
sudo apt remove -y docker docker-engine docker.io containerd runc

# Добавление официального GPG ключа Docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Добавление репозитория Docker
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Обновление списка пакетов
sudo apt update

# Установка Docker Engine
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Проверка установки
sudo docker --version
```

### 2.2. Настройка Docker

```bash
# Добавление пользователя в группу docker (чтобы не использовать sudo)
sudo usermod -aG docker $USER

# Применение изменений (выйдите и войдите снова, или выполните)
newgrp docker

# Проверка работы без sudo
docker run hello-world

# Настройка Docker для автоматического запуска
sudo systemctl enable docker
sudo systemctl start docker

# Проверка статуса
sudo systemctl status docker
```

### 2.3. Установка Docker Compose (если не установлен через плагин)

```bash
# Docker Compose уже установлен как плагин, но можно установить отдельно
# Проверка версии
docker compose version

# Если нужно установить отдельно:
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
docker-compose --version
```

---

## 3. Настройка firewall

### 3.1. Базовая настройка UFW

```bash
# Проверка статуса
sudo ufw status

# Разрешение SSH (ВАЖНО! Сделайте это первым!)
sudo ufw allow 22/tcp

# Разрешение HTTP и HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Разрешение для Docker (если нужно)
# sudo ufw allow from 172.17.0.0/16

# Включение firewall
sudo ufw enable

# Проверка статуса
sudo ufw status verbose
```

### 3.2. Настройка fail2ban (защита от брутфорса)

```bash
# Создание конфигурации для SSH
sudo nano /etc/fail2ban/jail.local
```

Добавьте:

```ini
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = 22
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
```

```bash
# Перезапуск fail2ban
sudo systemctl restart fail2ban
sudo systemctl enable fail2ban

# Проверка статуса
sudo fail2ban-client status
```

---

## 4. Настройка домена и DNS

### 4.1. Получение IP адреса сервера

#### Локальный IP адрес (для локальной сети)

Для домашнего сервера вам нужен локальный IP адрес в вашей домашней сети:

```bash
# Узнайте локальный IP адрес сервера
ip addr show
# или
hostname -I
# или
ifconfig

# Пример вывода:
# 192.168.1.100  <- это ваш локальный IP в домашней сети
```

**Где найти IP адрес:**

1. **На самом сервере** (если есть доступ):
   ```bash
   hostname -I
   ```

2. **Через роутер** (если нет прямого доступа):
   - Войдите в панель управления роутера (обычно `192.168.1.1` или `192.168.0.1`)
   - Найдите раздел "Подключенные устройства" или "DHCP клиенты"
   - Найдите ваше устройство Ubuntu по имени хоста

3. **С другого компьютера в сети**:
   ```bash
   # Windows
   arp -a | findstr "192.168"
   
   # Linux/Mac
   arp -a | grep "192.168"
   ```

#### Внешний IP адрес (для доступа из интернета)

Если вы хотите настроить доступ к серверу из интернета (не только из локальной сети):

```bash
# Узнайте внешний IP адрес (который виден из интернета)
curl ifconfig.me
# или
curl ipinfo.io/ip
# или
wget -qO- ifconfig.me

# Пример вывода:
# 123.45.67.89  <- это ваш внешний IP адрес
```

⚠️ **Важно для домашнего сервера:**

1. **Внешний IP может быть динамическим** - он может меняться при перезагрузке роутера
2. **Для статического IP** - обратитесь к провайдеру (обычно платная услуга)
3. **Альтернатива** - используйте динамический DNS (DDNS) сервисы:
   - **No-IP** (https://www.noip.com/) - бесплатный план доступен
   - **DuckDNS** (https://www.duckdns.org/) - полностью бесплатный
   - **Dynu** (https://www.dynu.com/) - бесплатный план доступен

#### Настройка проброса портов на роутере

Для доступа из интернета нужно настроить проброс портов:

1. Войдите в панель управления роутера (обычно `192.168.1.1` или `192.168.0.1`)
2. Найдите раздел:
   - "Port Forwarding" (проброс портов)
   - "Виртуальные серверы"
   - "NAT" → "Port Mapping"
3. Добавьте правила проброса:
   - **SSH (22)** → `192.168.1.100:22` (локальный IP вашего сервера)
   - **HTTP (80)** → `192.168.1.100:80`
   - **HTTPS (443)** → `192.168.1.100:443`
4. Сохраните настройки

⚠️ **Безопасность:** Открывать SSH порт 22 в интернет не рекомендуется. Используйте:
- Нестандартный порт (например, 2222)
- Только ключи SSH (отключить вход по паролю)
- Fail2ban (см. раздел 3.2)

**Пример настройки проброса портов:**

```
Внешний порт → Внутренний IP:Порт → Протокол
22          → 192.168.1.100:22  → TCP
80          → 192.168.1.100:80  → TCP
443         → 192.168.1.100:443 → TCP
```

### 4.2. Настройка DNS записей

В панели управления вашего доменного регистратора (где вы купили домен `vashchenkovaitrader.ru`) создайте следующие DNS записи:

#### Настройка DNS записей для DuckDNS

Поскольку мы используем DuckDNS для динамического IP, нужно настроить CNAME записи, которые будут указывать на ваш DuckDNS поддомен:

```
Тип     Имя    Значение                           TTL
CNAME   @      vashchenkovaitrader.duckdns.org    3600
CNAME   www    vashchenkovaitrader.duckdns.org    3600
```

**Пример настройки:**

1. Войдите в панель управления вашего доменного регистратора
2. Найдите раздел "DNS записи" или "DNS Management"
3. Создайте CNAME запись для корневого домена:
   - Тип: `CNAME`
   - Имя: `@` (или пустое, означает корневой домен `vashchenkovaitrader.ru`)
   - Значение: `vashchenkovaitrader.duckdns.org`
   - TTL: `3600` (или автоматически)
4. Создайте CNAME запись для поддомена www:
   - Тип: `CNAME`
   - Имя: `www`
   - Значение: `vashchenkovaitrader.duckdns.org`
   - TTL: `3600` (или автоматически)

**Важно:**
- Убедитесь, что DuckDNS уже настроен и работает (см. раздел выше)
- После создания записей DNS изменения могут распространяться до 24-48 часов, обычно 1-2 часа
- Проверить работу можно командой: `ping vashchenkovaitrader.ru`

**Альтернативный вариант (если CNAME для корневого домена не поддерживается):**

Некоторые регистраторы не поддерживают CNAME для корневого домена (`@`). В этом случае:

1. Используйте A запись с текущим IP адресом (который обновляется через DuckDNS):
   ```
   Тип    Имя    Значение              TTL
   A      @      CURRENT_IP_ADDRESS    3600
   ```
   ⚠️ **Проблема:** При смене IP адреса нужно будет вручную обновлять A запись

2. Или используйте сервис, который автоматически обновляет A записи (например, Cloudflare с API)

#### Только для локальной сети (без доступа из интернета)

Если вы хотите использовать домен только в локальной сети:

1. Настройте локальный DNS сервер (например, Pi-hole) или
2. Добавьте записи в `/etc/hosts` на каждом компьютере:

```bash
# На каждом компьютере в сети
sudo nano /etc/hosts
```

Добавьте:

```
192.168.1.100  vashchenkovaitrader.ru
192.168.1.100  www.vashchenkovaitrader.ru
```

### 4.3. Проверка DNS

```bash
# Проверка DNS записей (может занять до 24 часов для распространения)
dig vashchenkovaitrader.ru
dig www.vashchenkovaitrader.ru

# Или используйте nslookup
nslookup vashchenkovaitrader.ru
nslookup www.vashchenkovaitrader.ru
```

---

## 5. Подготовка проекта

### 5.1. Создание директории для проекта

```bash
# Создание директории
sudo mkdir -p /opt/ai-trader
sudo chown $USER:$USER /opt/ai-trader
cd /opt/ai-trader
```

### 5.2. Клонирование проекта (если используете Git)

```bash
# Клонирование репозитория
git clone YOUR_REPOSITORY_URL .

# Или создайте структуру вручную
mkdir -p server client
```

### 5.3. Загрузка файлов проекта

Если у вас нет Git репозитория, загрузите файлы через SCP:

```bash
# На вашем локальном компьютере
scp -r /path/to/project/* deploy@YOUR_SERVER_IP:/opt/ai-trader/
```

Или используйте SFTP клиент (FileZilla, WinSCP и т.д.).

### 5.4. Создание .env файла

```bash
# Создание .env файла на основе примера
cd /opt/ai-trader
cp server/env.example .env

# Редактирование .env файла
nano .env
```

**Минимальная конфигурация для продакшена:**

```env
# ============================================================================
# НАСТРОЙКИ СЕРВЕРА
# ============================================================================
PORT=3001
NODE_ENV=production

# ============================================================================
# БАЗА ДАННЫХ
# ============================================================================
DB_HOST=postgres
DB_PORT=5432
DB_NAME=smart_exchange
DB_USER=postgres
DB_PASSWORD=ВАШ_НАДЕЖНЫЙ_ПАРОЛЬ_БД

# ============================================================================
# НАСТРОЙКИ БЕЗОПАСНОСТИ
# ============================================================================
# Сгенерируйте надежный секрет (минимум 32 символа):
# openssl rand -hex 32
JWT_SECRET=ВАШ_СГЕНЕРИРОВАННЫЙ_JWT_SECRET_МИНИМУМ_32_СИМВОЛА

# Разрешенные домены для CORS
FRONTEND_URL=https://vashchenkovaitrader.ru,https://www.vashchenkovaitrader.ru,http://vashchenkovaitrader.ru,http://www.vashchenkovaitrader.ru

# ============================================================================
# ТИНЬКОФФ ИНВЕСТИЦИИ API
# ============================================================================
TINKOFF_TOKEN=ВАШ_ТИНЬКОФФ_ТОКЕН
TINKOFF_ACCOUNT_ID=ВАШ_ACCOUNT_ID
TINKOFF_API_URL=https://invest-public-api.tinkoff.ru/rest

# ============================================================================
# TELEGRAM BOT (ОПЦИОНАЛЬНО)
# ============================================================================
TELEGRAM_BOT_TOKEN=ВАШ_TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID=ВАШ_CHAT_ID

# ============================================================================
# НАСТРОЙКИ ТОРГОВЛИ
# ============================================================================
VIRTUAL_CAPITAL=1000000
MAX_POSITION_SIZE=0.02
MAX_DRAWDOWN=0.15
MIN_CONFIDENCE=0.6

# ============================================================================
# NEWS API (ОПЦИОНАЛЬНО)
# ============================================================================
NEWS_API_KEY=ВАШ_NEWS_API_KEY
```

### 5.5. Генерация JWT_SECRET

```bash
# Генерация надежного JWT_SECRET
openssl rand -hex 32

# Скопируйте результат в .env файл
```

### 5.6. Установка прав доступа

```bash
# Установка правильных прав на .env файл
chmod 600 .env

# Проверка структуры проекта
ls -la
```

---

## 6. Настройка SSL сертификатов

### 6.1. Установка Certbot (Let's Encrypt)

```bash
# Установка Certbot
sudo apt install -y certbot

# Проверка установки
certbot --version
```

### 6.2. Получение SSL сертификата

**Важно:** Перед получением сертификата убедитесь, что:
- DNS записи настроены и работают
- Порты 80 и 443 открыты в firewall
- Домен указывает на ваш сервер

```bash
# Остановите nginx в Docker (если запущен)
cd /opt/ai-trader
docker-compose down

# Получение сертификата (standalone режим)
sudo certbot certonly --standalone \
  -d vashchenkovaitrader.ru \
  -d www.vashchenkovaitrader.ru \
  --email your_email@example.com \
  --agree-tos \
  --non-interactive

# Сертификаты будут сохранены в:
# /etc/letsencrypt/live/vashchenkovaitrader.ru/fullchain.pem
# /etc/letsencrypt/live/vashchenkovaitrader.ru/privkey.pem
```

### 6.3. Настройка автоматического обновления сертификатов

```bash
# Тест обновления
sudo certbot renew --dry-run

# Настройка автоматического обновления через cron
sudo crontab -e
```

Добавьте строку:

```
0 3 * * * certbot renew --quiet --deploy-hook "cd /opt/ai-trader && docker-compose restart client"
```

### 6.4. Обновление docker-compose.yml

```bash
# Редактирование docker-compose.yml
nano docker-compose.yml
```

В секции `client` раскомментируйте volumes:

```yaml
client:
  volumes:
    - /etc/letsencrypt:/etc/letsencrypt:ro
```

### 6.5. Проверка конфигурации nginx

Убедитесь, что в `client/nginx.conf` используются правильные пути к сертификатам:

```nginx
ssl_certificate /etc/letsencrypt/live/vashchenkovaitrader.ru/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/vashchenkovaitrader.ru/privkey.pem;
```

---

## 7. Запуск приложения

### 7.1. Сборка и запуск

```bash
# Переход в директорию проекта
cd /opt/ai-trader

# Сборка образов
docker-compose build

# Запуск в фоновом режиме
docker-compose up -d

# Просмотр логов
docker-compose logs -f

# Проверка статуса
docker-compose ps
```

### 7.2. Инициализация базы данных

```bash
# Выполнение миграций и создание пользователя
docker-compose exec server npm run init-db

# Проверка подключения к БД
docker-compose exec postgres psql -U postgres -d smart_exchange -c "SELECT version();"
```

### 7.3. Проверка работы

```bash
# Проверка health endpoints
curl http://localhost/health
curl http://localhost:3001/health

# Проверка через домен (после настройки DNS)
curl https://vashchenkovaitrader.ru/health
```

### 7.4. Просмотр логов

```bash
# Все логи
docker-compose logs

# Логи конкретного сервиса
docker-compose logs server
docker-compose logs client
docker-compose logs postgres

# Логи в реальном времени
docker-compose logs -f server
```

---

## 8. Настройка автоматического запуска

### 8.1. Настройка автозапуска Docker Compose

```bash
# Создание systemd service
sudo nano /etc/systemd/system/ai-trader.service
```

Добавьте:

```ini
[Unit]
Description=AI Trader Application
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/ai-trader
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

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

### 8.2. Настройка автозапуска Docker

Docker уже настроен на автозапуск (см. раздел 2.2), но можно проверить:

```bash
sudo systemctl is-enabled docker
```

---

## 9. Мониторинг и обслуживание

### 9.1. Мониторинг ресурсов

```bash
# Установка утилит мониторинга
sudo apt install -y htop iotop nethogs

# Просмотр использования ресурсов
htop

# Просмотр использования диска
df -h

# Просмотр использования Docker
docker stats
```

### 9.2. Ротация логов

```bash
# Создание конфигурации logrotate для Docker
sudo nano /etc/logrotate.d/docker-containers
```

Добавьте:

```
/opt/ai-trader/server/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    missingok
    create 0644 deploy deploy
}
```

### 9.3. Обновление приложения

```bash
# Остановка контейнеров
cd /opt/ai-trader
docker-compose down

# Обновление кода (если используете Git)
git pull

# Пересборка образов
docker-compose build

# Запуск
docker-compose up -d

# Выполнение миграций (если есть)
docker-compose exec server npm run init-db
```

### 9.4. Очистка Docker

```bash
# Удаление неиспользуемых образов
docker image prune -a

# Удаление неиспользуемых volumes
docker volume prune

# Полная очистка (осторожно!)
docker system prune -a --volumes
```

---

## 10. Резервное копирование

### 10.1. Резервное копирование базы данных

```bash
# Создание скрипта бэкапа
nano /opt/ai-trader/backup-db.sh
```

Добавьте:

```bash
#!/bin/bash
BACKUP_DIR="/opt/ai-trader/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

docker-compose exec -T postgres pg_dump -U postgres smart_exchange > $BACKUP_DIR/db_backup_$DATE.sql

# Удаление старых бэкапов (старше 7 дней)
find $BACKUP_DIR -name "db_backup_*.sql" -mtime +7 -delete

echo "Backup completed: db_backup_$DATE.sql"
```

```bash
# Установка прав на выполнение
chmod +x /opt/ai-trader/backup-db.sh

# Тестовый запуск
/opt/ai-trader/backup-db.sh
```

### 10.2. Настройка автоматического бэкапа

```bash
# Добавление в cron
crontab -e
```

Добавьте (бэкап каждый день в 2:00):

```
0 2 * * * /opt/ai-trader/backup-db.sh >> /opt/ai-trader/backups/backup.log 2>&1
```

### 10.3. Резервное копирование файлов

```bash
# Создание скрипта бэкапа файлов
nano /opt/ai-trader/backup-files.sh
```

Добавьте:

```bash
#!/bin/bash
BACKUP_DIR="/opt/ai-trader/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Бэкап .env файла
cp /opt/ai-trader/.env $BACKUP_DIR/.env.backup

# Бэкап логов
tar -czf $BACKUP_DIR/logs_backup_$DATE.tar.gz /opt/ai-trader/server/logs/

# Удаление старых бэкапов (старше 30 дней)
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "Files backup completed"
```

```bash
chmod +x /opt/ai-trader/backup-files.sh
```

---

## 🔧 Полезные команды

### Управление Docker Compose

```bash
# Запуск
docker-compose up -d

# Остановка
docker-compose down

# Перезапуск
docker-compose restart

# Перезапуск конкретного сервиса
docker-compose restart server

# Просмотр логов
docker-compose logs -f

# Выполнение команды в контейнере
docker-compose exec server npm run init-db
docker-compose exec postgres psql -U postgres -d smart_exchange
```

### Диагностика проблем

```bash
# Проверка статуса контейнеров
docker-compose ps

# Проверка логов
docker-compose logs --tail=100

# Проверка использования ресурсов
docker stats

# Проверка сети
docker network ls
docker network inspect ai-trader_ai-trader-network

# Проверка volumes
docker volume ls
```

### Обслуживание

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Перезагрузка сервера
sudo reboot

# Проверка места на диске
df -h
du -sh /opt/ai-trader/*

# Очистка логов
sudo journalctl --vacuum-time=7d
```

---

## 🚨 Решение проблем

### Проблема: Контейнеры не запускаются

```bash
# Проверьте логи
docker-compose logs

# Проверьте конфигурацию
docker-compose config

# Проверьте доступность портов
sudo netstat -tulpn | grep -E '80|443|3001|5432'
```

### Проблема: База данных не подключается

```bash
# Проверьте статус PostgreSQL
docker-compose ps postgres

# Проверьте логи
docker-compose logs postgres

# Проверьте переменные окружения
docker-compose exec server env | grep DB_
```

### Проблема: SSL сертификат не работает

```bash
# Проверьте сертификаты
sudo certbot certificates

# Обновите сертификат
sudo certbot renew

# Проверьте монтирование в Docker
docker-compose exec client ls -la /etc/letsencrypt/live/
```

### Проблема: Домен не работает

```bash
# Проверьте DNS
dig vashchenkovaitrader.ru

# Проверьте firewall
sudo ufw status

# Проверьте nginx
docker-compose logs client
```

---

## 📚 Дополнительные ресурсы

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [Ubuntu Server Guide](https://ubuntu.com/server/docs)

---

## ✅ Чеклист готовности

- [ ] Сервер обновлен и настроен
- [ ] Docker и Docker Compose установлены
- [ ] Firewall настроен (порты 22, 80, 443)
- [ ] DNS записи настроены и работают
- [ ] SSL сертификаты получены
- [ ] Проект загружен на сервер
- [ ] .env файл настроен
- [ ] Приложение запущено и работает
- [ ] База данных инициализирована
- [ ] Автозапуск настроен
- [ ] Резервное копирование настроено
- [ ] Мониторинг настроен

---

**Готово!** Ваше приложение должно быть доступно по адресу https://vashchenkovaitrader.ru

