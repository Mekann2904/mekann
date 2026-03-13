# path: scripts/check-terminal-bench.sh
# role: Terminal-Bench 2.0 相当 dataset 実行前の前提条件を確認する
# why: Docker や CLI 不足で実行前に詰まらないよう、mekann 側で事前に欠落を見える化するため
# related: scripts/run-terminal-bench.sh, scripts/tb.sh, scripts/harbor.sh, docs/03-development/06-terminal-bench.md

set -eu

ROOT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
TB_BIN="$ROOT_DIR/.venv-tbench/bin/tb"
HARBOR_BIN="$ROOT_DIR/.venv-tbench/bin/harbor"
JOBS_DIR="${TBENCH_JOBS_DIR:-$ROOT_DIR/.pi/benchmarks/terminal-bench/jobs}"
AUTORESEARCH_JOBS_DIR="${TBENCH_AUTORESEARCH_JOBS_DIR:-$ROOT_DIR/.pi/autoresearch/tbench/jobs}"
MIN_FREE_KB="${TBENCH_MIN_FREE_KB:-8388608}"
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

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  status "docker_daemon" "ok"
else
  status "docker_daemon" "unreachable"
  printf '%s\n' \
    "warning: docker daemon is not reachable." \
    "Start Docker Desktop or Colima before running terminal-bench." >&2
fi

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  docker_storage_output="$(docker system df 2>&1 || true)"
  if printf '%s' "$docker_storage_output" | grep -qi 'input/output error'; then
    status "docker_storage" "corrupt"
    printf '%s\n' \
      "warning: docker storage looks corrupted." \
      "Colima may need docker prune or colima delete --force." >&2
  elif [ -n "$docker_storage_output" ]; then
    status "docker_storage" "ok"
  else
    status "docker_storage" "unknown"
  fi
else
  status "docker_storage" "unchecked"
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
status "tbench_jobs_dir" "$JOBS_DIR"
status "tbench_n_concurrent" "${TBENCH_N_CONCURRENT:-2}"

mkdir -p "$JOBS_DIR"
mkdir -p "$AUTORESEARCH_JOBS_DIR"

free_kb="$(df -k "$JOBS_DIR" | awk 'NR==2 {print $4}')"
if [ -n "$free_kb" ] && [ "$free_kb" -ge "$MIN_FREE_KB" ]; then
  status "disk_free_kb" "$free_kb"
else
  status "disk_free_kb" "${free_kb:-unknown}"
  printf '%s\n' \
    "warning: free disk space is below recommended threshold for terminal-bench." \
    "Set TBENCH_MIN_FREE_KB to tune the threshold. Current default is 8 GiB." >&2
fi

benchmark_jobs_kb="$(du -sk "$JOBS_DIR" 2>/dev/null | awk '{print $1}')"
autoresearch_jobs_kb="$(du -sk "$AUTORESEARCH_JOBS_DIR" 2>/dev/null | awk '{print $1}')"
status "tbench_jobs_kb" "${benchmark_jobs_kb:-0}"
status "autoresearch_jobs_kb" "${autoresearch_jobs_kb:-0}"

if [ "$PI_TBENCH_HAS_API_KEY" = "1" ] || [ -n "${OPENAI_API_KEY:-}" ] || [ -n "${ANTHROPIC_API_KEY:-}" ] || [ -n "${GEMINI_API_KEY:-}" ]; then
  status "llm_api_key" "present"
else
  status "llm_api_key" "missing"
fi
