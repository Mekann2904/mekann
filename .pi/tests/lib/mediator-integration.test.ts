/**
 * @abdd.meta
 * path: .pi/tests/lib/mediator-integration.test.ts
 * role: mediator-integration.tsの単体テスト
 * why: Mediatorとloop_runの統合機能の正確性を保証するため
 * related: .pi/lib/mediator-integration.ts, .pi/lib/mediator-types.ts
 * public_api: テストケースの実行
 * invariants: テストはモックを使用
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: Mediator統合機能の単体テスト
 * what_it_does:
 *   - DEFAULT_MEDIATOR_LOOP_CONFIGのテスト
 *   - MediatorLoopConfig型の検証
 *   - 統合設定の検証
 * why_it_exists: 統合機能の信頼性を保証するため
 * scope:
 *   in: .pi/lib/mediator-integration.ts
 *   out: テスト結果
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_MEDIATOR_LOOP_CONFIG,
  type MediatorLoopConfig,
  type MediatorPhaseResult,
  type QuestionTool,
} from "../../lib/mediator-integration.js";

// ============================================================================
// Tests: DEFAULT_MEDIATOR_LOOP_CONFIG
// ============================================================================

describe("DEFAULT_MEDIATOR_LOOP_CONFIG", () => {
  it("デフォルト設定が正しく定義されている", () => {
    // Assert
    expect(DEFAULT_MEDIATOR_LOOP_CONFIG.enableMediator).toBe(true);
    expect(DEFAULT_MEDIATOR_LOOP_CONFIG.autoProceedThreshold).toBe(0.8);
    expect(DEFAULT_MEDIATOR_LOOP_CONFIG.maxClarificationRounds).toBe(2);
    expect(DEFAULT_MEDIATOR_LOOP_CONFIG.historyDir).toBe(".pi/memory");
    expect(DEFAULT_MEDIATOR_LOOP_CONFIG.debugMode).toBe(false);
  });

  it("autoProceedThresholdは0-1の範囲", () => {
    // Assert
    expect(DEFAULT_MEDIATOR_LOOP_CONFIG.autoProceedThreshold).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_MEDIATOR_LOOP_CONFIG.autoProceedThreshold).toBeLessThanOrEqual(1);
  });

  it("maxClarificationRoundsは正の整数", () => {
    // Assert
    expect(DEFAULT_MEDIATOR_LOOP_CONFIG.maxClarificationRounds).toBeGreaterThan(0);
    expect(Number.isInteger(DEFAULT_MEDIATOR_LOOP_CONFIG.maxClarificationRounds)).toBe(true);
  });
});

// ============================================================================
// Tests: MediatorLoopConfig Type
// ============================================================================

describe("MediatorLoopConfig Type", () => {
  it("カスタム設定を作成できる", () => {
    // Arrange & Act
    const customConfig: MediatorLoopConfig = {
      enableMediator: false,
      autoProceedThreshold: 0.9,
      maxClarificationRounds: 3,
      historyDir: "/custom/path",
      debugMode: true,
    };

    // Assert
    expect(customConfig.enableMediator).toBe(false);
    expect(customConfig.autoProceedThreshold).toBe(0.9);
    expect(customConfig.maxClarificationRounds).toBe(3);
    expect(customConfig.historyDir).toBe("/custom/path");
    expect(customConfig.debugMode).toBe(true);
  });
});

// ============================================================================
// Tests: MediatorPhaseResult Type
// ============================================================================

describe("MediatorPhaseResult Type", () => {
  it("成功結果を作成できる", () => {
    // Arrange & Act
    const result: MediatorPhaseResult = {
      success: true,
      originalTask: "Test task",
      clarifiedTask: "Clarified test task",
      needsClarification: false,
      processingTimeMs: 100,
      clarificationHistory: [],
    };

    // Assert
    expect(result.success).toBe(true);
    expect(result.originalTask).toBe("Test task");
    expect(result.clarifiedTask).toBe("Clarified test task");
    expect(result.needsClarification).toBe(false);
  });

  it("失敗結果を作成できる", () => {
    // Arrange & Act
    const result: MediatorPhaseResult = {
      success: false,
      originalTask: "Test task",
      clarifiedTask: "",
      needsClarification: false,
      error: "Something went wrong",
      processingTimeMs: 50,
      clarificationHistory: [],
    };

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toBe("Something went wrong");
  });

  it("明確化が必要な結果を作成できる", () => {
    // Arrange & Act
    const result: MediatorPhaseResult = {
      success: true,
      originalTask: "Fix the bug",
      clarifiedTask: "",
      needsClarification: true,
      processingTimeMs: 200,
      clarificationHistory: [
        {
          round: 1,
          questions: [
            {
              header: "対象",
              question: "どのファイルを修正しますか？",
              options: [
                { label: "A", description: "File A" },
                { label: "B", description: "File B" },
              ],
            }
          ],
          answers: [
            { question: "どのファイルを修正しますか？", answer: "A" },
          ],
        }
      ],
    };

    // Assert
    expect(result.needsClarification).toBe(true);
    expect(result.clarificationHistory.length).toBe(1);
    expect(result.clarificationHistory[0].round).toBe(1);
    expect(result.clarificationHistory[0].questions.length).toBe(1);
  });
});

// ============================================================================
// Tests: QuestionTool Type
// ============================================================================

describe("QuestionTool Type", () => {
  it("QuestionToolのインターフェースが正しい", () => {
    // Arrange
    const mockQuestionTool: QuestionTool = {
      ask: async (questions) => {
        return questions.map(q => ({
          question: q.question,
          answer: q.options[0]?.label ?? "",
        }));
      },
    };

    // Act & Assert
    expect(typeof mockQuestionTool.ask).toBe("function");
  });
});
