/**
 * Tests for pruneRunArtifacts grace period fix
 *
 * Verifies that the ENOENT race condition is prevented by the grace period.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, existsSync, rmSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pruneRunArtifacts } from "../../../.pi/lib/storage-base.js";

describe("pruneRunArtifacts", () => {
  let testDir: string;
  let runsDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `prune-test-${Date.now()}`);
    runsDir = join(testDir, "runs");
    mkdirSync(runsDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("keeps files that are in the runs list", () => {
    const keepFile = join(runsDir, "keep-me.json");
    writeFileSync(keepFile, JSON.stringify({ test: true }));

    const paths = { baseDir: testDir, runsDir, storageFile: join(testDir, "storage.json") };
    const runs = [{ runId: "keep-me", outputFile: keepFile }];

    pruneRunArtifacts(paths, runs, 0);

    expect(existsSync(keepFile)).toBe(true);
  });

  it("deletes old files not in the runs list", () => {
    const keepFile = join(runsDir, "keep-me.json");
    const oldFile = join(runsDir, "old-file.json");
    writeFileSync(keepFile, JSON.stringify({ test: true }));
    writeFileSync(oldFile, JSON.stringify({ test: true }));

    // Manually set mtime to 2 minutes ago (beyond grace period)
    const oldTime = new Date(Date.now() - 120000);
    utimesSync(oldFile, oldTime, oldTime);

    const paths = { baseDir: testDir, runsDir, storageFile: join(testDir, "storage.json") };
    // Note: runs must be non-empty for pruneRunArtifacts to delete anything (safety guard)
    const runs = [{ runId: "keep-me", outputFile: keepFile }];

    pruneRunArtifacts(paths, runs, 60000);

    expect(existsSync(keepFile)).toBe(true);
    expect(existsSync(oldFile)).toBe(false);
  });

  it("keeps recently created files even if not in runs list (grace period)", () => {
    const recentFile = join(runsDir, "recent-file.json");
    writeFileSync(recentFile, JSON.stringify({ test: true }));

    const paths = { baseDir: testDir, runsDir, storageFile: join(testDir, "storage.json") };
    const runs: Array<{ runId: string; outputFile: string }> = [];

    // Default grace period is 60 seconds, so recent files should be kept
    pruneRunArtifacts(paths, runs, 60000);

    expect(existsSync(recentFile)).toBe(true);
  });

  it("allows grace period to be configured to 0 for immediate deletion", () => {
    const keepFile = join(runsDir, "keep-me.json");
    const file = join(runsDir, "test-file.json");
    writeFileSync(keepFile, JSON.stringify({ test: true }));
    writeFileSync(file, JSON.stringify({ test: true }));

    // Manually set mtime to 1 second ago to ensure file is definitely "old"
    const oldTime = new Date(Date.now() - 1000);
    utimesSync(file, oldTime, oldTime);

    const paths = { baseDir: testDir, runsDir, storageFile: join(testDir, "storage.json") };
    // Note: runs must be non-empty for pruneRunArtifacts to delete anything (safety guard)
    const runs = [{ runId: "keep-me", outputFile: keepFile }];

    // With grace period 0, files should be deleted immediately
    pruneRunArtifacts(paths, runs, 0);

    expect(existsSync(keepFile)).toBe(true);
    expect(existsSync(file)).toBe(false);
  });

  it("simulates race condition scenario: parallel runs don't delete each other's files", () => {
    // Create files as if two parallel runs are in progress
    const file1 = join(runsDir, "run-a.json");
    const file2 = join(runsDir, "run-b.json");
    writeFileSync(file1, JSON.stringify({ runId: "run-a" }));
    writeFileSync(file2, JSON.stringify({ runId: "run-b" }));

    const paths = { baseDir: testDir, runsDir, storageFile: join(testDir, "storage.json") };

    // Run A saves with only its own run (simulating concurrent execution)
    pruneRunArtifacts(paths, [{ runId: "run-a", outputFile: file1 }], 60000);

    // Both files should still exist due to grace period
    expect(existsSync(file1)).toBe(true);
    expect(existsSync(file2)).toBe(true);
  });
});
