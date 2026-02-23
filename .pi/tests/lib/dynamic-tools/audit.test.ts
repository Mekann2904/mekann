/**
 * dynamic-tools/audit.tsの単体テスト
 * 監査ログの記録・読み込み機能を検証する
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  logAudit,
  readAuditLog,
  getToolHistory,
  getAuditStatistics,
  formatAuditLogEntry,
  generateAuditReport,
  archiveOldLogs,
  type AuditLogEntry,
} from "../../../lib/dynamic-tools/audit.js";

describe("dynamic-tools/audit", () => {
  let tempDir: string;
  let paths: { auditLogFile: string };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-test-"));
    paths = { auditLogFile: path.join(tempDir, "audit.log.jsonl") };
  });

  afterEach(() => {
    // テンポラリディレクトリを削除
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("logAudit", () => {
    it("監査エントリを記録し、エントリを返す", async () => {
      // Arrange
      const entry = {
        action: "tool_created" as const,
        toolId: "test-tool-1",
        toolName: "Test Tool",
        actor: "user",
        details: { reason: "test" },
        success: true,
      };

      // Act
      const result = await logAudit(entry, paths);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.action).toBe("tool_created");
      expect(result.toolId).toBe("test-tool-1");
      expect(result.success).toBe(true);
    });

    it("エラーメッセージを含むエントリを記録できる", async () => {
      // Arrange
      const entry = {
        action: "tool_executed" as const,
        toolId: "test-tool",
        actor: "system",
        details: {},
        success: false,
        errorMessage: "Something went wrong",
      };

      // Act
      const result = await logAudit(entry, paths);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe("Something went wrong");
    });

    it("複数のエントリを記録できる", async () => {
      // Arrange & Act
      await logAudit({
        action: "tool_created",
        actor: "user",
        details: {},
        success: true,
      }, paths);

      await logAudit({
        action: "tool_executed",
        actor: "system",
        details: {},
        success: true,
      }, paths);

      // Assert
      const logs = readAuditLog({}, paths);
      expect(logs.length).toBe(2);
    });

    it("エントリIDは一意である", async () => {
      // Arrange & Act
      const entry1 = await logAudit({
        action: "tool_created",
        actor: "user",
        details: {},
        success: true,
      }, paths);

      const entry2 = await logAudit({
        action: "tool_created",
        actor: "user",
        details: {},
        success: true,
      }, paths);

      // Assert
      expect(entry1.id).not.toBe(entry2.id);
    });
  });

  describe("readAuditLog", () => {
    it("ログファイルが存在しない場合は空配列を返す", () => {
      // Arrange & Act
      const logs = readAuditLog({}, paths);

      // Assert
      expect(logs).toEqual([]);
    });

    it("toolIdでフィルタリングできる", async () => {
      // Arrange
      await logAudit({
        action: "tool_created",
        toolId: "tool-1",
        actor: "user",
        details: {},
        success: true,
      }, paths);

      await logAudit({
        action: "tool_created",
        toolId: "tool-2",
        actor: "user",
        details: {},
        success: true,
      }, paths);

      // Act
      const logs = readAuditLog({ toolId: "tool-1" }, paths);

      // Assert
      expect(logs.length).toBe(1);
      expect(logs[0].toolId).toBe("tool-1");
    });

    it("actionでフィルタリングできる", async () => {
      // Arrange
      await logAudit({
        action: "tool_created",
        actor: "user",
        details: {},
        success: true,
      }, paths);

      await logAudit({
        action: "tool_executed",
        actor: "system",
        details: {},
        success: true,
      }, paths);

      // Act
      const logs = readAuditLog({ action: "tool_created" }, paths);

      // Assert
      expect(logs.length).toBe(1);
      expect(logs[0].action).toBe("tool_created");
    });

    it("件数制限を適用できる", async () => {
      // Arrange
      for (let i = 0; i < 10; i++) {
        await logAudit({
          action: "tool_executed",
          actor: "system",
          details: { index: i },
          success: true,
        }, paths);
      }

      // Act
      const logs = readAuditLog({ limit: 5 }, paths);

      // Assert
      expect(logs.length).toBe(5);
    });

    it("新しい順にソートされる", async () => {
      // Arrange
      await logAudit({
        action: "tool_created",
        actor: "user",
        details: { order: 1 },
        success: true,
      }, paths);

      await new Promise(r => setTimeout(r, 10)); // 少し待機

      await logAudit({
        action: "tool_executed",
        actor: "system",
        details: { order: 2 },
        success: true,
      }, paths);

      // Act
      const logs = readAuditLog({}, paths);

      // Assert
      expect(logs[0].action).toBe("tool_executed");
      expect(logs[1].action).toBe("tool_created");
    });
  });

  describe("getToolHistory", () => {
    it("特定ツールの履歴を取得できる", async () => {
      // Arrange
      await logAudit({
        action: "tool_created",
        toolId: "my-tool",
        actor: "user",
        details: {},
        success: true,
      }, paths);

      await logAudit({
        action: "tool_executed",
        toolId: "my-tool",
        actor: "system",
        details: {},
        success: true,
      }, paths);

      await logAudit({
        action: "tool_executed",
        toolId: "other-tool",
        actor: "system",
        details: {},
        success: true,
      }, paths);

      // Act
      const history = getToolHistory("my-tool", paths);

      // Assert
      expect(history.length).toBe(2);
      expect(history.every(e => e.toolId === "my-tool")).toBe(true);
    });
  });

  describe("getAuditStatistics", () => {
    it("統計情報を正しく計算する", async () => {
      // Arrange
      await logAudit({
        action: "tool_created",
        toolId: "tool-1",
        toolName: "Tool 1",
        actor: "user",
        details: {},
        success: true,
      }, paths);

      await logAudit({
        action: "tool_executed",
        toolId: "tool-1",
        toolName: "Tool 1",
        actor: "system",
        details: {},
        success: true,
      }, paths);

      await logAudit({
        action: "tool_executed",
        toolId: "tool-2",
        toolName: "Tool 2",
        actor: "system",
        details: {},
        success: false,
      }, paths);

      // Act
      const stats = getAuditStatistics(new Date(0), paths);

      // Assert
      expect(stats.totalActions).toBe(3);
      expect(stats.successfulActions).toBe(2);
      expect(stats.failedActions).toBe(1);
    });
  });

  describe("formatAuditLogEntry", () => {
    it("エントリを読みやすい形式でフォーマットする", () => {
      // Arrange
      const entry: AuditLogEntry = {
        id: "test-id",
        timestamp: "2024-01-15T10:30:00.000Z",
        action: "tool_created",
        toolName: "My Tool",
        actor: "user",
        details: {},
        success: true,
      };

      // Act
      const formatted = formatAuditLogEntry(entry);

      // Assert
      expect(formatted).toContain("[OK]");
      expect(formatted).toContain("tool_created");
      expect(formatted).toContain('tool="My Tool"');
      expect(formatted).toContain('actor="user"');
    });

    it("失敗エントリは[FAIL]を表示する", () => {
      // Arrange
      const entry: AuditLogEntry = {
        id: "test-id",
        timestamp: "2024-01-15T10:30:00.000Z",
        action: "tool_executed",
        actor: "system",
        details: {},
        success: false,
        errorMessage: "Connection failed",
      };

      // Act
      const formatted = formatAuditLogEntry(entry);

      // Assert
      expect(formatted).toContain("[FAIL]");
      expect(formatted).toContain('error="Connection failed"');
    });
  });

  describe("generateAuditReport", () => {
    it("監査レポートを生成する", async () => {
      // Arrange
      await logAudit({
        action: "tool_created",
        toolId: "test-tool",
        toolName: "Test Tool",
        actor: "user",
        details: {},
        success: true,
      }, paths);

      // Act
      const report = generateAuditReport(new Date(0), paths);

      // Assert
      expect(report).toContain("# 動的ツール監査レポート");
      expect(report).toContain("総操作数: 1");
      expect(report).toContain("tool_created: 1");
    });
  });

  describe("archiveOldLogs", () => {
    it("古いログをアーカイブする", async () => {
      // Arrange
      // 新しいエントリ
      await logAudit({
        action: "tool_created",
        actor: "user",
        details: {},
        success: true,
      }, paths);

      // Act
      // 負の値を渡して全て過去とみなす（-1日 = 昨日以前をアーカイブ = 今日のエントリもアーカイブ）
      const result = archiveOldLogs(-1, paths);

      // Assert
      expect(result.archived).toBe(1);
      const remaining = readAuditLog({}, paths);
      expect(remaining.length).toBe(0);
    });

    it("ログファイルが存在しない場合は0を返す", () => {
      // Arrange & Act
      const result = archiveOldLogs(30, paths);

      // Assert
      expect(result.archived).toBe(0);
    });
  });
});
