/**
 * Changed-file tracking helpers for review-fixer.
 *
 * Uses content-hash comparison (via `git hash-object`) instead of
 * simple set-difference on `git status --porcelain` output, so that
 * modifications to already-dirty files are correctly detected.
 */

import { execFileSync } from "node:child_process";

/**
 * Extract file paths from `git status --porcelain` output.
 *
 * Note: `line.slice(3)` extracts only the destination path.
 * Renames (`R  old -> new`) and copies (`C  old -> new`) emit the
 * destination path only; the orig-path segment is intentionally
 * discarded since we track changes by final path.
 */
function parseDirtyFiles(status: string): string[] {
  return status.split("\n").filter(Boolean).map((l) => l.slice(3));
}

/**
 * Compute a content-hash snapshot of all dirty files.
 * Returns a Map<filePath, blobHash> for every file listed by `git status --porcelain`.
 * Uses batch `git hash-object` (single fork) for efficiency.
 * This allows detecting changes to files that were already dirty before the child ran.
 */
export function snapshotContentHashes(cwd: string): Map<string, string> {
  const hashes = new Map<string, string>();
  try {
    const status = execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf-8" });
    const files = parseDirtyFiles(status);
    if (files.length === 0) return hashes;

    // Batch `git hash-object` — one fork for all files.
    // `git hash-object` accepts multiple paths and emits one hash per line.
    const hashOutput = execFileSync(
      "git", ["hash-object", ...files],
      { cwd, encoding: "utf-8" },
    ).trim();
    const hashLines = hashOutput.split("\n");

    for (let i = 0; i < files.length; i++) {
      const hash = hashLines[i]?.trim();
      hashes.set(files[i], hash || "");
    }
  } catch {
    // git not available or hash-object failed — return empty map
  }
  return hashes;
}

/**
 * Compute changed files by comparing before/after content hashes.
 *
 * Detects three categories of change:
 * 1. Files that appear in after but not in before (newly dirtied)
 * 2. Files present in both but with different hashes (modified by child)
 * 3. Files that disappear from after (reverted by child)
 */
export function computeChangedFiles(
  before: Map<string, string>,
  after: Map<string, string>,
): string[] {
  const changed = new Set<string>();

  // Files in after with different or new hashes
  for (const [file, hash] of after) {
    if (!before.has(file) || before.get(file) !== hash) {
      changed.add(file);
    }
  }

  // Files that were in before but disappeared (child reverted them)
  for (const file of before.keys()) {
    if (!after.has(file)) {
      changed.add(file);
    }
  }

  return [...changed].sort();
}
