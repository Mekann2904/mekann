/**
 * @file .pi/lib/agent/benchmark-harness.ts の単体テスト
 * @description Prompt Stack 指標と variant 比較の集計結果を検証する
 * @testFramework vitest
 */

import { describe, expect, it } from "vitest";

import {
  compareBenchmarkVariants,
  createLoopBenchmarkRun,
  createSubagentBenchmarkRun,
  estimatePromptTokens,
  summarizePromptStackForBenchmark,
} from "../../../.pi/lib/agent/benchmark-harness.js";

describe("benchmark-harness", () => {
  it("Prompt Stack の文字数と source/layer 別内訳を集計できる", () => {
    const summary = summarizePromptStackForBenchmark([
      {
        source: "tooling",
        layer: "tool-description",
        content: "Use the minimal schema.",
      },
      {
        source: "policy",
        layer: "system-policy",
        content: "Do not skip verification.",
      },
      {
        source: "plan",
        layer: "runtime-notification",
        content: "Verification failed. Retry once.",
      },
    ]);

    expect(summary.entryCount).toBe(3);
    expect(summary.totalChars).toBeGreaterThan(0);
    expect(summary.byLayer["runtime-notification"]).toBeGreaterThan(0);
    expect(summary.bySource.plan).toBeGreaterThan(0);
    expect(summary.estimatedTokens).toBe(estimatePromptTokens("x".repeat(summary.totalChars)));
  });

  it("variant を完了率優先で比較できる", () => {
    const comparison = compareBenchmarkVariants([
      {
        variantId: "adapter-a",
        scenarioId: "search-1",
        completed: true,
        toolCalls: 4,
        toolFailures: 0,
        retries: 0,
        emptyOutputs: 0,
        turns: 3,
        promptChars: 480,
        latencyMs: 1200,
      },
      {
        variantId: "adapter-a",
        scenarioId: "search-2",
        completed: false,
        toolCalls: 5,
        toolFailures: 2,
        retries: 1,
        emptyOutputs: 1,
        turns: 5,
        promptChars: 520,
        latencyMs: 2000,
      },
      {
        variantId: "adapter-b",
        scenarioId: "search-1",
        completed: true,
        toolCalls: 4,
        toolFailures: 0,
        retries: 0,
        emptyOutputs: 0,
        turns: 3,
        promptChars: 410,
        latencyMs: 1000,
      },
      {
        variantId: "adapter-b",
        scenarioId: "search-2",
        completed: true,
        toolCalls: 4,
        toolFailures: 0,
        retries: 0,
        emptyOutputs: 0,
        turns: 4,
        promptChars: 430,
        latencyMs: 1400,
      },
    ]);

    expect(comparison.bestVariant?.variantId).toBe("adapter-b");
    expect(comparison.variants).toHaveLength(2);
    expect(comparison.variants[0].completionRate).toBe(1);
    expect(comparison.variants[1].toolFailureRate).toBeGreaterThan(0);
  });

  it("subagent 実行から benchmark run を作れる", () => {
    const run = createSubagentBenchmarkRun({
      provider: "openai",
      model: "gpt-5",
      task: "Implement benchmark wiring",
      successCount: 2,
      failureCount: 1,
      retries: 1,
      promptChars: 800,
      latencyMs: 1400,
    });

    expect(run.variantId).toBe("openai/gpt-5");
    expect(run.scenarioId).toContain("subagent:");
    expect(run.toolCalls).toBe(3);
    expect(run.toolFailures).toBe(1);
    expect(run.retries).toBe(1);
  });

  it("loop 実行から benchmark run を作れる", () => {
    const run = createLoopBenchmarkRun({
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      task: "Fix loop validation",
      completed: true,
      iterations: 4,
      verificationFailures: 1,
      emptyOutputs: 0,
      promptChars: 1200,
    });

    expect(run.variantId).toBe("anthropic/claude-sonnet-4-5");
    expect(run.scenarioId).toContain("loop:");
    expect(run.completed).toBe(true);
    expect(run.turns).toBe(4);
    expect(run.toolFailures).toBe(1);
  });
});
