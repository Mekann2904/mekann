#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

REPO_URL="https://github.com/cursor/plugins.git"
REF="3347cbab5b54136f6fba0994c3a01a56f7fb7fca"
VENDOR_DIR="vendor/cursor-plugins"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

git clone --depth 1 "$REPO_URL" "$TMP_DIR/cursor-plugins"
git -C "$TMP_DIR/cursor-plugins" fetch --depth 1 origin "$REF"
git -C "$TMP_DIR/cursor-plugins" checkout "$REF"

rm -rf "$VENDOR_DIR"
mkdir -p "$VENDOR_DIR"
tar -C "$TMP_DIR/cursor-plugins" --exclude=.git -cf - . | tar -C "$VENDOR_DIR" -xf -

SOURCE="$VENDOR_DIR/cursor-team-kit/skills/thermo-nuclear-code-quality-review"
DESTINATION="mekann/skills/thermo-nuclear-code-quality-review"

if [ ! -d "$SOURCE" ]; then
  echo "missing upstream skill: $SOURCE" >&2
  exit 1
fi

rm -rf "$DESTINATION"
mkdir -p "$(dirname "$DESTINATION")"
cp -R "$SOURCE" "$DESTINATION"

SKILL_FILE="$DESTINATION/SKILL.md"
SKILL_FILE="$SKILL_FILE" node <<'NODE'
const fs = require("node:fs");
const path = process.env.SKILL_FILE;
let content = fs.readFileSync(path, "utf8");

content = content.replace(/^disable-model-invocation:\s*true\n/m, "");

const piNote = "In Pi, inspect the relevant diff and files directly with `bash`/`rg` and `read`. Treat this as a review workflow: do not edit code unless the user explicitly asks for a patch after the review.";
const anchor = "Use this skill for an unusually strict review focused on implementation quality, maintainability, abstraction quality, and codebase health.\n";
if (!content.includes(piNote)) {
  if (!content.includes(anchor)) {
    throw new Error(`Pi adaptation anchor not found in ${path}`);
  }
  content = content.replace(anchor, `${anchor}\n${piNote}\n`);
}

fs.writeFileSync(path, content);
NODE

if grep -q '^disable-model-invocation:' "$SKILL_FILE"; then
  echo "Pi-incompatible frontmatter remains in $SKILL_FILE" >&2
  exit 1
fi

ruby -e 's=File.read(ARGV.fetch(0)); abort("missing description: #{ARGV[0]}") unless s =~ /\A---\n(?m:.*?)^description:\s+.+\n(?m:.*?)^---\n/; puts "ok #{ARGV[0]}"' "$SKILL_FILE"

cat <<'MSG'
Imported cursor/plugins skills and reapplied Pi-specific adaptations.
MSG
