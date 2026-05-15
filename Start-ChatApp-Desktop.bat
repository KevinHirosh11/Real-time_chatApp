@echo off
title Bee Chat App - Desktop Mode
setlocal
set SCRIPT_DIR=%~dp0
set CHAT_APP_DIR=%SCRIPT_DIR%chat-app

echo ========================================
echo    Bee Chat App - Desktop Launcher
echo ========================================
echo.
echo Starting Bee Chat App...
echo (WebSocket server starts automatically inside the app)
echo.

:: Launch Electron app (manages WS server internally)
start "" powershell -NoProfile -ExecutionPolicy Bypass -Command "Set-Location '%CHAT_APP_DIR%'; npm run electron-start"

echo App launched.
echo Close the app window to quit.
endlocal
