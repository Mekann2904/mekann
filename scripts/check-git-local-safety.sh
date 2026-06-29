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

# Pollution fingerprints: exact (key,value) pairs leaked by the test suite
# into the SHARED config. Centralised here so the detection set, the --fix
# unset list, and the re-verification all read from one source (issue #171,
# IC-251). Each entry is "key<TAB>value".
pollution_fingerprints=(
  $'core.bare\ttrue'
  $'user.email\ttest@example.com'
  $'user.name\tTest User'
  $'user.name\tTest'
)

# Return 0 (true) and print each match to stderr if any fingerprint is present
# in the shared config. `--get-all` lets git itself handle multi-valued keys and
# values containing `=`, so iterating the table is the whole broad scan and there
# is no need to parse `--list` output ourselves (issue #171, IC-251).
detect_pollution() {
  local fp fkey fval actual matched=1
  for fp in "${pollution_fingerprints[@]}"; do
    fkey="${fp%%$'\t'*}"
    fval="${fp#*$'\t'}"
    while IFS= read -r actual; do
      [ "$actual" = "$fval" ] || continue
      echo "ERROR: shared git config has $fkey=$fval in $shared_config" >&2
      matched=0
    done < <(git config --file "$shared_config" --get-all "$fkey" 2>/dev/null)
  done
  return "$matched"
}

if detect_pollution; then
  fail=1
else
  fail=0
fi

if [ $fail -ne 0 ]; then
  if [ $want_fix -eq 1 ]; then
    echo "Removing test pollution from $shared_config ..." >&2
    # Unset every key named by the fingerprint table (deduped), so --fix covers
    # the whole table from a single source of truth.
    keys_to_unset=$(
      for fp in "${pollution_fingerprints[@]}"; do printf '%s\n' "${fp%%$'\t'*}"; done |
        awk '!seen[$0]++'
    )
    for key in $keys_to_unset; do
      git config --file "$shared_config" --unset "$key" 2>/dev/null || true
    done
    # Re-verify after cleanup.
    if detect_pollution >/dev/null 2>&1; then
      fail=1
    else
      fail=0
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
