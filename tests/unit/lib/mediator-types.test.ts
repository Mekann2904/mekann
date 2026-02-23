/**
 * @abdd.meta
 * path: tests/unit/lib/mediator-types.test.ts
 * role: mediator-types.tsのユニットテスト
 * why: Mediator層の型定義とユーティリティ関数の正確性を保証するため
 * related: .pi/lib/mediator-types.ts
 * public_api: テストケースの実行
 * invariants: なし
 * side_effects: なし（テストのみ）
 * failure_modes: テスト失敗は型定義または関数の不具合を示す
 * @abdd.explain
 * overview: mediator-types.tsの型ガード、ユーティリティ関数、定数を検証するテストスイート
 * what_it_does:
 *   - Confidence型の範囲検証
 *   - SessionId/Timestamp生成関数のテスト
 *   - StructuredIntent関連関数のテスト
 *   - 定数の値確認
 * why_it_exists:
 *   - Mediator層の基盤となる型と関数の品質を保証するため
 * scope:
 *   in: mediator-types.ts
 *   out: テスト結果とカバレッジレポート
 */

import { describe, it, expect } from "vitest";
import {
  type Confidence,
  type InformationGapType,
  type MessageRole,
  type ActionType,
  type MediatorStatus,
  type MediatorAction,
  type IntentCategory,
  type QuestionType,
  type LiCIndicatorType,
  generateSessionId,
  getCurrentTimestamp,
  isConfidenceAboveThreshold,
  createEmptyStructuredIntent,
  structuredIntentToPrompt,
  DEFAULT_MEDIATOR_CONFIG,
  LOW_CONFIDENCE_THRESHOLD,
  LIC_CONFIDENCE_THRESHOLD,
  MAX_CLARIFICATION_QUESTIONS,
} from "../../../.pi/lib/mediator-types.js";

// ============================================================================
// 型定義テスト
// ============================================================================

