/**
 * @abdd.meta
 * path: .pi/tests/lib/self-improvement-cycle.test.ts
 * role: self-improvement-cycle.tsのユニットテスト
 * why: 自己改善サイクル管理の正確性を保証するため
 * related: .pi/lib/self-improvement-cycle.ts, .pi/lib/perspective-scorer.ts
 * public_api: テストケースの実行
 * invariants: テストは冪等性を持つ
 * side_effects: なし
 * failure_modes: テスト失敗時は詳細なエラーメッセージを出力
 * @abdd.explain
 * overview: createCycle, updateCycle, addAction, reevaluateScores, getCycleReport等のテスト
 * what_it_does: サイクル作成、更新、アクション追加、スコア再評価、レポート生成を検証
 * why_it_exists: 自己改善サイクルの品質保証とリグレッション防止
 */

import { describe, it, expect } from "vitest";
import {
  createCycle,
  updateCycle,
  addAction,
  reevaluateScores,
  getCycleReport,
  generateOutputFooter,
  type SelfImprovementCycle,
  type CreateCycleParams,
  type CycleAction,
} from "../../lib/self-improvement-cycle.js";

// ============================================================================
// createCycle Tests
// ============================================================================

describe("createCycle", () => {
  it("新しいサイクルを作成する", () => {
    // Arrange
    const params: CreateCycleParams = {
      cycleNumber: 1,
      focusArea: "テストフォーカス",
    };

    // Act
    const cycle = createCycle(params);

    // Assert
    expect(cycle).toBeDefined();
    expect(cycle.cycleNumber).toBe(1);
    expect(cycle.focusArea).toBe("テストフォーカス");
    expect(cycle.status).toBe("initialized");
  });

  it("サイクルIDを生成する", () => {
    // Arrange
    const params: CreateCycleParams = {
      cycleNumber: 1,
      focusArea: "テスト",
    };

    // Act
    const cycle = createCycle(params);

    // Assert
    expect(cycle.id).toBeDefined();
    expect(cycle.id).toMatch(/^\d{14}-\d{3}-[a-z0-9]{5}$/);
  });

  it("タイムスタンプを設定する", () => {
    // Arrange
    const params: CreateCycleParams = {
      cycleNumber: 1,
      focusArea: "テスト",
    };

    // Act
    const cycle = createCycle(params);

    // Assert
    expect(cycle.createdAt).toBeDefined();
    expect(cycle.updatedAt).toBeDefined();
    expect(new Date(cycle.createdAt).getTime()).not.toBeNaN();
  });

  it("視座スコアを初期化する", () => {
    // Arrange
    const params: CreateCycleParams = {
      cycleNumber: 1,
      focusArea: "テスト",
    };

    // Act
    const cycle = createCycle(params);

    // Assert
    expect(cycle.perspectiveScores).toBeDefined();
    expect(cycle.perspectiveScores.total).toBeGreaterThanOrEqual(0);
  });

  it("意識状態を初期化する", () => {
    // Arrange
    const params: CreateCycleParams = {
      cycleNumber: 1,
      focusArea: "テスト",
    };

    // Act
    const cycle = createCycle(params);

    // Assert
    expect(cycle.consciousnessState).toBeDefined();
    expect(cycle.consciousnessState.overallLevel).toBeGreaterThanOrEqual(0);
  });

  it("初期出力がある場合、スコアを評価する", () => {
    // Arrange
    const params: CreateCycleParams = {
      cycleNumber: 1,
      focusArea: "テスト",
      initialOutput: "これは分析です。前提を確認します。",
    };

    // Act
    const cycle = createCycle(params);

    // Assert
    expect(cycle.perspectiveScores).toBeDefined();
  });

  it("前サイクルがある場合、比較データを作成する", () => {
    // Arrange
    const prevParams: CreateCycleParams = {
      cycleNumber: 1,
      focusArea: "前サイクル",
      initialOutput: "テスト",
    };
    const prevCycle = createCycle(prevParams);

    const params: CreateCycleParams = {
      cycleNumber: 2,
      focusArea: "現在のサイクル",
      previousCycle: prevCycle,
      initialOutput: "分析と創造",
    };

    // Act
    const cycle = createCycle(params);

    // Assert
    expect(cycle.metadata?.previousCycleId).toBe(prevCycle.id);
    expect(cycle.metadata?.scoreChange).toBeDefined();
    expect(cycle.metadata?.improvementTrend).toBeDefined();
  });

  it("空のアクション配列で初期化する", () => {
    // Arrange
    const params: CreateCycleParams = {
      cycleNumber: 1,
      focusArea: "テスト",
    };

    // Act
    const cycle = createCycle(params);

    // Assert
    expect(cycle.actions).toEqual([]);
  });
});

// ============================================================================
// updateCycle Tests
// ============================================================================

