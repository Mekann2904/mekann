/**
 * @file .pi/lib/token-bucket.ts の単体テスト
 * @description LLM API呼び出しのためのトークンバケット方式レート制限器のテスト
 * @testFramework vitest
 */

import { describe, it, expect } from "vitest";
import {
	type RateLimitConfig,
	type RateLimiterStats,
	createTokenBucketRateLimiter,
} from "../../lib/token-bucket.js";

describe("RateLimitConfig", () => {
	describe("正常系", () => {
		it("should accept valid config", () => {
			const config: RateLimitConfig = {
				rpm: 60,
				burstMultiplier: 2.0,
				minIntervalMs: 1000,
			};

			expect(config.rpm).toBe(60);
			expect(config.burstMultiplier).toBe(2.0);
			expect(config.minIntervalMs).toBe(1000);
		});
	});

	describe("境界条件", () => {
		it("should accept zero values", () => {
			const config: RateLimitConfig = {
				rpm: 0,
				burstMultiplier: 0,
				minIntervalMs: 0,
			};

			expect(config.rpm).toBe(0);
		});

		it("should accept high values", () => {
			const config: RateLimitConfig = {
				rpm: 10000,
				burstMultiplier: 100,
				minIntervalMs: 60000,
			};

			expect(config.rpm).toBe(10000);
		});
	});
});

describe("RateLimiterStats", () => {
	describe("正常系", () => {
		it("should accept valid stats", () => {
			const stats: RateLimiterStats = {
				trackedModels: 5,
				blockedModels: ["model-1", "model-2"],
				avgAvailableTokens: 45.5,
				lowCapacityModels: ["model-3"],
			};

			expect(stats.trackedModels).toBe(5);
			expect(stats.blockedModels).toHaveLength(2);
			expect(stats.avgAvailableTokens).toBe(45.5);
		});
	});

	describe("境界条件", () => {
		it("should accept empty arrays", () => {
			const stats: RateLimiterStats = {
				trackedModels: 0,
				blockedModels: [],
				avgAvailableTokens: 0,
				lowCapacityModels: [],
			};

			expect(stats.trackedModels).toBe(0);
			expect(stats.blockedModels).toEqual([]);
		});
	});
});

describe("TokenBucketRateLimiter", () => {
	describe("正常系", () => {
		it("should create instance", () => {
			const limiter = createTokenBucketRateLimiter();
			expect(limiter).toBeDefined();
		});

		it("should get stats", () => {
			const limiter = createTokenBucketRateLimiter();
			const stats = limiter.getStats();

			expect(typeof stats.trackedModels).toBe("number");
			expect(Array.isArray(stats.blockedModels)).toBe(true);
		});
	});
});
