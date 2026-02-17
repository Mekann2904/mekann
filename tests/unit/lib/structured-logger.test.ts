/**
 * Unit tests for lib/structured-logger.ts
 * Tests structured logging utility functions and classes.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  StructuredLogger,
  ChildLogger,
  getMinLogLevel,
  resetMinLogLevelCache,
  formatTimestamp,
  shouldLog,
  formatError,
  serializeLogEntry,
  formatReadableEntry,
  getDefaultLogger,
  resetDefaultLogger,
  createLogger,
  getSubagentLogger,
  getAgentTeamsLogger,
  getStorageLogger,
  logInfo,
  logWarn,
  logError,
  logDebug,
  type LogLevel,
  type LogContext,
  type StructuredLogEntry,
} from "../../../.pi/lib/structured-logger.js";

// ============================================================================
// Feature Flag Tests
// ============================================================================

describe("getMinLogLevel", () => {
  beforeEach(() => {
    resetMinLogLevelCache();
  });

  afterEach(() => {
    resetMinLogLevelCache();
  });

  it("should return INFO by default", () => {
    delete process.env.PI_LOG_LEVEL;
    resetMinLogLevelCache();

    const level = getMinLogLevel();
    expect(level).toBe("INFO");
  });

  it("should return DEBUG when env is set to debug", () => {
    process.env.PI_LOG_LEVEL = "debug";
    resetMinLogLevelCache();

    const level = getMinLogLevel();
    expect(level).toBe("DEBUG");

    delete process.env.PI_LOG_LEVEL;
  });

  it("should return WARN when env is set to warn", () => {
    process.env.PI_LOG_LEVEL = "warn";
    resetMinLogLevelCache();

    const level = getMinLogLevel();
    expect(level).toBe("WARN");

    delete process.env.PI_LOG_LEVEL;
  });

  it("should return ERROR when env is set to error", () => {
    process.env.PI_LOG_LEVEL = "error";
    resetMinLogLevelCache();

    const level = getMinLogLevel();
    expect(level).toBe("ERROR");

    delete process.env.PI_LOG_LEVEL;
  });

  it("should be case-insensitive", () => {
    process.env.PI_LOG_LEVEL = "WaRn";
    resetMinLogLevelCache();

    const level = getMinLogLevel();
    expect(level).toBe("WARN");

    delete process.env.PI_LOG_LEVEL;
  });

  it("should default to INFO for unknown values", () => {
    process.env.PI_LOG_LEVEL = "unknown";
    resetMinLogLevelCache();

    const level = getMinLogLevel();
    expect(level).toBe("INFO");

    delete process.env.PI_LOG_LEVEL;
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe("formatTimestamp", () => {
  it("should return ISO8601 formatted string", () => {
    const timestamp = formatTimestamp();

    // ISO8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("should use provided date", () => {
    const date = new Date("2025-01-15T10:30:00.000Z");
    const timestamp = formatTimestamp(date);

    expect(timestamp).toBe("2025-01-15T10:30:00.000Z");
  });
});

describe("shouldLog", () => {
  it("should return true when level is equal to minLevel", () => {
    expect(shouldLog("INFO", "INFO")).toBe(true);
    expect(shouldLog("WARN", "WARN")).toBe(true);
  });

  it("should return true when level is higher than minLevel", () => {
    expect(shouldLog("WARN", "INFO")).toBe(true);
    expect(shouldLog("ERROR", "DEBUG")).toBe(true);
  });

  it("should return false when level is lower than minLevel", () => {
    expect(shouldLog("DEBUG", "INFO")).toBe(false);
    expect(shouldLog("INFO", "WARN")).toBe(false);
    expect(shouldLog("WARN", "ERROR")).toBe(false);
  });

  it("should handle all level combinations correctly", () => {
    const levels: LogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR"];

    for (const minLevel of levels) {
      for (const level of levels) {
        const result = shouldLog(level, minLevel);
        const expected = levels.indexOf(level) >= levels.indexOf(minLevel);
        expect(result).toBe(expected);
      }
    }
  });
});

describe("formatError", () => {
  it("should format Error objects", () => {
    const error = new Error("Test error");
    const formatted = formatError(error);

    expect(formatted).toEqual({
      name: "Error",
      message: "Test error",
      stack: expect.any(String),
    });
  });

  it("should format TypeError", () => {
    const error = new TypeError("Type mismatch");
    const formatted = formatError(error);

    expect(formatted.name).toBe("TypeError");
    expect(formatted.message).toBe("Type mismatch");
  });

  it("should handle non-Error values", () => {
    expect(formatError("string error")).toEqual({
      name: "UnknownError",
      message: "string error",
    });

    expect(formatError(123)).toEqual({
      name: "UnknownError",
      message: "123",
    });

    expect(formatError(null)).toEqual({
      name: "UnknownError",
      message: "null",
    });

    expect(formatError(undefined)).toEqual({
      name: "UnknownError",
      message: "undefined",
    });
  });
});

describe("serializeLogEntry", () => {
  it("should serialize log entry to JSON", () => {
    const entry: StructuredLogEntry = {
      timestamp: "2025-01-15T10:00:00.000Z",
      level: "INFO",
      context: "subagents",
      operation: "runSubagent",
      message: "Starting subagent",
    };

    const json = serializeLogEntry(entry);

    expect(json).toBe(
      '{"timestamp":"2025-01-15T10:00:00.000Z","level":"INFO","context":"subagents","operation":"runSubagent","message":"Starting subagent"}'
    );
  });

  it("should include optional fields", () => {
    const entry: StructuredLogEntry = {
      timestamp: "2025-01-15T10:00:00.000Z",
      level: "ERROR",
      context: "storage",
      operation: "saveFile",
      message: "Failed to save",
      metadata: { path: "/tmp/test.json", size: 1024 },
      correlationId: "req-123",
      durationMs: 50,
      error: { name: "ENOENT", message: "File not found" },
    };

    const json = serializeLogEntry(entry);
    const parsed = JSON.parse(json);

    expect(parsed.metadata).toEqual({ path: "/tmp/test.json", size: 1024 });
    expect(parsed.correlationId).toBe("req-123");
    expect(parsed.durationMs).toBe(50);
    expect(parsed.error).toEqual({ name: "ENOENT", message: "File not found" });
  });

  it("should exclude undefined optional fields", () => {
    const entry: StructuredLogEntry = {
      timestamp: "2025-01-15T10:00:00.000Z",
      level: "INFO",
      context: "general",
      operation: "test",
      message: "Test",
    };

    const json = serializeLogEntry(entry);
    const parsed = JSON.parse(json);

    expect(parsed.metadata).toBeUndefined();
    expect(parsed.correlationId).toBeUndefined();
    expect(parsed.durationMs).toBeUndefined();
    expect(parsed.error).toBeUndefined();
  });
});

describe("formatReadableEntry", () => {
  it("should format entry in readable format", () => {
    const entry: StructuredLogEntry = {
      timestamp: "2025-01-15T10:00:00.000Z",
      level: "INFO",
      context: "subagents",
      operation: "runSubagent",
      message: "Starting subagent",
    };

    const formatted = formatReadableEntry(entry);

    expect(formatted).toContain("[2025-01-15T10:00:00.000Z]");
    expect(formatted).toContain("[INFO]");
    expect(formatted).toContain("[subagents]");
    expect(formatted).toContain("[runSubagent]");
    expect(formatted).toContain("Starting subagent");
  });

  it("should include correlationId when present", () => {
    const entry: StructuredLogEntry = {
      timestamp: "2025-01-15T10:00:00.000Z",
      level: "INFO",
      context: "general",
      operation: "test",
      message: "Test",
      correlationId: "req-456",
    };

    const formatted = formatReadableEntry(entry);

    expect(formatted).toContain("(correlationId: req-456)");
  });

  it("should include durationMs when present", () => {
    const entry: StructuredLogEntry = {
      timestamp: "2025-01-15T10:00:00.000Z",
      level: "INFO",
      context: "general",
      operation: "test",
      message: "Completed",
      durationMs: 150,
    };

    const formatted = formatReadableEntry(entry);

    expect(formatted).toContain("(150ms)");
  });

  it("should include metadata when present", () => {
    const entry: StructuredLogEntry = {
      timestamp: "2025-01-15T10:00:00.000Z",
      level: "INFO",
      context: "general",
      operation: "test",
      message: "Test",
      metadata: { key: "value", count: 5 },
    };

    const formatted = formatReadableEntry(entry);

    expect(formatted).toContain('"key":"value"');
    expect(formatted).toContain('"count":5');
  });

  it("should include error information when present", () => {
    const entry: StructuredLogEntry = {
      timestamp: "2025-01-15T10:00:00.000Z",
      level: "ERROR",
      context: "general",
      operation: "test",
      message: "Failed",
      error: {
        name: "TestError",
        message: "Something went wrong",
        stack: "Error stack\n  at line 1\n  at line 2\n  at line 3",
      },
    };

    const formatted = formatReadableEntry(entry);

    expect(formatted).toContain("Error: TestError: Something went wrong");
    expect(formatted).toContain("Stack:");
  });
});

// ============================================================================
// StructuredLogger Tests
// ============================================================================

describe("StructuredLogger", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    resetMinLogLevelCache();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    resetMinLogLevelCache();
    delete process.env.PI_LOG_LEVEL;
  });

  describe("constructor", () => {
    it("should create logger with default options", () => {
      const logger = new StructuredLogger();
      expect(logger).toBeInstanceOf(StructuredLogger);
    });

    it("should accept custom options", () => {
      const logger = new StructuredLogger({
        minLevel: "DEBUG",
        context: "test-context",
        correlationId: "test-id",
        json: false,
      });

      logger.debug("testOp", "Test message");
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe("debug", () => {
    it("should log DEBUG level messages when minLevel is DEBUG", () => {
      const logger = new StructuredLogger({ minLevel: "DEBUG", json: true });

      logger.debug("testOp", "Debug message");

      expect(consoleLogSpy).toHaveBeenCalled();
      const logged = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logged.level).toBe("DEBUG");
      expect(logged.message).toBe("Debug message");
    });

    it("should not log DEBUG when minLevel is INFO", () => {
      const logger = new StructuredLogger({ minLevel: "INFO" });

      logger.debug("testOp", "Debug message");

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe("info", () => {
    it("should log INFO level messages", () => {
      const logger = new StructuredLogger({ minLevel: "INFO", json: true });

      logger.info("testOp", "Info message", { key: "value" });

      expect(consoleLogSpy).toHaveBeenCalled();
      const logged = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logged.level).toBe("INFO");
      expect(logged.message).toBe("Info message");
      expect(logged.metadata).toEqual({ key: "value" });
    });

    it("should not log INFO when minLevel is WARN", () => {
      const logger = new StructuredLogger({ minLevel: "WARN" });

      logger.info("testOp", "Info message");

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe("warn", () => {
    it("should log WARN level messages using console.warn", () => {
      const logger = new StructuredLogger({ minLevel: "WARN", json: true });

      logger.warn("testOp", "Warning message");

      expect(consoleWarnSpy).toHaveBeenCalled();
      const logged = JSON.parse(consoleWarnSpy.mock.calls[0][0]);
      expect(logged.level).toBe("WARN");
    });

    it("should not log WARN when minLevel is ERROR", () => {
      const logger = new StructuredLogger({ minLevel: "ERROR" });

      logger.warn("testOp", "Warning message");

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe("error", () => {
    it("should log ERROR level messages using console.error", () => {
      const logger = new StructuredLogger({ minLevel: "ERROR", json: true });

      logger.error("testOp", "Error message");

      expect(consoleErrorSpy).toHaveBeenCalled();
      const logged = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(logged.level).toBe("ERROR");
    });

    it("should include error details", () => {
      const logger = new StructuredLogger({ minLevel: "ERROR", json: true });
      const error = new Error("Test error");

      logger.error("testOp", "Error occurred", error);

      const logged = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(logged.error.name).toBe("Error");
      expect(logged.error.message).toBe("Test error");
    });
  });

  describe("child", () => {
    it("should create a child logger with fixed operation", () => {
      const logger = new StructuredLogger({ minLevel: "INFO", json: true });
      const child = logger.child("childOperation");

      child.info("Child message");

      expect(consoleLogSpy).toHaveBeenCalled();
      const logged = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logged.operation).toBe("childOperation");
    });
  });

  describe("withTiming", () => {
    it("should log duration on success", async () => {
      const logger = new StructuredLogger({ minLevel: "INFO", json: true });

      await logger.withTiming("testOp", "Timed operation", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return "result";
      });

      expect(consoleLogSpy).toHaveBeenCalled();
      const logged = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logged.durationMs).toBeGreaterThanOrEqual(10);
    });

    it("should log error and duration on failure", async () => {
      const logger = new StructuredLogger({ minLevel: "ERROR", json: true });

      await expect(
        logger.withTiming("testOp", "Failing operation", async () => {
          throw new Error("Operation failed");
        })
      ).rejects.toThrow("Operation failed");

      expect(consoleErrorSpy).toHaveBeenCalled();
      const logged = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(logged.durationMs).toBeDefined();
      expect(logged.error).toBeDefined();
    });
  });

  describe("withTimingSync", () => {
    it("should log duration for sync operations", () => {
      const logger = new StructuredLogger({ minLevel: "INFO", json: true });

      const result = logger.withTimingSync("testOp", "Sync operation", () => {
        return 42;
      });

      expect(result).toBe(42);
      expect(consoleLogSpy).toHaveBeenCalled();
      const logged = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logged.durationMs).toBeDefined();
    });
  });

  describe("output options", () => {
    it("should output to stdout when specified", () => {
      const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      const logger = new StructuredLogger({ minLevel: "INFO", output: "stdout" });

      logger.info("testOp", "Test");

      expect(writeSpy).toHaveBeenCalled();
      writeSpy.mockRestore();
    });

    it("should output to stderr when specified", () => {
      const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const logger = new StructuredLogger({ minLevel: "INFO", output: "stderr" });

      logger.info("testOp", "Test");

      expect(writeSpy).toHaveBeenCalled();
      writeSpy.mockRestore();
    });
  });
});

// ============================================================================
// ChildLogger Tests
// ============================================================================

describe("ChildLogger", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it("should use fixed operation name", () => {
    const parent = new StructuredLogger({ minLevel: "INFO", json: true });
    const child = parent.child("fixedOperation");

    child.info("Message 1");
    child.info("Message 2");

    const logged1 = JSON.parse(consoleLogSpy.mock.calls[0][0]);
    const logged2 = JSON.parse(consoleLogSpy.mock.calls[1][0]);

    expect(logged1.operation).toBe("fixedOperation");
    expect(logged2.operation).toBe("fixedOperation");
  });

  it("should inherit parent context", () => {
    const parent = new StructuredLogger({
      minLevel: "INFO",
      context: "parent-context",
      json: true,
    });
    const child = parent.child("childOp");

    child.info("Child message");

    const logged = JSON.parse(consoleLogSpy.mock.calls[0][0]);
    expect(logged.context).toBe("parent-context");
  });

  it("should support all log levels", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const parent = new StructuredLogger({ minLevel: "INFO", json: true });
    const child = parent.child("testOp");

    child.debug("Debug");  // Should be filtered (minLevel is INFO)
    child.info("Info");
    child.warn("Warn");
    child.error("Error");

    // console.log: info; console.warn: warn; console.error: error
    expect(consoleLogSpy).toHaveBeenCalledTimes(1); // info (debug is filtered)
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1); // warn
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1); // error

    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe("Factory functions", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    resetDefaultLogger();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    resetDefaultLogger();
  });

  describe("getDefaultLogger", () => {
    it("should return same logger instance", () => {
      const logger1 = getDefaultLogger();
      const logger2 = getDefaultLogger();

      expect(logger1).toBe(logger2);
    });

    it("should reset with resetDefaultLogger", () => {
      const logger1 = getDefaultLogger();
      resetDefaultLogger();
      const logger2 = getDefaultLogger();

      expect(logger1).not.toBe(logger2);
    });
  });

  describe("createLogger", () => {
    it("should create logger with specified context", () => {
      const logger = createLogger("test-context", { minLevel: "INFO", json: true });

      logger.info("testOp", "Test");

      const logged = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logged.context).toBe("test-context");
    });
  });

  describe("context-specific loggers", () => {
    it("getSubagentLogger should have subagents context", () => {
      const logger = getSubagentLogger();
      // Access private context for testing
      logger.info("test", "Test");
      const logged = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logged.context).toBe("subagents");
    });

    it("getAgentTeamsLogger should have agent-teams context", () => {
      const logger = getAgentTeamsLogger();
      logger.info("test", "Test");
      const logged = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logged.context).toBe("agent-teams");
    });

    it("getStorageLogger should have storage context", () => {
      const logger = getStorageLogger();
      logger.info("test", "Test");
      const logged = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logged.context).toBe("storage");
    });
  });
});

// ============================================================================
// Quick Logging Function Tests
// ============================================================================

describe("Quick logging functions", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("logInfo should log INFO level", () => {
    logInfo("test", "operation", "message", { key: "value" });

    expect(consoleLogSpy).toHaveBeenCalled();
    const logged = JSON.parse(consoleLogSpy.mock.calls[0][0]);
    expect(logged.level).toBe("INFO");
    expect(logged.context).toBe("test");
    expect(logged.operation).toBe("operation");
  });

  it("logWarn should log WARN level", () => {
    logWarn("test", "operation", "warning");

    expect(consoleWarnSpy).toHaveBeenCalled();
    const logged = JSON.parse(consoleWarnSpy.mock.calls[0][0]);
    expect(logged.level).toBe("WARN");
  });

  it("logError should log ERROR level", () => {
    logError("test", "operation", "error message", new Error("Test"));

    expect(consoleErrorSpy).toHaveBeenCalled();
    const logged = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
    expect(logged.level).toBe("ERROR");
    expect(logged.error).toBeDefined();
  });

  it("logDebug should log DEBUG level", () => {
    process.env.PI_LOG_LEVEL = "debug";
    resetMinLogLevelCache();

    logDebug("test", "operation", "debug message");

    expect(consoleLogSpy).toHaveBeenCalled();
    const logged = JSON.parse(consoleLogSpy.mock.calls[0][0]);
    expect(logged.level).toBe("DEBUG");

    delete process.env.PI_LOG_LEVEL;
    resetMinLogLevelCache();
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Integration tests", () => {
  it("should produce valid JSON for all log levels", () => {
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const logger = new StructuredLogger({ minLevel: "DEBUG", json: true });

    logger.debug("op", "debug");
    logger.info("op", "info");
    logger.warn("op", "warn");
    logger.error("op", "error");

    // All outputs should be valid JSON
    for (const call of consoleLogSpy.mock.calls) {
      expect(() => JSON.parse(call[0])).not.toThrow();
    }
    for (const call of consoleWarnSpy.mock.calls) {
      expect(() => JSON.parse(call[0])).not.toThrow();
    }
    for (const call of consoleErrorSpy.mock.calls) {
      expect(() => JSON.parse(call[0])).not.toThrow();
    }

    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("should maintain log format consistency", () => {
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = new StructuredLogger({ minLevel: "INFO", json: true });

    logger.info("op1", "message1", { a: 1 });
    logger.info("op2", "message2", { b: 2 });

    const entry1 = JSON.parse(consoleLogSpy.mock.calls[0][0]);
    const entry2 = JSON.parse(consoleLogSpy.mock.calls[1][0]);

    // Both entries should have same structure
    expect(Object.keys(entry1).sort()).toEqual(Object.keys(entry2).sort());
    expect(entry1.timestamp).toBeDefined();
    expect(entry2.timestamp).toBeDefined();

    consoleLogSpy.mockRestore();
  });
});
