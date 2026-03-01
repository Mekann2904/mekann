/**
 * @file .pi/lib/circuit-breaker.ts の単体テスト
 * @description サーキットブレーカーパターンによる障害許容性のテスト
 * @testFramework vitest + fast-check
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fc from "fast-check";

// モジュールをインポート
import {
	checkCircuitBreaker,
	recordCircuitBreakerSuccess,
	recordCircuitBreakerFailure,
	getCircuitBreakerState,
	resetCircuitBreaker,
	resetAllCircuitBreakers,
	getCircuitBreakerStats,
	type CircuitState,
	type CircuitBreakerConfig,
	_internalBreakers,
} from "../../lib/circuit-breaker.js";

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 時間を進めるヘルパー
 */
function advanceTime(ms: number): void {
	const now = Date.now();
	vi.setSystemTime(new Date(now + ms));
}

// ============================================================================
// checkCircuitBreaker
// ============================================================================

describe("checkCircuitBreaker", () => {
	beforeEach(() => {
		resetAllCircuitBreakers();
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("正常系", () => {
		it("should_create_new_breaker_with_closed_state", () => {
			// Arrange: 新しいキー
			const key = "test-provider";

			// Act: 初回チェック
			const result = checkCircuitBreaker(key);

			// Assert: 許可され、closed状態
			expect(result.allowed).toBe(true);
			expect(result.state).toBe("closed");
			expect(result.retryAfterMs).toBe(0);
		});

		it("should_return_same_instance_for_same_key", () => {
			// Arrange
			const key = "test-provider";

			// Act: 同じキーで2回チェック
			const result1 = checkCircuitBreaker(key);
			const result2 = checkCircuitBreaker(key);

			// Assert: 同じ状態
			expect(result1.state).toBe(result2.state);
		});

		it("should_use_custom_config_on_creation", () => {
			// Arrange
			const key = "custom-config";
			const config: CircuitBreakerConfig = {
				failureThreshold: 3,
				cooldownMs: 10_000,
				successThreshold: 1,
			};

			// Act
			const result = checkCircuitBreaker(key, config);

			// Assert
			expect(result.allowed).toBe(true);
		});
	});

	describe("状態遷移: closed → open", () => {
		it("should_open_after_failure_threshold_reached", () => {
			// Arrange
			const key = "threshold-test";
			const config: CircuitBreakerConfig = { failureThreshold: 3 };

			// Act: 閾値-1回の失敗
			checkCircuitBreaker(key, config);
			for (let i = 0; i < 2; i++) {
				recordCircuitBreakerFailure(key, config);
			}

			// Assert: まだclosed
			expect(getCircuitBreakerState(key)).toBe("closed");

			// Act: 閾値に到達
			recordCircuitBreakerFailure(key, config);

			// Assert: openに遷移
			expect(getCircuitBreakerState(key)).toBe("open");
		});

		it("should_deny_requests_when_open", () => {
			// Arrange
			const key = "open-deny-test";
			const config: CircuitBreakerConfig = { failureThreshold: 1 };
			checkCircuitBreaker(key, config);
			recordCircuitBreakerFailure(key, config);

			// Act
			const result = checkCircuitBreaker(key);

			// Assert
			expect(result.allowed).toBe(false);
			expect(result.state).toBe("open");
			expect(result.retryAfterMs).toBeGreaterThan(0);
		});
	});

	describe("状態遷移: open → half-open", () => {
		it("should_transition_to_half_open_after_cooldown", () => {
			// Arrange
			const key = "half-open-test";
			const config: CircuitBreakerConfig = {
				failureThreshold: 1,
				cooldownMs: 1_000,
			};
			checkCircuitBreaker(key, config);
			recordCircuitBreakerFailure(key, config);
			expect(getCircuitBreakerState(key)).toBe("open");

			// Act: cooldown時間経過
			advanceTime(1_000);
			const result = checkCircuitBreaker(key);

			// Assert
			expect(result.allowed).toBe(true);
			expect(result.state).toBe("half-open");
		});

		it("should_remain_open_before_cooldown", () => {
			// Arrange
			const key = "cooldown-test";
			const config: CircuitBreakerConfig = {
				failureThreshold: 1,
				cooldownMs: 10_000,
			};
			checkCircuitBreaker(key, config);
			recordCircuitBreakerFailure(key, config);

			// Act: cooldown時間未経過
			advanceTime(5_000);
			const result = checkCircuitBreaker(key);

			// Assert
			expect(result.allowed).toBe(false);
			expect(result.state).toBe("open");
		});
	});

	describe("状態遷移: half-open → closed", () => {
		it("should_close_after_success_threshold", () => {
			// Arrange
			const key = "recovery-test";
			const config: CircuitBreakerConfig = {
				failureThreshold: 1,
				cooldownMs: 1_000,
				successThreshold: 2,
			};
			checkCircuitBreaker(key, config);
			recordCircuitBreakerFailure(key, config);
			advanceTime(1_000);
			checkCircuitBreaker(key); // half-open
			expect(getCircuitBreakerState(key)).toBe("half-open");

			// Act: 成功閾値に到達
			recordCircuitBreakerSuccess(key);
			expect(getCircuitBreakerState(key)).toBe("half-open");
			recordCircuitBreakerSuccess(key);

			// Assert: closedに復帰
			expect(getCircuitBreakerState(key)).toBe("closed");
		});

		it("should_reopen_on_failure_in_half_open", () => {
			// Arrange
			const key = "half-open-failure-test";
			const config: CircuitBreakerConfig = {
				failureThreshold: 1,
				cooldownMs: 1_000,
			};
			checkCircuitBreaker(key, config);
			recordCircuitBreakerFailure(key, config);
			advanceTime(1_000);
			checkCircuitBreaker(key); // half-open

			// Act: half-openで失敗
			recordCircuitBreakerFailure(key, config);

			// Assert: openに戻る
			expect(getCircuitBreakerState(key)).toBe("open");
		});
	});
});

// ============================================================================
// recordCircuitBreakerSuccess
// ============================================================================

describe("recordCircuitBreakerSuccess", () => {
	beforeEach(() => {
		resetAllCircuitBreakers();
	});

	it("should_reset_failure_count_in_closed_state", () => {
		// Arrange
		const key = "success-reset-test";
		const config: CircuitBreakerConfig = { failureThreshold: 5 };
		checkCircuitBreaker(key, config);
		recordCircuitBreakerFailure(key, config);
		recordCircuitBreakerFailure(key, config);

		// Act
		recordCircuitBreakerSuccess(key);

		// Assert: 失敗カウントがリセット
		const stats = getCircuitBreakerStats();
		expect(stats[key]?.failureCount).toBe(0);
	});

	it("should_increment_success_count_in_half_open", () => {
		// Arrange
		const key = "half-open-success-test";
		const config: CircuitBreakerConfig = {
			failureThreshold: 1,
			cooldownMs: 1_000,
			successThreshold: 3,
		};
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));

		checkCircuitBreaker(key, config);
		recordCircuitBreakerFailure(key, config);
		advanceTime(1_000);
		checkCircuitBreaker(key); // half-open

		// Act
		recordCircuitBreakerSuccess(key);

		// Assert
		const stats = getCircuitBreakerStats();
		expect(stats[key]?.successCount).toBe(1);

		vi.useRealTimers();
	});

	it("should_not_throw_for_nonexistent_key", () => {
		// Arrange & Act & Assert
		expect(() => recordCircuitBreakerSuccess("nonexistent")).not.toThrow();
	});
});

