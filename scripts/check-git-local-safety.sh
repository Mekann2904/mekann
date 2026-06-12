#!/bin/bash
# Guard against accidental local Git config pollution caused by tests or extensions.
# This repository must not be left as a bare repo and must not override the
# developer's identity with test credentials.
set -euo pipefail

repo_root=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [ -z "$repo_root" ]; then
  echo "not inside a git repository" >&2
  exit 1
fi

fail=0

local_core_bare=$(git -C "$repo_root" config --local --get core.bare || true)
if [ "$local_core_bare" = "true" ]; then
  echo "ERROR: local git config has core.bare=true in $repo_root/.git/config" >&2
  fail=1
fi

local_email=$(git -C "$repo_root" config --local --get user.email || true)
local_name=$(git -C "$repo_root" config --local --get user.name || true)

if [ "$local_email" = "test@example.com" ]; then
  echo "ERROR: local git config has test user.email=test@example.com" >&2
  fail=1
fi

if [ "$local_name" = "Test User" ] || [ "$local_name" = "Test" ]; then
  echo "ERROR: local git config has test user.name=$local_name" >&2
  fail=1
fi

if [ $fail -ne 0 ]; then
  cat >&2 <<'EOF'

Refusing to continue because the repository-local Git config was polluted.
Fix with:
  git config --local --unset core.bare || true
  git config --local --unset user.email || true
  git config --local --unset user.name || true

EOF
  exit 1
fi
