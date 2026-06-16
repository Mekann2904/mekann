import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// We mock fs/promises so we can control readFile (input) and capture writeFile calls (output)
const writtenFiles = new Map<string, string>();

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn((...args: unknown[]) => {
    writtenFiles.set(args[0] as string, args[1] as string);
    return Promise.resolve();
  }),
  mkdir: vi.fn(() => Promise.resolve()),
}));

vi.mock("node:path", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:path")>();
  return { ...actual };
});

// Import after mocks are set up
const { generateCacheFriendlyReport } = await import("./report.js");

function makeLog(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    timestamp: "2025-01-01T00:00:00.000Z",
    provider: "test-provider",
    model: "test-model",
    stablePrefixHash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    stablePrefixChars: 500,
    totalPromptChars: 1000,
    fragmentHashes: [],
    warnings: [],
    ...overrides,
  });
}

function makeFragmentHash(overrides: Record<string, unknown> = {}) {
  return {
    id: "frag1",
    source: "ext-a",
    kind: "coding_guidelines",
    stability: "stable",
    hash: "hhhh",
    chars: 100,
    ...overrides,
  };
}

function makeActualLog(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    timestamp: "2025-01-01T00:00:00.000Z",
    provider: "test-provider",
    model: "test-model",
    requestRole: "main",
    inputTotalTokens: 1000,
    outputTokens: 100,
    cacheReadTokens: 500,
    tokenHitRate: 0.5,
    cacheableReadRate: null,
    usageSource: "provider_raw_usage",
    correlationConfidence: "runKey_latest",
    ...overrides,
  });
}

function warning(code: string, severity = "warning") {
  return { severity, code, message: `warn ${code}` };
}

