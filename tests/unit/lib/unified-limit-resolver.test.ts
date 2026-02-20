/**
 * unified-limit-resolver.ts 単体テスト
 * カバレッジ分析: resolveUnifiedLimits, setRuntimeSnapshotProvider, getAllLimitsSummary
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import * as fc from "fast-check";

// 依存モジュールのモック
vi.mock("../../../.pi/lib/adaptive-rate-controller.js", () => ({
  getEffectiveLimit: vi.fn((_, __, limit) => limit),
  getPredictiveAnalysis: vi.fn(() => ({
    historical429Count: 0,
    predicted429Probability: 0,
    recommendedConcurrency: 4,
    confidenceLevel: "medium" as const,
    dataPoints: 10,
    lastUpdated: new Date().toISOString(),
  })),
  getLearnedLimit: vi.fn(() => ({
    historical429s: [],
    successfulRequests: 100,
    last429At: null,
    learnedConcurrency: 4,
    confidence: "medium" as const,
  })),
}));

vi.mock("../../../.pi/lib/cross-instance-coordinator.js", () => ({
  getMyParallelLimit: vi.fn((_, __, limit) => limit),
  getModelParallelLimit: vi.fn((_, __, limit) => limit),
  getCoordinatorStatus: vi.fn(() => ({
    activeInstanceCount: 1,
    registered: true,
  })),
}));

vi.mock("../../../.pi/lib/provider-limits.js", () => ({
  resolveLimits: vi.fn(() => ({
    concurrency: 4,
    rpm: 100,
    tpm: 100000,
    _sources: { concurrency: "builtin" },
    _tier: "default",
  })),
  getConcurrencyLimit: vi.fn(() => 4),
  getRpmLimit: vi.fn(() => 100),
}));

vi.mock("../../../.pi/lib/runtime-config.js", () => ({
  getRuntimeConfig: vi.fn(() => ({
    profile: "balanced",
    totalMaxLlm: 10,
    totalMaxRequests: 100,
    maxParallelSubagents: 5,
    maxParallelTeams: 3,
    maxParallelTeammates: 5,
    maxConcurrentOrchestrations: 2,
    adaptiveEnabled: true,
    predictiveEnabled: true,
    maxConcurrentPerModel: 5,
    maxTotalConcurrent: 20,
  })),
  validateConfigConsistency: vi.fn(() => ({ warnings: [] })),
}));

import {
  resolveUnifiedLimits,
  setRuntimeSnapshotProvider,
  isSnapshotProviderInitialized,
  getInitializationState,
  getAllLimitsSummary,
  formatUnifiedLimitsResult,
  type UnifiedLimitInput,
  type UnifiedLimitResult,
} from "../../../.pi/lib/unified-limit-resolver.js";
import { getRuntimeConfig } from "../../../.pi/lib/runtime-config.js";
import { getCoordinatorStatus } from "../../../.pi/lib/cross-instance-coordinator.js";

// ============================================================================
// resolveUnifiedLimits テスト
// ============================================================================

describe("resolveUnifiedLimits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolveUnifiedLimits_基本_結果返却", () => {
    // Arrange
    const input: UnifiedLimitInput = {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    };

    // Act
    const result = resolveUnifiedLimits(input);

    // Assert
    expect(result).toBeDefined();
    expect(result.effectiveConcurrency).toBeGreaterThan(0);
    expect(result.effectiveRpm).toBeGreaterThan(0);
    expect(result.breakdown).toBeDefined();
    expect(result.limitingFactor).toBeDefined();
    expect(result.limitingReason).toBeDefined();
  });

  it("resolveUnifiedLimits_プロバイダ設定_メタデータ反映", () => {
    // Arrange
    const input: UnifiedLimitInput = {
      provider: "openai",
      model: "gpt-4",
    };

    // Act
    const result = resolveUnifiedLimits(input);

    // Assert
    expect(result.metadata.provider).toBe("openai");
    expect(result.metadata.model).toBe("gpt-4");
  });

  it("resolveUnifiedLimits_ティア指定_反映", () => {
    // Arrange
    const input: UnifiedLimitInput = {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      tier: "pro",
    };

    // Act
    const result = resolveUnifiedLimits(input);

    // Assert
    expect(result.metadata.tier).toBeDefined();
  });

  it("resolveUnifiedLimits_内訳_全レイヤー含む", () => {
    // Arrange
    const input: UnifiedLimitInput = {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    };

    // Act
    const result = resolveUnifiedLimits(input);

    // Assert
    expect(result.breakdown.preset).toBeDefined();
    expect(result.breakdown.adaptive).toBeDefined();
    expect(result.breakdown.crossInstance).toBeDefined();
    expect(result.breakdown.runtime).toBeDefined();
  });

  it("resolveUnifiedLimits_preset層_正しい構造", () => {
    // Arrange
    const input: UnifiedLimitInput = {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    };

    // Act
    const result = resolveUnifiedLimits(input);

    // Assert
    expect(result.breakdown.preset.concurrency).toBeDefined();
    expect(result.breakdown.preset.rpm).toBeDefined();
    expect(result.breakdown.preset.source).toBeDefined();
    expect(result.breakdown.preset.tier).toBeDefined();
  });

  it("resolveUnifiedLimits_adaptive層_正しい構造", () => {
    // Arrange
    const input: UnifiedLimitInput = {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    };

    // Act
    const result = resolveUnifiedLimits(input);

    // Assert
    expect(result.breakdown.adaptive.multiplier).toBeDefined();
    expect(result.breakdown.adaptive.learnedConcurrency).toBeDefined();
    expect(result.breakdown.adaptive.historical429s).toBeDefined();
    expect(result.breakdown.adaptive.predicted429Probability).toBeDefined();
  });

  it("resolveUnifiedLimits_crossInstance層_正しい構造", () => {
    // Arrange
    const input: UnifiedLimitInput = {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    };

    // Act
    const result = resolveUnifiedLimits(input);

    // Assert
    expect(result.breakdown.crossInstance.activeInstances).toBeDefined();
    expect(result.breakdown.crossInstance.myShare).toBeDefined();
  });

  it("resolveUnifiedLimits_runtime層_正しい構造", () => {
    // Arrange
    const input: UnifiedLimitInput = {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    };

    // Act
    const result = resolveUnifiedLimits(input);

    // Assert
    expect(result.breakdown.runtime.maxActive).toBeDefined();
    expect(result.breakdown.runtime.currentActive).toBeDefined();
    expect(result.breakdown.runtime.available).toBeDefined();
  });

  it("resolveUnifiedLimits_並列数_最低1", () => {
    // Arrange
    const input: UnifiedLimitInput = {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    };

    // Act
    const result = resolveUnifiedLimits(input);

    // Assert
    expect(result.effectiveConcurrency).toBeGreaterThanOrEqual(1);
  });

  it("resolveUnifiedLimits_RPM_正の値", () => {
    // Arrange
    const input: UnifiedLimitInput = {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    };

    // Act
    const result = resolveUnifiedLimits(input);

    // Assert
    expect(result.effectiveRpm).toBeGreaterThanOrEqual(0);
  });

  it("resolveUnifiedLimits_制約要因_有効な値", () => {
    // Arrange
    const input: UnifiedLimitInput = {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    };

    // Act
    const result = resolveUnifiedLimits(input);

    // Assert
    expect([
      "preset",
      "adaptive",
      "cross_instance",
      "runtime",
      "env_override",
    ]).toContain(result.limitingFactor);
  });
});

// ============================================================================
// setRuntimeSnapshotProvider テスト
// ============================================================================

describe("setRuntimeSnapshotProvider", () => {
  beforeEach(() => {
    // リセット
    vi.clearAllMocks();
    // モジュールの状態をリセットするために再インポートが必要な場合があるが、
    // ここではテストの基本パターンを確認
  });

  it("setRuntimeSnapshotProvider_設定_初期化状態更新", () => {
    // Arrange
    const mockProvider = () => ({
      totalActiveLlm: 0,
      totalActiveRequests: 0,
      subagentActiveCount: 0,
      teamActiveCount: 0,
    });

    // Act
    setRuntimeSnapshotProvider(mockProvider);

    // Assert
    expect(isSnapshotProviderInitialized()).toBe(true);
  });

  it("setRuntimeSnapshotProvider_初期化状態_正しい構造", () => {
    // Arrange & Act
    const state = getInitializationState();

    // Assert
    expect(state).toHaveProperty("snapshotProviderSet");
    expect(state).toHaveProperty("setAt");
    expect(state).toHaveProperty("warningsLogged");
    expect(Array.isArray(state.warningsLogged)).toBe(true);
  });
});

// ============================================================================
// isSnapshotProviderInitialized テスト
// ============================================================================

describe("isSnapshotProviderInitialized", () => {
  it("isSnapshotProviderInitialized_初期_状態確認", () => {
    // Act & Assert - グローバル状態に依存するため、trueまたはfalse
    expect(typeof isSnapshotProviderInitialized()).toBe("boolean");
  });
});

// ============================================================================
// getInitializationState テスト
// ============================================================================

describe("getInitializationState", () => {
  it("getInitializationState_基本_状態オブジェクト返却", () => {
    // Act
    const state = getInitializationState();

    // Assert
    expect(state).toBeDefined();
    expect(typeof state.snapshotProviderSet).toBe("boolean");
    expect(state.setAt).toBeDefined();
    expect(Array.isArray(state.warningsLogged)).toBe(true);
  });
});

// ============================================================================
// getAllLimitsSummary テスト
// ============================================================================

describe("getAllLimitsSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getAllLimitsSummary_基本_サマリ返却", () => {
    // Act
    const summary = getAllLimitsSummary();

    // Assert
    expect(summary).toBeDefined();
    expect(typeof summary).toBe("string");
    expect(summary).toContain("Unified Limit Resolver Summary");
  });

  it("getAllLimitsSummary_プロファイル情報_含む", () => {
    // Act
    const summary = getAllLimitsSummary();

    // Assert
    expect(summary).toContain("Profile:");
  });

  it("getAllLimitsSummary_環境設定_含む", () => {
    // Act
    const summary = getAllLimitsSummary();

    // Assert
    expect(summary).toContain("Environment Config:");
    expect(summary).toContain("totalMaxLlm:");
  });

  it("getAllLimitsSummary_クロスインスタンス状態_含む", () => {
    // Act
    const summary = getAllLimitsSummary();

    // Assert
    expect(summary).toContain("Cross-Instance Status:");
  });

  it("getAllLimitsSummary_初期化状態_含む", () => {
    // Act
    const summary = getAllLimitsSummary();

    // Assert
    expect(summary).toContain("Initialization:");
    expect(summary).toContain("snapshotProviderSet:");
  });
});

// ============================================================================
// formatUnifiedLimitsResult テスト
// ============================================================================

describe("formatUnifiedLimitsResult", () => {
  it("formatUnifiedLimitsResult_基本_フォーマット済み文字列", () => {
    // Arrange
    const result: UnifiedLimitResult = {
      effectiveConcurrency: 4,
      effectiveRpm: 100,
      breakdown: {
        preset: {
          concurrency: 4,
          rpm: 100,
          tpm: 100000,
          source: "builtin",
          tier: "default",
        },
        adaptive: {
          multiplier: 1.0,
          learnedConcurrency: 4,
          historical429s: 0,
          predicted429Probability: 0,
        },
        crossInstance: {
          activeInstances: 1,
          myShare: 4,
        },
        runtime: {
          maxActive: 10,
          currentActive: 0,
          available: 10,
        },
      },
      limitingFactor: "preset",
      limitingReason: "プリセット制限が適用",
      metadata: {
        provider: "anthropic",
        model: "claude-sonnet-4",
        tier: "default",
        resolvedAt: "2024-01-01T00:00:00Z",
      },
    };

    // Act
    const formatted = formatUnifiedLimitsResult(result);

    // Assert
    expect(formatted).toContain("anthropic/claude-sonnet-4");
    expect(formatted).toContain("concurrency=4");
    expect(formatted).toContain("rpm=100");
    expect(formatted).toContain("Breakdown:");
  });

  it("formatUnifiedLimitsResult_予測分析あり_含む", () => {
    // Arrange
    const result: UnifiedLimitResult = {
      effectiveConcurrency: 4,
      effectiveRpm: 100,
      breakdown: {
        preset: {
          concurrency: 4,
          rpm: 100,
          source: "builtin",
          tier: "default",
        },
        adaptive: {
          multiplier: 1.0,
          learnedConcurrency: 4,
          historical429s: 0,
          predicted429Probability: 0,
        },
        crossInstance: {
          activeInstances: 1,
          myShare: 4,
        },
        runtime: {
          maxActive: 10,
          currentActive: 0,
          available: 10,
        },
        prediction: {
          historical429Count: 5,
          predicted429Probability: 0.1,
          recommendedConcurrency: 3,
          confidenceLevel: "high",
          dataPoints: 100,
          lastUpdated: "2024-01-01T00:00:00Z",
        },
      },
      limitingFactor: "preset",
      limitingReason: "Test",
      metadata: {
        provider: "anthropic",
        model: "claude-sonnet-4",
        tier: "default",
        resolvedAt: "2024-01-01T00:00:00Z",
      },
    };

    // Act
    const formatted = formatUnifiedLimitsResult(result);

    // Assert
    expect(formatted).toContain("Prediction:");
    expect(formatted).toContain("429_prob=");
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("resolveUnifiedLimits_任意プロバイダ_有効な結果", () => {
    fc.assert(
      fc.property(
        fc.record({
          provider: fc.string({ minLength: 1, maxLength: 20 }),
          model: fc.string({ minLength: 1, maxLength: 30 }),
          tier: fc.option(fc.string()),
          operationType: fc.option(
            fc.constantFrom("subagent", "team", "orchestration", "direct")
          ),
          priority: fc.option(
            fc.constantFrom("critical", "high", "normal", "low", "background")
          ),
        }),
        (input) => {
          const result = resolveUnifiedLimits(input as UnifiedLimitInput);

          return (
            result.effectiveConcurrency >= 1 &&
            result.effectiveRpm >= 0 &&
            typeof result.limitingFactor === "string"
          );
        }
      )
    );
  });

  it("formatUnifiedLimitsResult_任意結果_文字列返却", () => {
    fc.assert(
      fc.property(
        fc.record({
          effectiveConcurrency: fc.integer({ min: 1, max: 100 }),
          effectiveRpm: fc.integer({ min: 0, max: 10000 }),
        }),
        (partial) => {
          const result: UnifiedLimitResult = {
            ...partial,
            effectiveConcurrency: partial.effectiveConcurrency,
            effectiveRpm: partial.effectiveRpm,
            breakdown: {
              preset: {
                concurrency: 4,
                rpm: 100,
                source: "builtin",
                tier: "default",
              },
              adaptive: {
                multiplier: 1.0,
                learnedConcurrency: 4,
                historical429s: 0,
                predicted429Probability: 0,
              },
              crossInstance: {
                activeInstances: 1,
                myShare: 4,
              },
              runtime: {
                maxActive: 10,
                currentActive: 0,
                available: 10,
              },
            },
            limitingFactor: "preset",
            limitingReason: "Test",
            metadata: {
              provider: "test",
              model: "test-model",
              tier: "default",
              resolvedAt: new Date().toISOString(),
            },
          };

          const formatted = formatUnifiedLimitsResult(result);
          return typeof formatted === "string" && formatted.length > 0;
        }
      )
    );
  });
});

// ============================================================================
// 境界値テスト
// ============================================================================

describe("境界値テスト", () => {
  it("resolveUnifiedLimits_最小並列数_1以上", () => {
    // Arrange
    const input: UnifiedLimitInput = {
      provider: "test",
      model: "test-model",
    };

    // Act
    const result = resolveUnifiedLimits(input);

    // Assert
    expect(result.effectiveConcurrency).toBeGreaterThanOrEqual(1);
  });

  it("resolveUnifiedLimits_長いモデル名_処理可能", () => {
    // Arrange
    const input: UnifiedLimitInput = {
      provider: "anthropic",
      model: "claude-" + "very-long-model-name-".repeat(10),
    };

    // Act & Assert
    expect(() => resolveUnifiedLimits(input)).not.toThrow();
  });

  it("resolveUnifiedLimits_特殊文字プロバイダ_処理可能", () => {
    // Arrange
    const input: UnifiedLimitInput = {
      provider: "test-provider_v2",
      model: "model-name",
    };

    // Act & Assert
    expect(() => resolveUnifiedLimits(input)).not.toThrow();
  });

  it("getAllLimitsSummary_設定警告なし_正常出力", () => {
    // Act
    const summary = getAllLimitsSummary();

    // Assert - 警告がある場合のみ表示される
    expect(summary).toContain("Unified Limit Resolver Summary");
  });
});

// ============================================================================
// エッジケース
// ============================================================================

describe("エッジケース", () => {
  it("resolveUnifiedLimits_複数呼び出し_一貫性", () => {
    // Arrange
    const input: UnifiedLimitInput = {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    };

    // Act
    const result1 = resolveUnifiedLimits(input);
    const result2 = resolveUnifiedLimits(input);

    // Assert - 設定が変わらない限り一貫した結果
    expect(result1.effectiveConcurrency).toBe(result2.effectiveConcurrency);
    expect(result1.effectiveRpm).toBe(result2.effectiveRpm);
  });

  it("resolveUnifiedLimits_異なるモデル_異なる結果可能性", () => {
    // Arrange
    const input1: UnifiedLimitInput = {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    };
    const input2: UnifiedLimitInput = {
      provider: "openai",
      model: "gpt-4",
    };

    // Act
    const result1 = resolveUnifiedLimits(input1);
    const result2 = resolveUnifiedLimits(input2);

    // Assert - メタデータが異なる
    expect(result1.metadata.model).not.toBe(result2.metadata.model);
  });

  it("resolveUnifiedLimits_TPM_オプション", () => {
    // Arrange
    const input: UnifiedLimitInput = {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    };

    // Act
    const result = resolveUnifiedLimits(input);

    // Assert - TPMはオプション
    expect(result.effectiveTpm).toBeDefined();
  });
});
