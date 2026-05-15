$ErrorActionPreference = 'Stop'

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendDir = Join-Path $rootDir 'chat-app'

if (-not (Test-Path $frontendDir)) {
    Write-Host "Missing folder: $frontendDir" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command php -ErrorAction SilentlyContinue)) {
    Write-Host 'PHP is not available in PATH.' -ForegroundColor Red
    exit 1
}

Write-Host 'Launching Bee Chat App (desktop mode)...' -ForegroundColor Cyan
Write-Host 'WebSocket server starts automatically inside the app.' -ForegroundColor Yellow

Start-Process powershell -ArgumentList @(
    '-NoExit',
    '-ExecutionPolicy', 'Bypass',
    '-Command',
    "Set-Location '$frontendDir'; npm run electron-start"
)

Write-Host 'Done. Close the app window to quit.' -ForegroundColor Green
