/**
 * dynamic-tools/reflection.ts の単体テスト
 *
 * テスト対象:
 * - detectRepetitivePattern: 繰り返しパターン検出
 * - shouldCreateNewTool: ツール生成判定
 * - buildReflectionPrompt: リフレクションプロンプト生成
 * - proposeToolFromTask: タスクからツール提案
 * - shouldTriggerReflection: リフレクション要否判定
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import {
  detectRepetitivePattern,
  shouldCreateNewTool,
  buildReflectionPrompt,
  proposeToolFromTask,
  shouldTriggerReflection,
} from "../../../../.pi/lib/dynamic-tools/reflection.js";
import {
  type ToolReflectionContext,
  type ToolReflectionResult,
  getDynamicToolsPaths,
  type DynamicToolsPaths,
} from "../../../../.pi/lib/dynamic-tools/types.js";

// テスト用の一時ディレクトリ
const TEST_DIR = ".pi/test-reflection";
let testPaths: DynamicToolsPaths;

describe("dynamic-tools/reflection.ts", () => {
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

  describe("detectRepetitivePattern", () => {
    it("同じツールの繰り返し使用を検出する", () => {
      // Arrange
      const context: ToolReflectionContext = {
        lastToolName: "bash",
        lastToolResult: "実行結果",
        currentTask: "bashでコマンドを実行する",
        failureCount: 0,
      };

      // Act
      const result = detectRepetitivePattern(context);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.detected).toBe(true);
      expect(result?.pattern).toContain("repeated_tool_use");
    });

    it("Gitコマンドパターンを検出する", () => {
      // Arrange
      const context: ToolReflectionContext = {
        lastToolName: undefined,
        lastToolResult: "git status\ngit commit -m 'test'",
        currentTask: "テストタスク",
        failureCount: 0,
      };

      // Act
      const result = detectRepetitivePattern(context);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.detected).toBe(true);
      expect(result?.pattern).toContain("bash_pattern");
    });

    it("npmコマンドパターンを検出する", () => {
      // Arrange
      const context: ToolReflectionContext = {
        lastToolName: undefined,
        lastToolResult: "npm install\nnpm test",
        currentTask: "テストタスク",
        failureCount: 0,
      };

      // Act
      const result = detectRepetitivePattern(context);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.detected).toBe(true);
    });

    it("パターンがない場合はnullを返す", () => {
      // Arrange
      const context: ToolReflectionContext = {
        lastToolName: undefined,
        lastToolResult: "単純なテキスト",
        currentTask: "特別なパターンのないタスク",
        failureCount: 0,
      };

      // Act
      const result = detectRepetitivePattern(context);

      // Assert
      expect(result).toBeNull();
    });

    it("findコマンドパターンを検出する", () => {
      // Arrange
      const context: ToolReflectionContext = {
        lastToolName: undefined,
        lastToolResult: "find . -name '*.ts'",
        currentTask: "ファイル検索",
        failureCount: 0,
      };

      // Act
      const result = detectRepetitivePattern(context);

      // Assert
      expect(result?.detected).toBe(true);
    });

    it("dockerコマンドパターンを検出する", () => {
      // Arrange
      const context: ToolReflectionContext = {
        lastToolName: undefined,
        lastToolResult: "docker build -t app .",
        currentTask: "Dockerビルド",
        failureCount: 0,
      };

      // Act
      const result = detectRepetitivePattern(context);

      // Assert
      expect(result?.detected).toBe(true);
    });
  });

  describe("shouldCreateNewTool", () => {
    it("繰り返しパターンがある場合にツール作成を推奨する", () => {
      // Arrange
      const context: ToolReflectionContext = {
        lastToolName: "bash",
        lastToolResult: "結果",
        currentTask: "bashで処理 bashをもう一度",
        failureCount: 0,
      };

      // Act
      const result = shouldCreateNewTool(context);

      // Assert
      expect(result.shouldCreateTool).toBe(true);
      expect(result.proposedTool).toBeDefined();
    });

    it("失敗回数が多い場合にツール作成を推奨する", () => {
      // Arrange
      const context: ToolReflectionContext = {
        lastToolName: undefined,
        lastToolResult: "",
        currentTask: "難しいタスク",
        failureCount: 3,
      };

      // Act
      const result = shouldCreateNewTool(context);

      // Assert
      expect(result.shouldCreateTool).toBe(true);
      expect(result.reflectionReason).toContain("失敗");
    });

    it("パターンも失敗もない場合はツール作成を推奨しない", () => {
      // Arrange
      const context: ToolReflectionContext = {
        lastToolName: undefined,
        lastToolResult: "",
        currentTask: "通常のタスク",
        failureCount: 0,
      };

      // Act
      const result = shouldCreateNewTool(context);

      // Assert
      expect(result.shouldCreateTool).toBe(false);
      expect(result.needsReflection).toBe(false);
    });

    it("エラーを含む結果は改善提案を含む", () => {
      // Arrange
      const context: ToolReflectionContext = {
        lastToolName: undefined,
        lastToolResult: "Error: something went wrong",
        currentTask: "テストタスク",
        failureCount: 0,
      };

      // Act
      const result = shouldCreateNewTool(context);

      // Assert
      expect(result.improvementSuggestions.length).toBeGreaterThan(0);
      expect(result.needsReflection).toBe(true);
    });

    it("複雑なチェーンを含む結果は改善提案を含む", () => {
      // Arrange
      const context: ToolReflectionContext = {
        lastToolName: undefined,
        lastToolResult: "cmd1 | cmd2 | cmd3 | cmd4",
        currentTask: "テストタスク",
        failureCount: 0,
      };

      // Act
      const result = shouldCreateNewTool(context);

      // Assert
      expect(result.improvementSuggestions.some(s => s.includes("組み合わせ"))).toBe(true);
    });

    it("提案ツールには適切な名前が付く", () => {
      // Arrange
      const context: ToolReflectionContext = {
        lastToolName: "bash",
        lastToolResult: "結果",
        currentTask: "bashで処理 bashをもう一度実行 bashコマンド",
        failureCount: 0,
      };

      // Act
      const result = shouldCreateNewTool(context);

      // Assert
      if (result.proposedTool) {
        expect(result.proposedTool.name).toMatch(/^auto_/);
      }
    });
  });

  describe("buildReflectionPrompt", () => {
    it("リフレクションプロンプトを生成する", () => {
      // Arrange
      const context: ToolReflectionContext = {
        lastToolName: "bash",
        lastToolResult: "結果",
        currentTask: "テストタスク",
        failureCount: 0,
      };
      const reflectionResult: ToolReflectionResult = {
        needsReflection: true,
        shouldCreateTool: false,
        improvementSuggestions: ["改善案1"],
        reflectionReason: "テスト",
      };

      // Act
      const prompt = buildReflectionPrompt(context, reflectionResult);

      // Assert
      expect(prompt).toContain("# ツール実行後のリフレクション");
      expect(prompt).toContain("テストタスク");
      expect(prompt).toContain("bash");
    });

    it("ツール作成を推奨する場合は提案内容を含む", () => {
      // Arrange
      const context: ToolReflectionContext = {
        lastToolName: undefined,
        lastToolResult: "",
        currentTask: "テスト",
        failureCount: 3,
      };
      const reflectionResult: ToolReflectionResult = {
        needsReflection: true,
        shouldCreateTool: true,
        proposedTool: {
          name: "test_tool",
          description: "テストツール",
          mode: "bash",
          code: "echo test",
          reason: "テスト用",
        },
        improvementSuggestions: [],
        reflectionReason: "テスト",
      };

      // Act
      const prompt = buildReflectionPrompt(context, reflectionResult);

      // Assert
      expect(prompt).toContain("新しいツールの作成を推奨");
      expect(prompt).toContain("test_tool");
      expect(prompt).toContain("テストツール");
    });

    it("改善提案を含む場合は提案リストを含む", () => {
      // Arrange
      const context: ToolReflectionContext = {
        lastToolName: undefined,
        lastToolResult: "",
        currentTask: "テスト",
        failureCount: 0,
      };
      const reflectionResult: ToolReflectionResult = {
        needsReflection: true,
        shouldCreateTool: false,
        improvementSuggestions: ["提案A", "提案B"],
        reflectionReason: "テスト",
      };

      // Act
      const prompt = buildReflectionPrompt(context, reflectionResult);

      // Assert
      expect(prompt).toContain("### 改善提案");
      expect(prompt).toContain("提案A");
      expect(prompt).toContain("提案B");
    });

    it("パターンマッチ情報を含む", () => {
      // Arrange
      const context: ToolReflectionContext = {
        lastToolName: undefined,
        lastToolResult: "",
        currentTask: "テスト",
        failureCount: 0,
        patternMatch: {
          detected: true,
          pattern: "test_pattern",
          occurrences: 3,
        },
      };
      const reflectionResult: ToolReflectionResult = {
        needsReflection: true,
        shouldCreateTool: false,
        improvementSuggestions: [],
        reflectionReason: "",
      };

      // Act
      const prompt = buildReflectionPrompt(context, reflectionResult);

      // Assert
      expect(prompt).toContain("test_pattern");
      expect(prompt).toContain("3回");
    });
  });

  describe("proposeToolFromTask", () => {
    it("Gitコミットタスクからツールを提案する", () => {
      // Arrange
      const task = "git commitを作成する";

      // Act
      const result = proposeToolFromTask(task);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.name).toBe("auto_git_commit");
      expect(result?.mode).toBe("bash");
    });

    it("ファイル検索タスクからツールを提案する", () => {
      // Arrange
      const task = "ファイルを検索する";

      // Act
      const result = proposeToolFromTask(task);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.name).toBe("auto_search_files");
    });

    it("テキスト置換タスクからツールを提案する", () => {
      // Arrange
      const task = "テキストを置換する";

      // Act
      const result = proposeToolFromTask(task);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.name).toBe("auto_replace_text");
    });

    it("該当しないタスクはnullを返す", () => {
      // Arrange
      const task = "何か特別なタスク";

      // Act
      const result = proposeToolFromTask(task);

      // Assert
      // Bashパターンがない場合はnull
      expect(result).toBeNull();
    });

    it("英語のタスクも処理できる", () => {
      // Arrange
      const task = "search for files";

      // Act
      const result = proposeToolFromTask(task);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.name).toBe("auto_search_files");
    });

    it("最後のツール結果からBashコマンドを抽出できる", () => {
      // Arrange
      const task = "何かタスク";
      const lastToolResult = "npm run build";

      // Act
      const result = proposeToolFromTask(task, lastToolResult);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.code).toContain("npm");
    });
  });

  describe("shouldTriggerReflection", () => {
    it("失敗がある場合はtrueを返す", () => {
      // Arrange
      const context = { failureCount: 1 };

      // Act
      const result = shouldTriggerReflection(context);

      // Assert
      expect(result).toBe(true);
    });

    it("ツールと結果がある場合はtrueを返す", () => {
      // Arrange
      const context = {
        lastToolName: "bash",
        lastToolResult: "結果",
      };

      // Act
      const result = shouldTriggerReflection(context);

      // Assert
      expect(result).toBe(true);
    });

    it("パターンマッチがある場合はtrueを返す", () => {
      // Arrange
      const context = {
        patternMatch: { detected: true, pattern: "test", occurrences: 1 },
      };

      // Act
      const result = shouldTriggerReflection(context);

      // Assert
      expect(result).toBe(true);
    });

    it("条件がない場合はfalseを返す", () => {
      // Arrange
      const context = {};

      // Act
      const result = shouldTriggerReflection(context);

      // Assert
      expect(result).toBe(false);
    });

    it("失敗回数が0の場合はfalse", () => {
      // Arrange
      const context = { failureCount: 0 };

      // Act
      const result = shouldTriggerReflection(context);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe("プロパティベーステスト", () => {
    it("detectRepetitivePatternは任意のコンテキストでnullまたは有効な結果を返す", () => {
      fc.assert(
        fc.property(
          fc.record({
            lastToolName: fc.option(fc.string()),
            lastToolResult: fc.string(),
            currentTask: fc.string(),
            failureCount: fc.integer({ min: 0, max: 100 }),
          }),
          (context) => {
            // Act
            const result = detectRepetitivePattern(context as ToolReflectionContext);

            // Assert
            if (result !== null) {
              expect(result.detected).toBe(true);
              expect(typeof result.pattern).toBe("string");
              expect(typeof result.occurrences).toBe("number");
            }
          }
        )
      );
    });

    it("shouldCreateNewToolは常に有効なToolReflectionResultを返す", () => {
      fc.assert(
        fc.property(
          fc.record({
            lastToolName: fc.option(fc.string()),
            lastToolResult: fc.string(),
            currentTask: fc.string(),
            failureCount: fc.integer({ min: 0, max: 10 }),
          }),
          (context) => {
            // Act
            const result = shouldCreateNewTool(context as ToolReflectionContext);

            // Assert
            expect(typeof result.needsReflection).toBe("boolean");
            expect(typeof result.shouldCreateTool).toBe("boolean");
            expect(Array.isArray(result.improvementSuggestions)).toBe(true);

            if (result.proposedTool) {
              expect(typeof result.proposedTool.name).toBe("string");
              expect(typeof result.proposedTool.description).toBe("string");
              expect(["bash", "prompt"]).toContain(result.proposedTool.mode);
            }
          }
        )
      );
    });

    it("buildReflectionPromptは常に有効な文字列を返す", () => {
      fc.assert(
        fc.property(
          fc.record({
            lastToolName: fc.option(fc.string()),
            lastToolResult: fc.string(),
            currentTask: fc.string(),
            failureCount: fc.integer({ min: 0, max: 10 }),
          }),
          fc.record({
            needsReflection: fc.boolean(),
            shouldCreateTool: fc.boolean(),
            improvementSuggestions: fc.array(fc.string()),
            reflectionReason: fc.string(),
          }),
          (context, reflectionResult) => {
            // Act
            const prompt = buildReflectionPrompt(
              context as ToolReflectionContext,
              reflectionResult as ToolReflectionResult
            );

            // Assert
            expect(typeof prompt).toBe("string");
            expect(prompt.length).toBeGreaterThan(0);
            expect(prompt).toContain("# ツール実行後のリフレクション");
          }
        )
      );
    });

    it("shouldTriggerReflectionは一貫した結果を返す", () => {
      fc.assert(
        fc.property(
          fc.record({
            failureCount: fc.option(fc.integer()),
            lastToolName: fc.option(fc.string()),
            lastToolResult: fc.option(fc.string()),
            patternMatch: fc.option(fc.record({
              detected: fc.boolean(),
              pattern: fc.string(),
              occurrences: fc.integer(),
            })),
          }),
          (context) => {
            // Act
            const result = shouldTriggerReflection(context as Partial<ToolReflectionContext>);

            // Assert
            expect(typeof result).toBe("boolean");

            // 失敗がある場合は常にtrue
            if ((context.failureCount ?? 0) > 0) {
              expect(result).toBe(true);
            }
          }
        )
      );
    });
  });
});
