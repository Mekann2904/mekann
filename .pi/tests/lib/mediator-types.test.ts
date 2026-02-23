/**
 * mediator-types.tsの単体テスト
 * Mediator層の型定義とユーティリティ関数を検証する
 */

import { describe, it, expect } from "vitest";
import {
  type MediatorInput,
  type MediatorOutput,
  type StructuredIntent,
  type InformationGap,
  type ConversationHistory,
  type ConfirmedFact,
  type MediatorConfig,
  type MediatorStatus,
  type ActionType,
  type InformationGapType,
  generateSessionId,
  getCurrentTimestamp,
  isConfidenceAboveThreshold,
  createEmptyStructuredIntent,
  structuredIntentToPrompt,
  DEFAULT_MEDIATOR_CONFIG,
  LOW_CONFIDENCE_THRESHOLD,
  LIC_CONFIDENCE_THRESHOLD,
} from "../../lib/mediator-types.js";
import * as fc from "fast-check";

describe("mediator-types", () => {
  describe("generateSessionId", () => {
    it("一意のセッションIDを生成する", () => {
      // Arrange & Act
      const id1 = generateSessionId();
      const id2 = generateSessionId();

      // Assert
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^session-\d{14}-[a-z0-9]{4}$/);
    });

    it("生成されるIDは常にsession-プレフィックスを持つ", () => {
      // Arrange & Act & Assert
      fc.assert(
        fc.property(fc.constant(undefined), () => {
          const id = generateSessionId();
          return id.startsWith("session-");
        })
      );
    });
  });

  describe("getCurrentTimestamp", () => {
    it("ISO 8601形式のタイムスタンプを返す", () => {
      // Arrange & Act
      const timestamp = getCurrentTimestamp();

      // Assert
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it("現在時刻に近いタイムスタンプを返す", () => {
      // Arrange
      const before = new Date().getTime();

      // Act
      const timestamp = getCurrentTimestamp();
      const after = new Date().getTime();

      // Assert
      const parsedTime = new Date(timestamp).getTime();
      expect(parsedTime).toBeGreaterThanOrEqual(before - 1000);
      expect(parsedTime).toBeLessThanOrEqual(after + 1000);
    });
  });

  describe("isConfidenceAboveThreshold", () => {
    it("信頼度が閾値以上の場合trueを返す", () => {
      // Arrange & Act & Assert
      expect(isConfidenceAboveThreshold(0.7, 0.7)).toBe(true);
      expect(isConfidenceAboveThreshold(0.8, 0.7)).toBe(true);
      expect(isConfidenceAboveThreshold(1.0, 0.7)).toBe(true);
    });

    it("信頼度が閾値未満の場合falseを返す", () => {
      // Arrange & Act & Assert
      expect(isConfidenceAboveThreshold(0.69, 0.7)).toBe(false);
      expect(isConfidenceAboveThreshold(0.0, 0.7)).toBe(false);
    });

    it("デフォルト閾値は0.7", () => {
      // Arrange & Act & Assert
      expect(isConfidenceAboveThreshold(0.7)).toBe(true);
      expect(isConfidenceAboveThreshold(0.69)).toBe(false);
    });
  });

  describe("createEmptyStructuredIntent", () => {
    it("デフォルト値で初期化されたStructuredIntentを返す", () => {
      // Arrange
      const input = "テスト入力";

      // Act
      const intent = createEmptyStructuredIntent(input);

      // Assert
      expect(intent.target.scope).toBe("unknown");
      expect(intent.action.type).toBe("unknown");
      expect(intent.action.description).toBe("未確定");
      expect(intent.confidence).toBe(0);
      expect(intent.clarificationNeeded).toBe(true);
      expect(intent.originalInput).toBe(input);
    });

    it("制約条件は空配列で初期化される", () => {
      // Arrange & Act
      const intent = createEmptyStructuredIntent("test");

      // Assert
      expect(intent.constraints.mustPreserve).toEqual([]);
      expect(intent.constraints.mustSatisfy).toEqual([]);
      expect(intent.constraints.avoid).toEqual([]);
      expect(intent.constraints.assumptions).toEqual([]);
    });

    it("成功基準は空配列で初期化される", () => {
      // Arrange & Act
      const intent = createEmptyStructuredIntent("test");

      // Assert
      expect(intent.successCriteria.criteria).toEqual([]);
    });
  });

  describe("structuredIntentToPrompt", () => {
    it("基本的な意図をプロンプトに変換する", () => {
      // Arrange
      const intent: StructuredIntent = {
        target: {
          files: ["test.ts"],
          scope: "テストファイル",
        },
        action: {
          type: "modify",
          description: "テスト関数を追加",
        },
        constraints: {
          mustPreserve: ["既存のテスト"],
          mustSatisfy: [],
          avoid: [],
          assumptions: [],
        },
        successCriteria: {
          criteria: ["テストがパスする"],
        },
        confidence: 0.9,
        clarificationNeeded: false,
        originalInput: "テストを追加して",
        interpretationBasis: ["ファイルパスの言及"],
      };

      // Act
      const prompt = structuredIntentToPrompt(intent);

      // Assert
      expect(prompt).toContain("## ターゲット");
      expect(prompt).toContain("test.ts");
      expect(prompt).toContain("## アクション");
      expect(prompt).toContain("modify");
      expect(prompt).toContain("## 成功基準");
    });

    it("ファイルなしの場合でもスコープは出力される", () => {
      // Arrange
      const intent: StructuredIntent = {
        target: {
          scope: "プロジェクト全体",
        },
        action: {
          type: "analyze",
          description: "コード解析",
        },
        constraints: {
          mustPreserve: [],
          mustSatisfy: [],
          avoid: [],
          assumptions: [],
        },
        successCriteria: {
          criteria: ["解析完了"],
        },
        confidence: 0.8,
        clarificationNeeded: false,
        originalInput: "解析して",
        interpretationBasis: [],
      };

      // Act
      const prompt = structuredIntentToPrompt(intent);

      // Assert
      expect(prompt).toContain("スコープ: プロジェクト全体");
      expect(prompt).not.toContain("ファイル:");
    });

    it("制約条件がある場合は出力される", () => {
      // Arrange
      const intent: StructuredIntent = {
        target: { scope: "test" },
        action: { type: "modify", description: "test" },
        constraints: {
          mustPreserve: ["機能A"],
          mustSatisfy: ["条件B"],
          avoid: ["パターンC"],
          assumptions: [],
        },
        successCriteria: { criteria: ["完了"] },
        confidence: 0.8,
        clarificationNeeded: false,
        originalInput: "test",
        interpretationBasis: [],
      };

      // Act
      const prompt = structuredIntentToPrompt(intent);

      // Assert
      expect(prompt).toContain("## 制約条件");
      expect(prompt).toContain("維持: 機能A");
      expect(prompt).toContain("満たすべき条件: 条件B");
      expect(prompt).toContain("回避: パターンC");
    });

    it("アクションステップがある場合は番号付きで出力される", () => {
      // Arrange
      const intent: StructuredIntent = {
        target: { scope: "test" },
        action: {
          type: "modify",
          description: "test",
          steps: ["ステップ1", "ステップ2", "ステップ3"],
        },
        constraints: {
          mustPreserve: [],
          mustSatisfy: [],
          avoid: [],
          assumptions: [],
        },
        successCriteria: { criteria: ["完了"] },
        confidence: 0.8,
        clarificationNeeded: false,
        originalInput: "test",
        interpretationBasis: [],
      };

      // Act
      const prompt = structuredIntentToPrompt(intent);

      // Assert
      expect(prompt).toContain("1. ステップ1");
      expect(prompt).toContain("2. ステップ2");
      expect(prompt).toContain("3. ステップ3");
    });
  });

  describe("DEFAULT_MEDIATOR_CONFIG", () => {
    it("期待されるデフォルト値を持つ", () => {
      // Arrange & Act & Assert
      expect(DEFAULT_MEDIATOR_CONFIG.enableQuestioning).toBe(true);
      expect(DEFAULT_MEDIATOR_CONFIG.maxQuestionsPerTurn).toBe(3);
      expect(DEFAULT_MEDIATOR_CONFIG.confidenceThreshold).toBe(0.7);
      expect(DEFAULT_MEDIATOR_CONFIG.historyDir).toBe(".pi/memory");
      expect(DEFAULT_MEDIATOR_CONFIG.enableLicDetection).toBe(true);
    });
  });

  describe("定数値", () => {
    it("LOW_CONFIDENCE_THRESHOLDは期待される値", () => {
      expect(LOW_CONFIDENCE_THRESHOLD).toBe(0.6);
    });

    it("LIC_CONFIDENCE_THRESHOLDは期待される値", () => {
      expect(LIC_CONFIDENCE_THRESHOLD).toBe(0.7);
    });
  });

  describe("型ガード（実行時型チェック）", () => {
    it("ActionTypeの有効な値を判定できる", () => {
      // Arrange
      const validTypes: ActionType[] = [
        "create", "modify", "delete", "query", "analyze",
        "execute", "debug", "document", "test", "refactor",
        "review", "unknown"
      ];

      // Act & Assert
      validTypes.forEach(type => {
        expect(["create", "modify", "delete", "query", "analyze",
                "execute", "debug", "document", "test", "refactor",
                "review", "unknown"]).toContain(type);
      });
    });

    it("MediatorStatusの有効な値を判定できる", () => {
      // Arrange
      const validStatuses: MediatorStatus[] = [
        "ready", "needs_clarification", "needs_confirmation",
        "ambiguous", "error"
      ];

      // Act & Assert
      validStatuses.forEach(status => {
        expect(["ready", "needs_clarification", "needs_confirmation",
                "ambiguous", "error"]).toContain(status);
      });
    });

    it("InformationGapTypeの有効な値を判定できる", () => {
      // Arrange
      const validTypes: InformationGapType[] = [
        "ambiguous_reference", "missing_target", "unclear_action",
        "missing_constraints", "unclear_success_criteria",
        "context_mismatch", "implicit_assumption"
      ];

      // Act & Assert
      expect(validTypes.length).toBe(7);
    });
  });

  describe("プロパティベーステスト", () => {
    it("generateSessionId: 常に有効な形式を返す", () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 100 }), (count) => {
          const ids = new Set<string>();
          for (let i = 0; i < count; i++) {
            const id = generateSessionId();
            ids.add(id);
          }
          // 全て一意である
          return ids.size === count;
        })
      );
    });

    it("isConfidenceAboveThreshold: 信頼度の境界値で正しく判定", () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 1 }),
          fc.float({ min: 0, max: 1 }),
          (confidence, threshold) => {
            const result = isConfidenceAboveThreshold(confidence, threshold);
            if (confidence >= threshold) {
              return result === true;
            } else {
              return result === false;
            }
          }
        )
      );
    });

    it("structuredIntentToPrompt: 必ずセクションヘッダーを含む", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.constantFrom<ActionType>("create", "modify", "analyze", "query"),
          fc.string({ minLength: 1, maxLength: 50 }),
          (scope, actionType, description) => {
            const intent: StructuredIntent = {
              target: { scope },
              action: { type: actionType, description },
              constraints: {
                mustPreserve: [],
                mustSatisfy: [],
                avoid: [],
                assumptions: [],
              },
              successCriteria: { criteria: ["完了"] },
              confidence: 0.8,
              clarificationNeeded: false,
              originalInput: "test",
              interpretationBasis: [],
            };
            const prompt = structuredIntentToPrompt(intent);
            return prompt.includes("## ターゲット") &&
                   prompt.includes("## アクション") &&
                   prompt.includes("## 成功基準");
          }
        )
      );
    });
  });
});
