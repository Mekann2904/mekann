#!/usr/bin/env bash
# AUTORESEARCH:generated
set -euo pipefail
PLAN_DIR="$(node -e "console.log(require('./.autoresearch/state.json').currentPlanDir)")"
exec "$PLAN_DIR/benchmark.sh" "$@"
