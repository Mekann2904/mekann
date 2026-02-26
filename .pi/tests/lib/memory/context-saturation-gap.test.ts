/**
 * @abdd.meta
 * path: .pi/tests/lib/memory/context-saturation-gap.test.ts
 * role: Context Saturation Gap測定の単体テスト
 * why: Δ測定ロジックの正確性を検証するため
 * related: .pi/lib/memory/context-saturation-gap.ts
 * public_api: なし（テストファイル）
 * invariants: モックを使用し外部APIを呼ばない
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: Context Saturation Gap測定機能の単体テスト
 * what_it_does:
 *   - トークン推定のテスト
 *   - Δ計算のテスト
 *   - 推奨判定のテスト
 *   - Full-Context/MAG測定のテスト
 * why_it_exists:
 *   - モックベースでロジックを検証し外部依存を排除するため
 * scope:
 *   in: テストケース、モックデータ
 *   out: テスト結果
 */

// File: .pi/tests/lib/memory/context-saturation-gap.test.ts
// Description: Unit tests for Context Saturation Gap measurement.
// Why: Validates Δ calculation logic without external dependencies.

import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  calculateSaturationGap,
  getRecommendation,
  runSaturationTest,
  measureFullContextBaseline,
  measureMAGPerformance,
  type SaturationTestConfig,
  type SemanticRetriever,
  type PerformanceEvaluator,
} from "@lib/memory/context-saturation-gap.js";

describe("estimateTokens", () => {
  it("should estimate tokens for ASCII text", () => {
    const text = "Hello World"; // 11 chars
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThanOrEqual(11);
  });

  it("should estimate tokens for Japanese text", () => {
    const text = "こんにちは世界"; // 7 chars
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThanOrEqual(7);
  });

  it("should return 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });
});

describe("calculateSaturationGap", () => {
  it("should calculate positive delta when MAG outperforms", () => {
    const delta = calculateSaturationGap(0.5, 0.8);
    expect(delta).toBeCloseTo(0.3);
  });

  it("should calculate negative delta when full context outperforms", () => {
    const delta = calculateSaturationGap(0.8, 0.5);
    expect(delta).toBeCloseTo(-0.3);
  });

  it("should return 0 when scores are equal", () => {
    const delta = calculateSaturationGap(0.7, 0.7);
    expect(delta).toBe(0);
  });
});

describe("getRecommendation", () => {
  const threshold = 0.1;

  it("should recommend use_memory when delta is high positive", () => {
    const rec = getRecommendation(0.3, threshold);
    expect(rec).toBe("use_memory");
  });

  it("should recommend full_context_sufficient when delta is negative", () => {
    const rec = getRecommendation(-0.3, threshold);
    expect(rec).toBe("full_context_sufficient");
  });

  it("should recommend inconclusive when delta is near zero", () => {
    const rec = getRecommendation(0.05, threshold);
    expect(rec).toBe("inconclusive");
  });

  it("should use custom threshold", () => {
    const rec = getRecommendation(0.15, 0.2);
    expect(rec).toBe("inconclusive");
  });
});

describe("measureFullContextBaseline", () => {
  it("should return score and latency without evaluator", async () => {
    const config: SaturationTestConfig = {
      task: "Test task",
      testData: ["data1", "data2", "data3"],
      contextWindowTokens: 1000,
      deltaThreshold: 0.1,
      magSystem: "semantic-memory",
    };

    const result = await measureFullContextBaseline(config);

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.latency).toBeGreaterThanOrEqual(0);
  });

  it("should use custom evaluator when provided", async () => {
    const config: SaturationTestConfig = {
      task: "Test task",
      testData: ["data1"],
      contextWindowTokens: 1000,
      deltaThreshold: 0.1,
      magSystem: "semantic-memory",
    };

    const mockEvaluator: PerformanceEvaluator = {
      evaluate: async () => 0.9,
    };

    const result = await measureFullContextBaseline(config, mockEvaluator);

    expect(result.score).toBe(0.9);
  });

  it("should reduce score with higher saturation", async () => {
    const smallConfig: SaturationTestConfig = {
      task: "Test",
      testData: ["short"],
      contextWindowTokens: 10000,
      deltaThreshold: 0.1,
      magSystem: "semantic-memory",
    };

    const largeConfig: SaturationTestConfig = {
      task: "Test",
      testData: Array(1000).fill("x".repeat(100)),
      contextWindowTokens: 1000,
      deltaThreshold: 0.1,
      magSystem: "semantic-memory",
    };

    const smallResult = await measureFullContextBaseline(smallConfig);
    const largeResult = await measureFullContextBaseline(largeConfig);

    // 高飽和ではスコアが低下する
    expect(smallResult.score).toBeGreaterThan(largeResult.score);
  });
});

