# path: scripts/run-pi-local.sh
# role: repo ローカルの agent dir と runtime dir を使って pi を起動する
# why: グローバル設定ロックや環境差分を避け、mekann の実運転デバッグを再現しやすくするため
# related: package.json, .pi/extensions/pi-improvement.ts, scripts/rebuild-better-sqlite3-for-pi.js, README.md

set -eu

ROOT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
LOCAL_AGENT_DIR="$ROOT_DIR/.pi/local-agent"
LOCAL_RUNTIME_DIR="$ROOT_DIR/.pi/runtime"
LOCAL_SETTINGS_FILE="$LOCAL_AGENT_DIR/settings.json"

mkdir -p "$LOCAL_AGENT_DIR" "$LOCAL_RUNTIME_DIR"

if [ ! -f "$LOCAL_SETTINGS_FILE" ]; then
  printf '%s\n' '{' \
    '  "packages": [],' \
    '  "extensions": [],' \
    '  "skills": [],' \
    '  "prompts": [],' \
    '  "themes": []' \
    '}' > "$LOCAL_SETTINGS_FILE"
fi

export PI_CODING_AGENT_DIR="$LOCAL_AGENT_DIR"
export PI_RUNTIME_DIR="$LOCAL_RUNTIME_DIR"

exec "$ROOT_DIR/node_modules/.bin/pi" "$@"