describe("report.ts coverage", () => {
  let dir: string;

  beforeEach(() => {
    dir = os.tmpdir();
    writtenFiles.clear();
    vi.mocked(fs.readFile).mockReset();
    vi.mocked(fs.writeFile).mockReset().mockImplementation((...args: unknown[]) => {
      writtenFiles.set(args[0] as string, args[1] as string);
      return Promise.resolve();
    });
  });

  async function runWithLog(requestLogText: string, actualLogText = "") {
    vi.mocked(fs.readFile).mockImplementation((filePath: any) => {
      const p = String(filePath);
      if (p.endsWith("requests.jsonl")) return Promise.resolve(requestLogText);
      if (p.endsWith("actual-usage.jsonl")) return Promise.resolve(actualLogText);
      return Promise.reject(new Error("not found"));
    });
    await generateCacheFriendlyReport(dir);
  }

  it("handles empty log (no rows)", async () => {
    await runWithLog("");
    const summary = JSON.parse(writtenFiles.get(path.join(dir, "summary.json"))!);
    expect(summary.totalRequests).toBe(0);
    expect(summary.latest).toBeUndefined();
    expect(summary.recentSameHashStreak).toBe(0);
    expect(summary.stablePrefixHashChanges).toBe(0);
  });

  it("handles single row with all fields", async () => {
    await runWithLog(makeLog());
    const summary = JSON.parse(writtenFiles.get(path.join(dir, "summary.json"))!);
    expect(summary.totalRequests).toBe(1);
    expect(summary.latest).toBeDefined();
    expect(summary.latest.provider).toBe("test-provider");
    expect(summary.latest.model).toBe("test-model");
    expect(summary.recentSameHashStreak).toBe(1);
    expect(summary.stablePrefixHashChanges).toBe(0);
  });

  it("handles row without provider/model (unknown fallback)", async () => {
    await runWithLog(makeLog({ provider: undefined, model: undefined }));
    const summary = JSON.parse(writtenFiles.get(path.join(dir, "summary.json"))!);
    expect(Object.keys(summary.providers)[0]).toBe("unknown/unknown");
  });

  it("handles multiple rows with hash changes and streak", async () => {
    const log = [
      makeLog({ stablePrefixHash: "hash_aaa" + "a".repeat(56) }),
      makeLog({ stablePrefixHash: "hash_bbb" + "b".repeat(56) }), // change
      makeLog({ stablePrefixHash: "hash_bbb" + "b".repeat(56) }), // same
      makeLog({ stablePrefixHash: "hash_bbb" + "b".repeat(56) }), // same
    ].join("\n");
    await runWithLog(log);
    const summary = JSON.parse(writtenFiles.get(path.join(dir, "summary.json"))!);
    expect(summary.totalRequests).toBe(4);
    expect(summary.stablePrefixHashChanges).toBe(1);
    expect(summary.recentSameHashStreak).toBe(3);
    // report.md should have hash change rows
    const report = writtenFiles.get(path.join(dir, "report.md"))!;
    expect(report).toContain("hash change");
  });

  it("counts warnings from rows", async () => {
    const log = [
      makeLog({ warnings: [{ severity: "error", code: "TEST", message: "w1" }] }),
      makeLog({ warnings: [{ severity: "warn", code: "X", message: "w2" }, { severity: "warn", code: "Y", message: "w3" }] }),
    ].join("\n");
    await runWithLog(log);
    const summary = JSON.parse(writtenFiles.get(path.join(dir, "summary.json"))!);
    expect(summary.warningCount).toBe(3);
  });

  it("handles rows with missing optional numeric fields (nullish coalescing)", async () => {
    const log = makeLog({ stablePrefixChars: undefined, totalPromptChars: undefined });
    await runWithLog(log);
    const summary = JSON.parse(writtenFiles.get(path.join(dir, "summary.json"))!);
    expect(summary.latest.stablePrefixChars).toBe(0);
    expect(summary.latest.totalPromptChars).toBe(0);
  });

  it("handles rows with warnings in SVG render (warning dots)", async () => {
    const log = [
      makeLog({ warnings: [{ severity: "error", code: "X", message: "warn" }] }),
      makeLog({ warnings: [] }),
      makeLog({ warnings: [{ severity: "warn", code: "Y", message: "w2" }] }),
    ].join("\n");
    await runWithLog(log);
    const svg = writtenFiles.get(path.join(dir, "trend.svg"))!;
    // Warning dots rendered as red circles
    expect(svg).toContain("#ef4444");
  });

  it("renders all 8 output files", async () => {
    await runWithLog(makeLog());
    expect(writtenFiles.has(path.join(dir, "summary.json"))).toBe(true);
    expect(writtenFiles.has(path.join(dir, "trend.svg"))).toBe(true);
    expect(writtenFiles.has(path.join(dir, "trend-all.svg"))).toBe(true);
    expect(writtenFiles.has(path.join(dir, "cacheability-score.svg"))).toBe(true);
    expect(writtenFiles.has(path.join(dir, "cacheability-score-all.svg"))).toBe(true);
    expect(writtenFiles.has(path.join(dir, "actual-hit-rate.svg"))).toBe(true);
    expect(writtenFiles.has(path.join(dir, "fragments.svg"))).toBe(true);
    expect(writtenFiles.has(path.join(dir, "report.md"))).toBe(true);
  });

  it("renders trend-all SVG (maxPoints=all path)", async () => {
    await runWithLog(makeLog());
    const svg = writtenFiles.get(path.join(dir, "trend-all.svg"))!;
    expect(svg).toContain("全 1 件");
  });

  it("renders trend SVG for sampled rows (>MAX_POINTS triggers sampling)", async () => {
    // Create 501 rows to trigger sampling
    const rows = [];
    for (let i = 0; i < 502; i++) {
      rows.push(makeLog({ stablePrefixHash: `h${i}` + "x".repeat(60), totalPromptChars: 1000 + i }));
    }
    await runWithLog(rows.join("\n"));
    const svg = writtenFiles.get(path.join(dir, "trend.svg"))!;
    expect(svg).toContain("最新 500 件");
  });

  it("renders cacheability SVG with streak and change lines", async () => {
    const rows = [
      makeLog({ stablePrefixHash: "aaa" + "a".repeat(61) }),
      makeLog({ stablePrefixHash: "bbb" + "b".repeat(61) }), // change → score 0
      makeLog({ stablePrefixHash: "bbb" + "b".repeat(61) }), // same → score 100
    ];
    await runWithLog(rows.join("\n"));
    const svg = writtenFiles.get(path.join(dir, "cacheability-score.svg"))!;
    expect(svg).toContain("adjacent prefix proxy");
    expect(svg).toContain("streak: 2 requests");
    expect(svg).toContain("latest proxy: 100%");
    // Change lines in orange
    expect(svg).toContain("#f59e0b");
  });

  it("renders fragments SVG with fragment chars", async () => {
    const log = makeLog({
      fragmentHashes: [
        makeFragmentHash({ source: "ext-a", stability: "stable", chars: 200 }),
        makeFragmentHash({ source: "ext-a", stability: "semi_stable", chars: 100 }),
        makeFragmentHash({ source: "ext-a", stability: "dynamic", chars: 50 }),
        makeFragmentHash({ source: "ext-b", stability: "stable", chars: 80 }),
      ],
    });
    await runWithLog(log);
    const svg = writtenFiles.get(path.join(dir, "fragments.svg"))!;
    expect(svg).toContain("ext-a");
    expect(svg).toContain("ext-b");
    expect(svg).toContain("350 chars");
  });

  it("renders fragments SVG with empty rows (no fragment chars)", async () => {
    const log = makeLog({ fragmentHashes: [] });
    await runWithLog(log);
    const svg = writtenFiles.get(path.join(dir, "fragments.svg"))!;
    expect(svg).toContain("fragment chars は新しいログから記録されます");
  });

  it("renders fragments SVG when no rows have fragment chars (reverse find returns undefined)", async () => {
    const log = makeLog({
      fragmentHashes: [makeFragmentHash({ chars: undefined })],
    });
    await runWithLog(log);
    const svg = writtenFiles.get(path.join(dir, "fragments.svg"))!;
    expect(svg).toContain("fragment chars は新しいログから記録されます");
  });

  it("renders report.md with provider rows and hash changes", async () => {
    const rows = [
      makeLog({ provider: "p1", model: "m1", stablePrefixHash: "aaa" + "a".repeat(61) }),
      makeLog({ provider: "p2", model: "m2", stablePrefixHash: "bbb" + "b".repeat(61) }),
      makeLog({ provider: "p1", model: "m1", stablePrefixHash: "ccc" + "c".repeat(61) }),
    ];
    await runWithLog(rows.join("\n"));
    const report = writtenFiles.get(path.join(dir, "report.md"))!;
    expect(report).toContain("p1/m1");
    expect(report).toContain("p2/m2");
    expect(report).toContain("hash change");
  });

  it("renders report.md with no provider rows (empty providers)", async () => {
    await runWithLog("");
    const report = writtenFiles.get(path.join(dir, "report.md"))!;
    expect(report).toContain("なし");
  });

  it("handles broken JSON lines gracefully", async () => {
    const log = [
      makeLog(),
      "this is not json",
      makeLog({ stablePrefixHash: "zzz" + "z".repeat(61) }),
      "",
      "  ",
    ].join("\n");
    await runWithLog(log);
    const summary = JSON.parse(writtenFiles.get(path.join(dir, "summary.json"))!);
    // Only 2 valid rows
    expect(summary.totalRequests).toBe(2);
  });

  it("ignores invalid actual usage rows", async () => {
    const actualRows = [
      makeLog(),
      "not json",
      JSON.stringify({ inputTotalTokens: 10, outputTokens: 1, cacheReadTokens: 5, tokenHitRate: 0.5, cacheableReadRate: null, usageSource: "provider_raw_usage" }),
    ].join("\n");
    await runWithLog("", actualRows);
    const summary = JSON.parse(writtenFiles.get(path.join(dir, "summary.json"))!);
    expect(summary.actualRequestCount).toBe(1);
    expect(summary.actualInputTotalTokens).toBe(10);
  });

  it("computes weighted cacheableReadRate only from rows with cacheWriteTokens", async () => {
    const actualRows = [
      JSON.stringify({ timestamp: "2025-01-01T00:00:00.000Z", provider: "openai", model: "gpt", inputTotalTokens: 2000, outputTokens: 100, cacheReadTokens: 1000, tokenHitRate: 0.5, cacheableReadRate: null, usageSource: "provider_raw_usage" }),
      JSON.stringify({ timestamp: "2025-01-01T00:00:01.000Z", provider: "anthropic", model: "claude", inputTotalTokens: 2000, outputTokens: 100, cacheReadTokens: 600, cacheWriteTokens: 400, tokenHitRate: 0.3, cacheableReadRate: 0.6, usageSource: "provider_raw_usage" }),
    ].join("\n");
    await runWithLog("", actualRows);
    const summary = JSON.parse(writtenFiles.get(path.join(dir, "summary.json"))!);
    expect(summary.actualTokenHitRateWeighted).toBeCloseTo(1600 / 4000);
    expect(summary.actualCacheableReadRateWeighted).toBeCloseTo(600 / 1000);
    expect(summary.actualByProvider.openai.weightedCacheableReadRate).toBeNull();
    expect(summary.actualByProvider.anthropic.weightedCacheableReadRate).toBeCloseTo(600 / 1000);
  });

  it("re-normalizes historical actual usage rows from rawUsage", async () => {
    const actualRows = JSON.stringify({
      timestamp: "2025-01-01T00:00:00.000Z",
      provider: "openai-codex",
      model: "gpt",
      inputTotalTokens: 21760,
      outputTokens: 46,
      cacheReadTokens: 45056,
      cacheWriteTokens: 0,
      tokenHitRate: 45056 / 21760,
      cacheableReadRate: 1,
      usageSource: "pi_normalized_usage",
      rawUsage: { input: 21760, output: 46, cacheRead: 45056, cacheWrite: 0, totalTokens: 66862 },
    });
    await runWithLog("", actualRows);
    const summary = JSON.parse(writtenFiles.get(path.join(dir, "summary.json"))!);
    expect(summary.actualInputTotalTokens).toBe(66816);
    expect(summary.actualTokenHitRateWeighted).toBeCloseTo(45056 / 66816);
    expect(summary.actualCacheableReadRateWeighted).toBeNull();
  });

  it("handles scalePoints with zero values (max=0)", async () => {
    const log = makeLog({ stablePrefixChars: 0, totalPromptChars: 0 });
    await runWithLog(log);
    const svg = writtenFiles.get(path.join(dir, "trend.svg"))!;
    expect(svg).toContain("polyline");
  });

  it("escapeHtml covers &, <, >, \"", async () => {
    // Use provider/model with special chars to trigger escapeHtml in report.md
    const log = makeLog({ provider: 'a&b<c>d"e', model: "m" });
    await runWithLog(log);
    const report = writtenFiles.get(path.join(dir, "report.md"))!;
    expect(report).toContain("&amp;");
    expect(report).toContain("&lt;");
    expect(report).toContain("&gt;");
    expect(report).toContain("&quot;");
  });

  it("shortHash handles undefined hash", async () => {
    const log = makeLog({ stablePrefixHash: "" });
    await runWithLog(log);
    const report = writtenFiles.get(path.join(dir, "report.md"))!;
    // Empty hash → shortHash returns ""
    expect(report).toContain("| 最新 stablePrefixHash | `` |");
  });

  it("catch block in generateCacheFriendlyReport swallows errors", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("file not found"));
    // Should not throw
    await expect(generateCacheFriendlyReport(dir)).resolves.toBeUndefined();
  });

  it("handles single row for scalePoints (values.length === 1)", async () => {
    await runWithLog(makeLog());
    const svg = writtenFiles.get(path.join(dir, "trend.svg"))!;
    // Single point: x should be PAD_L (no offset since length===1)
    expect(svg).toContain("polyline");
  });

  it("handles single row in cacheability SVG (sampled.length === 1)", async () => {
    await runWithLog(makeLog());
    const svg = writtenFiles.get(path.join(dir, "cacheability-score.svg"))!;
    expect(svg).toContain("latest proxy:");
    // Single point: adjacentPrefixContinuityScore first element is 0 (i > 0 is false)
    expect(svg).toContain("latest proxy: 0%");
  });

  it("covers multiple providers in summary", async () => {
    const rows = [
      makeLog({ provider: "p1", model: "m1", stablePrefixHash: "aaa" + "a".repeat(61) }),
      makeLog({ provider: "p2", model: "m2", stablePrefixHash: "bbb" + "b".repeat(61) }),
      makeLog({ provider: "p1", model: "m1", stablePrefixHash: "ccc" + "c".repeat(61) }),
    ];
    await runWithLog(rows.join("\n"));
    const summary = JSON.parse(writtenFiles.get(path.join(dir, "summary.json"))!);
    expect(Object.keys(summary.providers)).toHaveLength(2);
    expect(summary.providers["p1/m1"].requests).toBe(2);
    expect(summary.providers["p1/m1"].uniqueStablePrefixHashes).toBe(2);
    expect(summary.providers["p2/m2"].uniqueStablePrefixHashes).toBe(1);
  });

  it("renders fragments SVG with multiple sources sorted by total chars", async () => {
    const log = makeLog({
      fragmentHashes: [
        makeFragmentHash({ source: "small", stability: "stable", chars: 10 }),
        makeFragmentHash({ source: "big", stability: "stable", chars: 500 }),
        makeFragmentHash({ source: "big", stability: "dynamic", chars: 200 }),
      ],
    });
    await runWithLog(log);
    const svg = writtenFiles.get(path.join(dir, "fragments.svg"))!;
    // "big" should appear before "small" (sorted desc by total)
    const bigIdx = svg.indexOf("big");
    const smallIdx = svg.indexOf("small");
    expect(bigIdx).toBeLessThan(smallIdx);
  });

  it("handles row with warnings in renderSvg (warning circles)", async () => {
    const log = [
      makeLog({ warnings: [{ severity: "error", code: "X", message: "w" }] }),
    ].join("\n");
    await runWithLog(log);
    const svg = writtenFiles.get(path.join(dir, "trend.svg"))!;
    expect(svg).toContain("#ef4444");
  });

  it("renders report.md change rows using previous row hash", async () => {
    const rows = [
      makeLog({ stablePrefixHash: "aaaa" + "a".repeat(60) }),
      makeLog({ stablePrefixHash: "bbbb" + "b".repeat(60) }),
    ];
    await runWithLog(rows.join("\n"));
    const report = writtenFiles.get(path.join(dir, "report.md"))!;
    expect(report).toContain("→");
  });

  // --- Tests for remaining uncovered branches (?? / ?. null-side branches) ---

  it("handles row with warnings=undefined (covers r.warnings?.length ?? 0 → right side)", async () => {
    // Create a log object without the 'warnings' field at all
    const obj: Record<string, unknown> = {
      timestamp: "2025-01-01T00:00:00.000Z",
      provider: "p",
      model: "m",
      stablePrefixHash: "hash1" + "1".repeat(59),
      stablePrefixChars: 100,
      totalPromptChars: 200,
      fragmentHashes: [],
    };
    const log = JSON.stringify(obj);
    await runWithLog(log);
    const summary = JSON.parse(writtenFiles.get(path.join(dir, "summary.json"))!);
    expect(summary.warningCount).toBe(0);
    // Also covers the renderSvg branch for (r.warnings?.length ?? 0)
    const svg = writtenFiles.get(path.join(dir, "trend.svg"))!;
    expect(svg).toContain("polyline");
  });

  it("handles row without fragmentHashes field (covers r.fragmentHashes ?? [])", async () => {
    // Create JSONL where the object has no fragmentHashes field at all
    const obj: Record<string, unknown> = {
      timestamp: "2025-01-01T00:00:00.000Z",
      provider: "p",
      model: "m",
      stablePrefixHash: "hash1" + "1".repeat(59),
      stablePrefixChars: 100,
      totalPromptChars: 200,
      warnings: [],
    };
    // Build JSON manually without fragmentHashes
    const json = JSON.stringify(obj);
    await runWithLog(json);
    // Should produce the empty fragments message since no rows have fragmentHashes
    const svg = writtenFiles.get(path.join(dir, "fragments.svg"))!;
    expect(svg).toContain("fragment chars は新しいログから記録されます");
  });

  it("handles fragment with chars=undefined (covers f.chars ?? 0)", async () => {
    // The renderFragmentsSvg only picks up rows where some fragment has typeof f.chars === "number"
    // So we need at least one fragment with chars as number, and one without
    const log = makeLog({
      fragmentHashes: [
        {
          id: "frag-with-chars",
          source: "ext-a",
          kind: "coding_guidelines",
          stability: "stable",
          hash: "hhh1",
          chars: 100,
        },
        {
          id: "frag-no-chars",
          source: "ext-a",
          kind: "coding_guidelines",
          stability: "dynamic",
          hash: "hhh2",
          // chars is intentionally omitted → f.chars ?? 0 triggers
        },
      ],
    });
    await runWithLog(log);
    const svg = writtenFiles.get(path.join(dir, "fragments.svg"))!;
    expect(svg).toContain("ext-a");
  });

  it("covers max===0 branch in scalePoints", async () => {
    // Both stablePrefixChars and totalPromptChars = 0 so max=0
    const rows = [
      makeLog({ stablePrefixChars: 0, totalPromptChars: 0 }),
      makeLog({ stablePrefixChars: 0, totalPromptChars: 0 }),
    ];
    await runWithLog(rows.join("\n"));
    const svg = writtenFiles.get(path.join(dir, "trend.svg"))!;
    expect(svg).toContain("polyline");
  });

  it("covers changeRow with stablePrefixChars undefined", async () => {
    const rows = [
      makeLog({ stablePrefixHash: "aaa" + "a".repeat(61), stablePrefixChars: undefined }),
      makeLog({ stablePrefixHash: "bbb" + "b".repeat(61), stablePrefixChars: undefined, totalPromptChars: undefined }),
    ];
    await runWithLog(rows.join("\n"));
    const report = writtenFiles.get(path.join(dir, "report.md"))!;
    expect(report).toContain("→");
  });

  it("covers changeRow referencing rows[r.line-2] at boundary (line 1 has change from row 0)", async () => {
    // First valid row is on line 1 (no preceding broken lines), second is line 2
    // changeRows accesses rows[r.line - 2] which is rows[-1] → undefined → shortHash(undefined)
    // Actually: row at line 2 has line=2, so r.line-2=0 → rows[0] is fine
    // To get rows[-1] we need first valid row to be on line > 1 (broken line before)
    const brokenAndValid = [
      "broken json line",
      makeLog({ stablePrefixHash: "aaa" + "a".repeat(61) }),
      makeLog({ stablePrefixHash: "bbb" + "b".repeat(61) }),
    ].join("\n");
    await runWithLog(brokenAndValid);
    const report = writtenFiles.get(path.join(dir, "report.md"))!;
    expect(report).toContain("→");
  });

  it("does not count same reuse hash across different provider/model as adjacent reuse", async () => {
    const rows = [
      makeLog({ provider: "openai", model: "gpt-a", stablePrefixHash: "a".repeat(64) }),
      makeLog({ provider: "deepseek", model: "deepseek-chat", stablePrefixHash: "a".repeat(64) }),
    ];
    await runWithLog(rows.join("\n"));
    const summary = JSON.parse(writtenFiles.get(path.join(dir, "summary.json"))!);
    expect(summary.adjacentPrefixReuseRate).toBe(0);
  });

  it("counts A-B-A as window reuse but not adjacent reuse", async () => {
    const rows = [
      makeLog({ stablePrefixHash: "a".repeat(64) }),
      makeLog({ stablePrefixHash: "b".repeat(64) }),
      makeLog({ stablePrefixHash: "a".repeat(64) }),
    ];
    await runWithLog(rows.join("\n"));
    const summary = JSON.parse(writtenFiles.get(path.join(dir, "summary.json"))!);
    expect(summary.adjacentPrefixReuseRate).toBe(0);
    expect(summary.windowPrefixReuseRate).toBeCloseTo(1 / 3);
  });

  it("does not treat empty reuse keys as reusable", async () => {
    const rows = [
      makeLog({ stablePrefixHash: "" }),
      makeLog({ stablePrefixHash: "" }),
    ];
    await runWithLog(rows.join("\n"));
    const summary = JSON.parse(writtenFiles.get(path.join(dir, "summary.json"))!);
    expect(summary.adjacentPrefixReuseRate).toBe(0);
  });

  it("writes uniqueScopedReuseKeyRatio and deprecated uniqueReuseKeyRatio alias", async () => {
    await runWithLog(makeLog());
    const summary = JSON.parse(writtenFiles.get(path.join(dir, "summary.json"))!);
    expect(summary.uniqueScopedReuseKeyRatio).toBe(1);
    expect(summary.uniqueReuseKeyRatio).toBe(summary.uniqueScopedReuseKeyRatio);
  });

  it("shows provider/model transition for scoped reuse key changes", async () => {
    const rows = [
      makeLog({ provider: "p1", model: "m1", stablePrefixHash: "a".repeat(64) }),
      makeLog({ provider: "p2", model: "m2", stablePrefixHash: "a".repeat(64) }),
    ];
    await runWithLog(rows.join("\n"));
    const report = writtenFiles.get(path.join(dir, "report.md"))!;
    expect(report).toContain("最近の scoped reuse key 変化");
    expect(report).toContain("p1/m1 → p2/m2");
  });

  it("covers hashesByProvider.get(key)?.size ?? 0 (first occurrence of provider)", async () => {
    const rows = [
      makeLog({ provider: "first", model: "m", stablePrefixHash: "aaa" + "a".repeat(61) }),
    ];
    await runWithLog(rows.join("\n"));
    const summary = JSON.parse(writtenFiles.get(path.join(dir, "summary.json"))!);
    expect(summary.providers["first/m"].uniqueStablePrefixHashes).toBe(1);
  });

  // ---- Warning distribution & recent window (issue #88) ----

  it("splits warnings into base system / fragment / other categories", async () => {
    const rows = [
      makeLog({ warnings: [warning("BASE_SYSTEM_VOLATILE_SIGNAL"), warning("BASE_SYSTEM_ABSOLUTE_PATH", "info")] }),
      makeLog({ warnings: [warning("VOLATILE_VALUE_IN_STABLE_FRAGMENT", "error"), warning("VOLATILE_VALUE_IN_SEMI_STABLE_FRAGMENT")] }),
      makeLog({ warnings: [warning("FINAL_PAYLOAD_VOLATILE_BEFORE_STABLE_END"), warning("CACHEABLE_FRAGMENT_ORDER_TIE")] }),
    ].join("\n");
    await runWithLog(rows);
    const summary = JSON.parse(writtenFiles.get(path.join(dir, "summary.json"))!);
    // 3 rows < 1000 so recent window == all-time.
    // FINAL_PAYLOAD_VOLATILE_BEFORE_STABLE_END is a fragment-placement warning, so it
    // counts as fragment (not "other") — it is the single largest warning source in
    // production logs and must not be hidden in an undifferentiated bucket.
    expect(summary.warningCategoriesRecent).toEqual({ baseSystem: 2, fragment: 4, other: 0, total: 6 });
    expect(summary.warningCategoriesAll).toEqual(summary.warningCategoriesRecent);
    expect(summary.warningCount).toBe(6);
  });

  it("aggregates warnings by code+severity and sorts by count desc", async () => {
    const rows = [
      makeLog({ warnings: [warning("A"), warning("A")] }),
      makeLog({ warnings: [warning("A")] }),
      makeLog({ warnings: [warning("B", "info"), warning("C")] }),
    ].join("\n");
    await runWithLog(rows);
    const summary = JSON.parse(writtenFiles.get(path.join(dir, "summary.json"))!);
    expect(summary.warningBreakdownRecent[0]).toEqual({ code: "A", severity: "warning", count: 3 });
    const codes = summary.warningBreakdownRecent.map((e: any) => `${e.code}/${e.severity}`);
    expect(codes).toContain("B/info");
    expect(codes).toContain("C/warning");
    // sorted by count desc → A (3) first
    expect(summary.warningBreakdownRecent[0].count).toBeGreaterThanOrEqual(summary.warningBreakdownRecent[1].count);
  });

  it("computes recent window metrics separately from all-time", async () => {
    const rows = [
      makeLog({ timestamp: "2025-01-01T00:00:00.000Z", warnings: [warning("BASE_SYSTEM_VOLATILE_SIGNAL")], stablePrefixHash: "k".repeat(64) }),
      makeLog({ timestamp: "2025-01-02T00:00:00.000Z", warnings: [warning("BASE_SYSTEM_VOLATILE_SIGNAL"), warning("X")], stablePrefixHash: "k".repeat(64) }),
    ].join("\n");
    const actual = [
      makeActualLog({ inputTotalTokens: 1000, cacheReadTokens: 200 }),
      makeActualLog({ inputTotalTokens: 1000, cacheReadTokens: 800 }),
    ].join("\n");
    await runWithLog(rows, actual);
    const summary = JSON.parse(writtenFiles.get(path.join(dir, "summary.json"))!);
    const w = summary.recentWindow;
    expect(w.windowCapacity).toBe(1000);
    expect(w.windowRequestCount).toBe(2);
    expect(w.warningCount).toBe(3);
    expect(w.uniqueScopedReuseKeys).toBe(1); // same provider/model + same reuse hash
    expect(w.adjacentPrefixReuseRate).toBe(1); // both reuse keys equal
    expect(w.actualRequestCount).toBe(2);
    // weighted = (200+800) / (1000+1000)
    expect(w.actualTokenHitRateWeighted).toBeCloseTo(0.5, 5);
    expect(w.windowStartTimestamp).toBe("2025-01-01T00:00:00.000Z");
    expect(w.windowEndTimestamp).toBe("2025-01-02T00:00:00.000Z");
  });

  it("limits the recent window to the most recent 1000 requests", async () => {
    // 1002 rows: first 2 carry an extra base-system warning that must NOT appear in the recent window.
    const rows: string[] = [];
    for (let i = 0; i < 1002; i++) {
      const warnings = i < 2 ? [warning("BASE_SYSTEM_VOLATILE_SIGNAL")] : [];
      rows.push(makeLog({ timestamp: new Date(Date.UTC(2025, 0, 1 + Math.floor(i / 500))).toISOString(), warnings, stablePrefixHash: `h${i}` + "x".repeat(60) }));
    }
    await runWithLog(rows.join("\n"));
    const summary = JSON.parse(writtenFiles.get(path.join(dir, "summary.json"))!);
    expect(summary.recentWindow.windowRequestCount).toBe(1000);
    expect(summary.recentWindow.windowCapacity).toBe(1000);
    // recent window excludes the first 2 rows (the only ones with warnings)
    expect(summary.recentWindow.warningCount).toBe(0);
    expect(summary.warningCategoriesRecent.total).toBe(0);
    // all-time still sees them
    expect(summary.warningCount).toBe(2);
    expect(summary.warningCategoriesAll.baseSystem).toBe(2);
  });

  it("handles empty logs for recent window and warning distribution without throwing", async () => {
    await runWithLog("");
    const summary = JSON.parse(writtenFiles.get(path.join(dir, "summary.json"))!);
    expect(summary.recentWindow).toEqual({
      windowCapacity: 1000,
      windowRequestCount: 0,
      windowStartTimestamp: null,
      windowEndTimestamp: null,
      warningCount: 0,
      uniqueScopedReuseKeys: 0,
      adjacentPrefixReuseRate: null,
      actualRequestCount: 0,
      actualTokenHitRateWeighted: null,
    });
    expect(summary.warningBreakdownRecent).toEqual([]);
    expect(summary.warningCategoriesRecent).toEqual({ baseSystem: 0, fragment: 0, other: 0, total: 0 });
  });

  it("renders recent window comparison and warning distribution sections in report.md", async () => {
    const rows = [
      makeLog({ warnings: [warning("BASE_SYSTEM_VOLATILE_SIGNAL"), warning("VOLATILE_VALUE_IN_STABLE_FRAGMENT", "error")] }),
    ].join("\n");
    await runWithLog(rows);
    const report = writtenFiles.get(path.join(dir, "report.md"))!;
    expect(report).toContain("### 1.1 Recent window vs all-time");
    expect(report).toContain("## 11. Warning distribution");
    expect(report).toContain("### 11.1 By origin");
    expect(report).toContain("base system 起因");
    expect(report).toContain("fragment 起因");
    expect(report).toContain("### 11.2 Top 15 warning codes (recent window)");
    expect(report).toContain("`BASE_SYSTEM_VOLATILE_SIGNAL`");
    expect(report).toContain("`VOLATILE_VALUE_IN_STABLE_FRAGMENT`");
    // Glossary shifted from 11 to 12
    expect(report).toContain("## 12. Glossary");
    expect(report).not.toContain("## 11. Glossary");
  });
});
