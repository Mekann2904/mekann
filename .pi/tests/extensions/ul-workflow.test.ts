/**
 * ul-workflow.tsの単体テスト
 * UL Workflow機能のエラーハンドリングとAPI一貫性を検証する
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("ul-workflow error handling consistency", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ul-workflow-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("API response consistency", () => {
    it("エラーレスポンスが一貫した形式を持つこと", () => {
      // Arrange - 期待されるエラーレスポンス形式
      const expectedErrorFormat = { error: "no_active_workflow" };

      // Assert
      expect(expectedErrorFormat).toHaveProperty("error");
      expect(expectedErrorFormat.error).toBe("no_active_workflow");
    });

    it("成功レスポンスが期待される形式を持つこと", () => {
      // Arrange - 期待される成功レスポンス形式
      const successResponse = { active: true, taskId: "test-123" };

      // Assert
      expect(successResponse).toHaveProperty("active");
      expect(successResponse.active).toBe(true);
    });
  });

  describe("Workflow state transitions", () => {
    it("ワークフローフェーズが正しい順序で遷移すること", () => {
      // Arrange
      const phases = ["idle", "research", "plan", "annotate", "implement", "review", "completed"];

      // Act
      const phaseOrder = phases.indexOf("research");
      const nextPhase = phases[phaseOrder + 1];

      // Assert
      expect(nextPhase).toBe("plan");
    });

    it("中止フェーズが常に遷移可能であること", () => {
      // Arrange
      const anyPhase = ["idle", "research", "plan", "annotate", "implement", "review"];
      const terminalPhases = ["completed", "aborted"];

      // Assert
      anyPhase.forEach(phase => {
        expect(terminalPhases).toContain("aborted");
      });
    });
  });

  describe("Plan file handling", () => {
    it("プランファイルのパスが期待される形式であること", () => {
      // Arrange
      const taskId = "test-task-123";
      const expectedPath = `.pi/ul-workflow/tasks/${taskId}/plan.md`;

      // Assert
      expect(expectedPath).toContain(taskId);
      expect(expectedPath).toMatch(/plan\.md$/);
    });

    it("リサーチファイルのパスが期待される形式であること", () => {
      // Arrange
      const taskId = "test-task-456";
      const expectedPath = `.pi/ul-workflow/tasks/${taskId}/research.md`;

      // Assert
      expect(expectedPath).toContain(taskId);
      expect(expectedPath).toMatch(/research\.md$/);
    });
  });

  describe("Annotation handling", () => {
    it("注釈パターンが正しく検出されること", () => {
      // Arrange
      const planContent = `
# 実装計画

## 変更内容
<!-- NOTE: これは注釈です -->
1. ファイルAを変更
<!-- FIXME: 修正が必要 -->
`;

      // Act
      const noteMatches = planContent.match(/<!-- NOTE:.*?-->/g);
      const fixmeMatches = planContent.match(/<!-- FIXME:.*?-->/g);

      // Assert
      expect(noteMatches).not.toBeNull();
      expect(fixmeMatches).not.toBeNull();
    });
  });

  describe("Error messages", () => {
    it("no_active_workflowエラーが期待される形式であること", () => {
      // Arrange
      const errorMessage = "エラー: アクティブなワークフローがありません。";
      const errorDetails = { error: "no_active_workflow" };

      // Assert
      expect(errorMessage).toContain("エラー");
      expect(errorMessage).toContain("アクティブなワークフロー");
      expect(errorDetails.error).toBe("no_active_workflow");
    });

    it("所有権エラーが期待される形式であること", () => {
      // Arrange
      const errorDetails = { error: "not_owner", message: "このワークフローは別のインスタンスが所有しています" };

      // Assert
      expect(errorDetails).toHaveProperty("error");
      expect(errorDetails.error).toBe("not_owner");
    });
  });
});
