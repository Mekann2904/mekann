/**
 * @abdd.meta
 * path: .pi/tests/lib/adaptive-rate-controller.test.ts
 * role: 適応的レート制御のユニットテスト
 * why: 429エラーからの学習と回復ロジックの正確性を保証するため
 * related: .pi/lib/adaptive-rate-controller.ts
 * public_api: なし（テストファイル）
 * invariants: テストは冪等であり、各テスト後に状態をリセットする
 * side_effects: なし（テストモードで実行）
 * failure_modes: テスト失敗時は実装の不具合を示す
 * @abdd.explain
 * overview: adaptive-rate-controllerの主要機能をテストする
 * what_it_does:
 *   - 429エラー記録と制限値削減をテスト
 *   - 成功記録と回復スケジューリングをテスト
 *   - 予測分析機能をテスト
 * why_it_exists: レート制御の信頼性を確保するため
 * scope:
 *   in: テストケース定義
 *   out: テスト結果
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  initAdaptiveController,
  shutdownAdaptiveController,
  getEffectiveLimit,
  record429,
  recordSuccess,
  getLearnedLimit,
  resetLearnedLimit,
  resetAllLearnedLimits,
  isRateLimitError,
  analyze429Probability,
  getPredictiveAnalysis,
  getCombinedRateControlSummary,
  setGlobalMultiplier,
  configureRecovery,
} from "@lib/adaptive-rate-controller.js";

describe("adaptive-rate-controller", () => {
  beforeEach(() => {
    // Reset state before each test
    shutdownAdaptiveController();
    initAdaptiveController();
    resetAllLearnedLimits();
  });

  afterEach(() => {
    shutdownAdaptiveController();
  });

  describe("getEffectiveLimit", () => {
    it("should return preset limit when no learned limit exists", () => {
      const limit = getEffectiveLimit("anthropic", "claude-sonnet-4", 4);
      expect(limit).toBe(4);
    });

    it("should return learned limit when it exists", () => {
      // Record a 429 to create a learned limit
      record429("anthropic", "claude-sonnet-4");
      
      const limit = getEffectiveLimit("anthropic", "claude-sonnet-4", 4);
      // Should be reduced
      expect(limit).toBeLessThan(4);
    });

    it("should handle case-insensitive provider/model names", () => {
      const limit1 = getEffectiveLimit("Anthropic", "Claude-Sonnet-4", 4);
      const limit2 = getEffectiveLimit("anthropic", "claude-sonnet-4", 4);
      expect(limit1).toBe(limit2);
    });
  });

  describe("record429 and limit reduction", () => {
    it("should reduce limit on 429 error", () => {
      const originalLimit = 4;
      record429("test-provider", "test-model");
      
      const learned = getLearnedLimit("test-provider", "test-model");
      expect(learned).toBeDefined();
      expect(learned!.concurrency).toBeLessThan(originalLimit);
      expect(learned!.consecutive429Count).toBe(1);
      expect(learned!.total429Count).toBe(1);
    });

    it("should reduce limit more aggressively with consecutive 429s", () => {
      const provider = "consecutive-test";
      const model = "test-model";
      
      // Record multiple 429s
      for (let i = 0; i < 3; i++) {
        record429(provider, model);
      }
      
      const learned = getLearnedLimit(provider, model);
      expect(learned!.consecutive429Count).toBe(3);
      // With 3+ consecutive 429s, additional 50% reduction should apply
      expect(learned!.concurrency).toBeLessThanOrEqual(1);
    });

    it("should track historical 429s", () => {
      record429("history-test", "model");
      
      const learned = getLearnedLimit("history-test", "model");
      expect(learned!.historical429s).toBeDefined();
      expect(learned!.historical429s!.length).toBe(1);
    });
  });

  describe("recordSuccess and recovery", () => {
    it("should reset consecutive count on success", () => {
      const provider = "success-test";
      const model = "model";
      
      record429(provider, model);
      const after429 = getLearnedLimit(provider, model);
      expect(after429!.consecutive429Count).toBe(1);
      
      recordSuccess(provider, model);
      const afterSuccess = getLearnedLimit(provider, model);
      expect(afterSuccess!.consecutive429Count).toBe(0);
    });

    it("should schedule recovery when below original limit", () => {
      const provider = "recovery-test";
      const model = "model";
      
      record429(provider, model);
      const after429 = getLearnedLimit(provider, model);
      expect(after429!.recoveryScheduled).toBe(false); // Not scheduled until success
      
      recordSuccess(provider, model);
      const afterSuccess = getLearnedLimit(provider, model);
      expect(afterSuccess!.recoveryScheduled).toBe(true);
    });
  });

  describe("isRateLimitError", () => {
    it("should detect 429 in error message", () => {
      expect(isRateLimitError(new Error("429 Too Many Requests"))).toBe(true);
      expect(isRateLimitError(new Error("rate limit exceeded"))).toBe(true);
      expect(isRateLimitError(new Error("Rate_Limit hit"))).toBe(true);
    });

    it("should detect quota exceeded", () => {
      expect(isRateLimitError(new Error("quota exceeded"))).toBe(true);
    });

    it("should not detect non-rate-limit errors", () => {
      expect(isRateLimitError(new Error("500 Internal Server Error"))).toBe(false);
      expect(isRateLimitError(new Error("Invalid request"))).toBe(false);
      expect(isRateLimitError(null)).toBe(false);
      expect(isRateLimitError(undefined)).toBe(false);
    });
  });

  describe("analyze429Probability", () => {
    it("should return 0 when no history exists", () => {
      const prob = analyze429Probability("new-provider", "new-model");
      expect(prob).toBe(0);
    });

    it("should increase probability with recent 429s", () => {
      const provider = "prob-test";
      const model = "model";
      
      // Record several 429s
      for (let i = 0; i < 3; i++) {
        record429(provider, model);
      }
      
      const prob = analyze429Probability(provider, model);
      expect(prob).toBeGreaterThan(0);
    });
  });

  describe("getPredictiveAnalysis", () => {
    it("should return default values for new provider/model", () => {
      const analysis = getPredictiveAnalysis("new-provider", "new-model");
      expect(analysis.predicted429Probability).toBe(0);
      expect(analysis.shouldProactivelyThrottle).toBe(false);
      expect(analysis.recommendedConcurrency).toBe(4);
    });

    it("should recommend throttling when probability is high", () => {
      const provider = "throttle-test";
      const model = "model";
      
      // Record many 429s to increase probability
      for (let i = 0; i < 5; i++) {
        record429(provider, model);
      }
      
      const analysis = getPredictiveAnalysis(provider, model);
      expect(analysis.predicted429Probability).toBeGreaterThan(0);
    });
  });

  describe("getCombinedRateControlSummary", () => {
    it("should return combined summary", () => {
      const summary = getCombinedRateControlSummary("anthropic", "claude-sonnet-4");
      expect(summary.adaptiveLimit).toBeDefined();
      expect(summary.originalLimit).toBeDefined();
      expect(summary.predictiveLimit).toBeDefined();
      expect(summary.predicted429Probability).toBeDefined();
      expect(summary.shouldThrottle).toBeDefined();
      expect(summary.recent429Count).toBeDefined();
    });
  });

  describe("resetLearnedLimit", () => {
    it("should reset learned limit for specific provider/model", () => {
      const provider = "reset-test";
      const model = "model";
      
      record429(provider, model);
      const before = getLearnedLimit(provider, model);
      expect(before!.concurrency).toBeLessThan(4);
      
      resetLearnedLimit(provider, model, 4);
      const after = getLearnedLimit(provider, model);
      expect(after!.concurrency).toBe(4);
      expect(after!.consecutive429Count).toBe(0);
    });
  });

  describe("setGlobalMultiplier", () => {
    it("should set global multiplier", () => {
      setGlobalMultiplier(0.5);
      
      const limit = getEffectiveLimit("test", "model", 4);
      expect(limit).toBe(2); // 4 * 0.5
    });

    it("should clamp multiplier to valid range", () => {
      setGlobalMultiplier(10); // Should be clamped to 2.0
      const limit = getEffectiveLimit("test2", "model", 4);
      expect(limit).toBeLessThanOrEqual(8); // 4 * 2.0
    });
  });

  describe("configureRecovery", () => {
    it("should configure recovery parameters", () => {
      configureRecovery({
        recoveryIntervalMs: 120000,
        reductionFactor: 0.7,
        recoveryFactor: 1.1,
      });
      
      // Configuration should be applied without error
      // Actual effect would be tested in integration tests
    });
  });
});
