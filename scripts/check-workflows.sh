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

if grep -R "run: npm ci$" .github/workflows >/dev/null; then
  echo "Bare 'npm ci' in workflow subdirectories can skip workspace devDependencies." >&2
  echo "Use 'npm ci --workspaces=false' for package-local installs." >&2
  grep -R -n "run: npm ci$" .github/workflows >&2
  exit 1
fi
