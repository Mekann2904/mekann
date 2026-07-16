#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

JAPANESE_TECH_GIST="fd287c3133457c4fd8f5601d34aa817d"
COGNITIVE_RHYTHM_GIST="eb2929f13ed19c97188393d297be8432"
JAPANESE_TECH_VENDOR="vendor/k16shikano-japanese-tech-writing"
COGNITIVE_RHYTHM_VENDOR="vendor/k16shikano-cognitive-rhythm-writing"
REFERENCES_DIR="mekann/skills/writing-assistant/references"

update_gist() {
  local gist_id="$1"
  local vendor_dir="$2"
  local metadata

  metadata="$(mktemp)"
  trap 'rm -f "$metadata"' RETURN
  curl --fail --silent --show-error --location \
    "https://api.github.com/gists/$gist_id" > "$metadata"

  mkdir -p "$vendor_dir"
  node - "$metadata" "$vendor_dir" <<'NODE'
const fs = require("node:fs");
const [metadataPath, vendorDir] = process.argv.slice(2);
const gist = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
const skill = gist.files["SKILL.md"];
if (!skill?.content || !gist.history?.[0]?.version) {
  throw new Error(`Gist ${gist.id} does not contain a complete SKILL.md or revision`);
}
fs.writeFileSync(`${vendorDir}/SKILL.md`, skill.content);
fs.writeFileSync(`${vendorDir}/REVISION`, `${gist.history[0].version}\n`);
NODE
  rm -f "$metadata"
  trap - RETURN
}

update_gist "$JAPANESE_TECH_GIST" "$JAPANESE_TECH_VENDOR"
update_gist "$COGNITIVE_RHYTHM_GIST" "$COGNITIVE_RHYTHM_VENDOR"

mkdir -p "$REFERENCES_DIR"
cp "$JAPANESE_TECH_VENDOR/SKILL.md" "$REFERENCES_DIR/japanese-tech-writing.md"
cp "$COGNITIVE_RHYTHM_VENDOR/SKILL.md" "$REFERENCES_DIR/cognitive-rhythm-writing.md"

# The upstream cognitive-rhythm skill expects a sibling standalone skill. In
# Mekann both upstream skills are reference units of writing-assistant.
node <<'NODE'
const fs = require("node:fs");
const path = "mekann/skills/writing-assistant/references/cognitive-rhythm-writing.md";
const source = fs.readFileSync(path, "utf8");
const adapted = source.replace(
  "`../japanese-tech-writing/SKILL.md`",
  "`japanese-tech-writing.md`",
);
if (adapted === source) {
  throw new Error("Expected upstream japanese-tech-writing reference was not found");
}
fs.writeFileSync(path, adapted);
NODE

echo "Updated k16shikano writing-skill mirrors and writing-assistant references."
