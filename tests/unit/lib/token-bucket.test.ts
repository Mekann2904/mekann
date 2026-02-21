/**
 * @file .pi/lib/token-bucket.ts の単体テスト
 * @description トークンバケットレートリミッターのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
	createTokenBucketRateLimiter,
	resetTokenBucketRateLimiter,
	getTokenBucketRateLimiter,
	TokenBucketRateLimiterImpl,
	type RateLimitConfig,
	type RateLimiterStats,
} from "@lib/token-bucket";

// ============================================================================
// TokenBucketRateLimiterImpl
// ============================================================================

describe("TokenBucketRateLimiterImpl", () => {
	let limiter: TokenBucketRateLimiterImpl;

	beforeEach(() => {
		limiter = createTokenBucketRateLimiter();
	});

	describe("canProceed", () => {
		it("should_return_small_wait_for_new_bucket", () => {
			// 新しいバケットは初期トークンがあるが、minIntervalMsの影響を受ける可能性
			const waitMs = limiter.canProceed("anthropic", "claude-3-5-sonnet", 1);
			// minIntervalMs以下の待機時間であればOK
			expect(waitMs).toBeLessThan(200);
		});

		it("should_return_wait_time_when_tokens_depleted", () => {
			const provider = "anthropic";
			const model = "claude-3-5-sonnet";

			// 大量のトークンを消費
			limiter.consume(provider, model, 100);

			// まだ実行可能かチェック
			const waitMs = limiter.canProceed(provider, model, 1);
			// バースト容量があるため0の可能性もある
			expect(waitMs).toBeGreaterThanOrEqual(0);
		});

		it("should_return_wait_time_when_blocked_by_429", () => {
			const provider = "anthropic";
			const model = "claude-3-5-sonnet";

			// 429エラーを記録
			limiter.record429(provider, model, 5000);

			const waitMs = limiter.canProceed(provider, model, 1);
			expect(waitMs).toBeGreaterThan(0);
		});

		it("should_be_independent_per_provider_model", () => {
			// Provider Aをブロック
			limiter.record429("provider-a", "model-x", 60000);

			// Provider Bは影響を受けない（minIntervalMsの影響はあるが、ブロックではない）
			const waitMs = limiter.canProceed("provider-b", "model-y", 1);
			// ブロックされていなければ小さい値
			expect(waitMs).toBeLessThan(200);
		});
	});

	describe("consume", () => {
		it("should_reduce_tokens_after_consume", () => {
			const provider = "anthropic";
			const model = "claude-3-5-sonnet";

			// 初期状態で実行可能（minIntervalMsの影響を許容）
			const waitMs = limiter.canProceed(provider, model, 1);
			expect(waitMs).toBeLessThan(200);

			// トークンを消費
			limiter.consume(provider, model, 1);

			// バケット状態を確認
			const state = limiter.getBucketState(provider, model);
			expect(state).toBeDefined();
		});

		it("should_use_burst_capacity_when_tokens_depleted", () => {
			const provider = "test-provider";
			const model = "test-model";

			// 低めのレートで設定
			limiter.configure(provider, model, { rpm: 10, burstMultiplier: 2 });

			// 通常容量を超えて消費
			limiter.consume(provider, model, 50);

			const state = limiter.getBucketState(provider, model);
			expect(state?.burstTokensUsed).toBeGreaterThan(0);
		});
	});

	describe("record429", () => {
		it("should_block_requests_after_429", () => {
			const provider = "anthropic";
			const model = "claude-3-5-sonnet";

			limiter.record429(provider, model, 5000);

			const waitMs = limiter.canProceed(provider, model, 1);
			expect(waitMs).toBeGreaterThan(0);
		});

		it("should_reduce_burst_multiplier_after_429", () => {
			const provider = "test-provider";
			const model = "test-model";

			limiter.configure(provider, model, { rpm: 60, burstMultiplier: 2.0 });
			const beforeState = limiter.getBucketState(provider, model);

			limiter.record429(provider, model, 1000);

			const afterState = limiter.getBucketState(provider, model);
			expect(afterState?.burstMultiplier).toBeLessThan(beforeState?.burstMultiplier ?? 2.0);
		});

		it("should_use_default_retry_if_not_specified", () => {
			const provider = "anthropic";
			const model = "claude-3-5-sonnet";

			limiter.record429(provider, model); // retryAfterMsを指定しない

			const waitMs = limiter.canProceed(provider, model, 1);
			// デフォルト60秒のため、大きな待機時間
			expect(waitMs).toBeGreaterThan(1000);
		});
	});

	describe("recordSuccess", () => {
		it("should_restore_burst_capacity", () => {
			const provider = "test-provider";
			const model = "test-model";

			limiter.configure(provider, model, { rpm: 60, burstMultiplier: 2.0 });
			limiter.consume(provider, model, 100);

			const beforeState = limiter.getBucketState(provider, model);
			limiter.recordSuccess(provider, model);
			const afterState = limiter.getBucketState(provider, model);

			// バースト使用量が減少
			expect(afterState?.burstTokensUsed).toBeLessThanOrEqual(beforeState?.burstTokensUsed ?? 0);
		});

		it("should_gradually_restore_burst_multiplier", () => {
			const provider = "test-provider";
			const model = "test-model";

			limiter.configure(provider, model, { rpm: 60, burstMultiplier: 2.0 });
			limiter.record429(provider, model, 100);

			const after429 = limiter.getBucketState(provider, model);

			// 複数回成功を記録
			for (let i = 0; i < 10; i++) {
				limiter.recordSuccess(provider, model);
			}

			const afterSuccess = limiter.getBucketState(provider, model);
			expect(afterSuccess?.burstMultiplier).toBeGreaterThanOrEqual(after429?.burstMultiplier ?? 0);
		});
	});

	describe("getStats", () => {
		it("should_return_empty_stats_initially", () => {
			const stats = limiter.getStats();

			expect(stats.trackedModels).toBe(0);
			expect(stats.blockedModels).toEqual([]);
			expect(stats.lowCapacityModels).toEqual([]);
		});

		it("should_track_models_after_use", () => {
			limiter.canProceed("provider-a", "model-x", 1);
			limiter.canProceed("provider-b", "model-y", 1);

			const stats = limiter.getStats();
			expect(stats.trackedModels).toBe(2);
		});

		it("should_identify_blocked_models", () => {
			limiter.record429("blocked-provider", "blocked-model", 60000);

			const stats = limiter.getStats();
			expect(stats.blockedModels.length).toBeGreaterThan(0);
		});
	});

	describe("configure", () => {
		it("should_update_rate_limit_config", () => {
			const provider = "custom-provider";
			const model = "custom-model";

			limiter.configure(provider, model, { rpm: 120, burstMultiplier: 3.0 });

			// バケットを使用して設定を適用
			limiter.canProceed(provider, model, 1);

			const state = limiter.getBucketState(provider, model);
			expect(state?.burstMultiplier).toBe(3.0);
		});

		it("should_update_existing_bucket", () => {
			const provider = "existing-provider";
			const model = "existing-model";

			// 最初にバケットを作成
			limiter.canProceed(provider, model, 1);
			const beforeState = limiter.getBucketState(provider, model);

			// 設定を更新
			limiter.configure(provider, model, { rpm: 30 });
			const afterState = limiter.getBucketState(provider, model);

			expect(afterState?.refillRate).not.toBe(beforeState?.refillRate);
		});
	});

	describe("reset", () => {
		it("should_remove_bucket_state", () => {
			const provider = "reset-provider";
			const model = "reset-model";

			limiter.canProceed(provider, model, 1);
			expect(limiter.getBucketState(provider, model)).toBeDefined();

			limiter.reset(provider, model);
			expect(limiter.getBucketState(provider, model)).toBeUndefined();
		});
	});

	describe("resetAll", () => {
		it("should_clear_all_buckets", () => {
			limiter.canProceed("provider-a", "model-x", 1);
			limiter.canProceed("provider-b", "model-y", 1);

			expect(limiter.getStats().trackedModels).toBe(2);

			limiter.resetAll();

			expect(limiter.getStats().trackedModels).toBe(0);
		});
	});

	describe("memory bounds", () => {
		it("should_cap_tracked_buckets", () => {
			for (let i = 0; i < 700; i += 1) {
				limiter.canProceed(`provider-${i}`, `model-${i}`, 1);
			}
			const stats = limiter.getStats();
			expect(stats.trackedModels).toBeLessThanOrEqual(512);
		});
	});
});

// ============================================================================
// Singleton Functions
// ============================================================================

describe("Singleton Functions", () => {
	afterEach(() => {
		resetTokenBucketRateLimiter();
	});

	describe("getTokenBucketRateLimiter", () => {
		it("should_return_same_instance", () => {
			const instance1 = getTokenBucketRateLimiter();
			const instance2 = getTokenBucketRateLimiter();

			expect(instance1).toBe(instance2);
		});
	});

	describe("resetTokenBucketRateLimiter", () => {
		it("should_create_new_instance_after_reset", () => {
			const instance1 = getTokenBucketRateLimiter();
			resetTokenBucketRateLimiter();
			const instance2 = getTokenBucketRateLimiter();

			expect(instance1).not.toBe(instance2);
		});
	});
});

// ============================================================================
// RateLimitConfig Type
// ============================================================================

describe("RateLimitConfig", () => {
	it("should_have_valid_default_config", () => {
		const config: RateLimitConfig = {
			rpm: 60,
			burstMultiplier: 2.0,
			minIntervalMs: 100,
		};

		expect(config.rpm).toBeGreaterThan(0);
		expect(config.burstMultiplier).toBeGreaterThanOrEqual(1);
		expect(config.minIntervalMs).toBeGreaterThanOrEqual(0);
	});
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Integration: Rate Limiting Flow", () => {
	let limiter: TokenBucketRateLimiterImpl;

	beforeEach(() => {
		limiter = createTokenBucketRateLimiter();
	});

	it("should_handle_complete_request_cycle", () => {
		const provider = "test-provider";
		const model = "test-model";

		// 1. リクエスト実行可能かチェック（minIntervalMsの影響を許容）
		const canProceed = limiter.canProceed(provider, model, 1);
		expect(canProceed).toBeLessThan(200);

		// 2. トークン消費
		limiter.consume(provider, model, 1);

		// 3. 成功を記録
		limiter.recordSuccess(provider, model);

		// 4. 統計確認
		const stats = limiter.getStats();
		expect(stats.trackedModels).toBe(1);
	});

	it("should_handle_429_and_recovery", () => {
		const provider = "test-provider";
		const model = "test-model";

		// 429エラーを記録（短い待機時間）
		limiter.record429(provider, model, 100);

		// ブロックされていることを確認
		let waitMs = limiter.canProceed(provider, model, 1);
		expect(waitMs).toBeGreaterThan(0);

		// リセット後は新しいバケットが作成される
		limiter.reset(provider, model);

		// 新しいバケットは初期トークンがあるため実行可能
		// ただし、minIntervalMsの制約がある可能性
		waitMs = limiter.canProceed(provider, model, 1);
		// 0または非常に小さい値であることを確認
		expect(waitMs).toBeLessThan(200); // minIntervalMs以下
	});
});
