/**
 * runtime-config.ts 単体テスト
 * カバレッジ分析: getRuntimeConfig, validateConfigConsistency, formatRuntimeConfig
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import * as fc from "fast-check";

import {
  getRuntimeConfig,
  reloadRuntimeConfig,
  getRuntimeProfile,
  isStableProfile,
  validateConfigConsistency,
  formatRuntimeConfig,
  getConfigVersion,
  type RuntimeConfig,
  type RuntimeProfile,
} from "../../../.pi/lib/runtime-config.js";

// ============================================================================
// getRuntimeConfig テスト
// ============================================================================

describe("getRuntimeConfig", () => {
  beforeEach(() => {
    reloadRuntimeConfig();
  });

  afterEach(() => {
    reloadRuntimeConfig();
  });

  it("getRuntimeConfig_基本_設定返却", () => {
    // Arrange & Act
    const result = getRuntimeConfig();

    // Assert
    expect(result).toBeDefined();
    expect(result.profile).toBeDefined();
    expect(result.totalMaxLlm).toBeGreaterThan(0);
  });

  it("getRuntimeConfig_キャッシュ_同じ参照", () => {
    // Arrange & Act
    const config1 = getRuntimeConfig();
    const config2 = getRuntimeConfig();

    // Assert
    expect(config1).toBe(config2);
  });

  it("getRuntimeConfig_必須フィールド_存在確認", () => {
    // Arrange & Act
    const result = getRuntimeConfig();

    // Assert
    expect(result).toHaveProperty("profile");
    expect(result).toHaveProperty("totalMaxLlm");
    expect(result).toHaveProperty("totalMaxRequests");
    expect(result).toHaveProperty("maxParallelSubagents");
    expect(result).toHaveProperty("maxParallelTeams");
    expect(result).toHaveProperty("maxParallelTeammates");
    expect(result).toHaveProperty("maxConcurrentOrchestrations");
    expect(result).toHaveProperty("adaptiveEnabled");
    expect(result).toHaveProperty("predictiveEnabled");
    expect(result).toHaveProperty("heartbeatIntervalMs");
    expect(result).toHaveProperty("heartbeatTimeoutMs");
  });

  it("getRuntimeConfig_数値フィールド_正の値", () => {
    // Arrange & Act
    const result = getRuntimeConfig();

    // Assert
    expect(result.totalMaxLlm).toBeGreaterThan(0);
    expect(result.totalMaxRequests).toBeGreaterThan(0);
    expect(result.maxParallelSubagents).toBeGreaterThan(0);
    expect(result.heartbeatIntervalMs).toBeGreaterThan(0);
    expect(result.heartbeatTimeoutMs).toBeGreaterThan(0);
  });

  it("getRuntimeConfig_ブールフィールド_型確認", () => {
    // Arrange & Act
    const result = getRuntimeConfig();

    // Assert
    expect(typeof result.adaptiveEnabled).toBe("boolean");
    expect(typeof result.predictiveEnabled).toBe("boolean");
  });
});

// ============================================================================
// reloadRuntimeConfig テスト
// ============================================================================

describe("reloadRuntimeConfig", () => {
  it("reloadRuntimeConfig_キャッシュクリア_新しい設定", () => {
    // Arrange
    const config1 = getRuntimeConfig();

    // Act
    const config2 = reloadRuntimeConfig();

    // Assert
    expect(config1).not.toBe(config2);
  });

  it("reloadRuntimeConfig_設定値_維持", () => {
    // Arrange
    const config1 = getRuntimeConfig();

    // Act
    const config2 = reloadRuntimeConfig();

    // Assert
    expect(config2.profile).toBe(config1.profile);
    expect(config2.totalMaxLlm).toBe(config1.totalMaxLlm);
  });
});

// ============================================================================
// getRuntimeProfile テスト
// ============================================================================

describe("getRuntimeProfile", () => {
  beforeEach(() => {
    reloadRuntimeConfig();
  });

  it("getRuntimeProfile_基本_プロファイル返却", () => {
    // Arrange & Act
    const result = getRuntimeProfile();

    // Assert
    expect(["stable", "default"]).toContain(result);
  });

  it("getRuntimeProfile_デフォルト_default", () => {
    // Arrange & Act
    const result = getRuntimeProfile();

    // Assert
    expect(result).toBe("default");
  });
});

// ============================================================================
// isStableProfile テスト
// ============================================================================

describe("isStableProfile", () => {
  beforeEach(() => {
    reloadRuntimeConfig();
  });

  it("isStableProfile_デフォルト_false", () => {
    // Arrange & Act
    const result = isStableProfile();

    // Assert
    expect(result).toBe(false);
  });

  it("isStableProfile_ブール値返却", () => {
    // Arrange & Act
    const result = isStableProfile();

    // Assert
    expect(typeof result).toBe("boolean");
  });
});

// ============================================================================
// validateConfigConsistency テスト
// ============================================================================

describe("validateConfigConsistency", () => {
  beforeEach(() => {
    reloadRuntimeConfig();
  });

  it("validateConfigConsistency_基本_結果返却", () => {
    // Arrange & Act
    const result = validateConfigConsistency();

    // Assert
    expect(result).toHaveProperty("consistent");
    expect(result).toHaveProperty("warnings");
    expect(result).toHaveProperty("details");
  });

  it("validateConfigConsistency_warnings_配列", () => {
    // Arrange & Act
    const result = validateConfigConsistency();

    // Assert
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it("validateConfigConsistency_details_設定含む", () => {
    // Arrange & Act
    const result = validateConfigConsistency();

    // Assert
    expect(result.details).toHaveProperty("profile");
    expect(result.details).toHaveProperty("totalMaxLlm");
    expect(result.details).toHaveProperty("totalMaxRequests");
  });

  it("validateConfigConsistency_consistent_ブール値", () => {
    // Arrange & Act
    const result = validateConfigConsistency();

    // Assert
    expect(typeof result.consistent).toBe("boolean");
  });
});

// ============================================================================
// formatRuntimeConfig テスト
// ============================================================================

describe("formatRuntimeConfig", () => {
  beforeEach(() => {
    reloadRuntimeConfig();
  });

  it("formatRuntimeConfig_基本_文字列返却", () => {
    // Arrange & Act
    const result = formatRuntimeConfig();

    // Assert
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("formatRuntimeConfig_プロファイル含む", () => {
    // Arrange & Act
    const result = formatRuntimeConfig();

    // Assert
    expect(result).toContain("profile:");
  });

  it("formatRuntimeConfig_設定値含む", () => {
    // Arrange & Act
    const result = formatRuntimeConfig();

    // Assert
    expect(result).toContain("totalMaxLlm:");
    expect(result).toContain("maxParallelSubagents:");
  });

  it("formatRuntimeConfig_ヘッダー含む", () => {
    // Arrange & Act
    const result = formatRuntimeConfig();

    // Assert
    expect(result).toContain("Runtime Configuration");
  });
});

// ============================================================================
// getConfigVersion テスト
// ============================================================================

describe("getConfigVersion", () => {
  it("getConfigVersion_基本_数値返却", () => {
    // Arrange & Act
    const result = getConfigVersion();

    // Assert
    expect(typeof result).toBe("number");
    expect(result).toBeGreaterThanOrEqual(0);
  });

  it("getConfigVersion_再読み込み_バージョン増加", () => {
    // Arrange
    const version1 = getConfigVersion();

    // Act
    reloadRuntimeConfig();
    const version2 = getConfigVersion();

    // Assert
    expect(version2).toBeGreaterThan(version1);
  });
});

// ============================================================================
// 環境変数テスト
// ============================================================================

describe("環境変数テスト", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // 環境変数を復元
    process.env = { ...originalEnv };
    reloadRuntimeConfig();
  });

  it("PI_RUNTIME_PROFILE_stable_安定プロファイル", () => {
    // Arrange
    process.env.PI_RUNTIME_PROFILE = "stable";

    // Act
    reloadRuntimeConfig();
    const result = getRuntimeProfile();

    // Assert
    expect(result).toBe("stable");
  });

  it("PI_LIMIT_MAX_TOTAL_LLM_値設定_反映", () => {
    // Arrange
    process.env.PI_LIMIT_MAX_TOTAL_LLM = "10";

    // Act
    reloadRuntimeConfig();
    const result = getRuntimeConfig();

    // Assert
    expect(result.totalMaxLlm).toBe(10);
  });

  it("PI_LIMIT_MAX_TOTAL_REQUESTS_値設定_反映", () => {
    // Arrange
    process.env.PI_LIMIT_MAX_TOTAL_REQUESTS = "8";

    // Act
    reloadRuntimeConfig();
    const result = getRuntimeConfig();

    // Assert
    expect(result.totalMaxRequests).toBe(8);
  });

  it("PI_LIMIT_SUBAGENT_PARALLEL_値設定_反映", () => {
    // Arrange
    process.env.PI_LIMIT_SUBAGENT_PARALLEL = "6";

    // Act
    reloadRuntimeConfig();
    const result = getRuntimeConfig();

    // Assert
    expect(result.maxParallelSubagents).toBe(6);
  });

  it("PI_LIMIT_ADAPTIVE_ENABLED_false_無効化", () => {
    // Arrange
    process.env.PI_LIMIT_ADAPTIVE_ENABLED = "false";

    // Act
    reloadRuntimeConfig();
    const result = getRuntimeConfig();

    // Assert
    expect(result.adaptiveEnabled).toBe(false);
  });

  it("無効な環境変数_無視", () => {
    // Arrange
    process.env.PI_LIMIT_MAX_TOTAL_LLM = "invalid";

    // Act
    reloadRuntimeConfig();
    const result = getRuntimeConfig();

    // Assert - デフォルト値が使用される
    expect(result.totalMaxLlm).toBeGreaterThan(0);
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("getRuntimeConfig_常に有効な設定返却", () => {
    fc.assert(
      fc.property(fc.constant(undefined), () => {
        reloadRuntimeConfig();
        const config = getRuntimeConfig();
        return (
          config.totalMaxLlm > 0 &&
          config.totalMaxRequests > 0 &&
          config.maxParallelSubagents > 0 &&
          ["stable", "default"].includes(config.profile)
        );
      })
    );
  });

  it("validateConfigConsistency_常に有効な構造", () => {
    fc.assert(
      fc.property(fc.constant(undefined), () => {
        reloadRuntimeConfig();
        const validation = validateConfigConsistency();
        return (
          typeof validation.consistent === "boolean" &&
          Array.isArray(validation.warnings) &&
          typeof validation.details === "object"
        );
      })
    );
  });
});

// ============================================================================
// 境界値テスト
// ============================================================================

describe("境界値テスト", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    reloadRuntimeConfig();
  });

  it("最小値_1_許可", () => {
    // Arrange
    process.env.PI_LIMIT_MAX_TOTAL_LLM = "1";

    // Act
    reloadRuntimeConfig();
    const result = getRuntimeConfig();

    // Assert
    expect(result.totalMaxLlm).toBe(1);
  });

  it("最大値_64_許可", () => {
    // Arrange
    process.env.PI_LIMIT_MAX_TOTAL_LLM = "64";

    // Act
    reloadRuntimeConfig();
    const result = getRuntimeConfig();

    // Assert
    expect(result.totalMaxLlm).toBe(64);
  });

  it("範囲外_65_無視", () => {
    // Arrange
    process.env.PI_LIMIT_MAX_TOTAL_LLM = "65";

    // Act
    reloadRuntimeConfig();
    const result = getRuntimeConfig();

    // Assert - 最大値を超える場合は無視される
    expect(result.totalMaxLlm).toBeLessThanOrEqual(64);
  });

  it("範囲外_0_無視", () => {
    // Arrange
    process.env.PI_LIMIT_MAX_TOTAL_LLM = "0";

    // Act
    reloadRuntimeConfig();
    const result = getRuntimeConfig();

    // Assert - 0以下は無視される
    expect(result.totalMaxLlm).toBeGreaterThan(0);
  });

  it("負の値_無視", () => {
    // Arrange
    process.env.PI_LIMIT_MAX_TOTAL_LLM = "-5";

    // Act
    reloadRuntimeConfig();
    const result = getRuntimeConfig();

    // Assert - 負の値は無視される
    expect(result.totalMaxLlm).toBeGreaterThan(0);
  });
});
