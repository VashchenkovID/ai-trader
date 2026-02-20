# PowerShell скрипт для обновления порога согласованности в БД
# Использование: .\update-agreement-threshold.ps1 [новое_значение]
# По умолчанию: 0.6

param(
    [double]$NewValue = 0.6
)

Write-Host "🔄 Обновление порога согласованности в БД..." -ForegroundColor Cyan
Write-Host "   Новое значение: $NewValue" -ForegroundColor Yellow

# Получаем имя контейнера БД
$DB_CONTAINER = "ai-trader-db"

# Проверяем, запущен ли контейнер
$containerRunning = docker ps --format "{{.Names}}" | Select-String -Pattern $DB_CONTAINER
if (-not $containerRunning) {
    Write-Host "❌ Контейнер $DB_CONTAINER не запущен!" -ForegroundColor Red
    exit 1
}

# Получаем переменные окружения из контейнера
$DB_NAME = docker exec $DB_CONTAINER printenv POSTGRES_DB 2>$null
if (-not $DB_NAME) { $DB_NAME = "smart_exchange" }

$DB_USER = docker exec $DB_CONTAINER printenv POSTGRES_USER 2>$null
if (-not $DB_USER) { $DB_USER = "postgres" }

Write-Host "   База данных: $DB_NAME" -ForegroundColor Gray
Write-Host "   Пользователь: $DB_USER" -ForegroundColor Gray

# Формируем SQL запрос
$sqlQuery = @"
-- Обновляем значение порога согласованности
UPDATE settings 
SET value = '$NewValue' 
WHERE key = 'auto_trade_min_agreement';

-- Проверяем результат
SELECT key, value, description 
FROM settings 
WHERE key = 'auto_trade_min_agreement';
"@

# Выполняем SQL запрос
Write-Host "`nВыполнение SQL запроса..." -ForegroundColor Gray
$result = docker exec -i $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c $sqlQuery

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Порог согласованности успешно обновлен до $NewValue" -ForegroundColor Green
    Write-Host "`nРезультат:" -ForegroundColor Gray
    Write-Host $result
} else {
    Write-Host "❌ Ошибка при обновлении порога согласованности" -ForegroundColor Red
    exit 1
}

