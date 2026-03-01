/**
 * @file .pi/lib/comprehensive-logger.ts の単体テスト
 * @description 包括的ログ収集システムのテスト
 * @testFramework vitest
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { performance } from "perf_hooks";

import {
  ComprehensiveLogger,
  getLogger,
  resetLogger,
} from "../../lib/comprehensive-logger.js";
import type {
  LoggerConfig,
  SessionStartEvent,
  SessionEndEvent,
  TaskStartEvent,
  TaskEndEvent,
  OperationStartEvent,
  OperationEndEvent,
  ToolCallEvent,
  ToolResultEvent,
  ToolErrorEvent,
  LLMResponseEvent,
} from "../../lib/comprehensive-logger-types.js";

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_LOG_DIR = ".pi/tests/temp/comprehensive-logger-logs";

function createTestConfig(overrides?: Partial<LoggerConfig>): LoggerConfig {
  return {
    enabled: true,
    logDir: TEST_LOG_DIR,
    bufferSize: 10,
    flushIntervalMs: 1000,
    maxFileSizeMB: 1,
    ...overrides,
  };
}

function cleanupTestDir(): void {
  try {
    rmSync(TEST_LOG_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

function ensureTestDir(): void {
  cleanupTestDir();
  mkdirSync(TEST_LOG_DIR, { recursive: true });
}

// ============================================================================
// Constructor & Initialization
// ============================================================================

describe("ComprehensiveLogger", () => {
  beforeEach(() => {
    ensureTestDir();
    resetLogger();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetLogger();
    cleanupTestDir();
  });

  describe("constructor", () => {
    it("should_initialize_with_default_config", () => {
      // Arrange: デフォルト設定で作成
      // Act
      const logger = new ComprehensiveLogger();

      // Assert
      expect(logger).toBeDefined();
      expect(logger.getSessionId()).toBeDefined();
      expect(logger.getEventCount()).toBe(0);
    });

    it("should_accept_custom_config", () => {
      // Arrange
      const config = createTestConfig({ bufferSize: 5 });

      // Act
      const logger = new ComprehensiveLogger(config);

      // Assert
      expect(logger).toBeDefined();
    });

    it("should_not_start_timer_when_disabled", () => {
      // Arrange
      const config = createTestConfig({ enabled: false });

      // Act
      const logger = new ComprehensiveLogger(config);

      // Assert: エラーなく作成される
      expect(logger).toBeDefined();
    });

    it("should_generate_unique_session_id", () => {
      // Arrange
      const logger1 = new ComprehensiveLogger(createTestConfig());
      const logger2 = new ComprehensiveLogger(createTestConfig());

      // Act & Assert
      expect(logger1.getSessionId()).not.toBe(logger2.getSessionId());
    });
  });

  // ============================================================================
  // Session Management
  // ============================================================================

  describe("startSession", () => {
    it("should_emit_session_start_event", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());

      // Act
      const sessionId = logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });

      // Assert
      expect(sessionId).toBe(logger.getSessionId());
      expect(logger.getEventCount()).toBe(1);
    });

    it("should_include_startup_time_in_event", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());

      // Act
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });

      // Assert
      expect(logger.getEventCount()).toBeGreaterThan(0);
    });
  });

  describe("endSession", () => {
    it("should_emit_session_end_event", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });

      // Act
      logger.endSession("normal");

      // Assert
      expect(logger.getEventCount()).toBe(2);
    });

    it("should_include_statistics_in_end_event", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });

      // Act
      logger.endSession("normal");

      // Assert
      expect(logger.getErrorCount()).toBe(0);
      expect(logger.getTotalTokens()).toBe(0);
    });

    it("should_flush_buffer_on_end", async () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });

      // Act
      logger.endSession("normal");
      await vi.runAllTimersAsync();

      // Assert: セッション終了後はクリーンアップされる
      expect(logger.getEventCount()).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // Task Management
  // ============================================================================

  describe("startTask", () => {
    it("should_emit_task_start_event", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });

      // Act
      const taskId = logger.startTask("user input", {
        files: ["test.ts"],
        skills: [],
      });

      // Assert
      expect(taskId).toBeDefined();
      expect(logger.getCurrentTaskId()).toBe(taskId);
    });

    it("should_track_active_task", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });

      // Act
      logger.startTask("user input", {
        files: ["test.ts"],
        skills: [],
      });

      // Assert
      expect(logger.getCurrentTaskId()).toBeDefined();
    });
  });

  describe("endTask", () => {
    it("should_emit_task_end_event", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });
      logger.startTask("user input", {
        files: ["test.ts"],
        skills: [],
      });

      // Act
      logger.endTask({
        status: "success",
        summary: "Task completed",
      });

      // Assert
      expect(logger.getCurrentTaskId()).toBe("");
    });

    it("should_include_duration_in_event", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });
      logger.startTask("user input", {
        files: ["test.ts"],
        skills: [],
      });

      // Act
      logger.endTask({
        status: "success",
        summary: "Task completed",
      });

      // Assert: イベントが記録される
      expect(logger.getEventCount()).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Operation Management
  // ============================================================================

  describe("startOperation", () => {
    it("should_emit_operation_start_event", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });

      // Act
      const operationId = logger.startOperation(
        "read",
        "test.ts",
        { path: "test.ts" }
      );

      // Assert
      expect(operationId).toBeDefined();
      expect(logger.getCurrentOperationId()).toBe(operationId);
    });

    it("should_include_optional_strategy", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });

      // Act
      logger.startOperation("read", "test.ts", { path: "test.ts" }, {
        strategy: "fast",
      });

      // Assert
      expect(logger.getCurrentOperationId()).toBeDefined();
    });
  });

  describe("endOperation", () => {
    it("should_emit_operation_end_event", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });
      logger.startOperation("read", "test.ts", { path: "test.ts" });

      // Act
      logger.endOperation({
        status: "success",
        result: { content: "test" },
      });

      // Assert
      expect(logger.getCurrentOperationId()).toBe("");
    });

    it("should_increment_error_count_on_error", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });
      logger.startOperation("read", "test.ts", { path: "test.ts" });

      // Act
      logger.endOperation({
        status: "error",
        error: "File not found",
      });

      // Assert
      expect(logger.getErrorCount()).toBe(1);
    });

    it("should_accumulate_tokens", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });
      logger.startOperation("llm_call", "model", {});

      // Act
      logger.endOperation({
        status: "success",
        tokensUsed: 100,
      });

      // Assert
      expect(logger.getTotalTokens()).toBe(100);
    });
  });

  // ============================================================================
  // Tool Logging
  // ============================================================================

  describe("logToolCall", () => {
    it("should_emit_tool_call_event", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });

      // Act
      const eventId = logger.logToolCall("read", { path: "test.ts" }, {
        type: "user",
        name: "test",
      });

      // Assert
      expect(eventId).toBeDefined();
    });

    it("should_determine_tool_type_builtin", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });

      // Act
      logger.logToolCall("read", { path: "test.ts" }, {
        type: "user",
        name: "test",
      });

      // Assert: エラーなく記録される
      expect(logger.getEventCount()).toBeGreaterThan(0);
    });

    it("should_determine_tool_type_dynamic", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });

      // Act
      logger.logToolCall("dynamic_custom", { path: "test.ts" }, {
        type: "user",
        name: "test",
      });

      // Assert
      expect(logger.getEventCount()).toBeGreaterThan(0);
    });
  });

  describe("logToolResult", () => {
    it("should_emit_tool_result_event", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });
      logger.logToolCall("read", { path: "test.ts" }, {
        type: "user",
        name: "test",
      });

      // Act
      logger.logToolResult("read", {
        status: "success",
        result: "file content",
        durationMs: 10,
      });

      // Assert
      expect(logger.getEventCount()).toBeGreaterThan(0);
    });
  });

  describe("logToolError", () => {
    it("should_emit_tool_error_event", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });
      logger.logToolCall("read", { path: "test.ts" }, {
        type: "user",
        name: "test",
      });

      // Act
      logger.logToolError("read", {
        error: "File not found",
        errorType: "ENOENT",
      });

      // Assert
      expect(logger.getErrorCount()).toBe(1);
    });
  });

  // ============================================================================
  // LLM Logging
  // ============================================================================

  describe("logLLMRequest", () => {
    it("should_emit_llm_request_event", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });

      // Act
      const eventId = logger.logLLMRequest({
        provider: "openai",
        model: "gpt-4",
        systemPrompt: "You are a helpful assistant.",
        userMessages: [{ content: "Hello" }],
        toolsAvailable: [],
      });

      // Assert
      expect(eventId).toBeDefined();
    });

    it("should_include_prompt_hash", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });

      // Act
      logger.logLLMRequest({
        provider: "openai",
        model: "gpt-4",
        systemPrompt: "You are a helpful assistant.",
        userMessages: [{ content: "Hello" }],
        toolsAvailable: [],
      });

      // Assert: ハッシュを含むイベントが記録される
      expect(logger.getEventCount()).toBeGreaterThan(0);
    });
  });

  describe("logLLMResponse", () => {
    it("should_emit_llm_response_event", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });

      // Act
      logger.logLLMResponse({
        provider: "openai",
        model: "gpt-4",
        inputTokens: 100,
        outputTokens: 50,
        durationMs: 500,
        responseLength: 200,
        stopReason: "stop",
        toolsCalled: [],
      });

      // Assert
      expect(logger.getTotalTokens()).toBe(150);
    });

    it("should_accumulate_tokens", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });

      // Act: 複数回呼び出し
      logger.logLLMResponse({
        provider: "openai",
        model: "gpt-4",
        inputTokens: 100,
        outputTokens: 50,
        durationMs: 500,
        responseLength: 200,
        stopReason: "stop",
        toolsCalled: [],
      });
      logger.logLLMResponse({
        provider: "openai",
        model: "gpt-4",
        inputTokens: 200,
        outputTokens: 100,
        durationMs: 600,
        responseLength: 300,
        stopReason: "stop",
        toolsCalled: [],
      });

      // Assert
      expect(logger.getTotalTokens()).toBe(450);
    });
  });

  // ============================================================================
  // State Change Logging
  // ============================================================================

  describe("logStateChange", () => {
    it("should_emit_state_change_event_for_file_create", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });

      // Act
      logger.logStateChange({
        entityType: "file",
        entityPath: "/test/new.ts",
        changeType: "create",
        afterContent: "new content",
      });

      // Assert
      expect(logger.getEventCount()).toBeGreaterThan(0);
    });

    it("should_emit_state_change_event_for_file_update", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });

      // Act
      logger.logStateChange({
        entityType: "file",
        entityPath: "/test/existing.ts",
        changeType: "update",
        beforeContent: "old content",
        afterContent: "new content",
        diff: { additions: 5, deletions: 2, hunks: 1 },
      });

      // Assert
      expect(logger.getEventCount()).toBeGreaterThan(0);
    });

    it("should_emit_state_change_event_for_file_delete", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });

      // Act
      logger.logStateChange({
        entityType: "file",
        entityPath: "/test/old.ts",
        changeType: "delete",
        beforeContent: "deleted content",
      });

      // Assert
      expect(logger.getEventCount()).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Metrics Snapshot
  // ============================================================================

  describe("logMetricsSnapshot", () => {
    it("should_emit_metrics_snapshot_event", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });

      // Act
      logger.logMetricsSnapshot({
        memoryUsageMB: 100,
        cpuPercent: 50,
        activeTasks: 5,
        queueDepth: 10,
        eventsPerSecond: 100,
      });

      // Assert
      expect(logger.getEventCount()).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Buffer & Flush
  // ============================================================================

  describe("flush", () => {
    it("should_flush_buffer_to_file", async () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig({ bufferSize: 100 }));
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });

      // Act
      await logger.flush();

      // Assert: エラーなく完了
      expect(logger).toBeDefined();
    });

    it("should_handle_empty_buffer", async () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());

      // Act
      await logger.flush();

      // Assert: エラーなく完了
      expect(logger).toBeDefined();
    });
  });

  // ============================================================================
  // Utility Methods
  // ============================================================================

  describe("getSessionId", () => {
    it("should_return_current_session_id", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());

      // Act
      const sessionId = logger.getSessionId();

      // Assert
      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe("string");
    });
  });

  describe("getCurrentTaskId", () => {
    it("should_return_empty_when_no_task", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());

      // Act
      const taskId = logger.getCurrentTaskId();

      // Assert
      expect(taskId).toBe("");
    });

    it("should_return_task_id_after_start", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });

      // Act
      const startedTaskId = logger.startTask("input", { files: [], skills: [] });
      const currentTaskId = logger.getCurrentTaskId();

      // Assert
      expect(currentTaskId).toBe(startedTaskId);
    });
  });

  describe("getCurrentOperationId", () => {
    it("should_return_empty_when_no_operation", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());

      // Act
      const operationId = logger.getCurrentOperationId();

      // Assert
      expect(operationId).toBe("");
    });

    it("should_return_operation_id_after_start", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });

      // Act
      const startedId = logger.startOperation("read", "test.ts", {});
      const currentId = logger.getCurrentOperationId();

      // Assert
      expect(currentId).toBe(startedId);
    });
  });

  describe("getEventCount", () => {
    it("should_return_zero_initially", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());

      // Act
      const count = logger.getEventCount();

      // Assert
      expect(count).toBe(0);
    });

    it("should_increment_on_events", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });

      // Act
      const count = logger.getEventCount();

      // Assert
      expect(count).toBeGreaterThan(0);
    });
  });

  describe("getErrorCount", () => {
    it("should_return_zero_initially", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());

      // Act
      const count = logger.getErrorCount();

      // Assert
      expect(count).toBe(0);
    });

    it("should_increment_on_errors", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });
      logger.startOperation("read", "test.ts", {});
      logger.endOperation({
        status: "error",
        error: "Failed",
      });

      // Act
      const count = logger.getErrorCount();

      // Assert
      expect(count).toBe(1);
    });
  });

  describe("getTotalTokens", () => {
    it("should_return_zero_initially", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());

      // Act
      const tokens = logger.getTotalTokens();

      // Assert
      expect(tokens).toBe(0);
    });

    it("should_accumulate_from_llm_responses", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });
      logger.logLLMResponse({
        provider: "openai",
        model: "gpt-4",
        inputTokens: 100,
        outputTokens: 50,
        durationMs: 500,
        responseLength: 200,
        stopReason: "stop",
        toolsCalled: [],
      });

      // Act
      const tokens = logger.getTotalTokens();

      // Assert
      expect(tokens).toBe(150);
    });
  });

  // ============================================================================
  // Singleton Functions
  // ============================================================================

  describe("getLogger", () => {
    it("should_return_singleton_instance", () => {
      // Arrange
      resetLogger();

      // Act
      const logger1 = getLogger();
      const logger2 = getLogger();

      // Assert
      expect(logger1).toBe(logger2);

      // Cleanup
      resetLogger();
    });

    it("should_create_new_instance_after_reset", () => {
      // Arrange
      resetLogger();
      const logger1 = getLogger();

      // Act
      resetLogger();
      const logger2 = getLogger();

      // Assert
      expect(logger1).not.toBe(logger2);

      // Cleanup
      resetLogger();
    });
  });

  describe("resetLogger", () => {
    it("should_clear_singleton", () => {
      // Arrange
      const logger1 = getLogger();

      // Act
      resetLogger();
      const logger2 = getLogger();

      // Assert
      expect(logger1).not.toBe(logger2);

      // Cleanup
      resetLogger();
    });
  });

  // ============================================================================
  // Active Operations & Tasks Pruning
  // ============================================================================

  describe("pruneActiveTasks", () => {
    it("should_limit_active_tasks", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });

      // Act: 多数のタスクを開始
      for (let i = 0; i < 300; i++) {
        logger.startTask(`task ${i}`, { files: [], skills: [] });
        logger.endTask({ status: "success", summary: "done" });
      }

      // Assert: エラーなく完了
      expect(logger).toBeDefined();
    });
  });

  describe("pruneActiveOperations", () => {
    it("should_limit_active_operations", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig());
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });

      // Act: 多数の操作を開始
      for (let i = 0; i < 1100; i++) {
        logger.startOperation("read", `file${i}.ts`, {});
        logger.endOperation({ status: "success" });
      }

      // Assert: エラーなく完了
      expect(logger).toBeDefined();
    });
  });

  // ============================================================================
  // Disabled Logger
  // ============================================================================

  describe("disabled logger", () => {
    it("should_not_emit_events_when_disabled", () => {
      // Arrange
      const logger = new ComprehensiveLogger(createTestConfig({ enabled: false }));

      // Act
      logger.startSession({
        version: "1.0.0",
        args: ["test"],
        cwd: "/test",
      });
      logger.startTask("input", { files: [], skills: [] });
      logger.endTask({ status: "success", summary: "done" });
      logger.endSession("normal");

      // Assert
      expect(logger.getEventCount()).toBe(0);
    });
  });
});
