@echo off
setlocal
title Horizon Setup
echo.
echo   Starting Horizon Setup...
echo   A window will guide you through the rest. This can take a few minutes the first time.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bootstrap-install.ps1"
endlocal
