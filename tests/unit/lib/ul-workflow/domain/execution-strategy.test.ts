/**
 * execution-strategy.ts 単体テスト
 * カバレッジ対象: estimateTaskComplexity, looksLikeClearGoalTask,
 * determineWorkflowPhases, determineExecutionStrategy
 */
import {
  describe,
  it,
  expect,
} from "vitest";
import {
  estimateTaskComplexity,
  looksLikeClearGoalTask,
  determineWorkflowPhases,
  determineExecutionStrategy,
  type TaskComplexity,
  type ExecutionStrategy,
  type ExecutionStrategyResult,
} from "../../../../../.pi/lib/ul-workflow/domain/execution-strategy.js";

// ============================================================================
// estimateTaskComplexity テスト
// ============================================================================

describe("estimateTaskComplexity", () => {
  // ==========================================================================
  // 境界値テスト
  // ==========================================================================

  describe("境界値テスト", () => {
    it("空文字列_low返却_文字数0かつ単語数1のため", () => {
      // Arrange
      const task = "";

      // Act
      const result = estimateTaskComplexity(task);

      // Assert: charCount=0 < 50 && wordCount=1 < 10 → low
      expect(result).toBe("low");
    });

    it("null入力_low返却_空文字と同様に処理", () => {
      // Arrange
      const task = null as unknown as string;

      // Act
      const result = estimateTaskComplexity(task);

      // Assert: String(null || "") → ""
      expect(result).toBe("low");
    });

    it("undefined入力_low返却_空文字と同様に処理", () => {
      // Arrange
      const task = undefined as unknown as string;

      // Act
      const result = estimateTaskComplexity(task);

      // Assert: String(undefined || "") → ""
      expect(result).toBe("low");
    });

    it("空白のみ_low返却_trim後空文字のため", () => {
      // Arrange
      const task = "   ";

      // Act
      const result = estimateTaskComplexity(task);

      // Assert: "   ".trim() → ""
      expect(result).toBe("low");
    });
  });

  // ==========================================================================
  // 低複雑度テスト
  // ==========================================================================

  describe("低複雑度", () => {
    it("短いタスク_低複雑度", () => {
      // Arrange
      const task = "show version";

      // Act
      const result = estimateTaskComplexity(task);

      // Assert
      expect(result).toBe("low");
    });

    it("確認タスク_低複雑度", () => {
      // Arrange
      const task = "check the configuration";

      // Act
      const result = estimateTaskComplexity(task);

      // Assert
      expect(result).toBe("low");
    });

    it("設定タスク_低複雑度", () => {
      // Arrange
      const task = "set config value";

      // Act
      const result = estimateTaskComplexity(task);

      // Assert
      expect(result).toBe("low");
    });

    it("取得タスク_低複雑度", () => {
      // Arrange
      const task = "fetch data from API";

      // Act
      const result = estimateTaskComplexity(task);

      // Assert
      expect(result).toBe("low");
    });

    it("表示タスク_日本語_低複雑度", () => {
      // Arrange
      const task = "バージョンを表示";

      // Act
      const result = estimateTaskComplexity(task);

      // Assert
      expect(result).toBe("low");
    });

    it("50文字未満_低複雑度", () => {
      // Arrange
      const task = "simple task";

      // Act
      const result = estimateTaskComplexity(task);

      // Assert
      expect(result).toBe("low");
    });

    it("10単語未満_低複雑度", () => {
      // Arrange
      const task = "one two three four five six seven eight nine";

      // Act
      const result = estimateTaskComplexity(task);

      // Assert
      expect(result).toBe("low");
    });
  });

  // ==========================================================================
  // 中複雑度テスト
  // ==========================================================================

  describe("中複雑度", () => {
    it("実装タスク_中複雑度", () => {
      // Arrange
      const task = "implement new feature";

      // Act
      const result = estimateTaskComplexity(task);

      // Assert
      expect(result).toBe("medium");
    });

    it("修正タスク_中複雑度", () => {
      // Arrange
      const task = "fix the bug in the system";

      // Act
      const result = estimateTaskComplexity(task);

      // Assert
      expect(result).toBe("medium");
    });

    it("更新タスク_中複雑度", () => {
      // Arrange
      const task = "update dependencies";

      // Act
      const result = estimateTaskComplexity(task);

      // Assert
      expect(result).toBe("medium");
    });

    it("追加タスク_中複雑度", () => {
      // Arrange
      const task = "add new button";

      // Act
      const result = estimateTaskComplexity(task);

      // Assert
      expect(result).toBe("medium");
    });

    it("変更タスク_中複雑度", () => {
      // Arrange
      const task = "change the color";

      // Act
      const result = estimateTaskComplexity(task);

      // Assert
      expect(result).toBe("medium");
    });

    it("日本語_実装タスク_中複雑度", () => {
      // Arrange
      const task = "新機能を実装する";

      // Act
      const result = estimateTaskComplexity(task);

      // Assert
      expect(result).toBe("medium");
    });

    it("日本語_修正タスク_中複雑度", () => {
      // Arrange
      const task = "バグを修正";

      // Act
      const result = estimateTaskComplexity(task);

      // Assert
      expect(result).toBe("medium");
    });

    it("50-100文字_中複雑度", () => {
      // Arrange
      const task = "This is a medium length task that needs to be done carefully";

      // Act
      const result = estimateTaskComplexity(task);

      // Assert
      expect(result).toBe("medium");
    });
  });

  // ==========================================================================
  // 高複雑度テスト
  // ==========================================================================

  describe("高複雑度", () => {
    it("アーキテクチャタスク_高複雑度", () => {
      // Arrange
      const task = "design new architecture";

      // Act
      const result = estimateTaskComplexity(task);

      // Assert
      expect(result).toBe("high");
    });

    it("リファクタリングタスク_高複雑度", () => {
      // Arrange
      const task = "refactor legacy code";

      // Act
      const result = estimateTaskComplexity(task);

      // Assert
      expect(result).toBe("high");
    });

    it("マイグレーションタスク_高複雑度", () => {
      // Arrange
      const task = "database migration";

      // Act
      const result = estimateTaskComplexity(task);

      // Assert
      expect(result).toBe("high");
    });

    it("統合タスク_高複雑度", () => {
      // Arrange
      const task = "integration with external API";

      // Act
      const result = estimateTaskComplexity(task);

      // Assert
      expect(result).toBe("high");
    });

    it("複数ファイルタスク_高複雑度", () => {
      // Arrange
      const task = "update multiple files";

      // Act
      const result = estimateTaskComplexity(task);

      // Assert
      expect(result).toBe("high");
    });

    it("システム全体タスク_高複雑度", () => {
      // Arrange
      const task = "redesign entire system";

      // Act
      const result = estimateTaskComplexity(task);

      // Assert
      expect(result).toBe("high");
    });

    it("日本語_アーキテクチャ_高複雑度", () => {
      // Arrange
      const task = "アーキテクチャを設計";

      // Act
      const result = estimateTaskComplexity(task);

      // Assert
      expect(result).toBe("high");
    });

    it("日本語_リファクタ_高複雑度", () => {
      // Arrange
      const task = "リファクタリングを実施";

      // Act
      const result = estimateTaskComplexity(task);

      // Assert
      expect(result).toBe("high");
    });

    it("200文字超過_高複雑度", () => {
      // Arrange
      const task = "a".repeat(201);

      // Act
      const result = estimateTaskComplexity(task);

      // Assert
      expect(result).toBe("high");
    });

    it("30単語超過_高複雑度", () => {
      // Arrange
      const words = Array(31).fill("word").join(" ");

      // Act
      const result = estimateTaskComplexity(words);

      // Assert
      expect(result).toBe("high");
    });
  });

  // ==========================================================================
  // 大文字小文字テスト
  // ==========================================================================

  describe("大文字小文字", () => {
    it("大文字_ARCHITECTURE_高複雑度", () => {
      // Arrange
      const task = "ARCHITECTURE design";

      // Act
      const result = estimateTaskComplexity(task);

      // Assert
      expect(result).toBe("high");
    });

    it("混在_Implement_中複雑度", () => {
      // Arrange
      const task = "ImPlEmEnT feature";

      // Act
      const result = estimateTaskComplexity(task);

      // Assert
      expect(result).toBe("medium");
    });
  });

  // ==========================================================================
  // 優先度テスト
  // ==========================================================================

  describe("優先度テスト", () => {
    it("高複雑度指標が低複雑度指標より優先", () => {
      // Arrange - "show architecture" has both low and high indicators
      const task = "show architecture design";

      // Act
      const result = estimateTaskComplexity(task);

      // Assert - high should win
      expect(result).toBe("high");
    });

    it("高複雑度指標が中複雑度指標より優先", () => {
      // Arrange - "implement migration" has both medium and high indicators
      const task = "implement migration plan";

      // Act
      const result = estimateTaskComplexity(task);

      // Assert - high should win
      expect(result).toBe("high");
    });
  });
});

