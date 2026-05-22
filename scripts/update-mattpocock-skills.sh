#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

git remote add mattpocock-skills https://github.com/mattpocock/skills.git 2>/dev/null || true
git fetch mattpocock-skills main

if [ ! -d "vendor/mattpocock-skills" ]; then
  git subtree add \
    --prefix=vendor/mattpocock-skills \
    mattpocock-skills main \
    --squash
else
  git subtree pull \
    --prefix=vendor/mattpocock-skills \
    mattpocock-skills main \
    --squash
fi

# Import the upstream skills that this package exposes into the Pi-maintained
# skill directory. Pi reads mekann/skills directly; developers edit these copied
# files after import to make them suitable for Pi.
for skill in grill-with-docs improve-codebase-architecture; do
  src="vendor/mattpocock-skills/skills/engineering/$skill"
  dst="mekann/skills/$skill"

  if [ ! -d "$src" ]; then
    echo "missing upstream skill: $src" >&2
    exit 1
  fi

  rm -rf "$dst"
  mkdir -p "$(dirname "$dst")"
  cp -R "$src" "$dst"
done
