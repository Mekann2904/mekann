#!/usr/bin/env bash
# AUTORESEARCH:generated
set -euo pipefail
PLAN_DIR="$(node -e "console.log(require('./.autoresearch/state.json').currentPlanDir)")"
if [ ! -f "$PLAN_DIR/checks.sh" ]; then echo "No checks.sh for current autoresearch plan" >&2; exit 0; fi
exec "$PLAN_DIR/checks.sh" "$@"
