$ErrorActionPreference = 'Stop'

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$socketDir = Join-Path $rootDir 'socket-server'
$frontendDir = Join-Path $rootDir 'chat-app'

if (-not (Test-Path $socketDir)) {
    Write-Host "Missing folder: $socketDir" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $frontendDir)) {
    Write-Host "Missing folder: $frontendDir" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command php -ErrorAction SilentlyContinue)) {
    Write-Host 'PHP is not available in PATH.' -ForegroundColor Red
    exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host 'npm is not available in PATH.' -ForegroundColor Red
    exit 1
}

Write-Host 'Starting WebSocket server...' -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    '-NoExit',
    '-ExecutionPolicy', 'Bypass',
    '-Command',
    "Set-Location '$socketDir'; php server.php"
)

Write-Host 'Starting React frontend server...' -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    '-NoExit',
    '-ExecutionPolicy', 'Bypass',
    '-Command',
    "Set-Location '$frontendDir'; npm start"
)

Write-Host 'Waiting for frontend to initialize...' -ForegroundColor Yellow
Start-Sleep -Seconds 6

Write-Host 'Opening chat app in browser: http://localhost:3000' -ForegroundColor Green
Start-Process 'http://localhost:3000'

Write-Host 'Done. Keep the opened terminals running while using the app.' -ForegroundColor Green
