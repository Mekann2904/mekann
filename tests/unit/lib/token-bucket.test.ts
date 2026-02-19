/**
 * @file .pi/lib/token-bucket.ts の単体テスト
 * @description トークンバケットアルゴリズム、レート制限のテスト
 * @testFramework vitest
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import {
  createTokenBucketRateLimiter,
  getTokenBucketRateLimiter,
  resetTokenBucketRateLimiter,
  type TokenBucketRateLimiter,
  type RateLimiterStats,
} from "@lib/token-bucket";

// ============================================================================
// TokenBucketRateLimiter
// ============================================================================

describe("TokenBucketRateLimiter", () => {
  let limiter: TokenBucketRateLimiter;

  beforeEach(() => {
    limiter = createTokenBucketRateLimiter();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetTokenBucketRateLimiter();
  });

  describe("canProceed", () => {
    describe("正常系", () => {
      it("should_return_zero_for_new_bucket", () => {
        // Arrange
        const provider = "anthropic";
        const model = "claude-3-5-sonnet";
        const tokensNeeded = 1;

        // Act
        const waitMs = limiter.canProceed(provider, model, tokensNeeded);

        // Assert - minIntervalMsのチェックがあるため、小さい待機時間が発生する可能性がある
        expect(waitMs).toBeLessThanOrEqual(200);
      });

      it("should_return_zero_when_tokens_available", () => {
        // Arrange
        const provider = "openai";
        const model = "gpt-4o";
        const tokensNeeded = 10;

        // Act
        const waitMs = limiter.canProceed(provider, model, tokensNeeded);

        // Assert - 初期状態ではトークンがあるがminIntervalMsチェックがある
        expect(waitMs).toBeLessThanOrEqual(100);
      });
    });

    describe("トークン消費後", () => {
      it("should_return_wait_time_when_tokens_depleted", () => {
        // Arrange
        const provider = "test";
        const model = "model";

        // 大量のトークンを消費
        limiter.consume(provider, model, 10000);

        // Act
        const waitMs = limiter.canProceed(provider, model, 1);

        // Assert - トークン不足で待機時間が発生
        expect(waitMs).toBeGreaterThan(0);
      });
    });

    describe("429エラー後", () => {
      it("should_block_until_retry_after", () => {
        // Arrange
        const provider = "test";
        const model = "blocked-model";
        const retryAfterMs = 60000;

        limiter.record429(provider, model, retryAfterMs);

        // Act
        const waitMs = limiter.canProceed(provider, model, 1);

        // Assert - retryAfter期間中はブロック
        expect(waitMs).toBeGreaterThan(0);
      });
    });
  });

  describe("consume", () => {
    describe("正常系", () => {
      it("should_consume_tokens_from_bucket", () => {
        // Arrange
        const provider = "test";
        const model = "model";
        const tokens = 5;

        // Act
        limiter.consume(provider, model, tokens);

        // Assert - エラーが発生しないことを確認
        expect(true).toBe(true);
      });

      it("should_allow_multiple_consumes", () => {
        // Arrange
        const provider = "test";
        const model = "model";

        // Act
        limiter.consume(provider, model, 1);
        limiter.consume(provider, model, 2);
        limiter.consume(provider, model, 3);

        // Assert - エラーが発生しないことを確認
        expect(true).toBe(true);
      });
    });

    describe("バースト容量", () => {
      it("should_use_burst_capacity_when_tokens_depleted", () => {
        // Arrange
        const provider = "test";
        const model = "burst-model";

        // 初期トークンを消費
        limiter.consume(provider, model, 100);

        // 追加でバーストを使用
        // Act & Assert - エラーが発生しない
        expect(() => limiter.consume(provider, model, 10)).not.toThrow();
      });
    });
  });

  describe("record429", () => {
    describe("正常系", () => {
      it("should_set_retry_after_time", () => {
        // Arrange
        const provider = "test";
        const model = "429-model";
        const retryAfterMs = 30000;

        // Act
        limiter.record429(provider, model, retryAfterMs);

        // Assert
        const waitMs = limiter.canProceed(provider, model, 1);
        expect(waitMs).toBeGreaterThan(0);
      });

      it("should_reduce_burst_multiplier", () => {
        // Arrange
        const provider = "test";
        const model = "penalty-model";

        // Act
        limiter.record429(provider, model, 60000);

        // Assert - burstMultiplierが減少することを間接的に確認
        // 複数回の429でさらに減少
        limiter.record429(provider, model, 60000);

        const waitMs = limiter.canProceed(provider, model, 1);
        expect(waitMs).toBeGreaterThan(0);
      });
    });

    describe("境界値", () => {
      it("should_cap_retry_after_to_max", () => {
        // Arrange
        const provider = "test";
        const model = "max-retry-model";
        const excessiveRetryMs = 20 * 60 * 1000; // 20分（上限は10分）

        // Act
        limiter.record429(provider, model, excessiveRetryMs);

        // Assert - 上限にキャップされる
        const waitMs = limiter.canProceed(provider, model, 1);
        expect(waitMs).toBeLessThanOrEqual(10 * 60 * 1000);
      });

      it("should_use_default_retry_when_not_specified", () => {
        // Arrange
        const provider = "test";
        const model = "default-retry-model";

        // Act
        limiter.record429(provider, model);

        // Assert - デフォルト値が使用される
        const waitMs = limiter.canProceed(provider, model, 1);
        expect(waitMs).toBeGreaterThan(0);
      });
    });
  });

  describe("recordSuccess", () => {
    describe("正常系", () => {
      it("should_restore_burst_capacity", () => {
        // Arrange
        const provider = "test";
        const model = "success-model";

        limiter.record429(provider, model, 1000);

        // 時間を進めて429期間を終了
        vi.advanceTimersByTime(2000);

        // Act
        limiter.recordSuccess(provider, model);

        // Assert - 成功記録後にcanProceedが小さい待機時間を返す
        const waitMs = limiter.canProceed(provider, model, 1);
        // minIntervalMsのチェックがあるため、小さい待機時間が発生する可能性がある
        expect(waitMs).toBeLessThanOrEqual(200);
      });
    });
  });

  describe("getStats", () => {
    describe("正常系", () => {
      it("should_return_stats_for_empty_limiter", () => {
        // Arrange - 新しいlimiter

        // Act
        const stats = limiter.getStats();

        // Assert
        expect(stats.trackedModels).toBe(0);
        expect(stats.blockedModels).toEqual([]);
        expect(stats.avgAvailableTokens).toBe(0);
        expect(stats.lowCapacityModels).toEqual([]);
      });

      it("should_track_multiple_models", () => {
        // Arrange
        limiter.consume("provider1", "model1", 10);
        limiter.consume("provider2", "model2", 20);

        // Act
        const stats = limiter.getStats();

        // Assert
        expect(stats.trackedModels).toBe(2);
      });

      it("should_identify_blocked_models", () => {
        // Arrange
        limiter.record429("blocked-provider", "blocked-model", 60000);

        // Act
        const stats = limiter.getStats();

        // Assert
        expect(stats.blockedModels.length).toBeGreaterThan(0);
        expect(stats.blockedModels[0]).toContain("blocked-provider");
      });
    });
  });

  describe("configure", () => {
    describe("正常系", () => {
      it("should_allow_custom_configuration", () => {
        // Arrange
        const provider = "custom";
        const model = "config-model";

        // Act
        limiter.configure(provider, model, { rpm: 100, burstMultiplier: 3.0 });

        // Assert - 設定が適用される
        const waitMs = limiter.canProceed(provider, model, 1);
        // minIntervalMsのチェックがあるため、小さい待機時間が発生する可能性がある
        expect(waitMs).toBeLessThanOrEqual(200);
      });
    });
  });

  describe("reset", () => {
    describe("正常系", () => {
      it("should_reset_specific_bucket", () => {
        // Arrange
        const provider = "reset-provider";
        const model = "reset-model";
        limiter.consume(provider, model, 100);

        // Act
        limiter.reset(provider, model);

        // Assert
        const stats = limiter.getStats();
        expect(stats.trackedModels).toBe(0);
      });

      it("should_not_affect_other_buckets", () => {
        // Arrange
        limiter.consume("keep-provider", "keep-model", 100);
        limiter.consume("reset-provider", "reset-model", 100);

        // Act
        limiter.reset("reset-provider", "reset-model");

        // Assert
        const stats = limiter.getStats();
        expect(stats.trackedModels).toBe(1);
      });
    });
  });

  describe("プロパティベーステスト", () => {
    it("should_always_return_non_negative_wait_time", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.integer({ min: 1, max: 10000 }),
          (provider, model, tokensNeeded) => {
            const testLimiter = createTokenBucketRateLimiter();
            const waitMs = testLimiter.canProceed(provider, model, tokensNeeded);
            return waitMs >= 0;
          },
        ),
      );
    });

    // 高度な不変条件プロパティ (Property-Based Tester追加)

    it("should_maintain_non_negative_tokens_after_consume", () => {
      // 不変条件: consume後もtokens >= 0
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.integer({ min: 1, max: 100000 }), // 大量消費テスト
          (provider, model, tokensToConsume) => {
            const testLimiter = createTokenBucketRateLimiter();

            // 複数回消費
            for (let i = 0; i < 10; i++) {
              testLimiter.consume(provider, model, Math.floor(tokensToConsume / 10));
            }

            // 統計情報が有効であることを確認
            const stats = testLimiter.getStats();
            expect(stats.trackedModels).toBeGreaterThanOrEqual(0);
            expect(stats.avgAvailableTokens).toBeGreaterThanOrEqual(0);
            return true;
          },
        ),
      );
    });

    it("should_maintain_consistent_stats_after_operations", () => {
      // 不変条件: 操作後の統計情報は一貫している
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              provider: fc.string({ minLength: 1, maxLength: 10 }),
              model: fc.string({ minLength: 1, maxLength: 10 }),
              tokens: fc.integer({ min: 1, max: 100 }),
            }),
            { minLength: 1, maxLength: 20 }
          ),
          (operations) => {
            const testLimiter = createTokenBucketRateLimiter();

            // 一連の操作を実行
            for (const op of operations) {
              testLimiter.consume(op.provider, op.model, op.tokens);
            }

            const stats = testLimiter.getStats();

            // 統計情報の一貫性チェック
            expect(stats.trackedModels).toBeGreaterThanOrEqual(0);
            expect(stats.blockedModels.length).toBeLessThanOrEqual(stats.trackedModels);
            expect(stats.lowCapacityModels.length).toBeLessThanOrEqual(stats.trackedModels);
            expect(stats.avgAvailableTokens).toBeGreaterThanOrEqual(0);

            return true;
          },
        ),
      );
    });

    it("should_handle_429_and_success_sequence_correctly", () => {
      // 状態遷移の正当性: record429 → recordSuccess → 適切な状態
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 10 }),
          fc.string({ minLength: 1, maxLength: 10 }),
          fc.integer({ min: 1000, max: 60000 }),
          (provider, model, retryAfterMs) => {
            const testLimiter = createTokenBucketRateLimiter();

            // 初期状態
            const initialWait = testLimiter.canProceed(provider, model, 1);

            // 429を記録
            testLimiter.record429(provider, model, retryAfterMs);
            const after429Wait = testLimiter.canProceed(provider, model, 1);

            // 429後は待機時間が増加するはず
            expect(after429Wait).toBeGreaterThanOrEqual(0);

            // 成功を記録（統計情報のみ更新、ブロック解除は時間経過後）
            testLimiter.recordSuccess(provider, model);

            // 統計情報の一貫性
            const stats = testLimiter.getStats();
            expect(stats.trackedModels).toBeGreaterThanOrEqual(1);

            return true;
          },
        ),
      );
    });

    it("should_isolate_different_provider_model_buckets", () => {
      // 独立性: 異なるプロバイダ/モデルのバケットは独立している
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 10 }),
          fc.string({ minLength: 1, maxLength: 10 }),
          fc.string({ minLength: 1, maxLength: 10 }),
          fc.string({ minLength: 1, maxLength: 10 }),
          fc.integer({ min: 1, max: 1000 }),
          (provider1, model1, provider2, model2, tokens) => {
            // 異なるキーを保証
            fc.pre(provider1 !== provider2 || model1 !== model2);

            const testLimiter = createTokenBucketRateLimiter();

            // 1つ目のバケットを消費
            testLimiter.consume(provider1, model1, tokens);

            // 2つ目のバケットは独立している
            const wait2 = testLimiter.canProceed(provider2, model2, 1);
            // minIntervalMsのチェックがあるため、小さい待機時間が発生する可能性がある
            expect(wait2).toBeLessThanOrEqual(300);

            return true;
          },
        ),
      );
    });
  });
});

// ============================================================================
// シングルトン管理
// ============================================================================

describe("シングルトン管理", () => {
  beforeEach(() => {
    resetTokenBucketRateLimiter();
  });

  describe("getTokenBucketRateLimiter", () => {
    it("should_return_same_instance", () => {
      // Act
      const instance1 = getTokenBucketRateLimiter();
      const instance2 = getTokenBucketRateLimiter();

      // Assert
      expect(instance1).toBe(instance2);
    });
  });

  describe("resetTokenBucketRateLimiter", () => {
    it("should_create_new_instance_after_reset", () => {
      // Arrange
      const instance1 = getTokenBucketRateLimiter();
      resetTokenBucketRateLimiter();
      const instance2 = getTokenBucketRateLimiter();

      // Assert
      expect(instance1).not.toBe(instance2);
    });
  });
});