// ============================================================================
// recordCircuitBreakerFailure
// ============================================================================

describe("recordCircuitBreakerFailure", () => {
	beforeEach(() => {
		resetAllCircuitBreakers();
	});

	it("should_create_breaker_if_not_exists", () => {
		// Arrange
		const key = "auto-create-test";

		// Act
		recordCircuitBreakerFailure(key);

		// Assert
		expect(getCircuitBreakerState(key)).toBeDefined();
	});

	it("should_increment_failure_count", () => {
		// Arrange
		const key = "failure-count-test";
		checkCircuitBreaker(key);

		// Act
		recordCircuitBreakerFailure(key);
		recordCircuitBreakerFailure(key);

		// Assert
		const stats = getCircuitBreakerStats();
		expect(stats[key]?.failureCount).toBe(2);
	});

	it("should_reset_success_count_on_failure", () => {
		// Arrange
		const key = "success-reset-on-failure-test";
		const config: CircuitBreakerConfig = {
			failureThreshold: 1,
			cooldownMs: 1_000,
			successThreshold: 3,
		};
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));

		checkCircuitBreaker(key, config);
		recordCircuitBreakerFailure(key, config);
		advanceTime(1_000);
		checkCircuitBreaker(key); // half-open
		recordCircuitBreakerSuccess(key);

		// Act
		recordCircuitBreakerFailure(key, config);

		// Assert
		const stats = getCircuitBreakerStats();
		expect(stats[key]?.successCount).toBe(0);

		vi.useRealTimers();
	});
});

// ============================================================================
// getCircuitBreakerState
// ============================================================================

describe("getCircuitBreakerState", () => {
	beforeEach(() => {
		resetAllCircuitBreakers();
	});

	it("should_return_undefined_for_nonexistent_key", () => {
		// Act
		const state = getCircuitBreakerState("nonexistent");

		// Assert
		expect(state).toBeUndefined();
	});

	it("should_return_current_state", () => {
		// Arrange
		const key = "state-test";
		checkCircuitBreaker(key);

		// Act
		const state = getCircuitBreakerState(key);

		// Assert
		expect(state).toBe("closed");
	});
});

// ============================================================================
// resetCircuitBreaker
// ============================================================================

