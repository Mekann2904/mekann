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

MANIFEST="scripts/mattpocock-skills.manifest.json"

# Import only the upstream engineering skills declared in the manifest. Pi reads
# mekann/skills directly; developers edit these copied files after import to make
# them suitable for Pi. Protected local skills must never be overwritten by an
# upstream import.
MANIFEST="$MANIFEST" node <<'NODE' | while IFS=$'\t' read -r source destination; do
const fs = require("node:fs");
const manifest = JSON.parse(fs.readFileSync(process.env.MANIFEST, "utf8"));
for (const item of manifest.imports) {
  if (manifest.protectedLocalSkills.includes(item.destination)) {
    console.error(`protected local skill collision: ${item.destination}`);
    process.exit(1);
  }
  console.log(`${manifest.sourceRoot}/${item.source}\t${manifest.destinationRoot}/${item.destination}`);
}
NODE
  if [ ! -d "$source" ]; then
    echo "missing upstream skill: $source" >&2
    exit 1
  fi

  rm -rf "$destination"
  mkdir -p "$(dirname "$destination")"
  cp -R "$source" "$destination"
done

echo "Running post-import validation. If this fails after an upstream copy, adapt mekann/skills for Pi and rerun npm run check:mattpocock-skills."
npm run check:mattpocock-skills
