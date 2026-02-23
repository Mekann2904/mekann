/**
 * self-improvement-cycle.tsの単体テスト
 * 自己改善サイクル管理モジュールを検証する
 */

import { describe, it, expect } from "vitest";
import {
  type CycleStatus,
  type SelfImprovementCycle,
  type CycleAction,
  type CreateCycleParams,
  createCycle,
  updateCycle,
  addAction,
  reevaluateScores,
  getCycleReport,
  generateOutputFooter,
} from "../../lib/self-improvement-cycle.js";

describe("self-improvement-cycle", () => {
  describe("createCycle", () => {
    it("新しいサイクルを作成する", () => {
      // Arrange
      const params: CreateCycleParams = {
        cycleNumber: 1,
        focusArea: "テスト領域",
      };

      // Act
      const cycle = createCycle(params);

      // Assert
      expect(cycle.id).toBeDefined();
      expect(cycle.cycleNumber).toBe(1);
      expect(cycle.status).toBe("initialized");
      expect(cycle.focusArea).toBe("テスト領域");
      expect(cycle.createdAt).toBeDefined();
      expect(cycle.updatedAt).toBeDefined();
    });

    it("初期出力がある場合は評価を行う", () => {
      // Arrange
      const params: CreateCycleParams = {
        cycleNumber: 1,
        focusArea: "評価テスト",
        initialOutput: "これはテストです。CONFIDENCE: 0.8",
        context: {
          hasMetaCognitiveMarkers: true,
        },
      };

      // Act
      const cycle = createCycle(params);

      // Assert
      expect(cycle.perspectiveScores).toBeDefined();
      expect(cycle.perspectiveScores.total).toBeGreaterThan(0);
      expect(cycle.consciousnessState).toBeDefined();
    });

    it("前サイクルがある場合は比較メタデータを含む", () => {
      // Arrange
      const previousCycle = createCycle({
        cycleNumber: 1,
        focusArea: "前サイクル",
      });

      const params: CreateCycleParams = {
        cycleNumber: 2,
        focusArea: "現在サイクル",
        previousCycle,
      };

      // Act
      const cycle = createCycle(params);

      // Assert
      expect(cycle.metadata?.previousCycleId).toBe(previousCycle.id);
      expect(cycle.metadata?.improvementTrend).toBeDefined();
      expect(cycle.metadata?.scoreChange).toBeDefined();
    });

    it("サイクルIDは一意である", () => {
      // Arrange
      const params1: CreateCycleParams = { cycleNumber: 1, focusArea: "A" };
      const params2: CreateCycleParams = { cycleNumber: 1, focusArea: "B" };

      // Act
      const cycle1 = createCycle(params1);
      const cycle2 = createCycle(params2);

      // Assert
      expect(cycle1.id).not.toBe(cycle2.id);
    });
  });

  describe("updateCycle", () => {
    it("サイクルを更新する", () => {
      // Arrange
      const cycle = createCycle({ cycleNumber: 1, focusArea: "テスト" });

      // Act
      const updated = updateCycle(cycle, {
        status: "analyzing",
        focusArea: "更新された領域",
      });

      // Assert
      expect(updated.status).toBe("analyzing");
      expect(updated.focusArea).toBe("更新された領域");
      expect(updated.updatedAt).not.toBe(cycle.updatedAt);
    });

    it("元のサイクルは変更されない（イミュータブル）", () => {
      // Arrange
      const cycle = createCycle({ cycleNumber: 1, focusArea: "テスト" });
      const originalStatus = cycle.status;

      // Act
      updateCycle(cycle, { status: "completed" });

      // Assert
      expect(cycle.status).toBe(originalStatus);
    });
  });

  describe("addAction", () => {
    it("アクションを追加する", () => {
      // Arrange
      const cycle = createCycle({ cycleNumber: 1, focusArea: "テスト" });

      // Act
      const updated = addAction(cycle, {
        type: "analysis",
        description: "コード分析を実行",
        result: "success",
      });

      // Assert
      expect(updated.actions.length).toBe(1);
      expect(updated.actions[0].type).toBe("analysis");
      expect(updated.actions[0].description).toBe("コード分析を実行");
      expect(updated.actions[0].id).toBeDefined();
      expect(updated.actions[0].timestamp).toBeDefined();
    });

    it("複数のアクションを追加できる", () => {
      // Arrange
      let cycle = createCycle({ cycleNumber: 1, focusArea: "テスト" });

      // Act
      cycle = addAction(cycle, { type: "analysis", description: "分析" });
      cycle = addAction(cycle, { type: "implementation", description: "実装" });
      cycle = addAction(cycle, { type: "verification", description: "検証" });

      // Assert
      expect(cycle.actions.length).toBe(3);
    });

    it("アクションIDは連番である", () => {
      // Arrange
      let cycle = createCycle({ cycleNumber: 1, focusArea: "テスト" });

      // Act
      cycle = addAction(cycle, { type: "analysis", description: "A" });
      cycle = addAction(cycle, { type: "analysis", description: "B" });

      // Assert
      expect(cycle.actions[0].id).toBe("action-1");
      expect(cycle.actions[1].id).toBe("action-2");
    });
  });

  describe("reevaluateScores", () => {
    it("スコアを再評価する", () => {
      // Arrange
      const cycle = createCycle({ cycleNumber: 1, focusArea: "テスト" });
      const newOutput = "思考プロセス：分析しました。CLAIM: 結論です。CONFIDENCE: 0.9";

      // Act
      const updated = reevaluateScores(cycle, newOutput, {
        hasMetaCognitiveMarkers: true,
      });

      // Assert
      expect(updated.perspectiveScores).toBeDefined();
      expect(updated.consciousnessState).toBeDefined();
      expect(updated.improvementPriorities).toBeDefined();
    });

    it("コンテキストなしでも動作する", () => {
      // Arrange
      const cycle = createCycle({ cycleNumber: 1, focusArea: "テスト" });

      // Act
      const updated = reevaluateScores(cycle, "テスト出力");

      // Assert
      expect(updated.perspectiveScores).toBeDefined();
    });
  });

  describe("getCycleReport", () => {
    it("完全なレポートを生成する", () => {
      // Arrange
      const cycle = createCycle({ cycleNumber: 1, focusArea: "テスト領域" });

      // Act
      const report = getCycleReport(cycle);

      // Assert
      expect(report).toContain("自己改善サイクル #1");
      expect(report).toContain("テスト領域");
      expect(report).toContain("7つの哲学的視座スコア");
      expect(report).toContain("意識レベル詳細");
    });

    it("前サイクルとの比較を含む", () => {
      // Arrange
      const previousCycle = createCycle({ cycleNumber: 1, focusArea: "前" });
      const cycle = createCycle({
        cycleNumber: 2,
        focusArea: "後",
        previousCycle,
      });

      // Act
      const report = getCycleReport(cycle);

      // Assert
      expect(report).toContain("前サイクルとの比較");
      // 傾向は **傾向**: 形式で出力される
      expect(report).toContain("**傾向**:");
    });

    it("アクションを含む", () => {
      // Arrange
      let cycle = createCycle({ cycleNumber: 1, focusArea: "テスト" });
      cycle = addAction(cycle, {
        type: "analysis",
        description: "分析実行",
        result: "success",
      });

      // Act
      const report = getCycleReport(cycle);

      // Assert
      expect(report).toContain("実行アクション");
      expect(report).toContain("分析実行");
    });

    it("次フォーカスを含む", () => {
      // Arrange
      const cycle = createCycle({ cycleNumber: 1, focusArea: "テスト" });
      const updated = updateCycle(cycle, { nextFocus: "次はこれに集中" });

      // Act
      const report = getCycleReport(updated);

      // Assert
      expect(report).toContain("次サイクルへのフォーカス");
      expect(report).toContain("次はこれに集中");
    });
  });

  describe("generateOutputFooter", () => {
    it("終了フォーマットを生成する", () => {
      // Arrange
      const cycle = createCycle({ cycleNumber: 3, focusArea: "テスト" });

      // Act
      const footer = generateOutputFooter(
        3,
        "continue",
        "次のフォーカス",
        cycle.perspectiveScores
      );

      // Assert
      expect(footer).toContain("CYCLE: 3");
      expect(footer).toContain("LOOP_STATUS: continue");
      expect(footer).toContain("NEXT_FOCUS: 次のフォーカス");
      expect(footer).toContain("PERSPECTIVE_SCORES:");
    });

    it("すべての視座スコアを含む", () => {
      // Arrange
      const cycle = createCycle({ cycleNumber: 1, focusArea: "テスト" });

      // Act
      const footer = generateOutputFooter(
        1,
        "complete",
        "完了",
        cycle.perspectiveScores
      );

      // Assert
      expect(footer).toContain("脱構築:");
      expect(footer).toContain("スキゾ分析:");
      expect(footer).toContain("幸福論:");
      expect(footer).toContain("論理学:");
    });
  });

  describe("状態遷移", () => {
    it("初期化→分析→実装→検証→完了の遷移が可能", () => {
      // Arrange
      let cycle = createCycle({ cycleNumber: 1, focusArea: "テスト" });
      expect(cycle.status).toBe("initialized");

      // Act & Assert
      cycle = updateCycle(cycle, { status: "analyzing" });
      expect(cycle.status).toBe("analyzing");

      cycle = updateCycle(cycle, { status: "implementing" });
      expect(cycle.status).toBe("implementing");

      cycle = updateCycle(cycle, { status: "verifying" });
      expect(cycle.status).toBe("verifying");

      cycle = updateCycle(cycle, { status: "completed" });
      expect(cycle.status).toBe("completed");
    });
  });
});
