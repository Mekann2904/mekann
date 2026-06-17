#!/bin/bash
# Parallel prepush: runs typecheck + fast module tests concurrently.
# Full CI should run npm test to include slow autoresearch tests.
#
# Concurrency is capped (default 3) to avoid CPU oversubscription: each test
# module spawns its own Vitest workers (~CPU-1), so 14 unbounded jobs on an
# 8-core machine drives load average past 14 and slows everything via
# context-switch thrashing. Override the cap with PREPUSH_MAX_JOBS for CI or
# machines with more/fewer cores. Outer cap only — per-module workers are left
# at the Vitest default since they are productively used within each module.
set -euo pipefail

# Run the parallel jobs at a CPU-yielding priority so interactive work
# (editor, browser, this pi session) stays responsive while prepush hammers
# every core. macOS: QoS-clamp each job to "utility" — low CPU priority that
# still uses idle CPU at full speed (unlike "background", which also throttles
# disk I/O) and is inherited by every child process, so all Vitest workers get
# it too — see taskpolicy(8). Linux: fall back to nice. Set PREPUSH_NOPRIORITIZE=1
# to run at normal priority (e.g. a dedicated build box). Note: load average
# still counts these runnable threads, so judge the effect by interactive
# responsiveness, not by load avg.
if [ -z "${PREPUSH_NOPRIORITIZE:-}" ]; then
  if command -v taskpolicy >/dev/null 2>&1; then
    PRIORITIZE="taskpolicy -c utility"
  elif command -v nice >/dev/null 2>&1; then
    PRIORITIZE="nice"
  else
    PRIORITIZE=""
  fi
else
  PRIORITIZE=""
fi

start_ms=$(python3 -c 'import time; print(int(time.time()*1000))')

# Fail before running checks if a previous extension/test run polluted .git/config.
bash scripts/check-git-local-safety.sh

tmpdir=$(mktemp -d)
trap "rm -rf $tmpdir" EXIT

declare -A pids
# Cap simultaneous jobs so total processes stay within the CPU budget.
# Profiled on an 8-core box: 3 jobs -> load1≈4.7, wall≈18s (vs unbounded
# load1≈14.8; sequential CI build ≈35s). Bumping inner Vitest workers down
# instead is counter-productive (mekann's 184 files starve a 2-worker pool).
MAX_JOBS="${PREPUSH_MAX_JOBS:-3}"
declare -A names=( [typecheck]="npm run typecheck"
  [prepare-ci]="npm run check:prepare-ci"
  [workflows]="npm run check:workflows"
  [prompt-core]="npm run test:prompt-core"
  [cache-friendly-prompt]="npm run test:cache-friendly-prompt"
  [agent-guidelines]="npm run test:agent-guidelines"
  [modes-coverage]="npm run check:coverage:modes"
  [sandbox]="npm run test:sandbox"
  [subagent]="npm run test:subagent"
  [zip-repo]="npm run test:zip-repo"
  [autoresearch-fast]="npm run test:autoresearch:fast"
  [goal]="npm run test:goal"
  [output-gate]="npm run test:output-gate"
  [ledger]="npm run test:ledger" )

for name in "${!names[@]}"; do
  # Gate on the running count before launching the next job. kill -0 (not
  # `wait -n`) keeps this compatible with macOS' bundled bash 3.2.
  while true; do
    active=0
    for n in "${!pids[@]}"; do
      kill -0 "${pids[$n]}" 2>/dev/null && active=$((active + 1))
    done
    [ "$active" -lt "$MAX_JOBS" ] && break
    sleep 0.2
  done
  eval "$PRIORITIZE ${names[$name]}" > "$tmpdir/$name.log" 2>&1 & pids[$name]=$!
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

# Fail after checks too: tests/extensions must not leave repo-local Git config polluted.
bash scripts/check-git-local-safety.sh

echo "✓ All checks passed (workflow checks + CI prepare check + modes coverage threshold + typecheck + test suites)"
end_ms=$(python3 -c 'import time; print(int(time.time()*1000))')
elapsed=$((end_ms - start_ms))
echo "METRIC prepush_ms=${elapsed}"
exit 0
