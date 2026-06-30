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

start_ms=$(python3 -c 'import time; print(int(time.time()*1000))')

# Fail before running checks if a previous extension/test run polluted .git/config.
bash scripts/check-git-local-safety.sh

tmpdir=$(mktemp -d)
trap "rm -rf $tmpdir" EXIT

# Build the prioritisation prefix as an ARRAY once (issue #171, IC-254). The
# previous `eval "$PRIORITIZE ${names[$name]}"` re-interpreted the string through
# the shell parser, which is an injection vector if PRIORITIZE or a job name ever
# flows in from the environment. Word-splitting into an array and expanding with
# `"${arr[@]}"` avoids eval entirely while still passing the job through verbatim.
prefix=()
if [ -z "${PREPUSH_NOPRIORITIZE:-}" ]; then
  if command -v taskpolicy >/dev/null 2>&1; then
    prefix=(taskpolicy -c utility)
  elif command -v nice >/dev/null 2>&1; then
    prefix=(nice)
  fi
fi

# Bash 4+ supports `wait -n` (block until any background child exits). macOS'
# bundled bash 3.2 does not, so fall back to kill -0 polling there
# (issue #171, IC-253).
use_wait_n=0
if [ "${BASH_VERSINFO[0]:-0}" -ge 4 ]; then
  use_wait_n=1
fi

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

# Count currently-running tracked children.
count_active() {
  local n active=0
  for n in "${!pids[@]}"; do
    kill -0 "${pids[$n]}" 2>/dev/null && active=$((active + 1))
  done
  echo "$active"
}

# Wait until a concurrency slot is free. On bash 4+, block on `wait -n` (no
# busy-loop). On bash 3.2, fall back to a short kill -0 poll. Status is recorded
# per-job via status files below, so reaping a child here is safe.
wait_for_slot() {
  while [ "$(count_active)" -ge "$MAX_JOBS" ]; do
    if [ "$use_wait_n" -eq 1 ]; then
      wait -n 2>/dev/null || sleep 0.05
    else
      sleep 0.2
    fi
  done
}

for name in "${!names[@]}"; do
  wait_for_slot
  # Run the job in a subshell that writes its own exit status to a file. This
  # keeps the authoritative status even if the pid was already reaped by
  # `wait -n` above, so the final collection pass never misses a result.
  read -ra job <<< "${names[$name]}"
  (
    # Disable errexit inside the status-recording subshell so a failing job does
    # not abort before its exit status is written. The authoritative status is
    # the file; the subshell's own exit code is irrelevant.
    set +e
    if [ "${#prefix[@]}" -gt 0 ]; then
      "${prefix[@]}" "${job[@]}"
    else
      "${job[@]}"
    fi
    echo "$?" > "$tmpdir/$name.status"
  ) > "$tmpdir/$name.log" 2>&1 & pids[$name]=$!
done

fail=0
failed_names=""
for name in "${!pids[@]}"; do
  # Block until this child is done (no-op if `wait -n` already reaped it), then
  # read the authoritative status the subshell recorded before exiting.
  wait "${pids[$name]}" 2>/dev/null || true
  status=$(cat "$tmpdir/$name.status" 2>/dev/null || echo "unknown")
  if [ "$status" != "0" ]; then
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
