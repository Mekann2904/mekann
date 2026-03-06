// Path: .pi/tests/lib/tool-telemetry-store.test.ts
// Role: ツールテレメトリストアの重複検出と hint 生成を検証する
// Why: runtime policy の土台が意図通りに動くことを固定化するため
// Related: .pi/lib/tool-telemetry-store.ts, .pi/lib/tool-telemetry.ts, .pi/lib/tool-policy-engine.ts

import { beforeEach, describe, expect, it, vi } from "vitest";

import { getToolTelemetryStore, resetToolTelemetryStore } from "../../lib/tool-telemetry-store.js";

describe("tool telemetry store", () => {
  beforeEach(() => {
    resetToolTelemetryStore();
    vi.useRealTimers();
  });

  it("recent exact duplicate を検出できる", () => {
    const store = getToolTelemetryStore();
    const now = Date.now();
    store.finish({
      id: "record-1",
      toolName: "rg",
      startedAtMs: now - 200,
      finishedAtMs: now - 100,
      durationMs: 100,
      timeoutMs: 3000,
      success: true,
      timedOut: false,
      aborted: false,
      retryCount: 0,
      outputBytes: 120,
      inputFingerprint: "fp-1",
      normalizedSignature: "rg:{\"pattern\":\"foo\"}",
      resultSummary: "match",
    });

    expect(store.findRecentExactDuplicate("fp-1")?.id).toBe("record-1");
    expect(store.findRecentDuplicate("rg:{\"pattern\":\"foo\"}")?.id).toBe("record-1");
  });

  it("slow call と duplicate の prompt hint を生成できる", () => {
    const store = getToolTelemetryStore();
    const base = Date.now();

    store.finish({
      id: "record-1",
      toolName: "repo_scan",
      startedAtMs: base - 5100,
      finishedAtMs: base - 100,
      durationMs: 5000,
      timeoutMs: 6000,
      success: true,
      timedOut: false,
      aborted: false,
      retryCount: 0,
      outputBytes: 500,
      inputFingerprint: "fp-1",
      normalizedSignature: "repo_scan:{\"path\":\".\"}",
      resultSummary: "ok",
    });

    store.finish({
      id: "record-2",
      toolName: "rg",
      startedAtMs: base - 90,
      finishedAtMs: base - 40,
      durationMs: 50,
      timeoutMs: 3000,
      success: true,
      timedOut: false,
      aborted: false,
      retryCount: 0,
      outputBytes: 10,
      inputFingerprint: "fp-2",
      normalizedSignature: "rg:{\"pattern\":\"foo\"}",
      resultSummary: "ok",
    });

    store.finish({
      id: "record-3",
      toolName: "rg",
      startedAtMs: base - 30,
      finishedAtMs: base - 10,
      durationMs: 20,
      timeoutMs: 3000,
      success: true,
      timedOut: false,
      aborted: false,
      retryCount: 0,
      outputBytes: 10,
      inputFingerprint: "fp-3",
      normalizedSignature: "rg:{\"pattern\":\"foo\"}",
      resultSummary: "ok",
    });

    const hints = store.buildPromptHints({ maxHints: 5, slowCallThresholdMs: 1000, duplicateWindowMs: 60_000 });

    expect(hints.some((hint) => hint.includes("Slow tool: repo_scan"))).toBe(true);
    expect(hints.some((hint) => hint.includes("Duplicate call: rg repeated 2 times"))).toBe(true);
  });

  it("probe から full への昇格率を集計して hint を生成できる", () => {
    const store = getToolTelemetryStore();
    const base = Date.now();

    store.finish({
      id: "probe-1",
      toolName: "rg",
      startedAtMs: base - 200,
      finishedAtMs: base - 180,
      durationMs: 20,
      timeoutMs: 1000,
      success: true,
      timedOut: false,
      aborted: false,
      retryCount: 0,
      outputBytes: 50,
      inputFingerprint: "probe-fp-1",
      normalizedSignature: "rg:{\"pattern\":\"foo\"}",
      executionMode: "probe",
      resultSummary: "ok",
    });

    store.finish({
      id: "full-1",
      toolName: "rg",
      startedAtMs: base - 170,
      finishedAtMs: base - 120,
      durationMs: 50,
      timeoutMs: 1000,
      success: true,
      timedOut: false,
      aborted: false,
      retryCount: 0,
      outputBytes: 80,
      inputFingerprint: "full-fp-1",
      normalizedSignature: "rg:{\"pattern\":\"foo\"}",
      executionMode: "full",
      resultSummary: "ok",
    });

    store.finish({
      id: "probe-2",
      toolName: "rg",
      startedAtMs: base - 110,
      finishedAtMs: base - 90,
      durationMs: 20,
      timeoutMs: 1000,
      success: true,
      timedOut: false,
      aborted: false,
      retryCount: 0,
      outputBytes: 40,
      inputFingerprint: "probe-fp-2",
      normalizedSignature: "rg:{\"pattern\":\"bar\"}",
      executionMode: "probe",
      resultSummary: "ok",
    });

    const stats = store.getToolStats("rg");
    const hints = store.buildPromptHints({ maxHints: 5, duplicateWindowMs: 60_000 });

    expect(stats.probeToFullEscalationRate).toBe(0.5);
    expect(stats.modeStats.probe?.count).toBe(2);
    expect(stats.modeStats.full?.count).toBe(1);
    expect(hints.some((hint) => hint.includes("Probe escalates often: rg promotes to full 50%"))).toBe(true);
  });
});
