/**
 * @file .pi/lib/errors.ts の単体テスト
 * @description pi-plugin共通エラークラスおよびユーティリティ関数のテスト
 * @testFramework vitest
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  PiError,
  RuntimeLimitError,
  RuntimeQueueWaitError,
  SchemaValidationError,
  ValidationError,
  TimeoutError,
  CancelledError,
  RateLimitError,
  CapacityError,
  ParsingError,
  ExecutionError,
  ConfigurationError,
  StorageError,
  isPiError,
  hasErrorCode,
  isRetryableError,
  toPiError,
  getErrorCode,
  isRetryableErrorCode,
  type PiErrorCode,
  type ErrorSeverity,
  type ErrorContext,
} from "@lib/errors";

// ============================================================================
// PiError 基底クラス
// ============================================================================

describe("PiError", () => {
  describe("constructor", () => {
    it("should_create_error_with_message_only", () => {
      // Arrange
      const message = "Test error message";

      // Act
      const error = new PiError(message);

      // Assert
      expect(error.message).toBe(message);
      expect(error.code).toBe("UNKNOWN_ERROR");
      expect(error.retryable).toBe(false);
      expect(error.cause).toBeUndefined();
      expect(error.timestamp).toBeGreaterThan(0);
      expect(error.name).toBe("PiError");
    });

    it("should_create_error_with_custom_code", () => {
      // Arrange
      const message = "Custom error";
      const code: PiErrorCode = "TIMEOUT_ERROR";

      // Act
      const error = new PiError(message, code);

      // Assert
      expect(error.code).toBe("TIMEOUT_ERROR");
    });

    it("should_create_error_with_retryable_option", () => {
      // Arrange
      const message = "Retryable error";

      // Act
      const error = new PiError(message, "RATE_LIMIT_ERROR", { retryable: true });

      // Assert
      expect(error.retryable).toBe(true);
    });

    it("should_create_error_with_cause", () => {
      // Arrange
      const originalError = new Error("Original error");
      const message = "Wrapped error";

      // Act
      const error = new PiError(message, "UNKNOWN_ERROR", { cause: originalError });

      // Assert
      expect(error.cause).toBe(originalError);
      expect(error.cause?.message).toBe("Original error");
    });

    it("should_create_error_with_all_options", () => {
      // Arrange
      const message = "Full error";
      const code: PiErrorCode = "SCHEMA_VIOLATION";
      const cause = new Error("Cause");

      // Act
      const error = new PiError(message, code, { retryable: true, cause });

      // Assert
      expect(error.message).toBe(message);
      expect(error.code).toBe(code);
      expect(error.retryable).toBe(true);
      expect(error.cause).toBe(cause);
    });

    it("should_inherit_from_Error", () => {
      // Arrange & Act
      const error = new PiError("Test");

      // Assert
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(PiError);
    });
  });

  describe("is", () => {
    it("should_return_true_when_codes_match", () => {
      // Arrange
      const error = new PiError("Test", "TIMEOUT_ERROR");

      // Act & Assert
      expect(error.is("TIMEOUT_ERROR")).toBe(true);
    });

    it("should_return_false_when_codes_differ", () => {
      // Arrange
      const error = new PiError("Test", "TIMEOUT_ERROR");

      // Act & Assert
      expect(error.is("UNKNOWN_ERROR")).toBe(false);
      expect(error.is("RATE_LIMIT_ERROR")).toBe(false);
    });
  });

  describe("toJSON", () => {
    it("should_serialize_to_json_object", () => {
      // Arrange
      const error = new PiError("Test message", "TIMEOUT_ERROR", { retryable: true });

      // Act
      const json = error.toJSON();

      // Assert
      expect(json).toEqual({
        name: "PiError",
        message: "Test message",
        code: "TIMEOUT_ERROR",
        retryable: true,
        timestamp: expect.any(Number),
        cause: undefined,
        stack: expect.any(String),
      });
    });

    it("should_include_cause_message_in_json", () => {
      // Arrange
      const cause = new Error("Cause error");
      const error = new PiError("Main error", "UNKNOWN_ERROR", { cause });

      // Act
      const json = error.toJSON();

      // Assert
      expect(json.cause).toBe("Cause error");
    });
  });
});

// ============================================================================
// RuntimeLimitError
// ============================================================================

describe("RuntimeLimitError", () => {
  describe("constructor", () => {
    it("should_create_with_message_only", () => {
      // Arrange
      const message = "Runtime limit exceeded";

      // Act
      const error = new RuntimeLimitError(message);

      // Assert
      expect(error.message).toBe(message);
      expect(error.code).toBe("RUNTIME_LIMIT_REACHED");
      expect(error.retryable).toBe(false);
      expect(error.currentCount).toBeUndefined();
      expect(error.maxCount).toBeUndefined();
    });

    it("should_create_with_count_options", () => {
      // Arrange
      const message = "Limit reached";

      // Act
      const error = new RuntimeLimitError(message, { currentCount: 10, maxCount: 8 });

      // Assert
      expect(error.currentCount).toBe(10);
      expect(error.maxCount).toBe(8);
    });

    it("should_inherit_from_PiError", () => {
      // Arrange & Act
      const error = new RuntimeLimitError("Test");

      // Assert
      expect(error).toBeInstanceOf(PiError);
      expect(error).toBeInstanceOf(RuntimeLimitError);
    });
  });

  describe("toJSON", () => {
    it("should_include_count_properties", () => {
      // Arrange
      const error = new RuntimeLimitError("Test", { currentCount: 5, maxCount: 3 });

      // Act
      const json = error.toJSON();

      // Assert
      expect(json.currentCount).toBe(5);
      expect(json.maxCount).toBe(3);
    });
  });
});

// ============================================================================
// RuntimeQueueWaitError
// ============================================================================

describe("RuntimeQueueWaitError", () => {
  describe("constructor", () => {
    it("should_create_retryable_error", () => {
      // Arrange
      const message = "Queue wait timeout";

      // Act
      const error = new RuntimeQueueWaitError(message);

      // Assert
      expect(error.code).toBe("RUNTIME_QUEUE_WAIT");
      expect(error.retryable).toBe(true);
    });

    it("should_create_with_wait_time_options", () => {
      // Arrange
      const message = "Wait exceeded";

      // Act
      const error = new RuntimeQueueWaitError(message, {
        waitTimeMs: 5000,
        maxWaitMs: 3000,
      });

      // Assert
      expect(error.waitTimeMs).toBe(5000);
      expect(error.maxWaitMs).toBe(3000);
    });
  });
});

// ============================================================================
// SchemaValidationError
// ============================================================================

describe("SchemaValidationError", () => {
  describe("constructor", () => {
    it("should_create_with_violations", () => {
      // Arrange
      const violations = ["Missing field: name", "Invalid type for age"];

      // Act
      const error = new SchemaValidationError("Validation failed", { violations });

      // Assert
      expect(error.violations).toEqual(violations);
      expect(error.code).toBe("SCHEMA_VIOLATION");
      expect(error.retryable).toBe(true);
    });

    it("should_default_to_empty_violations", () => {
      // Arrange & Act
      const error = new SchemaValidationError("Validation failed");

      // Assert
      expect(error.violations).toEqual([]);
    });

    it("should_create_with_field_option", () => {
      // Arrange & Act
      const error = new SchemaValidationError("Invalid field", { field: "summary" });

      // Assert
      expect(error.field).toBe("summary");
    });
  });

  describe("toJSON", () => {
    it("should_include_violations_and_field", () => {
      // Arrange
      const error = new SchemaValidationError("Test", {
        violations: ["Error 1"],
        field: "name",
      });

      // Act
      const json = error.toJSON();

      // Assert
      expect(json.violations).toEqual(["Error 1"]);
      expect(json.field).toBe("name");
    });
  });
});

// ============================================================================
// ValidationError
// ============================================================================

describe("ValidationError", () => {
  describe("constructor", () => {
    it("should_create_non_retryable_error", () => {
      // Arrange & Act
      const error = new ValidationError("Invalid input");

      // Assert
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.retryable).toBe(false);
    });

    it("should_create_with_field_expected_actual", () => {
      // Arrange & Act
      const error = new ValidationError("Type mismatch", {
        field: "count",
        expected: "number",
        actual: "string",
      });

      // Assert
      expect(error.field).toBe("count");
      expect(error.expected).toBe("number");
      expect(error.actual).toBe("string");
    });
  });
});

// ============================================================================
// TimeoutError
// ============================================================================

describe("TimeoutError", () => {
  describe("constructor", () => {
    it("should_create_retryable_error", () => {
      // Arrange & Act
      const error = new TimeoutError("Operation timed out");

      // Assert
      expect(error.code).toBe("TIMEOUT_ERROR");
      expect(error.retryable).toBe(true);
    });

    it("should_create_with_timeoutMs", () => {
      // Arrange & Act
      const error = new TimeoutError("Timeout", { timeoutMs: 30000 });

      // Assert
      expect(error.timeoutMs).toBe(30000);
    });
  });
});

// ============================================================================
// CancelledError
// ============================================================================

describe("CancelledError", () => {
  describe("constructor", () => {
    it("should_create_non_retryable_error", () => {
      // Arrange & Act
      const error = new CancelledError("Operation cancelled");

      // Assert
      expect(error.code).toBe("CANCELLED_ERROR");
      expect(error.retryable).toBe(false);
    });

    it("should_create_with_reason", () => {
      // Arrange & Act
      const error = new CancelledError("Cancelled", { reason: "User aborted" });

      // Assert
      expect(error.reason).toBe("User aborted");
    });
  });
});

// ============================================================================
// RateLimitError
// ============================================================================

describe("RateLimitError", () => {
  describe("constructor", () => {
    it("should_create_retryable_error", () => {
      // Arrange & Act
      const error = new RateLimitError("Rate limit exceeded");

      // Assert
      expect(error.code).toBe("RATE_LIMIT_ERROR");
      expect(error.retryable).toBe(true);
    });

    it("should_create_with_retryAfterMs", () => {
      // Arrange & Act
      const error = new RateLimitError("Rate limited", { retryAfterMs: 60000 });

      // Assert
      expect(error.retryAfterMs).toBe(60000);
    });
  });
});

// ============================================================================
// CapacityError
// ============================================================================

describe("CapacityError", () => {
  describe("constructor", () => {
    it("should_create_non_retryable_error", () => {
      // Arrange & Act
      const error = new CapacityError("Capacity exceeded");

      // Assert
      expect(error.code).toBe("CAPACITY_ERROR");
      expect(error.retryable).toBe(false);
    });

    it("should_create_with_resource", () => {
      // Arrange & Act
      const error = new CapacityError("Full", { resource: "memory" });

      // Assert
      expect(error.resource).toBe("memory");
    });
  });
});

// ============================================================================
// ParsingError
// ============================================================================

describe("ParsingError", () => {
  describe("constructor", () => {
    it("should_create_retryable_error", () => {
      // Arrange & Act
      const error = new ParsingError("Parse failed");

      // Assert
      expect(error.code).toBe("PARSING_ERROR");
      expect(error.retryable).toBe(true);
    });

    it("should_create_with_content_and_position", () => {
      // Arrange
      const content = '{"invalid": json}';

      // Act
      const error = new ParsingError("JSON parse error", { content, position: 12 });

      // Assert
      expect(error.content).toBe(content);
      expect(error.position).toBe(12);
    });
  });

  describe("toJSON", () => {
    it("should_truncate_long_content", () => {
      // Arrange
      const longContent = "a".repeat(200);
      const error = new ParsingError("Parse error", { content: longContent });

      // Act
      const json = error.toJSON();

      // Assert
      expect(json.content).toBe(`${"a".repeat(100)}...`);
    });
  });
});

// ============================================================================
// ExecutionError
// ============================================================================

describe("ExecutionError", () => {
  describe("constructor", () => {
    it("should_create_with_default_severity", () => {
      // Arrange & Act
      const error = new ExecutionError("Execution failed");

      // Assert
      expect(error.severity).toBe("medium");
    });

    it("should_create_with_custom_severity", () => {
      // Arrange
      const severity: ErrorSeverity = "critical";

      // Act
      const error = new ExecutionError("Critical failure", { severity });

      // Assert
      expect(error.severity).toBe("critical");
    });

    it("should_create_with_context", () => {
      // Arrange
      const context: ErrorContext = {
        operation: "fetch",
        component: "api-client",
        metadata: { url: "/api/data" },
      };

      // Act
      const error = new ExecutionError("Fetch failed", { context });

      // Assert
      expect(error.context).toEqual(context);
    });
  });
});

// ============================================================================
// ConfigurationError
// ============================================================================

describe("ConfigurationError", () => {
  describe("constructor", () => {
    it("should_create_non_retryable_error", () => {
      // Arrange & Act
      const error = new ConfigurationError("Invalid config");

      // Assert
      expect(error.retryable).toBe(false);
    });

    it("should_create_with_key_and_expected", () => {
      // Arrange & Act
      const error = new ConfigurationError("Config error", {
        key: "maxRetries",
        expected: "positive integer",
      });

      // Assert
      expect(error.key).toBe("maxRetries");
      expect(error.expected).toBe("positive integer");
    });
  });
});

// ============================================================================
// StorageError
// ============================================================================

describe("StorageError", () => {
  describe("constructor", () => {
    it("should_create_retryable_error", () => {
      // Arrange & Act
      const error = new StorageError("Storage failed");

      // Assert
      expect(error.retryable).toBe(true);
    });

    it("should_create_with_path_and_operation", () => {
      // Arrange & Act
      const error = new StorageError("Write failed", {
        path: "/data/file.json",
        operation: "write",
      });

      // Assert
      expect(error.path).toBe("/data/file.json");
      expect(error.operation).toBe("write");
    });

    it("should_accept_all_operation_types", () => {
      // Arrange & Act & Assert
      const operations: Array<"read" | "write" | "delete" | "lock"> = ["read", "write", "delete", "lock"];
      
      for (const op of operations) {
        const error = new StorageError("Test", { operation: op });
        expect(error.operation).toBe(op);
      }
    });
  });
});

// ============================================================================
// ユーティリティ関数
// ============================================================================

describe("isPiError", () => {
  it("should_return_true_for_PiError_instance", () => {
    // Arrange
    const error = new PiError("Test");

    // Act & Assert
    expect(isPiError(error)).toBe(true);
  });

  it("should_return_true_for_derived_error_instance", () => {
    // Arrange
    const error = new TimeoutError("Timeout");

    // Act & Assert
    expect(isPiError(error)).toBe(true);
  });

  it("should_return_false_for_standard_Error", () => {
    // Arrange
    const error = new Error("Standard error");

    // Act & Assert
    expect(isPiError(error)).toBe(false);
  });

  it("should_return_false_for_non_error_values", () => {
    // Arrange & Act & Assert
    expect(isPiError(null)).toBe(false);
    expect(isPiError(undefined)).toBe(false);
    expect(isPiError("error")).toBe(false);
    expect(isPiError(123)).toBe(false);
    expect(isPiError({})).toBe(false);
  });
});

describe("hasErrorCode", () => {
  it("should_return_true_when_error_has_matching_code", () => {
    // Arrange
    const error = new PiError("Test", "TIMEOUT_ERROR");

    // Act & Assert
    expect(hasErrorCode(error, "TIMEOUT_ERROR")).toBe(true);
  });

  it("should_return_false_when_codes_differ", () => {
    // Arrange
    const error = new PiError("Test", "TIMEOUT_ERROR");

    // Act & Assert
    expect(hasErrorCode(error, "RATE_LIMIT_ERROR")).toBe(false);
  });

  it("should_return_false_for_non_PiError", () => {
    // Arrange
    const error = new Error("Standard error");

    // Act & Assert
    expect(hasErrorCode(error, "UNKNOWN_ERROR")).toBe(false);
  });

  it("should_return_false_for_unknown_values", () => {
    // Arrange & Act & Assert
    expect(hasErrorCode(null, "UNKNOWN_ERROR")).toBe(false);
    expect(hasErrorCode(undefined, "UNKNOWN_ERROR")).toBe(false);
    expect(hasErrorCode("error", "UNKNOWN_ERROR")).toBe(false);
  });
});

describe("isRetryableError", () => {
  it("should_return_true_for_retryable_error", () => {
    // Arrange
    const error = new PiError("Test", "TIMEOUT_ERROR", { retryable: true });

    // Act & Assert
    expect(isRetryableError(error)).toBe(true);
  });

  it("should_return_false_for_non_retryable_error", () => {
    // Arrange
    const error = new PiError("Test", "UNKNOWN_ERROR", { retryable: false });

    // Act & Assert
    expect(isRetryableError(error)).toBe(false);
  });

  it("should_return_false_for_non_PiError", () => {
    // Arrange
    const error = new Error("Standard error");

    // Act & Assert
    expect(isRetryableError(error)).toBe(false);
  });
});

describe("toPiError", () => {
  it("should_return_same_instance_for_PiError", () => {
    // Arrange
    const original = new PiError("Test", "TIMEOUT_ERROR");

    // Act
    const result = toPiError(original);

    // Assert
    expect(result).toBe(original);
  });

  it("should_convert_standard_Error_to_PiError", () => {
    // Arrange
    const original = new Error("Standard error");

    // Act
    const result = toPiError(original);

    // Assert
    expect(result).toBeInstanceOf(PiError);
    expect(result.message).toBe("Standard error");
    expect(result.code).toBe("UNKNOWN_ERROR");
    expect(result.cause).toBe(original);
  });

  it("should_convert_string_to_PiError", () => {
    // Arrange
    const original = "Error string";

    // Act
    const result = toPiError(original);

    // Assert
    expect(result).toBeInstanceOf(PiError);
    expect(result.message).toBe("Error string");
    expect(result.code).toBe("UNKNOWN_ERROR");
    expect(result.cause).toBeUndefined();
  });

  it("should_convert_null_to_PiError", () => {
    // Arrange & Act
    const result = toPiError(null);

    // Assert
    expect(result).toBeInstanceOf(PiError);
    expect(result.message).toBe("null");
    expect(result.code).toBe("UNKNOWN_ERROR");
  });

  it("should_convert_undefined_to_PiError", () => {
    // Arrange & Act
    const result = toPiError(undefined);

    // Assert
    expect(result).toBeInstanceOf(PiError);
    expect(result.message).toBe("undefined");
  });
});

describe("getErrorCode", () => {
  it("should_return_code_for_PiError", () => {
    // Arrange
    const error = new PiError("Test", "RATE_LIMIT_ERROR");

    // Act & Assert
    expect(getErrorCode(error)).toBe("RATE_LIMIT_ERROR");
  });

  it("should_return_UNKNOWN_ERROR_for_non_PiError", () => {
    // Arrange
    const error = new Error("Standard error");

    // Act & Assert
    expect(getErrorCode(error)).toBe("UNKNOWN_ERROR");
  });

  it("should_return_UNKNOWN_ERROR_for_unknown_values", () => {
    // Arrange & Act & Assert
    expect(getErrorCode(null)).toBe("UNKNOWN_ERROR");
    expect(getErrorCode(undefined)).toBe("UNKNOWN_ERROR");
    expect(getErrorCode("error")).toBe("UNKNOWN_ERROR");
  });
});

describe("isRetryableErrorCode", () => {
  it("should_return_true_for_retryable_codes", () => {
    // Arrange
    const retryableCodes: PiErrorCode[] = [
      "TIMEOUT_ERROR",
      "RATE_LIMIT_ERROR",
      "SCHEMA_VIOLATION",
      "PARSING_ERROR",
      "RUNTIME_QUEUE_WAIT",
    ];

    // Act & Assert
    for (const code of retryableCodes) {
      expect(isRetryableErrorCode(code)).toBe(true);
    }
  });

  it("should_return_false_for_non_retryable_codes", () => {
    // Arrange
    const nonRetryableCodes: PiErrorCode[] = [
      "UNKNOWN_ERROR",
      "RUNTIME_LIMIT_REACHED",
      "VALIDATION_ERROR",
      "CANCELLED_ERROR",
      "CAPACITY_ERROR",
    ];

    // Act & Assert
    for (const code of nonRetryableCodes) {
      expect(isRetryableErrorCode(code)).toBe(false);
    }
  });
});

// ============================================================================
// プロパティベーステスト (Property-Based Tests)
// ============================================================================

/**
 * PiErrorCodeのArbitrary
 */
