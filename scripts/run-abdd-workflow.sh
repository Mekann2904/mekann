#!/bin/bash
# Path: scripts/run-abdd-workflow.sh
# Role: ABDD実行フローを通常モードと厳格モードで統一実行する。
# Why: 日常は高速、PR前は厳格という2段運用を安定して回すため。
# Related: scripts/generate-abdd.ts, scripts/add-jsdoc.ts, scripts/add-abdd-header.ts, package.json

set -euo pipefail

MODE="${1:-fast}"
shift || true

if [[ "$MODE" != "fast" && "$MODE" != "strict" ]]; then
  echo "Usage: $0 [fast|strict] [extra args...]"
  exit 1
fi

EXTRA_ARGS=("$@")

run_cmd() {
  local title="$1"
  shift
  echo ""
  echo "== $title =="
  "$@"
}

retry_once() {
  local title="$1"
  shift
  local -a cmd=("$@")

  echo ""
  echo "== $title =="
  if "${cmd[@]}"; then
    return 0
  fi

  echo "Retrying once: $title"
  "${cmd[@]}"
}

echo "ABDD workflow mode: $MODE"

if [[ "$MODE" == "fast" ]]; then
  run_cmd "Generate ABDD docs" npx tsx scripts/generate-abdd.ts "${EXTRA_ARGS[@]}"
  echo ""
  echo "ABDD fast workflow completed."
  exit 0
fi

# strict mode
retry_once "Regenerate ABDD headers" npx tsx scripts/add-abdd-header.ts --regenerate "${EXTRA_ARGS[@]}"
retry_once "Regenerate JSDoc" npx tsx scripts/add-jsdoc.ts --regenerate "${EXTRA_ARGS[@]}"
run_cmd "Generate ABDD docs" npx tsx scripts/generate-abdd.ts "${EXTRA_ARGS[@]}"

echo ""
echo "ABDD strict workflow completed."
