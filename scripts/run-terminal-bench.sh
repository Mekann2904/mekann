# path: scripts/run-terminal-bench.sh
# role: official Terminal-Bench 2.0 相当の dataset または repo ローカル dataset を Harbor で実行する
# why: mekann から benchmark 実行コマンドを固定し、後続の autoresearch にそのまま渡せるようにするため
# related: scripts/harbor.sh, scripts/check-terminal-bench.sh, bench/terminal-bench/README.md, package.json

set -eu

ROOT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
eval "$(bash "$ROOT_DIR/scripts/pi-llm-env.sh" --exports)"
export PYTHONPATH="$ROOT_DIR${PYTHONPATH:+:$PYTHONPATH}"

DATASET="${TBENCH_DATASET:-terminal-bench@2.0}"
DATASET_PATH="${TBENCH_DATASET_PATH:-}"
AGENT="${TBENCH_AGENT:-pi}"
PI_AGENT_IMPORT_PATH="${TBENCH_AGENT_IMPORT_PATH:-bench.tbench_pi_agent.harbor_pi_agent:HarborPiAgent}"
MODEL="${TBENCH_MODEL:-$PI_TBENCH_MODEL}"
JOBS_DIR="${TBENCH_JOBS_DIR:-$ROOT_DIR/.pi/benchmarks/terminal-bench/jobs}"
AGENT_SETUP_TIMEOUT_MULTIPLIER="${TBENCH_AGENT_SETUP_TIMEOUT_MULTIPLIER:-4}"
FORCE_BUILD="${TBENCH_FORCE_BUILD:-}"
EXCLUDE_TASK_NAMES="${TBENCH_EXCLUDE_TASK_NAMES:-gpt2-codegolf}"

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  exec bash "$ROOT_DIR/scripts/harbor.sh" run --help
fi

if ! command -v docker >/dev/null 2>&1; then
  printf '%s\n' "docker is required for terminal-bench runs." \
    "Install Docker Desktop or use another Harbor environment explicitly." >&2
  exit 1
fi

mkdir -p "$JOBS_DIR"

if [ -z "$FORCE_BUILD" ] && [ "$(uname -s)" = "Darwin" ] && [ "$(uname -m)" = "arm64" ]; then
  FORCE_BUILD="1"
fi

if [ "$AGENT" = "codex" ]; then
  if [ "$PI_TBENCH_HAS_API_KEY" != "1" ]; then
    printf '%s\n' "pi zai API key is required for codex + glm-5 runs." \
      "Expected auth at: $PI_TBENCH_AGENT_DIR/auth.json" >&2
    exit 1
  fi

  export OPENAI_API_KEY="$PI_TBENCH_API_KEY"
  export OPENAI_BASE_URL="${TBENCH_OPENAI_BASE_URL:-$PI_TBENCH_BASE_URL}"
fi

set -- --jobs-dir "$JOBS_DIR" --agent-setup-timeout-multiplier "$AGENT_SETUP_TIMEOUT_MULTIPLIER" "$@"

if [ "$AGENT" = "pi" ]; then
  set -- --agent-import-path "$PI_AGENT_IMPORT_PATH" "$@"
else
  set -- --agent "$AGENT" "$@"
fi

if [ -n "$MODEL" ]; then
  set -- "$@" --model "$MODEL"
fi

if [ "$FORCE_BUILD" = "1" ]; then
  set -- "$@" --force-build
fi

if [ -n "$EXCLUDE_TASK_NAMES" ]; then
  OLD_IFS="${IFS}"
  IFS=','
  for task_name in $EXCLUDE_TASK_NAMES; do
    if [ -n "$task_name" ]; then
      set -- "$@" --exclude-task-name "$task_name"
    fi
  done
  IFS="${OLD_IFS}"
fi

if [ -n "$DATASET_PATH" ]; then
  exec bash "$ROOT_DIR/scripts/harbor.sh" run --path "$DATASET_PATH" "$@"
fi

exec bash "$ROOT_DIR/scripts/harbor.sh" run --dataset "$DATASET" "$@"
