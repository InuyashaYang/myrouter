@echo off
setlocal

cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\launch.ps1"
if errorlevel 1 (
  echo.
  echo Launch failed. See gateway.err.log / gateway.out.log
  pause
)

exit /b 0
