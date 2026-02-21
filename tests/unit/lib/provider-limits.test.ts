/**
 * provider-limits.ts 単体テスト
 * カバレッジ分析: resolveLimits, getConcurrencyLimit, getRpmLimit, listProviders, listModels
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
  getLimitsConfig,
  reloadLimits,
  resolveLimits,
  getConcurrencyLimit,
  getRpmLimit,
  listProviders,
  listModels,
  getBuiltinLimits,
  detectTier,
  formatLimitsSummary,
  type ResolvedModelLimits,
} from "../../../.pi/lib/provider-limits.js";

// ============================================================================
// getLimitsConfig テスト
// ============================================================================

describe("getLimitsConfig", () => {
  beforeEach(() => {
    reloadLimits();
  });

  it("getLimitsConfig_基本_設定返却", () => {
    // Arrange & Act
    const result = getLimitsConfig();

    // Assert
    expect(result).toBeDefined();
    expect(result.version).toBeGreaterThan(0);
    expect(result.providers).toBeDefined();
  });

  it("getLimitsConfig_キャッシュ_同じ参照", () => {
    // Arrange & Act
    const config1 = getLimitsConfig();
    const config2 = getLimitsConfig();

    // Assert
    expect(config1).toBe(config2);
  });

  it("getLimitsConfig_必須プロバイダ含む", () => {
    // Arrange & Act
    const result = getLimitsConfig();

    // Assert
    expect(result.providers).toHaveProperty("anthropic");
    expect(result.providers).toHaveProperty("openai");
    expect(result.providers).toHaveProperty("google");
  });
});

// ============================================================================
// reloadLimits テスト
// ============================================================================

describe("reloadLimits", () => {
  it("reloadLimits_キャッシュクリア", () => {
    // Arrange
    const config1 = getLimitsConfig();

    // Act
    reloadLimits();
    const config2 = getLimitsConfig();

    // Assert - 新しいオブジェクトが返される（ただし内容は同じ可能性）
    expect(config2).toBeDefined();
  });
});

// ============================================================================
// resolveLimits テスト
// ============================================================================

describe("resolveLimits", () => {
  beforeEach(() => {
    reloadLimits();
  });

  it("resolveLimits_GPT4_制限返却", () => {
    // Arrange & Act
    const result = resolveLimits("openai", "gpt-4");

    // Assert
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-4");
    expect(result.rpm).toBeGreaterThan(0);
    expect(result.concurrency).toBeGreaterThan(0);
  });

  it("resolveLimits_Claude3_5Sonnet_制限返却", () => {
    // Arrange & Act
    const result = resolveLimits("anthropic", "claude-3-5-sonnet-20241022");

    // Assert
    expect(result.provider).toBe("anthropic");
    expect(result.rpm).toBeGreaterThan(0);
    expect(result.concurrency).toBeGreaterThan(0);
  });

  it("resolveLimits_Gemini_制限返却", () => {
    // Arrange & Act
    const result = resolveLimits("google", "gemini-1.5-pro");

    // Assert
    expect(result.provider).toBe("google");
    expect(result.rpm).toBeGreaterThan(0);
  });

  it("resolveLimits_未知のプロバイダ_デフォルト制限", () => {
    // Arrange & Act
    const result = resolveLimits("unknown-provider", "unknown-model");

    // Assert
    expect(result.provider).toBe("unknown-provider");
    expect(result.source).toBe("default");
    expect(result.rpm).toBeGreaterThan(0);
  });

  it("resolveLimits_未知のモデル_デフォルト制限", () => {
    // Arrange & Act
    const result = resolveLimits("openai", "unknown-model");

    // Assert
    expect(result.model).toBe("unknown-model");
    expect(result.rpm).toBeGreaterThan(0);
  });

  it("resolveLimits_ティア指定_プロティア", () => {
    // Arrange & Act
    const result = resolveLimits("anthropic", "claude-3-5-sonnet", "pro");

    // Assert
    expect(result.tier).toBe("pro");
    expect(result.rpm).toBe(1000); // Pro tier
  });

  it("resolveLimits_ティア指定_マックスティア", () => {
    // Arrange & Act
    const result = resolveLimits("anthropic", "claude-3-5-sonnet", "max");

    // Assert
    expect(result.tier).toBe("max");
    expect(result.rpm).toBe(4000); // Max tier
  });

  it("resolveLimits_大文字小文字_小文字正規化", () => {
    // Arrange & Act
    const result = resolveLimits("OPENAI", "GPT-4O");

    // Assert
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-4o");
  });

  it("resolveLimits_パターンマッチ_gpt4turbo一致", () => {
    // Arrange & Act - gpt-4-turboは完全一致
    const result = resolveLimits("openai", "gpt-4-turbo");

    // Assert
    expect(result.source).not.toBe("default");
    expect(result.rpm).toBeGreaterThan(0);
  });
});

// ============================================================================
// getConcurrencyLimit テスト
// ============================================================================

describe("getConcurrencyLimit", () => {
  beforeEach(() => {
    reloadLimits();
  });

  it("getConcurrencyLimit_基本_正の整数", () => {
    // Arrange & Act
    const result = getConcurrencyLimit("openai", "gpt-4");

    // Assert
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBeGreaterThan(0);
  });

  it("getConcurrencyLimit_ティア指定_反映", () => {
    // Arrange & Act
    const proLimit = getConcurrencyLimit("anthropic", "claude-3-5-sonnet", "pro");
    const maxLimit = getConcurrencyLimit("anthropic", "claude-3-5-sonnet", "max");

    // Assert
    expect(proLimit).toBeGreaterThan(0);
    expect(maxLimit).toBeGreaterThan(0);
  });

  it("getConcurrencyLimit_未知のプロバイダ_デフォルト", () => {
    // Arrange & Act
    const result = getConcurrencyLimit("unknown", "model");

    // Assert
    expect(result).toBeGreaterThan(0);
  });
});

// ============================================================================
// getRpmLimit テスト
// ============================================================================

describe("getRpmLimit", () => {
  beforeEach(() => {
    reloadLimits();
  });

  it("getRpmLimit_基本_正の整数", () => {
    // Arrange & Act
    const result = getRpmLimit("openai", "gpt-4");

    // Assert
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBeGreaterThan(0);
  });

  it("getRpmLimit_ティア指定_反映", () => {
    // Arrange & Act
    const proRpm = getRpmLimit("anthropic", "claude-3-5-sonnet", "pro");
    const maxRpm = getRpmLimit("anthropic", "claude-3-5-sonnet", "max");

    // Assert
    expect(proRpm).toBe(1000);
    expect(maxRpm).toBe(4000);
  });

  it("getRpmLimit_未知のプロバイダ_デフォルト", () => {
    // Arrange & Act
    const result = getRpmLimit("unknown", "model");

    // Assert
    expect(result).toBe(30); // DEFAULT_LIMITS.rpm
  });
});

// ============================================================================
// listProviders テスト
// ============================================================================

describe("listProviders", () => {
  beforeEach(() => {
    reloadLimits();
  });

  it("listProviders_基本_配列返却", () => {
    // Arrange & Act
    const result = listProviders();

    // Assert
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("listProviders_主要プロバイダ含む", () => {
    // Arrange & Act
    const result = listProviders();

    // Assert
    expect(result).toContain("anthropic");
    expect(result).toContain("openai");
    expect(result).toContain("google");
  });

  it("listProviders_小文字プロバイダ名", () => {
    // Arrange & Act
    const result = listProviders();

    // Assert
    for (const provider of result) {
      expect(provider).toBe(provider.toLowerCase());
    }
  });
});

// ============================================================================
// listModels テスト
// ============================================================================

describe("listModels", () => {
  beforeEach(() => {
    reloadLimits();
  });

  it("listModels_OpenAI_モデルリスト返却", () => {
    // Arrange & Act
    const result = listModels("openai");

    // Assert
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("listModels_Anthropic_モデルリスト返却", () => {
    // Arrange & Act
    const result = listModels("anthropic");

    // Assert
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(m => m.includes("claude"))).toBe(true);
  });

  it("listModels_未知のプロバイダ_空配列", () => {
    // Arrange & Act
    const result = listModels("unknown-provider");

    // Assert
    expect(result).toEqual([]);
  });

  it("listModels_大文字小文字_小文字正規化", () => {
    // Arrange & Act
    const result = listModels("OPENAI");

    // Assert
    expect(result.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// getBuiltinLimits テスト
// ============================================================================

describe("getBuiltinLimits", () => {
  it("getBuiltinLimits_基本_設定返却", () => {
    // Arrange & Act
    const result = getBuiltinLimits();

    // Assert
    expect(result).toBeDefined();
    expect(result.source).toBe("builtin");
  });

  it("getBuiltinLimits_独立コピー_元に影響なし", () => {
    // Arrange
    const limits1 = getBuiltinLimits();
    const limits2 = getBuiltinLimits();

    // Act
    limits1.version = 999;

    // Assert
    expect(limits2.version).not.toBe(999);
  });
});

// ============================================================================
// detectTier テスト
// ============================================================================

describe("detectTier", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("detectTier_環境変数なし_undefined", () => {
    // Arrange
    delete process.env.PI_PROVIDER_TIER;
    delete process.env.PI_OPENAI_TIER;

    // Act
    const result = detectTier("openai", "gpt-4");

    // Assert
    expect(result).toBeUndefined();
  });

  it("detectTier_環境変数PI_PROVIDER_TIER_使用", () => {
    // Arrange
    process.env.PI_PROVIDER_TIER = "pro";

    // Act
    const result = detectTier("openai", "gpt-4");

    // Assert
    expect(result).toBe("pro");
  });

  it("detectTier_プロバイダ固有環境変数_使用", () => {
    // Arrange
    delete process.env.PI_PROVIDER_TIER;
    process.env.PI_OPENAI_TIER = "api_tier2";

    // Act
    const result = detectTier("openai", "gpt-4");

    // Assert
    expect(result).toBe("api_tier2");
  });

  it("detectTier_プロバイダ固有環境変数_Anthropic", () => {
    // Arrange
    process.env.PI_ANTHROPIC_TIER = "max";

    // Act
    const result = detectTier("anthropic", "claude-3-5-sonnet");

    // Assert
    expect(result).toBe("max");
  });
});

// ============================================================================
// formatLimitsSummary テスト
// ============================================================================

describe("formatLimitsSummary", () => {
  it("formatLimitsSummary_基本_文字列返却", () => {
    // Arrange
    const limits: ResolvedModelLimits = {
      provider: "openai",
      model: "gpt-4",
      tier: "default",
      rpm: 80,
      tpm: 40000,
      concurrency: 2,
      source: "preset",
    };

    // Act
    const result = formatLimitsSummary(limits);

    // Assert
    expect(typeof result).toBe("string");
    expect(result).toContain("openai");
    expect(result).toContain("gpt-4");
    expect(result).toContain("rpm: 80");
  });

  it("formatLimitsSummary_TPM含む_TPM表示", () => {
    // Arrange
    const limits: ResolvedModelLimits = {
      provider: "openai",
      model: "gpt-4",
      tier: "default",
      rpm: 80,
      tpm: 40000,
      concurrency: 2,
      source: "preset",
    };

    // Act
    const result = formatLimitsSummary(limits);

    // Assert
    expect(result).toContain("tpm:");
  });

  it("formatLimitsSummary_TPMなし_TPM省略", () => {
    // Arrange
    const limits: ResolvedModelLimits = {
      provider: "unknown",
      model: "model",
      tier: "default",
      rpm: 30,
      tpm: undefined,
      concurrency: 2,
      source: "default",
    };

    // Act
    const result = formatLimitsSummary(limits);

    // Assert
    expect(result).not.toContain("tpm:");
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("resolveLimits_任意の入力_有効な結果", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 50 }).filter(s => s !== "__proto__"),
        fc.string({ maxLength: 50 }),
        fc.option(fc.string({ maxLength: 20 }), { nil: undefined }),
        (provider, model, tier) => {
          const result = resolveLimits(provider, model, tier);
          return (
            result.rpm > 0 &&
            result.concurrency > 0 &&
            typeof result.provider === "string" &&
            typeof result.model === "string"
          );
        }
      )
    );
  });

  it("getConcurrencyLimit_任意の入力_正の整数", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 50 }),
        fc.string({ maxLength: 50 }),
        (provider, model) => {
          const result = getConcurrencyLimit(provider, model);
          return Number.isInteger(result) && result > 0;
        }
      )
    );
  });

  it("getRpmLimit_任意の入力_正の整数", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 50 }),
        fc.string({ maxLength: 50 }),
        (provider, model) => {
          const result = getRpmLimit(provider, model);
          return Number.isInteger(result) && result > 0;
        }
      )
    );
  });
});

// ============================================================================
// 境界値テスト
// ============================================================================

describe("境界値テスト", () => {
  beforeEach(() => {
    reloadLimits();
  });

  it("resolveLimits_空文字プロバイダ_処理可能", () => {
    // Arrange & Act
    const result = resolveLimits("", "model");

    // Assert
    expect(result.provider).toBe("");
    expect(result.rpm).toBeGreaterThan(0);
  });

  it("resolveLimits_空文字モデル_処理可能", () => {
    // Arrange & Act
    const result = resolveLimits("openai", "");

    // Assert
    expect(result.model).toBe("");
    expect(result.rpm).toBeGreaterThan(0);
  });

  it("resolveLimits_非常に長いモデル名_処理可能", () => {
    // Arrange
    const longModel = "a".repeat(1000);

    // Act & Assert
    expect(() => resolveLimits("openai", longModel)).not.toThrow();
  });

  it("listModels_大文字プロバイダ_小文字正規化", () => {
    // Arrange & Act
    const result = listModels("OPENAI");

    // Assert
    expect(result.length).toBeGreaterThan(0);
  });
});
