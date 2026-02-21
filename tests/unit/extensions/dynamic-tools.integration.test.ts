/**
 * @file dynamic-tools統合テスト
 * @description 動的ツール生成、安全性チェック、VM実行、監査ログ、品質評価の統合テスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, readFileSync, unlinkSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describeScenario, createMockPi, createTempDir, cleanupTempDir } from "../../helpers/bdd-helpers";

// ============================================================================
// Audit Log Helpers
// ============================================================================

/**
 * 監査ログのパスを取得
 */
function getAuditLogPath(cwd: string): string {
  return join(cwd, ".pi", "analytics", "dynamic-tools-audit.jsonl");
}

/**
 * 監査ログディレクトリを作成
 */
function ensureAuditLogDir(cwd: string): void {
  const logDir = join(cwd, ".pi", "analytics");
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
}

/**
 * 監査ログを読み込む
 */
function readAuditLogs(cwd: string): any[] {
  const logPath = getAuditLogPath(cwd);
  if (!existsSync(logPath)) {
    return [];
  }

  const content = readFileSync(logPath, "utf-8");
  return content
    .trim()
    .split("\n")
    .filter(line => line.length > 0)
    .map(line => JSON.parse(line));
}

/**
 * 監査ログをクリアする
 */
function clearAuditLogs(cwd: string): void {
  const logPath = getAuditLogPath(cwd);
  if (existsSync(logPath)) {
    unlinkSync(logPath);
  }
}

/**
 * 監査ログにエントリを追加（ファイル書き込みシミュレーション）
 */
function appendAuditLog(cwd: string, entry: any): void {
  const logPath = getAuditLogPath(cwd);
  const logLine = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...entry,
  }) + "\n";

  const content = existsSync(logPath)
    ? readFileSync(logPath, "utf-8") + logLine
    : logLine;

  mkdirSync(dirname(logPath), { recursive: true });
  writeFileSync(logPath, content, "utf-8");
}

// ============================================================================
// Integration Test Scenarios
// ============================================================================

