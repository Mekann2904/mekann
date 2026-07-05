#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

REPO_URL="https://github.com/cursor/plugins.git"
REF="0452e08a314c03621ec5ac1324f1ad1dd824f1a4"
VENDOR_DIR="vendor/cursor-plugins"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

git clone --depth 1 "$REPO_URL" "$TMP_DIR/cursor-plugins"
git -C "$TMP_DIR/cursor-plugins" fetch --depth 1 origin "$REF"
git -C "$TMP_DIR/cursor-plugins" checkout "$REF"

rm -rf "$VENDOR_DIR"
mkdir -p "$VENDOR_DIR"
tar -C "$TMP_DIR/cursor-plugins" --exclude=.git -cf - . | tar -C "$VENDOR_DIR" -xf -

# Each cursor/plugins skill imported here is mirrored into mekann/skills and then
# adapted for Pi. Adaptations are idempotent so reruns stay stable across upstream
# refreshes. Both skills keep their upstream frontmatter (including
# disable-model-invocation when present); mekann relies on disable-model-invocation
# for explicit-load skills, so we do not strip it.

# --- thermo-nuclear-code-quality-review ---
THERMO_SOURCE="$VENDOR_DIR/cursor-team-kit/skills/thermo-nuclear-code-quality-review"
THERMO_DEST="mekann/skills/thermo-nuclear-code-quality-review"
THERMO_FILE="$THERMO_DEST/SKILL.md"

if [ ! -d "$THERMO_SOURCE" ]; then
  echo "missing upstream skill: $THERMO_SOURCE" >&2
  exit 1
fi
rm -rf "$THERMO_DEST"
mkdir -p "$(dirname "$THERMO_DEST")"
cp -R "$THERMO_SOURCE" "$THERMO_DEST"

THERMO_FILE="$THERMO_FILE" node <<'NODE'
const fs = require("node:fs");
const path = process.env.THERMO_FILE;
let content = fs.readFileSync(path, "utf8");

// Pi review-workflow note.
const piNote = "In Pi, inspect the relevant diff and files directly with `bash`/`rg` and `read`. Treat this as a review workflow: do not edit code unless the user explicitly asks for a patch after the review.";
const piAnchor = "Use this skill for an unusually strict review focused on implementation quality, maintainability, abstraction quality, and codebase health.\n";
if (!content.includes(piNote)) {
  if (!content.includes(piAnchor)) {
    throw new Error(`Pi adaptation anchor not found in ${path}`);
  }
  content = content.replace(piAnchor, `${piAnchor}\n${piNote}\n`);
}

// Mekann-local Japanese output section.
const jpHeading = "## 出力言語";
const jpSection = `${jpHeading}\n\nレビュー結果は **日本語** で出力すること。コードスニペット、ファイルパス、変数名、技術用語は英語のままでよいが、指摘内容・説明・提案・判定理由などの文章はすべて日本語で書くこと。\n`;
if (!content.includes(jpHeading)) {
  const outExp = "\n## Output Expectations\n";
  if (!content.includes(outExp)) {
    throw new Error(`Japanese output section anchor not found in ${path}`);
  }
  content = content.replace(outExp, `\n${jpSection}\n## Output Expectations\n`);
}

fs.writeFileSync(path, content);
NODE

# --- cli-for-agents ---
CLI_SOURCE="$VENDOR_DIR/cli-for-agent/skills/cli-for-agents"
CLI_DEST="mekann/skills/cli-for-agents"
CLI_FILE="$CLI_DEST/SKILL.md"

if [ ! -d "$CLI_SOURCE" ]; then
  echo "missing upstream skill: $CLI_SOURCE" >&2
  exit 1
fi
rm -rf "$CLI_DEST"
mkdir -p "$(dirname "$CLI_DEST")"
cp -R "$CLI_SOURCE" "$CLI_DEST"

CLI_FILE="$CLI_FILE" node <<'NODE'
const fs = require("node:fs");
const path = process.env.CLI_FILE;
let content = fs.readFileSync(path, "utf8");

// Pi tooling note for building/reviewing the CLI in this harness.
const piNote = "In Pi, build or revise the CLI with `write`/`edit` and confirm its behavior by running it through `bash` (flags, `--help`, pipelines, exit codes). Keep the agent-runnable patterns—non-interactive flags, examples in `--help`, stdin/pipelines, idempotency, `--dry-run`, actionable errors—front and center.";
const piAnchor = "Human-oriented CLIs often block agents: interactive prompts, huge upfront docs, and help text without copy-pasteable examples. Prefer patterns that work headlessly and compose in pipelines.\n";
if (!content.includes(piNote)) {
  if (!content.includes(piAnchor)) {
    throw new Error(`Pi adaptation anchor not found in ${path}`);
  }
  content = content.replace(piAnchor, `${piAnchor}\n${piNote}\n`);
}

fs.writeFileSync(path, content);
NODE

# Validate frontmatter (description required) on every imported skill.
ruby -e 'ARGV.each do |f| s=File.read(f); abort("missing description: #{f}") unless s =~ /\A---\n(?m:.*?)^description:\s+.+\n(?m:.*?)^---\n/; puts "ok #{f}"; end' "$THERMO_FILE" "$CLI_FILE"

cat <<'MSG'
Imported cursor/plugins skills (thermo-nuclear-code-quality-review, cli-for-agents) and reapplied Pi-specific adaptations.
Review mekann/skills for any further Pi-specific edits before committing.
MSG
