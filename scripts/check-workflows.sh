#!/bin/bash
# Lightweight GitHub Actions checks that do not require Docker.
set -euo pipefail

if ! command -v wrkflw >/dev/null 2>&1; then
  # Best-effort: wrkflw is an external (Homebrew) tool not available on Linux
  # CI runners, Docker images, or fresh contributor machines. Failing hard here
  # blocks `git push` in those environments for no productive reason. Warn and
  # skip so the rest of pre-push still runs; install it locally for full coverage
  # (issue #171, IC-252).
  echo "wrkflw not found; skipping workflow validation." >&2
  echo "Install it for full coverage: brew install wrkflw" >&2
  exit 0
fi

wrkflw validate --exit-code .github/workflows
wrkflw list --jobs >/dev/null

if grep -R "run: npm ci$" .github/workflows >/dev/null; then
  echo "Bare 'npm ci' in workflow subdirectories can skip workspace devDependencies." >&2
  echo "Use 'npm ci --workspaces=false' for package-local installs." >&2
  grep -R -n "run: npm ci$" .github/workflows >&2
  exit 1
fi
