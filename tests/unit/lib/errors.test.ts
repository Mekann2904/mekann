/**
 * Unit tests for lib/errors.ts
 * Tests all error classes and utility functions.
 */

import { describe, it, expect, beforeEach } from "vitest";
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
} from "../../../.pi/lib/errors.js";

// ============================================================================
// PiError Base Class Tests
// ============================================================================

describe("PiError", () => {
  it("should create error with default values", () => {
    const error = new PiError("Test error");
    
    expect(error.message).toBe("Test error");
    expect(error.name).toBe("PiError");
    expect(error.code).toBe("UNKNOWN_ERROR");
    expect(error.retryable).toBe(false);
    expect(error.cause).toBeUndefined();
    expect(error.timestamp).toBeGreaterThan(0);
  });

  it("should create error with custom code", () => {
    const error = new PiError("Test error", "VALIDATION_ERROR");
    
    expect(error.code).toBe("VALIDATION_ERROR");
  });

  it("should create error with options", () => {
    const cause = new Error("Original error");
    const error = new PiError("Test error", "TIMEOUT_ERROR", {
      retryable: true,
      cause,
    });
    
    expect(error.code).toBe("TIMEOUT_ERROR");
    expect(error.retryable).toBe(true);
    expect(error.cause).toBe(cause);
  });

  it("should check error code with is() method", () => {
    const error = new PiError("Test", "VALIDATION_ERROR");
    
    expect(error.is("VALIDATION_ERROR")).toBe(true);
    expect(error.is("UNKNOWN_ERROR")).toBe(false);
  });

  it("should serialize to JSON correctly", () => {
    const cause = new Error("Cause");
    const error = new PiError("Test error", "TIMEOUT_ERROR", {
      retryable: true,
      cause,
    });
    
    const json = error.toJSON();
    
    expect(json.name).toBe("PiError");
    expect(json.message).toBe("Test error");
    expect(json.code).toBe("TIMEOUT_ERROR");
    expect(json.retryable).toBe(true);
    expect(json.cause).toBe("Cause");
    expect(json.timestamp).toBeGreaterThan(0);
    expect(json.stack).toBeDefined();
  });

  it("should maintain proper prototype chain", () => {
    const error = new PiError("Test");
    
    expect(error instanceof PiError).toBe(true);
    expect(error instanceof Error).toBe(true);
  });
});

// ============================================================================
// RuntimeLimitError Tests
// ============================================================================

describe("RuntimeLimitError", () => {
  it("should create error with runtime limit details", () => {
    const error = new RuntimeLimitError("Max runtimes reached", {
      currentCount: 10,
      maxCount: 10,
    });
    
    expect(error.name).toBe("RuntimeLimitError");
    expect(error.code).toBe("RUNTIME_LIMIT_REACHED");
    expect(error.retryable).toBe(false);
    expect(error.currentCount).toBe(10);
    expect(error.maxCount).toBe(10);
  });

  it("should include runtime details in JSON", () => {
    const error = new RuntimeLimitError("Max reached", {
      currentCount: 5,
      maxCount: 5,
    });
    
    const json = error.toJSON();
    
    expect(json.currentCount).toBe(5);
    expect(json.maxCount).toBe(5);
  });
});

// ============================================================================
// RuntimeQueueWaitError Tests
// ============================================================================

describe("RuntimeQueueWaitError", () => {
  it("should create retryable queue wait error", () => {
    const error = new RuntimeQueueWaitError("Queue wait timeout", {
      waitTimeMs: 5000,
      maxWaitMs: 30000,
    });
    
    expect(error.name).toBe("RuntimeQueueWaitError");
    expect(error.code).toBe("RUNTIME_QUEUE_WAIT");
    expect(error.retryable).toBe(true);
    expect(error.waitTimeMs).toBe(5000);
    expect(error.maxWaitMs).toBe(30000);
  });
});

// ============================================================================
// SchemaValidationError Tests
// ============================================================================

describe("SchemaValidationError", () => {
  it("should create error with violations", () => {
    const error = new SchemaValidationError("Invalid output", {
      violations: ["Missing field: summary", "Invalid type for count"],
      field: "summary",
    });
    
    expect(error.name).toBe("SchemaValidationError");
    expect(error.code).toBe("SCHEMA_VIOLATION");
    expect(error.retryable).toBe(true);
    expect(error.violations).toHaveLength(2);
    expect(error.field).toBe("summary");
  });

  it("should default to empty violations array", () => {
    const error = new SchemaValidationError("Invalid");
    
    expect(error.violations).toEqual([]);
  });

  it("should include violations in JSON", () => {
    const error = new SchemaValidationError("Invalid", {
      violations: ["Error 1", "Error 2"],
    });
    
    const json = error.toJSON();
    
    expect(json.violations).toEqual(["Error 1", "Error 2"]);
  });
});

// ============================================================================
// ValidationError Tests
// ============================================================================