describe("resetCircuitBreaker", () => {
	beforeEach(() => {
		resetAllCircuitBreakers();
	});

	it("should_remove_breaker", () => {
		// Arrange
		const key = "reset-test";
		checkCircuitBreaker(key);

		// Act
		const result = resetCircuitBreaker(key);

		// Assert
		expect(result).toBe(true);
		expect(getCircuitBreakerState(key)).toBeUndefined();
	});

	it("should_return_false_for_nonexistent_key", () => {
		// Act
		const result = resetCircuitBreaker("nonexistent");

		// Assert
		expect(result).toBe(false);
	});
});

// ============================================================================
// resetAllCircuitBreakers
// ============================================================================

describe("resetAllCircuitBreakers", () => {
	it("should_clear_all_breakers", () => {
		// Arrange
		checkCircuitBreaker("key1");
		checkCircuitBreaker("key2");
		checkCircuitBreaker("key3");

		// Act
		resetAllCircuitBreakers();

		// Assert
		expect(getCircuitBreakerState("key1")).toBeUndefined();
		expect(getCircuitBreakerState("key2")).toBeUndefined();
		expect(getCircuitBreakerState("key3")).toBeUndefined();
	});
});

// ============================================================================
// getCircuitBreakerStats
// ============================================================================

describe("getCircuitBreakerStats", () => {
	beforeEach(() => {
		resetAllCircuitBreakers();
	});

	it("should_return_empty_object_when_no_breakers", () => {
		// Act
		const stats = getCircuitBreakerStats();

		// Assert
		expect(stats).toEqual({});
	});

	it("should_return_stats_for_all_breakers", () => {
		// Arrange
		checkCircuitBreaker("key1");
		checkCircuitBreaker("key2");
		recordCircuitBreakerFailure("key1");

		// Act
		const stats = getCircuitBreakerStats();

		// Assert
		expect(Object.keys(stats)).toHaveLength(2);
		expect(stats["key1"]?.failureCount).toBe(1);
		expect(stats["key2"]?.failureCount).toBe(0);
	});
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
	beforeEach(() => {
		resetAllCircuitBreakers();
	});

	it("should_always_have_valid_state_after_operations", () => {
		fc.assert(
			fc.property(
				fc.string({ minLength: 1, maxLength: 50 }),
				fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }),
				(key, operations) => {
					resetAllCircuitBreakers();

					// 初期チェック
					checkCircuitBreaker(key);

					// ランダムな成功/失敗を記録
					for (const isSuccess of operations) {
						if (isSuccess) {
							recordCircuitBreakerSuccess(key);
						} else {
							recordCircuitBreakerFailure(key);
						}
					}

					// 状態は常に有効
					const state = getCircuitBreakerState(key);
					expect(["closed", "open", "half-open"]).toContain(state);

					return true;
				}
			)
		);
	});

	it("should_maintain_non_negative_counts", () => {
		fc.assert(
			fc.property(
				fc.string({ minLength: 1, maxLength: 50 }),
				fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }),
				(key, operations) => {
					resetAllCircuitBreakers();
					checkCircuitBreaker(key);

					for (const isSuccess of operations) {
						if (isSuccess) {
							recordCircuitBreakerSuccess(key);
						} else {
							recordCircuitBreakerFailure(key);
						}
					}

					const stats = getCircuitBreakerStats();
					if (stats[key]) {
						expect(stats[key].failureCount).toBeGreaterThanOrEqual(0);
						expect(stats[key].successCount).toBeGreaterThanOrEqual(0);
					}

					return true;
				}
			)
		);
	});
});

// ============================================================================
// エッジケース
// ============================================================================

describe("エッジケース", () => {
	beforeEach(() => {
		resetAllCircuitBreakers();
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should_handle_empty_key", () => {
		// Act
		const result = checkCircuitBreaker("");

		// Assert
		expect(result.allowed).toBe(true);
	});

	it("should_handle_special_characters_in_key", () => {
		// Arrange
		const key = "provider/model:v1.0.0-beta+build";

		// Act
		const result = checkCircuitBreaker(key);

		// Assert
		expect(result.allowed).toBe(true);
	});

	it("should_handle_concurrent_access", async () => {
		// Arrange
		const key = "concurrent-test";
		const operations = Array(100).fill(null).map((_, i) => {
			return () => {
				if (i % 2 === 0) {
					recordCircuitBreakerSuccess(key);
				} else {
					recordCircuitBreakerFailure(key);
				}
			};
		});

		// Act
		checkCircuitBreaker(key);
		operations.forEach(op => op());

		// Assert: エラーが発生しないこと
		expect(getCircuitBreakerState(key)).toBeDefined();
	});

	it("should_handle_zero_failure_threshold", () => {
		// Arrange
		const key = "zero-threshold-test";
		const config: CircuitBreakerConfig = { failureThreshold: 0 };

		// Act
		checkCircuitBreaker(key, config);
		recordCircuitBreakerFailure(key, config);

		// Assert: 即座にopen
		expect(getCircuitBreakerState(key)).toBe("open");
	});
});
