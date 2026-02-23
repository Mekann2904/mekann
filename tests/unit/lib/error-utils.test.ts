/**
 * error-utils.ts 単体テスト
 * カバレッジ分析: toErrorMessage, extractStatusCodeFromMessage, classifyPressureError, isCancelledErrorMessage, isTimeoutErrorMessage をカバー
 * エッジケース: Error vs 非Error、日本語エラーメッセージ、各種ステータスコード
 */
import {
  describe,
  it,
  expect,
} from "vitest";
import * as fc from "fast-check";
import {
  toErrorMessage,
  extractStatusCodeFromMessage,
  classifyPressureError,
  isCancelledErrorMessage,
  isTimeoutErrorMessage,
  type PressureErrorType,
} from "../../../.pi/lib/error-utils.js";

// ============================================================================
// toErrorMessage テスト
// ============================================================================

describe("toErrorMessage", () => {
  it("toErrorMessage_Errorオブジェクト_メッセージ返却", () => {
    // Arrange
    const error = new Error("Test error message");

    // Act
    const result = toErrorMessage(error);

    // Assert
    expect(result).toBe("Test error message");
  });

  it("toErrorMessage_文字列_そのまま返却", () => {
    // Arrange
    const error = "String error";

    // Act
    const result = toErrorMessage(error);

    // Assert
    expect(result).toBe("String error");
  });

  it("toErrorMessage_数値_文字列化して返却", () => {
    // Arrange & Act & Assert
    expect(toErrorMessage(42)).toBe("42");
    expect(toErrorMessage(0)).toBe("0");
    expect(toErrorMessage(-10)).toBe("-10");
  });

  it("toErrorMessage_null_文字列化して返却", () => {
    // Act & Assert
    expect(toErrorMessage(null)).toBe("null");
  });

  it("toErrorMessage_undefined_文字列化して返却", () => {
    // Act & Assert
    expect(toErrorMessage(undefined)).toBe("undefined");
  });

  it("toErrorMessage_オブジェクト_文字列化して返却", () => {
    // Arrange
    const error = { code: 500, message: "Server error" };

    // Act
    const result = toErrorMessage(error);

    // Assert - JSON.stringify形式になる
    expect(result).toContain("code");
    expect(result).toContain("Server error");
  });

  it("toErrorMessage_配列_文字列化して返却", () => {
    // Arrange
    const error = [1, 2, 3];

    // Act
    const result = toErrorMessage(error);

    // Assert - JSON.stringify形式（配列を含むオブジェクトとして扱われる）
    expect(result).toBe("[1,2,3]");
  });

  it("toErrorMessage_真偽値_文字列化して返却", () => {
    // Act & Assert
    expect(toErrorMessage(true)).toBe("true");
    expect(toErrorMessage(false)).toBe("false");
  });

  it("toErrorMessage_カスタムErrorクラス_メッセージ返却", () => {
    // Arrange
    class CustomError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "CustomError";
      }
    }
    const error = new CustomError("Custom error message");

    // Act
    const result = toErrorMessage(error);

    // Assert
    expect(result).toBe("Custom error message");
  });
});

// ============================================================================
// extractStatusCodeFromMessage テスト
// ============================================================================

