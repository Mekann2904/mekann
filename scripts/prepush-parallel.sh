#!/bin/bash
# Parallel prepush: runs typecheck + all module tests concurrently
# Quality-equivalent to sequential execution, but much faster
set -euo pipefail

tmpdir=$(mktemp -d)
trap "rm -rf $tmpdir" EXIT

declare -A pids
declare -A names=( [typecheck]="npm run typecheck"
  [plan-mode]="npm run test:plan-mode"
  [sandbox]="npm run test:sandbox"
  [subagent]="npm run test:subagent"
  [zip-repo]="npm run test:zip-repo"
  [autoresearch]="npm run test:autoresearch"
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

echo "✓ All checks passed (typecheck + 6 test suites)"
exit 0
