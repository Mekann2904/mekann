/**
 * resolveSubagentFailureOutcome関数の単体テスト
 * エラー分類の優先順位とretryRecommendedフラグの正確性を検証する
 */

import { describe, it, expect } from "vitest";
import { resolveSubagentFailureOutcome } from "../../../lib/agent/agent-errors.js";

describe("resolveSubagentFailureOutcome", () => {
  describe("単一エラータイプの分類", () => {
    it("キャンセルエラーをCANCELLEDとして分類する", () => {
      const result = resolveSubagentFailureOutcome("Operation cancelled by user");
      expect(result.outcomeCode).toBe("CANCELLED");
      expect(result.retryRecommended).toBe(false);
    });

    it("キャンセルエラー（日本語）をCANCELLEDとして分類する", () => {
      const result = resolveSubagentFailureOutcome("操作がキャンセルされました");
      expect(result.outcomeCode).toBe("CANCELLED");
      expect(result.retryRecommended).toBe(false);
    });

    it("タイムアウトエラーをTIMEOUTとして分類する", () => {
      const result = resolveSubagentFailureOutcome("Operation timed out after 30000ms");
      expect(result.outcomeCode).toBe("TIMEOUT");
      expect(result.retryRecommended).toBe(true);
    });

    it("タイムアウトエラー（日本語）をTIMEOUTとして分類する", () => {
      const result = resolveSubagentFailureOutcome("タイムアウトしました");
      expect(result.outcomeCode).toBe("TIMEOUT");
      expect(result.retryRecommended).toBe(true);
    });

    it("レート制限エラーをRETRYABLE_FAILUREとして分類する", () => {
      const result = resolveSubagentFailureOutcome("Rate limit exceeded");
      expect(result.outcomeCode).toBe("RETRYABLE_FAILURE");
      expect(result.retryRecommended).toBe(true);
    });

    it("レート制限エラー（429）をRETRYABLE_FAILUREとして分類する", () => {
      const result = resolveSubagentFailureOutcome("Error 429: Too many requests");
      expect(result.outcomeCode).toBe("RETRYABLE_FAILURE");
      expect(result.retryRecommended).toBe(true);
    });

    it("容量エラーをRETRYABLE_FAILUREとして分類する", () => {
      const result = resolveSubagentFailureOutcome("Service temporarily overloaded");
      expect(result.outcomeCode).toBe("RETRYABLE_FAILURE");
      expect(result.retryRecommended).toBe(true);
    });

    it("容量エラー（503）をRETRYABLE_FAILUREとして分類する", () => {
      const result = resolveSubagentFailureOutcome("Error 503: Service unavailable");
      expect(result.outcomeCode).toBe("RETRYABLE_FAILURE");
      expect(result.retryRecommended).toBe(true);
    });

    it("不明なエラーをNONRETRYABLE_FAILUREとして分類する", () => {
      const result = resolveSubagentFailureOutcome("Unknown error occurred");
      expect(result.outcomeCode).toBe("NONRETRYABLE_FAILURE");
      expect(result.retryRecommended).toBe(false);
    });

    it("nullエラーをNONRETRYABLE_FAILUREとして分類する", () => {
      const result = resolveSubagentFailureOutcome(null);
      expect(result.outcomeCode).toBe("NONRETRYABLE_FAILURE");
      expect(result.retryRecommended).toBe(false);
    });

    it("undefinedエラーをNONRETRYABLE_FAILUREとして分類する", () => {
      const result = resolveSubagentFailureOutcome(undefined);
      expect(result.outcomeCode).toBe("NONRETRYABLE_FAILURE");
      expect(result.retryRecommended).toBe(false);
    });
  });

  describe("複合エラーメッセージでの優先順位検証", () => {
    it("キャンセル+タイムアウト → CANCELLEDが優先（再試行不可）", () => {
      // "cancelled"が先にマッチするためCANCELLEDになる
      const result = resolveSubagentFailureOutcome(
        "Operation cancelled due to timeout",
      );
      expect(result.outcomeCode).toBe("CANCELLED");
      expect(result.retryRecommended).toBe(false);
    });

    it("タイムアウト+レート制限 → TIMEOUTが優先（再試行可能）", () => {
      // "timeout"が先にマッチするためTIMEOUTになる
      const result = resolveSubagentFailureOutcome(
        "Request timeout after rate limit check",
      );
      expect(result.outcomeCode).toBe("TIMEOUT");
      expect(result.retryRecommended).toBe(true);
    });

    it("タイムアウト+容量エラー → TIMEOUTが優先（再試行可能）", () => {
      const result = resolveSubagentFailureOutcome(
        "Timeout while service was overloaded",
      );
      expect(result.outcomeCode).toBe("TIMEOUT");
      expect(result.retryRecommended).toBe(true);
    });
  });

  describe("retryRecommendedフラグの正確性", () => {
    it("CANCELLEDは再試行不可", () => {
      const result = resolveSubagentFailureOutcome("cancelled");
      expect(result.retryRecommended).toBe(false);
    });

    it("TIMEOUTは再試行可能", () => {
      const result = resolveSubagentFailureOutcome("timeout");
      expect(result.retryRecommended).toBe(true);
    });

    it("RETRYABLE_FAILUREは再試行可能", () => {
      const rateLimitResult = resolveSubagentFailureOutcome("rate limit exceeded");
      expect(rateLimitResult.outcomeCode).toBe("RETRYABLE_FAILURE");
      expect(rateLimitResult.retryRecommended).toBe(true);

      const capacityResult = resolveSubagentFailureOutcome("service overloaded");
      expect(capacityResult.outcomeCode).toBe("RETRYABLE_FAILURE");
      expect(capacityResult.retryRecommended).toBe(true);
    });

    it("NONRETRYABLE_FAILUREは再試行不可", () => {
      const result = resolveSubagentFailureOutcome("invalid input");
      expect(result.outcomeCode).toBe("NONRETRYABLE_FAILURE");
      expect(result.retryRecommended).toBe(false);
    });
  });

  describe("圧力エラーの分類", () => {
    it("overloadを圧力エラーとして分類する", () => {
      const result = resolveSubagentFailureOutcome("Server is overloaded");
      expect(result.outcomeCode).toBe("RETRYABLE_FAILURE");
      expect(result.retryRecommended).toBe(true);
    });

    it("capacityを圧力エラーとして分類する", () => {
      const result = resolveSubagentFailureOutcome("Capacity exceeded");
      expect(result.outcomeCode).toBe("RETRYABLE_FAILURE");
      expect(result.retryRecommended).toBe(true);
    });

    it("runtime limitを圧力エラーとして分類する", () => {
      const result = resolveSubagentFailureOutcome("Runtime limit reached");
      expect(result.outcomeCode).toBe("RETRYABLE_FAILURE");
      expect(result.retryRecommended).toBe(true);
    });
  });

  describe("Errorオブジェクトの処理", () => {
    it("Errorオブジェクトからメッセージを抽出して分類する", () => {
      const error = new Error("Request timeout");
      const result = resolveSubagentFailureOutcome(error);
      expect(result.outcomeCode).toBe("TIMEOUT");
      expect(result.retryRecommended).toBe(true);
    });

    it("カスタムエラークラスを処理する", () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = "CustomError";
        }
      }
      const error = new CustomError("Operation cancelled");
      const result = resolveSubagentFailureOutcome(error);
      expect(result.outcomeCode).toBe("CANCELLED");
      expect(result.retryRecommended).toBe(false);
    });
  });

  describe("境界条件", () => {
    it("空文字列はNONRETRYABLE_FAILURE", () => {
      const result = resolveSubagentFailureOutcome("");
      expect(result.outcomeCode).toBe("NONRETRYABLE_FAILURE");
      expect(result.retryRecommended).toBe(false);
    });

    it("大文字小文字を区別しない", () => {
      const upper = resolveSubagentFailureOutcome("CANCELLED");
      const lower = resolveSubagentFailureOutcome("cancelled");
      const mixed = resolveSubagentFailureOutcome("Cancelled");

      expect(upper.outcomeCode).toBe("CANCELLED");
      expect(lower.outcomeCode).toBe("CANCELLED");
      expect(mixed.outcomeCode).toBe("CANCELLED");

      expect(upper.retryRecommended).toBe(false);
      expect(lower.retryRecommended).toBe(false);
      expect(mixed.retryRecommended).toBe(false);
    });

    it("日本語と英語が混在するメッセージを処理する", () => {
      const result = resolveSubagentFailureOutcome(
        "処理がtimeoutしました（timeout exceeded）",
      );
      expect(result.outcomeCode).toBe("TIMEOUT");
      expect(result.retryRecommended).toBe(true);
    });
  });
});
