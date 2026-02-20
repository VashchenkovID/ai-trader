# Скрипт для инициализации базы данных в Docker контейнере (PowerShell)
# Использование:
#   .\docker-init-db.ps1          - обычная инициализация
#   .\docker-init-db.ps1 -Force  - принудительная инициализация (удаляет все таблицы)

param(
    [switch]$Force
)

if ($Force) {
    Write-Host "⚠️  ВНИМАНИЕ: Будет выполнена принудительная инициализация (все таблицы будут удалены)" -ForegroundColor Yellow
}

Write-Host "🐳 Инициализация базы данных в Docker контейнере..." -ForegroundColor Cyan
Write-Host ""

# Проверяем, запущены ли контейнеры
$serverStatus = docker-compose ps | Select-String "ai-trader-server.*Up"

if (-not $serverStatus) {
    Write-Host "📦 Запускаем контейнеры..." -ForegroundColor Cyan
    docker-compose up -d
    
    Write-Host "⏳ Ожидаем готовности сервера..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
}

# Проверяем, что контейнер запущен
$serverStatus = docker-compose ps | Select-String "ai-trader-server.*Up"

if (-not $serverStatus) {
    Write-Host "❌ Ошибка: контейнер ai-trader-server не запущен" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Контейнер запущен" -ForegroundColor Green
Write-Host "🔄 Выполняем инициализацию базы данных..." -ForegroundColor Cyan
Write-Host ""

# Запускаем инициализацию
if ($Force) {
    docker-compose exec -T server npm run init-db:force
} else {
    docker-compose exec -T server npm run init-db
}

Write-Host ""
Write-Host "✅ Инициализация завершена!" -ForegroundColor Green