// ============================================================================
// looksLikeClearGoalTask テスト
// ============================================================================

describe("looksLikeClearGoalTask", () => {
  // ==========================================================================
  // 明確なゴール
  // ==========================================================================

  describe("明確なゴール", () => {
    it("add開始_明確ゴール", () => {
      expect(looksLikeClearGoalTask("add new feature")).toBe(true);
    });

    it("fix開始_明確ゴール", () => {
      expect(looksLikeClearGoalTask("fix the bug")).toBe(true);
    });

    it("update開始_明確ゴール", () => {
      expect(looksLikeClearGoalTask("update config")).toBe(true);
    });

    it("implement開始_明確ゴール", () => {
      expect(looksLikeClearGoalTask("implement feature")).toBe(true);
    });

    it("create開始_明確ゴール", () => {
      expect(looksLikeClearGoalTask("create new file")).toBe(true);
    });

    it("refactor開始_明確ゴール", () => {
      expect(looksLikeClearGoalTask("refactor code")).toBe(true);
    });

    it("remove開始_明確ゴール", () => {
      expect(looksLikeClearGoalTask("remove unused code")).toBe(true);
    });

    it("rename開始_明確ゴール", () => {
      expect(looksLikeClearGoalTask("rename variable")).toBe(true);
    });
  });

  // ==========================================================================
  // 曖昧なゴール
  // ==========================================================================

  describe("曖昧なゴール", () => {
    it("investigate開始_曖昧ゴール", () => {
      expect(looksLikeClearGoalTask("investigate issue")).toBe(false);
    });

    it("analyze開始_曖昧ゴール", () => {
      expect(looksLikeClearGoalTask("analyze performance")).toBe(false);
    });

    it("review開始_曖昧ゴール", () => {
      expect(looksLikeClearGoalTask("review code")).toBe(false);
    });

    it("improve開始_曖昧ゴール", () => {
      expect(looksLikeClearGoalTask("improve speed")).toBe(false);
    });

    it("optimize開始_曖昧ゴール", () => {
      expect(looksLikeClearGoalTask("optimize query")).toBe(false);
    });

    it("疑問符開始_曖昧ゴール", () => {
      expect(looksLikeClearGoalTask("? what is this")).toBe(false);
    });

    it("how開始_曖昧ゴール", () => {
      expect(looksLikeClearGoalTask("how to fix")).toBe(false);
    });

    it("what開始_曖昧ゴール", () => {
      expect(looksLikeClearGoalTask("what is the issue")).toBe(false);
    });
  });

  // ==========================================================================
  // 境界値
  // ==========================================================================

  describe("境界値", () => {
    it("空文字列_不明確", () => {
      expect(looksLikeClearGoalTask("")).toBe(false);
    });

    it("null入力_不明確", () => {
      expect(looksLikeClearGoalTask(null as unknown as string)).toBe(false);
    });

    it("undefined入力_不明確", () => {
      expect(looksLikeClearGoalTask(undefined as unknown as string)).toBe(false);
    });

    it("空白のみ_不明確", () => {
      expect(looksLikeClearGoalTask("   ")).toBe(false);
    });

    it("中間にadd_不明確", () => {
      // "add" must be at the start
      expect(looksLikeClearGoalTask("please add feature")).toBe(false);
    });

    it("大文字_ADD_明確ゴール", () => {
      expect(looksLikeClearGoalTask("ADD feature")).toBe(true);
    });
  });

  // ==========================================================================
  // 優先度テスト
  // ==========================================================================

  describe("優先度", () => {
    it("曖昧パターンが明確パターンより優先される", () => {
      // "investigate" starts with an ambiguous pattern
      // even if it contains "fix" later
      expect(looksLikeClearGoalTask("investigate and fix bug")).toBe(false);
    });
  });
});

