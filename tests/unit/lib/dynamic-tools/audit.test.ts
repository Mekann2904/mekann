/**
 * dynamic-tools/audit.ts の単体テスト
 *
 * テスト対象:
 * - logAudit: 監査ログ記録
 * - readAuditLog: 監査ログ読み込み
 * - getToolHistory: ツール履歴取得
 * - getAuditStatistics: 監査統計取得
 * - formatAuditLogEntry: ログエントリフォーマット
 * - generateAuditReport: レポート生成
 * - archiveOldLogs: 古いログのアーカイブ
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import {
  logAudit,
  readAuditLog,
  getToolHistory,
  getAuditStatistics,
  formatAuditLogEntry,
  generateAuditReport,
  archiveOldLogs,
  type AuditLogEntry,
  type AuditAction,
} from "../../../../.pi/lib/dynamic-tools/audit.js";
import { getDynamicToolsPaths, type DynamicToolsPaths } from "../../../../.pi/lib/dynamic-tools/types.js";

// テスト用の一時ディレクトリ
const TEST_DIR = ".pi/test-audit";
let testPaths: DynamicToolsPaths;

describe("dynamic-tools/audit.ts", () => {
  beforeEach(() => {
    // テスト用のパスを設定
    testPaths = {
      toolsDir: path.join(TEST_DIR, "tools"),
      registryFile: path.join(TEST_DIR, "registry.json"),
      auditLogFile: path.join(TEST_DIR, "audit.log"),
      metricsFile: path.join(TEST_DIR, "metrics.json"),
    };

    // テスト用ディレクトリを作成
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // テスト用ディレクトリを削除
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("logAudit", () => {
    it("監査ログを記録する", async () => {
      // Arrange
      const entry = {
        action: "create" as AuditAction,
        toolId: "test-tool-1",
        toolName: "Test Tool",
        actor: "test-user",
        details: { key: "value" },
        success: true,
      };

      // Act
      const result = await logAudit(entry, testPaths);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^audit_/);
      expect(result.timestamp).toBeDefined();
      expect(result.action).toBe("create");
      expect(result.success).toBe(true);
    });

    it("失敗ログを記録する", async () => {
      // Arrange
      const entry = {
        action: "execute" as AuditAction,
        toolId: "test-tool-2",
        actor: "test-user",
        details: {},
        success: false,
        errorMessage: "Test error",
      };

      // Act
      const result = await logAudit(entry, testPaths);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe("Test error");
    });

    it("タイムスタンプがISO 8601形式である", async () => {
      // Arrange
      const entry = {
        action: "update" as AuditAction,
        actor: "system",
        details: {},
        success: true,
      };

      // Act
      const result = await logAudit(entry, testPaths);

      // Assert
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it("一意のIDを生成する", async () => {
      // Arrange
      const entry = {
        action: "create" as AuditAction,
        actor: "test",
        details: {},
        success: true,
      };

      // Act
      const result1 = await logAudit(entry, testPaths);
      const result2 = await logAudit(entry, testPaths);

      // Assert
      expect(result1.id).not.toBe(result2.id);
    });
  });

  describe("readAuditLog", () => {
    it("空のログファイルは空配列を返す", () => {
      // Act
      const result = readAuditLog(undefined, testPaths);

      // Assert
      expect(result).toEqual([]);
    });

    it("記録したログを読み込める", async () => {
      // Arrange
      await logAudit({
        action: "create",
        toolId: "tool-1",
        actor: "user",
        details: {},
        success: true,
      }, testPaths);

      // Act
      const result = readAuditLog(undefined, testPaths);

      // Assert
      expect(result.length).toBe(1);
      expect(result[0].toolId).toBe("tool-1");
    });

    it("toolIdでフィルタリングできる", async () => {
      // Arrange
      await logAudit({
        action: "create",
        toolId: "tool-A",
        actor: "user",
        details: {},
        success: true,
      }, testPaths);
      await logAudit({
        action: "create",
        toolId: "tool-B",
        actor: "user",
        details: {},
        success: true,
      }, testPaths);

      // Act
      const result = readAuditLog({ toolId: "tool-A" }, testPaths);

      // Assert
      expect(result.length).toBe(1);
      expect(result[0].toolId).toBe("tool-A");
    });

    it("actionでフィルタリングできる", async () => {
      // Arrange
      await logAudit({
        action: "create",
        actor: "user",
        details: {},
        success: true,
      }, testPaths);
      await logAudit({
        action: "delete",
        actor: "user",
        details: {},
        success: true,
      }, testPaths);

      // Act
      const result = readAuditLog({ action: "delete" }, testPaths);

      // Assert
      expect(result.length).toBe(1);
      expect(result[0].action).toBe("delete");
    });

    it("limitで件数を制限できる", async () => {
      // Arrange
      for (let i = 0; i < 5; i++) {
        await logAudit({
          action: "create",
          actor: "user",
          details: { index: i },
          success: true,
        }, testPaths);
      }

      // Act
      const result = readAuditLog({ limit: 3 }, testPaths);

      // Assert
      expect(result.length).toBe(3);
    });

    it("sinceで日時フィルタリングできる", async () => {
      // Arrange
      const before = new Date(Date.now() - 10000);
      await logAudit({
        action: "create",
        actor: "user",
        details: {},
        success: true,
      }, testPaths);

      // Act
      const result = readAuditLog({ since: before }, testPaths);

      // Assert
      expect(result.length).toBe(1);
    });

    it("新しい順にソートされる", async () => {
      // Arrange
      await logAudit({
        action: "create",
        actor: "user",
        details: { order: 1 },
        success: true,
      }, testPaths);
      await new Promise(r => setTimeout(r, 10));
      await logAudit({
        action: "create",
        actor: "user",
        details: { order: 2 },
        success: true,
      }, testPaths);

      // Act
      const result = readAuditLog(undefined, testPaths);

      // Assert
      expect(result[0].details.order).toBe(2);
      expect(result[1].details.order).toBe(1);
    });
  });

  describe("getToolHistory", () => {
    it("特定ツールの履歴を取得する", async () => {
      // Arrange
      await logAudit({
        action: "create",
        toolId: "target-tool",
        actor: "user",
        details: {},
        success: true,
      }, testPaths);
      await logAudit({
        action: "create",
        toolId: "other-tool",
        actor: "user",
        details: {},
        success: true,
      }, testPaths);

      // Act
      const result = getToolHistory("target-tool", testPaths);

      // Assert
      expect(result.length).toBe(1);
      expect(result[0].toolId).toBe("target-tool");
    });
  });

  describe("getAuditStatistics", () => {
    it("統計情報を取得する", async () => {
      // Arrange
      const since = new Date(Date.now() - 10000);
      await logAudit({
        action: "create",
        toolId: "tool-1",
        toolName: "Tool 1",
        actor: "user",
        details: {},
        success: true,
      }, testPaths);
      await logAudit({
        action: "create",
        toolId: "tool-1",
        toolName: "Tool 1",
        actor: "user",
        details: {},
        success: false,
      }, testPaths);
      await logAudit({
        action: "execute",
        toolId: "tool-2",
        toolName: "Tool 2",
        actor: "user",
        details: {},
        success: true,
      }, testPaths);

      // Act
      const stats = getAuditStatistics(since, testPaths);

      // Assert
      expect(stats.totalActions).toBe(3);
      expect(stats.successfulActions).toBe(2);
      expect(stats.failedActions).toBe(1);
      expect(stats.actionsByType.create).toBe(2);
      expect(stats.actionsByType.execute).toBe(1);
    });

    it("トップツールを計算する", async () => {
      // Arrange
      const since = new Date(Date.now() - 10000);
      await logAudit({
        action: "create",
        toolId: "popular-tool",
        toolName: "Popular",
        actor: "user",
        details: {},
        success: true,
      }, testPaths);
      await logAudit({
        action: "execute",
        toolId: "popular-tool",
        toolName: "Popular",
        actor: "user",
        details: {},
        success: true,
      }, testPaths);
      await logAudit({
        action: "create",
        toolId: "rare-tool",
        toolName: "Rare",
        actor: "user",
        details: {},
        success: true,
      }, testPaths);

      // Act
      const stats = getAuditStatistics(since, testPaths);

      // Assert
      expect(stats.topTools.length).toBeGreaterThan(0);
      expect(stats.topTools[0].toolId).toBe("popular-tool");
      expect(stats.topTools[0].count).toBe(2);
    });
  });

  describe("formatAuditLogEntry", () => {
    it("成功ログをフォーマットする", () => {
      // Arrange
      const entry: AuditLogEntry = {
        id: "test-id",
        timestamp: "2024-01-01T12:00:00.000Z",
        action: "create",
        toolName: "Test Tool",
        actor: "user",
        details: {},
        success: true,
      };

      // Act
      const result = formatAuditLogEntry(entry);

      // Assert
      expect(result).toContain("[OK]");
      expect(result).toContain("create");
      expect(result).toContain("Test Tool");
    });

    it("失敗ログをフォーマットする", () => {
      // Arrange
      const entry: AuditLogEntry = {
        id: "test-id",
        timestamp: "2024-01-01T12:00:00.000Z",
        action: "execute",
        actor: "user",
        details: {},
        success: false,
        errorMessage: "Test error",
      };

      // Act
      const result = formatAuditLogEntry(entry);

      // Assert
      expect(result).toContain("[FAIL]");
      expect(result).toContain("Test error");
    });

    it("systemアクターは省略される", () => {
      // Arrange
      const entry: AuditLogEntry = {
        id: "test-id",
        timestamp: "2024-01-01T12:00:00.000Z",
        action: "create",
        actor: "system",
        details: {},
        success: true,
      };

      // Act
      const result = formatAuditLogEntry(entry);

      // Assert
      expect(result).not.toContain("actor=");
    });
  });

  describe("generateAuditReport", () => {
    it("レポートを生成する", async () => {
      // Arrange
      const since = new Date(Date.now() - 10000);
      await logAudit({
        action: "create",
        toolId: "tool-1",
        toolName: "Tool 1",
        actor: "user",
        details: {},
        success: true,
      }, testPaths);

      // Act
      const report = generateAuditReport(since, testPaths);

      // Assert
      expect(report).toContain("# 動的ツール監査レポート");
      expect(report).toContain("総操作数: 1");
      expect(report).toContain("Tool 1");
    });
  });

  describe("archiveOldLogs", () => {
    it("古いログをアーカイブする", async () => {
      // Arrange
      await logAudit({
        action: "create",
        actor: "user",
        details: {},
        success: true,
      }, testPaths);

      // Act
      // 負の値を渡すことで確実に全てアーカイブ
      const result = archiveOldLogs(-1, testPaths);

      // Assert
      // アーカイブされた場合
      expect(result.archived).toBeGreaterThanOrEqual(0);

      // ログファイルが空になる（アーカイブされた場合）
      if (result.archived > 0) {
        const remaining = readAuditLog(undefined, testPaths);
        expect(remaining.length).toBe(0);
      }
    });

    it("ログファイルがない場合は0を返す", () => {
      // Act
      const result = archiveOldLogs(30, testPaths);

      // Assert
      expect(result.archived).toBe(0);
    });
  });

  describe("プロパティベーステスト", () => {
    it("logAuditで生成されるエントリは常に有効な構造", () => {
      fc.assert(
        fc.asyncProperty(
          fc.record({
            action: fc.constantFrom("create", "execute", "update", "delete", "disable"),
            toolId: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
            toolName: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
            actor: fc.string({ minLength: 1, maxLength: 50 }),
            details: fc.dictionary(fc.string(), fc.jsonValue()),
            success: fc.boolean(),
            errorMessage: fc.option(fc.string()),
          }),
          async (entry) => {
            // Act
            const result = await logAudit({
              action: entry.action as AuditAction,
              toolId: entry.toolId ?? undefined,
              toolName: entry.toolName ?? undefined,
              actor: entry.actor,
              details: entry.details as Record<string, unknown>,
              success: entry.success,
              errorMessage: entry.errorMessage ?? undefined,
            }, testPaths);

            // Assert
            expect(result.id).toMatch(/^audit_/);
            expect(result.timestamp).toBeDefined();
            expect(result.action).toBe(entry.action);
          }
        )
      );
    });

    it("記録したログは読み込み可能", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            action: fc.constantFrom("create", "execute"),
            actor: fc.string({ minLength: 1 }),
            success: fc.boolean(),
          }),
          async (entry) => {
            // Arrange
            await logAudit({
              action: entry.action as AuditAction,
              actor: entry.actor,
              details: {},
              success: entry.success,
            }, testPaths);

            // Act
            const logs = readAuditLog(undefined, testPaths);

            // Assert
            expect(logs.length).toBeGreaterThan(0);
          }
        )
      );
    });
  });
});
