@echo off
rem Запуск Study Hub: собирает интерфейс при первом запуске, поднимает сервер и открывает браузер.
rem   start.cmd          обычный режим: ваш агент (claude CLI), прогресс в data\
rem   start.cmd --demo   демо без агента: ответы из записей fixtures\mentor, прогресс в data-demo\
cd /d "%~dp0"
if not exist node_modules call npm install --no-fund --no-audit
if not exist packs\ai-engineer.json call npm run -s build:pack
if not exist dist\web\index.html call npx vite build
if "%~1"=="--demo" set STUDY_HUB_DEMO=1
if not defined STUDY_HUB_PORT set STUDY_HUB_PORT=4317
start "" http://127.0.0.1:%STUDY_HUB_PORT%
npx tsx server/index.ts
