#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

git remote add mattpocock-skills https://github.com/mattpocock/skills.git 2>/dev/null || true
git fetch mattpocock-skills main

# vendor/ is intentionally ignored in this repo. Refresh the local upstream
# mirror from the fetched remote instead of relying on a tracked git subtree.
rm -rf vendor/mattpocock-skills
mkdir -p vendor/mattpocock-skills
git archive mattpocock-skills/main | tar -x -C vendor/mattpocock-skills

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
  console.log(`${item.sourceRoot || manifest.sourceRoot}/${item.source}\t${manifest.destinationRoot}/${item.destination}`);
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
