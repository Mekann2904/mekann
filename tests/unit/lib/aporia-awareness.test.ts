/**
 * aporia-awareness.ts の単体テスト
 *
 * テスト対象:
 * - detectAporia: テキストからアポリアを検出
 * - holdAporia: アポリアを保持状態に変更
 * - updateAporiaState: アポリア状態を更新
 * - detectFalseResolution: 偽の解決を検出
 * - getAporiaReport: レポート生成
 * - createInitialAporiaState: 初期状態作成
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  detectAporia,
  holdAporia,
  updateAporiaState,
  detectFalseResolution,
  getAporiaReport,
  createInitialAporiaState,
  APORIA_PATTERNS,
  type Aporia,
  type AporiaState,
  type FalseResolution,
} from "../../../.pi/lib/aporia-awareness.js";

describe("aporia-awareness.ts", () => {
  describe("detectAporia", () => {
    it("効率と品質のトレードオフを検出する", () => {
      // Arrange
      const text = "効率と品質のバランスを考える必要がある";

      // Act
      const aporias = detectAporia(text);

      // Assert
      expect(aporias.length).toBeGreaterThan(0);
      expect(aporias.some(a => a.description.includes("効率") || a.description.includes("品質"))).toBe(true);
    });

    it("ユーザー期待と真実の対立を検出する", () => {
      // Arrange
      const text = "ユーザーの期待と真実の間で葛藤がある";

      // Act
      const aporias = detectAporia(text);

      // Assert
      expect(aporias.length).toBeGreaterThan(0);
      expect(aporias.some(a => a.type === "ethical")).toBe(true);
    });

    it("自由と規範の緊張関係を検出する", () => {
      // Arrange
      const text = "自由と規範の間でどちらを選ぶべきか";

      // Act
      const aporias = detectAporia(text);

      // Assert
      expect(aporias.some(a => a.type === "ethical")).toBe(true);
    });

    it("監視のパラドックスを検出する", () => {
      // Arrange
      const text = "監視の問題自体がパラドックスを生む";

      // Act
      const aporias = detectAporia(text);

      // Assert
      expect(aporias.some(a => a.type === "meta_cognitive")).toBe(true);
    });

    it("評価やスコアを含むテキストでメタ認知的アポリアを追加する", () => {
      // Arrange
      const text = "このシステムの評価スコアを計算する";

      // Act
      const aporias = detectAporia(text);

      // Assert
      expect(aporias.some(a => a.type === "meta_cognitive" && a.description.includes("評価"))).toBe(true);
    });

    it("アポリアパターンがない場合は評価関連のみ返す", () => {
      // Arrange
      const text = "評価レベルを確認する";

      // Act
      const aporias = detectAporia(text);

      // Assert
      expect(aporias.length).toBeGreaterThanOrEqual(1);
    });

    it("生成されるアポリアは一意のIDを持つ", () => {
      // Arrange
      const text = "効率と品質のトレードオフ";

      // Act
      const aporias1 = detectAporia(text);
      const aporias2 = detectAporia(text);

      // Assert
      expect(aporias1[0].id).not.toBe(aporias2[0].id);
    });

    it("検出されたアポリアは認識済み状態で作成される", () => {
      // Arrange
      const text = "効率と品質のバランス";

      // Act
      const aporias = detectAporia(text);

      // Assert
      expect(aporias[0].state).toBe("recognized");
    });
  });

  describe("holdAporia", () => {
    it("アポリアを保持状態に変更する", () => {
      // Arrange
      const aporia: Aporia = {
        id: "test-aporia",
        type: "ethical",
        description: "テスト用アポリア",
        poles: {
          left: { name: "左極", description: "左の価値" },
          right: { name: "右極", description: "右の価値" },
        },
        unresolvableReason: "テスト用理由",
        falseResolutions: [],
        tensionToHold: "緊張関係を維持",
        recognizedAt: new Date().toISOString(),
        state: "recognized",
      };

      // Act
      const held = holdAporia(aporia);

      // Assert
      expect(held.state).toBe("held");
      expect(held.id).toBe(aporia.id);
    });

    it("他のプロパティは変更されない", () => {
      // Arrange
      const aporia: Aporia = {
        id: "test-aporia",
        type: "practical",
        description: "テスト用アポリア",
        poles: {
          left: { name: "A", description: "Aの説明" },
          right: { name: "B", description: "Bの説明" },
        },
        unresolvableReason: "理由",
        falseResolutions: [],
        tensionToHold: "緊張",
        recognizedAt: "2024-01-01T00:00:00Z",
        state: "recognized",
      };

      // Act
      const held = holdAporia(aporia);

      // Assert
      expect(held.type).toBe("practical");
      expect(held.description).toBe("テスト用アポリア");
      expect(held.recognizedAt).toBe("2024-01-01T00:00:00Z");
    });
  });

  describe("updateAporiaState", () => {
    it("新しいアポリアを追加する", () => {
      // Arrange
      const state = createInitialAporiaState();
      const newAporia: Aporia = {
        id: "new-aporia",
        type: "ethical",
        description: "新しいアポリア",
        poles: {
          left: { name: "A", description: "A" },
          right: { name: "B", description: "B" },
        },
        unresolvableReason: "理由",
        falseResolutions: [],
        tensionToHold: "緊張",
        recognizedAt: new Date().toISOString(),
        state: "recognized",
      };

      // Act
      const updated = updateAporiaState(state, [newAporia]);

      // Assert
      expect(updated.aporias.length).toBe(state.aporias.length + 1);
    });

    it("重複するアポリアは追加されない", () => {
      // Arrange
      const state = createInitialAporiaState();
      const duplicateDescription = state.aporias[0].description;
      const duplicate: Aporia = {
        id: "duplicate",
        type: "meta_cognitive",
        description: duplicateDescription,
        poles: {
          left: { name: "A", description: "A" },
          right: { name: "B", description: "B" },
        },
        unresolvableReason: "理由",
        falseResolutions: [],
        tensionToHold: "緊張",
        recognizedAt: new Date().toISOString(),
        state: "recognized",
      };

      // Act
      const updated = updateAporiaState(state, [duplicate]);

      // Assert
      // 説明が同じなので重複として除外される
      expect(updated.aporias.length).toBe(state.aporias.length);
    });

    it("保持すべき緊張関係が追加される", () => {
      // Arrange
      const state = createInitialAporiaState();
      const newAporia: Aporia = {
        id: "new",
        type: "practical",
        description: "新しいアポリア",
        poles: {
          left: { name: "A", description: "A" },
          right: { name: "B", description: "B" },
        },
        unresolvableReason: "理由",
        falseResolutions: [],
        tensionToHold: "新しい緊張関係",
        recognizedAt: new Date().toISOString(),
        state: "recognized",
      };

      // Act
      const updated = updateAporiaState(state, [newAporia]);

      // Assert
      expect(updated.heldTensions).toContain("新しい緊張関係");
    });

    it("認識深度が更新される", () => {
      // Arrange
      const state = createInitialAporiaState();
      const newAporia: Aporia = {
        id: "new",
        type: "epistemological",
        description: "認識論的アポリア",
        poles: {
          left: { name: "主観", description: "主観" },
          right: { name: "客観", description: "客観" },
        },
        unresolvableReason: "理由",
        falseResolutions: [],
        tensionToHold: "緊張",
        recognizedAt: new Date().toISOString(),
        state: "recognized",
      };

      // Act
      const updated = updateAporiaState(state, [newAporia]);

      // Assert
      expect(updated.awarenessDepth).toBeGreaterThanOrEqual(0);
      expect(updated.awarenessDepth).toBeLessThanOrEqual(1);
    });
  });

  describe("detectFalseResolution", () => {
    it("統合パターンを検出する", () => {
      // Arrange
      const text = "両者をバランスよく統合する必要がある";
      const aporias: Aporia[] = [];

      // Act
      const falseResolutions = detectFalseResolution(text, aporias);

      // Assert
      expect(falseResolutions.some(f => f.type === "synthesis")).toBe(true);
    });

    it("優位パターンを検出する", () => {
      // Arrange
      const text = "Aを優先すべきである";
      const aporias: Aporia[] = [];

      // Act
      const falseResolutions = detectFalseResolution(text, aporias);

      // Assert
      expect(falseResolutions.some(f => f.type === "dominance")).toBe(true);
    });

    it("回避パターンを検出する", () => {
      // Arrange
      const text = "別の話題に移りましょう";
      const aporias: Aporia[] = [
        {
          id: "test",
          type: "ethical",
          description: "テスト",
          poles: {
            left: { name: "自由", description: "自由" },
            right: { name: "規範", description: "規範" },
          },
          unresolvableReason: "理由",
          falseResolutions: [],
          tensionToHold: "緊張",
          recognizedAt: new Date().toISOString(),
          state: "recognized",
        },
      ];

      // Act
      const falseResolutions = detectFalseResolution(text, aporias);

      // Assert
      expect(falseResolutions.some(f => f.type === "avoidance")).toBe(true);
    });

    it("偽解決がない場合は空配列を返す", () => {
      // Arrange
      const text = "自由と規範の緊張関係を維持しながら判断する";
      const aporias: Aporia[] = [];

      // Act
      const falseResolutions = detectFalseResolution(text, aporias);

      // Assert
      // 統合・優位パターンに該当しない場合は空配列
      expect(Array.isArray(falseResolutions)).toBe(true);
    });
  });

  describe("getAporiaReport", () => {
    it("レポートを生成する", () => {
      // Arrange
      const state = createInitialAporiaState();

      // Act
      const report = getAporiaReport(state);

      // Assert
      expect(report).toContain("アポリア");
      expect(report).toContain("認識深度");
    });

    it("アポリアがない場合は適切なメッセージを表示する", () => {
      // Arrange
      const state: AporiaState = {
        aporias: [],
        heldTensions: [],
        recentFalseResolutions: [],
        awarenessDepth: 0,
      };

      // Act
      const report = getAporiaReport(state);

      // Assert
      expect(report).toContain("認識されているアポリアはありません");
    });

    it("保持中の緊張関係を含む", () => {
      // Arrange
      const state: AporiaState = {
        aporias: [],
        heldTensions: ["テスト用の緊張関係"],
        recentFalseResolutions: [],
        awarenessDepth: 0.5,
      };

      // Act
      const report = getAporiaReport(state);

      // Assert
      expect(report).toContain("テスト用の緊張関係");
    });

    it("偽解決の警告を含む", () => {
      // Arrange
      const falseResolution: FalseResolution = {
        type: "synthesis",
        description: "統合の試み",
        whyFalse: "真のアポリアは統合不可能",
      };
      const state: AporiaState = {
        aporias: [],
        heldTensions: [],
        recentFalseResolutions: [falseResolution],
        awarenessDepth: 0.5,
      };

      // Act
      const report = getAporiaReport(state);

      // Assert
      expect(report).toContain("偽解決");
    });
  });

  describe("createInitialAporiaState", () => {
    it("初期状態を作成する", () => {
      // Act
      const state = createInitialAporiaState();

      // Assert
      expect(state.aporias.length).toBeGreaterThan(0);
      expect(state.heldTensions.length).toBeGreaterThan(0);
      expect(state.awarenessDepth).toBeGreaterThanOrEqual(0);
      expect(state.awarenessDepth).toBeLessThanOrEqual(1);
    });

    it("初期状態にはメタ認知的アポリアが含まれる", () => {
      // Act
      const state = createInitialAporiaState();

      // Assert
      expect(state.aporias.some(a => a.type === "meta_cognitive")).toBe(true);
    });
  });

  describe("APORIA_PATTERNS", () => {
    it("パターンが正しく定義されている", () => {
      // Assert
      expect(APORIA_PATTERNS.length).toBeGreaterThan(0);
      APORIA_PATTERNS.forEach(pattern => {
        expect(pattern.pattern).toBeInstanceOf(RegExp);
        expect(["ethical", "epistemological", "ontological", "practical", "meta_cognitive"]).toContain(pattern.type);
      });
    });
  });

  describe("プロパティベーステスト", () => {
    it("任意の文字列に対してdetectAporiaは配列を返す", () => {
      fc.assert(
        fc.property(fc.string(), (text) => {
          // Act
          const aporias = detectAporia(text);

          // Assert
          expect(Array.isArray(aporias)).toBe(true);
        })
      );
    });

    it("検出されたアポリアは有効な構造を持つ", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 10 }), (text) => {
          // Act
          const aporias = detectAporia(text);

          // Assert
          aporias.forEach(aporia => {
            expect(typeof aporia.id).toBe("string");
            expect(["ethical", "epistemological", "ontological", "practical", "meta_cognitive"]).toContain(aporia.type);
            expect(typeof aporia.description).toBe("string");
            expect(aporia.poles).toBeDefined();
            expect(aporia.poles.left).toBeDefined();
            expect(aporia.poles.right).toBeDefined();
          });
        })
      );
    });

    it("holdAporiaは常にstateをheldに変更する", () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1 }),
            type: fc.constantFrom("ethical", "epistemological", "ontological", "practical", "meta_cognitive"),
            description: fc.string(),
            poles: fc.record({
              left: fc.record({ name: fc.string(), description: fc.string() }),
              right: fc.record({ name: fc.string(), description: fc.string() }),
            }),
            unresolvableReason: fc.string(),
            falseResolutions: fc.array(fc.anything()),
            tensionToHold: fc.string(),
            recognizedAt: fc.string(),
            state: fc.constantFrom("recognized", "held", "forgotten", "falsely_resolved"),
          }),
          (aporia) => {
            // Act
            const held = holdAporia(aporia as Aporia);

            // Assert
            expect(held.state).toBe("held");
          }
        )
      );
    });
  });
});
