/**
 * @jest-environment node
 */
import {
  checkCircuitBreaker,
  recordCircuitBreakerSuccess,
  recordCircuitBreakerFailure,
  getCircuitBreakerState,
  resetAllCircuitBreakers,
  resetCircuitBreaker,
  getCircuitBreakerStats,
} from "@lib/circuit-breaker.js";

describe("circuit-breaker", () => {
  beforeEach(() => {
    resetAllCircuitBreakers();
  });

  describe("checkCircuitBreaker", () => {
    it("should allow requests in CLOSED state", () => {
      const result = checkCircuitBreaker("test-key");
      expect(result.allowed).toBe(true);
      expect(result.state).toBe("closed");
    });

    it("should return existing state on subsequent calls", () => {
      checkCircuitBreaker("test-key");
      const result = checkCircuitBreaker("test-key");
      expect(result.allowed).toBe(true);
      expect(result.state).toBe("closed");
    });
  });

  describe("state transitions", () => {
    it("should transition to OPEN after reaching failure threshold", () => {
      const key = "failure-test";
      const config = { failureThreshold: 3 };

      // 連続失敗を記録
      for (let i = 0; i < 3; i++) {
        recordCircuitBreakerFailure(key, config);
      }

      const state = getCircuitBreakerState(key);
      expect(state).toBe("open");
    });

    it("should block requests in OPEN state", () => {
      const key = "block-test";
      const config = { failureThreshold: 2, cooldownMs: 60000 };

      // OPEN状態にする
      recordCircuitBreakerFailure(key, config);
      recordCircuitBreakerFailure(key, config);

      const result = checkCircuitBreaker(key, config);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.state).toBe("open");
    });

    it("should transition to HALF-OPEN after cooldown", () => {
      const key = "halfopen-test";
      const config = { failureThreshold: 2, cooldownMs: 0 }; // 即座にクールダウン終了

      // OPEN状態にする
      recordCircuitBreakerFailure(key, config);
      recordCircuitBreakerFailure(key, config);

      // クールダウン期間経過後のチェック
      const result = checkCircuitBreaker(key, config);
      expect(result.allowed).toBe(true);
      expect(result.state).toBe("half-open");
    });

    it("should transition to CLOSED from HALF-OPEN after success threshold", () => {
      const key = "recovery-test";
      const config = { failureThreshold: 2, successThreshold: 2, cooldownMs: 0 };

      // OPEN状態にする
      recordCircuitBreakerFailure(key, config);
      recordCircuitBreakerFailure(key, config);

      // HALF-OPENに遷移
      checkCircuitBreaker(key, config);

      // 成功を記録
      recordCircuitBreakerSuccess(key, config);
      recordCircuitBreakerSuccess(key, config);

      const state = getCircuitBreakerState(key);
      expect(state).toBe("closed");
    });

    it("should transition back to OPEN from HALF-OPEN on failure", () => {
      const key = "back-to-open-test";
      const config = { failureThreshold: 2, cooldownMs: 0 };

      // OPEN状態にする
      recordCircuitBreakerFailure(key, config);
      recordCircuitBreakerFailure(key, config);

      // HALF-OPENに遷移
      checkCircuitBreaker(key, config);

      // 失敗を記録
      recordCircuitBreakerFailure(key, config);

      const state = getCircuitBreakerState(key);
      expect(state).toBe("open");
    });
  });

  describe("resetCircuitBreaker", () => {
    it("should reset specific circuit breaker", () => {
      const key = "reset-test";
      const config = { failureThreshold: 2 };

      // OPEN状態にする
      recordCircuitBreakerFailure(key, config);
      recordCircuitBreakerFailure(key, config);

      resetCircuitBreaker(key);

      const state = getCircuitBreakerState(key);
      expect(state).toBeUndefined();
    });
  });

  describe("resetAllCircuitBreakers", () => {
    it("should reset all circuit breakers", () => {
      const config = { failureThreshold: 2 };

      // 複数のサーキットブレーカーをOPEN状態にする
      recordCircuitBreakerFailure("key1", config);
      recordCircuitBreakerFailure("key1", config);
      recordCircuitBreakerFailure("key2", config);
      recordCircuitBreakerFailure("key2", config);

      resetAllCircuitBreakers();

      expect(getCircuitBreakerState("key1")).toBeUndefined();
      expect(getCircuitBreakerState("key2")).toBeUndefined();
    });
  });

  describe("getCircuitBreakerStats", () => {
    it("should return stats for all circuit breakers", () => {
      const config = { failureThreshold: 2 };

      // いくつかのサーキットブレーカーを操作（checkCircuitBreakerで初期化）
      checkCircuitBreaker("stats-test-1", config);
      checkCircuitBreaker("stats-test-2", config);

      // stats-test-1をOPEN状態にする
      recordCircuitBreakerFailure("stats-test-1", config);
      recordCircuitBreakerFailure("stats-test-1", config);

      // stats-test-2は成功のまま
      recordCircuitBreakerSuccess("stats-test-2", config);

      const stats = getCircuitBreakerStats();

      expect(stats["stats-test-1"]).toBeDefined();
      expect(stats["stats-test-1"].state).toBe("open");
      expect(stats["stats-test-2"]).toBeDefined();
      expect(stats["stats-test-2"].state).toBe("closed");
    });
  });

  describe("edge cases", () => {
    it("should handle success without prior check", () => {
      const key = "success-without-check";
      recordCircuitBreakerSuccess(key);
      // エラーが発生しないことを確認
      expect(getCircuitBreakerState(key)).toBeUndefined();
    });

    it("should handle failure without prior check", () => {
      const key = "failure-without-check";
      recordCircuitBreakerFailure(key);
      // エラーが発生しないことを確認
      expect(getCircuitBreakerState(key)).toBe("closed");
    });

    it("should reset failure count on success in CLOSED state", () => {
      const key = "reset-failure-count";
      const config = { failureThreshold: 5 };

      // いくつかの失敗を記録
      recordCircuitBreakerFailure(key, config);
      recordCircuitBreakerFailure(key, config);

      // 成功を記録
      recordCircuitBreakerSuccess(key, config);

      const stats = getCircuitBreakerStats();
      expect(stats[key].failureCount).toBe(0);
    });
  });
});
