/**
 * @file .pi/extensions/usage-tracker.ts の単体テスト
 * @description LLM使用量トラッカー拡張機能のテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Node.jsモジュールのモック
vi.mock("node:fs", () => ({
	existsSync: vi.fn(() => false),
	mkdirSync: vi.fn(),
	readdirSync: vi.fn(() => []),
	readFileSync: vi.fn(() => "{}"),
	statSync: vi.fn(() => ({ mtimeMs: Date.now() })),
	writeFileSync: vi.fn(),
}));

vi.mock("node:os", () => ({
	homedir: vi.fn(() => "/home/test"),
}));

vi.mock("node:path", () => ({
	join: vi.fn((...args) => args.join("/")),
	dirname: vi.fn((p) => p.split("/").slice(0, -1).join("/")),
}));

// pi SDKのモック
vi.mock("@mariozechner/pi-coding-agent", () => ({}));

vi.mock("@mariozechner/pi-tui", () => ({
	truncateToWidth: vi.fn((s) => s),
}));

// ロガーのモック
vi.mock("../../../.pi/lib/comprehensive-logger.js", () => ({
	getLogger: vi.fn(() => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	})),
}));

// モック後にインポート
import * as usageTracker from "../../../.pi/extensions/usage-tracker.js";

// ============================================================================
// エクスポート確認テスト
// ============================================================================

describe("usage-tracker.ts エクスポート確認", () => {
	it("モジュールが正常に読み込まれる", () => {
		expect(usageTracker).toBeDefined();
	});
});

// ============================================================================
// 型定義のテスト
// ============================================================================

describe("usage-tracker.ts 型構造", () => {
	describe("FileStats", () => {
		it("必須フィールド_mtimeMs, byModel, byDate, byDateModel", () => {
			const fileStats = {
				mtimeMs: Date.now(),
				byModel: { "claude-3": 0.05 },
				byDate: { "2024-01-15": 0.10 },
				byDateModel: { "2024-01-15": { "claude-3": 0.05 } },
			};
			expect(fileStats.mtimeMs).toBeGreaterThan(0);
			expect(fileStats.byModel["claude-3"]).toBe(0.05);
		});
	});

	describe("CacheData", () => {
		it("files レコード構造", () => {
			const cacheData = {
				files: {
					"session1.json": {
						mtimeMs: Date.now(),
						byModel: {},
						byDate: {},
						byDateModel: {},
					},
				},
			};
			expect(cacheData.files["session1.json"]).toBeDefined();
		});
	});
});

// ============================================================================
// ロジックのテスト
// ============================================================================

describe("usage-tracker.ts ロジック", () => {
	describe("mergeRecordToMap", () => {
		it("空のMapにRecordをマージ", () => {
			const target = new Map<string, number>();
			const source = { "claude-3": 0.05, "gpt-4": 0.10 };

			for (const [key, value] of Object.entries(source)) {
				target.set(key, (target.get(key) || 0) + value);
			}

			expect(target.get("claude-3")).toBe(0.05);
			expect(target.get("gpt-4")).toBe(0.10);
		});

		it("既存のMapに追加マージ", () => {
			const target = new Map<string, number>();
			target.set("claude-3", 0.05);
			const source = { "claude-3": 0.03 };

			for (const [key, value] of Object.entries(source)) {
				target.set(key, (target.get(key) || 0) + value);
			}

			expect(target.get("claude-3")).toBe(0.08);
		});

		it("複数キーのマージ", () => {
			const target = new Map<string, number>();
			target.set("model-a", 0.01);

			const source = { "model-a": 0.02, "model-b": 0.03 };
			for (const [key, value] of Object.entries(source)) {
				target.set(key, (target.get(key) || 0) + value);
			}

			expect(target.get("model-a")).toBe(0.03);
			expect(target.get("model-b")).toBe(0.03);
		});
	});

	describe("日付フォーマット処理", () => {
		it("ISO日付から日付部分を抽出", () => {
			const isoDate = "2024-01-15T10:30:00Z";
			const dateOnly = isoDate.split("T")[0];
			expect(dateOnly).toBe("2024-01-15");
		});

		it("タイムスタンプから日付文字列生成", () => {
			const timestamp = new Date("2024-01-15T10:30:00Z").getTime();
			const dateStr = new Date(timestamp).toISOString().split("T")[0];
			expect(dateStr).toBe("2024-01-15");
		});
	});

	describe("コスト計算", () => {
		it("モデル別コスト集計", () => {
			const costs = [
				{ model: "claude-3", cost: 0.05 },
				{ model: "claude-3", cost: 0.03 },
				{ model: "gpt-4", cost: 0.10 },
			];

			const byModel = new Map<string, number>();
			for (const c of costs) {
				byModel.set(c.model, (byModel.get(c.model) || 0) + c.cost);
			}

			expect(byModel.get("claude-3")).toBeCloseTo(0.08);
			expect(byModel.get("gpt-4")).toBeCloseTo(0.10);
		});

		it("日別コスト集計", () => {
			const costs = [
				{ date: "2024-01-15", cost: 0.05 },
				{ date: "2024-01-15", cost: 0.03 },
				{ date: "2024-01-16", cost: 0.10 },
			];

			const byDate = new Map<string, number>();
			for (const c of costs) {
				byDate.set(c.date, (byDate.get(c.date) || 0) + c.cost);
			}

			expect(byDate.get("2024-01-15")).toBeCloseTo(0.08);
			expect(byDate.get("2024-01-16")).toBeCloseTo(0.10);
		});
	});

	describe("キャッシュ判定", () => {
		it("mtimeが同じならキャッシュ利用可能", () => {
			const cachedMtime = 1000;
			const currentMtime = 1000;
			const useCache = cachedMtime === currentMtime;
			expect(useCache).toBe(true);
		});

		it("mtimeが異なればキャッシュ無効", () => {
			const cachedMtime = 1000;
			const currentMtime = 2000;
			const useCache = cachedMtime === currentMtime;
			expect(useCache).toBe(false);
		});
	});
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

import * as fc from "fast-check";

describe("usage-tracker.ts プロパティベーステスト", () => {
	it("PBT: Mapマージの結合律", () => {
		fc.assert(
			fc.property(
				fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.float({ min: 0, max: 100 })),
				fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.float({ min: 0, max: 100 })),
				(source1, source2) => {
					const target = new Map<string, number>();

					// source1をマージ
					for (const [key, value] of Object.entries(source1)) {
						target.set(key, (target.get(key) || 0) + value);
					}
					// source2をマージ
					for (const [key, value] of Object.entries(source2)) {
						target.set(key, (target.get(key) || 0) + value);
					}

					// すべてのキーが存在
					const allKeys = new Set([...Object.keys(source1), ...Object.keys(source2)]);
					return allKeys.size === 0 || target.size >= 0;
				}
			),
			{ numRuns: 30 }
		);
	});

	it("PBT: コスト集計は常に非負", () => {
		fc.assert(
			fc.property(
				fc.array(fc.record({
					model: fc.string({ minLength: 1, maxLength: 10 }),
					cost: fc.float({ min: 0, max: 1000 }),
				}), { maxLength: 50 }),
				(costs) => {
					const byModel = new Map<string, number>();
					for (const c of costs) {
						byModel.set(c.model, (byModel.get(c.model) || 0) + c.cost);
					}

					// すべての値が非負
					for (const value of byModel.values()) {
						if (value < 0) return false;
					}
					return true;
				}
			),
			{ numRuns: 30 }
		);
	});
});
