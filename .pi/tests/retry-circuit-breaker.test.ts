/**
 * @jest-environment node
 */
import {
  retryWithBackoff,
  clearRateLimitState,
} from "@lib/retry-with-backoff.js";
import {
  resetAllCircuitBreakers,
  getCircuitBreakerState,
  getCircuitBreakerStats,
} from "@lib/circuit-breaker.js";

describe("retry-with-backoff circuit breaker integration", () => {
  beforeEach(() => {
    resetAllCircuitBreakers();
    clearRateLimitState();
  });

  describe("circuit breaker protection", () => {
    it("should record success on successful operation", async () => {
      const key = "success-test";
      let callCount = 0;

      await retryWithBackoff(
        async () => {
          callCount++;
          return "success";
        },
        {
          circuitBreakerKey: key,
          enableCircuitBreaker: true,
        }
      );

      expect(callCount).toBe(1);
      expect(getCircuitBreakerState(key)).toBe("closed");
    });

    it("should record failure on non-retryable error", async () => {
      const key = "non-retryable-test";
      let callCount = 0;

      await expect(
        retryWithBackoff(
          async () => {
            callCount++;
            const error = new Error("Non-retryable error");
            throw error;
          },
          {
            circuitBreakerKey: key,
            enableCircuitBreaker: true,
            overrides: { maxRetries: 2 },
            shouldRetry: () => false, // 非リトライ可能
          }
        )
      ).rejects.toThrow("Non-retryable error");

      expect(callCount).toBe(1);
      // 失敗が記録されていることを確認
      const stats = getCircuitBreakerStats();
      expect(stats[key]).toBeDefined();
      expect(stats[key].failureCount).toBe(1);
    });

    it("should open circuit after max retries exceeded", async () => {
      const key = "open-circuit-test";
      let callCount = 0;

      // failureThreshold: 2でOPEN状態にする
      for (let i = 0; i < 2; i++) {
        await expect(
          retryWithBackoff(
            async () => {
              callCount++;
              const error = new Error("Network error");
              (error as any).status = 503;
              throw error;
            },
            {
              circuitBreakerKey: key,
              enableCircuitBreaker: true,
              overrides: { maxRetries: 1 },
              circuitBreakerConfig: { failureThreshold: 2 },
            }
          )
        ).rejects.toThrow();
      }

      // サーキットブレーカーがOPEN状態になっていることを確認
      const state = getCircuitBreakerState(key);
      expect(state).toBe("open");
    });

    it("should throw error when circuit is open", async () => {
      const key = "skip-test";
      let callCount = 0;
      let openCallbackCount = 0;

      // 最初にOPEN状態にする
      await expect(
        retryWithBackoff(
          async () => {
            callCount++;
            const error = new Error("Network error");
            (error as any).status = 503;
            throw error;
          },
          {
            circuitBreakerKey: key,
            enableCircuitBreaker: true,
            overrides: { maxRetries: 2 },
            circuitBreakerConfig: { failureThreshold: 1, cooldownMs: 60000 },
          }
        )
      ).rejects.toThrow();

      expect(callCount).toBeGreaterThan(0);

      // OPEN状態で再度呼び出し（エラーがスローされることを確認）
      await expect(
        retryWithBackoff(
          async () => {
            callCount++;
            throw new Error("Should not be called");
          },
          {
            circuitBreakerKey: key,
            enableCircuitBreaker: true,
            overrides: { maxRetries: 0 },
            circuitBreakerConfig: { failureThreshold: 1, cooldownMs: 60000 },
            onCircuitBreakerOpen: () => {
              openCallbackCount++;
            },
          }
        )
      ).rejects.toThrow("Circuit breaker is open");

      // コールバックが呼ばれたことを確認
      expect(openCallbackCount).toBe(1);
    });

    it("should use rateLimitKey as circuitBreakerKey when not specified", async () => {
      const key = "auto-key-test";
      let callCount = 0;

      await retryWithBackoff(
        async () => {
          callCount++;
          return "success";
        },
        {
          rateLimitKey: key,
          enableCircuitBreaker: true,
        }
      );

      // rateLimitKeyがcircuitBreakerKeyとして使用されていることを確認
      expect(getCircuitBreakerState(key)).toBe("closed");
    });

    it("should disable circuit breaker when enableCircuitBreaker is false", async () => {
      const key = "disabled-test";
      let callCount = 0;

      await expect(
        retryWithBackoff(
          async () => {
            callCount++;
            const error = new Error("Network error");
            (error as any).status = 503;
            throw error;
          },
          {
            circuitBreakerKey: key,
            enableCircuitBreaker: false,
            overrides: { maxRetries: 1 },
          }
        )
      ).rejects.toThrow();

      // サーキットブレーカーが無効なため、状態が作成されないことを確認
      expect(getCircuitBreakerState(key)).toBeUndefined();
    });
  });

  describe("circuit breaker recovery", () => {
    it("should transition to closed after successful operations in half-open", async () => {
      const key = "recovery-test";
      let callCount = 0;

      // HALF-OPEN状態に遷移させるため、cooldownMs: 0で設定
      const config = {
        failureThreshold: 1,
        successThreshold: 1,
        cooldownMs: 0,
      };

      // OPEN状態にする
      await expect(
        retryWithBackoff(
          async () => {
            callCount++;
            const error = new Error("Network error");
            (error as any).status = 503;
            throw error;
          },
          {
            circuitBreakerKey: key,
            enableCircuitBreaker: true,
            overrides: { maxRetries: 0 },
            circuitBreakerConfig: config,
          }
        )
      ).rejects.toThrow();

      expect(getCircuitBreakerState(key)).toBe("open");

      // 少し待機してHALF-OPENに遷移させる（cooldownMs: 0なので即座に遷移）
      await new Promise((resolve) => setTimeout(resolve, 10));

      // 成功させる（HALF-OPEN -> CLOSED）
      callCount = 0;
      await retryWithBackoff(
        async () => {
          callCount++;
          return "success";
        },
        {
          circuitBreakerKey: key,
          enableCircuitBreaker: true,
          circuitBreakerConfig: config,
        }
      );

      expect(getCircuitBreakerState(key)).toBe("closed");
    });
  });
});
