/**
 * cost-estimator.ts 単体テスト
 * カバレッジ分析: CostEstimator クラス, estimate, recordExecution, getStats,
 * getCostEstimator, createCostEstimator, resetCostEstimator
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "vitest";
import * as fc from "fast-check";
import {
  CostEstimator,
  getCostEstimator,
  createCostEstimator,
  resetCostEstimator,
  type TaskSource,
  type ExecutionHistoryEntry,
} from "../../../.pi/lib/cost-estimator.js";

// ============================================================================
// CostEstimator クラステスト
// ============================================================================

describe("CostEstimator", () => {
  let estimator: CostEstimator;

  beforeEach(() => {
    estimator = createCostEstimator();
  });

  // ==========================================================================
  // estimate テスト
  // ==========================================================================

  describe("estimate", () => {
    it("estimate_履歴なし_デフォルト推定返却", () => {
      // Arrange & Act
      const result = estimator.estimate("subagent_run");

      // Assert
      expect(result.method).toBe("default");
      expect(result.estimatedDurationMs).toBeGreaterThan(0);
      expect(result.estimatedTokens).toBeGreaterThan(0);
      expect(result.confidence).toBe(0.5);
    });

    it("estimate_subagent_run_デフォルト30秒", () => {
      // Arrange & Act
      const result = estimator.estimate("subagent_run");

      // Assert
      expect(result.estimatedDurationMs).toBe(30_000);
      expect(result.estimatedTokens).toBe(4000);
    });

    it("estimate_subagent_run_parallel_デフォルト45秒", () => {
      // Arrange & Act
      const result = estimator.estimate("subagent_run_parallel");

      // Assert
      expect(result.estimatedDurationMs).toBe(45_000);
      expect(result.estimatedTokens).toBe(8000);
    });

    it("estimate_agent_team_run_デフォルト60秒", () => {
      // Arrange & Act
      const result = estimator.estimate("agent_team_run");

      // Assert
      expect(result.estimatedDurationMs).toBe(60_000);
      expect(result.estimatedTokens).toBe(12000);
    });

    it("estimate_agent_team_run_parallel_デフォルト90秒", () => {
      // Arrange & Act
      const result = estimator.estimate("agent_team_run_parallel");

      // Assert
      expect(result.estimatedDurationMs).toBe(90_000);
      expect(result.estimatedTokens).toBe(24000);
    });

    it("estimate_最小履歴未満_デフォルト返却", () => {
      // Arrange
      const entry = createEntry("subagent_run", 1000, 100);
      estimator.recordExecution(entry);
      estimator.recordExecution(createEntry("subagent_run", 2000, 200));
      // 2件のみ

      // Act
      const result = estimator.estimate("subagent_run");

      // Assert
      expect(result.method).toBe("default");
    });

    it("estimate_最小履歴以上_履歴ベース推定", () => {
      // Arrange
      for (let i = 0; i < 5; i++) {
        estimator.recordExecution(createEntry("subagent_run", 10000, 1000));
      }

      // Act
      const result = estimator.estimate("subagent_run");

      // Assert
      expect(result.method).toBe("historical");
      expect(result.estimatedDurationMs).toBe(10000);
      expect(result.estimatedTokens).toBe(1000);
    });

    it("estimate_履歴あり_信頼度上昇", () => {
      // Arrange
      for (let i = 0; i < 50; i++) {
        estimator.recordExecution(createEntry("subagent_run", 10000, 1000));
      }

      // Act
      const result = estimator.estimate("subagent_run");

      // Assert
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.confidence).toBeLessThanOrEqual(0.9);
    });

    it("estimate_providerとmodel_引数受け入れ", () => {
      // Arrange & Act
      const result = estimator.estimate(
        "subagent_run",
        "openai",
        "gpt-4",
        "test task"
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.estimatedDurationMs).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // recordExecution テスト
  // ==========================================================================

  describe("recordExecution", () => {
    it("recordExecution_履歴追加", () => {
      // Arrange
      const entry = createEntry("subagent_run", 10000, 1000);

      // Act
      estimator.recordExecution(entry);

      // Assert
      const stats = estimator.getStats("subagent_run");
      expect(stats?.executionCount).toBe(1);
    });

    it("recordExecution_最大履歴制限", () => {
      // Arrange
      const customEstimator = createCostEstimator({ maxHistoryPerSource: 10 });

      // Act
      for (let i = 0; i < 20; i++) {
        customEstimator.recordExecution(createEntry("subagent_run", 1000 * i, 100 * i));
      }

      // Assert
      const stats = customEstimator.getStats("subagent_run");
      expect(stats?.executionCount).toBe(10); // maxHistoryPerSource
    });

    it("recordExecution_ソース別管理", () => {
      // Arrange & Act
      estimator.recordExecution(createEntry("subagent_run", 1000, 100));
      estimator.recordExecution(createEntry("agent_team_run", 2000, 200));

      // Assert
      expect(estimator.getStats("subagent_run")?.executionCount).toBe(1);
      expect(estimator.getStats("agent_team_run")?.executionCount).toBe(1);
    });

    it("recordExecution_キャッシュ無効化", () => {
      // Arrange
      estimator.recordExecution(createEntry("subagent_run", 1000, 100));
      const stats1 = estimator.getStats("subagent_run");

      // Act
      estimator.recordExecution(createEntry("subagent_run", 2000, 200));
      const stats2 = estimator.getStats("subagent_run");

      // Assert
      expect(stats2?.executionCount).toBe(stats1!.executionCount + 1);
    });
  });

  // ==========================================================================
  // getStats テスト
  // ==========================================================================

  describe("getStats", () => {
    it("getStats_履歴なし_undefined返却", () => {
      // Arrange & Act
      const result = estimator.getStats("subagent_run");

      // Assert
      expect(result).toBeUndefined();
    });

    it("getStats_統計計算_平均値", () => {
      // Arrange
      estimator.recordExecution(createEntry("subagent_run", 10000, 1000));
      estimator.recordExecution(createEntry("subagent_run", 20000, 2000));
      estimator.recordExecution(createEntry("subagent_run", 30000, 3000));

      // Act
      const result = estimator.getStats("subagent_run");

      // Assert
      expect(result?.avgDurationMs).toBe(20000);
      expect(result?.avgTokens).toBe(2000);
    });

    it("getStats_統計計算_最小最大", () => {
      // Arrange
      estimator.recordExecution(createEntry("subagent_run", 5000, 500));
      estimator.recordExecution(createEntry("subagent_run", 15000, 1500));
      estimator.recordExecution(createEntry("subagent_run", 25000, 2500));

      // Act
      const result = estimator.getStats("subagent_run");

      // Assert
      expect(result?.minDurationMs).toBe(5000);
      expect(result?.maxDurationMs).toBe(25000);
    });

    it("getStats_成功率計算", () => {
      // Arrange
      estimator.recordExecution({ ...createEntry("subagent_run", 1000, 100), success: true });
      estimator.recordExecution({ ...createEntry("subagent_run", 1000, 100), success: true });
      estimator.recordExecution({ ...createEntry("subagent_run", 1000, 100), success: false });

      // Act
      const result = estimator.getStats("subagent_run");

      // Assert
      expect(result?.successRate).toBeCloseTo(2 / 3);
    });

    it("getStats_lastUpdated_最新タイムスタンプ", () => {
      // Arrange
      const now = Date.now();
      estimator.recordExecution({
        ...createEntry("subagent_run", 1000, 100),
        timestamp: now - 1000,
      });
      estimator.recordExecution({
        ...createEntry("subagent_run", 1000, 100),
        timestamp: now,
      });

      // Act
      const result = estimator.getStats("subagent_run");

      // Assert
      expect(result?.lastUpdated).toBe(now);
    });

    it("getStats_キャッシュ_2回目は高速", () => {
      // Arrange
      for (let i = 0; i < 100; i++) {
        estimator.recordExecution(createEntry("subagent_run", 1000, 100));
      }

      // Act
      const start1 = performance.now();
      estimator.getStats("subagent_run");
      const time1 = performance.now() - start1;

      const start2 = performance.now();
      estimator.getStats("subagent_run");
      const time2 = performance.now() - start2;

      // Assert
      expect(time2).toBeLessThanOrEqual(time1 * 2); // キャッシュにより高速化または同等
    });
  });

  // ==========================================================================
  // clear テスト
  // ==========================================================================

  describe("clear", () => {
    it("clear_履歴とキャッシュクリア", () => {
      // Arrange
      estimator.recordExecution(createEntry("subagent_run", 1000, 100));
      expect(estimator.getStats("subagent_run")).toBeDefined();

      // Act
      estimator.clear();

      // Assert
      expect(estimator.getStats("subagent_run")).toBeUndefined();
    });
  });

  // ==========================================================================
  // getDefaultEstimate テスト
  // ==========================================================================

  describe("getDefaultEstimate", () => {
    it("getDefaultEstimate_静的メソッド_既知ソース", () => {
      // Arrange & Act
      const result = CostEstimator.getDefaultEstimate("subagent_run");

      // Assert
      expect(result.durationMs).toBe(30_000);
      expect(result.tokens).toBe(4000);
    });

    it("getDefaultEstimate_未知ソース_フォールバック", () => {
      // Arrange & Act
      const result = CostEstimator.getDefaultEstimate("unknown" as TaskSource);

      // Assert
      expect(result.durationMs).toBe(60_000);
      expect(result.tokens).toBe(10000);
    });
  });
});

// ============================================================================
// シングルトン関数テスト
// ============================================================================

describe("シングルトン関数", () => {
  beforeEach(() => {
    resetCostEstimator();
  });

  afterEach(() => {
    resetCostEstimator();
  });

  it("getCostEstimator_初回_新規作成", () => {
    // Arrange & Act
    const result = getCostEstimator();

    // Assert
    expect(result).toBeInstanceOf(CostEstimator);
  });

  it("getCostEstimator_2回目_同一インスタンス", () => {
    // Arrange & Act
    const result1 = getCostEstimator();
    const result2 = getCostEstimator();

    // Assert
    expect(result1).toBe(result2);
  });

  it("resetCostEstimator_リセット後_新規インスタンス", () => {
    // Arrange
    const instance1 = getCostEstimator();
    resetCostEstimator();

    // Act
    const instance2 = getCostEstimator();

    // Assert
    expect(instance1).not.toBe(instance2);
  });

  it("createCostEstimator_カスタム設定_適用", () => {
    // Arrange & Act
    const estimator = createCostEstimator({
      minHistoricalExecutions: 10,
      maxHistoryPerSource: 50,
      historicalWeight: 0.8,
    });

    // Assert
    expect(estimator).toBeInstanceOf(CostEstimator);
  });
});

// ============================================================================
// 設定テスト
// ============================================================================

describe("設定オプション", () => {
  it("minHistoricalExecutions_変更可能", () => {
    // Arrange
    const estimator = createCostEstimator({ minHistoricalExecutions: 3 });

    // Act
    for (let i = 0; i < 3; i++) {
      estimator.recordExecution(createEntry("subagent_run", 10000, 1000));
    }
    const result = estimator.estimate("subagent_run");

    // Assert
    expect(result.method).toBe("historical");
  });

  it("maxHistoryPerSource_制限適用", () => {
    // Arrange
    const estimator = createCostEstimator({ maxHistoryPerSource: 5 });

    // Act
    for (let i = 0; i < 10; i++) {
      estimator.recordExecution(createEntry("subagent_run", 1000, 100));
    }
    const stats = estimator.getStats("subagent_run");

    // Assert
    expect(stats?.executionCount).toBe(5);
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("estimate_任意のソース_非負の推定値", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...(["subagent_run", "subagent_run_parallel", "agent_team_run", "agent_team_run_parallel"] as TaskSource[])),
        (source) => {
          const estimator = createCostEstimator();
          const result = estimator.estimate(source);
          return result.estimatedDurationMs > 0 && result.estimatedTokens > 0;
        }
      )
    );
  });

  it("recordExecution_任意の値_統計計算可能", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...(["subagent_run", "agent_team_run"] as TaskSource[])),
        fc.integer({ min: 100, max: 100000 }),
        fc.integer({ min: 100, max: 50000 }),
        (source, duration, tokens) => {
          const estimator = createCostEstimator();
          estimator.recordExecution(createEntry(source, duration, tokens));
          const stats = estimator.getStats(source);
          return stats !== undefined && stats.executionCount === 1;
        }
      )
    );
  });

  it("confidence_履歴増加_範囲内", () => {
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 100 }), (count) => {
        const estimator = createCostEstimator({ minHistoricalExecutions: 5 });
        for (let i = 0; i < count; i++) {
          estimator.recordExecution(createEntry("subagent_run", 10000, 1000));
        }
        const result = estimator.estimate("subagent_run");
        return result.confidence >= 0 && result.confidence <= 1;
      })
    );
  });
});

// ============================================================================
// ヘルパー関数
// ============================================================================

function createEntry(
  source: TaskSource,
  durationMs: number,
  tokens: number
): ExecutionHistoryEntry {
  return {
    source,
    provider: "test-provider",
    model: "test-model",
    actualDurationMs: durationMs,
    actualTokens: tokens,
    success: true,
    timestamp: Date.now(),
  };
}

// ============================================================================
// 境界値テスト
// ============================================================================

describe("境界値テスト", () => {
  it("大量の履歴_メモリ管理", () => {
    // Arrange
    const estimator = createCostEstimator({ maxHistoryPerSource: 1000 });

    // Act
    for (let i = 0; i < 10000; i++) {
      estimator.recordExecution(createEntry("subagent_run", 1000, 100));
    }
    const stats = estimator.getStats("subagent_run");

    // Assert
    expect(stats?.executionCount).toBe(1000); // maxHistoryPerSourceで制限
  });

  it("極端な値_オーバーフローなし", () => {
    // Arrange
    const estimator = createCostEstimator();

    // Act
    estimator.recordExecution(createEntry("subagent_run", Number.MAX_SAFE_INTEGER / 10, 1000000));
    const stats = estimator.getStats("subagent_run");

    // Assert
    expect(Number.isFinite(stats?.avgDurationMs)).toBe(true);
  });

  it("ゼロ値_正常処理", () => {
    // Arrange
    const estimator = createCostEstimator();

    // Act
    estimator.recordExecution(createEntry("subagent_run", 0, 0));
    const stats = estimator.getStats("subagent_run");

    // Assert
    expect(stats?.avgDurationMs).toBe(0);
    expect(stats?.avgTokens).toBe(0);
    expect(stats?.minDurationMs).toBe(0);
  });

  it("失敗のみの履歴_成功率0", () => {
    // Arrange
    const estimator = createCostEstimator();

    // Act
    for (let i = 0; i < 5; i++) {
      estimator.recordExecution({
        ...createEntry("subagent_run", 1000, 100),
        success: false,
      });
    }
    const stats = estimator.getStats("subagent_run");

    // Assert
    expect(stats?.successRate).toBe(0);
  });
});
