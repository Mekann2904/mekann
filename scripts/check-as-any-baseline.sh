#!/usr/bin/env bash
# Fail CI if the non-test `as any` count grew beyond the committed baseline.
# Companion to eslint.config.mjs (`@typescript-eslint/no-explicit-any`) for
# issue #141.
#
# Counting is delegated to scripts/count-as-any.mjs (a Node script) so the
# result is byte-identical across macOS / Linux / the GitHub Actions runner.
# The earlier ripgrep-based implementation was environment-sensitive — the same
# commit counted 76 locally but 77 on the runner because `rg --type ts` resolves
# the file-type/globs differently across versions — which flapped this gate red
# without any real regression. Node is guaranteed on PATH here because every CI
# job that runs this script first calls actions/setup-node.
#
# Exit codes (mirrors the Node script):
#   0  current count <= baseline (CI green)
#   1  current count  > baseline (regression — CI red)
#   2  misconfiguration (baseline file missing/malformed)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

exec node "$(dirname "${BASH_SOURCE[0]}")/count-as-any.mjs"
