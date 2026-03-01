/**
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  PiError,
  PiErrorCode,
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
  TeamDefinitionError,
  isPiError,
  hasErrorCode,
  isPiErrorRetryable,
  toPiError,
  getErrorCode,
  isRetryableErrorCode,
  createQualityError,
  createQualityErrorFromOptions,
  toQualityError,
  formatQualityError,
  isQualityError,
  isTeamDefinitionError,
  ErrorSeverity,
  QualityError,
} from "../../../lib/core/errors.js";

describe("PiError", () => {
  it("should create a basic PiError with default values", () => {
    const error = new PiError("Test error");
    expect(error.message).toBe("Test error");
    expect(error.name).toBe("PiError");
    expect(error.code).toBe("UNKNOWN_ERROR");
    expect(error.retryable).toBe(false);
    expect(error.cause).toBeUndefined();
    expect(error.timestamp).toBeGreaterThan(0);
  });

  it("should create a PiError with custom code", () => {
    const error = new PiError("Test error", "TIMEOUT_ERROR");
    expect(error.code).toBe("TIMEOUT_ERROR");
  });

  it("should create a PiError with options", () => {
    const cause = new Error("Original error");
    const error = new PiError("Test error", "RATE_LIMIT_ERROR", {
      retryable: true,
      cause,
    });
    expect(error.retryable).toBe(true);
    expect(error.cause).toBe(cause);
  });

  it("should check error code with is() method", () => {
    const error = new PiError("Test error", "TIMEOUT_ERROR");
    expect(error.is("TIMEOUT_ERROR")).toBe(true);
    expect(error.is("UNKNOWN_ERROR")).toBe(false);
  });

  it("should serialize to JSON", () => {
    const cause = new Error("Cause");
    const error = new PiError("Test error", "RATE_LIMIT_ERROR", {
      retryable: true,
      cause,
    });
    const json = error.toJSON();
    expect(json.name).toBe("PiError");
    expect(json.message).toBe("Test error");
    expect(json.code).toBe("RATE_LIMIT_ERROR");
    expect(json.retryable).toBe(true);
    expect(json.timestamp).toBeGreaterThan(0);
    expect(json.cause).toBe("Cause");
    expect(json.stack).toBeDefined();
  });

  it("should have valid stack trace", () => {
    const error = new PiError("Test error");
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain("PiError");
  });
});

describe("RuntimeLimitError", () => {
  it("should create with message only", () => {
    const error = new RuntimeLimitError("Limit reached");
    expect(error.message).toBe("Limit reached");
    expect(error.name).toBe("RuntimeLimitError");
    expect(error.code).toBe("RUNTIME_LIMIT_REACHED");
    expect(error.retryable).toBe(false);
    expect(error.currentCount).toBeUndefined();
    expect(error.maxCount).toBeUndefined();
  });

  it("should create with count options", () => {
    const error = new RuntimeLimitError("Limit reached", {
      currentCount: 5,
      maxCount: 4,
    });
    expect(error.currentCount).toBe(5);
    expect(error.maxCount).toBe(4);
  });

  it("should include counts in JSON", () => {
    const error = new RuntimeLimitError("Limit reached", {
      currentCount: 5,
      maxCount: 4,
    });
    const json = error.toJSON();
    expect(json.currentCount).toBe(5);
    expect(json.maxCount).toBe(4);
  });
});

describe("RuntimeQueueWaitError", () => {
  it("should create with wait time options", () => {
    const error = new RuntimeQueueWaitError("Queue wait", {
      waitTimeMs: 5000,
      maxWaitMs: 30000,
    });
    expect(error.code).toBe("RUNTIME_QUEUE_WAIT");
    expect(error.retryable).toBe(true);
    expect(error.waitTimeMs).toBe(5000);
    expect(error.maxWaitMs).toBe(30000);
  });
});

describe("SchemaValidationError", () => {
  it("should create with violations", () => {
    const error = new SchemaValidationError("Schema invalid", {
      violations: ["Missing field: name", "Invalid type: age"],
      field: "user",
    });
    expect(error.code).toBe("SCHEMA_VIOLATION");
    expect(error.retryable).toBe(true);
    expect(error.violations).toEqual(["Missing field: name", "Invalid type: age"]);
    expect(error.field).toBe("user");
  });

  it("should default to empty violations array", () => {
    const error = new SchemaValidationError("Schema invalid");
    expect(error.violations).toEqual([]);
  });
});

describe("ValidationError", () => {
  it("should create with field details", () => {
    const error = new ValidationError("Invalid value", {
      field: "email",
      expected: "valid email",
      actual: "not-an-email",
    });
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.retryable).toBe(false);
    expect(error.field).toBe("email");
    expect(error.expected).toBe("valid email");
    expect(error.actual).toBe("not-an-email");
  });
});

describe("TimeoutError", () => {
  it("should create with timeout value", () => {
    const error = new TimeoutError("Operation timed out", {
      timeoutMs: 30000,
    });
    expect(error.code).toBe("TIMEOUT_ERROR");
    expect(error.retryable).toBe(true);
    expect(error.timeoutMs).toBe(30000);
  });
});

describe("CancelledError", () => {
  it("should create with reason", () => {
    const error = new CancelledError("Operation cancelled", {
      reason: "User requested",
    });
    expect(error.code).toBe("CANCELLED_ERROR");
    expect(error.retryable).toBe(false);
    expect(error.reason).toBe("User requested");
  });
});

describe("RateLimitError", () => {
  it("should create with retry after", () => {
    const error = new RateLimitError("Rate limit exceeded", {
      retryAfterMs: 60000,
    });
    expect(error.code).toBe("RATE_LIMIT_ERROR");
    expect(error.retryable).toBe(true);
    expect(error.retryAfterMs).toBe(60000);
  });
});

describe("CapacityError", () => {
  it("should create with resource", () => {
    const error = new CapacityError("Capacity exceeded", {
      resource: "memory",
    });
    expect(error.code).toBe("CAPACITY_ERROR");
    expect(error.retryable).toBe(false);
    expect(error.resource).toBe("memory");
  });
});

describe("ParsingError", () => {
  it("should create with content and position", () => {
    const error = new ParsingError("Failed to parse", {
      content: "invalid json content that is very long...",
      position: 42,
    });
    expect(error.code).toBe("PARSING_ERROR");
    expect(error.retryable).toBe(true);
    expect(error.position).toBe(42);
  });

  it("should truncate content in JSON output", () => {
    const longContent = "a".repeat(200);
    const error = new ParsingError("Failed to parse", {
      content: longContent,
    });
    const json = error.toJSON();
    expect(json.content).toBe(`${longContent.slice(0, 100)}...`);
  });
});

describe("ExecutionError", () => {
  it("should create with severity and context", () => {
    const error = new ExecutionError("Execution failed", {
      severity: "high",
      context: {
        operation: "database-write",
        component: "storage",
        metadata: { attempts: 3 },
      },
    });
    expect(error.severity).toBe("high");
    expect(error.context?.operation).toBe("database-write");
    expect(error.context?.component).toBe("storage");
    expect(error.context?.metadata).toEqual({ attempts: 3 });
  });

  it("should default to medium severity", () => {
    const error = new ExecutionError("Execution failed");
    expect(error.severity).toBe("medium");
  });
});

describe("ConfigurationError", () => {
  it("should create with key and expected value", () => {
    const error = new ConfigurationError("Invalid config", {
      key: "API_KEY",
      expected: "non-empty string",
    });
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.key).toBe("API_KEY");
    expect(error.expected).toBe("non-empty string");
  });
});

describe("StorageError", () => {
  it("should create with path and operation", () => {
    const error = new StorageError("Failed to read", {
      path: "/data/storage.json",
      operation: "read",
    });
    expect(error.path).toBe("/data/storage.json");
    expect(error.operation).toBe("read");
  });

  it("should support all operation types", () => {
    const operations: Array<"read" | "write" | "delete" | "lock"> = ["read", "write", "delete", "lock"];
    for (const op of operations) {
      const error = new StorageError(`Failed to ${op}`, { operation: op });
      expect(error.operation).toBe(op);
    }
  });
});

describe("TeamDefinitionError", () => {
  it("should create with all options", () => {
    const error = new TeamDefinitionError(
      "Team definition invalid",
      "TEAM_DEFINITION_VALIDATION_ERROR",
      {
        teamId: "team-123",
        filePath: "/teams/my-team.md",
        validationDetails: [
          { field: "name", message: "Name is required" },
          { field: "members", message: "At least one member required", value: [] },
        ],
      }
    );
    expect(error.errorType).toBe("TEAM_DEFINITION_VALIDATION_ERROR");
    expect(error.teamId).toBe("team-123");
    expect(error.filePath).toBe("/teams/my-team.md");
    expect(error.validationDetails).toHaveLength(2);
  });

  it("should format human-readable message", () => {
    const error = new TeamDefinitionError(
      "Team definition invalid",
      "TEAM_DEFINITION_VALIDATION_ERROR",
      {
        teamId: "team-123",
        filePath: "/teams/my-team.md",
        validationDetails: [
          { field: "name", message: "Name is required" },
        ],
      }
    );
    const formatted = error.toFormattedMessage();
    expect(formatted).toContain("Team definition invalid");
    expect(formatted).toContain("Team ID: team-123");
    expect(formatted).toContain("File: /teams/my-team.md");
    expect(formatted).toContain("Validation errors:");
    expect(formatted).toContain("name: Name is required");
  });
});

describe("isPiError", () => {
  it("should return true for PiError instances", () => {
    const error = new PiError("Test");
    expect(isPiError(error)).toBe(true);
  });

  it("should return true for PiError subclasses", () => {
    const error = new TimeoutError("Timed out");
    expect(isPiError(error)).toBe(true);
  });

  it("should return false for Error instances", () => {
    const error = new Error("Test");
    expect(isPiError(error)).toBe(false);
  });

  it("should return false for non-errors", () => {
    expect(isPiError("error")).toBe(false);
    expect(isPiError(null)).toBe(false);
    expect(isPiError(undefined)).toBe(false);
    expect(isPiError(123)).toBe(false);
  });
});

describe("hasErrorCode", () => {
  it("should return true when code matches", () => {
    const error = new TimeoutError("Timed out");
    expect(hasErrorCode(error, "TIMEOUT_ERROR")).toBe(true);
  });

  it("should return false when code does not match", () => {
    const error = new TimeoutError("Timed out");
    expect(hasErrorCode(error, "RATE_LIMIT_ERROR")).toBe(false);
  });

  it("should return false for non-PiError", () => {
    const error = new Error("Test");
    expect(hasErrorCode(error, "TIMEOUT_ERROR")).toBe(false);
  });
});

describe("isPiErrorRetryable", () => {
  it("should return retryable value for PiError", () => {
    const retryableError = new TimeoutError("Timed out");
    const nonRetryableError = new ValidationError("Invalid");
    expect(isPiErrorRetryable(retryableError)).toBe(true);
    expect(isPiErrorRetryable(nonRetryableError)).toBe(false);
  });

  it("should return false for non-PiError", () => {
    expect(isPiErrorRetryable(new Error("Test"))).toBe(false);
    expect(isPiErrorRetryable("error")).toBe(false);
  });
});

describe("toPiError", () => {
  it("should return same PiError if already PiError", () => {
    const original = new TimeoutError("Timed out");
    const converted = toPiError(original);
    expect(converted).toBe(original);
  });

  it("should wrap Error in PiError", () => {
    const original = new Error("Test error");
    const converted = toPiError(original);
    expect(converted).toBeInstanceOf(PiError);
    expect(converted.message).toBe("Test error");
    expect(converted.cause).toBe(original);
  });

  it("should wrap string in PiError", () => {
    const converted = toPiError("String error");
    expect(converted.message).toBe("String error");
    expect(converted.code).toBe("UNKNOWN_ERROR");
  });

  it("should handle unstringifiable errors", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const converted = toPiError(circular);
    // Circular references are handled by JSON.stringify fallback to String()
    expect(typeof converted.message).toBe("string");
  });
});

describe("getErrorCode", () => {
  it("should return code for PiError", () => {
    const error = new TimeoutError("Timed out");
    expect(getErrorCode(error)).toBe("TIMEOUT_ERROR");
  });

  it("should return UNKNOWN_ERROR for non-PiError", () => {
    expect(getErrorCode(new Error("Test"))).toBe("UNKNOWN_ERROR");
    expect(getErrorCode("error")).toBe("UNKNOWN_ERROR");
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
    for (const code of retryableCodes) {
      expect(isRetryableErrorCode(code)).toBe(true);
    }
  });

  it("should return false for non-retryable codes", () => {
    const nonRetryableCodes: PiErrorCode[] = [
      "UNKNOWN_ERROR",
      "RUNTIME_LIMIT_REACHED",
      "VALIDATION_ERROR",
      "CANCELLED_ERROR",
      "CAPACITY_ERROR",
    ];
    for (const code of nonRetryableCodes) {
      expect(isRetryableErrorCode(code)).toBe(false);
    }
  });
});

describe("isTeamDefinitionError", () => {
  it("should return true for TeamDefinitionError", () => {
    const error = new TeamDefinitionError("Test", "TEAM_DEFINITION_NOT_FOUND");
    expect(isTeamDefinitionError(error)).toBe(true);
  });

  it("should return false for other errors", () => {
    expect(isTeamDefinitionError(new PiError("Test"))).toBe(false);
    expect(isTeamDefinitionError(new Error("Test"))).toBe(false);
  });
});

describe("QualityError", () => {
  describe("createQualityError", () => {
    it("should create quality error with all fields", () => {
      const error = createQualityError(
        "SUBAGENT_TIMEOUT",
        "Subagent timed out after 30s",
        { subagentId: "impl-1", timeoutMs: 30000 },
        "Increase timeoutMs parameter"
      );
      expect(error.code).toBe("SUBAGENT_TIMEOUT");
      expect(error.message).toBe("Subagent timed out after 30s");
      expect(error.context).toEqual({ subagentId: "impl-1", timeoutMs: 30000 });
      expect(error.remediation).toBe("Increase timeoutMs parameter");
      expect(error.timestamp).toBeGreaterThan(0);
    });

    it("should generate default remediation for known codes", () => {
      const knownCodes = [
        "SUBAGENT_TIMEOUT",
        "SUBAGENT_DISABLED",
        "SUBAGENT_NOT_FOUND",
        "RUNTIME_CAPACITY_EXCEEDED",
        "RATE_LIMIT_EXCEEDED",
        "VALIDATION_FAILED",
        "TEAM_MEMBER_FAILED",
        "CIRCUIT_BREAKER_OPEN",
      ];
      for (const code of knownCodes) {
        const error = createQualityError(code, "Test message");
        expect(error.remediation).not.toBe("Check the error details and adjust your request accordingly.");
      }
    });

    it("should use fallback remediation for unknown codes", () => {
      const error = createQualityError("UNKNOWN_CODE", "Test message");
      expect(error.remediation).toBe("Check the error details and adjust your request accordingly.");
    });
  });

  describe("createQualityErrorFromOptions", () => {
    it("should create from options object", () => {
      const error = createQualityErrorFromOptions({
        code: "TEST_ERROR",
        message: "Test error message",
        context: { key: "value" },
        remediation: "Fix it",
        helpUrl: "https://example.com/help",
      });
      expect(error.code).toBe("TEST_ERROR");
      expect(error.message).toBe("Test error message");
      expect(error.context).toEqual({ key: "value" });
      expect(error.remediation).toBe("Fix it");
      expect(error.helpUrl).toBe("https://example.com/help");
    });

    it("should handle missing optional fields", () => {
      const error = createQualityErrorFromOptions({
        code: "TEST_ERROR",
        message: "Test message",
      });
      expect(error.context).toEqual({});
      expect(error.remediation).toBeDefined();
      expect(error.helpUrl).toBeUndefined();
    });
  });

  describe("toQualityError", () => {
    it("should convert PiError to QualityError", () => {
      const piError = new TimeoutError("Timed out", { timeoutMs: 30000 });
      const qualityError = toQualityError(piError, { taskId: "task-1" });
      expect(qualityError.code).toBe("TIMEOUT_ERROR");
      expect(qualityError.message).toBe("Timed out");
      expect(qualityError.context).toEqual({ taskId: "task-1", retryable: true });
    });
  });

  describe("formatQualityError", () => {
    it("should format error with all fields", () => {
      const error: QualityError = {
        code: "TEST_ERROR",
        message: "Test message",
        context: { key: "value" },
        remediation: "Fix it",
        timestamp: 1234567890,
        helpUrl: "https://example.com/help",
      };
      const formatted = formatQualityError(error);
      expect(formatted).toContain("[TEST_ERROR] Test message");
      expect(formatted).toContain("Context:");
      expect(formatted).toContain("Remediation: Fix it");
      expect(formatted).toContain("Help: https://example.com/help");
    });

    it("should format error without helpUrl", () => {
      const error: QualityError = {
        code: "TEST_ERROR",
        message: "Test message",
        context: {},
        remediation: "Fix it",
        timestamp: 1234567890,
      };
      const formatted = formatQualityError(error);
      expect(formatted).not.toContain("Help:");
    });
  });

  describe("isQualityError", () => {
    it("should return true for valid QualityError", () => {
      const error: QualityError = {
        code: "TEST",
        message: "Test",
        context: {},
        remediation: "Fix",
        timestamp: 123,
      };
      expect(isQualityError(error)).toBe(true);
    });

    it("should return false for invalid objects", () => {
      expect(isQualityError(null)).toBe(false);
      expect(isQualityError(undefined)).toBe(false);
      expect(isQualityError("error")).toBe(false);
      expect(isQualityError(123)).toBe(false);
      expect(isQualityError({})).toBe(false);
      expect(isQualityError({ code: 123, message: "Test" })).toBe(false);
      expect(isQualityError({ code: "TEST", message: 123 })).toBe(false);
      expect(isQualityError({ code: "TEST", message: "Test", context: null })).toBe(false);
    });
  });
});
