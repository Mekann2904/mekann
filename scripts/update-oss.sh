#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OSS_DIR="$SCRIPT_DIR/../vendor/oss"

if [ ! -d "$OSS_DIR" ]; then
  echo "No OSS directory found. Run 'npm run clone:oss' first."
  exit 1
fi

for dir in "$OSS_DIR"/*/; do
  name="$(basename "$dir")"
  if [ -d "$dir/.git" ]; then
    echo "[update] $name"
    git -C "$dir" pull --ff-only
  else
    echo "[skip] $name is not a git repository"
  fi
done

echo ""
echo "All OSS repositories updated."
