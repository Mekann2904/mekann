#!/bin/bash
# Guard against accidental local Git config pollution caused by tests or extensions.
# This repository must not be left as a bare repo and must not override the
# developer's identity with test credentials.
#
# IMPORTANT (issue #39): in a linked worktree, `git config --local` targets the
# per-worktree config file, NOT the shared main-repo config (`.git/config`) where
# test pollution actually lands. So detection AND recovery must read/write the
# shared config explicitly via `--file <common-config>`. Using `--local` here would
# both miss the pollution (false negative) and fail to clean it (false "cleaned").
#
# Usage:
#   check-git-local-safety.sh          # detect only (default; used by pre-push hook)
#   check-git-local-safety.sh --fix    # detect and remove the pollution, then re-verify
set -euo pipefail

repo_root=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [ -z "$repo_root" ]; then
  echo "not inside a git repository" >&2
  exit 1
fi

# Resolve the SHARED config path. For a linked worktree, `--git-common-dir` is the
# main repo's `.git`; for the main worktree it is `.git` (often relative). Fall back
# to `--git-dir` if `--git-common-dir` is unavailable (older git).
common_dir=$(git -C "$repo_root" rev-parse --git-common-dir 2>/dev/null || true)
if [ -n "$common_dir" ] && [ -d "$common_dir" ]; then
  case "$common_dir" in
    /*) shared_config="$common_dir/config" ;;
    *)  shared_config="$repo_root/$common_dir/config" ;;
  esac
else
  git_dir=$(git -C "$repo_root" rev-parse --git-dir 2>/dev/null || true)
  case "$git_dir" in
    /*) shared_config="$git_dir/config" ;;
    *)  shared_config="$repo_root/$git_dir/config" ;;
  esac
fi

want_fix=0
if [ "${1:-}" = "--fix" ]; then
  want_fix=1
fi

fail=0

read_pollution() {
  core_bare=$(git config --file "$shared_config" --get core.bare 2>/dev/null || true)
  email=$(git config --file "$shared_config" --get user.email 2>/dev/null || true)
  name=$(git config --file "$shared_config" --get user.name 2>/dev/null || true)
}

read_pollution

if [ "$core_bare" = "true" ]; then
  echo "ERROR: shared git config has core.bare=true in $shared_config" >&2
  fail=1
fi
if [ "$email" = "test@example.com" ]; then
  echo "ERROR: shared git config has test user.email=test@example.com in $shared_config" >&2
  fail=1
fi
if [ "$name" = "Test User" ] || [ "$name" = "Test" ]; then
  echo "ERROR: shared git config has test user.name=$name in $shared_config" >&2
  fail=1
fi

if [ $fail -ne 0 ]; then
  if [ $want_fix -eq 1 ]; then
    echo "Removing test pollution from $shared_config ..." >&2
    git config --file "$shared_config" --unset core.bare 2>/dev/null || true
    git config --file "$shared_config" --unset user.email 2>/dev/null || true
    git config --file "$shared_config" --unset user.name 2>/dev/null || true
    # Re-verify after cleanup.
    read_pollution
    fail=0
    if [ "$core_bare" = "true" ] || [ "$email" = "test@example.com" ] || [ "$name" = "Test User" ] || [ "$name" = "Test" ]; then
      fail=1
    fi
    if [ $fail -ne 0 ]; then
      cat >&2 <<EOF

Cleanup FAILED: pollution still present in $shared_config after --fix.
EOF
      exit 1
    fi
    echo "Cleaned. Re-verification passed." >&2
    exit 0
  fi

  cat >&2 <<EOF

Refusing to continue because the shared Git config was polluted.
The pollution lives in the SHARED config, so \`git config --local --unset\`
(which targets the per-worktree config) will NOT clean it. Use \`--file\`:

  git config --file "$shared_config" --unset core.bare || true
  git config --file "$shared_config" --unset user.email || true
  git config --file "$shared_config" --unset user.name || true

or simply re-run this script with --fix:

  bash $0 --fix

EOF
  exit 1
fi
