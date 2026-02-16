@echo off
setlocal

REM Example:
REM   scripts\run.cmd http://152.53.52.170:3003 sk-xxx local-key-1

set "UPSTREAM_BASE_URL=%~1"
set "UPSTREAM_API_KEY=%~2"
set "LOCAL_API_KEYS=%~3"

if "%UPSTREAM_BASE_URL%"=="" (
  echo Usage: scripts\run.cmd ^<upstream_base_url^> ^<upstream_api_key^> [local_api_keys_csv]
  exit /b 1
)

node src\server.js
