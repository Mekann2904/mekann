#!/usr/bin/env bash
# Maintenance Cost Evaluator
# Measures various aspects of codebase maintainability.
# Lower score = better (less maintenance burden).
set -euo pipefail
cd "$(dirname "$0")"

# 1. Run tests
echo "=== Running tests ==="
test_output=$(npm test 2>&1) || true
tests_passed=true
if echo "$test_output" | grep -q "failed"; then
  tests_passed=false
fi
test_seconds=$(echo "$test_output" | grep -oE 'Duration  [0-9.]+s' | grep -oE '[0-9.]+' | awk '{s+=$1}END{print s}')
if [ -z "$test_seconds" ]; then
  # Fallback: sum Duration lines
  test_seconds=$(echo "$test_output" | grep -oE 'Duration +[0-9.]+s' | grep -oE '[0-9.]+' | awk '{s+=$1}END{print s}')
fi
if [ -z "$test_seconds" ]; then test_seconds="0"; fi
total_tests=$(echo "$test_output" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' | awk '{s+=$1}END{print s}')
failed_tests=$(echo "$test_output" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' | awk '{s+=$1}END{print s+0}') || failed_tests=0
if [ -z "$failed_tests" ]; then failed_tests=0; fi
if [ "$failed_tests" -gt 0 ]; then tests_passed=false; fi
echo "Tests: $total_tests total, $failed_tests failed, ${test_seconds}s"

# 2. Source LOC
source_files=$(find . -maxdepth 2 -name '*.ts' ! -path '*/node_modules/*' ! -name '*.test.*' ! -name 'vitest.config.*')
source_loc=$(cat $source_files | wc -l | tr -d ' ')
echo "Source LOC: $source_loc"

# 3. Test LOC
test_files=$(find . -maxdepth 2 -name '*.test.*' ! -path '*/node_modules/*')
test_loc=$(cat $test_files 2>/dev/null | wc -l | tr -d ' ')
echo "Test LOC: $test_loc"

# 4. File count
file_count=$(echo "$source_files" | wc -l | tr -d ' ')
echo "Source files: $file_count"

# 5. Typecheck (sandbox + subagent have typecheck scripts)
echo "=== Type checking ==="
type_errors=0
for dir in sandbox subagent; do
  if [ -f "$dir/package.json" ] && grep -q '"typecheck"' "$dir/package.json"; then
    tc_output=$(cd "$dir" && npx tsc --noEmit --skipLibCheck 2>&1) || true
    tc_errors=$(echo "$tc_output" | grep -c "error TS" || true)
    type_errors=$((type_errors + tc_errors))
  fi
done
echo "Type errors: $type_errors"

# 6. Complexity: count functions > 50 lines (proxy for complex functions)
echo "=== Complexity analysis ==="
complex_functions=0
for f in $source_files; do
  # Count lines inside function bodies (rough heuristic)
  large_blocks=$(awk '/^(export )?(function |async function |const \w+ = |\*\s)/{start=NR; next} /^}/ && start>0 {if(NR-start>50) count++; start=0} END{print count+0}' "$f")
  complex_functions=$((complex_functions + large_blocks))
done
echo "Functions > 50 lines: $complex_functions"

# 7. Duplication: identical non-trivial lines across source files
echo "=== Duplication analysis ==="
# Count lines that appear in 2+ source files (excluding imports, comments, blank, braces)
dup_lines=$(cat $source_files | grep -v '^\s*$' | grep -v '^\s*//' | grep -v '^\s*{' | grep -v '^\s*}' | grep -v '^\s*import ' | grep -v '^\s*export ' | sed 's/^[[:space:]]*//' | sort | uniq -d | wc -l | tr -d ' ')
echo "Duplicated non-trivial lines: $dup_lines"

# 8. Max file size
max_file_loc=0
max_file_name=""
for f in $source_files; do
  lines=$(wc -l < "$f" | tr -d ' ')
  if [ "$lines" -gt "$max_file_loc" ]; then
    max_file_loc=$lines
    max_file_name=$f
  fi
done
echo "Max file: $max_file_name ($max_file_loc lines)"

# 9. Changed LOC (vs HEAD~1 or initial)
changed_loc=0
if git rev-parse HEAD~1 >/dev/null 2>&1; then
  changed_loc=$(git diff HEAD~1 -- $source_files 2>/dev/null | grep '^[+-]' | grep -v '^[+-][+-][+-]' | wc -l | tr -d ' ') || changed_loc=0
fi
echo "Changed LOC: $changed_loc"

# 10. Behavior regressions (test failures count as regressions)
behavior_regressions=0
if [ "$tests_passed" = "false" ]; then
  behavior_regressions=$failed_tests
fi

# ─── Compute score ─────────────────────────────────────────────

# Weights designed so that:
# - Behavior regressions dominate (100k each)
# - Test failures dominate (10k)
# - Type errors are serious (1k each)
# - Complexity and duplication matter (100s)
# - File size, LOC growth, runtime are smaller factors

review_risk=0
# Large files increase review risk
if [ "$max_file_loc" -gt 500 ]; then
  review_risk=$((review_risk + (max_file_loc - 500) / 50))
fi
# Many source files increase discovery cost
if [ "$file_count" -gt 15 ]; then
  review_risk=$((review_risk + file_count - 15))
fi

complexity_score=$complex_functions
duplication_score=$dup_lines

# Compute
score=0
score=$((score + 100000 * behavior_regressions))
test_fail_indicator=0
if [ "$tests_passed" = "false" ]; then test_fail_indicator=1; fi
score=$((score + 10000 * test_fail_indicator))
score=$((score + 1000 * type_errors))
score=$((score + 100 * review_risk))
score=$((score + 10 * complexity_score))
score=$((score + 10 * duplication_score))
changed_loc_norm=$((changed_loc / 100))
score=$((score + 5 * changed_loc_norm))
test_seconds_int=${test_seconds%.*}
if [ -z "$test_seconds_int" ]; then test_seconds_int=0; fi
score=$((score + test_seconds_int))

# Bonus: source LOC reduction (per 100 LOC reduced vs baseline)
baseline_loc=3977
loc_delta=$((source_loc - baseline_loc))
if [ "$loc_delta" -lt 0 ]; then
  score=$((score - 5 * ((-loc_delta) / 100)))
fi

echo ""
echo "=== MAINTENANCE SCORE ==="
echo "maintenance_score: $score"
echo "tests_passed: $tests_passed"
echo "test_seconds: $test_seconds"
echo "total_tests: $total_tests"
echo "source_loc: $source_loc"
echo "test_loc: $test_loc"
echo "file_count: $file_count"
echo "type_errors: $type_errors"
echo "complexity_score: $complexity_score"
echo "duplication_score: $duplication_score"
echo "max_file_loc: $max_file_loc"
echo "max_file_name: $max_file_name"
echo "changed_loc: $changed_loc"
echo "behavior_regressions: $behavior_regressions"
echo "review_risk: $review_risk"
echo "baseline_loc: $baseline_loc"
echo "loc_delta: $loc_delta"

# Output structured metric for parsing
echo ""
echo "METRIC maintenance_score=$score"
echo "METRIC tests_passed=$tests_passed"
echo "METRIC test_seconds=$test_seconds"
echo "METRIC source_loc=$source_loc"
echo "METRIC behavior_regressions=$behavior_regressions"
echo "METRIC type_errors=$type_errors"
echo "METRIC complexity_score=$complexity_score"
echo "METRIC duplication_score=$duplication_score"
echo "METRIC review_risk=$review_risk"