// ============================================================================
// determineWorkflowPhases テスト
// ============================================================================

describe("determineWorkflowPhases", () => {
  // ==========================================================================
  // 低複雑度
  // ==========================================================================

  describe("低複雑度フェーズ", () => {
    it("低複雑度_明確ゴール_createパターン_3フェーズ", () => {
      // Arrange: "create show function" → low (show含む) + clear goal (create開始)
      const task = "create show function";

      // Act
      const phases = determineWorkflowPhases(task);

      // Assert: low + clear goal → ["research", "implement", "completed"]
      expect(phases).toEqual(["research", "implement", "completed"]);
    });

    it("低複雑度_明確ゴール_renameパターン_3フェーズ", () => {
      // Arrange: "rename get function" → low (get含む) + clear goal (rename開始)
      const task = "rename get function";

      // Act
      const phases = determineWorkflowPhases(task);

      // Assert: low + clear goal → ["research", "implement", "completed"]
      expect(phases).toEqual(["research", "implement", "completed"]);
    });

    it("低複雑度_不明確ゴール_showパターン_4フェーズ", () => {
      // Arrange: "show version" → low + clear goalなし (showは明確ゴールパターンに含まれない)
      const task = "show version";

      // Act
      const phases = determineWorkflowPhases(task);

      // Assert: low + no clear goal → ["research", "plan", "implement", "completed"]
      expect(phases).toEqual(["research", "plan", "implement", "completed"]);
    });

    it("低複雑度_不明確ゴール_4フェーズ", () => {
      // Arrange
      const task = "check configuration settings";

      // Act
      const phases = determineWorkflowPhases(task);

      // Assert
      expect(phases).toEqual(["research", "plan", "implement", "completed"]);
    });
  });

  // ==========================================================================
  // 中複雑度
  // ==========================================================================

  describe("中複雑度フェーズ", () => {
    it("中複雑度_明確ゴール_4フェーズ", () => {
      // Arrange
      const task = "implement new feature";

      // Act
      const phases = determineWorkflowPhases(task);

      // Assert
      expect(phases).toEqual(["research", "plan", "implement", "completed"]);
    });

    it("中複雑度_不明確ゴール_5フェーズ", () => {
      // Arrange
      const task = "modify the code";

      // Act
      const phases = determineWorkflowPhases(task);

      // Assert
      expect(phases).toEqual(["research", "plan", "annotate", "implement", "completed"]);
    });
  });

  // ==========================================================================
  // 高複雑度
  // ==========================================================================

  describe("高複雑度フェーズ", () => {
    it("高複雑度_必ず5フェーズ", () => {
      // Arrange
      const task = "architecture redesign";

      // Act
      const phases = determineWorkflowPhases(task);

      // Assert
      expect(phases).toEqual(["research", "plan", "annotate", "implement", "completed"]);
    });

    it("高複雑度_明確ゴールでも5フェーズ", () => {
      // Arrange
      const task = "refactor entire system";

      // Act
      const phases = determineWorkflowPhases(task);

      // Assert
      expect(phases).toEqual(["research", "plan", "annotate", "implement", "completed"]);
    });
  });

  // ==========================================================================
  // フェーズ順序テスト
  // ==========================================================================

  describe("フェーズ順序", () => {
    it("全フェーズ_completedで終了", () => {
      const tasks = [
        "show version",
        "implement feature",
        "architecture redesign",
      ];

      tasks.forEach((task) => {
        const phases = determineWorkflowPhases(task);
        expect(phases[phases.length - 1]).toBe("completed");
      });
    });

    it("全フェーズ_researchで開始", () => {
      const tasks = [
        "show version",
        "implement feature",
        "architecture redesign",
      ];

      tasks.forEach((task) => {
        const phases = determineWorkflowPhases(task);
        expect(phases[0]).toBe("research");
      });
    });

    it("annotateフェーズはimplementの前に配置", () => {
      const task = "architecture redesign";
      const phases = determineWorkflowPhases(task);

      const annotateIndex = phases.indexOf("annotate");
      const implementIndex = phases.indexOf("implement");

      expect(annotateIndex).toBeLessThan(implementIndex);
    });
  });

  // ==========================================================================
  // 境界値
  // ==========================================================================

  describe("境界値", () => {
    it("空文字列_デフォルトフェーズ", () => {
      const phases = determineWorkflowPhases("");
      expect(phases.length).toBeGreaterThan(0);
      expect(phases[phases.length - 1]).toBe("completed");
    });
  });
});

