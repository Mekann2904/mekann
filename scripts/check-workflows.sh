#!/bin/bash
# Lightweight GitHub Actions checks that do not require Docker.
set -euo pipefail

if ! command -v wrkflw >/dev/null 2>&1; then
  echo "wrkflw is required for workflow validation." >&2
  echo "Install it with: brew install wrkflw" >&2
  exit 1
fi

wrkflw validate --exit-code .github/workflows
wrkflw list --jobs >/dev/null

bare_ci=$(grep -R -n "run: npm ci$" .github/workflows || true)
if [ -n "$bare_ci" ]; then
  # Root-level jobs (no working-directory) legitimately use bare npm ci.
  # Only flag jobs that run inside a workspace subdirectory.
  failed=""
  while IFS= read -r line; do
    # line format: .github/workflows/ci.yml:42:        run: npm ci
    file=$(echo "$line" | cut -d: -f1)
    linenum=$(echo "$line" | cut -d: -f2)
    # Look backwards from linenum for a working-directory directive in the same job
    if grep -B "$((linenum - 1))" "$file" | head -n "$((linenum - 1))" | grep -q 'working-directory:'; then
      failed="$failed\n$line"
    fi
  done <<< "$bare_ci"
  if [ -n "$failed" ]; then
    echo "Bare 'npm ci' in workflow subdirectory jobs can skip workspace devDependencies." >&2
    echo "Use 'npm ci --workspaces=false' for package-local installs." >&2
    echo -e "$failed" >&2
    exit 1
  fi
fi
