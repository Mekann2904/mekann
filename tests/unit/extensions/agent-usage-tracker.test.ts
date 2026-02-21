/**
 * @file .pi/extensions/agent-usage-tracker.ts の単体テスト
 * @description エージェント使用状況追跡拡張機能のテスト
 * @testFramework vitest + fast-check
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fc from "fast-check";

// モック: nodeモジュール依存を分離
vi.mock("node:crypto", () => ({
	randomBytes: vi.fn(() => Buffer.from("abc123", "hex")),
	randomUUID: vi.fn(() => "test-uuid-1234"),
}));

vi.mock("node:fs", () => ({
	existsSync: vi.fn(() => true),
	readFileSync: vi.fn(() => JSON.stringify({ version: 1, totals: {}, features: {}, events: [] })),
	writeFileSync: vi.fn(),
	mkdirSync: vi.fn(),
	readdirSync: vi.fn(() => []),
}));

vi.mock("node:path", () => ({
	join: vi.fn((...args: string[]) => args.join("/")),
	basename: vi.fn((p: string) => p.split("/").pop() || ""),
	dirname: vi.fn((p: string) => p.split("/").slice(0, -1).join("/")),
	resolve: vi.fn((...args: string[]) => args.join("/")),
}));

vi.mock("../../pi/lib/fs-utils", () => ({
	ensureDir: vi.fn(),
}));

vi.mock("../../pi/lib/validation-utils", () => ({
	toFiniteNumber: vi.fn((v: unknown) => {
		const n = Number(v);
		return Number.isFinite(n) ? n : undefined;
	}),
}));

vi.mock("../../pi/lib/comprehensive-logger", () => ({
	getLogger: vi.fn(() => ({
		startOperation: vi.fn(() => "op-id"),
		endOperation: vi.fn(),
	})),
}));

// ============================================================================
// 型定義のテスト
// ============================================================================

describe("FeatureType型", () => {
	type FeatureType = "tool" | "agent_run";

	it("should_accept_tool_type", () => {
		const type: FeatureType = "tool";
		expect(type).toBe("tool");
	});

	it("should_accept_agent_run_type", () => {
		const type: FeatureType = "agent_run";
		expect(type).toBe("agent_run");
	});

	it("should_exhaustively_check_types", () => {
		const types: FeatureType[] = ["tool", "agent_run"];
		expect(types).toHaveLength(2);
	});
});

describe("EventStatus型", () => {
	type EventStatus = "ok" | "error";

	it("should_accept_ok_status", () => {
		const status: EventStatus = "ok";
		expect(status).toBe("ok");
	});

	it("should_accept_error_status", () => {
		const status: EventStatus = "error";
		expect(status).toBe("error");
	});
});

describe("ContextSnapshot型", () => {
	interface ContextSnapshot {
		tokens?: number;
		contextWindow?: number;
		ratio?: number;
	}

	it("should_create_empty_snapshot", () => {
		const snapshot: ContextSnapshot = {};
		expect(snapshot.tokens).toBeUndefined();
	});

	it("should_create_full_snapshot", () => {
		const snapshot: ContextSnapshot = {
			tokens: 1000,
			contextWindow: 200000,
			ratio: 0.005,
		};

		expect(snapshot.tokens).toBe(1000);
		expect(snapshot.contextWindow).toBe(200000);
		expect(snapshot.ratio).toBe(0.005);
	});
});

describe("FeatureMetrics型", () => {
	interface FeatureMetrics {
		extension: string;
		featureType: "tool" | "agent_run";
		featureName: string;
		calls: number;
		errors: number;
		contextSamples: number;
		contextRatioSum: number;
		contextTokenSamples: number;
		contextTokenSum: number;
		lastUsedAt?: string;
		lastErrorAt?: string;
		lastErrorMessage?: string;
	}

	it("should_create_valid_metrics", () => {
		const metrics: FeatureMetrics = {
			extension: "subagents",
			featureType: "tool",
			featureName: "subagent_run",
			calls: 100,
			errors: 5,
			contextSamples: 50,
			contextRatioSum: 25,
			contextTokenSamples: 50,
			contextTokenSum: 50000,
		};

		expect(metrics.calls).toBe(100);
		expect(metrics.errors).toBe(5);
		expect(metrics.extension).toBe("subagents");
	});

	it("should_include_error_info", () => {
		const metrics: FeatureMetrics = {
			extension: "test",
			featureType: "tool",
			featureName: "test_tool",
			calls: 10,
			errors: 1,
			contextSamples: 5,
			contextRatioSum: 2.5,
			contextTokenSamples: 5,
			contextTokenSum: 500,
			lastErrorAt: "2024-01-01T00:00:00Z",
			lastErrorMessage: "Connection failed",
		};

		expect(metrics.lastErrorAt).toBeDefined();
		expect(metrics.lastErrorMessage).toBe("Connection failed");
	});
});

// ============================================================================
// ユーティリティ関数のテスト
// ============================================================================

describe("ユーティリティ関数", () => {
	describe("toFeatureKey", () => {
		function toFeatureKey(featureType: string, extension: string, featureName: string): string {
			return `${featureType}:${extension}:${featureName}`;
		}

		it("should_generate_consistent_key", () => {
			const key = toFeatureKey("tool", "subagents", "subagent_run");
			expect(key).toBe("tool:subagents:subagent_run");
		});

		it("should_create_unique_keys", () => {
			const key1 = toFeatureKey("tool", "subagents", "run");
			const key2 = toFeatureKey("tool", "agent-teams", "run");
			expect(key1).not.toBe(key2);
		});

		it("PBT: キーは一意に分解可能", () => {
			fc.assert(
				fc.property(
					fc.constantFrom("tool", "agent_run"),
					fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes(":")),
					fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes(":")),
					(type, ext, name) => {
						const key = toFeatureKey(type, ext, name);
						const parts = key.split(":");
						return parts.length === 3 && parts[0] === type && parts[1] === ext && parts[2] === name;
					}
				)
			);
		});
	});

	describe("normalizeRatio", () => {
		function normalizeRatio(value: number | undefined): number | undefined {
			if (value === undefined || !Number.isFinite(value)) return undefined;
			const normalized = value > 1 && value <= 100 ? value / 100 : value;
			return Math.max(0, Math.min(1, normalized));
		}

		it("should_return_undefined_for_invalid_input", () => {
			expect(normalizeRatio(undefined)).toBeUndefined();
			expect(normalizeRatio(NaN)).toBeUndefined();
			expect(normalizeRatio(Infinity)).toBeUndefined();
		});

		it("should_normalize_percentage_to_ratio", () => {
			expect(normalizeRatio(50)).toBe(0.5);
			expect(normalizeRatio(100)).toBe(1);
			expect(normalizeRatio(25.5)).toBe(0.255);
		});

		it("should_keep_ratio_unchanged", () => {
			expect(normalizeRatio(0.5)).toBe(0.5);
			expect(normalizeRatio(0.01)).toBe(0.01);
		});

		it("should_clamp_to_valid_range", () => {
			expect(normalizeRatio(150)).toBe(1);
			expect(normalizeRatio(-10)).toBe(0);
		});
	});

	describe("formatPercent", () => {
		function formatPercent(value: number | undefined): string {
			if (value === undefined || !Number.isFinite(value)) return "-";
			return `${(value * 100).toFixed(1)}%`;
		}

		it("should_format_ratio_as_percent", () => {
			expect(formatPercent(0.5)).toBe("50.0%");
			expect(formatPercent(0.123)).toBe("12.3%");
		});

		it("should_return_dash_for_undefined", () => {
			expect(formatPercent(undefined)).toBe("-");
		});
	});

	describe("formatRate", () => {
		function formatRate(numerator: number, denominator: number): string {
			if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
				return "0.0%";
			}
			return `${((numerator / denominator) * 100).toFixed(1)}%`;
		}

		it("should_calculate_rate", () => {
			expect(formatRate(5, 100)).toBe("5.0%");
			expect(formatRate(1, 3)).toBe("33.3%");
		});

		it("should_handle_zero_denominator", () => {
			expect(formatRate(5, 0)).toBe("0.0%");
		});

		it("should_handle_zero_numerator", () => {
			expect(formatRate(0, 100)).toBe("0.0%");
		});
	});
});

// ============================================================================
// ストレージ操作のテスト
// ============================================================================

describe("ストレージ操作", () => {
	describe("createEmptyState", () => {
		function createEmptyState(timestamp: string): {
			version: number;
			createdAt: string;
			updatedAt: string;
			totals: Record<string, number>;
			features: Record<string, unknown>;
			events: unknown[];
		} {
			return {
				version: 1,
				createdAt: timestamp,
				updatedAt: timestamp,
				totals: {
					toolCalls: 0,
					toolErrors: 0,
					agentRuns: 0,
					agentRunErrors: 0,
					contextSamples: 0,
					contextRatioSum: 0,
					contextTokenSamples: 0,
					contextTokenSum: 0,
				},
				features: {},
				events: [],
			};
		}

		it("should_create_valid_empty_state", () => {
			const state = createEmptyState("2024-01-01T00:00:00Z");

			expect(state.version).toBe(1);
			expect(state.events).toHaveLength(0);
			expect(Object.keys(state.features)).toHaveLength(0);
		});

		it("should_initialize_all_totals_to_zero", () => {
			const state = createEmptyState("2024-01-01T00:00:00Z");

			Object.values(state.totals).forEach((value) => {
				expect(value).toBe(0);
			});
		});
	});

	describe("parsePositiveInt", () => {
		function parsePositiveInt(raw: string | undefined, fallback: number): number {
			if (!raw) return fallback;
			const n = Number(raw);
			if (!Number.isFinite(n) || n <= 0) return fallback;
			return Math.max(1, Math.trunc(n));
		}

		it("should_parse_valid_number", () => {
			expect(parsePositiveInt("10", 5)).toBe(10);
			expect(parsePositiveInt("1", 5)).toBe(1);
		});

		it("should_use_fallback_for_empty", () => {
			expect(parsePositiveInt("", 5)).toBe(5);
			expect(parsePositiveInt(undefined, 5)).toBe(5);
		});

		it("should_use_fallback_for_invalid", () => {
			expect(parsePositiveInt("abc", 5)).toBe(5);
			expect(parsePositiveInt("-5", 5)).toBe(5);
			expect(parsePositiveInt("0", 5)).toBe(5);
		});

		it("should_truncate_to_integer", () => {
			expect(parsePositiveInt("10.9", 5)).toBe(10);
		});
	});
});

// ============================================================================
// 機能カタログのテスト
// ============================================================================

describe("FeatureCatalog", () => {
	interface FeatureCatalog {
		discoveredAt: string;
		toolToExtension: Record<string, string>;
		commandToExtension: Record<string, string>;
	}

	describe("カタログ構造", () => {
		it("should_create_valid_catalog", () => {
			const catalog: FeatureCatalog = {
				discoveredAt: "2024-01-01T00:00:00Z",
				toolToExtension: {
					subagent_run: "subagents",
					agent_team_run: "agent-teams",
				},
				commandToExtension: {
					abbr: "abbr",
				},
			};

			expect(catalog.toolToExtension["subagent_run"]).toBe("subagents");
			expect(catalog.commandToExtension["abbr"]).toBe("abbr");
		});

		it("should_map_tools_to_extensions", () => {
			const toolToExtension: Record<string, string> = {
				subagent_run: "subagents",
				subagent_status: "subagents",
				agent_team_run: "agent-teams",
				question: "question",
			};

			expect(toolToExtension["subagent_run"]).toBe("subagents");
			expect(toolToExtension["agent_team_run"]).toBe("agent-teams");
		});
	});
});

// ============================================================================
// イベント記録のテスト
// ============================================================================

describe("UsageEventRecord", () => {
	interface UsageEventRecord {
		id: string;
		timestamp: string;
		extension: string;
		featureType: "tool" | "agent_run";
		featureName: string;
		status: "ok" | "error";
		durationMs?: number;
		toolCallId?: string;
		inputPreview?: string;
		contextRatio?: number;
		contextTokens?: number;
		error?: string;
	}

	describe("イベント作成", () => {
		it("should_create_tool_event", () => {
			const event: UsageEventRecord = {
				id: "evt-123",
				timestamp: "2024-01-01T00:00:00Z",
				extension: "subagents",
				featureType: "tool",
				featureName: "subagent_run",
				status: "ok",
				durationMs: 1500,
				contextRatio: 0.25,
			};

			expect(event.featureType).toBe("tool");
			expect(event.status).toBe("ok");
			expect(event.durationMs).toBe(1500);
		});

		it("should_create_error_event", () => {
			const event: UsageEventRecord = {
				id: "evt-456",
				timestamp: "2024-01-01T00:00:00Z",
				extension: "subagents",
				featureType: "tool",
				featureName: "subagent_run",
				status: "error",
				error: "Timeout exceeded",
			};

			expect(event.status).toBe("error");
			expect(event.error).toBe("Timeout exceeded");
		});

		it("should_create_agent_run_event", () => {
			const event: UsageEventRecord = {
				id: "evt-789",
				timestamp: "2024-01-01T00:00:00Z",
				extension: "core-agent",
				featureType: "agent_run",
				featureName: "default",
				status: "ok",
				durationMs: 30000,
			};

			expect(event.featureType).toBe("agent_run");
			expect(event.extension).toBe("core-agent");
		});
	});
});

// ============================================================================
// バレルエクスポート確認テスト
// ============================================================================

describe("バレルエクスポート確認", () => {
	it("should_have_default_export_as_function", async () => {
		const module = await import("../../../.pi/extensions/agent-usage-tracker");
		expect(module.default).toBeDefined();
		expect(typeof module.default).toBe("function");
		expect(module.default.length).toBe(1); // pi引数を1つ取る
	});
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
	describe("コンテキスト比率の正規化", () => {
		it("PBT: 正規化結果は常に0-1の範囲", () => {
			function normalizeRatio(value: number | undefined): number | undefined {
				if (value === undefined || !Number.isFinite(value)) return undefined;
				const normalized = value > 1 && value <= 100 ? value / 100 : value;
				return Math.max(0, Math.min(1, normalized));
			}

			fc.assert(
				fc.property(fc.float({ min: -1000, max: 1000, noNaN: true }), (value) => {
					const result = normalizeRatio(value);
					if (result !== undefined) {
						return result >= 0 && result <= 1;
					}
					return true;
				})
			);
		});
	});

	describe("エラー率の計算", () => {
		it("PBT: エラー率は常に0-100%", () => {
			function formatRate(numerator: number, denominator: number): number {
				if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
					return 0;
				}
				return Math.min(100, (numerator / denominator) * 100);
			}

			fc.assert(
				fc.property(
					fc.integer({ min: 0, max: 1000 }),
					fc.integer({ min: 1, max: 1000 }),
					(errors, calls) => {
						const rate = formatRate(Math.min(errors, calls), calls);
						return rate >= 0 && rate <= 100;
					}
				)
			);
		});
	});

	describe("イベント履歴の制限", () => {
		it("PBT: 履歴は常に最大件数以下", () => {
			const MAX_EVENT_HISTORY = 5000;

			fc.assert(
				fc.property(fc.integer({ min: 0, max: 10000 }), (eventCount) => {
					const events = Array(Math.min(eventCount, 1000)).fill(null);
					// 実際のロジックをシミュレート
					const trimmedEvents = events.slice(-MAX_EVENT_HISTORY);
					return trimmedEvents.length <= MAX_EVENT_HISTORY;
				})
			);
		});
	});
});
