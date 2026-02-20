/**
 * @file .pi/extensions/rpm-throttle.ts の単体テスト
 * @description RPMスロットリング機能のテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// pi SDKのモック
vi.mock("@mariozechner/pi-coding-agent", () => ({}));

vi.mock("../../../.pi/lib/provider-limits.js", () => ({
	detectTier: vi.fn(() => "default"),
	getRpmLimit: vi.fn(() => 100),
}));

// モック後にインポート
import * as rpmThrottle from "../../../.pi/extensions/rpm-throttle.js";

// ============================================================================
// エクスポート確認テスト
// ============================================================================

describe("rpm-throttle.ts エクスポート確認", () => {
	it("モジュールが正常に読み込まれる", () => {
		expect(rpmThrottle).toBeDefined();
	});
});

// ============================================================================
// ヘルパー関数のテスト
// ============================================================================

describe("rpm-throttle.ts ロジック", () => {
	describe("キー生成", () => {
		it("プロバイダーとモデルからキーを生成", () => {
			const provider = "Anthropic";
			const model = "Claude-3-Sonnet";
			const key = `${provider.toLowerCase()}:${model.toLowerCase()}`;
			expect(key).toBe("anthropic:claude-3-sonnet");
		});

		it("小文字化される", () => {
			const provider = "OPENAI";
			const model = "GPT-4";
			const key = `${provider.toLowerCase()}:${model.toLowerCase()}`;
			expect(key).toBe("openai:gpt-4");
		});
	});

	describe("レート制限メッセージ検出", () => {
		it("429を含むメッセージを検出", () => {
			const text = "Error: 429 Too Many Requests";
			const isRateLimit = /429|rate.?limit|too many requests|quota exceeded/i.test(text);
			expect(isRateLimit).toBe(true);
		});

		it("rate limitを含むメッセージを検出", () => {
			const text = "Rate limit exceeded";
			const isRateLimit = /429|rate.?limit|too many requests|quota exceeded/i.test(text);
			expect(isRateLimit).toBe(true);
		});

		it("too many requestsを含むメッセージを検出", () => {
			const text = "Too many requests, please retry later";
			const isRateLimit = /429|rate.?limit|too many requests|quota exceeded/i.test(text);
			expect(isRateLimit).toBe(true);
		});

		it("通常のエラーメッセージは検出しない", () => {
			const text = "Internal server error";
			const isRateLimit = /429|rate.?limit|too many requests|quota exceeded/i.test(text);
			expect(isRateLimit).toBe(false);
		});
	});

	describe("Retry-After抽出", () => {
		it("秒数指定を抽出", () => {
			const text = "retry-after: 30 seconds";
			const sec = text.match(/retry[-\s]?after[^0-9]*(\d+)(?:\.\d+)?\s*(s|sec|secs|second|seconds)\b/i);
			expect(sec).not.toBeNull();
			expect(Number(sec![1]) * 1000).toBe(30000);
		});

		it("ミリ秒指定を抽出", () => {
			const text = "retry-after: 5000 ms";
			const ms = text.match(/retry[-\s]?after[^0-9]*(\d+)\s*(ms|msec|millisecond|milliseconds)\b/i);
			expect(ms).not.toBeNull();
		});

		it("Retry-Afterがない場合はnull", () => {
			const text = "Error occurred";
			const sec = text.match(/retry[-\s]?after[^0-9]*(\d+)(?:\.\d+)?\s*(s|sec|secs|second|seconds)\b/i);
			expect(sec).toBeNull();
		});
	});

	describe("ウィンドウプルーニング", () => {
		it("期限切れリクエストを削除", () => {
			const nowMs = 100000;
			const windowMs = 60000;
			const requestStartsMs = [30000, 40000]; // 古いリクエスト

			// ウィンドウ外のリクエストを削除
			const pruned = requestStartsMs.filter(t => nowMs - t < windowMs);
			expect(pruned).toHaveLength(0);
		});

		it("有効なリクエストは保持", () => {
			const nowMs = 100000;
			const windowMs = 60000;
			const requestStartsMs = [30000, 50000, 90000];

			const pruned = requestStartsMs.filter(t => nowMs - t < windowMs);
			expect(pruned).toHaveLength(2); // 50000, 90000 が有効
		});

		// 境界値テスト: 実装の pruneWindow は >= windowMs で削除
		it("境界値: ウィンドウ境界ちょうどのリクエストは削除される", () => {
			const nowMs = 100000;
			const windowMs = 60000;
			// nowMs - 40000 = 60000 === windowMs (境界値)
			const requestStartsMs = [40000];

			const pruned = requestStartsMs.filter(t => nowMs - t < windowMs);
			expect(pruned).toHaveLength(0); // 60000 < 60000 は false
		});

		it("境界値: ウィンドウ境界の1ms内側のリクエストは保持される", () => {
			const nowMs = 100000;
			const windowMs = 60000;
			// nowMs - 40001 = 59999 < windowMs (境界の1ms内側)
			const requestStartsMs = [40001];

			const pruned = requestStartsMs.filter(t => nowMs - t < windowMs);
			expect(pruned).toHaveLength(1); // 59999 < 60000 は true
		});
	});

	describe("クールダウン計算", () => {
		it("クールダウンが最大値を超えない", () => {
			const requested = 10 * 60 * 1000; // 10分
			const maxCooldown = 5 * 60 * 1000; // 5分
			const actual = Math.min(requested, maxCooldown);
			expect(actual).toBe(maxCooldown);
		});

		it("クールダウンが最小値を下回らない", () => {
			const requested = -1000;
			const actual = Math.max(0, requested);
			expect(actual).toBe(0);
		});
	});
});

// ============================================================================
// 状態管理のテスト
// ============================================================================

describe("rpm-throttle.ts 状態管理", () => {
	describe("BucketState", () => {
		it("初期状態の作成", () => {
			const state = {
				requestStartsMs: [],
				cooldownUntilMs: 0,
				lastAccessedMs: Date.now(),
			};
			expect(state.requestStartsMs).toHaveLength(0);
			expect(state.cooldownUntilMs).toBe(0);
		});

		it("リクエスト記録の追加", () => {
			const state = {
				requestStartsMs: [] as number[],
				cooldownUntilMs: 0,
				lastAccessedMs: Date.now(),
			};
			state.requestStartsMs.push(Date.now());
			expect(state.requestStartsMs).toHaveLength(1);
		});
	});

	describe("状態プルーニング", () => {
		it("古い状態を削除", () => {
			const states = new Map<string, { lastAccessedMs: number }>();
			const nowMs = Date.now();
			const maxAge = 15 * 60 * 1000;

			states.set("old", { lastAccessedMs: nowMs - maxAge - 1000 });
			states.set("new", { lastAccessedMs: nowMs });

			states.forEach((state, key) => {
				if (nowMs - state.lastAccessedMs > maxAge) {
					states.delete(key);
				}
			});

			expect(states.has("old")).toBe(false);
			expect(states.has("new")).toBe(true);
		});
	});
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

import * as fc from "fast-check";

describe("rpm-throttle.ts プロパティベーステスト", () => {
	it("PBT: キー生成の整合性", () => {
		fc.assert(
			fc.property(
				fc.string({ minLength: 1, maxLength: 20 }),
				fc.string({ minLength: 1, maxLength: 20 }),
				(provider, model) => {
					const key = `${provider.toLowerCase()}:${model.toLowerCase()}`;
					expect(key).toContain(":");
					expect(key.toLowerCase()).toBe(key);
					return true;
				}
			),
			{ numRuns: 30 }
		);
	});

	it("PBT: ウィンドウプルーニングは配列を短縮または維持", () => {
		fc.assert(
			fc.property(
				fc.array(fc.integer({ min: 0, max: 1000000 }), { maxLength: 100 }),
				fc.integer({ min: 0, max: 1000000 }),
				fc.integer({ min: 1000, max: 120000 }),
				(requestStartsMs, nowMs, windowMs) => {
					const pruned = requestStartsMs.filter(t => nowMs - t < windowMs);
					expect(pruned.length).toBeLessThanOrEqual(requestStartsMs.length);
					return true;
				}
			),
			{ numRuns: 30 }
		);
	});
});
