/**
 * @file .pi/lib/adaptive-rate-controller.ts の単体テスト
 * @description 適応的レート制御のテスト
 * @testFramework vitest
 *
 * モック/スタブ戦略:
 * - Solitary test: node:fs モジュールをモック化
 * - タイマー依存: vi.useFakeTimers() で制御
 * - runtime-config をモック化
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import {
  initAdaptiveController,
  shutdownAdaptiveController,
  getEffectiveLimit,
  record429,
  recordSuccess,
  getAdaptiveState,
  getLearnedLimit,
  resetLearnedLimit,
  resetAllLearnedLimits,
  setGlobalMultiplier,
  isRateLimitError,
  analyze429Probability,
  getPredictiveAnalysis,
  shouldProactivelyThrottle,
  getPredictiveConcurrency,
  type AdaptiveControllerState,
  type LearnedLimit,
} from "@lib/adaptive-rate-controller";

// ============================================================================
// モック設定
// ============================================================================

let mockFileSystem: Map<string, string> = new Map();

vi.mock("node:fs", () => ({
  existsSync: vi.fn((path: string) => mockFileSystem.has(path)),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn((path: string) => {
    const content = mockFileSystem.get(path);
    if (content === undefined) {
      throw new Error("ENOENT");
    }
    return content;
  }),
  writeFileSync: vi.fn((path: string, content: string) => {
    mockFileSystem.set(path, content);
  }),
}));

vi.mock("node:os", () => ({
  homedir: vi.fn(() => "/mock/home"),
}));

vi.mock("@lib/runtime-config.js", () => ({
  getRuntimeConfig: vi.fn(() => ({
    recoveryIntervalMs: 300000,
    reductionFactor: 0.7,
    recoveryFactor: 1.1,
    predictiveEnabled: true,
    maxConcurrentPerModel: 4,
    maxTotalConcurrent: 8,
  })),
}));

// ============================================================================
// テスト用ユーティリティ
// ============================================================================

function clearState(): void {
  shutdownAdaptiveController();
  mockFileSystem.clear();
}

// ============================================================================
// initAdaptiveController / shutdownAdaptiveController
// ============================================================================

describe("initAdaptiveController / shutdownAdaptiveController", () => {
  beforeEach(() => {
    clearState();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearState();
  });

  describe("正常系", () => {
    it("should_initialize_controller", () => {
      // Act
      initAdaptiveController();
      const state = getAdaptiveState();

      // Assert
      expect(state).toBeDefined();
      expect(state.version).toBeGreaterThan(0);
    });

    it("should_not_reinitialize_if_already_initialized", () => {
      // Arrange
      initAdaptiveController();
      const state1 = getAdaptiveState();

      // Act
      initAdaptiveController();
      const state2 = getAdaptiveState();

      // Assert
      expect(state1.lastUpdated).toBe(state2.lastUpdated);
    });

    it("should_shutdown_controller", () => {
      // Arrange
      initAdaptiveController();

      // Act
      shutdownAdaptiveController();

      // Assert
      // シャットダウン後は状態がリセットされる
      expect(() => getAdaptiveState()).not.toThrow();
    });
  });
});

// ============================================================================
// getEffectiveLimit
// ============================================================================

describe("getEffectiveLimit", () => {
  beforeEach(() => {
    clearState();
    vi.useFakeTimers();
    initAdaptiveController();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearState();
  });

  describe("正常系", () => {
    it("should_return_preset_limit_for_new_provider", () => {
      // Arrange
      const presetLimit = 4;

      // Act
      const result = getEffectiveLimit("anthropic", "claude-sonnet-4", presetLimit);

      // Assert
      expect(result).toBe(presetLimit);
    });

    it("should_create_entry_for_new_provider", () => {
      // Arrange
      const presetLimit = 4;

      // Act
      getEffectiveLimit("new-provider", "new-model", presetLimit);
      const learned = getLearnedLimit("new-provider", "new-model");

      // Assert
      expect(learned).toBeDefined();
      expect(learned!.concurrency).toBe(presetLimit);
    });

    it("should_apply_global_multiplier", () => {
      // Arrange
      const presetLimit = 4;
      setGlobalMultiplier(0.5);

      // Act
      const result = getEffectiveLimit("test-provider", "test-model", presetLimit);

      // Assert
      expect(result).toBe(2); // 4 * 0.5
    });
  });

  describe("境界値", () => {
    it("should_clamp_to_minimum_concurrency", () => {
      // Arrange
      const presetLimit = 1;

      // Act
      const result = getEffectiveLimit("provider", "model", presetLimit);

      // Assert
      expect(result).toBeGreaterThanOrEqual(1);
    });

    it("should_clamp_to_maximum_concurrency", () => {
      // Arrange
      const presetLimit = 100;
      setGlobalMultiplier(10);

      // Act
      const result = getEffectiveLimit("provider", "model", presetLimit);

      // Assert
      expect(result).toBeLessThanOrEqual(16);
    });
  });
});

// ============================================================================
// record429 / recordSuccess
// ============================================================================

describe("record429 / recordSuccess", () => {
  beforeEach(() => {
    clearState();
    vi.useFakeTimers();
    initAdaptiveController();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearState();
  });

  describe("正常系", () => {
    it("should_reduce_concurrency_on_429", () => {
      // Arrange
      const provider = "anthropic";
      const model = "claude-sonnet-4";
      const presetLimit = 4;
      getEffectiveLimit(provider, model, presetLimit);

      // Act
      record429(provider, model);
      const learned = getLearnedLimit(provider, model);

      // Assert
      expect(learned!.concurrency).toBeLessThan(presetLimit);
      expect(learned!.last429At).not.toBeNull();
      expect(learned!.total429Count).toBe(1);
    });

    it("should_track_consecutive_429_count", () => {
      // Arrange
      const provider = "anthropic";
      const model = "claude-sonnet-4";
      getEffectiveLimit(provider, model, 4);

      // Act
      record429(provider, model);
      record429(provider, model);
      record429(provider, model);
      const learned = getLearnedLimit(provider, model);

      // Assert
      expect(learned!.consecutive429Count).toBe(3);
    });

    it("should_aggressively_reduce_on_multiple_429s", () => {
      // Arrange
      const provider = "anthropic";
      const model = "claude-sonnet-4";
      getEffectiveLimit(provider, model, 4);

      // Act
      record429(provider, model);
      record429(provider, model);
      record429(provider, model);
      const learned = getLearnedLimit(provider, model);

      // Assert
      // 3回連続429で追加削減
      expect(learned!.concurrency).toBeLessThan(2);
    });

    it("should_record_success", () => {
      // Arrange
      const provider = "anthropic";
      const model = "claude-sonnet-4";
      getEffectiveLimit(provider, model, 4);

      // Act
      recordSuccess(provider, model);
      const learned = getLearnedLimit(provider, model);

      // Assert
      expect(learned!.lastSuccessAt).not.toBeNull();
      expect(learned!.consecutive429Count).toBe(0);
    });

    it("should_schedule_recovery_after_success", () => {
      // Arrange
      const provider = "anthropic";
      const model = "claude-sonnet-4";
      getEffectiveLimit(provider, model, 4);
      record429(provider, model);

      // Act
      recordSuccess(provider, model);
      const learned = getLearnedLimit(provider, model);

      // Assert
      expect(learned!.recoveryScheduled).toBe(true);
    });
  });

  describe("回復プロセス", () => {
    it("should_schedule_recovery_after_429_and_success", () => {
      // Arrange
      const provider = "anthropic";
      const model = "claude-sonnet-4";
      getEffectiveLimit(provider, model, 4);
      record429(provider, model);
      const beforeRecovery = getLearnedLimit(provider, model)!.concurrency;

      // Act
      recordSuccess(provider, model);

      // Assert
      expect(getLearnedLimit(provider, model)!.recoveryScheduled).toBe(true);
    });
  });
});

// ============================================================================
// resetLearnedLimit / resetAllLearnedLimits
// ============================================================================

describe("resetLearnedLimit / resetAllLearnedLimits", () => {
  beforeEach(() => {
    clearState();
    vi.useFakeTimers();
    initAdaptiveController();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearState();
  });

  describe("正常系", () => {
    it("should_reset_specific_limit", () => {
      // Arrange
      const provider = "anthropic";
      const model = "claude-sonnet-4";
      getEffectiveLimit(provider, model, 4);
      record429(provider, model);

      // Act
      resetLearnedLimit(provider, model);
      const learned = getLearnedLimit(provider, model);

      // Assert
      expect(learned!.consecutive429Count).toBe(0);
      expect(learned!.total429Count).toBe(0);
    });

    it("should_reset_all_limits", () => {
      // Arrange
      getEffectiveLimit("provider1", "model1", 4);
      getEffectiveLimit("provider2", "model2", 4);
      record429("provider1", "model1");
      record429("provider2", "model2");

      // Act
      resetAllLearnedLimits();
      const state = getAdaptiveState();

      // Assert
      expect(Object.keys(state.limits)).toHaveLength(0);
    });

    it("should_reset_with_new_limit", () => {
      // Arrange
      const provider = "anthropic";
      const model = "claude-sonnet-4";
      getEffectiveLimit(provider, model, 4);
      record429(provider, model);

      // Act
      resetLearnedLimit(provider, model, 8);
      const learned = getLearnedLimit(provider, model);

      // Assert
      expect(learned!.concurrency).toBe(8);
      expect(learned!.originalConcurrency).toBe(8);
    });
  });
});

// ============================================================================
// setGlobalMultiplier
// ============================================================================

describe("setGlobalMultiplier", () => {
  beforeEach(() => {
    clearState();
    vi.useFakeTimers();
    initAdaptiveController();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearState();
  });

  describe("正常系", () => {
    it("should_set_global_multiplier", () => {
      // Act
      setGlobalMultiplier(0.5);
      const state = getAdaptiveState();

      // Assert
      expect(state.globalMultiplier).toBe(0.5);
    });

    it("should_affect_effective_limit", () => {
      // Arrange
      const presetLimit = 4;
      getEffectiveLimit("provider", "model", presetLimit);
      setGlobalMultiplier(0.5);

      // Act
      const result = getEffectiveLimit("provider", "model", presetLimit);

      // Assert
      expect(result).toBe(2);
    });
  });

  describe("境界値", () => {
    it("should_clamp_to_minimum_multiplier", () => {
      // Act
      setGlobalMultiplier(0.01);
      const state = getAdaptiveState();

      // Assert
      expect(state.globalMultiplier).toBeGreaterThanOrEqual(0.1);
    });

    it("should_clamp_to_maximum_multiplier", () => {
      // Act
      setGlobalMultiplier(10);
      const state = getAdaptiveState();

      // Assert
      expect(state.globalMultiplier).toBeLessThanOrEqual(2.0);
    });
  });
});

// ============================================================================
// isRateLimitError
// ============================================================================

describe("isRateLimitError", () => {
  describe("正常系", () => {
    it("should_detect_429_in_message", () => {
      // Arrange
      const error = new Error("429 Too Many Requests");

      // Act
      const result = isRateLimitError(error);

      // Assert
      expect(result).toBe(true);
    });

    it("should_detect_rate_limit_in_message", () => {
      // Arrange
      const error = new Error("Rate limit exceeded");

      // Act
      const result = isRateLimitError(error);

      // Assert
      expect(result).toBe(true);
    });

    it("should_detect_too_many_requests_in_message", () => {
      // Arrange
      const error = new Error("Too Many Requests");

      // Act
      const result = isRateLimitError(error);

      // Assert
      expect(result).toBe(true);
    });

    it("should_detect_quota_exceeded_in_message", () => {
      // Arrange
      const error = new Error("Quota exceeded");

      // Act
      const result = isRateLimitError(error);

      // Assert
      expect(result).toBe(true);
    });

    it("should_return_false_for_non_rate_limit_error", () => {
      // Arrange
      const error = new Error("Internal Server Error");

      // Act
      const result = isRateLimitError(error);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe("境界値", () => {
    it("should_return_false_for_null", () => {
      // Arrange
      const error = null;

      // Act
      const result = isRateLimitError(error);

      // Assert
      expect(result).toBe(false);
    });

    it("should_return_false_for_undefined", () => {
      // Arrange
      const error = undefined;

      // Act
      const result = isRateLimitError(error);

      // Assert
      expect(result).toBe(false);
    });

    it("should_be_case_insensitive", () => {
      // Arrange
      const error = new Error("RATE LIMIT EXCEEDED");

      // Act
      const result = isRateLimitError(error);

      // Assert
      expect(result).toBe(true);
    });
  });
});

// ============================================================================
// 予測分析
// ============================================================================

describe("予測分析", () => {
  beforeEach(() => {
    clearState();
    vi.useFakeTimers();
    initAdaptiveController();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearState();
  });

  describe("analyze429Probability", () => {
    it("should_return_zero_for_new_provider", () => {
      // Act
      const probability = analyze429Probability("new-provider", "new-model");

      // Assert
      expect(probability).toBe(0);
    });

    it("should_increase_probability_after_429s", () => {
      // Arrange
      const provider = "anthropic";
      const model = "claude-sonnet-4";
      getEffectiveLimit(provider, model, 4);
      record429(provider, model);
      record429(provider, model);

      // Act
      const probability = analyze429Probability(provider, model);

      // Assert
      expect(probability).toBeGreaterThan(0);
    });
  });

  describe("getPredictiveAnalysis", () => {
    it("should_return_analysis_result", () => {
      // Arrange
      const provider = "anthropic";
      const model = "claude-sonnet-4";

      // Act
      const analysis = getPredictiveAnalysis(provider, model);

      // Assert
      expect(analysis).toHaveProperty("predicted429Probability");
      expect(analysis).toHaveProperty("shouldProactivelyThrottle");
      expect(analysis).toHaveProperty("recommendedConcurrency");
      expect(analysis).toHaveProperty("confidence");
    });

    it("should_recommend_throttling_when_probability_high", () => {
      // Arrange
      const provider = "anthropic";
      const model = "claude-sonnet-4";
      getEffectiveLimit(provider, model, 4);

      // 複数の429を記録
      for (let i = 0; i < 5; i++) {
        record429(provider, model);
      }

      // Act
      const analysis = getPredictiveAnalysis(provider, model);

      // Assert
      expect(analysis.predicted429Probability).toBeGreaterThan(0);
    });
  });

  describe("shouldProactivelyThrottle", () => {
    it("should_return_false_for_new_provider", () => {
      // Act
      const result = shouldProactivelyThrottle("new-provider", "new-model");

      // Assert
      expect(result).toBe(false);
    });
  });

  describe("getPredictiveConcurrency", () => {
    it("should_return_current_concurrency_when_no_throttle_needed", () => {
      // Arrange
      const currentConcurrency = 4;

      // Act
      const result = getPredictiveConcurrency("new-provider", "new-model", currentConcurrency);

      // Assert
      expect(result).toBe(currentConcurrency);
    });

    it("should_reduce_concurrency_when_throttling_needed", () => {
      // Arrange
      const provider = "anthropic";
      const model = "claude-sonnet-4";
      const currentConcurrency = 4;
      getEffectiveLimit(provider, model, 4);

      // 高確率の429を作成
      for (let i = 0; i < 10; i++) {
        record429(provider, model);
      }

      // Act
      const result = getPredictiveConcurrency(provider, model, currentConcurrency);

      // Assert
      expect(result).toBeLessThanOrEqual(currentConcurrency);
    });
  });
});

// ============================================================================
// 統合テスト
// ============================================================================

describe("統合テスト", () => {
  beforeEach(() => {
    clearState();
    vi.useFakeTimers();
    initAdaptiveController();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearState();
  });

  it("should_handle_complete_rate_control_cycle", () => {
    // Arrange
    const provider = "anthropic";
    const model = "claude-sonnet-4";
    const presetLimit = 4;

    // Phase 1: 初期状態
    const initialLimit = getEffectiveLimit(provider, model, presetLimit);
    expect(initialLimit).toBe(presetLimit);

    // Phase 2: 429発生
    record429(provider, model);
    const after429 = getLearnedLimit(provider, model);
    expect(after429!.concurrency).toBeLessThan(presetLimit);

    // Phase 3: 成功記録
    recordSuccess(provider, model);
    const afterSuccess = getLearnedLimit(provider, model);
    expect(afterSuccess!.recoveryScheduled).toBe(true);

    // Phase 4: リセット
    resetLearnedLimit(provider, model);
    const afterReset = getLearnedLimit(provider, model);
    expect(afterReset!.concurrency).toBe(presetLimit);
  });

  it("should_track_multiple_providers_independently", () => {
    // Arrange
    const providers = [
      { provider: "anthropic", model: "claude-sonnet-4" },
      { provider: "openai", model: "gpt-4o" },
      { provider: "google", model: "gemini-pro" },
    ];

    // Act
    for (const { provider, model } of providers) {
      getEffectiveLimit(provider, model, 4);
    }
    record429("anthropic", "claude-sonnet-4");

    // Assert
    const anthropicLimit = getLearnedLimit("anthropic", "claude-sonnet-4");
    const openaiLimit = getLearnedLimit("openai", "gpt-4o");

    expect(anthropicLimit!.concurrency).toBeLessThan(4);
    expect(openaiLimit!.concurrency).toBe(4);
  });
});

// ============================================================================
// プロパティベーステスト (Property-Based Tester追加)
// ============================================================================

describe("プロパティベーステスト", () => {
  beforeEach(() => {
    clearState();
    vi.useFakeTimers();
    initAdaptiveController();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearState();
  });

  it("isRateLimitError_任意の入力_常にbooleanを返す", () => {
    fc.assert(
      fc.property(fc.anything(), (error) => {
        const result = isRateLimitError(error);
        return typeof result === "boolean";
      })
    );
  });

  it("isRateLimitError_特定パターンを含む場合_trueを返す", () => {
    const rateLimitPatterns = [
      "429",
      "rate limit exceeded",
      "too many requests",
      "quota exceeded",
      "throttled",
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...rateLimitPatterns),
        fc.string({ minLength: 0, maxLength: 20 }),
        (pattern, suffix) => {
          const errorMessage = pattern + suffix;
          const result = isRateLimitError(new Error(errorMessage));
          return result === true;
        }
      )
    );
  });

  it("getEffectiveLimit_常に範囲内の値を返す", () => {
    // 不変条件: concurrencyは常に[1, 16]の範囲内
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.integer({ min: 1, max: 100 }),
        (provider, model, presetLimit) => {
          const result = getEffectiveLimit(provider, model, presetLimit);
          expect(result).toBeGreaterThanOrEqual(1);
          expect(result).toBeLessThanOrEqual(16);
          return true;
        }
      )
    );
  });

  it("record429_複数回呼び出し後も制限値は有効範囲内", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.integer({ min: 1, max: 20 }),
        (provider, model, repeatCount) => {
          // 初期化
          clearState();
          initAdaptiveController();
          getEffectiveLimit(provider, model, 4);

          // 複数回429を記録
          for (let i = 0; i < repeatCount; i++) {
            record429(provider, model);
          }

          // 制限値を取得
          const learned = getLearnedLimit(provider, model);
          if (learned) {
            expect(learned.concurrency).toBeGreaterThanOrEqual(1);
            expect(learned.concurrency).toBeLessThanOrEqual(16);
            expect(learned.total429Count).toBe(repeatCount);
          }

          return true;
        }
      )
    );
  });

  it("analyze429Probability_常に0から1の範囲内", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.integer({ min: 0, max: 20 }),
        (provider, model, four29Count) => {
          // 初期化
          clearState();
          initAdaptiveController();
          getEffectiveLimit(provider, model, 4);

          // 429を記録
          for (let i = 0; i < four29Count; i++) {
            record429(provider, model);
          }

          // 確率を分析
          const probability = analyze429Probability(provider, model);
          expect(probability).toBeGreaterThanOrEqual(0);
          expect(probability).toBeLessThanOrEqual(1);

          return true;
        }
      )
    );
  });

  it("getPredictiveAnalysis_推奨並列数は常に有効範囲内", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        (provider, model) => {
          // 初期化
          clearState();
          initAdaptiveController();
          getEffectiveLimit(provider, model, 4);

          const analysis = getPredictiveAnalysis(provider, model);

          expect(analysis.recommendedConcurrency).toBeGreaterThanOrEqual(1);
          expect(analysis.recommendedConcurrency).toBeLessThanOrEqual(16);
          expect(analysis.predicted429Probability).toBeGreaterThanOrEqual(0);
          expect(analysis.predicted429Probability).toBeLessThanOrEqual(1);
          expect(analysis.confidence).toBeGreaterThanOrEqual(0);
          expect(analysis.confidence).toBeLessThanOrEqual(1);

          return true;
        }
      )
    );
  });

  it("setGlobalMultiplier_極端な値でも有効範囲にクランプされる", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000 }),
        (multiplier) => {
          // 初期化
          clearState();
          initAdaptiveController();

          setGlobalMultiplier(multiplier);
          const state = getAdaptiveState();

          // 有効範囲にクランプされることを確認
          expect(state.globalMultiplier).toBeGreaterThanOrEqual(0.1);
          expect(state.globalMultiplier).toBeLessThanOrEqual(2.0);

          return true;
        }
      )
    );
  });

  it("状態遷移の一貫性_429後に成功すると回復がスケジュールされる", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.integer({ min: 1, max: 10 }),
        (provider, model, presetLimit) => {
          // 初期化
          clearState();
          initAdaptiveController();

          // 初期制限を取得
          const initial = getEffectiveLimit(provider, model, presetLimit);

          // 429を記録
          record429(provider, model);
          const after429 = getLearnedLimit(provider, model);

          // 429後は制限が減少または維持される
          if (after429) {
            expect(after429.concurrency).toBeLessThanOrEqual(initial);

            // 成功を記録
            recordSuccess(provider, model);
            const afterSuccess = getLearnedLimit(provider, model);

            // 成功後は回復がスケジュールされる
            if (afterSuccess && afterSuccess.concurrency < afterSuccess.originalConcurrency) {
              expect(afterSuccess.recoveryScheduled).toBe(true);
            }
          }

          return true;
        }
      )
    );
  });
});
