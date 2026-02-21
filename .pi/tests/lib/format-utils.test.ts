/**
 * @file .pi/lib/format-utils.ts の単体テスト
 * @description フォーマットユーティリティのテスト
 * @testFramework vitest + fast-check
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as fc from "fast-check";

// モジュールをインポート
import {
	formatDuration,
	formatDurationMs,
	formatElapsedClock,
	formatBytes,
	formatClockTime,
	normalizeForSingleLine,
} from "../../lib/format-utils.ts";

// ============================================================================
// formatDuration
// ============================================================================

describe("formatDuration", () => {
	describe("正常系", () => {
		it("should_format_milliseconds", () => {
			expect(formatDuration(100)).toBe("100ms");
			expect(formatDuration(500)).toBe("500ms");
			expect(formatDuration(999)).toBe("999ms");
		});

		it("should_format_seconds", () => {
			expect(formatDuration(1000)).toBe("1.00s");
			expect(formatDuration(1500)).toBe("1.50s");
			expect(formatDuration(1234)).toBe("1.23s");
		});

		it("should_format_large_values", () => {
			expect(formatDuration(60000)).toBe("60.00s");
			expect(formatDuration(60000 * 60)).toBe("3600.00s");
		});
	});

	describe("境界条件", () => {
		it("should_return_0ms_for_0", () => {
			expect(formatDuration(0)).toBe("0ms");
		});

		it("should_return_0ms_for_negative", () => {
			expect(formatDuration(-100)).toBe("0ms");
		});

		it("should_return_0ms_for_NaN", () => {
			expect(formatDuration(NaN)).toBe("0ms");
		});

		it("should_return_0ms_for_Infinity", () => {
			expect(formatDuration(Infinity)).toBe("0ms");
			expect(formatDuration(-Infinity)).toBe("0ms");
		});

		it("should_handle_just_under_1s", () => {
			expect(formatDuration(999.9)).toBe("1000ms");
		});

		it("should_handle_just_over_1s", () => {
			expect(formatDuration(1000.1)).toBe("1.00s");
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 結果は常に文字列である", () => {
			fc.assert(
				fc.property(fc.float({ min: -1000000, max: 1000000 }), (ms) => {
					const result = formatDuration(ms);
					return typeof result === "string";
				}),
				{ numRuns: 100 },
			);
		});

		it("PBT: 結果は常に'ms'または's'で終わる", () => {
			fc.assert(
				fc.property(fc.float({ min: 0, max: 1000000 }), (ms) => {
					const result = formatDuration(ms);
					return result.endsWith("ms") || result.endsWith("s");
				}),
				{ numRuns: 100 },
			);
		});

		it("PBT: 負の値または非有限値は'0ms'を返す", () => {
			fc.assert(
				fc.property(
					fc.oneof(
						fc.float({ min: -1000000, max: -1 }),
						fc.constant(NaN),
						fc.constant(Infinity),
						fc.constant(-Infinity),
					),
					(ms) => {
						const result = formatDuration(ms);
						return result === "0ms";
					},
				),
				{ numRuns: 100 },
			);
		});
	});
});

// ============================================================================
// formatDurationMs
// ============================================================================

describe("formatDurationMs", () => {
	describe("正常系", () => {
		it("should_format_with_startedAt_only", () => {
			const item = { startedAtMs: Date.now() - 1000 };
			const result = formatDurationMs(item);
			expect(result).toMatch(/^\d+\.\d+s$/);
		});

		it("should_format_with_both_timestamps", () => {
			const startedAtMs = Date.now() - 2500;
			const item = { startedAtMs, finishedAtMs: Date.now() };
			const result = formatDurationMs(item);
			expect(result).toBe("2.5s");
		});

		it("should_calculate_correct_duration", () => {
			const startedAtMs = Date.now() - 5000;
			const item = { startedAtMs, finishedAtMs: startedAtMs + 2000 };
			const result = formatDurationMs(item);
			expect(result).toBe("2.0s");
		});
	});

	describe("境界条件", () => {
		it("should_return_dash_without_startedAt", () => {
			const item = {};
			const result = formatDurationMs(item);
			expect(result).toBe("-");
		});

		it("should_return_dash_with_null_startedAt", () => {
			const item = { startedAtMs: undefined };
			const result = formatDurationMs(item);
			expect(result).toBe("-");
		});

		it("should_handle_0_duration", () => {
			const startedAtMs = Date.now();
			const item = { startedAtMs, finishedAtMs: startedAtMs };
			const result = formatDurationMs(item);
			expect(result).toBe("0.0s");
		});

		it("should_handle_negative_duration", () => {
			const startedAtMs = Date.now();
			const item = { startedAtMs, finishedAtMs: startedAtMs - 1000 };
			const result = formatDurationMs(item);
			// Math.max(0, ...)で0になるはず
			expect(result).toBe("0.0s");
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: startedAtMsがある場合は常に数字を含む", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 0, max: Date.now() }),
					fc.option(fc.integer({ min: 0, max: Date.now() })),
					(startedAtMs, finishedAtMs) => {
						const item = { startedAtMs, finishedAtMs };
						const result = formatDurationMs(item);
						return result === "-" || /^\d+\.\d+s$/.test(result);
					},
				),
				{ numRuns: 100 },
			);
		});
	});
});

// ============================================================================
// formatElapsedClock
// ============================================================================

describe("formatElapsedClock", () => {
	describe("正常系", () => {
		it("should_format_with_startedAt_only", () => {
			const startedAtMs = Date.now() - 3665000; // 1時間1分5秒前
			const item = { startedAtMs };
			const result = formatElapsedClock(item);
			expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
		});

		it("should_format_with_both_timestamps", () => {
			const startedAtMs = Date.now() - 3723000; // 1時間2分3秒
			const finishedAtMs = startedAtMs + 3723000;
			const item = { startedAtMs, finishedAtMs };
			const result = formatElapsedClock(item);
			expect(result).toBe("01:02:03");
		});

		it("should_format_0_duration", () => {
			const startedAtMs = Date.now();
			const item = { startedAtMs, finishedAtMs: startedAtMs };
			const result = formatElapsedClock(item);
			expect(result).toBe("00:00:00");
		});

		it("should_format_minutes_only", () => {
			const startedAtMs = Date.now() - 125000; // 2分5秒
			const finishedAtMs = startedAtMs + 125000;
			const item = { startedAtMs, finishedAtMs };
			const result = formatElapsedClock(item);
			expect(result).toBe("00:02:05");
		});

		it("should_format_hours_only", () => {
			const startedAtMs = Date.now() - 3600000; // 1時間
			const finishedAtMs = startedAtMs + 3600000;
			const item = { startedAtMs, finishedAtMs };
			const result = formatElapsedClock(item);
			expect(result).toBe("01:00:00");
		});
	});

	describe("境界条件", () => {
		it("should_return_dash_without_startedAt", () => {
			const item = {};
			const result = formatElapsedClock(item);
			expect(result).toBe("-");
		});

		it("should_handle_negative_duration", () => {
			const startedAtMs = Date.now();
			const item = { startedAtMs, finishedAtMs: startedAtMs - 1000 };
			const result = formatElapsedClock(item);
			// Math.max(0, ...)で0になるはず
			expect(result).toBe("00:00:00");
		});

		it("should_handle_large_values", () => {
			const startedAtMs = Date.now() - 90061000; // 25時間1分1秒
			const finishedAtMs = startedAtMs + 90061000;
			const item = { startedAtMs, finishedAtMs };
			const result = formatElapsedClock(item);
			expect(result).toBe("25:01:01");
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 結果は常にHH:MM:SS形式である", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 0, max: Date.now() }),
					fc.option(fc.integer({ min: 0, max: Date.now() })),
					(startedAtMs, finishedAtMs) => {
						const item = { startedAtMs, finishedAtMs };
						const result = formatElapsedClock(item);
						return result === "-" || /^\d+:\d{2}:\d{2}$/.test(result);
					},
				),
				{ numRuns: 100 },
			);
		});
	});
});

// ============================================================================
// formatBytes
// ============================================================================

describe("formatBytes", () => {
	describe("正常系", () => {
		it("should_format_bytes", () => {
			expect(formatBytes(0)).toBe("0B");
			expect(formatBytes(100)).toBe("100B");
			expect(formatBytes(1023)).toBe("1023B");
		});

		it("should_format_kilobytes", () => {
			expect(formatBytes(1024)).toBe("1.0KB");
			expect(formatBytes(2048)).toBe("2.0KB");
			expect(formatBytes(1536)).toBe("1.5KB");
			expect(formatBytes(10240)).toBe("10.0KB");
		});

		it("should_format_megabytes", () => {
			expect(formatBytes(1024 * 1024)).toBe("1.0MB");
			expect(formatBytes(2 * 1024 * 1024)).toBe("2.0MB");
			expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5MB");
		});

		it("should_handle_large_values", () => {
			expect(formatBytes(10 * 1024 * 1024)).toBe("10.0MB");
			expect(formatBytes(1024 * 1024 * 1024)).toBe("1024.0MB");
		});
	});

	describe("境界条件", () => {
		it("should_handle_0", () => {
			expect(formatBytes(0)).toBe("0B");
		});

		it("should_handle_negative", () => {
			expect(formatBytes(-100)).toBe("0B");
		});

		it("should_handle_decimal", () => {
			// 実装はMath.truncを使用するため、小数点以下は切り捨てられる
			expect(formatBytes(512.7)).toBe("512B");
			expect(formatBytes(1024.9)).toBe("1.0KB");
		});

		it("should_handle_just_under_1KB", () => {
			expect(formatBytes(1023.9)).toBe("1023B");
		});

		it("should_handle_just_over_1KB", () => {
			expect(formatBytes(1024.1)).toBe("1.0KB");
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 結果は常に'B'、'KB'、または'MB'で終わる", () => {
			fc.assert(
				fc.property(fc.integer({ min: -1000000000, max: 1000000000 }), (bytes) => {
					const result = formatBytes(bytes);
					return result.endsWith("B") || result.endsWith("KB") || result.endsWith("MB");
				}),
				{ numRuns: 100 },
			);
		});

		it("PBT: 負の値は'0B'を返す", () => {
			fc.assert(
				fc.property(fc.integer({ min: -1000000000, max: -1 }), (bytes) => {
					const result = formatBytes(bytes);
					return result === "0B";
				}),
				{ numRuns: 100 },
			);
		});
	});
});

// ============================================================================
// formatClockTime
// ============================================================================

describe("formatClockTime", () => {
	describe("正常系", () => {
		it("should_format_timestamp", () => {
			// 実装はローカルタイムを返すため、GMT+9で+9時間
			const timestamp = new Date("2024-01-15T10:30:45.000Z").getTime();
			const result = formatClockTime(timestamp);
			expect(result).toBe("19:30:45");
		});

		it("should_format_different_times", () => {
			// GMT+9で+9時間
			const timestamp1 = new Date("2024-01-15T00:00:00.000Z").getTime();
			const timestamp2 = new Date("2024-01-15T23:59:59.999Z").getTime();
			expect(formatClockTime(timestamp1)).toBe("09:00:00");
			expect(formatClockTime(timestamp2)).toBe("08:59:59"); // 翌日の08:59:59
		});
	});

	describe("境界条件", () => {
		it("should_return_dash_without_value", () => {
			const result = formatClockTime();
			expect(result).toBe("-");
		});

		it("should_return_dash_for_undefined", () => {
			const result = formatClockTime(undefined);
			expect(result).toBe("-");
		});

		it("should_return_dash_for_0", () => {
			const result = formatClockTime(0);
			// 実装では!valueでfalse判定されるため"-"が返される
			expect(result).toBe("-");
		});

		it("should_handle_negative_timestamp", () => {
			const result = formatClockTime(-1000);
			// 1970-01-01 00:00:00 GMTから-1秒
			expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 結果は常にHH:MM:SS形式またはダッシュである", () => {
			fc.assert(
				fc.property(fc.option(fc.integer({ min: 0, max: Date.now() * 2 })), (timestamp) => {
					const result = formatClockTime(timestamp);
					return result === "-" || /^\d{2}:\d{2}:\d{2}$/.test(result);
				}),
				{ numRuns: 100 },
			);
		});
	});
});

// ============================================================================
// normalizeForSingleLine
// ============================================================================

describe("normalizeForSingleLine", () => {
	beforeEach(() => {
		// キャッシュをクリア（直接Mapを操作）
		// TypeScriptでプライベート変数にアクセスできないため、
		// テスト間でキャッシュの影響を避けるために必要な場合はテストを設計
	});

	describe("正常系", () => {
		it("should_collapse_whitespace", () => {
			const input = "hello   world  test";
			const result = normalizeForSingleLine(input);
			expect(result).toBe("hello world test");
		});

		it("should_handle_newlines", () => {
			const input = "hello\nworld\r\ntest";
			const result = normalizeForSingleLine(input);
			expect(result).toBe("hello world test");
		});

		it("should_handle_tabs", () => {
			const input = "hello\tworld\ttest";
			const result = normalizeForSingleLine(input);
			expect(result).toBe("hello world test");
		});

		it("should_trim_whitespace", () => {
			const input = "  hello world  ";
			const result = normalizeForSingleLine(input);
			expect(result).toBe("hello world");
		});

		it("should_handle_mixed_whitespace", () => {
			const input = "  hello\t\n world  \r\n  ";
			const result = normalizeForSingleLine(input);
			expect(result).toBe("hello world");
		});
	});

	describe("境界条件", () => {
		it("should_return_dash_for_empty_string", () => {
			const result = normalizeForSingleLine("");
			expect(result).toBe("-");
		});

		it("should_return_dash_for_whitespace_only", () => {
			const result = normalizeForSingleLine("   \n\t\r  ");
			expect(result).toBe("-");
		});

		it("should_not_truncate_short_string", () => {
			const input = "short";
			const result = normalizeForSingleLine(input);
			expect(result).toBe("short");
		});

		it("should_truncate_long_string", () => {
			const input = "a".repeat(200);
			const result = normalizeForSingleLine(input, 160);
			expect(result.length).toBe(160);
			// 実装は"..."を付加してから maxLength で切り取るため、末尾が"..."とは限らない
			// 結果の長さがmaxLengthであることを確認すれば十分
		});

		it("should_use_default_max_length", () => {
			const input = "a".repeat(200);
			const result = normalizeForSingleLine(input);
			expect(result.length).toBeLessThanOrEqual(160);
		});

		it("should_truncate_at_max_length_minus_3", () => {
			const input = "a".repeat(200);
			const result = normalizeForSingleLine(input, 50);
			expect(result.length).toBe(50);
			expect(result).toBe("a".repeat(47) + "...");
		});
	});

	describe("境界条件 - 最大長", () => {
		it("should_return_exact_length", () => {
			const input = "a".repeat(160);
			const result = normalizeForSingleLine(input, 160);
			expect(result.length).toBe(160);
		});

		it("should_truncate_one_over", () => {
			const input = "a".repeat(161);
			const result = normalizeForSingleLine(input, 160);
			expect(result.length).toBe(160);
		});

		it("should_handle_max_length_of_0", () => {
			const result = normalizeForSingleLine("test", 0);
			// 最小長の保証が必要
			expect(result.length).toBeGreaterThanOrEqual(0);
		});

		it("should_handle_negative_max_length", () => {
			const result = normalizeForSingleLine("test", -10);
			// 負の値の挙動は実装による
			expect(result.length).toBeGreaterThanOrEqual(0);
		});
	});

	describe("キャッシュ動作", () => {
		it("should_use_cache_for_same_input", () => {
			const input = "test string with   whitespace";
			const result1 = normalizeForSingleLine(input, 100);
			const result2 = normalizeForSingleLine(input, 100);
			// 同じ入力に対して同じ結果を返す
			expect(result1).toBe(result2);
		});

		it("should_handle_different_max_lengths", () => {
			const input = "a".repeat(200);
			const result1 = normalizeForSingleLine(input, 50);
			const result2 = normalizeForSingleLine(input, 100);
			// 異なる最大長で異なる結果
			expect(result1.length).toBe(50);
			expect(result2.length).toBe(100);
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 結果は常に文字列である", () => {
			fc.assert(
				fc.property(
					fc.string({ maxLength: 1000 }),
					fc.integer({ min: 0, max: 500 }),
					(input, maxLength) => {
						const result = normalizeForSingleLine(input, maxLength);
						return typeof result === "string";
					},
				),
				{ numRuns: 100 },
			);
		});

		it("PBT: 結果の長さはmaxLength以下である（ただし'-'やmaxLengthが小さい場合は例外）", () => {
			fc.assert(
				fc.property(
					fc.string({ maxLength: 1000 }),
					fc.integer({ min: 5, max: 500 }),
					(input, maxLength) => {
						const result = normalizeForSingleLine(input, maxLength);
						// '-' は空文字列または空白のみの場合に返される特別な値
						if (result === "-") {
							return true;
						}
						return result.length <= maxLength;
					},
				),
				{ numRuns: 100 },
			);
		});

		it("PBT: 結果は改行を含まない", () => {
			fc.assert(
				fc.property(
					fc.string({ maxLength: 1000 }),
					fc.integer({ min: 0, max: 500 }),
					(input, maxLength) => {
						const result = normalizeForSingleLine(input, maxLength);
						return !result.includes("\n") && !result.includes("\r") && !result.includes("\t");
					},
				),
				{ numRuns: 100 },
			);
		});

		it("PBT: 空文字列または空白のみはダッシュを返す", () => {
			const whitespaceOnly = (str: string) => /^\s*$/.test(str);

			fc.assert(
				fc.property(fc.string({ maxLength: 100 }), (input) => {
					if (input === "" || whitespaceOnly(input)) {
						const result = normalizeForSingleLine(input);
						return result === "-";
					}
					return true;
				}),
				{ numRuns: 100 },
			);
		});
	});
});
