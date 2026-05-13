#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

# Run tests
cd plan-mode
raw_output=$(npx vitest run 2>&1 || true)
cd ..

# Strip ANSI codes
clean_output=$(printf '%s' "$raw_output" | perl -pe 's/\e\[[0-9;]*[a-zA-Z]//g')

# Parse: "Tests  79 passed (79)" — extract the number before "passed"
test_line=$(printf '%s' "$clean_output" | grep 'Tests ' | grep 'passed' | head -1)
test_count=$(printf '%s' "$test_line" | perl -ne 'print $1 if /(\d+)\s+passed/')
if [ -z "$test_count" ]; then
  test_count=0
fi

if printf '%s' "$clean_output" | grep -q 'failed'; then
  printf '%s' "$clean_output" | tail -20
  echo "METRIC lines=0"
  echo "METRIC test_count=0"
  echo "FAIL: tests failed"
  exit 1
fi

# Count non-test source lines
src_lines=$(find . -name '*.ts' \
  -not -path '*/node_modules/*' \
  -not -name '*.test.ts' \
  -not -name '*.d.ts' \
  -not -name 'vitest.config.ts' \
  | xargs cat | wc -l | tr -d ' ')

echo "METRIC lines=$src_lines"
echo "METRIC test_count=$test_count"

if [ "$test_count" -lt 79 ]; then
  echo "FAIL: test count dropped to $test_count"
  exit 1
fi

echo "PASS: $test_count tests, $src_lines source lines"