const arbPiErrorCode: fc.Arbitrary<PiErrorCode> = fc.constantFrom(
  "UNKNOWN_ERROR",
  "RUNTIME_LIMIT_REACHED",
  "RUNTIME_QUEUE_WAIT",
  "SCHEMA_VIOLATION",
  "VALIDATION_ERROR",
  "TIMEOUT_ERROR",
  "CANCELLED_ERROR",
  "RATE_LIMIT_ERROR",
  "CAPACITY_ERROR",
  "PARSING_ERROR"
);

/**
 * ErrorSeverityのArbitrary
 */
const arbErrorSeverity: fc.Arbitrary<ErrorSeverity> = fc.constantFrom(
  "low",
  "medium",
  "high",
  "critical"
);

describe("プロパティベーステスト: PiError", () => {
  describe("不変条件", () => {
    // 不変条件: timestampは常に正の数
    it("PBT: timestampは常に正の数", () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 100 }), arbPiErrorCode, (message, code) => {
          // Act
          const error = new PiError(message, code);

          // Assert
          expect(error.timestamp).toBeGreaterThan(0);
          expect(Number.isFinite(error.timestamp)).toBe(true);
        })
      );
    });

    // 不変条件: codeは常に有効なPiErrorCode
    it("PBT: codeは常に有効なPiErrorCode", () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 100 }), arbPiErrorCode, (message, code) => {
          // Act
          const error = new PiError(message, code);

          // Assert
          const validCodes: PiErrorCode[] = [
            "UNKNOWN_ERROR",
            "RUNTIME_LIMIT_REACHED",
            "RUNTIME_QUEUE_WAIT",
            "SCHEMA_VIOLATION",
            "VALIDATION_ERROR",
            "TIMEOUT_ERROR",
            "CANCELLED_ERROR",
            "RATE_LIMIT_ERROR",
            "CAPACITY_ERROR",
            "PARSING_ERROR",
          ];
          expect(validCodes).toContain(error.code);
        })
      );
    });

    // 不変条件: retryableは常にboolean
    it("PBT: retryableは常にboolean", () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 100 }),
          arbPiErrorCode,
          fc.option(fc.boolean(), { nil: undefined }),
          (message, code, retryable) => {
            // Act
            const error = new PiError(message, code, { retryable });

            // Assert
            expect(typeof error.retryable).toBe("boolean");
          }
        )
      );
    });

    // 不変条件: nameは常に"PiError"
    it("PBT: nameは常にPiError", () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 100 }), arbPiErrorCode, (message, code) => {
          // Act
          const error = new PiError(message, code);

          // Assert
          expect(error.name).toBe("PiError");
        })
      );
    });
  });

  describe("toJSON可逆性", () => {
    // 可逆性: toJSONの結果は必須フィールドを含む
    it("PBT: toJSONは必須フィールドを含む", () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 100 }), arbPiErrorCode, (message, code) => {
          // Act
          const error = new PiError(message, code, { retryable: true });
          const json = error.toJSON();

          // Assert
          expect(json).toHaveProperty("name");
          expect(json).toHaveProperty("message");
          expect(json).toHaveProperty("code");
          expect(json).toHaveProperty("retryable");
          expect(json).toHaveProperty("timestamp");
        })
      );
    });

    // 可逆性: toJSONのmessageは元と同じ
    it("PBT: toJSONのmessageは元と同じ", () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 100 }), arbPiErrorCode, (message, code) => {
          // Act
          const error = new PiError(message, code);
          const json = error.toJSON();

          // Assert
          expect(json.message).toBe(message);
        })
      );
    });
  });

  describe("is()メソッド", () => {
    // 決定性: 同じ入力で同じ結果
    it("PBT: is()は決定的", () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 100 }),
          arbPiErrorCode,
          arbPiErrorCode,
          (message, code, testCode) => {
            // Act
            const error = new PiError(message, code);
            const result1 = error.is(testCode);
            const result2 = error.is(testCode);

            // Assert
            expect(result1).toBe(result2);
            // コードが一致する場合のみtrue
            expect(result1).toBe(code === testCode);
          }
        )
      );
    });
  });
});

