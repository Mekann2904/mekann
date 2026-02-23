/**
 * mediator-types.ts の単体テスト
 *
 * テスト対象:
 * - generateSessionId: セッションID生成
 * - getCurrentTimestamp: タイムスタンプ取得
 * - isConfidenceAboveThreshold: 信頼度チェック
 * - createEmptyStructuredIntent: 空の構造化意図作成
 * - structuredIntentToPrompt: 構造化意図のプロンプト変換
 * - DEFAULT_MEDIATOR_CONFIG: デフォルト設定
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  generateSessionId,
  getCurrentTimestamp,
  isConfidenceAboveThreshold,
  createEmptyStructuredIntent,
  structuredIntentToPrompt,
  DEFAULT_MEDIATOR_CONFIG,
  LOW_CONFIDENCE_THRESHOLD,
  LIC_CONFIDENCE_THRESHOLD,
  MAX_CLARIFICATION_QUESTIONS,
  type StructuredIntent,
  type Confidence,
} from "../../../.pi/lib/mediator-types.js";

describe("mediator-types.ts", () => {
  describe("generateSessionId", () => {
    it("セッションIDを生成する", () => {
      // Act
      const sessionId = generateSessionId();

      // Assert
      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe("string");
      expect(sessionId.length).toBeGreaterThan(0);
    });

    it("生成されるIDは一意である", () => {
      // Act
      const id1 = generateSessionId();
      const id2 = generateSessionId();

      // Assert
      expect(id1).not.toBe(id2);
    });

    it("形式は session-TIMESTAMP-RANDOM である", () => {
      // Act
      const sessionId = generateSessionId();

      // Assert
      expect(sessionId).toMatch(/^session-\d{14}-[a-z0-9]{4}$/);
    });

    it("複数回呼び出しても異なるIDを生成する", () => {
      // Act
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateSessionId());
      }

      // Assert
      expect(ids.size).toBe(100);
    });
  });

  describe("getCurrentTimestamp", () => {
    it("ISO 8601形式のタイムスタンプを返す", () => {
      // Act
      const timestamp = getCurrentTimestamp();

      // Assert
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it("現在時刻に近い値を返す", () => {
      // Arrange
      const before = new Date().toISOString();

      // Act
      const timestamp = getCurrentTimestamp();

      // Assert
      const after = new Date().toISOString();
      expect(timestamp >= before).toBe(true);
      expect(timestamp <= after).toBe(true);
    });
  });

  describe("isConfidenceAboveThreshold", () => {
    it("閾値以上の信頼度でtrueを返す", () => {
      // Arrange
      const confidence = 0.8;
      const threshold = 0.7;

      // Act
      const result = isConfidenceAboveThreshold(confidence, threshold);

      // Assert
      expect(result).toBe(true);
    });

    it("閾値未満の信頼度でfalseを返す", () => {
      // Arrange
      const confidence = 0.5;
      const threshold = 0.7;

      // Act
      const result = isConfidenceAboveThreshold(confidence, threshold);

      // Assert
      expect(result).toBe(false);
    });

    it("閾値と等しい場合はtrueを返す", () => {
      // Arrange
      const confidence = 0.7;
      const threshold = 0.7;

      // Act
      const result = isConfidenceAboveThreshold(confidence, threshold);

      // Assert
      expect(result).toBe(true);
    });

    it("デフォルト閾値は0.7", () => {
      // Arrange
      const confidence = 0.69;

      // Act
      const result = isConfidenceAboveThreshold(confidence);

      // Assert
      expect(result).toBe(false);
    });

    describe("境界値テスト", () => {
      it("信頼度0.0でfalse", () => {
        expect(isConfidenceAboveThreshold(0, 0.5)).toBe(false);
      });

      it("信頼度1.0でtrue", () => {
        expect(isConfidenceAboveThreshold(1, 0.5)).toBe(true);
      });

      it("閾値0.0の場合は常にtrue", () => {
        expect(isConfidenceAboveThreshold(0, 0)).toBe(true);
        expect(isConfidenceAboveThreshold(0.5, 0)).toBe(true);
      });

      it("閾値1.0の場合は信頼度1.0のみtrue", () => {
        expect(isConfidenceAboveThreshold(0.99, 1)).toBe(false);
        expect(isConfidenceAboveThreshold(1, 1)).toBe(true);
      });
    });
  });

  describe("createEmptyStructuredIntent", () => {
    it("空の構造化意図を作成する", () => {
      // Arrange
      const input = "テスト入力";

      // Act
      const intent = createEmptyStructuredIntent(input);

      // Assert
      expect(intent.target.scope).toBe("unknown");
      expect(intent.action.type).toBe("unknown");
      expect(intent.confidence).toBe(0);
      expect(intent.clarificationNeeded).toBe(true);
    });

    it("元の入力を保持する", () => {
      // Arrange
      const input = "これを修正して";

      // Act
      const intent = createEmptyStructuredIntent(input);

      // Assert
      expect(intent.originalInput).toBe(input);
    });

    it("制約条件は空配列", () => {
      // Arrange
      const input = "テスト";

      // Act
      const intent = createEmptyStructuredIntent(input);

      // Assert
      expect(intent.constraints.mustPreserve).toEqual([]);
      expect(intent.constraints.mustSatisfy).toEqual([]);
      expect(intent.constraints.avoid).toEqual([]);
      expect(intent.constraints.assumptions).toEqual([]);
    });

    it("成功基準は空配列", () => {
      // Arrange
      const input = "テスト";

      // Act
      const intent = createEmptyStructuredIntent(input);

      // Assert
      expect(intent.successCriteria.criteria).toEqual([]);
    });

    it("解釈の根拠は空配列", () => {
      // Arrange
      const input = "テスト";

      // Act
      const intent = createEmptyStructuredIntent(input);

      // Assert
      expect(intent.interpretationBasis).toEqual([]);
    });
  });

  describe("structuredIntentToPrompt", () => {
    it("基本的な構造化意図をプロンプトに変換する", () => {
      // Arrange
      const intent: StructuredIntent = {
        target: { scope: "ファイル修正" },
        action: { type: "modify", description: "バグ修正" },
        constraints: {
          mustPreserve: [],
          mustSatisfy: [],
          avoid: [],
          assumptions: [],
        },
        successCriteria: { criteria: ["テストが通る"] },
        confidence: 0.8,
        clarificationNeeded: false,
        originalInput: "修正して",
        interpretationBasis: [],
      };

      // Act
      const prompt = structuredIntentToPrompt(intent);

      // Assert
      expect(prompt).toContain("## ターゲット");
      expect(prompt).toContain("## アクション");
      expect(prompt).toContain("## 成功基準");
      expect(prompt).toContain("ファイル修正");
      expect(prompt).toContain("modify");
      expect(prompt).toContain("バグ修正");
    });

    it("ファイル情報を含む場合", () => {
      // Arrange
      const intent: StructuredIntent = {
        target: {
          scope: "特定ファイル",
          files: ["src/main.ts", "src/utils.ts"],
        },
        action: { type: "create", description: "新規作成" },
        constraints: {
          mustPreserve: [],
          mustSatisfy: [],
          avoid: [],
          assumptions: [],
        },
        successCriteria: { criteria: [] },
        confidence: 0.9,
        clarificationNeeded: false,
        originalInput: "作成して",
        interpretationBasis: [],
      };

      // Act
      const prompt = structuredIntentToPrompt(intent);

      // Assert
      expect(prompt).toContain("src/main.ts");
      expect(prompt).toContain("src/utils.ts");
    });

    it("制約条件を含む場合", () => {
      // Arrange
      const intent: StructuredIntent = {
        target: { scope: "リファクタリング" },
        action: { type: "refactor", description: "コード整理" },
        constraints: {
          mustPreserve: ["既存API"],
          mustSatisfy: ["テスト維持"],
          avoid: ["破壊的変更"],
          assumptions: [],
        },
        successCriteria: { criteria: ["テスト通過"] },
        confidence: 0.7,
        clarificationNeeded: false,
        originalInput: "リファクタリングして",
        interpretationBasis: [],
      };

      // Act
      const prompt = structuredIntentToPrompt(intent);

      // Assert
      expect(prompt).toContain("## 制約条件");
      expect(prompt).toContain("既存API");
      expect(prompt).toContain("テスト維持");
      expect(prompt).toContain("破壊的変更");
    });

    it("実行ステップを含む場合", () => {
      // Arrange
      const intent: StructuredIntent = {
        target: { scope: "修正" },
        action: {
          type: "modify",
          description: "修正",
          steps: ["ファイルを開く", "コードを修正", "テストを実行"],
        },
        constraints: {
          mustPreserve: [],
          mustSatisfy: [],
          avoid: [],
          assumptions: [],
        },
        successCriteria: { criteria: [] },
        confidence: 0.8,
        clarificationNeeded: false,
        originalInput: "修正して",
        interpretationBasis: [],
      };

      // Act
      const prompt = structuredIntentToPrompt(intent);

      // Assert
      expect(prompt).toContain("- ステップ:");
      expect(prompt).toContain("1. ファイルを開く");
      expect(prompt).toContain("2. コードを修正");
      expect(prompt).toContain("3. テストを実行");
    });
  });

  describe("DEFAULT_MEDIATOR_CONFIG", () => {
    it("デフォルト設定が正しく定義されている", () => {
      // Assert
      expect(DEFAULT_MEDIATOR_CONFIG.enableQuestioning).toBe(true);
      expect(DEFAULT_MEDIATOR_CONFIG.maxQuestionsPerTurn).toBe(3);
      expect(DEFAULT_MEDIATOR_CONFIG.confidenceThreshold).toBe(0.7);
      expect(DEFAULT_MEDIATOR_CONFIG.historyDir).toBe(".pi/memory");
      expect(DEFAULT_MEDIATOR_CONFIG.enableLicDetection).toBe(true);
    });
  });

  describe("定数", () => {
    it("LOW_CONFIDENCE_THRESHOLDが正しい", () => {
      expect(LOW_CONFIDENCE_THRESHOLD).toBe(0.6);
    });

    it("LIC_CONFIDENCE_THRESHOLDが正しい", () => {
      expect(LIC_CONFIDENCE_THRESHOLD).toBe(0.7);
    });

    it("MAX_CLARIFICATION_QUESTIONSが正しい", () => {
      expect(MAX_CLARIFICATION_QUESTIONS).toBe(3);
    });
  });

  describe("プロパティベーステスト", () => {
    it("generateSessionIdは常に有効な形式", () => {
      fc.assert(
        fc.property(fc.integer(0, 100), (n) => {
          // Act
          const id = generateSessionId();

          // Assert
          expect(id).toMatch(/^session-\d{14}-[a-z0-9]{4}$/);
        })
      );
    });

    it("isConfidenceAboveThresholdは任意の信頼度と閾値で一貫した結果", () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 1 }),
          fc.float({ min: 0, max: 1 }),
          (confidence, threshold) => {
            // Act
            const result = isConfidenceAboveThreshold(confidence, threshold);

            // Assert
            expect(result).toBe(confidence >= threshold);
          }
        )
      );
    });

    it("createEmptyStructuredIntentは任意の入力で有効な構造を返す", () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          // Act
          const intent = createEmptyStructuredIntent(input);

          // Assert
          expect(intent.originalInput).toBe(input);
          expect(intent.confidence).toBe(0);
          expect(intent.clarificationNeeded).toBe(true);
          expect(intent.action.type).toBe("unknown");
        })
      );
    });

    it("structuredIntentToPromptは有効な文字列を返す", () => {
      fc.assert(
        fc.property(
          fc.record({
            target: fc.record({
              scope: fc.string(),
              files: fc.option(fc.array(fc.string())),
              modules: fc.option(fc.array(fc.string())),
              functions: fc.option(fc.array(fc.string())),
            }),
            action: fc.record({
              type: fc.constantFrom("create", "modify", "delete", "query", "unknown"),
              description: fc.string(),
              steps: fc.option(fc.array(fc.string())),
            }),
            constraints: fc.record({
              mustPreserve: fc.array(fc.string()),
              mustSatisfy: fc.array(fc.string()),
              avoid: fc.array(fc.string()),
              assumptions: fc.array(fc.string()),
            }),
            successCriteria: fc.record({
              criteria: fc.array(fc.string()),
            }),
            confidence: fc.float({ min: 0, max: 1 }),
            clarificationNeeded: fc.boolean(),
            originalInput: fc.string(),
            interpretationBasis: fc.array(fc.string()),
          }),
          (intent) => {
            // Act
            const prompt = structuredIntentToPrompt(intent as StructuredIntent);

            // Assert
            expect(typeof prompt).toBe("string");
            expect(prompt.length).toBeGreaterThan(0);
            expect(prompt).toContain("## ターゲット");
            expect(prompt).toContain("## アクション");
          }
        )
      );
    });
  });
});