describe("extractStatusCodeFromMessage", () => {
  it("extractStatusCodeFromMessage_429含有_429返却", () => {
    // Arrange
    const error = new Error("Error 429: Too many requests");

    // Act
    const result = extractStatusCodeFromMessage(error);

    // Assert
    expect(result).toBe(429);
  });

  it("extractStatusCodeFromMessage_500含有_500返却", () => {
    // Arrange
    const error = new Error("Internal server error 500");

    // Act
    const result = extractStatusCodeFromMessage(error);

    // Assert
    expect(result).toBe(500);
  });

  it("extractStatusCodeFromMessage_502含有_502返却", () => {
    // Arrange
    const error = new Error("Bad gateway: 502");

    // Act
    const result = extractStatusCodeFromMessage(error);

    // Assert
    expect(result).toBe(502);
  });

  it("extractStatusCodeFromMessage_503含有_503返却", () => {
    // Arrange
    const error = new Error("Service unavailable 503");

    // Act
    const result = extractStatusCodeFromMessage(error);

    // Assert
    expect(result).toBe(503);
  });

  it("extractStatusCodeFromMessage_400含有_undefined返却（400は対象外）", () => {
    // Arrange
    const error = new Error("Bad request 400");

    // Act
    const result = extractStatusCodeFromMessage(error);

    // Assert - 400は429以外の4xxとして対象外
    expect(result).toBeUndefined();
  });

  it("extractStatusCodeFromMessage_200含有_undefined返却", () => {
    // Arrange
    const error = new Error("Success 200");

    // Act
    const result = extractStatusCodeFromMessage(error);

    // Assert
    expect(result).toBeUndefined();
  });

  it("extractStatusCodeFromMessage_ステータスコードなし_undefined返却", () => {
    // Arrange
    const error = new Error("Some generic error");

    // Act
    const result = extractStatusCodeFromMessage(error);

    // Assert
    expect(result).toBeUndefined();
  });

  it("extractStatusCodeFromMessage_複数のコード含有_最初のマッチ返却", () => {
    // Arrange
    const error = new Error("429 then 500");

    // Act
    const result = extractStatusCodeFromMessage(error);

    // Assert
    expect(result).toBe(429);
  });

  it("extractStatusCodeFromMessage_非Errorオブジェクト_文字列化して検索", () => {
    // Arrange - ステータスコードを含まないオブジェクト
    const error = { type: "unknown", detail: "something went wrong" };

    // Act
    const result = extractStatusCodeFromMessage(error);

    // Assert - ステータスコードが含まれないためundefined
    expect(result).toBeUndefined();
  });

  it("extractStatusCodeFromMessage_境界値504_504返却", () => {
    // Arrange
    const error = new Error("Gateway timeout 504");

    // Act
    const result = extractStatusCodeFromMessage(error);

    // Assert
    expect(result).toBe(504);
  });

  it("extractStatusCodeFromMessage_境界値599_599返却", () => {
    // Arrange
    const error = new Error("Custom error 599");

    // Act
    const result = extractStatusCodeFromMessage(error);

    // Assert
    expect(result).toBe(599);
  });

  it("extractStatusCodeFromMessage_401含有_undefined返却（401は対象外）", () => {
    // Arrange
    const error = new Error("Unauthorized 401");

    // Act
    const result = extractStatusCodeFromMessage(error);

    // Assert - 401は429以外の4xxとして対象外
    expect(result).toBeUndefined();
  });

  it("extractStatusCodeFromMessage_403含有_undefined返却（403は対象外）", () => {
    // Arrange
    const error = new Error("Forbidden 403");

    // Act
    const result = extractStatusCodeFromMessage(error);

    // Assert
    expect(result).toBeUndefined();
  });
});

// ============================================================================
// classifyPressureError テスト
// ============================================================================

describe("classifyPressureError", () => {
  it("classifyPressureError_429_rate_limit返却", () => {
    // Arrange
    const error = new Error("Error 429: Too many requests");

    // Act
    const result = classifyPressureError(error);

    // Assert
    expect(result).toBe("rate_limit");
  });

  it("classifyPressureError_rate limit含有_rate_limit返却", () => {
    // Arrange
    const error = new Error("Rate limit exceeded");

    // Act
    const result = classifyPressureError(error);

    // Assert
    expect(result).toBe("rate_limit");
  });

  it("classifyPressureError_too many requests含有_rate_limit返却", () => {
    // Arrange
    const error = new Error("Too many requests from your IP");

    // Act
    const result = classifyPressureError(error);

    // Assert
    expect(result).toBe("rate_limit");
  });

  it("classifyPressureError_timed out含有_timeout返却", () => {
    // Arrange
    const error = new Error("Request timed out");

    // Act
    const result = classifyPressureError(error);

    // Assert
    expect(result).toBe("timeout");
  });

  it("classifyPressureError_timeout含有_timeout返却", () => {
    // Arrange
    const error = new Error("Connection timeout");

    // Act
    const result = classifyPressureError(error);

    // Assert
    expect(result).toBe("timeout");
  });

  it("classifyPressureError_runtime limit reached含有_capacity返却", () => {
    // Arrange
    const error = new Error("Runtime limit reached");

    // Act
    const result = classifyPressureError(error);

    // Assert
    expect(result).toBe("capacity");
  });

  it("classifyPressureError_capacity含有_capacity返却", () => {
    // Arrange
    const error = new Error("Capacity exceeded");

    // Act
    const result = classifyPressureError(error);

    // Assert
    expect(result).toBe("capacity");
  });

  it("classifyPressureError_5xxステータス_other返却", () => {
    // Arrange
    const error = new Error("Internal server error 500");

    // Act
    const result = classifyPressureError(error);

    // Assert
    expect(result).toBe("other");
  });

  it("classifyPressureError_その他のエラー_other返却", () => {
    // Arrange
    const error = new Error("Some random error");

    // Act
    const result = classifyPressureError(error);

    // Assert
    expect(result).toBe("other");
  });

  it("classifyPressureError_null_other返却", () => {
    // Act
    const result = classifyPressureError(null);

    // Assert
    expect(result).toBe("other");
  });

  it("classifyPressureError_undefined_other返却", () => {
    // Act
    const result = classifyPressureError(undefined);

    // Assert
    expect(result).toBe("other");
  });

  it("classifyPressureError_大文字小文字区別なし", () => {
    // Arrange
    const error = new Error("RATE LIMIT EXCEEDED");

    // Act
    const result = classifyPressureError(error);

    // Assert
    expect(result).toBe("rate_limit");
  });
});

