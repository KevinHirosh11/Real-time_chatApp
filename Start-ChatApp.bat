@echo off
title Bee Chat App Launcher
setlocal
set SCRIPT_DIR=%~dp0

cls
echo ========================================
echo       Bee Chat App Launcher
echo ========================================
echo.
echo Select launch mode:
echo.
echo   [1] Browser Mode (opens in web browser)
echo   [2] Desktop Mode (opens as desktop app via Electron)
echo   [3] Quit
echo.
set /p choice="Enter your choice (1-3): "

if "%choice%"=="1" (
    echo.
    echo Starting browser mode...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start-chatapp.ps1"
) else if "%choice%"=="2" (
    echo.
    echo Starting desktop mode...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start-chatapp-desktop.ps1"
) else if "%choice%"=="3" (
    echo Exiting...
    exit /b 0
) else (
    echo Invalid choice. Please enter 1, 2, or 3.
    timeout /t 2 >nul
    goto :EOF
)

endlocal
