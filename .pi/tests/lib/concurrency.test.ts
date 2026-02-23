/**
 * @file .pi/lib/concurrency.ts の単体テスト
 * @description 並列実行プールのテスト
 * @testFramework vitest + fast-check
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";

// モジュールをインポート
import {
	runWithConcurrencyLimit,
	type ConcurrencyRunOptions,
} from "../../lib/concurrency.js";

// ============================================================================
// runWithConcurrencyLimit
// ============================================================================

describe("runWithConcurrencyLimit", () => {
	describe("正常系", () => {
		it("should_process_empty_array", async () => {
			// Arrange
			const items: number[] = [];
			const worker = vi.fn();

			// Act
			const result = await runWithConcurrencyLimit(items, 2, worker);

			// Assert
			expect(result).toEqual([]);
			expect(worker).not.toHaveBeenCalled();
		});

		it("should_process_single_item", async () => {
			// Arrange
			const items = [1];
			const worker = vi.fn(async (n: number) => n * 2);

			// Act
			const result = await runWithConcurrencyLimit(items, 2, worker);

			// Assert
			expect(result).toEqual([2]);
			expect(worker).toHaveBeenCalledTimes(1);
		});

		it("should_process_multiple_items", async () => {
			// Arrange
			const items = [1, 2, 3, 4, 5];
			const worker = vi.fn(async (n: number) => n * 2);

			// Act
			const result = await runWithConcurrencyLimit(items, 2, worker);

			// Assert
			expect(result).toEqual([2, 4, 6, 8, 10]);
			expect(worker).toHaveBeenCalledTimes(5);
		});

		it("should_preserve_order", async () => {
			// Arrange: 遅延の異なる処理
			const items = [100, 50, 200, 10];
			const worker = vi.fn(async (delay: number) => {
				await new Promise((r) => setTimeout(r, delay));
				return delay;
			});

			// Act
			const result = await runWithConcurrencyLimit(items, 2, worker);

			// Assert: 結果の順序は入力と一致
			expect(result).toEqual([100, 50, 200, 10]);
		});

		it("should_pass_index_to_worker", async () => {
			// Arrange
			const items = ["a", "b", "c"];
			const indices: number[] = [];
			const worker = vi.fn(async (_item: string, index: number) => {
				indices.push(index);
				return index;
			});

			// Act
			await runWithConcurrencyLimit(items, 2, worker);

			// Assert: インデックスが渡される（順序は保証されない）
			expect(indices.sort()).toEqual([0, 1, 2]);
		});
	});

	describe("並列数制限", () => {
		it("should_respect_concurrency_limit", async () => {
			// Arrange
			const items = [1, 2, 3, 4, 5, 6];
			const maxConcurrent = { current: 0, observed: 0 };
			const worker = vi.fn(async () => {
				maxConcurrent.current++;
				maxConcurrent.observed = Math.max(
					maxConcurrent.observed,
					maxConcurrent.current,
				);
				await new Promise((r) => setTimeout(r, 10));
				maxConcurrent.current--;
			});

			// Act
			await runWithConcurrencyLimit(items, 2, worker);

			// Assert
			expect(maxConcurrent.observed).toBeLessThanOrEqual(2);
		});

		it("should_handle_limit_greater_than_items", async () => {
			// Arrange
			const items = [1, 2];
			const worker = vi.fn(async (n: number) => n * 2);

			// Act
			const result = await runWithConcurrencyLimit(items, 10, worker);

			// Assert
			expect(result).toEqual([2, 4]);
		});

		it("should_handle_limit_of_1", async () => {
			// Arrange
			const items = [1, 2, 3];
			const executionOrder: number[] = [];
			const worker = vi.fn(async (n: number) => {
				executionOrder.push(n);
				return n;
			});

			// Act
			const result = await runWithConcurrencyLimit(items, 1, worker);

			// Assert: 順次実行
			expect(executionOrder).toEqual([1, 2, 3]);
			expect(result).toEqual([1, 2, 3]);
		});
	});

	describe("limit正規化", () => {
		it("should_normalize_NaN_to_1", async () => {
			// Arrange
			const items = [1, 2, 3];
			const worker = vi.fn(async (n: number) => n);

			// Act
			const result = await runWithConcurrencyLimit(items, NaN, worker);

			// Assert: エラーなく完了
			expect(result).toEqual([1, 2, 3]);
		});

		it("should_normalize_Infinity_to_item_count", async () => {
			// Arrange
			const items = [1, 2, 3];
			const worker = vi.fn(async (n: number) => n);

			// Act
			const result = await runWithConcurrencyLimit(items, Infinity, worker);

			// Assert
			expect(result).toEqual([1, 2, 3]);
		});

		it("should_normalize_negative_to_1", async () => {
			// Arrange
			const items = [1, 2, 3];
			const worker = vi.fn(async (n: number) => n);

			// Act
			const result = await runWithConcurrencyLimit(items, -5, worker);

			// Assert
			expect(result).toEqual([1, 2, 3]);
		});

		it("should_normalize_zero_to_1", async () => {
			// Arrange
			const items = [1, 2, 3];
			const worker = vi.fn(async (n: number) => n);

			// Act
			const result = await runWithConcurrencyLimit(items, 0, worker);

			// Assert
			expect(result).toEqual([1, 2, 3]);
		});

		it("should_truncate_decimal_limit", async () => {
			// Arrange
			const items = [1, 2, 3];
			const worker = vi.fn(async (n: number) => n);

			// Act
			const result = await runWithConcurrencyLimit(items, 2.7, worker);

			// Assert
			expect(result).toEqual([1, 2, 3]);
		});
	});

	describe("エラーハンドリング", () => {
		it("should_throw_first_error", async () => {
			// Arrange
			const items = [1, 2, 3];
			const worker = vi.fn(async (n: number) => {
				if (n === 2) throw new Error("Error at 2");
				return n;
			});

			// Act/Assert
			await expect(runWithConcurrencyLimit(items, 2, worker)).rejects.toThrow(
				"Error at 2",
			);
		});

		it("should_abort_on_error_by_default", async () => {
			// Arrange
			const items = [1, 2, 3, 4, 5];
			const processedItems: number[] = [];
			const worker = vi.fn(async (n: number) => {
				processedItems.push(n);
				if (n === 2) throw new Error("Error at 2");
				await new Promise((r) => setTimeout(r, 50));
				return n;
			});

			// Act/Assert
			await expect(runWithConcurrencyLimit(items, 2, worker)).rejects.toThrow();

			// 全てのアイテムが処理されるわけではない（早期中止）
			// ただし、ワーカーは完了を待つため、既に開始したものは完了する
		});

		it("should_continue_on_error_with_abortOnError_false", async () => {
			// Arrange
			const items = [1, 2, 3, 4, 5];
			const worker = vi.fn(async (n: number) => {
				if (n === 2 || n === 4) throw new Error(`Error at ${n}`);
				return n;
			});
			const options: ConcurrencyRunOptions = { abortOnError: false };

			// Act/Assert
			await expect(
				runWithConcurrencyLimit(items, 2, worker, options),
			).rejects.toThrow();
		});
	});

	describe("AbortSignal", () => {
		it("should_abort_on_signal", async () => {
			// Arrange
			const controller = new AbortController();
			const items = [1, 2, 3, 4, 5];
			const processedItems: number[] = [];
			const worker = vi.fn(async (n: number) => {
				processedItems.push(n);
				await new Promise((r) => setTimeout(r, 50));
				return n;
			});

			// Act: 途中で中止
			setTimeout(() => controller.abort(), 60);

			// Assert
			await expect(
				runWithConcurrencyLimit(items, 1, worker, { signal: controller.signal }),
			).rejects.toThrow();
		});

		it("should_throw_immediately_if_already_aborted", async () => {
			// Arrange
			const controller = new AbortController();
			controller.abort();
			const items = [1, 2, 3];
			const worker = vi.fn(async (n: number) => n);

			// Act/Assert
			await expect(
				runWithConcurrencyLimit(items, 2, worker, { signal: controller.signal }),
			).rejects.toThrow();
		});
	});

	describe("境界条件", () => {
		it("should_handle_large_number_of_items", async () => {
			// Arrange
			const items = Array.from({ length: 100 }, (_, i) => i);
			const worker = vi.fn(async (n: number) => n * 2);

			// Act
			const result = await runWithConcurrencyLimit(items, 10, worker);

			// Assert
			expect(result).toHaveLength(100);
			expect(result[50]).toBe(100);
		});

		it("should_handle_slow_workers", async () => {
			// Arrange
			const items = [1, 2, 3];
			const worker = vi.fn(async (n: number) => {
				await new Promise((r) => setTimeout(r, 100));
				return n * 2;
			});

			// Act
			const startTime = Date.now();
			const result = await runWithConcurrencyLimit(items, 2, worker);
			const elapsed = Date.now() - startTime;

			// Assert
			expect(result).toEqual([2, 4, 6]);
			// 2つ並列で100ms + 1つが100ms = 約200ms
			expect(elapsed).toBeGreaterThanOrEqual(150);
		});

		it("should_handle_worker_returning_undefined", async () => {
			// Arrange
			const items = [1, 2, 3];
			const worker = vi.fn(async () => undefined);

			// Act
			const result = await runWithConcurrencyLimit(items, 2, worker);

			// Assert
			expect(result).toEqual([undefined, undefined, undefined]);
		});

		it("should_handle_worker_returning_promise_resolved_with_void", async () => {
			// Arrange
			const items = [1, 2, 3];
			const worker = vi.fn(async () => {});

			// Act
			const result = await runWithConcurrencyLimit(items, 2, worker);

			// Assert
			expect(result).toEqual([undefined, undefined, undefined]);
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 結果の配列長は入力と同じ", async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.array(fc.integer(), { maxLength: 20 }),
					fc.integer({ min: 1, max: 10 }),
					async (items, limit) => {
						const worker = async (n: number) => n * 2;
						const result = await runWithConcurrencyLimit(items, limit, worker);
						return result.length === items.length;
					},
				),
				{ numRuns: 30 },
			);
		});

		it("PBT: 各アイテムが1回ずつ処理される", async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.array(fc.integer(), { maxLength: 10 }),
					fc.integer({ min: 1, max: 5 }),
					async (items, limit) => {
						const processed = new Map<number, number>();
						const worker = async (n: number) => {
							processed.set(n, (processed.get(n) ?? 0) + 1);
							return n;
						};
						await runWithConcurrencyLimit(items, limit, worker);

						// 各アイテムがちょうど1回処理される
						return items.every((item) => processed.get(item) === 1);
					},
				),
				{ numRuns: 20 },
			);
		});

		it("PBT: 処理結果の順序は入力順序と一致", async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.array(fc.integer(), { maxLength: 15 }),
					fc.integer({ min: 1, max: 10 }),
					async (items, limit) => {
						const worker = async (n: number) => n * 2;
						const result = await runWithConcurrencyLimit(items, limit, worker);
						const expected = items.map((n) => n * 2);
						return JSON.stringify(result) === JSON.stringify(expected);
					},
				),
				{ numRuns: 20 },
			);
		});
	});
});
