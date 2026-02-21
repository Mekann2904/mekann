/**
 * dynamic-parallelism.ts 単体テスト
 * カバレッジ分析: DynamicParallelismAdjuster, getParallelism, adjustForError,
 * attemptRecovery, recordSuccess, requestStarted, requestCompleted
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
import {
  DynamicParallelismAdjuster,
  getParallelismAdjuster,
  createParallelismAdjuster,
  resetParallelismAdjuster,
  getParallelism,
  adjustForError,
  attemptRecovery,
  formatDynamicParallelismSummary,
  type DynamicAdjusterConfig,
} from "../../../.pi/lib/dynamic-parallelism.js";

// ============================================================================
// DynamicParallelismAdjuster クラステスト
// ============================================================================

describe("DynamicParallelismAdjuster", () => {
  let adjuster: DynamicParallelismAdjuster;

  beforeEach(() => {
    adjuster = createParallelismAdjuster({});
  });

  afterEach(() => {
    adjuster.shutdown();
  });

  // ==========================================================================
  // getParallelism テスト
  // ==========================================================================

  describe("getParallelism", () => {
    it("getParallelism_初期状態_基本並列度返却", () => {
      // Arrange & Act
      const result = adjuster.getParallelism("openai", "gpt-4");

      // Assert
      expect(result).toBe(4); // デフォルトのbaseParallelism
    });

    it("getParallelism_クロスインスタンス適用", () => {
      // Arrange
      adjuster.applyCrossInstanceLimits("openai", "gpt-4", 2);

      // Act
      const result = adjuster.getParallelism("openai", "gpt-4");

      // Assert
      expect(result).toBe(2); // 4 / 2 = 2
    });

    it("getParallelism_大文字小文字区別なし", () => {
      // Arrange & Act
      const result1 = adjuster.getParallelism("OpenAI", "GPT-4");
      const result2 = adjuster.getParallelism("openai", "gpt-4");

      // Assert
      expect(result1).toBe(result2);
    });
  });

  // ==========================================================================
  // getConfig テスト
  // ==========================================================================

  describe("getConfig", () => {
    it("getConfig_初期状態_基本設定返却", () => {
      // Arrange & Act
      const result = adjuster.getConfig("openai", "gpt-4");

      // Assert
      expect(result.baseParallelism).toBe(4);
      expect(result.currentParallelism).toBe(4);
      expect(result.minParallelism).toBe(1);
      expect(result.maxParallelism).toBe(16);
    });

    it("getConfig_エラー後_現在値変化", () => {
      // Arrange
      adjuster.adjustForError("openai", "gpt-4", "429");

      // Act
      const result = adjuster.getConfig("openai", "gpt-4");

      // Assert
      expect(result.currentParallelism).toBeLessThan(result.baseParallelism);
      expect(result.adjustmentReason).toContain("429");
    });
  });

  // ==========================================================================
  // adjustForError テスト
  // ==========================================================================

  describe("adjustForError", () => {
    it("adjustForError_429エラー_30%削減", () => {
      // Arrange
      const initial = adjuster.getParallelism("openai", "gpt-4");

      // Act
      adjuster.adjustForError("openai", "gpt-4", "429");
      const result = adjuster.getParallelism("openai", "gpt-4");

      // Assert
      expect(result).toBe(Math.floor(initial * 0.7)); // 30%削減
    });

    it("adjustForError_タイムアウト_10%削減", () => {
      // Arrange
      const initial = adjuster.getParallelism("openai", "gpt-4");

      // Act
      adjuster.adjustForError("openai", "gpt-4", "timeout");
      const result = adjuster.getParallelism("openai", "gpt-4");

      // Assert
      expect(result).toBe(Math.floor(initial * 0.9)); // 10%削減
    });

    it("adjustForError_一般エラー_5%削減", () => {
      // Arrange
      const initial = adjuster.getParallelism("openai", "gpt-4");

      // Act
      adjuster.adjustForError("openai", "gpt-4", "error");
      const result = adjuster.getParallelism("openai", "gpt-4");

      // Assert
      expect(result).toBe(Math.floor(initial * 0.95)); // 5%削減
    });

    it("adjustForError_最小値下限_1以上", () => {
      // Arrange
      for (let i = 0; i < 10; i++) {
        adjuster.adjustForError("openai", "gpt-4", "429");
      }

      // Act
      const result = adjuster.getParallelism("openai", "gpt-4");

      // Assert
      expect(result).toBeGreaterThanOrEqual(1);
    });

    it("adjustForError_イベント発行", () => {
      // Arrange
      const callback = vi.fn();
      adjuster.onParallelismChange(callback);

      // Act
      adjuster.adjustForError("openai", "gpt-4", "429");

      // Assert
      expect(callback).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // attemptRecovery テスト
  // ==========================================================================

  describe("attemptRecovery", () => {
    it("attemptRecovery_エラー直後_回復なし", () => {
      // Arrange
      adjuster.adjustForError("openai", "gpt-4", "429");
      const afterError = adjuster.getParallelism("openai", "gpt-4");

      // Act - 直後に回復試行
      adjuster.attemptRecovery("openai", "gpt-4");

      // Assert
      expect(adjuster.getParallelism("openai", "gpt-4")).toBe(afterError);
    });

    it("attemptRecovery_エラー履歴あり_回復なし", () => {
      // Arrange
      adjuster.adjustForError("openai", "gpt-4", "429");
      vi.useFakeTimers();
      vi.advanceTimersByTime(120000); // 2分経過

      // Act
      adjuster.attemptRecovery("openai", "gpt-4");

      // Assert - エラー履歴があるので回復しない
      expect(adjuster.getConfig("openai", "gpt-4").currentParallelism).toBeLessThan(4);

      vi.useRealTimers();
    });
  });

  // ==========================================================================
  // applyCrossInstanceLimits テスト
  // ==========================================================================

  describe("applyCrossInstanceLimits", () => {
    it("applyCrossInstanceLimits_1インスタンス_1倍", () => {
      // Arrange & Act
      adjuster.applyCrossInstanceLimits("openai", "gpt-4", 1);

      // Assert
      expect(adjuster.getParallelism("openai", "gpt-4")).toBe(4);
    });

    it("applyCrossInstanceLimits_2インスタンス_0.5倍", () => {
      // Arrange & Act
      adjuster.applyCrossInstanceLimits("openai", "gpt-4", 2);

      // Assert
      expect(adjuster.getParallelism("openai", "gpt-4")).toBe(2);
    });

    it("applyCrossInstanceLimits_4インスタンス_0.25倍", () => {
      // Arrange & Act
      adjuster.applyCrossInstanceLimits("openai", "gpt-4", 4);

      // Assert
      expect(adjuster.getParallelism("openai", "gpt-4")).toBe(1);
    });

    it("applyCrossInstanceLimits_0インスタンス_1倍", () => {
      // Arrange & Act
      adjuster.applyCrossInstanceLimits("openai", "gpt-4", 0);

      // Assert
      expect(adjuster.getParallelism("openai", "gpt-4")).toBe(4);
    });
  });

  // ==========================================================================
  // getHealth テスト
  // ==========================================================================

  describe("getHealth", () => {
    it("getHealth_初期状態_正常", () => {
      // Arrange & Act
      const result = adjuster.getHealth("openai", "gpt-4");

      // Assert
      expect(result.healthy).toBe(true);
      expect(result.activeRequests).toBe(0);
      expect(result.recent429Count).toBe(0);
    });

    it("getHealth_429エラー後_非正常", () => {
      // Arrange
      adjuster.adjustForError("openai", "gpt-4", "429");

      // Act
      const result = adjuster.getHealth("openai", "gpt-4");

      // Assert
      expect(result.recent429Count).toBe(1);
    });

    it("getHealth_バックオフ推奨_計算", () => {
      // Arrange
      adjuster.adjustForError("openai", "gpt-4", "429");

      // Act
      const result = adjuster.getHealth("openai", "gpt-4");

      // Assert
      expect(result.recommendedBackoffMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // recordSuccess テスト
  // ==========================================================================

  describe("recordSuccess", () => {
    it("recordSuccess_レスポンス時間記録", () => {
      // Arrange & Act
      adjuster.recordSuccess("openai", "gpt-4", 1500);

      // Assert
      const health = adjuster.getHealth("openai", "gpt-4");
      expect(health.avgResponseMs).toBe(1500);
    });

    it("recordSuccess_平均計算", () => {
      // Arrange & Act
      adjuster.recordSuccess("openai", "gpt-4", 1000);
      adjuster.recordSuccess("openai", "gpt-4", 2000);

      // Assert
      const health = adjuster.getHealth("openai", "gpt-4");
      expect(health.avgResponseMs).toBe(1500);
    });
  });

  // ==========================================================================
  // requestStarted / requestCompleted テスト
  // ==========================================================================

  describe("requestStarted / requestCompleted", () => {
    it("requestStarted_アクティブリクエスト増加", () => {
      // Arrange & Act
      adjuster.requestStarted("openai", "gpt-4");

      // Assert
      const health = adjuster.getHealth("openai", "gpt-4");
      expect(health.activeRequests).toBe(1);
    });

    it("requestCompleted_アクティブリクエスト減少", () => {
      // Arrange
      adjuster.requestStarted("openai", "gpt-4");
      adjuster.requestStarted("openai", "gpt-4");

      // Act
      adjuster.requestCompleted("openai", "gpt-4");

      // Assert
      const health = adjuster.getHealth("openai", "gpt-4");
      expect(health.activeRequests).toBe(1);
    });

    it("requestCompleted_0以下にならない", () => {
      // Arrange
      adjuster.requestStarted("openai", "gpt-4");
      adjuster.requestCompleted("openai", "gpt-4");
      adjuster.requestCompleted("openai", "gpt-4"); // 追加

      // Assert
      const health = adjuster.getHealth("openai", "gpt-4");
      expect(health.activeRequests).toBe(0);
    });
  });

  // ==========================================================================
  // reset テスト
  // ==========================================================================

  describe("reset", () => {
    it("reset_状態リセット", () => {
      // Arrange
      adjuster.adjustForError("openai", "gpt-4", "429");
      expect(adjuster.getParallelism("openai", "gpt-4")).toBeLessThan(4);

      // Act
      adjuster.reset("openai", "gpt-4");

      // Assert
      expect(adjuster.getParallelism("openai", "gpt-4")).toBe(4);
    });
  });

  // ==========================================================================
  // resetAll テスト
  // ==========================================================================

  describe("resetAll", () => {
    it("resetAll_全状態リセット", () => {
      // Arrange
      adjuster.adjustForError("openai", "gpt-4", "429");
      adjuster.adjustForError("anthropic", "claude", "timeout");

      // Act
      adjuster.resetAll();

      // Assert
      expect(adjuster.getParallelism("openai", "gpt-4")).toBe(4);
      expect(adjuster.getParallelism("anthropic", "claude")).toBe(4);
    });
  });

  // ==========================================================================
  // getAllStates テスト
  // ==========================================================================

  describe("getAllStates", () => {
    it("getAllStates_空状態_空マップ", () => {
      // Arrange & Act
      const result = adjuster.getAllStates();

      // Assert
      expect(result.size).toBe(0);
    });

    it("getAllStates_複数プロバイダ_全状態返却", () => {
      // Arrange
      adjuster.getParallelism("openai", "gpt-4");
      adjuster.getParallelism("anthropic", "claude");

      // Act
      const result = adjuster.getAllStates();

      // Assert
      expect(result.size).toBe(2);
      expect(result.has("openai:gpt-4")).toBe(true);
      expect(result.has("anthropic:claude")).toBe(true);
    });
  });

  // ==========================================================================
  // onParallelismChange テスト
  // ==========================================================================

  describe("onParallelismChange", () => {
    it("onParallelismChange_イベント購読", () => {
      // Arrange
      const callback = vi.fn();
      adjuster.onParallelismChange(callback);

      // Act
      adjuster.adjustForError("openai", "gpt-4", "429");

      // Assert
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          key: "openai:gpt-4",
          reason: expect.stringContaining("429"),
        })
      );
    });

    it("onParallelismChange_購読解除", () => {
      // Arrange
      const callback = vi.fn();
      const unsubscribe = adjuster.onParallelismChange(callback);
      unsubscribe();

      // Act
      adjuster.adjustForError("openai", "gpt-4", "429");

      // Assert
      expect(callback).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // shutdown テスト
  // ==========================================================================

  describe("shutdown", () => {
    it("shutdown_タイマー停止", () => {
      // Arrange & Act
      adjuster.shutdown();

      // Assert - エラーにならない
      expect(() => adjuster.shutdown()).not.toThrow();
    });
  });
});

// ============================================================================
// シングルトン関数テスト
// ============================================================================

describe("シングルトン関数", () => {
  beforeEach(() => {
    resetParallelismAdjuster();
  });

  afterEach(() => {
    resetParallelismAdjuster();
  });

  it("getParallelismAdjuster_初回_新規作成", () => {
    // Arrange & Act
    const result = getParallelismAdjuster();

    // Assert
    expect(result).toBeInstanceOf(DynamicParallelismAdjuster);
  });

  it("getParallelismAdjuster_2回目_同一インスタンス", () => {
    // Arrange & Act
    const result1 = getParallelismAdjuster();
    const result2 = getParallelismAdjuster();

    // Assert
    expect(result1).toBe(result2);
  });

  it("resetParallelismAdjuster_リセット後_新規インスタンス", () => {
    // Arrange
    const instance1 = getParallelismAdjuster();
    resetParallelismAdjuster();

    // Act
    const instance2 = getParallelismAdjuster();

    // Assert
    expect(instance1).not.toBe(instance2);
  });
});

// ============================================================================
// ヘルパー関数テスト
// ============================================================================

describe("ヘルパー関数", () => {
  beforeEach(() => {
    resetParallelismAdjuster();
  });

  afterEach(() => {
    resetParallelismAdjuster();
  });

  it("getParallelism_ヘルパー_並列度返却", () => {
    // Arrange & Act
    const result = getParallelism("openai", "gpt-4");

    // Assert
    expect(result).toBe(4);
  });

  it("adjustForError_ヘルパー_エラー調整", () => {
    // Arrange & Act
    adjustForError("openai", "gpt-4", "429");
    const result = getParallelism("openai", "gpt-4");

    // Assert
    expect(result).toBeLessThan(4);
  });

  it("attemptRecovery_ヘルパー_回復試行", () => {
    // Arrange
    adjustForError("openai", "gpt-4", "429");

    // Act - エラーなし
    attemptRecovery("openai", "gpt-4");

    // Assert
    expect(getParallelism("openai", "gpt-4")).toBeDefined();
  });
});

// ============================================================================
// formatDynamicParallelismSummary テスト
// ============================================================================

describe("formatDynamicParallelismSummary", () => {
  beforeEach(() => {
    resetParallelismAdjuster();
  });

  afterEach(() => {
    resetParallelismAdjuster();
  });

  it("formatDynamicParallelismSummary_空状態_基本出力", () => {
    // Arrange & Act
    const result = formatDynamicParallelismSummary();

    // Assert
    expect(result).toContain("Dynamic Parallelism");
    expect(result).toContain("no active states");
  });

  it("formatDynamicParallelismSummary_状態あり_詳細出力", () => {
    // Arrange
    getParallelism("openai", "gpt-4");

    // Act
    const result = formatDynamicParallelismSummary();

    // Assert
    expect(result).toContain("openai:gpt-4");
    expect(result).toContain("parallelism");
    expect(result).toContain("health");
  });
});

// ============================================================================
// カスタム設定テスト
// ============================================================================

describe("カスタム設定", () => {
  it("カスタム設定_適用", () => {
    // Arrange
    const config: Partial<DynamicAdjusterConfig> = {
      baseParallelism: 8,
      minParallelism: 2,
      maxParallelism: 32,
      reductionOn429: 0.5,
    };
    const adjuster = createParallelismAdjuster(config);

    // Act
    const parallelism = adjuster.getParallelism("openai", "gpt-4");

    // Assert
    expect(parallelism).toBe(8);

    adjuster.shutdown();
  });

  it("reductionOnTimeout_カスタム値_適用", () => {
    // Arrange
    const adjuster = createParallelismAdjuster({
      reductionOnTimeout: 0.2,
    });

    // Act
    adjuster.adjustForError("openai", "gpt-4", "timeout");
    const result = adjuster.getParallelism("openai", "gpt-4");

    // Assert
    expect(result).toBe(Math.floor(4 * 0.8)); // 20%削減

    adjuster.shutdown();
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("getParallelism_常にmin以上max以下", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        (provider, model) => {
          const adjuster = createParallelismAdjuster({
            minParallelism: 1,
            maxParallelism: 16,
          });
          const result = adjuster.getParallelism(provider, model);
          adjuster.shutdown();
          return result >= 1 && result <= 16;
        }
      )
    );
  });

  it("adjustForError_429後_並列度低下", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), (count) => {
        const adjuster = createParallelismAdjuster({});
        for (let i = 0; i < count; i++) {
          adjuster.adjustForError("test", "model", "429");
        }
        const result = adjuster.getParallelism("test", "model");
        adjuster.shutdown();
        return result <= 4; // 初期値以下
      })
    );
  });
});

// ============================================================================
// 境界値テスト
// ============================================================================

describe("境界値テスト", () => {
  let adjuster: DynamicParallelismAdjuster;

  beforeEach(() => {
    adjuster = createParallelismAdjuster({});
  });

  afterEach(() => {
    adjuster.shutdown();
  });

  it("最大削減_最小値維持", () => {
    // Arrange & Act
    for (let i = 0; i < 100; i++) {
      adjuster.adjustForError("openai", "gpt-4", "429");
    }
    const result = adjuster.getParallelism("openai", "gpt-4");

    // Assert
    expect(result).toBeGreaterThanOrEqual(1);
  });

  it("大量のリクエスト追跡", () => {
    // Arrange & Act
    for (let i = 0; i < 1000; i++) {
      adjuster.requestStarted("openai", "gpt-4");
    }
    const health = adjuster.getHealth("openai", "gpt-4");

    // Assert
    expect(health.activeRequests).toBe(1000);
  });

  it("大量の成功記録_サンプル制限", () => {
    // Arrange & Act
    for (let i = 0; i < 1000; i++) {
      adjuster.recordSuccess("openai", "gpt-4", i);
    }
    const health = adjuster.getHealth("openai", "gpt-4");

    // Assert - maxResponseSamplesで制限される
    expect(health.avgResponseMs).toBeGreaterThan(0);
  });

  it("複数プロバイダ_独立管理", () => {
    // Arrange
    const providers = ["openai", "anthropic", "google", "meta"];

    // Act
    providers.forEach((p) => {
      adjuster.adjustForError(p, "model", "429");
    });

    // Assert
    providers.forEach((p) => {
      expect(adjuster.getParallelism(p, "model")).toBeLessThan(4);
    });
  });
});
