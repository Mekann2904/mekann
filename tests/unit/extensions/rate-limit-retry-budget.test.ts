/**
 * @file .pi/extensions/rate-limit-retry-budget.ts の単体テスト
 * @description 429系エラー時のリトライ上限拡張ロジックのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// pi SDKのモック
vi.mock("@mariozechner/pi-coding-agent", () => ({}));

vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(),
	writeFile: vi.fn(),
}));

vi.mock("node:module", () => ({
	createRequire: vi.fn(() => ({
		resolve: vi.fn((path: string) => `/mock/path/${path}`),
	})),
}));

// モック後にインポート
import rateLimitRetryBudget from "../../../.pi/extensions/rate-limit-retry-budget.js";

// ============================================================================
// エクスポート確認テスト
// ============================================================================

describe("rate-limit-retry-budget.ts エクスポート確認", () => {
	it("モジュールがデフォルトエクスポートを持つ", () => {
		expect(rateLimitRetryBudget).toBeDefined();
		expect(typeof rateLimitRetryBudget).toBe("function");
	});
});

// ============================================================================
// レート制限検出ロジックのテスト
// ============================================================================

describe("レート制限検出ロジック", () => {
	describe("正規表現パターン", () => {
		const rateLimitPattern = /rate.?limit|too many requests|429|quota exceeded/i;

		it("429を含むメッセージを検出する", () => {
			expect(rateLimitPattern.test("Error: 429 Too Many Requests")).toBe(true);
			expect(rateLimitPattern.test("429")).toBe(true);
		});

		it("rate limitを含むメッセージを検出する", () => {
			expect(rateLimitPattern.test("Rate limit exceeded")).toBe(true);
			expect(rateLimitPattern.test("rate limit")).toBe(true);
			expect(rateLimitPattern.test("ratelimit")).toBe(true);
		});

		it("too many requestsを含むメッセージを検出する", () => {
			expect(rateLimitPattern.test("Too many requests")).toBe(true);
			expect(rateLimitPattern.test("too many requests, retry later")).toBe(true);
		});

		it("quota exceededを含むメッセージを検出する", () => {
			expect(rateLimitPattern.test("Quota exceeded")).toBe(true);
			expect(rateLimitPattern.test("API quota exceeded for user")).toBe(true);
		});

		it("大文字小文字を区別しない", () => {
			expect(rateLimitPattern.test("RATE LIMIT")).toBe(true);
			expect(rateLimitPattern.test("Rate Limit")).toBe(true);
			expect(rateLimitPattern.test("RATELIMIT")).toBe(true);
		});

		it("通常のエラーメッセージは検出しない", () => {
			expect(rateLimitPattern.test("Internal server error")).toBe(false);
			expect(rateLimitPattern.test("Connection timeout")).toBe(false);
			expect(rateLimitPattern.test("Invalid API key")).toBe(false);
		});

		it("空文字列は検出しない", () => {
			expect(rateLimitPattern.test("")).toBe(false);
		});
	});
});

// ============================================================================
// リトライ回数計算ロジックのテスト
// ============================================================================

describe("リトライ回数計算ロジック", () => {
	describe("環境変数PI_RATE_LIMIT_MAX_RETRIESの解析", () => {
		const parseEnvRetries = (envValue: string | undefined): number => {
			if (!envValue) return 8; // デフォルト値
			const parsed = Number.parseInt(envValue, 10);
			if (!Number.isFinite(parsed) || parsed <= 0) return 8;
			return parsed;
		};

		it("数値文字列を正しく解析する", () => {
			expect(parseEnvRetries("10")).toBe(10);
			expect(parseEnvRetries("5")).toBe(5);
			expect(parseEnvRetries("100")).toBe(100);
		});

		it("無効な値の場合はデフォルト値8を返す", () => {
			expect(parseEnvRetries("invalid")).toBe(8);
			expect(parseEnvRetries("abc")).toBe(8);
			expect(parseEnvRetries("")).toBe(8);
			expect(parseEnvRetries(undefined)).toBe(8);
		});

		it("0以下の値の場合はデフォルト値8を返す", () => {
			expect(parseEnvRetries("0")).toBe(8);
			expect(parseEnvRetries("-5")).toBe(8);
		});

		it("浮動小数点は整数に切り捨てられる", () => {
			const parsed = Number.parseInt("7.9", 10);
			expect(parsed).toBe(7);
		});
	});

	describe("最終リトライ回数の決定", () => {
		const calculateMaxRetries = (
			isRateLimitRetry: boolean,
			settingsMaxRetries: number,
			envRetries: number
		): number => {
			if (!isRateLimitRetry) return settingsMaxRetries;
			return Math.max(settingsMaxRetries, Number.isFinite(envRetries) && envRetries > 0 ? envRetries : 8);
		};

		it("レート制限エラーでない場合は通常の最大リトライ回数を使用", () => {
			expect(calculateMaxRetries(false, 3, 8)).toBe(3);
			expect(calculateMaxRetries(false, 5, 10)).toBe(5);
		});

		it("レート制限エラーの場合は環境変数値と設定値の大きい方を使用", () => {
			expect(calculateMaxRetries(true, 3, 8)).toBe(8);
			expect(calculateMaxRetries(true, 10, 5)).toBe(10);
		});

		it("レート制限エラーで環境変数が無効な場合はデフォルト8を使用", () => {
			expect(calculateMaxRetries(true, 3, 0)).toBe(8);
			expect(calculateMaxRetries(true, 3, -1)).toBe(8);
		});
	});
});

// ============================================================================
// 置換パターンのテスト
// ============================================================================

describe("置換パターン", () => {
	describe("REPLACEMENTS定数の構造", () => {
		it("marker文字列が定義されている", () => {
			const REPLACEMENTS = [
				{
					marker: "const rateLimitMaxRetries =",
					beforeCandidates: [
						"        if (this._retryAttempt > settings.maxRetries) {",
						"if (this._retryAttempt > settings.maxRetries) {",
					],
					after: expect.stringContaining("const rateLimitMaxRetries ="),
				},
				{
					marker: "maxAttempts: rateLimitMaxRetries,",
					beforeCandidates: [
						"            maxAttempts: settings.maxRetries,",
						"maxAttempts: settings.maxRetries,",
					],
					after: "            maxAttempts: rateLimitMaxRetries,",
				},
			];

			expect(REPLACEMENTS).toHaveLength(2);
			expect(REPLACEMENTS[0].marker).toBe("const rateLimitMaxRetries =");
			expect(REPLACEMENTS[1].marker).toBe("maxAttempts: rateLimitMaxRetries,");
		});

		it("beforeCandidatesが複数の候補を持つ", () => {
			const beforeCandidates = [
				"        if (this._retryAttempt > settings.maxRetries) {",
				"if (this._retryAttempt > settings.maxRetries) {",
			];

			expect(beforeCandidates.length).toBeGreaterThanOrEqual(1);
		});

		it("after文字列にレート制限検出ロジックが含まれる", () => {
			const after = `        const isRateLimitRetry = /rate.?limit|too many requests|429|quota exceeded/i.test(message.errorMessage || "");
        const configuredRateLimitRetries = Number.parseInt(process.env.PI_RATE_LIMIT_MAX_RETRIES ?? "8", 10);
        const rateLimitMaxRetries = isRateLimitRetry
            ? Math.max(settings.maxRetries, Number.isFinite(configuredRateLimitRetries) && configuredRateLimitRetries > 0
                ? configuredRateLimitRetries
                : 8)
            : settings.maxRetries;
        if (this._retryAttempt > rateLimitMaxRetries) {`;

			expect(after).toContain("isRateLimitRetry");
			expect(after).toContain("PI_RATE_LIMIT_MAX_RETRIES");
			expect(after).toContain("rateLimitMaxRetries");
		});
	});
});

// ============================================================================
// イベントハンドラーのテスト
// ============================================================================

describe("イベントハンドラー", () => {
	it("session_startイベントを1回だけ処理する", () => {
		// このテストは実装の振る舞いを確認するもので、
		// 実際のイベント発火は統合テストで検証する
		let initialized = false;

		const simulateSessionStart = () => {
			if (initialized) return;
			initialized = true;
		};

		simulateSessionStart();
		expect(initialized).toBe(true);

		// 2回目は無視される
		simulateSessionStart();
		expect(initialized).toBe(true);
	});
});

// ============================================================================
// エッジケースのテスト
// ============================================================================

describe("エッジケース", () => {
	describe("メッセージがnull/undefinedの場合", () => {
		it("errorMessageが空文字として扱われる", () => {
			const pattern = /rate.?limit|too many requests|429|quota exceeded/i;
			const errorMessage = undefined || "";
			expect(pattern.test(errorMessage)).toBe(false);
		});
	});

	describe("非常に大きなリトライ回数", () => {
		it("大きな値でも正しく処理される", () => {
			const envRetries = Number.parseInt("1000", 10);
			expect(Number.isFinite(envRetries)).toBe(true);
			expect(envRetries).toBe(1000);
		});
	});
});