describe("プロパティベーステスト: 型ガード関数", () => {
  // isPiError: PiErrorインスタンスは常にtrue
  it("PBT: isPiErrorはPiErrorに対して常にtrue", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 100 }), arbPiErrorCode, (message, code) => {
        // Act
        const error = new PiError(message, code);

        // Assert
        expect(isPiError(error)).toBe(true);
      })
    );
  });

  // isPiError: 非PiError値は常にfalse
  it("PBT: isPiErrorは非PiErrorに対して常にfalse", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined)),
        (value) => {
          // Act & Assert
          expect(isPiError(value)).toBe(false);
        }
      )
    );
  });

  // hasErrorCode: 正確なコード判定
  it("PBT: hasErrorCodeは正確に判定する", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 100 }), arbPiErrorCode, arbPiErrorCode, (message, code, testCode) => {
        // Act
        const error = new PiError(message, code);
        const result = hasErrorCode(error, testCode);

        // Assert
        expect(result).toBe(code === testCode);
      })
    );
  });
});

describe("プロパティベーステスト: toPiError", () => {
  // 不変条件: 常にPiErrorを返す
  it("PBT: toPiErrorは常にPiErrorを返す", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.constant(undefined),
          fc.object() // オブジェクト（ErrorのようにtoStringできるもの）
        ),
        (value) => {
          // Act
          const result = toPiError(value);

          // Assert
          expect(result).toBeInstanceOf(PiError);
          expect(result.code).toBe("UNKNOWN_ERROR");
        }
      )
    );
  });

  // 決定性: 同じ入力で同じmessage
  it("PBT: toPiErrorは決定的", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 100 }), (message) => {
        // Act
        const error1 = toPiError(new Error(message));
        const error2 = toPiError(new Error(message));

        // Assert
        expect(error1.message).toBe(error2.message);
      })
    );
  });
});