describe("ValidationError", () => {
  it("should create non-retryable validation error", () => {
    const error = new ValidationError("Invalid input", {
      field: "name",
      expected: "string",
      actual: "number",
    });
    
    expect(error.name).toBe("ValidationError");
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.retryable).toBe(false);
    expect(error.field).toBe("name");
    expect(error.expected).toBe("string");
    expect(error.actual).toBe("number");
  });
});

// ============================================================================
// TimeoutError Tests
// ============================================================================

describe("TimeoutError", () => {
  it("should create retryable timeout error", () => {
    const error = new TimeoutError("Operation timed out", {
      timeoutMs: 30000,
    });
    
    expect(error.name).toBe("TimeoutError");
    expect(error.code).toBe("TIMEOUT_ERROR");
    expect(error.retryable).toBe(true);
    expect(error.timeoutMs).toBe(30000);
  });
});

// ============================================================================
// CancelledError Tests
// ============================================================================

describe("CancelledError", () => {
  it("should create non-retryable cancelled error", () => {
    const error = new CancelledError("User cancelled", {
      reason: "User requested cancellation",
    });
    
    expect(error.name).toBe("CancelledError");
    expect(error.code).toBe("CANCELLED_ERROR");
    expect(error.retryable).toBe(false);
    expect(error.reason).toBe("User requested cancellation");
  });
});

// ============================================================================
// RateLimitError Tests
// ============================================================================

describe("RateLimitError", () => {
  it("should create retryable rate limit error", () => {
    const error = new RateLimitError("Rate limit exceeded", {
      retryAfterMs: 60000,
    });
    
    expect(error.name).toBe("RateLimitError");
    expect(error.code).toBe("RATE_LIMIT_ERROR");
    expect(error.retryable).toBe(true);
    expect(error.retryAfterMs).toBe(60000);
  });
});

// ============================================================================
// CapacityError Tests
// ============================================================================

describe("CapacityError", () => {
  it("should create non-retryable capacity error", () => {
    const error = new CapacityError("System at capacity", {
      resource: "memory",
    });
    
    expect(error.name).toBe("CapacityError");
    expect(error.code).toBe("CAPACITY_ERROR");
    expect(error.retryable).toBe(false);
    expect(error.resource).toBe("memory");
  });
});

// ============================================================================
// ParsingError Tests
// ============================================================================

describe("ParsingError", () => {
  it("should create retryable parsing error", () => {
    const error = new ParsingError("Failed to parse JSON", {
      content: '{"invalid": }',
      position: 12,
    });
    
    expect(error.name).toBe("ParsingError");
    expect(error.code).toBe("PARSING_ERROR");
    expect(error.retryable).toBe(true);
    expect(error.content).toBe('{"invalid": }');
    expect(error.position).toBe(12);
  });

  it("should truncate content in JSON serialization", () => {
    const longContent = "x".repeat(200);
    const error = new ParsingError("Parse error", {
      content: longContent,
    });
    
    const json = error.toJSON();
    
    expect(json.content).toBe("x".repeat(100) + "...");
  });

  it("should handle undefined content in JSON", () => {
    const error = new ParsingError("Parse error");
    
    const json = error.toJSON();
    
    expect(json.content).toBeUndefined();
  });
});

// ============================================================================
// ExecutionError Tests
// ============================================================================

describe("ExecutionError", () => {
  it("should create execution error with context", () => {
    const context: ErrorContext = {
      operation: "subagent_run",
      component: "subagent-manager",
      metadata: { agentId: "test-123" },
    };
    
    const error = new ExecutionError("Execution failed", {
      severity: "high",
      context,
    });
    
    expect(error.name).toBe("ExecutionError");
    expect(error.severity).toBe("high");
    expect(error.context).toEqual(context);
  });

  it("should default to medium severity", () => {
    const error = new ExecutionError("Failed");
    
    expect(error.severity).toBe("medium");
  });

  it("should be retryable by default", () => {
    const error = new ExecutionError("Failed");
    
    expect(error.retryable).toBe(true);
  });
});

// ============================================================================
// ConfigurationError Tests
// ============================================================================

describe("ConfigurationError", () => {
  it("should create configuration error with key", () => {
    const error = new ConfigurationError("Missing config", {
      key: "API_KEY",
      expected: "non-empty string",
    });
    
    expect(error.name).toBe("ConfigurationError");
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.retryable).toBe(false);
    expect(error.key).toBe("API_KEY");
    expect(error.expected).toBe("non-empty string");
  });
});

// ============================================================================
// StorageError Tests
// ============================================================================

