#!/bin/bash
# Parallel prepush: runs typecheck + fast module tests concurrently.
# Full CI should run npm test to include slow autoresearch tests.
set -euo pipefail

tmpdir=$(mktemp -d)
trap "rm -rf $tmpdir" EXIT

declare -A pids
declare -A names=( [typecheck]="npm run typecheck"
  [prepare-ci]="npm run check:prepare-ci"
  [workflows]="npm run check:workflows"
  [prompt-core]="npm run test:prompt-core"
  [cache-friendly-prompt]="npm run test:cache-friendly-prompt"
  [agent-guidelines]="npm run test:agent-guidelines"
  [plan-mode]="npm run test:plan-mode"
  [sandbox]="npm run test:sandbox"
  [subagent]="npm run test:subagent"
  [zip-repo]="npm run test:zip-repo"
  [autoresearch-fast]="npm run test:autoresearch:fast"
  [goal]="npm run test:goal" )

for name in "${!names[@]}"; do
  eval "${names[$name]}" > "$tmpdir/$name.log" 2>&1 & pids[$name]=$!
done

fail=0
failed_names=""
for name in "${!pids[@]}"; do
  if ! wait ${pids[$name]}; then
    fail=1
    failed_names="$failed_names $name"
  fi
done

if [ $fail -ne 0 ]; then
  echo ""
  for name in $failed_names; do
    echo "=== $name FAILED ==="
    cat "$tmpdir/$name.log"
    echo ""
  done
  exit 1
fi

echo "✓ All checks passed (workflow checks + CI prepare check + typecheck + 9 test suites)"
exit 0
