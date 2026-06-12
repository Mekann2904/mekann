#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OSS_DIR="$SCRIPT_DIR/../vendor/oss"

mkdir -p "$OSS_DIR"

declare -A REPOS=(
  ["codex"]="https://github.com/openai/codex.git"
  ["DeepSeek-Reasonix"]="https://github.com/esengine/DeepSeek-Reasonix.git"
  ["pi-mono"]="https://github.com/stefanmohl/pi-mono.git"
)

for dir in "${!REPOS[@]}"; do
  target="$OSS_DIR/$dir"
  url="${REPOS[$dir]}"
  if [ -d "$target/.git" ]; then
    echo "[skip] $dir already cloned at $target"
  else
    echo "[clone] $url -> $target"
    git clone "$url" "$target"
  fi
done

echo ""
echo "All OSS repositories cloned into $OSS_DIR"