// ============================================================================
// determineExecutionStrategy テスト
// ============================================================================

describe("determineExecutionStrategy", () => {
  // ==========================================================================
  // 戻り値構造テスト
  // ==========================================================================

  describe("戻り値構造", () => {
    it("戻り値は必須フィールドを持つ", () => {
      // Arrange
      const task = "test task";

      // Act
      const result = determineExecutionStrategy(task);

      // Assert
      expect(result).toHaveProperty("strategy");
      expect(result).toHaveProperty("phases");
      expect(result).toHaveProperty("useDag");
      expect(result).toHaveProperty("reason");
    });

    it("strategyは有効な値", () => {
      const validStrategies: ExecutionStrategy[] = ["simple", "dag", "full-workflow"];

      const tasks = ["show", "implement feature", "architecture"];
      tasks.forEach((task) => {
        const result = determineExecutionStrategy(task);
        expect(validStrategies).toContain(result.strategy);
      });
    });

    it("phasesは空でない配列", () => {
      const tasks = ["", "test", "architecture redesign"];
      tasks.forEach((task) => {
        const result = determineExecutionStrategy(task);
        expect(Array.isArray(result.phases)).toBe(true);
        expect(result.phases.length).toBeGreaterThan(0);
      });
    });

    it("useDagはboolean", () => {
      const result = determineExecutionStrategy("test");
      expect(typeof result.useDag).toBe("boolean");
    });

    it("reasonは空でない文字列", () => {
      const result = determineExecutionStrategy("test");
      expect(typeof result.reason).toBe("string");
      expect(result.reason.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // 低複雑度戦略
  // ==========================================================================

  describe("低複雑度戦略", () => {
    it("低複雑度_simple戦略", () => {
      // Arrange
      const task = "show version";

      // Act
      const result = determineExecutionStrategy(task);

      // Assert
      expect(result.strategy).toBe("simple");
      expect(result.useDag).toBe(false);
    });

    it("低複雑度_2フェーズ", () => {
      // Arrange
      const task = "get data";

      // Act
      const result = determineExecutionStrategy(task);

      // Assert
      expect(result.phases).toEqual(["implement", "completed"]);
    });

    it("低複雑度_理由にLow complexity含む", () => {
      // Arrange
      const task = "set config";

      // Act
      const result = determineExecutionStrategy(task);

      // Assert
      expect(result.reason).toContain("Low complexity");
    });
  });

  // ==========================================================================
  // 中複雑度戦略
  // ==========================================================================

  describe("中複雑度戦略", () => {
    it("中複雑度_明示的ステップあり_dag戦略", () => {
      // Arrange
      const task = "first implement feature then test it";

      // Act
      const result = determineExecutionStrategy(task);

      // Assert
      expect(result.strategy).toBe("dag");
      expect(result.useDag).toBe(true);
    });

    it("中複雑度_複数ファイル_dag戦略", () => {
      // Arrange
      const task = "update multiple files";

      // Act
      const result = determineExecutionStrategy(task);

      // Assert
      expect(result.strategy).toBe("dag");
      expect(result.useDag).toBe(true);
    });

    it("中複雑度_調査必要_dag戦略", () => {
      // Arrange
      const task = "implement feature and investigate issues";

      // Act
      const result = determineExecutionStrategy(task);

      // Assert
      expect(result.strategy).toBe("dag");
      expect(result.useDag).toBe(true);
    });

    it("中複雑度_シンプルタスク_simple戦略", () => {
      // Arrange
      const task = "add new button";

      // Act
      const result = determineExecutionStrategy(task);

      // Assert
      expect(result.strategy).toBe("simple");
      expect(result.useDag).toBe(false);
    });

    it("中複雑度_dag_理由にDAG含む", () => {
      // Arrange
      const task = "first add feature then update docs";

      // Act
      const result = determineExecutionStrategy(task);

      // Assert
      expect(result.reason).toContain("DAG");
    });
  });

  // ==========================================================================
  // 高複雑度戦略
  // ==========================================================================

  describe("高複雑度戦略", () => {
    it("高複雑度_dag戦略", () => {
      // Arrange
      const task = "architecture redesign";

      // Act
      const result = determineExecutionStrategy(task);

      // Assert
      expect(result.strategy).toBe("dag");
      expect(result.useDag).toBe(true);
    });

    it("高複雑度_5フェーズ", () => {
      // Arrange
      const task = "migration entire system";

      // Act
      const result = determineExecutionStrategy(task);

      // Assert
      expect(result.phases).toEqual([
        "research",
        "plan",
        "implement",
        "review",
        "completed",
      ]);
    });

    it("高複雑度_理由にHigh complexity含む", () => {
      // Arrange
      const task = "refactor architecture";

      // Act
      const result = determineExecutionStrategy(task);

      // Assert
      expect(result.reason).toContain("High complexity");
    });

    it("高複雑度_reviewフェーズ含む", () => {
      // Arrange
      const task = "integration with external system";

      // Act
      const result = determineExecutionStrategy(task);

      // Assert
      expect(result.phases).toContain("review");
    });
  });

  // ==========================================================================
  // DAG信号テスト
  // ==========================================================================

  describe("DAG信号分析", () => {
    it("first_thenパターン_DAG使用", () => {
      const task = "first create component then add tests";
      const result = determineExecutionStrategy(task);
      expect(result.useDag).toBe(true);
    });

    it("after_implementパターン_DAG使用", () => {
      const task = "update config after implement feature";
      const result = determineExecutionStrategy(task);
      expect(result.useDag).toBe(true);
    });

    it("数字リストパターン_DAG使用", () => {
      const task = "1. create file 2. add code";
      const result = determineExecutionStrategy(task);
      expect(result.useDag).toBe(true);
    });

    it("日本語_まず_それから_DAG使用", () => {
      const task = "まず実装それからテスト";
      const result = determineExecutionStrategy(task);
      expect(result.useDag).toBe(true);
    });

    it("日本語_実装_後_DAG使用", () => {
      const task = "実装後にテスト追加";
      const result = determineExecutionStrategy(task);
      expect(result.useDag).toBe(true);
    });

    it("複数_キーワード_DAG使用", () => {
      const task = "update multiple components";
      const result = determineExecutionStrategy(task);
      expect(result.useDag).toBe(true);
    });

    it("調査_キーワード_DAG使用", () => {
      const task = "investigate and add feature";
      const result = determineExecutionStrategy(task);
      expect(result.useDag).toBe(true);
    });
  });

  // ==========================================================================
  // 境界値
  // ==========================================================================

  describe("境界値", () => {
    it("空文字列_デフォルト戦略", () => {
      const result = determineExecutionStrategy("");
      expect(result.strategy).toBe("simple");
    });

    it("null入力_例外発生_実装が非nullを期待", () => {
      // Arrange & Act & Assert
      // analyzeDagSignalsがtask.trim()を呼ぶため、null/undefinedは例外となる
      expect(() => determineExecutionStrategy(null as unknown as string)).toThrow();
    });

    it("undefined入力_例外発生_実装が非nullを期待", () => {
      // Arrange & Act & Assert
      expect(() => determineExecutionStrategy(undefined as unknown as string)).toThrow();
    });
  });
});

// ============================================================================
// 統合テスト
// ============================================================================

describe("統合テスト", () => {
  it("複雑度から戦略まで一貫性がある", () => {
    const testCases = [
      { task: "show version", expectedComplexity: "low" as TaskComplexity, expectedStrategy: "simple" as ExecutionStrategy },
      { task: "implement feature", expectedComplexity: "medium" as TaskComplexity, expectedStrategy: "simple" as ExecutionStrategy },
      { task: "architecture redesign", expectedComplexity: "high" as TaskComplexity, expectedStrategy: "dag" as ExecutionStrategy },
    ];

    testCases.forEach(({ task, expectedComplexity, expectedStrategy }) => {
      const complexity = estimateTaskComplexity(task);
      const strategyResult = determineExecutionStrategy(task);

      expect(complexity).toBe(expectedComplexity);
      expect(strategyResult.strategy).toBe(expectedStrategy);
    });
  });

  it("フェーズ決定と戦略決定の一貫性", () => {
    const task = "architecture redesign";
    const phases = determineWorkflowPhases(task);
    const strategyResult = determineExecutionStrategy(task);

    // Both should recognize high complexity
    expect(phases.length).toBe(5);
    expect(strategyResult.phases.length).toBe(5);
  });

  it("タスクタイプによる一貫した分類", () => {
    const tasks = {
      low: ["show data", "get config", "set value"],
      medium: ["add feature", "fix bug", "update code"],
      high: ["refactor system", "architecture change", "migration task"],
    };

    Object.entries(tasks).forEach(([complexity, taskList]) => {
      taskList.forEach((task) => {
        const result = estimateTaskComplexity(task);
        expect(result).toBe(complexity);
      });
    });
  });
});

// ============================================================================
// 純粋関数テスト
// ============================================================================

describe("純粋関数", () => {
  it("estimateTaskComplexity_同一入力_同一出力", () => {
    const task = "implement feature";
    const results = Array(5).fill(null).map(() => estimateTaskComplexity(task));
    expect(new Set(results).size).toBe(1);
  });

  it("determineExecutionStrategy_同一入力_同一出力", () => {
    const task = "test task";
    const results = Array(5).fill(null).map(() => determineExecutionStrategy(task));
    const first = JSON.stringify(results[0]);
    results.forEach((r) => expect(JSON.stringify(r)).toBe(first));
  });

  it("looksLikeClearGoalTask_同一入力_同一出力", () => {
    const task = "add feature";
    const results = Array(5).fill(null).map(() => looksLikeClearGoalTask(task));
    expect(new Set(results).size).toBe(1);
  });

  it("determineWorkflowPhases_同一入力_同一出力", () => {
    const task = "implement feature";
    const results = Array(5).fill(null).map(() => determineWorkflowPhases(task));
    const first = JSON.stringify(results[0]);
    results.forEach((r) => expect(JSON.stringify(r)).toBe(first));
  });
});