describe("measureMAGPerformance", () => {
  it("should return score, latency, and retrievalTokens without retriever", async () => {
    const config: SaturationTestConfig = {
      task: "Test task",
      testData: ["data1", "data2", "data3"],
      contextWindowTokens: 1000,
      deltaThreshold: 0.1,
      magSystem: "semantic-memory",
    };

    const result = await measureMAGPerformance(config);

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.latency).toBeGreaterThanOrEqual(0);
    expect(result.retrievalTokens).toBeGreaterThan(0);
  });

  it("should use custom retriever when provided", async () => {
    const config: SaturationTestConfig = {
      task: "Test task",
      testData: ["data1", "data2"],
      contextWindowTokens: 1000,
      deltaThreshold: 0.1,
      magSystem: "semantic-memory",
    };

    const mockRetriever: SemanticRetriever = {
      retrieve: async () => ["retrieved1", "retrieved2"],
    };

    const result = await measureMAGPerformance(config, mockRetriever);

    expect(result.retrievalTokens).toBeGreaterThan(0);
  });

  it("should use custom evaluator when provided", async () => {
    const config: SaturationTestConfig = {
      task: "Test task",
      testData: ["data1"],
      contextWindowTokens: 1000,
      deltaThreshold: 0.1,
      magSystem: "semantic-memory",
    };

    const mockEvaluator: PerformanceEvaluator = {
      evaluate: async () => 0.85,
    };

    const result = await measureMAGPerformance(config, undefined, mockEvaluator);

    expect(result.score).toBe(0.85);
  });
});

describe("runSaturationTest", () => {
  it("should return complete SaturationTestResult", async () => {
    const config: SaturationTestConfig = {
      task: "Summarize the data",
      testData: ["Item 1", "Item 2", "Item 3"],
      contextWindowTokens: 1000,
      deltaThreshold: 0.1,
      magSystem: "semantic-memory",
    };

    const result = await runSaturationTest(config);

    expect(result.taskId).toBeDefined();
    expect(result.fullContextScore).toBeGreaterThanOrEqual(0);
    expect(result.magScore).toBeGreaterThanOrEqual(0);
    expect(result.delta).toBe(result.magScore - result.fullContextScore);
    expect(["use_memory", "full_context_sufficient", "inconclusive"]).toContain(
      result.recommendation
    );
    expect(result.metrics.fullContextTokens).toBeGreaterThan(0);
    expect(result.metrics.magRetrievalTokens).toBeGreaterThan(0);
    expect(result.metrics.fullContextLatencyMs).toBeGreaterThanOrEqual(0);
    expect(result.metrics.magLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it("should use mock components when not provided", async () => {
    const config: SaturationTestConfig = {
      task: "Test task",
      testData: Array(100).fill("data point"),
      contextWindowTokens: 500,
      deltaThreshold: 0.1,
      magSystem: "entity-centric",
    };

    const result = await runSaturationTest(config);

    // モックでは高飽和でMAGが有利になる設計
    expect(result.magScore).toBeGreaterThan(result.fullContextScore);
    expect(result.recommendation).toBe("use_memory");
  });

  it("should respect deltaThreshold", async () => {
    const config: SaturationTestConfig = {
      task: "Test",
      testData: ["single item"],
      contextWindowTokens: 10000,
      deltaThreshold: 0.2, // Lower threshold to get definitive result
      magSystem: "episodic",
    };

    const result = await runSaturationTest(config);

    // 低飽和ではFull-Contextが十分 (delta is negative and below threshold)
    expect(result.recommendation).toBe("full_context_sufficient");
  });
});
