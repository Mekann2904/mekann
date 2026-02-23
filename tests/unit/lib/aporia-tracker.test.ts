/**
 * aporia-tracker.ts の単体テスト
 *
 * テスト対象:
 * - AporiaTracker: アポリア追跡システム
 * - registerAporia: 新しいアポリアを登録
 * - recordDecision: 決断を記録
 * - recordDecisionOutcome: 決断の結果を記録
 * - getAporia/getActiveAporiae: アポリアの取得
 * - findSimilarAporiae: 類似アポリアの検索
 * - getStatistics: 統計情報の取得
 * - suggestHowToLive: アポリアの「生き方」を提案
 * - COMMON_APORIAS: 一般的なアポリアパターン
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import {
  AporiaTracker,
  getAporiaTracker,
  COMMON_APORIAS,
  type TrackedAporia,
  type AporiaDecision,
} from "../../../.pi/lib/aporia-tracker.js";

// テスト用の一時ディレクトリ
const TEST_STORAGE_DIR = ".pi/test-aporia-tracker";

describe("aporia-tracker.ts", () => {
  let tracker: AporiaTracker;

  beforeEach(async () => {
    // テスト用のトラッカーを作成
    tracker = new AporiaTracker({
      storageDir: TEST_STORAGE_DIR,
      archiveAfterInactivityMs: 1000, // テスト用に短く設定
      maxTrackedAporiae: 10,
    });
    await tracker.initialize();
  });

  afterEach(async () => {
    // テスト用ディレクトリをクリーンアップ
    const storagePath = path.join(TEST_STORAGE_DIR, "aporiae.json");
    if (fs.existsSync(storagePath)) {
      fs.rmSync(TEST_STORAGE_DIR, { recursive: true, force: true });
    }
  });

  describe("initialize", () => {
    it("初期化後にinitializedフラグが立つ", async () => {
      // Arrange
      const newTracker = new AporiaTracker({ storageDir: TEST_STORAGE_DIR });

      // Act
      await newTracker.initialize();

      // Assert - 間接的に確認（initialize後は操作が可能）
      const aporia = await newTracker.registerAporia({
        name: "テストアポリア",
        firstPole: { label: "A", description: "Aの説明" },
        secondPole: { label: "B", description: "Bの説明" },
        justifications: { forFirst: ["理由1"], forSecond: ["理由2"] },
        whyUnresolvable: "テスト用",
        context: "テストコンテキスト",
      });

      expect(aporia).toBeDefined();
    });

    it("既存のデータを読み込む", async () => {
      // Arrange
      const aporia1 = await tracker.registerAporia({
        name: "保存テスト",
        firstPole: { label: "A", description: "A" },
        secondPole: { label: "B", description: "B" },
        justifications: { forFirst: [], forSecond: [] },
        whyUnresolvable: "理由",
        context: "テスト",
      });

      // Act - 新しいトラッカーで読み込み
      const newTracker = new AporiaTracker({ storageDir: TEST_STORAGE_DIR });
      await newTracker.initialize();

      // Assert
      const loaded = newTracker.getAporia(aporia1.id);
      expect(loaded).toBeDefined();
      expect(loaded?.name).toBe("保存テスト");
    });
  });

  describe("registerAporia", () => {
    it("新しいアポリアを登録する", async () => {
      // Arrange & Act
      const aporia = await tracker.registerAporia({
        name: "効率 vs 品質",
        firstPole: { label: "効率", description: "迅速な提供" },
        secondPole: { label: "品質", description: "高い品質" },
        justifications: {
          forFirst: ["市場投入速度", "リソース効率"],
          forSecond: ["顧客満足", "長期的信頼"],
        },
        whyUnresolvable: "両方の価値が本質的に重要",
        context: "製品開発",
        tags: ["開発", "トレードオフ"],
      });

      // Assert
      expect(aporia.id).toBeDefined();
      expect(aporia.name).toBe("効率 vs 品質");
      expect(aporia.status).toBe("active");
      expect(aporia.tags).toContain("開発");
    });

    it("一意のIDが生成される", async () => {
      // Arrange & Act
      const aporia1 = await tracker.registerAporia({
        name: "テスト1",
        firstPole: { label: "A", description: "A" },
        secondPole: { label: "B", description: "B" },
        justifications: { forFirst: [], forSecond: [] },
        whyUnresolvable: "理由",
        context: "テスト",
      });
      const aporia2 = await tracker.registerAporia({
        name: "テスト2",
        firstPole: { label: "C", description: "C" },
        secondPole: { label: "D", description: "D" },
        justifications: { forFirst: [], forSecond: [] },
        whyUnresolvable: "理由",
        context: "テスト",
      });

      // Assert
      expect(aporia1.id).not.toBe(aporia2.id);
    });

    it("タイムスタンプが正しく設定される", async () => {
      // Arrange
      const before = new Date().toISOString();

      // Act
      const aporia = await tracker.registerAporia({
        name: "タイムスタンプテスト",
        firstPole: { label: "A", description: "A" },
        secondPole: { label: "B", description: "B" },
        justifications: { forFirst: [], forSecond: [] },
        whyUnresolvable: "理由",
        context: "テスト",
      });

      // Assert
      const after = new Date().toISOString();
      expect(aporia.createdAt >= before).toBe(true);
      expect(aporia.updatedAt >= before).toBe(true);
      expect(aporia.createdAt <= after).toBe(true);
    });
  });

  describe("recordDecision", () => {
    it("決断を記録する", async () => {
      // Arrange
      const aporia = await tracker.registerAporia({
        name: "テストアポリア",
        firstPole: { label: "A", description: "A" },
        secondPole: { label: "B", description: "B" },
        justifications: { forFirst: [], forSecond: [] },
        whyUnresolvable: "理由",
        context: "テスト",
      });

      // Act
      const decision = await tracker.recordDecision(aporia.id, {
        context: "開発場面",
        chosenPole: 0,
        reason: "期限が近いため",
        confidence: 0.7,
        acknowledgedAsTentative: true,
        anticipatedRisks: ["品質低下の可能性"],
      });

      // Assert
      expect(decision.id).toBeDefined();
      expect(decision.chosenPole).toBe(0);
      expect(decision.confidence).toBe(0.7);
    });

    it("acknowledgedAsTentativeがfalseの場合は警告する", async () => {
      // Arrange
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const aporia = await tracker.registerAporia({
        name: "テスト",
        firstPole: { label: "A", description: "A" },
        secondPole: { label: "B", description: "B" },
        justifications: { forFirst: [], forSecond: [] },
        whyUnresolvable: "理由",
        context: "テスト",
      });

      // Act
      await tracker.recordDecision(aporia.id, {
        context: "テスト",
        chosenPole: 1,
        reason: "テスト",
        confidence: 0.5,
        acknowledgedAsTentative: false,
        anticipatedRisks: [],
      });

      // Assert
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("警告"));

      // Cleanup
      warnSpy.mockRestore();
    });

    it("存在しないアポリアIDでエラーを投げる", async () => {
      // Act & Assert
      await expect(
        tracker.recordDecision("non-existent-id", {
          context: "テスト",
          chosenPole: 0,
          reason: "テスト",
          confidence: 0.5,
          acknowledgedAsTentative: true,
          anticipatedRisks: [],
        })
      ).rejects.toThrow("Aporia not found");
    });
  });

  describe("recordDecisionOutcome", () => {
    it("決断の結果を記録する", async () => {
      // Arrange
      const aporia = await tracker.registerAporia({
        name: "テスト",
        firstPole: { label: "A", description: "A" },
        secondPole: { label: "B", description: "B" },
        justifications: { forFirst: [], forSecond: [] },
        whyUnresolvable: "理由",
        context: "テスト",
      });
      const decision = await tracker.recordDecision(aporia.id, {
        context: "テスト",
        chosenPole: 0,
        reason: "テスト",
        confidence: 0.5,
        acknowledgedAsTentative: true,
        anticipatedRisks: [],
      });

      // Act
      await tracker.recordDecisionOutcome(aporia.id, decision.id, {
        description: "期待通りの結果",
        unintendedConsequences: ["予期せぬ副作用"],
        wouldChooseDifferently: false,
      });

      // Assert
      const updatedAporia = tracker.getAporia(aporia.id);
      const updatedDecision = updatedAporia?.decisionHistory.find(d => d.id === decision.id);
      expect(updatedDecision?.actualOutcome).toBeDefined();
      expect(updatedDecision?.actualOutcome?.description).toBe("期待通りの結果");
    });

    it("存在しない決断IDでエラーを投げる", async () => {
      // Arrange
      const aporia = await tracker.registerAporia({
        name: "テスト",
        firstPole: { label: "A", description: "A" },
        secondPole: { label: "B", description: "B" },
        justifications: { forFirst: [], forSecond: [] },
        whyUnresolvable: "理由",
        context: "テスト",
      });

      // Act & Assert
      await expect(
        tracker.recordDecisionOutcome(aporia.id, "non-existent-decision", {
          description: "結果",
          unintendedConsequences: [],
          wouldChooseDifferently: false,
        })
      ).rejects.toThrow("Decision not found");
    });
  });

  describe("getAporia / getActiveAporiae", () => {
    it("IDでアポリアを取得する", async () => {
      // Arrange
      const aporia = await tracker.registerAporia({
        name: "取得テスト",
        firstPole: { label: "A", description: "A" },
        secondPole: { label: "B", description: "B" },
        justifications: { forFirst: [], forSecond: [] },
        whyUnresolvable: "理由",
        context: "テスト",
      });

      // Act
      const retrieved = tracker.getAporia(aporia.id);

      // Assert
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe("取得テスト");
    });

    it("存在しないIDはundefinedを返す", () => {
      // Act
      const retrieved = tracker.getAporia("non-existent");

      // Assert
      expect(retrieved).toBeUndefined();
    });

    it("アクティブなアポリアのみを取得する", async () => {
      // Arrange
      await tracker.registerAporia({
        name: "アクティブ1",
        firstPole: { label: "A", description: "A" },
        secondPole: { label: "B", description: "B" },
        justifications: { forFirst: [], forSecond: [] },
        whyUnresolvable: "理由",
        context: "テスト",
      });
      await tracker.registerAporia({
        name: "アクティブ2",
        firstPole: { label: "C", description: "C" },
        secondPole: { label: "D", description: "D" },
        justifications: { forFirst: [], forSecond: [] },
        whyUnresolvable: "理由",
        context: "テスト",
      });

      // Act
      const activeAporiae = tracker.getActiveAporiae();

      // Assert
      expect(activeAporiae.length).toBe(2);
      expect(activeAporiae.every(a => a.status === "active")).toBe(true);
    });
  });

  describe("getAporiaeByTag", () => {
    it("タグでアポリアを検索する", async () => {
      // Arrange
      await tracker.registerAporia({
        name: "タグテスト1",
        firstPole: { label: "A", description: "A" },
        secondPole: { label: "B", description: "B" },
        justifications: { forFirst: [], forSecond: [] },
        whyUnresolvable: "理由",
        context: "テスト",
        tags: ["開発", "重要"],
      });
      await tracker.registerAporia({
        name: "タグテスト2",
        firstPole: { label: "C", description: "C" },
        secondPole: { label: "D", description: "D" },
        justifications: { forFirst: [], forSecond: [] },
        whyUnresolvable: "理由",
        context: "テスト",
        tags: ["設計"],
      });

      // Act
      const developmentAporiae = tracker.getAporiaeByTag("開発");

      // Assert
      expect(developmentAporiae.length).toBe(1);
      expect(developmentAporiae[0].name).toBe("タグテスト1");
    });
  });

  describe("findSimilarAporiae", () => {
    it("類似のアポリアを検索する", async () => {
      // Arrange
      await tracker.registerAporia({
        name: "効率 vs 品質",
        firstPole: { label: "効率", description: "A" },
        secondPole: { label: "品質", description: "B" },
        justifications: { forFirst: [], forSecond: [] },
        whyUnresolvable: "理由",
        context: "テスト",
      });

      // Act
      const similar = tracker.findSimilarAporiae(["効率", "品質"]);

      // Assert
      expect(similar.length).toBeGreaterThan(0);
      expect(similar[0].name).toBe("効率 vs 品質");
    });

    it("部分一致で検索する", async () => {
      // Arrange
      await tracker.registerAporia({
        name: "安全性 vs 有用性",
        firstPole: { label: "安全性", description: "A" },
        secondPole: { label: "有用性", description: "B" },
        justifications: { forFirst: [], forSecond: [] },
        whyUnresolvable: "理由",
        context: "テスト",
      });

      // Act
      const similar = tracker.findSimilarAporiae(["安全", "有用"]);

      // Assert
      expect(similar.length).toBeGreaterThan(0);
    });
  });

  describe("getStatistics", () => {
    it("統計情報を取得する", async () => {
      // Arrange
      await tracker.registerAporia({
        name: "統計テスト1",
        firstPole: { label: "A", description: "A" },
        secondPole: { label: "B", description: "B" },
        justifications: { forFirst: [], forSecond: [] },
        whyUnresolvable: "理由",
        context: "テスト",
        tags: ["タグ1"],
      });
      await tracker.registerAporia({
        name: "統計テスト2",
        firstPole: { label: "C", description: "C" },
        secondPole: { label: "D", description: "D" },
        justifications: { forFirst: [], forSecond: [] },
        whyUnresolvable: "理由",
        context: "テスト",
        tags: ["タグ1", "タグ2"],
      });

      // Act
      const stats = tracker.getStatistics();

      // Assert
      expect(stats.totalAporiae).toBe(2);
      expect(stats.activeAporiae).toBe(2);
      expect(stats.mostFrequentTags.length).toBeGreaterThan(0);
    });
  });

  describe("suggestHowToLive", () => {
    it("アポリアの「生き方」を提案する", async () => {
      // Arrange
      const aporia = await tracker.registerAporia({
        name: "提案テスト",
        firstPole: { label: "自由", description: "A" },
        secondPole: { label: "規範", description: "B" },
        justifications: { forFirst: [], forSecond: [] },
        whyUnresolvable: "理由",
        context: "テスト",
      });

      // Act
      const suggestion = tracker.suggestHowToLive(aporia.id);

      // Assert
      expect(suggestion.guidelines.length).toBeGreaterThan(0);
      expect(suggestion.warnings.length).toBeGreaterThan(0);
      expect(suggestion.guidelines.some(g => g.includes("正解"))).toBe(true);
    });

    it("過去の決断を含む", async () => {
      // Arrange
      const aporia = await tracker.registerAporia({
        name: "決断履歴テスト",
        firstPole: { label: "A", description: "A" },
        secondPole: { label: "B", description: "B" },
        justifications: { forFirst: [], forSecond: [] },
        whyUnresolvable: "理由",
        context: "テスト",
      });
      await tracker.recordDecision(aporia.id, {
        context: "テストコンテキスト",
        chosenPole: 0,
        reason: "テスト理由",
        confidence: 0.8,
        acknowledgedAsTentative: true,
        anticipatedRisks: [],
      });

      // Act
      const suggestion = tracker.suggestHowToLive(aporia.id);

      // Assert
      expect(suggestion.pastDecisions.length).toBe(1);
      expect(suggestion.pastDecisions[0]).toContain("テスト理由");
    });

    it("存在しないIDでエラーを投げる", () => {
      // Act & Assert
      expect(() => tracker.suggestHowToLive("non-existent")).toThrow("Aporia not found");
    });
  });

  describe("archiveInactiveAporiae", () => {
    it("非活動アポリアをアーカイブする", async () => {
      // Arrange
      const aporia = await tracker.registerAporia({
        name: "アーカイブテスト",
        firstPole: { label: "A", description: "A" },
        secondPole: { label: "B", description: "B" },
        justifications: { forFirst: [], forSecond: [] },
        whyUnresolvable: "理由",
        context: "テスト",
      });

      // updatedAtを過去に設定（簡易的に直接操作）
      const internalAporia = tracker.getAporia(aporia.id);
      if (internalAporia) {
        internalAporia.updatedAt = new Date(Date.now() - 5000).toISOString();
      }

      // Act
      const archivedCount = await tracker.archiveInactiveAporiae();

      // Assert
      expect(archivedCount).toBe(1);
      expect(tracker.getAporia(aporia.id)?.status).toBe("archived");
    });
  });

  describe("COMMON_APORIAS", () => {
    it("一般的なアポリアが定義されている", () => {
      // Assert
      expect(COMMON_APORIAS.completeness_vs_speed).toBeDefined();
      expect(COMMON_APORIAS.safety_vs_utility).toBeDefined();
      expect(COMMON_APORIAS.autonomy_vs_compliance).toBeDefined();
      expect(COMMON_APORIAS.consistency_vs_context).toBeDefined();
      expect(COMMON_APORIAS.truth_vs_kindness).toBeDefined();
      expect(COMMON_APORIAS.simplicity_vs_expressiveness).toBeDefined();
    });

    it("各アポリアは必要なプロパティを持つ", () => {
      // Assert
      Object.values(COMMON_APORIAS).forEach(aporia => {
        expect(aporia.name).toBeDefined();
        expect(aporia.description).toBeDefined();
        expect(aporia.poles.first).toBeDefined();
        expect(aporia.poles.second).toBeDefined();
      });
    });
  });

  describe("getAporiaTracker", () => {
    it("シングルトンインスタンスを返す", () => {
      // Act
      const instance1 = getAporiaTracker();
      const instance2 = getAporiaTracker();

      // Assert
      expect(instance1).toBe(instance2);
    });
  });

  describe("プロパティベーステスト", () => {
    it("任意の正当なパラメータでregisterAporiaが成功する", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 100 }),
            firstPole: fc.record({
              label: fc.string({ minLength: 1, maxLength: 50 }),
              description: fc.string({ maxLength: 200 }),
            }),
            secondPole: fc.record({
              label: fc.string({ minLength: 1, maxLength: 50 }),
              description: fc.string({ maxLength: 200 }),
            }),
            justifications: fc.record({
              forFirst: fc.array(fc.string({ maxLength: 100 })),
              forSecond: fc.array(fc.string({ maxLength: 100 })),
            }),
            whyUnresolvable: fc.string({ minLength: 1 }),
            context: fc.string({ minLength: 1 }),
            tags: fc.array(fc.string({ minLength: 1, maxLength: 20 })),
          }),
          async (params) => {
            // Act
            const aporia = await tracker.registerAporia(params);

            // Assert
            expect(aporia.id).toBeDefined();
            expect(aporia.name).toBe(params.name);
            expect(aporia.status).toBe("active");
          }
        )
      );
    });

    it("決断の確信度は0.0-1.0の範囲", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
          async (confidence) => {
            // Arrange
            const aporia = await tracker.registerAporia({
              name: "PBTテスト",
              firstPole: { label: "A", description: "A" },
              secondPole: { label: "B", description: "B" },
              justifications: { forFirst: [], forSecond: [] },
              whyUnresolvable: "理由",
              context: "テスト",
            });

            // Act
            const decision = await tracker.recordDecision(aporia.id, {
              context: "テスト",
              chosenPole: 0,
              reason: "テスト",
              confidence,
              acknowledgedAsTentative: true,
              anticipatedRisks: [],
            });

            // Assert
            expect(decision.confidence).toBeGreaterThanOrEqual(0);
            expect(decision.confidence).toBeLessThanOrEqual(1);
          }
        )
      );
    });
  });
});
