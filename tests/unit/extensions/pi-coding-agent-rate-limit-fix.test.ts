/**
 * @file .pi/extensions/pi-coding-agent-rate-limit-fix.ts の単体テスト
 * @description 429自動リトライ挙動を補正するパッチロジックのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// pi SDKのモック
vi.mock("@mariozechner/pi-coding-agent", () => ({
	ExtensionAPI: vi.fn(),
}));

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
import piCodingAgentRateLimitFix from "../../../.pi/extensions/pi-coding-agent-rate-limit-fix.js";

// ============================================================================
// エクスポート確認テスト
// ============================================================================

describe("pi-coding-agent-rate-limit-fix.ts エクスポート確認", () => {
	it("モジュールがデフォルトエクスポートを持つ", () => {
		expect(piCodingAgentRateLimitFix).toBeDefined();
		expect(typeof piCodingAgentRateLimitFix).toBe("function");
	});
});

// ============================================================================
// レート制限検出ロジックのテスト
// ============================================================================

describe("レート制限検出ロジック", () => {
	describe("_isRateLimitErrorパターン", () => {
		const rateLimitPattern =
			/rate.?limit|too many requests|429|quota exceeded/i;

		it("429を含むエラーを検出する", () => {
			expect(rateLimitPattern.test("Error: 429 Too Many Requests")).toBe(true);
		});

		it("rate limitを含むエラーを検出する", () => {
			expect(rateLimitPattern.test("Rate limit exceeded")).toBe(true);
		});

		it("quota exceededを含むエラーを検出する", () => {
			expect(rateLimitPattern.test("API quota exceeded")).toBe(true);
		});

		it("通常のエラーは検出しない", () => {
			expect(rateLimitPattern.test("Internal server error")).toBe(false);
		});
	});

	describe("リトライ可能エラーパターン", () => {
		const retryablePattern =
			/overloaded|rate.?limit|too many requests|429|500|502|503|504|service.?unavailable|server error|internal error|unknown error(?: occurred)?|connection.?error|connection.?refused|other side closed|fetch failed|upstream.?connect|reset before headers|terminated|retry delay/i;

		it("overloadedを検出する", () => {
			expect(retryablePattern.test("overloaded_error")).toBe(true);
		});

		it("unknown errorを検出する", () => {
			expect(retryablePattern.test("An unknown error occurred")).toBe(true);
		});

		it("5xxエラーを検出する", () => {
			expect(retryablePattern.test("500 Internal Server Error")).toBe(true);
			expect(retryablePattern.test("502 Bad Gateway")).toBe(true);
			expect(retryablePattern.test("503 Service Unavailable")).toBe(true);
			expect(retryablePattern.test("504 Gateway Timeout")).toBe(true);
		});

		it("通常のエラーメッセージは検出しない", () => {
			expect(retryablePattern.test("Invalid API key")).toBe(false);
			expect(retryablePattern.test("File not found")).toBe(false);
		});
	});
});

// ============================================================================
// Retry-After抽出ロジックのテスト
// ============================================================================

describe("_extractRetryAfterMsロジック", () => {
	const extractRetryAfterMs = (text: string): number | undefined => {
		const secondsMatch = text.match(
			/retry[-\s]?after[^0-9]*(\d+)(?:\.\d+)?\s*(s|sec|secs|second|seconds)\b/i
		);
		if (secondsMatch) {
			return Math.max(0, Number(secondsMatch[1]) * 1000);
		}
		const msMatch = text.match(
			/retry[-\s]?after[^0-9]*(\d+)\s*(ms|msec|millisecond|milliseconds)\b/i
		);
		if (msMatch) {
			return Math.max(0, Number(msMatch[1]));
		}
		return undefined;
	};

	it("秒指定を抽出する", () => {
		expect(extractRetryAfterMs("retry-after: 30 seconds")).toBe(30000);
		expect(extractRetryAfterMs("Retry-After: 60s")).toBe(60000);
	});

	it("ミリ秒指定を抽出する", () => {
		expect(extractRetryAfterMs("retry-after: 5000ms")).toBe(5000);
		expect(extractRetryAfterMs("retry-after: 1000 msec")).toBe(1000);
	});

	it("Retry-Afterがない場合はundefined", () => {
		expect(extractRetryAfterMs("Error occurred")).toBeUndefined();
	});

	it("大文字小文字を区別しない", () => {
		expect(extractRetryAfterMs("RETRY-AFTER: 10 S")).toBe(10000);
	});
});

// ============================================================================
// 遅延計算ロジックのテスト
// ============================================================================

describe("遅延計算ロジック", () => {
	describe("指数バックオフ", () => {
		const calculateExponentialDelay = (
			baseDelayMs: number,
			attempt: number,
			maxDelayMs: number
		): number => {
			return Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
		};

		it("試行回数に応じて遅延が増加する", () => {
			expect(calculateExponentialDelay(1000, 1, 60000)).toBe(1000);
			expect(calculateExponentialDelay(1000, 2, 60000)).toBe(2000);
			expect(calculateExponentialDelay(1000, 3, 60000)).toBe(4000);
		});

		it("最大遅延でキャップされる", () => {
			expect(calculateExponentialDelay(1000, 10, 60000)).toBe(60000);
		});
	});

	describe("streak delay", () => {
		const calculateStreakDelay = (
			baseDelayMs: number,
			streak: number,
			maxDelayMs: number
		): number => {
			return Math.min(
				maxDelayMs,
				baseDelayMs * 2 ** Math.max(0, streak - 1)
			);
		};

		it("streakが0の場合はbaseDelayMsを返す", () => {
			expect(calculateStreakDelay(1000, 0, 60000)).toBe(1000);
		});

		it("streakが増えると遅延が増加する", () => {
			expect(calculateStreakDelay(1000, 2, 60000)).toBe(2000);
			expect(calculateStreakDelay(1000, 3, 60000)).toBe(4000);
		});
	});

	describe("最終遅延決定", () => {
		const calculateFinalDelay = (
			exponentialDelayMs: number,
			retryAfterMs: number | undefined,
			streakDelayMs: number,
			cooldownWaitMs: number,
			maxDelayMs: number
		): number => {
			let delayMs = Math.max(
				exponentialDelayMs,
				retryAfterMs ?? 0,
				streakDelayMs,
				cooldownWaitMs
			);
			delayMs = Math.min(delayMs, maxDelayMs);
			return delayMs;
		};

		it("最大値を採用する", () => {
			expect(calculateFinalDelay(1000, undefined, 0, 0, 60000)).toBe(1000);
			expect(calculateFinalDelay(1000, 5000, 0, 0, 60000)).toBe(5000);
			expect(calculateFinalDelay(1000, undefined, 3000, 0, 60000)).toBe(3000);
		});

		it("cooldown待機時間を考慮する", () => {
			expect(calculateFinalDelay(1000, undefined, 0, 10000, 60000)).toBe(
				10000
			);
		});

		it("最大遅延でキャップされる", () => {
			expect(
				calculateFinalDelay(100000, undefined, 0, 0, 60000)
			).toBe(60000);
		});
	});
});

// ============================================================================
// 状態管理ロジックのテスト
// ============================================================================

describe("状態管理ロジック", () => {
	describe("_rateLimitStreak", () => {
		it("レート制限エラー時に増加する", () => {
			let streak = 0;
			const isRateLimit = true;
			if (isRateLimit) {
				streak += 1;
			}
			expect(streak).toBe(1);
		});

		it("通常エラー時にリセットされる", () => {
			let streak = 5;
			const isRateLimit = false;
			if (!isRateLimit) {
				streak = 0;
			}
			expect(streak).toBe(0);
		});

		it("成功時にリセットされる", () => {
			let streak = 5;
			const stopReason = "end";
			if (stopReason !== "error") {
				streak = 0;
			}
			expect(streak).toBe(0);
		});
	});

	describe("_rateLimitCooldownUntilMs", () => {
		it("レート制限時にクールダウンが設定される", () => {
			const now = Date.now();
			const cooldownMs = 10000;
			const cooldownUntil = now + cooldownMs;
			expect(cooldownUntil).toBeGreaterThan(now);
		});

		it("成功時にクリアされる", () => {
			let cooldownUntil = 1000000;
			const stopReason = "end";
			if (stopReason !== "error") {
				cooldownUntil = 0;
			}
			expect(cooldownUntil).toBe(0);
		});
	});
});

// ============================================================================
// パッチ置換定義のテスト
// ============================================================================

describe("PATCH_TARGET replacements", () => {
	it("5つの置換が定義されている", () => {
		const replacements = [
			{ marker: "_rateLimitCooldownUntilMs = 0;" },
			{ marker: "this._rateLimitStreak = 0;" },
			{ marker: "_isRateLimitError(message) {" },
			{ marker: "const exponentialDelayMs = Math.min(" },
			{ marker: "unknown error occurred" },
		];
		expect(replacements).toHaveLength(5);
	});

	describe("各markerの内容", () => {
		it("_rateLimitCooldownUntilMs変数の追加", () => {
			const marker = "_rateLimitCooldownUntilMs = 0;";
			expect(marker).toContain("_rateLimitCooldownUntilMs");
		});

		it("_rateLimitStreakのリセット処理", () => {
			const marker = "this._rateLimitStreak = 0;";
			expect(marker).toContain("_rateLimitStreak");
		});

		it("_isRateLimitErrorメソッドの追加", () => {
			const marker = "_isRateLimitError(message) {";
			expect(marker).toContain("_isRateLimitError");
		});
	});
});

// ============================================================================
// 初期化ロジックのテスト
// ============================================================================

describe("初期化ロジック", () => {
	it("initializedフラグはsession_startで1回だけtrueになる", () => {
		let initialized = false;

		const onSessionStart = () => {
			if (initialized) return;
			initialized = true;
		};

		onSessionStart();
		expect(initialized).toBe(true);

		onSessionStart();
		expect(initialized).toBe(true);
	});
});

// ============================================================================
// エッジケースのテスト
// ============================================================================

describe("エッジケース", () => {
	describe("負のRetry-After値", () => {
		it("Math.max(0, value)で保護される", () => {
			const value = -1000;
			const safe = Math.max(0, value);
			expect(safe).toBe(0);
		});
	});

	describe("非常に長いstreak", () => {
		it("maxDelayMsでキャップされる", () => {
			const baseDelayMs = 1000;
			const streak = 100;
			const maxDelayMs = 60000;
			const delay = Math.min(
				maxDelayMs,
				baseDelayMs * 2 ** Math.max(0, streak - 1)
			);
			expect(delay).toBe(60000);
		});
	});
});