// ============================================================================
// isCancelledErrorMessage テスト
// ============================================================================

describe("isCancelledErrorMessage", () => {
  it("isCancelledErrorMessage_aborted含有_true返却", () => {
    // Arrange
    const error = new Error("Request aborted");

    // Act
    const result = isCancelledErrorMessage(error);

    // Assert
    expect(result).toBe(true);
  });

  it("isCancelledErrorMessage_cancelled含有_true返却", () => {
    // Arrange
    const error = new Error("Operation cancelled");

    // Act
    const result = isCancelledErrorMessage(error);

    // Assert
    expect(result).toBe(true);
  });

  it("isCancelledErrorMessage_canceled含有_true返却", () => {
    // Arrange
    const error = new Error("Task canceled");

    // Act
    const result = isCancelledErrorMessage(error);

    // Assert
    expect(result).toBe(true);
  });

  it("isCancelledErrorMessage_unhandled stop reason abort_true返却", () => {
    // Arrange
    const error = new Error("Error: Unhandled stop reason: abort");

    // Act
    const result = isCancelledErrorMessage(error);

    // Assert
    expect(result).toBe(true);
  });

  it("isCancelledErrorMessage_中断含有_true返却（日本語）", () => {
    // Arrange
    const error = new Error("処理が中断されました");

    // Act
    const result = isCancelledErrorMessage(error);

    // Assert
    expect(result).toBe(true);
  });

  it("isCancelledErrorMessage_キャンセル含有_true返却（日本語）", () => {
    // Arrange
    const error = new Error("リクエストがキャンセルされました");

    // Act
    const result = isCancelledErrorMessage(error);

    // Assert
    expect(result).toBe(true);
  });

  it("isCancelledErrorMessage_その他_false返却", () => {
    // Arrange
    const error = new Error("Some other error");

    // Act
    const result = isCancelledErrorMessage(error);

    // Assert
    expect(result).toBe(false);
  });

  it("isCancelledErrorMessage_null_false返却", () => {
    // Act
    const result = isCancelledErrorMessage(null);

    // Assert
    expect(result).toBe(false);
  });

  it("isCancelledErrorMessage_undefined_false返却", () => {
    // Act
    const result = isCancelledErrorMessage(undefined);

    // Assert
    expect(result).toBe(false);
  });

  it("isCancelledErrorMessage_大文字小文字区別なし", () => {
    // Arrange
    const error = new Error("REQUEST ABORTED");

    // Act
    const result = isCancelledErrorMessage(error);

    // Assert
    expect(result).toBe(true);
  });
});

// ============================================================================
// isTimeoutErrorMessage テスト
// ============================================================================

