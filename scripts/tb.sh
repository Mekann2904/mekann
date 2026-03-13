# path: scripts/tb.sh
# role: repo ローカル virtualenv に入れた terminal-bench CLI を呼び出す
# why: グローバル環境に依存せず、mekann から同じ tb バイナリを再現可能に使うため
# related: scripts/harbor.sh, scripts/check-terminal-bench.sh, package.json, docs/03-development/06-terminal-bench.md

set -eu

ROOT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
TB_BIN="$ROOT_DIR/.venv-tbench/bin/tb"

if [ ! -x "$TB_BIN" ]; then
  printf '%s\n' "tb is not installed in .venv-tbench." \
    "Run: UV_CACHE_DIR=/tmp/uv-cache uv pip install --python .venv-tbench/bin/python harbor terminal-bench" >&2
  exit 1
fi

exec "$TB_BIN" "$@"
