/**
 * dynamic-tools/reflection.tsの単体テスト
 * ツール実行後のリフレクション機能を検証する
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  detectRepetitivePattern,
  shouldCreateNewTool,
  buildReflectionPrompt,
  proposeToolFromTask,
  shouldTriggerReflection,
} from "../../../lib/dynamic-tools/reflection.js";
import { type ToolReflectionContext, type ToolReflectionResult } from "../../../lib/dynamic-tools/types.js";

describe("dynamic-tools/reflection", () => {
  let tempDir: string;
  let paths: { toolsDir: string; auditLogFile: string; toolsIndexFile: string };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "reflection-test-"));
    paths = {
      toolsDir: path.join(tempDir, "tools"),
      auditLogFile: path.join(tempDir, "audit.log.jsonl"),
      toolsIndexFile: path.join(tempDir, "tools-index.json"),
    };
    fs.mkdirSync(paths.toolsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("detectRepetitivePattern", () => {
    it("同じツールの繰り返し使用を検出する", () => {
      // Arrange
      const context: ToolReflectionContext = {
        lastToolName: "git_status",
        lastToolResult: "On branch main",
        currentTask: "Check git status and commit",
        failureCount: 0,
      };

      // Act
      const result = detectRepetitivePattern(context);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.detected).toBe(true);
      expect(result?.pattern).toContain("repeated_tool_use");
    });

    it("Bashコマンドパターンを検出する", () => {
      // Arrange
      const context: ToolReflectionContext = {
        lastToolName: "bash",
        lastToolResult: "$ git status\nOn branch main\n$ npm test",
        currentTask: "Run tests",
        failureCount: 0,
      };

      // Act
      const result = detectRepetitivePattern(context);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.detected).toBe(true);
      expect(result?.pattern).toContain("bash_pattern");
    });

    it("パターンが見つからない場合はnullを返す", () => {
      // Arrange
      const context: ToolReflectionContext = {
        lastToolName: undefined,
        lastToolResult: "No special output",
        currentTask: "Do something new",
        failureCount: 0,
      };

      // Act
      const result = detectRepetitivePattern(context);

      // Assert
      expect(result).toBeNull();
    });

    it("Dockerコマンドを検出する", () => {
      // Arrange
      const context: ToolReflectionContext = {
        lastToolName: "bash",
        lastToolResult: "$ docker ps\n$ docker build -t app .",
        currentTask: "Build container",
        failureCount: 0,
      };

      // Act
      const result = detectRepetitivePattern(context);

      // Assert
      expect(result).not.toBeNull();
    });
  });

  describe("shouldCreateNewTool", () => {
    it("繰り返しパターンがある場合はツール生成を推奨する", () => {
      // Arrange
      const context: ToolReflectionContext = {
        lastToolName: "test_tool",
        lastToolResult: "Output",
        currentTask: "test_tool again with test_tool",
        failureCount: 0,
        patternMatch: {
          detected: true,
          pattern: "repeated_tool_use:test_tool",
          occurrences: 2,
        },
      };

      // Act
      const result = shouldCreateNewTool(context);

      // Assert
      expect(result.shouldCreateTool).toBe(true);
      expect(result.proposedTool).toBeDefined();
      expect(result.proposedTool?.name).toBeDefined();
    });

    it("失敗回数が多い場合はツール生成を推奨する", () => {
      // Arrange
      const context: ToolReflectionContext = {
        lastToolName: "failing_tool",
        lastToolResult: "Error occurred",
        currentTask: "Complete the task",
        failureCount: 3,
      };

      // Act
      const result = shouldCreateNewTool(context);

      // Assert
      expect(result.shouldCreateTool).toBe(true);
      expect(result.reflectionReason).toContain("失敗");
    });

    it("エラーを含む結果は改善提案を含む", () => {
      // Arrange
      const context: ToolReflectionContext = {
        lastToolName: "tool",
        lastToolResult: "Error: Something went wrong",
        currentTask: "Do something",
        failureCount: 1,
      };

      // Act
      const result = shouldCreateNewTool(context);

      // Assert
      const hasErrorSuggestion = result.improvementSuggestions.some(s =>
        s.includes("エラー") || s.includes("堅牢")
      );
      expect(hasErrorSuggestion).toBe(true);
    });

    it("複雑なチェーンを検出する", () => {
      // Arrange
      const context: ToolReflectionContext = {
        lastToolName: "bash",
        lastToolResult: "$ cat file | grep pattern | sed 's/a/b/' | awk '{print $1}'",
        currentTask: "Process file",
        failureCount: 0,
      };

      // Act
      const result = shouldCreateNewTool(context);

      // Assert
      const hasChainSuggestion = result.improvementSuggestions.some(s =>
        s.includes("組み合わせ") || s.includes("チェーン")
      );
      expect(hasChainSuggestion).toBe(true);
    });

    it("問題がない場合はツール生成を推奨しない", () => {
      // Arrange
      const context: ToolReflectionContext = {
        lastToolName: undefined,
        lastToolResult: undefined,
        currentTask: "New task",
        failureCount: 0,
      };

      // Act
      const result = shouldCreateNewTool(context);

      // Assert
      expect(result.shouldCreateTool).toBe(false);
      expect(result.needsReflection).toBe(false);
    });
  });

  describe("buildReflectionPrompt", () => {
    it("完全なリフレクションプロンプトを生成する", () => {
      // Arrange
      const context: ToolReflectionContext = {
        lastToolName: "test_tool",
        lastToolResult: "Result",
        currentTask: "Test task",
        failureCount: 1,
      };

      const reflectionResult: ToolReflectionResult = {
        needsReflection: true,
        shouldCreateTool: true,
        proposedTool: {
          name: "auto_test_tool",
          description: "Automated test tool",
          mode: "bash",
          code: "echo test",
          reason: "Detected repetitive pattern",
        },
        improvementSuggestions: ["Consider improving X"],
        reflectionReason: "Pattern detected",
      };

      // Act
      const prompt = buildReflectionPrompt(context, reflectionResult);

      // Assert
      expect(prompt).toContain("# ツール実行後のリフレクション");
      expect(prompt).toContain("現在のタスク: Test task");
      expect(prompt).toContain("auto_test_tool");
      expect(prompt).toContain("改善提案");
    });

    it("ツール生成がない場合はシンプルなプロンプトを生成する", () => {
      // Arrange
      const context: ToolReflectionContext = {
        lastToolName: "tool",
        lastToolResult: "OK",
        currentTask: "Task",
        failureCount: 0,
      };

      const reflectionResult: ToolReflectionResult = {
        needsReflection: false,
        shouldCreateTool: false,
        improvementSuggestions: [],
        reflectionReason: "",
      };

      // Act
      const prompt = buildReflectionPrompt(context, reflectionResult);

      // Assert
      expect(prompt).toContain("特別なアクションは必要ありません");
    });
  });

  describe("proposeToolFromTask", () => {
    it("Git関連タスクからツールを提案する", () => {
      // Arrange & Act
      const result = proposeToolFromTask("Create a git commit for changes");

      // Assert
      expect(result).not.toBeNull();
      expect(result?.name).toContain("git");
    });

    it("ファイル検索タスクからツールを提案する", () => {
      // Arrange & Act
      const result = proposeToolFromTask("Search for config files");

      // Assert
      expect(result).not.toBeNull();
      expect(result?.name).toContain("search");
    });

    it("テキスト置換タスクからツールを提案する", () => {
      // Arrange & Act
      const result = proposeToolFromTask("Replace old text with new text");

      // Assert
      expect(result).not.toBeNull();
      expect(result?.name).toContain("replace");
    });

    it("該当しないタスクはnullを返す", () => {
      // Arrange & Act
      const result = proposeToolFromTask("Analyze the code structure");

      // Assert
      expect(result).toBeNull();
    });

    it("Bashコマンドを含む結果からツールを提案する", () => {
      // Arrange & Act
      const result = proposeToolFromTask(
        "Run tests",
        "Output: $ npm run test\nAll tests passed"
      );

      // Assert
      expect(result).not.toBeNull();
    });
  });

  describe("shouldTriggerReflection", () => {
    it("失敗がある場合はリフレクションが必要", () => {
      // Arrange & Act
      const result = shouldTriggerReflection({ failureCount: 1 });

      // Assert
      expect(result).toBe(true);
    });

    it("ツールが使用されている場合はリフレクションが必要", () => {
      // Arrange & Act
      const result = shouldTriggerReflection({
        lastToolName: "tool",
        lastToolResult: "result",
      });

      // Assert
      expect(result).toBe(true);
    });

    it("パターンが検出されている場合はリフレクションが必要", () => {
      // Arrange & Act
      const result = shouldTriggerReflection({
        patternMatch: { detected: true, pattern: "test", occurrences: 1 },
      });

      // Assert
      expect(result).toBe(true);
    });

    it("条件がない場合はリフレクション不要", () => {
      // Arrange & Act
      const result = shouldTriggerReflection({});

      // Assert
      expect(result).toBe(false);
    });
  });
});
