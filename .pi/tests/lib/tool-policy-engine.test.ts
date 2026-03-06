// Path: .pi/tests/lib/tool-policy-engine.test.ts
// Role: ツール policy engine の timeout と duplicate 判定を検証する
// Why: adaptive timeout と exact duplicate 再利用の判断を壊さないため
// Related: .pi/lib/tool-policy-engine.ts, .pi/lib/tool-telemetry-store.ts, .pi/lib/runtime-environment-cache.ts

import { beforeEach, describe, expect, it } from "vitest";

import { resolveProbeLimit, resolveToolExecutionPolicy } from "../../lib/tool-policy-engine.js";
import { getToolTelemetryStore, resetToolTelemetryStore } from "../../lib/tool-telemetry-store.js";

describe("tool policy engine", () => {
  beforeEach(() => {
    resetToolTelemetryStore();
  });

  it("履歴の p95 に応じて timeout を延長する", () => {
    const store = getToolTelemetryStore();
    const now = Date.now();
    for (let index = 0; index < 4; index += 1) {
      store.finish({
        id: `record-${index}`,
        toolName: "rg",
        startedAtMs: now - 5000 - index * 10,
        finishedAtMs: now - 1000 - index * 10,
        durationMs: 4000,
        timeoutMs: 4500,
        success: true,
        timedOut: false,
        aborted: false,
        retryCount: 0,
        outputBytes: 100,
        inputFingerprint: `fp-${index}`,
        normalizedSignature: `rg:{\"pattern\":\"foo-${index}\"}`,
        resultSummary: "ok",
      });
    }

    const decision = resolveToolExecutionPolicy({
      toolName: "rg",
      inputFingerprint: "new-fp",
      inputSignature: "rg:{\"pattern\":\"bar\"}",
      defaultTimeoutMs: 1000,
      metadata: {
        defaultTimeoutMs: 1000,
        maxTimeoutMs: 10000,
      },
      executionMode: "full",
    });

    expect(decision.timeoutMs).toBeGreaterThan(1000);
  });

  it("exact duplicate があれば再利用対象として返す", () => {
    const store = getToolTelemetryStore();
    const now = Date.now();
    store.finish({
      id: "record-1",
      toolName: "rg",
      startedAtMs: now - 200,
      finishedAtMs: now - 100,
      durationMs: 100,
      timeoutMs: 1000,
      success: true,
      timedOut: false,
      aborted: false,
      retryCount: 0,
      outputBytes: 40,
      inputFingerprint: "exact-fp",
      normalizedSignature: "rg:{\"pattern\":\"foo\"}",
      resultSummary: "ok",
    });

    const decision = resolveToolExecutionPolicy({
      toolName: "rg",
      inputFingerprint: "exact-fp",
      inputSignature: "rg:{\"pattern\":\"foo\"}",
      defaultTimeoutMs: 1000,
      executionMode: "full",
      canReuseDuplicateResult: true,
    });

    expect(decision.reusedDuplicateRecordId).toBe("record-1");
    expect(decision.duplicateWarning).toBeTruthy();
  });

  it("遅い履歴があると probe limit を縮める", () => {
    const store = getToolTelemetryStore();
    const now = Date.now();
    for (let index = 0; index < 4; index += 1) {
      store.finish({
        id: `slow-${index}`,
        toolName: "rg",
        startedAtMs: now - 3000 - index * 10,
        finishedAtMs: now - 1000 - index * 10,
        durationMs: 2200,
        timeoutMs: 3000,
        success: true,
        timedOut: false,
        aborted: false,
        retryCount: 0,
        outputBytes: 70_000,
        inputFingerprint: `slow-fp-${index}`,
        normalizedSignature: `rg:{\"pattern\":\"slow-${index}\"}`,
        resultSummary: "ok",
      });
    }

    const probeLimit = resolveProbeLimit({
      toolName: "rg",
      requestedLimit: 50,
      minimumProbeLimit: 5,
      maximumProbeLimit: 20,
      metadata: { outputSizeEstimate: "large", requiresProbe: true },
    });

    expect(probeLimit).toBe(10);
  });
});
