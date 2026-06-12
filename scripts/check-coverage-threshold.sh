#!/bin/bash
# Run a coverage command and fail if coverage-summary.json line coverage is below a threshold.
set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "Usage: $0 <package-dir> <min-lines-pct> <command...>" >&2
  exit 2
fi

package_dir="$1"
min_lines_pct="$2"
shift 2

(
  cd "$package_dir"
  "$@"
  node -e '
    const fs = require("node:fs");
    const summary = JSON.parse(fs.readFileSync("coverage/coverage-summary.json", "utf-8"));
    const actual = Number(summary.total.lines.pct);
    const min = Number(process.argv[1]);
    console.log(`Line coverage: ${actual}% (threshold: ${min}%)`);
    if (actual < min) {
      console.error(`Coverage ${actual}% is below threshold ${min}%`);
      process.exit(1);
    }
  ' "$min_lines_pct"
)
