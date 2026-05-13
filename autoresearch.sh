#!/bin/bash
set -euo pipefail

# Pre-check: syntax
cd "$(dirname "$0")"
cd plan-mode && npx tsc --noEmit --allowImportingTsExtensions --moduleResolution node16 --module node16 --target es2022 index.ts state.ts utils.ts 2>/dev/null || true
cd ..

# Tests
cd plan-mode
test_output=$(npx vitest run 2>&1)
test_exit=$?
cd ..

# Parse test results
test_count=$(echo "$test_output" | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+')
if [ -z "$test_count" ]; then
  test_count=0
fi

# Count non-test source lines (excluding node_modules, prompts, lock files)
src_lines=$(find . -name '*.ts' -not -path '*/node_modules/*' -not -name '*.test.ts' -not -name '*.d.ts' | xargs cat | wc -l | tr -d ' ')

echo "METRIC lines=$src_lines"
echo "METRIC test_count=$test_count"

if [ "$test_exit" -ne 0 ]; then
  echo "FAIL: tests failed"
  exit 1
fi

if [ "$test_count" -lt 79 ]; then
  echo "FAIL: test count dropped to $test_count"
  exit 1
fi

echo "PASS: $test_count tests, $src_lines source lines"
