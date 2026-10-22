#!/usr/bin/env sh
# Запуск Study Hub (macOS, Linux): собирает интерфейс при первом запуске, поднимает сервер и открывает браузер.
#   ./start.sh          обычный режим: ваш агент (claude CLI), прогресс в data/
#   ./start.sh --demo   демо без агента: ответы из записей fixtures/mentor, прогресс в data-demo/
cd "$(dirname "$0")" || exit 1
[ -d node_modules ] || npm install --no-fund --no-audit
[ -f packs/ai-engineer.json ] || npm run -s build:pack
[ -f dist/web/index.html ] || npx vite build
[ "$1" = "--demo" ] && export STUDY_HUB_DEMO=1
PORT="${STUDY_HUB_PORT:-4317}"
( sleep 2; (command -v xdg-open >/dev/null && xdg-open "http://127.0.0.1:$PORT") || open "http://127.0.0.1:$PORT" ) >/dev/null 2>&1 &
exec npx tsx server/index.ts
