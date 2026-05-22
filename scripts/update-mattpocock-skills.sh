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