describe("StorageError", () => {
  it("should create storage error with path and operation", () => {
    const error = new StorageError("Write failed", {
      path: "/data/checkpoint.json",
      operation: "write",
    });
    
    expect(error.name).toBe("StorageError");
    expect(error.path).toBe("/data/checkpoint.json");
    expect(error.operation).toBe("write");
    expect(error.retryable).toBe(true);
  });

  it("should support all operation types", () => {
    const operations: Array<"read" | "write" | "delete" | "lock"> = [
      "read",
      "write",
      "delete",
      "lock",
    ];
    
    operations.forEach((op) => {
      const error = new StorageError(`Failed ${op}`, { operation: op });
      expect(error.operation).toBe(op);
    });
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe("isPiError", () => {
  it("should return true for PiError instances", () => {
    expect(isPiError(new PiError("Test"))).toBe(true);
    expect(isPiError(new ValidationError("Test"))).toBe(true);
    expect(isPiError(new TimeoutError("Test"))).toBe(true);
  });

  it("should return false for non-PiError errors", () => {
    expect(isPiError(new Error("Test"))).toBe(false);
    expect(isPiError("string")).toBe(false);
    expect(isPiError(null)).toBe(false);
    expect(isPiError(undefined)).toBe(false);
  });
});

describe("hasErrorCode", () => {
  it("should return true when error has matching code", () => {
    expect(hasErrorCode(new ValidationError("Test"), "VALIDATION_ERROR")).toBe(
      true
    );
    expect(hasErrorCode(new TimeoutError("Test"), "TIMEOUT_ERROR")).toBe(true);
  });

  it("should return false for non-matching code", () => {
    expect(hasErrorCode(new ValidationError("Test"), "TIMEOUT_ERROR")).toBe(
      false
    );
  });

  it("should return false for non-PiError", () => {
    expect(hasErrorCode(new Error("Test"), "UNKNOWN_ERROR")).toBe(false);
  });
});

describe("isRetryableError", () => {
  it("should return true for retryable PiErrors", () => {
    expect(isRetryableError(new TimeoutError("Test"))).toBe(true);
    expect(isRetryableError(new RateLimitError("Test"))).toBe(true);
    expect(isRetryableError(new ParsingError("Test"))).toBe(true);
  });

  it("should return false for non-retryable PiErrors", () => {
    expect(isRetryableError(new ValidationError("Test"))).toBe(false);
    expect(isRetryableError(new CancelledError("Test"))).toBe(false);
  });

  it("should return false for non-PiError", () => {
    expect(isRetryableError(new Error("Test"))).toBe(false);
  });
});

describe("toPiError", () => {
  it("should return same PiError if already PiError", () => {
    const original = new ValidationError("Test");
    const converted = toPiError(original);
    
    expect(converted).toBe(original);
  });

  it("should wrap Error in PiError", () => {
    const original = new Error("Original error");
    const converted = toPiError(original);
    
    expect(converted instanceof PiError).toBe(true);
    expect(converted.message).toBe("Original error");
    expect(converted.cause).toBe(original);
  });

  it("should wrap non-Error in PiError with string message", () => {
    const converted = toPiError("string error");
    
    expect(converted instanceof PiError).toBe(true);
    expect(converted.message).toBe("string error");
    expect(converted.cause).toBeUndefined();
  });

  it("should handle null and undefined", () => {
    expect(toPiError(null).message).toBe("null");
    expect(toPiError(undefined).message).toBe("undefined");
  });
});

describe("getErrorCode", () => {
  it("should return code from PiError", () => {
    expect(getErrorCode(new ValidationError("Test"))).toBe("VALIDATION_ERROR");
    expect(getErrorCode(new TimeoutError("Test"))).toBe("TIMEOUT_ERROR");
  });

  it("should return UNKNOWN_ERROR for non-PiError", () => {
    expect(getErrorCode(new Error("Test"))).toBe("UNKNOWN_ERROR");
    expect(getErrorCode("string")).toBe("UNKNOWN_ERROR");
  });
});

describe("isRetryableErrorCode", () => {
  it("should return true for retryable codes", () => {
    const retryableCodes: PiErrorCode[] = [
      "TIMEOUT_ERROR",
      "RATE_LIMIT_ERROR",
      "SCHEMA_VIOLATION",
      "PARSING_ERROR",
      "RUNTIME_QUEUE_WAIT",
    ];
    
    retryableCodes.forEach((code) => {
      expect(isRetryableErrorCode(code)).toBe(true);
    });
  });

  it("should return false for non-retryable codes", () => {
    const nonRetryableCodes: PiErrorCode[] = [
      "UNKNOWN_ERROR",
      "RUNTIME_LIMIT_REACHED",
      "VALIDATION_ERROR",
      "CANCELLED_ERROR",
      "CAPACITY_ERROR",
    ];
    
    nonRetryableCodes.forEach((code) => {
      expect(isRetryableErrorCode(code)).toBe(false);
    });
  });
});

// ============================================================================
// Error Inheritance Tests
// ============================================================================

describe("Error Inheritance", () => {
  it("all error classes should extend PiError", () => {
    const errors = [
      new RuntimeLimitError("Test"),
      new RuntimeQueueWaitError("Test"),
      new SchemaValidationError("Test"),
      new ValidationError("Test"),
      new TimeoutError("Test"),
      new CancelledError("Test"),
      new RateLimitError("Test"),
      new CapacityError("Test"),
      new ParsingError("Test"),
      new ExecutionError("Test"),
      new ConfigurationError("Test"),
      new StorageError("Test"),
    ];
    
    errors.forEach((error) => {
      expect(error instanceof PiError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });
});