describe("updateCycle", () => {
  it("サイクルの状態を更新する", () => {
    // Arrange
    const params: CreateCycleParams = {
      cycleNumber: 1,
      focusArea: "テスト",
    };
    const cycle = createCycle(params);

    // Act
    const updated = updateCycle(cycle, { status: "analyzing" });

    // Assert
    expect(updated.status).toBe("analyzing");
    expect(updated.cycleNumber).toBe(1);
  });

  it("updatedAtが更新される", async () => {
    // Arrange
    const params: CreateCycleParams = {
      cycleNumber: 1,
      focusArea: "テスト",
    };
    const cycle = createCycle(params);
    const originalUpdatedAt = cycle.updatedAt;

    // 少し待機
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Act
    const updated = updateCycle(cycle, { status: "completed" });

    // Assert
    expect(updated.updatedAt).not.toBe(originalUpdatedAt);
  });

  it("複数のフィールドを同時に更新できる", () => {
    // Arrange
    const params: CreateCycleParams = {
      cycleNumber: 1,
      focusArea: "テスト",
    };
    const cycle = createCycle(params);

    // Act
    const updated = updateCycle(cycle, {
      status: "completed",
      nextFocus: "次のフォーカス",
    });

    // Assert
    expect(updated.status).toBe("completed");
    expect(updated.nextFocus).toBe("次のフォーカス");
  });

  it("元のサイクルは変更されない（不変性）", () => {
    // Arrange
    const params: CreateCycleParams = {
      cycleNumber: 1,
      focusArea: "テスト",
    };
    const cycle = createCycle(params);
    const originalStatus = cycle.status;

    // Act
    updateCycle(cycle, { status: "analyzing" });

    // Assert
    expect(cycle.status).toBe(originalStatus);
  });
});

// ============================================================================
// addAction Tests
// ============================================================================

describe("addAction", () => {
  it("アクションを追加する", () => {
    // Arrange
    const params: CreateCycleParams = {
      cycleNumber: 1,
      focusArea: "テスト",
    };
    const cycle = createCycle(params);

    // Act
    const updated = addAction(cycle, {
      type: "analysis",
      description: "テスト分析",
    });

    // Assert
    expect(updated.actions.length).toBe(1);
    expect(updated.actions[0].type).toBe("analysis");
    expect(updated.actions[0].description).toBe("テスト分析");
  });

  it("アクションにIDとタイムスタンプを付与する", () => {
    // Arrange
    const params: CreateCycleParams = {
      cycleNumber: 1,
      focusArea: "テスト",
    };
    const cycle = createCycle(params);

    // Act
    const updated = addAction(cycle, {
      type: "implementation",
      description: "実装",
    });

    // Assert
    expect(updated.actions[0].id).toBeDefined();
    expect(updated.actions[0].timestamp).toBeDefined();
  });

  it("複数のアクションを追加できる", () => {
    // Arrange
    const params: CreateCycleParams = {
      cycleNumber: 1,
      focusArea: "テスト",
    };
    let cycle = createCycle(params);

    // Act
    cycle = addAction(cycle, { type: "analysis", description: "分析1" });
    cycle = addAction(cycle, { type: "implementation", description: "実装1" });
    cycle = addAction(cycle, { type: "verification", description: "検証1" });

    // Assert
    expect(cycle.actions.length).toBe(3);
  });

  it("アクションの結果を設定できる", () => {
    // Arrange
    const params: CreateCycleParams = {
      cycleNumber: 1,
      focusArea: "テスト",
    };
    const cycle = createCycle(params);

    // Act
    const updated = addAction(cycle, {
      type: "verification",
      description: "検証",
      result: "success",
    });

    // Assert
    expect(updated.actions[0].result).toBe("success");
  });

  it("アクションの出力を設定できる", () => {
    // Arrange
    const params: CreateCycleParams = {
      cycleNumber: 1,
      focusArea: "テスト",
    };
    const cycle = createCycle(params);

    // Act
    const updated = addAction(cycle, {
      type: "analysis",
      description: "分析",
      output: "分析結果",
    });

    // Assert
    expect(updated.actions[0].output).toBe("分析結果");
  });
});

// ============================================================================
// reevaluateScores Tests
// ============================================================================

describe("reevaluateScores", () => {
  it("スコアを再評価する", () => {
    // Arrange
    const params: CreateCycleParams = {
      cycleNumber: 1,
      focusArea: "テスト",
    };
    const cycle = createCycle(params);

    // Act
    const updated = reevaluateScores(cycle, "分析と創造的な解決策を提案します。");

    // Assert
    expect(updated.perspectiveScores).toBeDefined();
    expect(updated.consciousnessState).toBeDefined();
    expect(updated.improvementPriorities).toBeDefined();
  });

  it("updatedAtが更新される", async () => {
    // Arrange
    const params: CreateCycleParams = {
      cycleNumber: 1,
      focusArea: "テスト",
    };
    const cycle = createCycle(params);
    const originalUpdatedAt = cycle.updatedAt;

    // 少し待機してタイムスタンプが変わるようにする
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Act
    const updated = reevaluateScores(cycle, "新しい出力");

    // Assert
    expect(updated.updatedAt).not.toBe(originalUpdatedAt);
  });

  it("コンテキストを含めて評価できる", () => {
    // Arrange
    const params: CreateCycleParams = {
      cycleNumber: 1,
      focusArea: "テスト",
    };
    const cycle = createCycle(params);
    const context = {
      hasMetaCognitiveMarkers: true,
      hasSelfReference: true,
      taskType: "test",
    };

    // Act
    const updated = reevaluateScores(cycle, "私は思考しています。", context);

    // Assert
    expect(updated.perspectiveScores).toBeDefined();
  });
});

