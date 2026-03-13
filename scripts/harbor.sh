# path: scripts/harbor.sh
# role: repo ローカル virtualenv に入れた Harbor CLI を呼び出す
# why: Terminal-Bench 2.0 相当 dataset を repo から固定バージョンの Harbor で実行できるようにするため
# related: scripts/tb.sh, scripts/run-terminal-bench.sh, package.json, docs/03-development/06-terminal-bench.md

set -eu

ROOT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
HARBOR_BIN="$ROOT_DIR/.venv-tbench/bin/harbor"

if [ ! -x "$HARBOR_BIN" ]; then
  printf '%s\n' "harbor is not installed in .venv-tbench." \
    "Run: UV_CACHE_DIR=/tmp/uv-cache uv pip install --python .venv-tbench/bin/python harbor terminal-bench" >&2
  exit 1
fi

exec "$HARBOR_BIN" "$@"