describe("プロパティベーステスト: 派生エラークラス", () => {
  // RuntimeLimitError: 常にretryable=false
  it("PBT: RuntimeLimitErrorは常に非リトライ可能", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 100 }),
        fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
        fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
        (message, currentCount, maxCount) => {
          // Act
          const error = new RuntimeLimitError(message, { currentCount, maxCount });

          // Assert
          expect(error.retryable).toBe(false);
          expect(error.code).toBe("RUNTIME_LIMIT_REACHED");
        }
      )
    );
  });

  // TimeoutError: 常にretryable=true
  it("PBT: TimeoutErrorは常にリトライ可能", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 100 }),
        fc.option(fc.integer({ min: 0, max: 60000 }), { nil: undefined }),
        (message, timeoutMs) => {
          // Act
          const error = new TimeoutError(message, { timeoutMs });

          // Assert
          expect(error.retryable).toBe(true);
          expect(error.code).toBe("TIMEOUT_ERROR");
        }
      )
    );
  });

  // SchemaValidationError: 常にretryable=true
  it("PBT: SchemaValidationErrorは常にリトライ可能", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 100 }),
        fc.option(fc.array(fc.string({ maxLength: 50 })), { nil: undefined }),
        fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
        (message, violations, field) => {
          // Act
          const error = new SchemaValidationError(message, { violations, field });

          // Assert
          expect(error.retryable).toBe(true);
          expect(error.code).toBe("SCHEMA_VIOLATION");
        }
      )
    );
  });

  // ExecutionError: severityは常に有効
  it("PBT: ExecutionErrorのseverityは常に有効", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 100 }),
        fc.option(arbErrorSeverity, { nil: undefined }),
        (message, severity) => {
          // Act
          const error = new ExecutionError(message, { severity });

          // Assert
          const validSeverities: ErrorSeverity[] = ["low", "medium", "high", "critical"];
          expect(validSeverities).toContain(error.severity);
        }
      )
    );
  });
});

describe("プロパティベーステスト: isRetryableErrorCode", () => {
  // 決定性: 同じ入力で同じ結果
  it("PBT: isRetryableErrorCodeは決定的", () => {
    fc.assert(
      fc.property(arbPiErrorCode, (code) => {
        // Act
        const result1 = isRetryableErrorCode(code);
        const result2 = isRetryableErrorCode(code);

        // Assert
        expect(result1).toBe(result2);
      })
    );
  });

  // 分類の一貫性
  it("PBT: リトライ可能コードと不可能コードの分類は一貫", () => {
    const retryableCodes: PiErrorCode[] = [
      "TIMEOUT_ERROR",
      "RATE_LIMIT_ERROR",
      "SCHEMA_VIOLATION",
      "PARSING_ERROR",
      "RUNTIME_QUEUE_WAIT",
    ];

    fc.assert(
      fc.property(arbPiErrorCode, (code) => {
        // Act
        const result = isRetryableErrorCode(code);

        // Assert
        expect(result).toBe(retryableCodes.includes(code));
      })
    );
  });
});