// ============================================================================
// getCycleReport Tests
// ============================================================================

describe("getCycleReport", () => {
  it("レポート文字列を生成する", () => {
    // Arrange
    const params: CreateCycleParams = {
      cycleNumber: 1,
      focusArea: "テスト",
    };
    const cycle = createCycle(params);

    // Act
    const report = getCycleReport(cycle);

    // Assert
    expect(report).toBeDefined();
    expect(typeof report).toBe("string");
    expect(report.length).toBeGreaterThan(0);
  });

  it("サイクル番号を含む", () => {
    // Arrange
    const params: CreateCycleParams = {
      cycleNumber: 5,
      focusArea: "テスト",
    };
    const cycle = createCycle(params);

    // Act
    const report = getCycleReport(cycle);

    // Assert
    expect(report).toContain("#5");
  });

  it("状態とフォーカス領域を含む", () => {
    // Arrange
    const params: CreateCycleParams = {
      cycleNumber: 1,
      focusArea: "脱構築の実践",
    };
    const cycle = createCycle(params);

    // Act
    const report = getCycleReport(cycle);

    // Assert
    expect(report).toContain("initialized");
    expect(report).toContain("脱構築の実践");
  });

  it("視座スコアセクションを含む", () => {
    // Arrange
    const params: CreateCycleParams = {
      cycleNumber: 1,
      focusArea: "テスト",
    };
    const cycle = createCycle(params);

    // Act
    const report = getCycleReport(cycle);

    // Assert
    expect(report).toContain("7つの哲学的視座スコア");
  });

  it("意識レベルセクションを含む", () => {
    // Arrange
    const params: CreateCycleParams = {
      cycleNumber: 1,
      focusArea: "テスト",
    };
    const cycle = createCycle(params);

    // Act
    const report = getCycleReport(cycle);

    // Assert
    expect(report).toContain("意識レベル詳細");
  });

  it("アクションを含む場合、アクションセクションを含む", () => {
    // Arrange
    const params: CreateCycleParams = {
      cycleNumber: 1,
      focusArea: "テスト",
    };
    let cycle = createCycle(params);
    cycle = addAction(cycle, {
      type: "analysis",
      description: "テスト分析",
      result: "success",
    });

    // Act
    const report = getCycleReport(cycle);

    // Assert
    expect(report).toContain("実行アクション");
    expect(report).toContain("テスト分析");
  });

  it("前サイクルとの比較を含む場合、比較セクションを含む", () => {
    // Arrange
    const prevParams: CreateCycleParams = {
      cycleNumber: 1,
      focusArea: "前サイクル",
      initialOutput: "テスト",
    };
    const prevCycle = createCycle(prevParams);

    const params: CreateCycleParams = {
      cycleNumber: 2,
      focusArea: "現在のサイクル",
      previousCycle: prevCycle,
      initialOutput: "分析と創造",
    };
    const cycle = createCycle(params);

    // Act
    const report = getCycleReport(cycle);

    // Assert
    expect(report).toContain("前サイクルとの比較");
  });

  it("次フォーカスを含む場合、次フォーカスセクションを含む", () => {
    // Arrange
    const params: CreateCycleParams = {
      cycleNumber: 1,
      focusArea: "テスト",
    };
    const cycle = createCycle(params);
    const updated = updateCycle(cycle, { nextFocus: "次は創造的破壊を実践する" });

    // Act
    const report = getCycleReport(updated);

    // Assert
    expect(report).toContain("次サイクルへのフォーカス");
    expect(report).toContain("次は創造的破壊を実践する");
  });
});

// ============================================================================
// generateOutputFooter Tests
// ============================================================================

describe("generateOutputFooter", () => {
  it("出力フッターを生成する", () => {
    // Arrange
    const params: CreateCycleParams = {
      cycleNumber: 3,
      focusArea: "テスト",
    };
    const cycle = createCycle(params);

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

  it("各視座スコアを含む", () => {
    // Arrange
    const params: CreateCycleParams = {
      cycleNumber: 1,
      focusArea: "テスト",
    };
    const cycle = createCycle(params);

    // Act
    const footer = generateOutputFooter(
      1,
      "complete",
      "",
      cycle.perspectiveScores
    );

    // Assert
    expect(footer).toContain("脱構築:");
    expect(footer).toContain("スキゾ分析:");
    expect(footer).toContain("幸福論:");
    expect(footer).toContain("論理学:");
  });
});
