/**
 * comprehensive-logger.ts 単体テスト
 * カバレッジ: ComprehensiveLoggerクラス, getLogger, resetLogger
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import * as fc from "fast-check";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  ComprehensiveLogger,
  getLogger,
  resetLogger,
} from "../../../.pi/lib/comprehensive-logger.js";

// ============================================================================
// テストユーティリティ
// ============================================================================

let testCounter = 0;

function getTestLogDir(): string {
  testCounter++;
  return path.join(os.tmpdir(), `pi-logs-test-${Date.now()}-${testCounter}-${Math.random().toString(36).slice(2)}`);
}

function createTestLogger(config?: Record<string, unknown>): { logger: ComprehensiveLogger; logDir: string } {
  const logDir = getTestLogDir();
  const logger = new ComprehensiveLogger({
    logDir,
    enabled: true,
    bufferSize: 10,
    flushIntervalMs: 10000,
    maxFileSizeMB: 10,
    retentionDays: 1,
    environment: "test",
    minLogLevel: "debug",
    ...config,
  });
  return { logger, logDir };
}

// ============================================================================
// ComprehensiveLogger テスト
// ============================================================================

describe("ComprehensiveLogger", () => {
  describe("コンストラクタ", () => {
    it("デフォルト設定で作成", () => {
      const defaultLogger = new ComprehensiveLogger();
      expect(defaultLogger).toBeDefined();
      expect(defaultLogger.getSessionId()).toBeDefined();
      defaultLogger.endSession("normal");
    });

    it("カスタム設定で作成", () => {
      const { logger } = createTestLogger({ bufferSize: 50 });
      expect(logger).toBeDefined();
      logger.endSession("normal");
    });

    it("無効設定_イベントを発行しない", () => {
      const disabledLogger = new ComprehensiveLogger({ enabled: false });
      disabledLogger.startSession({
        piVersion: "1.0.0",
        nodeVersion: process.version,
        platform: process.platform,
        cwd: process.cwd(),
        envKeys: [],
        configHash: "test",
      });
      expect(disabledLogger.getEventCount()).toBe(0);
      disabledLogger.endSession("normal");
    });
  });

  describe("セッション管理", () => {
    let logger: ComprehensiveLogger;

    beforeEach(() => {
      ({ logger } = createTestLogger());
    });

    afterEach(() => {
      logger.endSession("normal");
    });

    describe("startSession", () => {
      it("セッションを開始", () => {
        const sessionId = logger.startSession({
          piVersion: "1.0.0",
          nodeVersion: process.version,
          platform: process.platform,
          cwd: process.cwd(),
          envKeys: ["TEST"],
          configHash: "abc123",
        });

        expect(sessionId).toBeDefined();
        expect(typeof sessionId).toBe("string");
        expect(logger.getEventCount()).toBe(1);
      });

      it("セッションIDはUUID形式", () => {
        const sessionId = logger.getSessionId();
        expect(sessionId).toMatch(/^[a-f0-9-]{36}$/);
      });
    });

    describe("endSession", () => {
      it("セッションを終了", () => {
        logger.startSession({
          piVersion: "1.0.0",
          nodeVersion: process.version,
          platform: process.platform,
          cwd: process.cwd(),
          envKeys: [],
          configHash: "test",
        });

        logger.endSession("normal");
        expect(logger.getEventCount()).toBe(2);
      });

      it("各種終了理由", () => {
        const reasons = ["normal", "error", "user_interrupt", "timeout"] as const;

        reasons.forEach((reason) => {
          const { logger: testLogger } = createTestLogger();
          testLogger.startSession({
            piVersion: "1.0.0",
            nodeVersion: process.version,
            platform: process.platform,
            cwd: process.cwd(),
            envKeys: [],
            configHash: "test",
          });
          testLogger.endSession(reason);
        });
      });
    });
  });

  describe("タスク管理", () => {
    let logger: ComprehensiveLogger;

    beforeEach(() => {
      ({ logger } = createTestLogger());
      logger.startSession({
        piVersion: "1.0.0",
        nodeVersion: process.version,
        platform: process.platform,
        cwd: process.cwd(),
        envKeys: [],
        configHash: "test",
      });
    });

    afterEach(() => {
      logger.endSession("normal");
    });

    describe("startTask", () => {
      it("タスクを開始", () => {
        const taskId = logger.startTask("Test input", {
          filesReferenced: [],
          skillsLoaded: [],
          teamsAvailable: [],
        });

        expect(taskId).toBeDefined();
        expect(typeof taskId).toBe("string");
        expect(logger.getCurrentTaskId()).toBe(taskId);
        expect(logger.getEventCount()).toBe(2);
      });
    });

    describe("endTask", () => {
      it("タスクを終了", () => {
        logger.startTask("Test input", {
          filesReferenced: [],
          skillsLoaded: [],
          teamsAvailable: [],
        });

        const initialCount = logger.getEventCount();
        logger.endTask({
          status: "success",
          operationsCount: 1,
          toolsCount: 0,
          tokensUsed: 100,
          filesCreated: [],
          filesModified: [],
          filesDeleted: [],
          commandsExecuted: [],
          summary: "Task completed",
          errors: [],
        });

        expect(logger.getEventCount()).toBe(initialCount + 1);
        expect(logger.getCurrentTaskId()).toBe("");
      });

      it("各種ステータス", () => {
        const statuses = ["pending", "running", "success", "failure", "timeout", "partial", "cancelled"] as const;

        statuses.forEach((status) => {
          logger.startTask(`Task with status ${status}`, {
            filesReferenced: [],
            skillsLoaded: [],
            teamsAvailable: [],
          });
          logger.endTask({
            status,
            operationsCount: 0,
            toolsCount: 0,
            tokensUsed: 0,
            filesCreated: [],
            filesModified: [],
            filesDeleted: [],
            commandsExecuted: [],
            summary: `Task ${status}`,
            errors: [],
          });
        });
      });
    });
  });

  describe("操作管理", () => {
    let logger: ComprehensiveLogger;

    beforeEach(() => {
      ({ logger } = createTestLogger());
      logger.startSession({
        piVersion: "1.0.0",
        nodeVersion: process.version,
        platform: process.platform,
        cwd: process.cwd(),
        envKeys: [],
        configHash: "test",
      });
    });

    afterEach(() => {
      logger.endSession("normal");
    });

    describe("startOperation", () => {
      it("操作を開始", () => {
        const opId = logger.startOperation(
          "subagent_run",
          "test-target",
          { task: "test", params: {} }
        );

        expect(opId).toBeDefined();
        expect(typeof opId).toBe("string");
        expect(logger.getCurrentOperationId()).toBe(opId);
      });

      it("オプション付き", () => {
        const opId = logger.startOperation(
          "team_run",
          "team-target",
          { task: "test", params: {} },
          {
            strategy: "parallel",
            retryConfig: { maxRetries: 3, backoffMs: 1000 },
          }
        );

        expect(opId).toBeDefined();
      });
    });

    describe("endOperation", () => {
      it("操作を終了", () => {
        logger.startOperation(
          "subagent_run",
          "test-target",
          { task: "test", params: {} }
        );

        const initialCount = logger.getEventCount();
        logger.endOperation({
          status: "success",
          tokensUsed: 50,
          outputLength: 100,
          childOperations: 0,
          toolCalls: 1,
        });

        expect(logger.getEventCount()).toBe(initialCount + 1);
        expect(logger.getCurrentOperationId()).toBe("");
      });

      it("エラー付き", () => {
        logger.startOperation(
          "subagent_run",
          "test-target",
          { task: "test", params: {} }
        );

        const initialErrorCount = logger.getErrorCount();
        logger.endOperation({
          status: "failure",
          tokensUsed: 0,
          outputLength: 0,
          childOperations: 0,
          toolCalls: 0,
          error: {
            type: "test_error",
            message: "Test error",
            stack: "stack trace",
          },
        });

        expect(logger.getErrorCount()).toBe(initialErrorCount + 1);
      });

      it("トークン集計", () => {
        logger.startOperation("subagent_run", "test", { task: "test", params: {} });
        logger.endOperation({
          status: "success",
          tokensUsed: 100,
          outputLength: 50,
          childOperations: 0,
          toolCalls: 0,
        });

        expect(logger.getTotalTokens()).toBe(100);
      });
    });
  });

  describe("ツールログ", () => {
    let logger: ComprehensiveLogger;

    beforeEach(() => {
      ({ logger } = createTestLogger());
      logger.startSession({
        piVersion: "1.0.0",
        nodeVersion: process.version,
        platform: process.platform,
        cwd: process.cwd(),
        envKeys: [],
        configHash: "test",
      });
    });

    afterEach(() => {
      logger.endSession("normal");
    });

    describe("logToolCall", () => {
      it("ツール呼び出しを記録", () => {
        const eventId = logger.logToolCall("read", { path: "test.txt" }, {
          file: "test.ts",
          line: 10,
          function: "test",
        });

        expect(eventId).toBeDefined();
        expect(typeof eventId).toBe("string");
      });
    });

    describe("logToolResult", () => {
      it("ツール結果を記録", () => {
        logger.logToolCall("read", { path: "test.txt" }, {
          file: "test.ts",
          line: 10,
          function: "test",
        });

        const initialCount = logger.getEventCount();
        logger.logToolResult("read", {
          status: "success",
          durationMs: 100,
          outputType: "inline",
          output: "file content",
          outputSize: 12,
        });

        expect(logger.getEventCount()).toBe(initialCount + 1);
      });
    });

    describe("logToolError", () => {
      it("ツールエラーを記録", () => {
        logger.logToolCall("read", { path: "test.txt" }, {
          file: "test.ts",
          line: 10,
          function: "test",
        });

        const initialErrorCount = logger.getErrorCount();
        logger.logToolError("read", {
          errorType: "validation",
          errorMessage: "Invalid path",
          recoveryAttempted: false,
          params: { path: "test.txt" },
        });

        expect(logger.getErrorCount()).toBe(initialErrorCount + 1);
      });
    });
  });

  describe("LLMログ", () => {
    let logger: ComprehensiveLogger;

    beforeEach(() => {
      ({ logger } = createTestLogger());
      logger.startSession({
        piVersion: "1.0.0",
        nodeVersion: process.version,
        platform: process.platform,
        cwd: process.cwd(),
        envKeys: [],
        configHash: "test",
      });
    });

    afterEach(() => {
      logger.endSession("normal");
    });

    describe("logLLMRequest", () => {
      it("LLMリクエストを記録", () => {
        const eventId = logger.logLLMRequest({
          provider: "anthropic",
          model: "claude-3",
          systemPrompt: "You are helpful.",
          userMessages: [{ content: "Hello" }],
          temperature: 0.7,
          maxTokens: 1000,
          toolsAvailable: ["read", "write"],
        });

        expect(eventId).toBeDefined();
      });
    });

    describe("logLLMResponse", () => {
      it("LLM応答を記録", () => {
        logger.logLLMRequest({
          provider: "anthropic",
          model: "claude-3",
          systemPrompt: "You are helpful.",
          userMessages: [{ content: "Hello" }],
          toolsAvailable: [],
        });

        const initialTokens = logger.getTotalTokens();
        logger.logLLMResponse({
          provider: "anthropic",
          model: "claude-3",
          inputTokens: 100,
          outputTokens: 50,
          durationMs: 500,
          responseLength: 200,
          stopReason: "end_turn",
          toolsCalled: [],
        });

        expect(logger.getTotalTokens()).toBe(initialTokens + 150);
      });
    });
  });

  describe("状態変更ログ", () => {
    let logger: ComprehensiveLogger;

    beforeEach(() => {
      ({ logger } = createTestLogger());
      logger.startSession({
        piVersion: "1.0.0",
        nodeVersion: process.version,
        platform: process.platform,
        cwd: process.cwd(),
        envKeys: [],
        configHash: "test",
      });
    });

    afterEach(() => {
      logger.endSession("normal");
    });

    it("状態変更を記録", () => {
      const initialCount = logger.getEventCount();
      logger.logStateChange({
        entityType: "file",
        entityPath: "test.ts",
        changeType: "update",
        beforeContent: "old content",
        afterContent: "new content",
      });

      expect(logger.getEventCount()).toBe(initialCount + 1);
    });

    it("diff付き", () => {
      logger.logStateChange({
        entityType: "file",
        entityPath: "test.ts",
        changeType: "update",
        diff: { additions: 5, deletions: 2, hunks: 3 },
      });
    });
  });

  describe("メトリクス", () => {
    let logger: ComprehensiveLogger;

    beforeEach(() => {
      ({ logger } = createTestLogger());
      logger.startSession({
        piVersion: "1.0.0",
        nodeVersion: process.version,
        platform: process.platform,
        cwd: process.cwd(),
        envKeys: [],
        configHash: "test",
      });
    });

    afterEach(() => {
      logger.endSession("normal");
    });

    it("メトリクススナップショットを記録", () => {
      const initialCount = logger.getEventCount();
      logger.logMetricsSnapshot({
        memoryUsageMB: 100,
        cpuPercent: 50,
        tasksCompleted: 10,
        operationsCompleted: 20,
        toolCallsTotal: 30,
        tokensTotal: 1000,
        errorRate: 0.05,
        avgResponseTimeMs: 200,
        p95ResponseTimeMs: 500,
      });

      expect(logger.getEventCount()).toBe(initialCount + 1);
    });
  });

  describe("flush", () => {
    it("バッファをフラッシュ", async () => {
      const { logger, logDir } = createTestLogger();
      logger.startSession({
        piVersion: "1.0.0",
        nodeVersion: process.version,
        platform: process.platform,
        cwd: process.cwd(),
        envKeys: [],
        configHash: "test",
      });

      await logger.flush();

      const files = fs.existsSync(logDir) ? fs.readdirSync(logDir) : [];
      expect(files.some(f => f.startsWith("events-") && f.endsWith(".jsonl"))).toBe(true);
      logger.endSession("normal");
    });

    it("空バッファ_何もしない", async () => {
      const { logger } = createTestLogger();
      await expect(logger.flush()).resolves.not.toThrow();
      logger.endSession("normal");
    });
  });

  describe("ゲッター", () => {
    let logger: ComprehensiveLogger;

    beforeEach(() => {
      ({ logger } = createTestLogger());
    });

    afterEach(() => {
      logger.endSession("normal");
    });

    it("getSessionId", () => {
      expect(logger.getSessionId()).toBeDefined();
    });

    it("getCurrentTaskId_初期値は空", () => {
      expect(logger.getCurrentTaskId()).toBe("");
    });

    it("getCurrentOperationId_初期値は空", () => {
      expect(logger.getCurrentOperationId()).toBe("");
    });

    it("getEventCount_初期値は0", () => {
      const { logger: freshLogger } = createTestLogger();
      expect(freshLogger.getEventCount()).toBe(0);
      freshLogger.endSession("normal");
    });

    it("getErrorCount_初期値は0", () => {
      expect(logger.getErrorCount()).toBe(0);
    });

    it("getTotalTokens_初期値は0", () => {
      expect(logger.getTotalTokens()).toBe(0);
    });
  });
});

// ============================================================================
// シングルトン関数テスト
// ============================================================================

describe("getLogger / resetLogger", () => {
  beforeEach(() => {
    resetLogger();
  });

  afterEach(() => {
    resetLogger();
  });

  it("getLogger_シングルトンを返す", () => {
    const logger1 = getLogger();
    const logger2 = getLogger();
    expect(logger1).toBe(logger2);
    logger1.endSession("normal");
  });

  it("resetLogger_シングルトンをリセット", () => {
    const logger1 = getLogger();
    logger1.endSession("normal");
    resetLogger();

    const logger2 = getLogger();
    expect(logger1).not.toBe(logger2);
    logger2.endSession("normal");
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("複数イベント記録_イベント数が正確", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        async (eventCount) => {
          const { logger } = createTestLogger();

          logger.startSession({
            piVersion: "1.0.0",
            nodeVersion: process.version,
            platform: process.platform,
            cwd: process.cwd(),
            envKeys: [],
            configHash: "test",
          });

          for (let i = 0; i < eventCount; i++) {
            logger.startTask(`Task ${i}`, {
              filesReferenced: [],
              skillsLoaded: [],
              teamsAvailable: [],
            });
            logger.endTask({
              status: "success",
              operationsCount: 0,
              toolsCount: 0,
              tokensUsed: 0,
              filesCreated: [],
              filesModified: [],
              filesDeleted: [],
              commandsExecuted: [],
              summary: `Task ${i} done`,
              errors: [],
            });
          }

          const expectedCount = 1 + eventCount * 2;
          expect(logger.getEventCount()).toBe(expectedCount);

          logger.endSession("normal");
        }
      )
    );
  });

  it("トークン集計_正確", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 1000 }), { maxLength: 10 }),
        async (tokenAmounts) => {
          const { logger } = createTestLogger();

          logger.startSession({
            piVersion: "1.0.0",
            nodeVersion: process.version,
            platform: process.platform,
            cwd: process.cwd(),
            envKeys: [],
            configHash: "test",
          });

          tokenAmounts.forEach((tokens) => {
            logger.logLLMResponse({
              provider: "test",
              model: "test",
              inputTokens: tokens,
              outputTokens: 0,
              durationMs: 0,
              responseLength: 0,
              stopReason: "end_turn",
              toolsCalled: [],
            });
          });

          const expectedTotal = tokenAmounts.reduce((sum, t) => sum + t, 0);
          expect(logger.getTotalTokens()).toBe(expectedTotal);

          logger.endSession("normal");
        }
      )
    );
  });
});
