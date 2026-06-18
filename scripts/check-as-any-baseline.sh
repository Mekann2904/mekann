#!/usr/bin/env bash
# Fail CI if the non-test `as any` count grew beyond the committed baseline.
# Companion to eslint.config.mjs (`@typescript-eslint/no-explicit-any`) for
# issue #141. The baseline tracks the literal string `as any` in production
# TypeScript sources; ESLint additionally flags `: any` and other explicit-any
# forms on the error-tier files.
#
# Counting methodology (matches issue #141's "117 件" baseline): ripgrep line
# count of the string `as any` across `mekann/**/*.ts`, excluding tests.
#
# Exit codes:
#   0  current count <= baseline (CI green)
#   1  current count >  baseline (regression — CI red)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BASELINE_FILE="scripts/as-any-baseline.json"
if [ ! -f "$BASELINE_FILE" ]; then
	echo "::error::Baseline file $BASELINE_FILE not found."
	exit 1
fi

BASELINE=$(node -pe "JSON.parse(require('fs').readFileSync('$BASELINE_FILE','utf8')).as_any_count")

# Count `as any` occurrences in non-test TypeScript sources under mekann/.
count_as_any() {
	if command -v rg >/dev/null 2>&1; then
		# rg exits 1 when there are no matches; tolerate that under pipefail.
		# Methodology matches issue #141's 117-instance baseline: exclude test
		# files (*.test.ts / *.spec.ts) only.
		local lines
		lines=$(rg "as any" --type ts \
			-g '!**/*.test.ts' -g '!**/*.spec.ts' \
			mekann/ 2>/dev/null || true)
		echo "$lines" | wc -l | tr -d ' '
	else
		# Fallback: grep (CI runners ship ripgrep, so this is rarely used).
		grep -rn --include='*.ts' --exclude='*.test.ts' --exclude='*.spec.ts' \
			'as any' mekann/ 2>/dev/null | wc -l | tr -d ' '
	fi
}

CURRENT=$(count_as_any)
# Treat empty (no matches) as 0.
CURRENT=${CURRENT:-0}

echo "Non-test 'as any' count: $CURRENT (baseline: $BASELINE)"

if [ "$CURRENT" -gt "$BASELINE" ]; then
	echo "::error::'as any' count increased from $BASELINE to $CURRENT."
	echo "::error::Use parseParams()/typed access instead of 'as any' (see mekann/utils/typed-params.ts)."
	echo "::error::If the increase is intentional, lower is fine — but raising requires justification."
	exit 1
fi

if [ "$CURRENT" -lt "$BASELINE" ]; then
	echo "::notice::'as any' count dropped from $BASELINE to $CURRENT. Consider updating $BASELINE_FILE to lock in the gain."
fi

exit 0