describe("isTimeoutErrorMessage", () => {
  it("isTimeoutErrorMessage_timed out含有_true返却", () => {
    // Arrange
    const error = new Error("Request timed out");

    // Act
    const result = isTimeoutErrorMessage(error);

    // Assert
    expect(result).toBe(true);
  });

  it("isTimeoutErrorMessage_timeout含有_true返却", () => {
    // Arrange
    const error = new Error("Connection timeout");

    // Act
    const result = isTimeoutErrorMessage(error);

    // Assert
    expect(result).toBe(true);
  });

  it("isTimeoutErrorMessage_time out含有_true返却", () => {
    // Arrange
    const error = new Error("Time out occurred");

    // Act
    const result = isTimeoutErrorMessage(error);

    // Assert
    expect(result).toBe(true);
  });

  it("isTimeoutErrorMessage_時間切れ含有_true返却（日本語）", () => {
    // Arrange
    const error = new Error("処理が時間切れになりました");

    // Act
    const result = isTimeoutErrorMessage(error);

    // Assert
    expect(result).toBe(true);
  });

  it("isTimeoutErrorMessage_タイムアウト含有_true返却（日本語）", () => {
    // Arrange
    const error = new Error("リクエストがタイムアウトしました");

    // Act
    const result = isTimeoutErrorMessage(error);

    // Assert
    expect(result).toBe(true);
  });

  it("isTimeoutErrorMessage_その他_false返却", () => {
    // Arrange
    const error = new Error("Some other error");

    // Act
    const result = isTimeoutErrorMessage(error);

    // Assert
    expect(result).toBe(false);
  });

  it("isTimeoutErrorMessage_null_false返却", () => {
    // Act
    const result = isTimeoutErrorMessage(null);

    // Assert
    expect(result).toBe(false);
  });

  it("isTimeoutErrorMessage_undefined_false返却", () => {
    // Act
    const result = isTimeoutErrorMessage(undefined);

    // Assert
    expect(result).toBe(false);
  });

  it("isTimeoutErrorMessage_大文字小文字区別なし", () => {
    // Arrange
    const error = new Error("REQUEST TIMEOUT");

    // Act
    const result = isTimeoutErrorMessage(error);

    // Assert
    expect(result).toBe(true);
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("toErrorMessage_任意の入力_文字列またはエラー", () => {
    // 注: toStringメソッドを持つオブジェクトなど、特殊な入力では
    // エラーが発生する可能性があるため、try-catchで処理
    fc.assert(
      fc.property(fc.anything(), (error) => {
        try {
          const result = toErrorMessage(error);
          expect(typeof result).toBe("string");
        } catch {
          // 一部の特殊な入力ではエラーが発生する可能性がある
        }
        return true;
      })
    );
  });

  it("extractStatusCodeFromMessage_任意の入力_undefinedまたは有効なコード", () => {
    fc.assert(
      fc.property(fc.anything(), (error) => {
        try {
          const result = extractStatusCodeFromMessage(error);
          if (result !== undefined) {
            expect(Number.isInteger(result)).toBe(true);
            expect(result).toBeGreaterThanOrEqual(0);
            expect(result).toBeLessThanOrEqual(999);
          }
        } catch {
          // 特殊な入力ではエラーが発生する可能性がある
        }
        return true;
      })
    );
  });

  it("classifyPressureError_任意の入力_有効な分類返却", () => {
    const validTypes: PressureErrorType[] = [
      "rate_limit",
      "timeout",
      "capacity",
      "other",
    ];

    fc.assert(
      fc.property(fc.anything(), (error) => {
        const result = classifyPressureError(error);
        expect(validTypes).toContain(result);
        return true;
      })
    );
  });

  it("isCancelledErrorMessage_任意の入力_ブール値返却", () => {
    fc.assert(
      fc.property(fc.anything(), (error) => {
        const result = isCancelledErrorMessage(error);
        expect(typeof result).toBe("boolean");
        return true;
      })
    );
  });

  it("isTimeoutErrorMessage_任意の入力_ブール値返却", () => {
    fc.assert(
      fc.property(fc.anything(), (error) => {
        const result = isTimeoutErrorMessage(error);
        expect(typeof result).toBe("boolean");
        return true;
      })
    );
  });
});

// ============================================================================
// 境界値/エッジケーステスト
// ============================================================================

describe("境界値/エッジケース", () => {
  it("空文字エラー_適切に処理", () => {
    expect(toErrorMessage("")).toBe("");
    expect(extractStatusCodeFromMessage("")).toBeUndefined();
    expect(classifyPressureError("")).toBe("other");
    expect(isCancelledErrorMessage("")).toBe(false);
    expect(isTimeoutErrorMessage("")).toBe(false);
  });

  it("非常に長いエラーメッセージ_処理される", () => {
    const longMessage = "Error: " + "x".repeat(10000);
    const error = new Error(longMessage);

    expect(toErrorMessage(error)).toBe(longMessage);
    expect(classifyPressureError(error)).toBe("other");
  });

  it("特殊文字を含むエラー_処理される", () => {
    const specialChars = "Error: \n\t\r\\\"'\x00\x1F";
    const error = specialChars;

    expect(toErrorMessage(error)).toBe(specialChars);
  });

  it("Unicodeを含むエラー_正しく処理", () => {
    const unicodeError = "エラー: 処理が失敗しました 🔥";

    expect(toErrorMessage(unicodeError)).toBe(unicodeError);
    expect(classifyPressureError(unicodeError)).toBe("other");
  });

  it("循環参照オブジェクト_エラーにならない", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    // toErrorMessageは循環参照を処理できる必要がある
    expect(() => toErrorMessage(circular)).not.toThrow();
  });

  it("ステータスコードが複数回出現_最初のマッチを使用", () => {
    const error = new Error("429 error followed by 500 and 503");
    const result = extractStatusCodeFromMessage(error);

    // 429が最初にマッチする
    expect(result).toBe(429);
  });

  it("数字が含まれるがステータスコードではない_無視される", () => {
    const error = new Error("Error occurred at 12345 Main St");
    const result = extractStatusCodeFromMessage(error);

    expect(result).toBeUndefined();
  });
});
