#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

REPO_URL="https://github.com/greensock/gsap-skills.git"
VENDOR_DIR="vendor/greensock-gsap-skills"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

git clone --depth 1 "$REPO_URL" "$TMP_DIR/gsap-skills"

rm -rf "$VENDOR_DIR"
mkdir -p "$VENDOR_DIR"
tar -C "$TMP_DIR/gsap-skills" --exclude=.git -cf - . | tar -C "$VENDOR_DIR" -xf -

for source in "$VENDOR_DIR"/skills/gsap-*; do
  if [ ! -d "$source" ]; then
    echo "missing upstream GSAP skills under $VENDOR_DIR/skills" >&2
    exit 1
  fi

  destination="mekann/skills/$(basename "$source")"
  rm -rf "$destination"
  mkdir -p "$(dirname "$destination")"
  cp -R "$source" "$destination"
done

ruby -e 'ARGV.each do |f| s=File.read(f); abort("missing description: #{f}") unless s =~ /\A---\n(?m:.*?)^description:\s+.+\n(?m:.*?)^---\n/; puts "ok #{f}"; end' $(find mekann/skills -maxdepth 2 -path '*/gsap-*/SKILL.md' -print)

cat <<'MSG'
Imported greensock/gsap-skills into mekann/skills.
Review the copied GSAP skills for Pi-specific adaptations before committing.
MSG
