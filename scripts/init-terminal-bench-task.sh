# path: scripts/init-terminal-bench-task.sh
# role: mekann 用の private terminal-bench task 雛形を bench/terminal-bench/tasks に作る
# why: official benchmark に加えて repo 固有の task set をすぐ追加できるようにするため
# related: scripts/harbor.sh, bench/terminal-bench/README.md, bench/terminal-bench/tasks/.gitkeep, docs/03-development/06-terminal-bench.md

set -eu

ROOT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
TASKS_DIR="$ROOT_DIR/bench/terminal-bench/tasks"

if [ $# -lt 1 ]; then
  printf '%s\n' "usage: bash scripts/init-terminal-bench-task.sh <task-name>" >&2
  exit 1
fi

mkdir -p "$TASKS_DIR"

exec bash "$ROOT_DIR/scripts/harbor.sh" tasks init "$1" \
  --tasks-dir "$TASKS_DIR" \
  --include-standard-metadata
