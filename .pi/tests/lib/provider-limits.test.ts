/**
 * @file .pi/lib/provider-limits.ts の単体テスト
 * @description プロバイダーのレート制限と同時実行制限のテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// モジュールをインポート
import {
	resolveLimits,
	getConcurrencyLimit,
	getRpmLimit,
	listProviders,
	listModels,
	getLimitsConfig,
	reloadLimits,
	getBuiltinLimits,
	formatLimitsSummary,
	detectTier,
	type ResolvedModelLimits,
} from "../../lib/provider-limits.js";

// ============================================================================
// resolveLimits
// ============================================================================

describe("resolveLimits", () => {
	beforeEach(() => {
		reloadLimits();
	});

	describe("Anthropic", () => {
		it("should_resolve_claude_sonnet_4_pro", () => {
			// Act
			const limits = resolveLimits("anthropic", "claude-sonnet-4-20250514", "pro");

			// Assert
			expect(limits.provider).toBe("anthropic");
			expect(limits.model).toBe("claude-sonnet-4-20250514");
			expect(limits.tier).toBe("pro");
			expect(limits.rpm).toBe(1000);
			expect(limits.concurrency).toBe(5);
			expect(limits.source).toBe("preset");
		});

		it("should_resolve_claude_sonnet_4_max", () => {
			// Act
			const limits = resolveLimits("anthropic", "claude-sonnet-4-20250514", "max");

			// Assert
			expect(limits.rpm).toBe(4000);
			expect(limits.concurrency).toBe(8);
		});

		it("should_use_default_for_unknown_tier", () => {
			// Act
			const limits = resolveLimits("anthropic", "claude-sonnet-4-20250514", "unknown");

			// Assert: デフォルト値が使用される
			expect(limits.rpm).toBeGreaterThan(0);
			expect(limits.concurrency).toBeGreaterThan(0);
		});

		it("should_match_wildcard_pattern", () => {
			// Act
			const limits = resolveLimits("anthropic", "claude-3-5-sonnet-20241022", "pro");

			// Assert
			expect(limits.source).toBe("preset");
		});
	});

	describe("OpenAI", () => {
		it("should_resolve_gpt4o_free", () => {
			// Act
			const limits = resolveLimits("openai", "gpt-4o", "free");

			// Assert
			expect(limits.rpm).toBe(10);
			expect(limits.concurrency).toBe(1);
		});

		it("should_resolve_gpt4o_pro", () => {
			// Act
			const limits = resolveLimits("openai", "gpt-4o", "pro");

			// Assert
			expect(limits.rpm).toBe(500);
			expect(limits.concurrency).toBe(4);
		});

		it("should_resolve_o1_pro", () => {
			// Act
			const limits = resolveLimits("openai", "o1", "pro");

			// Assert
			expect(limits.rpm).toBe(100);
			expect(limits.concurrency).toBe(2);
		});
	});

	describe("Google", () => {
		it("should_resolve_gemini_2_5_pro_free", () => {
			// Act
			const limits = resolveLimits("google", "gemini-2.5-pro-latest", "free");

			// Assert
			expect(limits.rpm).toBe(15);
			expect(limits.concurrency).toBe(1);
		});

		it("should_resolve_gemini_2_5_pro_paid", () => {
			// Act
			const limits = resolveLimits("google", "gemini-2.5-pro-latest", "pro");

			// Assert
			expect(limits.rpm).toBe(2000);
			expect(limits.concurrency).toBe(8);
		});
	});

	describe("不明なプロバイダ", () => {
		it("should_return_default_limits", () => {
			// Act
			const limits = resolveLimits("unknown-provider", "unknown-model");

			// Assert
			expect(limits.source).toBe("default");
			expect(limits.rpm).toBeGreaterThan(0);
			expect(limits.concurrency).toBeGreaterThan(0);
		});
	});

	describe("大文字小文字", () => {
		it("should_normalize_provider_case", () => {
			// Act
			const limits1 = resolveLimits("ANTHROPIC", "claude-sonnet-4");
			const limits2 = resolveLimits("Anthropic", "claude-sonnet-4");

			// Assert
			expect(limits1.provider).toBe("anthropic");
			expect(limits2.provider).toBe("anthropic");
		});

		it("should_normalize_model_case", () => {
			// Act
			const limits = resolveLimits("anthropic", "CLAUDE-SONNET-4-20250514");

			// Assert
			expect(limits.model).toBe("claude-sonnet-4-20250514");
		});
	});
});

// ============================================================================
// getConcurrencyLimit
// ============================================================================

describe("getConcurrencyLimit", () => {
	beforeEach(() => {
		reloadLimits();
	});

	it("should_return_concurrency_value", () => {
		// Act
		const concurrency = getConcurrencyLimit("anthropic", "claude-sonnet-4-20250514", "pro");

		// Assert
		expect(concurrency).toBe(5);
	});

	it("should_return_positive_value_for_unknown", () => {
		// Act
		const concurrency = getConcurrencyLimit("unknown", "unknown");

		// Assert
		expect(concurrency).toBeGreaterThan(0);
	});
});

// ============================================================================
// getRpmLimit
// ============================================================================

describe("getRpmLimit", () => {
	beforeEach(() => {
		reloadLimits();
	});

	it("should_return_rpm_value", () => {
		// Act
		const rpm = getRpmLimit("openai", "gpt-4o", "free");

		// Assert
		expect(rpm).toBe(10);
	});

	it("should_return_positive_value_for_unknown", () => {
		// Act
		const rpm = getRpmLimit("unknown", "unknown");

		// Assert
		expect(rpm).toBeGreaterThan(0);
	});
});

// ============================================================================
// listProviders
// ============================================================================

describe("listProviders", () => {
	beforeEach(() => {
		reloadLimits();
	});

	it("should_return_known_providers", () => {
		// Act
		const providers = listProviders();

		// Assert
		expect(providers).toContain("anthropic");
		expect(providers).toContain("openai");
		expect(providers).toContain("google");
	});

	it("should_return_non_empty_array", () => {
		// Act
		const providers = listProviders();

		// Assert
		expect(providers.length).toBeGreaterThan(0);
	});
});

// ============================================================================
// listModels
// ============================================================================

describe("listModels", () => {
	beforeEach(() => {
		reloadLimits();
	});

	it("should_return_models_for_anthropic", () => {
		// Act
		const models = listModels("anthropic");

		// Assert
		expect(models.length).toBeGreaterThan(0);
		expect(models.some(m => m.includes("claude"))).toBe(true);
	});

	it("should_return_empty_for_unknown_provider", () => {
		// Act
		const models = listModels("unknown");

		// Assert
		expect(models).toEqual([]);
	});
});

// ============================================================================
// getLimitsConfig
// ============================================================================

describe("getLimitsConfig", () => {
	beforeEach(() => {
		reloadLimits();
	});

	it("should_return_valid_config", () => {
		// Act
		const config = getLimitsConfig();

		// Assert
		expect(config.version).toBeDefined();
		expect(config.providers).toBeDefined();
		expect(typeof config.providers).toBe("object");
	});

	it("should_cache_config", () => {
		// Act
		const config1 = getLimitsConfig();
		const config2 = getLimitsConfig();

		// Assert: 同じオブジェクト（キャッシュ）
		expect(config1).toBe(config2);
	});
});

// ============================================================================
// reloadLimits
// ============================================================================

describe("reloadLimits", () => {
	it("should_clear_cache", () => {
		// Arrange
		const config1 = getLimitsConfig();

		// Act
		reloadLimits();
		const config2 = getLimitsConfig();

		// Assert: 異なるオブジェクト（キャッシュクリア）
		expect(config1).not.toBe(config2);
	});
});

// ============================================================================
// getBuiltinLimits
// ============================================================================

describe("getBuiltinLimits", () => {
	it("should_return_copy_of_builtin", () => {
		// Act
		const limits1 = getBuiltinLimits();
		const limits2 = getBuiltinLimits();

		// Assert: ディープコピー
		expect(limits1).not.toBe(limits2);
		expect(limits1).toEqual(limits2);
	});

	it("should_have_required_structure", () => {
		// Act
		const limits = getBuiltinLimits();

		// Assert
		expect(limits.version).toBeDefined();
		expect(limits.lastUpdated).toBeDefined();
		expect(limits.source).toBe("builtin");
		expect(limits.providers).toBeDefined();
	});
});

// ============================================================================
// formatLimitsSummary
// ============================================================================

describe("formatLimitsSummary", () => {
	it("should_format_limits_correctly", () => {
		// Arrange
		const limits: ResolvedModelLimits = {
			provider: "anthropic",
			model: "claude-sonnet-4",
			tier: "pro",
			rpm: 1000,
			tpm: 80000,
			concurrency: 5,
			source: "preset",
		};

		// Act
		const summary = formatLimitsSummary(limits);

		// Assert
		expect(summary).toContain("anthropic");
		expect(summary).toContain("claude-sonnet-4");
		expect(summary).toContain("tier: pro");
		expect(summary).toContain("rpm: 1000");
		expect(summary).toContain("tpm: 80000");
		expect(summary).toContain("concurrency: 5");
		expect(summary).toContain("(preset)");
	});

	it("should_format_without_tpm", () => {
		// Arrange
		const limits: ResolvedModelLimits = {
			provider: "unknown",
			model: "unknown",
			tier: "default",
			rpm: 30,
			tpm: undefined,
			concurrency: 2,
			source: "default",
		};

		// Act
		const summary = formatLimitsSummary(limits);

		// Assert
		expect(summary).not.toContain("tpm:");
	});
});

// ============================================================================
// detectTier
// ============================================================================

describe("detectTier", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		vi.resetModules();
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("should_detect_from_PI_PROVIDER_TIER", () => {
		// Arrange
		process.env.PI_PROVIDER_TIER = "pro";

		// Act
		const tier = detectTier("anthropic", "claude");

		// Assert
		expect(tier).toBe("pro");
	});

	it("should_detect_from_provider_specific_env", () => {
		// Arrange
		process.env.PI_ANTHROPIC_TIER = "max";

		// Act
		const tier = detectTier("anthropic", "claude");

		// Assert
		expect(tier).toBe("max");
	});

	it("should_return_undefined_when_no_env", () => {
		// Arrange
		delete process.env.PI_PROVIDER_TIER;
		delete process.env.PI_ANTHROPIC_TIER;

		// Act
		const tier = detectTier("anthropic", "claude");

		// Assert
		expect(tier).toBeUndefined();
	});
});

// ============================================================================
// パターンマッチング
// ============================================================================

describe("パターンマッチング", () => {
	beforeEach(() => {
		reloadLimits();
	});

	it("should_match_exact_model", () => {
		// Act
		const limits = resolveLimits("openai", "gpt-4o");

		// Assert
		expect(limits.source).toBe("preset");
	});

	it("should_match_prefix_pattern", () => {
		// Act
		const limits = resolveLimits("google", "gemini-2.5-pro-exp");

		// Assert
		expect(limits.source).toBe("preset");
	});

	it("should_match_wildcard_suffix", () => {
		// Act
		const limits = resolveLimits("mistral", "mistral-large-2407");

		// Assert
		expect(limits.source).toBe("preset");
	});
});

// ============================================================================
// エッジケース
// ============================================================================

describe("エッジケース", () => {
	beforeEach(() => {
		reloadLimits();
	});

	it("should_handle_empty_provider", () => {
		// Act
		const limits = resolveLimits("", "model");

		// Assert
		expect(limits.source).toBe("default");
	});

	it("should_handle_empty_model", () => {
		// Act
		const limits = resolveLimits("anthropic", "");

		// Assert
		expect(limits).toBeDefined();
	});

	it("should_handle_special_characters_in_model", () => {
		// Act
		const limits = resolveLimits("anthropic", "claude-sonnet-4-20250514@special");

		// Assert
		expect(limits).toBeDefined();
	});
});
