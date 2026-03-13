# path: scripts/check-terminal-bench.sh
# role: Terminal-Bench 2.0 相当 dataset 実行前の前提条件を確認する
# why: Docker や CLI 不足で実行前に詰まらないよう、mekann 側で事前に欠落を見える化するため
# related: scripts/run-terminal-bench.sh, scripts/tb.sh, scripts/harbor.sh, docs/03-development/06-terminal-bench.md

set -eu

ROOT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
TB_BIN="$ROOT_DIR/.venv-tbench/bin/tb"
HARBOR_BIN="$ROOT_DIR/.venv-tbench/bin/harbor"
eval "$(bash "$ROOT_DIR/scripts/pi-llm-env.sh" --exports)"

status() {
  printf '%s\t%s\n' "$1" "$2"
}

if [ -x "$TB_BIN" ]; then
  status "tb" "ok"
else
  status "tb" "missing"
fi

if [ -x "$HARBOR_BIN" ]; then
  status "harbor" "ok"
else
  status "harbor" "missing"
fi

if command -v docker >/dev/null 2>&1; then
  status "docker" "ok"
else
  status "docker" "missing"
fi

if [ "$PI_TBENCH_HAS_API_KEY" = "1" ]; then
  status "pi_api_key" "present"
else
  status "pi_api_key" "missing"
fi

status "pi_provider" "$PI_TBENCH_PROVIDER"
status "pi_model" "$PI_TBENCH_MODEL"
status "pi_base_url" "$PI_TBENCH_BASE_URL"
status "tbench_agent" "${TBENCH_AGENT:-pi}"

if [ "$PI_TBENCH_HAS_API_KEY" = "1" ] || [ -n "${OPENAI_API_KEY:-}" ] || [ -n "${ANTHROPIC_API_KEY:-}" ] || [ -n "${GEMINI_API_KEY:-}" ]; then
  status "llm_api_key" "present"
else
  status "llm_api_key" "missing"
fi
