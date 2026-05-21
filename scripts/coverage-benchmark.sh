#!/usr/bin/env bash
set -euo pipefail

# テストカバレッジベンチマークスクリプト
# 各ワークスペースの coverage を収集し加重平均を出力

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

WORKSPACES=(
  "mekann/autonomy/subagent"
  "mekann/autonomy/goal"
  "mekann/safety/plan-mode"
  "mekann/safety/sandbox"
  "mekann/context/output-gate"
  "mekann/core/prompt-core"
  "mekann/core/agent-guidelines"
  "mekann/core/cache-friendly-prompt"
  "mekann/utils/zip-repo"
)

TOTAL_STMTS=0
COVERED_STMTS=0
TOTAL_BRANCHES=0
COVERED_BRANCHES=0
TOTAL_FUNCS=0
COVERED_FUNCS=0
TOTAL_LINES=0
COVERED_LINES=0

for ws in "${WORKSPACES[@]}"; do
  wsdir="$ROOT_DIR/$ws"
  if [ ! -d "$wsdir" ]; then
    echo "SKIP: $ws (not found)" >&2
    continue
  fi

  echo ">> $ws" >&2

  # coverage を実行
  (cd "$wsdir" && npx vitest run --coverage 2>/dev/null) || true

  # coverage-summary.json または coverage-final.json を探す
  SUMMARY_FILE=""
  for f in "$wsdir/coverage/coverage-summary.json" "$wsdir/coverage/coverage-final.json"; do
    if [ -f "$f" ]; then
      SUMMARY_FILE="$f"
      break
    fi
  done

  if [ -z "$SUMMARY_FILE" ]; then
    echo "   SKIP: no coverage file" >&2
    continue
  fi

  # JSON からメトリクスを抽出する node スクリプト
  METRICS=$(node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync('$SUMMARY_FILE', 'utf8'));

    let totalS = 0, coveredS = 0, totalB = 0, coveredB = 0;
    let totalF = 0, coveredF = 0, totalL = 0, coveredL = 0;

    if (data.total) {
      // coverage-summary.json format
      totalS = data.total.statements.total;
      coveredS = data.total.statements.covered;
      totalB = data.total.branches.total;
      coveredB = data.total.branches.covered;
      totalF = data.total.functions.total;
      coveredF = data.total.functions.covered;
      totalL = data.total.lines.total;
      coveredL = data.total.lines.covered;
    } else {
      // Istanbul coverage-final.json format
      for (const file of Object.values(data)) {
        totalS += Object.keys(file.s).length;
        coveredS += Object.values(file.s).filter(v => v > 0).length;
        totalF += Object.keys(file.fnMap).length;
        coveredF += Object.keys(file.f).filter(k => file.f[k] > 0).length;
        totalB += Object.keys(file.b).reduce((sum, k) => sum + file.b[k].length, 0);
        coveredB += Object.keys(file.b).reduce((sum, k) => sum + file.b[k].filter(v => v > 0).length, 0);
        // lines from statementMap
        const lines = new Set();
        const coveredLines = new Set();
        for (const [k, v] of Object.entries(file.statementMap)) {
          for (let l = v.start.line; l <= v.end.line; l++) lines.add(l);
          if (file.s[k] > 0) for (let l = v.start.line; l <= v.end.line; l++) coveredLines.add(l);
        }
        totalL += lines.size;
        coveredL += coveredLines.size;
      }
    }

    console.log(totalS + ' ' + coveredS + ' ' + totalB + ' ' + coveredB + ' ' + totalF + ' ' + coveredF + ' ' + totalL + ' ' + coveredL);
  " 2>/dev/null) || continue

  read s_stmts s_covered b_total b_covered f_total f_covered l_total l_covered <<< "$METRICS"

  TOTAL_STMTS=$((TOTAL_STMTS + s_stmts))
  COVERED_STMTS=$((COVERED_STMTS + s_covered))
  TOTAL_BRANCHES=$((TOTAL_BRANCHES + b_total))
  COVERED_BRANCHES=$((COVERED_BRANCHES + b_covered))
  TOTAL_FUNCS=$((TOTAL_FUNCS + f_total))
  COVERED_FUNCS=$((COVERED_FUNCS + f_covered))
  TOTAL_LINES=$((TOTAL_LINES + l_total))
  COVERED_LINES=$((COVERED_LINES + l_covered))

  echo "   stmts: ${s_covered}/${s_stmts}" >&2
done

if [ "$TOTAL_STMTS" -gt 0 ]; then
  STMT_PCT=$(echo "scale=2; $COVERED_STMTS * 100 / $TOTAL_STMTS" | bc)
  BRANCH_PCT=$(echo "scale=2; $COVERED_BRANCHES * 100 / $TOTAL_BRANCHES" | bc)
  FUNC_PCT=$(echo "scale=2; $COVERED_FUNCS * 100 / $TOTAL_FUNCS" | bc)
  LINE_PCT=$(echo "scale=2; $COVERED_LINES * 100 / $TOTAL_LINES" | bc)
else
  STMT_PCT=0; BRANCH_PCT=0; FUNC_PCT=0; LINE_PCT=0
fi

echo "" >&2
echo "=== Overall Coverage ===" >&2
echo "Statements: ${STMT_PCT}% (${COVERED_STMTS}/${TOTAL_STMTS})" >&2
echo "Branches:   ${BRANCH_PCT}% (${COVERED_BRANCHES}/${TOTAL_BRANCHES})" >&2
echo "Functions:  ${FUNC_PCT}% (${COVERED_FUNCS}/${TOTAL_FUNCS})" >&2
echo "Lines:      ${LINE_PCT}% (${COVERED_LINES}/${TOTAL_LINES})" >&2

# composite: (stmt + branch + func + line) / 4 を basis points (×100)
COMPOSITE=$(echo "scale=0; ($COVERED_STMTS * 10000 / $TOTAL_STMTS + $COVERED_BRANCHES * 10000 / $TOTAL_BRANCHES + $COVERED_FUNCS * 10000 / $TOTAL_FUNCS + $COVERED_LINES * 10000 / $TOTAL_LINES) / 4" | bc)
echo "METRIC: coverage_composite=${COMPOSITE}"

echo "" >&2
echo "=== Primary metric: coverage_composite = ${COMPOSITE} (higher is better) ===" >&2
