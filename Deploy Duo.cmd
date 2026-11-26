@echo off
rem Duo: double-click to deploy to Cloudflare and push to GitHub
chcp 65001 >nul
cd /d "%~dp0"
title Duo Deploy
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy.ps1"
echo.
if errorlevel 1 (
  echo [x] Deploy failed - see the message above.
) else (
  echo Done. You can close this window.
)
pause
