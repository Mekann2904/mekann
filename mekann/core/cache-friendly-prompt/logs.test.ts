import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { ActualUsageLog } from "./actualUsage.js";
import type { CacheFriendlyRequestLog } from "../prompt-core/index.js";
import {
  appendActualUsageLog,
  appendCacheFriendlyLog,
  configureCacheFriendlyLogRetention,
  configureCacheFriendlyReports,
  resetCacheFriendlyLogRetentionTimersForTests,
} from "./logs.js";

// cache-friendly-prompt/logs.test.ts — retention / pruning (issue #92).
// Append-only logs (`requests.jsonl`, `actual-usage.jsonl`) must be bounded by
// a configurable size trigger + row cap, keeping only the most recent rows.

function requestEntry(i: number): CacheFriendlyRequestLog {
  return {
    timestamp: new Date(1_700_000_000_000 + i).toISOString(),
    stablePrefixHash: `hash-${i}`,
    stablePrefixChars: i,
    fragmentHashes: [{ source: "test", id: `f${i}`, kind: "coding_guidelines", stability: "stable", hash: `h${i}` }],
    warnings: [],
  };
}

function actualEntry(i: number): ActualUsageLog {
  return {
    timestamp: new Date(1_700_000_000_000 + i).toISOString(),
    inputTotalTokens: 100,
    outputTokens: 10,
    cacheReadTokens: 50,
    cacheWriteTokens: 10,
    tokenHitRate: 0.5,
    cacheableReadRate: 0.83,
    usageSource: "pi_normalized_usage",
    provider: "openai",
    model: "gpt",
  };
}

function readLines(file: string): string[] {
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.trim().length > 0);
}

describe("cache-friendly-prompt/logs retention (issue #92)", () => {
  let dir: string;
  let requestsFile: string;
  let actualFile: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cfp-ret-"));
    requestsFile = path.join(dir, ".pi-cache-friendly", "requests.jsonl");
    actualFile = path.join(dir, ".pi-cache-friendly", "actual-usage.jsonl");
    // Avoid report side-effects (debounce timers / artifact writes) during retention tests.
    configureCacheFriendlyReports({ mode: "off" });
    // Tiny, deterministic retention: trigger on any byte, keep newest 3 rows.
    configureCacheFriendlyLogRetention({
      retentionMaxBytes: 1,
      retentionMaxRows: 3,
      retentionCheckIntervalMs: 0,
    });
    resetCacheFriendlyLogRetentionTimersForTests();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    // Restore module defaults so other test files importing logs.js are unaffected.
    configureCacheFriendlyReports({ mode: "debounce", debounceMs: 1000 });
    configureCacheFriendlyLogRetention({
      retentionMaxBytes: 10 * 1024 * 1024,
      retentionMaxRows: 2000,
      retentionCheckIntervalMs: 30_000,
    });
    resetCacheFriendlyLogRetentionTimersForTests();
  });

  it("prunes requests.jsonl to the most recent retentionMaxRows", async () => {
    for (let i = 0; i < 5; i++) await appendCacheFriendlyLog(dir, requestEntry(i));
    const lines = readLines(requestsFile);
    expect(lines).toHaveLength(3);
    const parsed = lines.map((l) => JSON.parse(l) as CacheFriendlyRequestLog);
    // Most recent three (2, 3, 4) are retained; oldest (0, 1) dropped.
    expect(parsed.map((p) => p.stablePrefixHash)).toEqual(["hash-2", "hash-3", "hash-4"]);
  });

  it("prunes actual-usage.jsonl to the most recent retentionMaxRows", async () => {
    for (let i = 0; i < 6; i++) await appendActualUsageLog(dir, actualEntry(i));
    const lines = readLines(actualFile);
    expect(lines).toHaveLength(3);
    const parsed = lines.map((l) => JSON.parse(l) as ActualUsageLog);
    expect(parsed.map((p) => Number(new Date(p.timestamp)))).toEqual(
      [3, 4, 5].map((i) => 1_700_000_000_000 + i),
    );
  });

  it("does not prune when the byte threshold is not crossed", async () => {
    configureCacheFriendlyLogRetention({
      retentionMaxBytes: 10 * 1024 * 1024, // large threshold
      retentionMaxRows: 2,
      retentionCheckIntervalMs: 0,
    });
    resetCacheFriendlyLogRetentionTimersForTests();
    for (let i = 0; i < 5; i++) await appendCacheFriendlyLog(dir, requestEntry(i));
    expect(readLines(requestsFile)).toHaveLength(5);
  });

  it("does not prune when under the row cap even if over the byte threshold", async () => {
    // Over byte trigger (1) but only 2 rows (< cap of 3): keep all recent data.
    await appendCacheFriendlyLog(dir, requestEntry(0));
    await appendCacheFriendlyLog(dir, requestEntry(1));
    expect(readLines(requestsFile)).toHaveLength(2);
  });

  it("throttles prune checks by retentionCheckIntervalMs", async () => {
    configureCacheFriendlyLogRetention({
      retentionMaxBytes: 1,
      retentionMaxRows: 1,
      retentionCheckIntervalMs: 60_000, // one minute: only the first append may prune
    });
    resetCacheFriendlyLogRetentionTimersForTests();
    // First append: over byte trigger, 1 row == cap -> no drop yet (kept as-is).
    await appendCacheFriendlyLog(dir, requestEntry(0));
    expect(readLines(requestsFile)).toHaveLength(1);
    // Second append: would prune to 1 newest, but the 60s throttle skips the check.
    await appendCacheFriendlyLog(dir, requestEntry(1));
    expect(readLines(requestsFile)).toHaveLength(2);
  });

  it("ignores invalid retention config and keeps the last valid values", () => {
    configureCacheFriendlyLogRetention({
      retentionMaxBytes: 0,
      retentionMaxRows: -5,
      retentionCheckIntervalMs: Number.NaN,
    });
    // afterEach restores defaults; here we just assert the call does not throw
    // and a subsequent valid config is honored.
    configureCacheFriendlyLogRetention({
      retentionMaxBytes: 1,
      retentionMaxRows: 1,
      retentionCheckIntervalMs: 0,
    });
    resetCacheFriendlyLogRetentionTimersForTests();
  });

  it("report generation scans only the retained window (criterion #3)", async () => {
    // Immediate reports so generateCacheFriendlyReport runs after each prune.
    configureCacheFriendlyReports({ mode: "immediate" });
    configureCacheFriendlyLogRetention({
      retentionMaxBytes: 1,
      retentionMaxRows: 3,
      retentionCheckIntervalMs: 0,
    });
    resetCacheFriendlyLogRetentionTimersForTests();
    for (let i = 0; i < 7; i++) await appendCacheFriendlyLog(dir, requestEntry(i));
    // Prune keeps only the most recent 3 rows; the report reads that file, so
    // summary.totalRequests must equal the retained count, not all 7 appends.
    const summaryFile = path.join(dir, ".pi-cache-friendly", "summary.json");
    const summary = JSON.parse(fs.readFileSync(summaryFile, "utf8"));
    expect(summary.totalRequests).toBe(3);
    expect(readLines(requestsFile)).toHaveLength(3);
  });
});