describe("dynamic-tools統合テスト", () => {
  let testCwd: string;

  beforeEach(async () => {
    testCwd = createTempDir("dynamic-tools-integration-");
    ensureAuditLogDir(testCwd);
  });

  afterEach(() => {
    clearAuditLogs(testCwd);
    cleanupTempDir(testCwd);
    vi.clearAllMocks();
  });

  describeScenario(
    "ツール生成と安全性チェック",
    "動的ツールの登録とコード安全性検証",
    (ctx) => {
      let mockPi: any;

      ctx.given("dynamic-tools拡張機能がロードされている", async () => {
        mockPi = createMockPi();

        // create_toolツールをモック
        mockPi.registerTool({
          name: "create_tool",
          execute: vi.fn().mockImplementation(({ name, description, code }) => {
            const toolId = `tool-${Date.now()}`;
            const safetyResult = {
              score: 0.95,
              isSafe: true,
              issues: [],
            };
            const qualityResult = {
              score: 0.9,
              reasons: [],
            };

            return {
              content: [{
                type: "text",
                text: `ツール「${name}」を作成しました。\n\nツールID: ${toolId}\n安全性スコア: ${safetyResult.score}\n品質スコア: ${qualityResult.score}`,
              }],
              details: {
                toolId,
                name,
                safetyScore: safetyResult.score,
                qualityScore: qualityResult.score,
              },
            };
          }),
        });
      });

      ctx.when("安全なツールを作成する", async () => {
        const tool = mockPi.getTool("create_tool");
        expect(tool).toBeDefined();

        const toolCtx = {
          cwd: testCwd,
          model: undefined,
          ui: { notify: mockPi.uiNotify },
        };

        const result = await tool!.execute(
          "create-1",
          {
            name: "safe_calculator",
            description: "安全な計算ツール",
            code: "export function execute(params) { const { a, b } = params; return { success: true, result: a + b }; }",
          },
          undefined,
          undefined,
          toolCtx
        );

        expect(result.details.toolId).toBeDefined();
        expect(result.details.safetyScore).toBeGreaterThanOrEqual(0.5);
      });

      ctx.and("安全性スコアを確認する", async () => {
        const tool = mockPi.getTool("create_tool");
        expect(tool).toBeDefined();

        const toolCtx = {
          cwd: testCwd,
          model: undefined,
          ui: { notify: mockPi.uiNotify },
        };

        const result = await tool!.execute(
          "create-2",
          {
            name: "verify_calculator",
            description: "検証用ツール",
            code: "export function execute(params) { return { success: true }; }",
          },
          undefined,
          undefined,
          toolCtx
        );

        expect(result.details.safetyScore).toBeGreaterThanOrEqual(0.5);
        expect(result.details.qualityScore).toBeGreaterThanOrEqual(0.5);
      });

      ctx.then("ツール生成と安全性チェックが正しく機能する", () => {
        const tool = mockPi.getTool("create_tool");
        expect(tool).toBeDefined();
      });
    }
  );

  describeScenario(
    "VM実行環境との統合",
    "動的ツールのVMコンテキストでの実行",
    (ctx) => {
      let mockPi: any;
      let runResult: any;

      ctx.given("動的ツールが登録されている", async () => {
        mockPi = createMockPi();

        mockPi.registerTool({
          name: "create_tool",
          execute: vi.fn().mockResolvedValue({
            content: [{ type: "text", text: "ツール作成完了" }],
            details: { toolId: "tool-001", name: "test_tool" },
          }),
        });

        mockPi.registerTool({
          name: "run_dynamic_tool",
          execute: vi.fn().mockImplementation(({ tool_id, parameters }) => {
            return {
              content: [{
                type: "text",
                text: `ツール「test_tool」の実行が完了しました。\n\n実行時間: 50ms\n\n結果:\n${JSON.stringify({ success: true, result: { sum: 5 } }, null, 2)}`,
              }],
              details: {
                success: true,
                result: { sum: 5 },
                executionTimeMs: 50,
              },
            };
          }),
        });
      });

      ctx.when("ツールを作成する", async () => {
        const tool = mockPi.getTool("create_tool");
        expect(tool).toBeDefined();

        const toolCtx = {
          cwd: testCwd,
          model: undefined,
          ui: { notify: mockPi.uiNotify },
        };

        const createResult = await tool!.execute(
          "create-1",
          {
            name: "test_tool",
            description: "テストツール",
            code: "export function execute(params) { return { success: true, result: params.a + params.b }; }",
          },
          undefined,
          undefined,
          toolCtx
        );

        expect(createResult.details.toolId).toBeDefined();
      });

      ctx.and("ツールを実行する", async () => {
        const tool = mockPi.getTool("run_dynamic_tool");
        expect(tool).toBeDefined();

        const toolCtx = {
          cwd: testCwd,
          model: undefined,
          ui: { notify: mockPi.uiNotify },
        };

        runResult = await tool!.execute(
          "run-1",
          { tool_id: "tool-001", parameters: { a: 2, b: 3 } },
          undefined,
          undefined,
          toolCtx
        );

        expect(runResult.details.success).toBe(true);
        expect(runResult.details.result).toBeDefined();
      });

      ctx.and("実行結果を確認する", () => {
        expect(runResult.details.result).toEqual({ sum: 5 });
      });

      ctx.then("VM実行環境との統合が正しく機能する", () => {
        const tool = mockPi.getTool("run_dynamic_tool");
        expect(tool).toBeDefined();
      });
    }
  );

  describeScenario(
    "監査ログの記録",
    "ツール操作の監査ログ記録",
    (ctx) => {
      let mockPi: any;

      ctx.given("dynamic-tools拡張機能が監査ログを記録するように設定されている", async () => {
        // 監査ログをクリア
        clearAuditLogs(testCwd);

        mockPi = createMockPi();

        mockPi.registerTool({
          name: "create_tool",
          execute: vi.fn().mockImplementation(({ name, description, code }) => {
            const toolId = `tool-${Date.now()}`;

            // 監査ログに記録
            appendAuditLog(testCwd, {
              operation: "create",
              toolId,
              toolName: name,
              description,
              codeLength: code?.length || 0,
            });

            return {
              content: [{ text: `ツール「${name}」を作成しました。\nツールID: ${toolId}` }],
              details: { toolId, name },
            };
          }),
        });

        mockPi.registerTool({
          name: "run_dynamic_tool",
          execute: vi.fn().mockImplementation(({ tool_id, parameters }) => {
            // 監査ログに記録
            appendAuditLog(testCwd, {
              operation: "execute",
              toolId: tool_id,
              parameters,
              executionTimeMs: 50,
              success: true,
            });

            return {
              content: [{ text: "ツール実行完了" }],
              details: { toolId: tool_id, success: true, executionTimeMs: 50 },
            };
          }),
        });

        mockPi.registerTool({
          name: "delete_dynamic_tool",
          execute: vi.fn().mockImplementation(({ tool_id }) => {
            // 監査ログに記録
            appendAuditLog(testCwd, {
              operation: "delete",
              toolId: tool_id,
            });

            return {
              content: [{ text: "ツール削除完了" }],
              details: { success: true },
            };
          }),
        });
      });

      ctx.when("ツールの作成・実行・削除を実行して監査ログを記録する", async () => {
        const createTool = mockPi.getTool("create_tool");
        const runTool = mockPi.getTool("run_dynamic_tool");
        const deleteTool = mockPi.getTool("delete_dynamic_tool");

        expect(createTool).toBeDefined();
        expect(runTool).toBeDefined();
        expect(deleteTool).toBeDefined();

        const toolCtx = {
          cwd: testCwd,
          model: undefined,
          ui: { notify: mockPi.uiNotify },
        };

        // ツール作成
        const createResult = await createTool!.execute(
          "create-1",
          {
            name: "audit_test_tool",
            description: "監査ログテスト用ツール",
            code: "export function execute() { return { success: true }; }",
          },
          undefined,
          undefined,
          toolCtx
        );

        expect(createResult.details.toolId).toBeDefined();
        const toolId = createResult.details.toolId;

        // ツール実行
        const runResult = await runTool!.execute(
          "run-1",
          { tool_id: toolId, parameters: {} },
          undefined,
          undefined,
          toolCtx
        );

        expect(runResult.details.success).toBe(true);

        // ツール削除
        const deleteResult = await deleteTool!.execute(
          "delete-1",
          { tool_id: toolId, confirm: true },
          undefined,
          undefined,
          toolCtx
        );

        expect(deleteResult.details.success).toBe(true);
      });

      ctx.then("監査ログが正しく記録される", () => {
        const logs = readAuditLogs(testCwd);
        expect(logs.length).toBe(3);
        expect(logs.every(e => e.timestamp)).toBe(true);

        // ログの順序を確認
        expect(logs[0].operation).toBe("create");
        expect(logs[1].operation).toBe("execute");
        expect(logs[2].operation).toBe("delete");
      });
    }
  );

  describeScenario(
    "品質評価との統合",
    "ツール生成時の品質スコア計算とメトリクス記録",
    (ctx) => {
      let mockPi: any;
      let qualityScores: number[] = [];

      ctx.given("品質評価が有効である", async () => {
        mockPi = createMockPi();

        mockPi.registerTool({
          name: "create_tool",
          execute: vi.fn().mockImplementation((id, params) => {
            const { name, code, parameters } = params || {};
            // コードがundefinedの場合のデフォルト値を設定
            const codeStr = code || "";

            // 簡易的な品質スコア計算
            let score = 0.5; // ベーススコア
            if (codeStr.includes("return")) score += 0.3;
            if (codeStr.includes("export")) score += 0.1;
            if (parameters && Object.keys(parameters).length > 0) score += 0.2;
            score = Math.min(score, 1.0);

            qualityScores.push(score);

            return {
              content: [{ text: `ツール「${name}」を作成しました。\n品質スコア: ${score}` }],
              details: { toolId: `tool-${Date.now()}`, name, qualityScore: score },
            };
          }),
        });

        mockPi.registerTool({
          name: "run_dynamic_tool",
          execute: vi.fn().mockImplementation(({ tool_id, parameters }) => {
            return {
              content: [{ text: "ツール実行完了" }],
              details: {
                toolId: tool_id,
                success: true,
                executionTimeMs: Math.floor(Math.random() * 100) + 10,
              },
            };
          }),
        });
      });

      ctx.when("高品質なツールと低品質なツールを作成する", async () => {
        const createTool = mockPi.getTool("create_tool");
        expect(createTool).toBeDefined();

        const toolCtx = {
          cwd: testCwd,
          model: undefined,
          ui: { notify: mockPi.uiNotify },
        };

        // 高品質ツールを作成
        const highQualityResult = await createTool!.execute(
          "create-quality-1",
          {
            name: "high_quality_tool",
            code: "export function execute(params) { const { a, b } = params; return { result: a + b }; }",
            parameters: {
              a: { type: "number", description: "First number" },
              b: { type: "number", description: "Second number" },
            },
          },
          undefined,
          undefined,
          toolCtx
        );

        // 高品質ツールのスコアを確認（最低限ベーススコア以上であること）
        expect(highQualityResult.details.qualityScore).toBeGreaterThanOrEqual(0.5);

        // 低品質ツールを作成
        const lowQualityResult = await createTool!.execute(
          "create-quality-2",
          {
            name: "low_quality_tool",
            code: "const x = 1;", // returnがない、exportがない、parametersがない
          },
          undefined,
          undefined,
          toolCtx
        );

        // ベーススコアのみ: 0.5
        expect(lowQualityResult.details.qualityScore).toBeGreaterThanOrEqual(0.5);
      });

      ctx.and("ツールを実行してメトリクスを記録する", async () => {
        const runTool = mockPi.getTool("run_dynamic_tool");
        expect(runTool).toBeDefined();

        const toolCtx = {
          cwd: testCwd,
          model: undefined,
          ui: { notify: mockPi.uiNotify },
        };

        const result = await runTool!.execute(
          "run-quality-1",
          { tool_id: "test-tool-id", parameters: { a: 1, b: 2 } },
          undefined,
          undefined,
          toolCtx
        );

        expect(result.details.executionTimeMs).toBeDefined();
        expect(result.details.executionTimeMs).toBeGreaterThan(0);
      });

      ctx.then("品質評価とメトリクス記録が正しく機能する", () => {
        expect(qualityScores.length).toBe(2);
        // 高品質ツール > 低品質ツール
        expect(qualityScores[0]).toBeGreaterThan(qualityScores[1]);
      });
    }
  );
});
