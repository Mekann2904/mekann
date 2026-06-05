#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

REPO_URL="https://github.com/alchaincyf/darwin-skill.git"
VENDOR_DIR="vendor/alchaincyf-darwin-skill"
PI_SKILL_DIR="mekann/skills/self-evolving-skill"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

git clone --depth 1 "$REPO_URL" "$TMP_DIR/darwin-skill"

rm -rf "$VENDOR_DIR"
mkdir -p "$VENDOR_DIR"
tar -C "$TMP_DIR/darwin-skill" --exclude=.git -cf - . | tar -C "$VENDOR_DIR" -xf -

if [ ! -f "$PI_SKILL_DIR/SKILL.md" ]; then
  mkdir -p "$PI_SKILL_DIR"
  tar -C "$VENDOR_DIR" --exclude=.git -cf - . | tar -C "$PI_SKILL_DIR" -xf -
  echo "Created $PI_SKILL_DIR from upstream. Review and adapt it for Pi before committing."
else
  echo "Updated upstream mirror at $VENDOR_DIR."
  echo "Preserved Pi-maintained copy at $PI_SKILL_DIR. Manually port desired upstream changes."
fi

ruby -e 'ARGV.each do |f| s=File.read(f); abort("missing description: #{f}") unless s =~ /\A---\n(?m:.*?)^description:\s+.+\n(?m:.*?)^---\n/; puts "ok #{f}"; end' "$PI_SKILL_DIR/SKILL.md"
