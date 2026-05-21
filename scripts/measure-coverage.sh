#!/usr/bin/env bash
# measure-coverage.sh — Aggregate test coverage across all mekann workspaces
# Outputs: total statement coverage as a single integer metric
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

PACKAGES=(
  mekann/core/prompt-core
  mekann/core/cache-friendly-prompt
  mekann/core/agent-guidelines
  mekann/safety/plan-mode
  mekann/safety/sandbox
  mekann/autonomy/subagent
  mekann/utils/zip-repo
  mekann/autonomy/autoresearch
  mekann/autonomy/goal
  mekann/context/output-gate
)

total_stmts=0
total_covered=0
fail=0

for pkg in "${PACKAGES[@]}"; do
  pkg_dir="$REPO_ROOT/$pkg"
  if [ ! -d "$pkg_dir" ]; then
    echo "SKIP $pkg (not found)" >&2
    continue
  fi

  echo ">> $pkg" >&2

  # Run tests with coverage (use --coverage.enabled for v2 vitest config compat)
  if ! (cd "$pkg_dir" && npx vitest run \
    --coverage.enabled=true \
    --coverage.provider=v8 \
    --coverage.reporter=json-summary \
    --coverage.reporter=text \
    --coverage.reportsDirectory=./coverage \
    2>&1 | tail -5); then
    echo "FAIL $pkg — tests failed" >&2
    fail=1
    continue
  fi

  cov_json="$pkg_dir/coverage/coverage-summary.json"
  if [ ! -f "$cov_json" ]; then
    echo "WARN $pkg — no coverage-summary.json" >&2
    continue
  fi

  # Extract total statement counts
  read -r covered total < <(node -e "
    const d = require('$cov_json');
    const t = d.total || {};
    console.log((t.statements?.covered || 0) + ' ' + (t.statements?.total || 0));
  ")
  total_stmts=$((total_stmts + total))
  total_covered=$((total_covered + covered))
  
  pct=0
  if [ "$total" -gt 0 ]; then
    pct=$((covered * 100 / total))
  fi
  echo "   ${pct}% (${covered}/${total} stmts)" >&2
done

if [ "$fail" -eq 1 ]; then
  echo "ERROR: some test suites failed" >&2
  exit 1
fi

if [ "$total_stmts" -gt 0 ]; then
  overall=$((total_covered * 100 / total_stmts))
else
  overall=0
fi

echo "METRIC coverage_pct=${overall}"
echo "SUMMARY: ${total_covered}/${total_stmts} statements covered = ${overall}%"
