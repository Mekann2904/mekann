/**
 * @file .pi/lib/agent-utils.ts の単体テスト
 * @description エージェント実行共通ユーティリティのテスト
 * @testFramework vitest + fast-check
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";

// モジュールをインポート
import { createRunId, computeLiveWindow } from "../../lib/agent-utils.ts";

// ============================================================================
// createRunId
// ============================================================================

describe("createRunId", () => {
	describe("正常系", () => {
		it("should_create_valid_run_id", () => {
			const result = createRunId();
			expect(typeof result).toBe("string");
			expect(result.length).toBeGreaterThan(0);
		});

		it("should_start_with_date_stamp", () => {
			const result = createRunId();
			// フォーマット: YYYY-MM-DD-HH-MM-SS-XXX (または YYYYMMDD-HHMMSS-XXX)
			// 注: 実装が配列のjoinを使用しているため、ハイフン区切りになる
			expect(result).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-[a-f0-9]{6}$/);
		});

		it("should_have_hex_suffix", () => {
			const result = createRunId();
			const suffix = result.split("-").pop();
			expect(suffix).toMatch(/^[a-f0-9]{6}$/);
		});

		it("should_have_correct_timestamp_parts", () => {
			const result = createRunId();
			const parts = result.split("-");
			// [YYYY, MM, DD, HH, MM, SS, hexSuffix]
			expect(parts).toHaveLength(7);
			expect(parts[0]).toMatch(/^\d{4}$/); // Year
			expect(parts[1]).toMatch(/^\d{2}$/); // Month
			expect(parts[2]).toMatch(/^\d{2}$/); // Day
			expect(parts[3]).toMatch(/^\d{2}$/); // Hour
			expect(parts[4]).toMatch(/^\d{2}$/); // Minute
			expect(parts[5]).toMatch(/^\d{2}$/); // Second
		});
	});

	describe("一意性", () => {
		it("should_generate_unique_ids", () => {
			const ids = new Set<string>();
			for (let i = 0; i < 100; i++) {
				ids.add(createRunId());
			}
			// 100回実行で全て一意であるはず
			expect(ids.size).toBe(100);
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 生成されるIDは常に文字列である", () => {
			fc.assert(
				fc.property(fc.constant(null), () => {
					const result = createRunId();
					return typeof result === "string" && result.length > 0;
				}),
				{ numRuns: 100 },
			);
		});

		it("PBT: IDは正規表現パターンに一致する", () => {
			fc.assert(
				fc.property(fc.constant(null), () => {
					const result = createRunId();
					return /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-[a-f0-9]{6}$/.test(result);
				}),
				{ numRuns: 100 },
			);
		});
	});
});

// ============================================================================
// computeLiveWindow
// ============================================================================

describe("computeLiveWindow", () => {
	describe("正常系", () => {
		it("should_return_full_range_when_total_fits", () => {
			const result = computeLiveWindow(2, 5, 10);
			expect(result).toEqual({ start: 0, end: 5 });
		});

		it("should_return_full_range_when_total_equals_maxRows", () => {
			const result = computeLiveWindow(2, 10, 10);
			expect(result).toEqual({ start: 0, end: 10 });
		});

		it("should_center_cursor_when_possible", () => {
			const result = computeLiveWindow(5, 20, 10);
			expect(result.start).toBe(0);
			expect(result.end).toBe(10);
		});

		it("should_adjust_window_for_cursor_at_end", () => {
			const result = computeLiveWindow(18, 20, 10);
			// total=20, maxRows=10, cursor=18
			// clampedCursor=18, start=Math.max(0, Math.min(10, 18-9))=9, end=Math.min(20, 9+10)=19
			expect(result.start).toBe(9);
			expect(result.end).toBe(19);
		});

		it("should_adjust_window_for_cursor_at_start", () => {
			const result = computeLiveWindow(0, 20, 10);
			expect(result.start).toBe(0);
			expect(result.end).toBe(10);
		});

		it("should_handle_window_size_larger_than_cursor", () => {
			const result = computeLiveWindow(2, 10, 10);
			expect(result.start).toBe(0);
			expect(result.end).toBe(10);
		});
	});

	describe("境界条件", () => {
		it("should_handle_zero_cursor", () => {
			const result = computeLiveWindow(0, 100, 10);
			expect(result.start).toBe(0);
			expect(result.end).toBe(10);
		});

		it("should_handle_cursor_at_last_index", () => {
			const result = computeLiveWindow(99, 100, 10);
			expect(result.start).toBe(90);
			expect(result.end).toBe(100);
		});

		it("should_handle_maxRows_greater_than_total", () => {
			const result = computeLiveWindow(2, 5, 100);
			expect(result.start).toBe(0);
			expect(result.end).toBe(5);
		});

		it("should_handle_maxRows_equals_total", () => {
			const result = computeLiveWindow(2, 10, 10);
			expect(result.start).toBe(0);
			expect(result.end).toBe(10);
		});

		it("should_handle_maxRows_of_1", () => {
			const result = computeLiveWindow(5, 10, 1);
			expect(result.start).toBe(5);
			expect(result.end).toBe(6);
		});

		it("should_handle_total_of_1", () => {
			const result = computeLiveWindow(0, 1, 10);
			expect(result.start).toBe(0);
			expect(result.end).toBe(1);
		});

		it("should_handle_empty_list", () => {
			const result = computeLiveWindow(0, 0, 10);
			expect(result.start).toBe(0);
			expect(result.end).toBe(0);
		});
	});

	describe("異常系", () => {
		it("should_clamp_negative_cursor", () => {
			const result = computeLiveWindow(-5, 10, 5);
			expect(result.start).toBe(0);
			expect(result.end).toBe(5);
		});

		it("should_clamp_cursor_beyond_total", () => {
			const result = computeLiveWindow(100, 10, 5);
			expect(result.start).toBe(5);
			expect(result.end).toBe(10);
		});
	});

	describe("不変条件", () => {
		it("should_always_return_start_ge_0", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: -100, max: 100 }),
					fc.integer({ min: 0, max: 100 }),
					fc.integer({ min: 1, max: 50 }),
					(cursor, total, maxRows) => {
						const result = computeLiveWindow(cursor, total, maxRows);
						return result.start >= 0;
					},
				),
				{ numRuns: 100 },
			);
		});

		it("should_always_return_start_le_end", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: -100, max: 100 }),
					fc.integer({ min: 0, max: 100 }),
					fc.integer({ min: 1, max: 50 }),
					(cursor, total, maxRows) => {
						const result = computeLiveWindow(cursor, total, maxRows);
						return result.start <= result.end;
					},
				),
				{ numRuns: 100 },
			);
		});

		it("should_always_return_end_le_total", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: -100, max: 100 }),
					fc.integer({ min: 0, max: 100 }),
					fc.integer({ min: 1, max: 50 }),
					(cursor, total, maxRows) => {
						const result = computeLiveWindow(cursor, total, maxRows);
						return result.end <= total;
					},
				),
				{ numRuns: 100 },
			);
		});

		it("should_always_return_window_size_le_maxRows", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: -100, max: 100 }),
					fc.integer({ min: 0, max: 100 }),
					fc.integer({ min: 1, max: 50 }),
					(cursor, total, maxRows) => {
						const result = computeLiveWindow(cursor, total, maxRows);
						const windowSize = result.end - result.start;
						return windowSize <= maxRows;
					},
				),
				{ numRuns: 100 },
			);
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 結果は常に整合性のある範囲を返す", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: -100, max: 100 }),
					fc.integer({ min: 0, max: 100 }),
					fc.integer({ min: 1, max: 50 }),
					(cursor, total, maxRows) => {
						const result = computeLiveWindow(cursor, total, maxRows);

						// 全ての不変条件を検証
						const allInvariants = [
							result.start >= 0,
							result.start <= result.end,
							result.end <= total,
							result.end - result.start <= maxRows,
						];
						return allInvariants.every((v) => v === true);
					},
				),
				{ numRuns: 1000 },
			);
		});

		it("PBT: カーソルは常にウィンドウ内に含まれる", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 0, max: 99 }),
					fc.integer({ min: 1, max: 100 }),
					fc.integer({ min: 1, max: 50 }),
					(cursor, total, maxRows) => {
						const result = computeLiveWindow(cursor, total, maxRows);
						const clampedCursor = Math.max(0, Math.min(total - 1, cursor));
						return clampedCursor >= result.start && clampedCursor < result.end;
					},
				),
				{ numRuns: 500 },
			);
		});

		it("PBT: total=0の場合は常に{0,0}を返す", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: -100, max: 100 }),
					fc.integer({ min: 1, max: 50 }),
					(cursor, maxRows) => {
						const result = computeLiveWindow(cursor, 0, maxRows);
						return result.start === 0 && result.end === 0;
					},
				),
				{ numRuns: 100 },
			);
		});
	});
});