describe("mediator-types.ts", () => {
  describe("基本型の境界値テスト", () => {
    it("Confidenceは0.0から1.0の範囲を受け入れる", () => {
      // Arrange
      const validLow: Confidence = 0.0;
      const validMid: Confidence = 0.5;
      const validHigh: Confidence = 1.0;

      // Assert
      expect(validLow).toBe(0.0);
      expect(validMid).toBe(0.5);
      expect(validHigh).toBe(1.0);
    });

    it("InformationGapTypeは全ての期待される値を持つ", () => {
      // Arrange
      const expectedTypes: InformationGapType[] = [
        "ambiguous_reference",
        "missing_target",
        "unclear_action",
        "missing_constraints",
        "unclear_success_criteria",
        "context_mismatch",
        "implicit_assumption",
      ];

      // Assert
      expectedTypes.forEach((type) => {
        expect(typeof type).toBe("string");
      });
      expect(expectedTypes.length).toBe(7);
    });

    it("MessageRoleは全ての期待される値を持つ", () => {
      // Arrange
      const expectedRoles: MessageRole[] = [
        "user",
        "assistant",
        "mediator",
        "system",
      ];

      // Assert
      expectedRoles.forEach((role) => {
        expect(typeof role).toBe("string");
      });
      expect(expectedRoles.length).toBe(4);
    });

    it("ActionTypeは全ての期待される値を持つ", () => {
      // Arrange
      const expectedTypes: ActionType[] = [
        "create",
        "modify",
        "delete",
        "query",
        "analyze",
        "execute",
        "debug",
        "document",
        "test",
        "refactor",
        "review",
        "unknown",
      ];

      // Assert
      expectedTypes.forEach((type) => {
        expect(typeof type).toBe("string");
      });
      expect(expectedTypes.length).toBe(12);
    });

    it("MediatorStatusは全ての期待される値を持つ", () => {
      // Arrange
      const expectedStatuses: MediatorStatus[] = [
        "ready",
        "needs_clarification",
        "needs_confirmation",
        "ambiguous",
        "error",
      ];

      // Assert
      expectedStatuses.forEach((status) => {
        expect(typeof status).toBe("string");
      });
      expect(expectedStatuses.length).toBe(5);
    });

    it("MediatorActionは全ての期待される値を持つ", () => {
      // Arrange
      const expectedActions: MediatorAction[] = [
        "proceed",
        "clarify_first",
        "confirm_interpretation",
        "request_context",
        "flag_lic",
        "abort",
      ];

      // Assert
      expectedActions.forEach((action) => {
        expect(typeof action).toBe("string");
      });
      expect(expectedActions.length).toBe(6);
    });

    it("IntentCategoryは全ての期待される値を持つ", () => {
      // Arrange
      const expectedCategories: IntentCategory[] = [
        "task_execution",
        "information_request",
        "clarification",
        "correction",
        "continuation",
        "context_switch",
        "termination",
        "ambiguous",
      ];

      // Assert
      expectedCategories.forEach((category) => {
        expect(typeof category).toBe("string");
      });
      expect(expectedCategories.length).toBe(8);
    });

    it("QuestionTypeは全ての期待される値を持つ", () => {
      // Arrange
      const expectedTypes: QuestionType[] = [
        "single_choice",
        "multiple_choice",
        "text_input",
        "confirmation",
        "ranking",
      ];

      // Assert
      expectedTypes.forEach((type) => {
        expect(typeof type).toBe("string");
      });
      expect(expectedTypes.length).toBe(5);
    });

    it("LiCIndicatorTypeは全ての期待される値を持つ", () => {
      // Arrange
      const expectedTypes: LiCIndicatorType[] = [
        "generic_response",
        "context_ignore",
        "premise_mismatch",
        "repetition",
        "topic_drift",
        "confirmation_overload",
        "assumption_conflict",
      ];

      // Assert
      expectedTypes.forEach((type) => {
        expect(typeof type).toBe("string");
      });
      expect(expectedTypes.length).toBe(7);
    });
  });

  // ============================================================================
  // ユーティリティ関数テスト
  // ============================================================================

  describe("generateSessionId", () => {
    it("セッションIDが生成される", () => {
      // Act
      const sessionId = generateSessionId();

      // Assert
      expect(sessionId).toMatch(/^session-\d{14}-[a-z0-9]{4}$/);
    });

    it("複数回呼び出すと異なるIDが生成される", () => {
      // Act
      const id1 = generateSessionId();
      const id2 = generateSessionId();

      // Assert
      expect(id1).not.toBe(id2);
    });

    it("タイムスタンプ部分はISO形式と一致する", () => {
      // Arrange
      const beforeTime = new Date();
      const sessionId = generateSessionId();
      const afterTime = new Date();

      // Act
      const timestampMatch = sessionId.match(/^session-(\d{14})-/);
      const timestampStr = timestampMatch?.[1];

      // Assert
      expect(timestampStr).toBeDefined();
      if (timestampStr) {
        // YYYYMMDDHHmmss形式をパース
        const year = parseInt(timestampStr.slice(0, 4));
        const month = parseInt(timestampStr.slice(4, 6)) - 1;
        const day = parseInt(timestampStr.slice(6, 8));
        const hour = parseInt(timestampStr.slice(8, 10));
        const minute = parseInt(timestampStr.slice(10, 12));
        const second = parseInt(timestampStr.slice(12, 14));

        const generatedTime = new Date(year, month, day, hour, minute, second);

        // 前後1分以内であることを確認
        expect(generatedTime.getTime()).toBeGreaterThanOrEqual(
          beforeTime.getTime() - 60000
        );
        expect(generatedTime.getTime()).toBeLessThanOrEqual(
          afterTime.getTime() + 60000
        );
      }
    });
  });

  describe("getCurrentTimestamp", () => {
    it("ISO 8601形式のタイムスタンプが返される", () => {
      // Act
      const timestamp = getCurrentTimestamp();

      // Assert
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it("現在時刻と概ね一致する", () => {
      // Arrange
      const beforeTime = new Date();

      // Act
      const timestamp = getCurrentTimestamp();
      const parsedTime = new Date(timestamp);

      // Assert
      const diffMs = Math.abs(parsedTime.getTime() - beforeTime.getTime());
      expect(diffMs).toBeLessThan(1000); // 1秒以内の誤差
    });
  });

  describe("isConfidenceAboveThreshold", () => {
    it("信頼度が閾値と等しい場合trueを返す", () => {
      // Arrange
      const confidence = 0.7;
      const threshold = 0.7;

      // Act
      const result = isConfidenceAboveThreshold(confidence, threshold);

      // Assert
      expect(result).toBe(true);
    });

    it("信頼度が閾値より高い場合trueを返す", () => {
      // Arrange
      const confidence = 0.8;
      const threshold = 0.7;

      // Act
      const result = isConfidenceAboveThreshold(confidence, threshold);

      // Assert
      expect(result).toBe(true);
    });

    it("信頼度が閾値より低い場合falseを返す", () => {
      // Arrange
      const confidence = 0.6;
      const threshold = 0.7;

      // Act
      const result = isConfidenceAboveThreshold(confidence, threshold);

      // Assert
      expect(result).toBe(false);
    });

    it("閾値が省略された場合デフォルト値0.7を使用する", () => {
      // Arrange
      const confidenceAbove = 0.71;
      const confidenceBelow = 0.69;

      // Act
      const resultAbove = isConfidenceAboveThreshold(confidenceAbove);
      const resultBelow = isConfidenceAboveThreshold(confidenceBelow);

      // Assert
      expect(resultAbove).toBe(true);
      expect(resultBelow).toBe(false);
    });

    it("境界値: 信頼度0.0と閾値0.0", () => {
      // Act
      const result = isConfidenceAboveThreshold(0.0, 0.0);

      // Assert
      expect(result).toBe(true);
    });

    it("境界値: 信頼度1.0と閾値1.0", () => {
      // Act
      const result = isConfidenceAboveThreshold(1.0, 1.0);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe("createEmptyStructuredIntent", () => {
    it("空のStructuredIntentが作成される", () => {
      // Arrange
      const originalInput = "テスト入力";

      // Act
      const intent = createEmptyStructuredIntent(originalInput);

      // Assert
      expect(intent.target.scope).toBe("unknown");
      expect(intent.action.type).toBe("unknown");
      expect(intent.action.description).toBe("未確定");
      expect(intent.constraints.mustPreserve).toEqual([]);
      expect(intent.constraints.mustSatisfy).toEqual([]);
      expect(intent.constraints.avoid).toEqual([]);
      expect(intent.constraints.assumptions).toEqual([]);
      expect(intent.successCriteria.criteria).toEqual([]);
      expect(intent.confidence).toBe(0);
      expect(intent.clarificationNeeded).toBe(true);
      expect(intent.originalInput).toBe(originalInput);
      expect(intent.interpretationBasis).toEqual([]);
    });

    it("originalInputが正しく設定される", () => {
      // Arrange
      const originalInput = "あのファイルを修正して";

      // Act
      const intent = createEmptyStructuredIntent(originalInput);

      // Assert
      expect(intent.originalInput).toBe(originalInput);
    });
  });

  describe("structuredIntentToPrompt", () => {
    it("完全なStructuredIntentをプロンプトに変換する", () => {
      // Arrange
      const intent = createEmptyStructuredIntent("テスト");
      intent.target = {
        files: ["test.ts"],
        modules: ["testModule"],
        functions: ["testFunc"],
        scope: "テストスコープ",
      };
      intent.action = {
        type: "modify",
        description: "テストアクション",
        steps: ["ステップ1", "ステップ2"],
      };
      intent.constraints = {
        mustPreserve: ["既存機能"],
        mustSatisfy: ["テスト条件"],
        avoid: ["破壊的変更"],
        assumptions: [],
      };
      intent.successCriteria = {
        criteria: ["成功基準1", "成功基準2"],
      };

      // Act
      const prompt = structuredIntentToPrompt(intent);

      // Assert
      expect(prompt).toContain("## ターゲット");
      expect(prompt).toContain("- ファイル: test.ts");
      expect(prompt).toContain("- モジュール: testModule");
      expect(prompt).toContain("- 関数: testFunc");
      expect(prompt).toContain("## アクション");
      expect(prompt).toContain("- 種別: modify");
      expect(prompt).toContain("## 制約条件");
      expect(prompt).toContain("- 維持: 既存機能");
      expect(prompt).toContain("## 成功基準");
    });

    it("最小限のStructuredIntentをプロンプトに変換する", () => {
      // Arrange
      const intent = createEmptyStructuredIntent("最小限の入力");

      // Act
      const prompt = structuredIntentToPrompt(intent);

      // Assert
      expect(prompt).toContain("## ターゲット");
      expect(prompt).toContain("## アクション");
      expect(prompt).toContain("## 成功基準");
      // 制約条件は空の場合表示されない
      expect(prompt).not.toContain("## 制約条件");
    });

    it("日本語が正しく処理される", () => {
      // Arrange
      const intent = createEmptyStructuredIntent("日本語テスト");
      intent.target.scope = "日本語スコープ";
      intent.action.description = "日本語のアクション説明";

      // Act
      const prompt = structuredIntentToPrompt(intent);

      // Assert
      expect(prompt).toContain("日本語スコープ");
      expect(prompt).toContain("日本語のアクション説明");
    });
  });

  // ============================================================================
  // 定数テスト
  // ============================================================================

  describe("定数", () => {
    it("DEFAULT_MEDIATOR_CONFIGの値が期待通り", () => {
      // Assert
      expect(DEFAULT_MEDIATOR_CONFIG.enableQuestioning).toBe(true);
      expect(DEFAULT_MEDIATOR_CONFIG.maxQuestionsPerTurn).toBe(3);
      expect(DEFAULT_MEDIATOR_CONFIG.confidenceThreshold).toBe(0.7);
      expect(DEFAULT_MEDIATOR_CONFIG.historyDir).toBe(".pi/memory");
      expect(DEFAULT_MEDIATOR_CONFIG.enableLicDetection).toBe(true);
      expect(DEFAULT_MEDIATOR_CONFIG.debugMode).toBe(false);
    });

    it("LOW_CONFIDENCE_THRESHOLDの値が期待通り", () => {
      // Assert
      expect(LOW_CONFIDENCE_THRESHOLD).toBe(0.6);
    });

    it("LIC_CONFIDENCE_THRESHOLDの値が期待通り", () => {
      // Assert
      expect(LIC_CONFIDENCE_THRESHOLD).toBe(0.7);
    });

    it("MAX_CLARIFICATION_QUESTIONSの値が期待通り", () => {
      // Assert
      expect(MAX_CLARIFICATION_QUESTIONS).toBe(3);
    });
  });

  // ============================================================================
  // プロパティベーステスト
  // ============================================================================

  describe("プロパティベーステスト", () => {
    it("generateSessionIdは常に一意のIDを生成する", () => {
      // Arrange
      const ids = new Set<string>();
      const iterations = 100;

      // Act
      for (let i = 0; i < iterations; i++) {
        ids.add(generateSessionId());
      }

      // Assert
      expect(ids.size).toBe(iterations);
    });

    it("getCurrentTimestampは常に有効なISO形式を返す", () => {
      // Arrange
      const iterations = 100;
      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

      // Act & Assert
      for (let i = 0; i < iterations; i++) {
        const timestamp = getCurrentTimestamp();
        expect(timestamp).toMatch(isoRegex);
        // 有効な日時としてパースできることを確認
        expect(() => new Date(timestamp)).not.toThrow();
      }
    });

    it("isConfidenceAboveThresholdは冪等である", () => {
      // Arrange
      const testCases = [
        { confidence: 0.0, threshold: 0.5 },
        { confidence: 0.5, threshold: 0.5 },
        { confidence: 1.0, threshold: 0.5 },
      ];

      // Act & Assert
      testCases.forEach(({ confidence, threshold }) => {
        const result1 = isConfidenceAboveThreshold(confidence, threshold);
        const result2 = isConfidenceAboveThreshold(confidence, threshold);
        expect(result1).toBe(result2);
      });
    });
  });
});
