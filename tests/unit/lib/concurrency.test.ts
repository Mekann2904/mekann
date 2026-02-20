/**
 * @file .pi/lib/concurrency.ts の単体テスト
 * @description 並列実行数制限ユーティリティのテスト
 * @testFramework vitest
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import {
  runWithConcurrencyLimit,
  type ConcurrencyRunOptions,
} from "@lib/concurrency";

// ============================================================================
// runWithConcurrencyLimit
// ============================================================================

describe("runWithConcurrencyLimit", () => {
  describe("正常系", () => {
    it("should_return_empty_array_for_empty_input", async () => {
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
      const worker = vi.fn(async (item: number) => item * 2);

      // Act
      const result = await runWithConcurrencyLimit(items, 2, worker);

      // Assert
      expect(result).toEqual([2]);
      expect(worker).toHaveBeenCalledTimes(1);
    });

    it("should_process_multiple_items_in_order", async () => {
      // Arrange
      const items = [1, 2, 3, 4, 5];
      const worker = vi.fn(async (item: number) => item * 2);

      // Act
      const result = await runWithConcurrencyLimit(items, 2, worker);

      // Assert
      expect(result).toEqual([2, 4, 6, 8, 10]);
      expect(worker).toHaveBeenCalledTimes(5);
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
      const result = await runWithConcurrencyLimit(items, 2, worker);

      // Assert
      // 結果の順序は入力順と一致する
      expect(result).toEqual([0, 1, 2]);
      // インデックスは0, 1, 2のいずれかで呼ばれる
      expect(indices.sort()).toEqual([0, 1, 2]);
    });

    it("should_return_results_in_input_order", async () => {
      // Arrange
      const items = [100, 50, 200, 10];
      // 処理時間が入力順と逆になるように遅延を設定
      const worker = vi.fn(async (item: number) => {
        await new Promise((resolve) => setTimeout(resolve, item));
        return item;
      });

      // Act
      const result = await runWithConcurrencyLimit(items, 4, worker);

      // Assert
      // 結果は入力順（100, 50, 200, 10）と一致する
      expect(result).toEqual([100, 50, 200, 10]);
    });
  });

  describe("並列数制限", () => {
    it("should_respect_limit_of_1", async () => {
      // Arrange
      const items = [1, 2, 3];
      let concurrentCount = 0;
      let maxConcurrent = 0;
      const worker = vi.fn(async (item: number) => {
        concurrentCount++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCount);
        await new Promise((resolve) => setTimeout(resolve, 10));
        concurrentCount--;
        return item;
      });

      // Act
      await runWithConcurrencyLimit(items, 1, worker);

      // Assert
      expect(maxConcurrent).toBe(1);
    });

    it("should_respect_limit_of_2", async () => {
      // Arrange
      const items = [1, 2, 3, 4, 5];
      let concurrentCount = 0;
      let maxConcurrent = 0;
      const worker = vi.fn(async (item: number) => {
        concurrentCount++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCount);
        await new Promise((resolve) => setTimeout(resolve, 10));
        concurrentCount--;
        return item;
      });

      // Act
      await runWithConcurrencyLimit(items, 2, worker);

      // Assert
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    it("should_not_exceed_item_count_as_limit", async () => {
      // Arrange
      const items = [1, 2];
      let concurrentCount = 0;
      let maxConcurrent = 0;
      const worker = vi.fn(async (item: number) => {
        concurrentCount++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCount);
        await new Promise((resolve) => setTimeout(resolve, 10));
        concurrentCount--;
        return item;
      });

      // Act - limit = 10, items = 2
      await runWithConcurrencyLimit(items, 10, worker);

      // Assert - 同時実行数は2を超えない
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });

  describe("limit正規化", () => {
    it("should_normalize_NaN_limit_to_1", async () => {
      // Arrange
      const items = [1, 2, 3];
      const worker = vi.fn(async (item: number) => item);

      // Act
      const result = await runWithConcurrencyLimit(items, NaN, worker);

      // Assert
      expect(result).toEqual([1, 2, 3]);
    });

    it("should_normalize_Infinity_limit_to_item_count", async () => {
      // Arrange
      const items = [1, 2, 3];
      const worker = vi.fn(async (item: number) => item);

      // Act
      const result = await runWithConcurrencyLimit(items, Infinity, worker);

      // Assert
      expect(result).toEqual([1, 2, 3]);
    });

    it("should_normalize_negative_limit_to_1", async () => {
      // Arrange
      const items = [1, 2, 3];
      const worker = vi.fn(async (item: number) => item);

      // Act
      const result = await runWithConcurrencyLimit(items, -5, worker);

      // Assert
      expect(result).toEqual([1, 2, 3]);
    });

    it("should_normalize_zero_limit_to_1", async () => {
      // Arrange
      const items = [1, 2, 3];
      const worker = vi.fn(async (item: number) => item);

      // Act
      const result = await runWithConcurrencyLimit(items, 0, worker);

      // Assert
      expect(result).toEqual([1, 2, 3]);
    });

    it("should_truncate_floating_point_limit", async () => {
      // Arrange
      const items = [1, 2, 3];
      const worker = vi.fn(async (item: number) => item);

      // Act
      const result = await runWithConcurrencyLimit(items, 2.9, worker);

      // Assert - 2.9 は 2 に切り捨て
      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe("AbortSignal", () => {
    it("should_pass_effective_signal_to_worker", async () => {
      const items = [1];
      let receivedSignal: AbortSignal | undefined;
      const worker = vi.fn(async (_item: number, _index: number, signal?: AbortSignal) => {
        receivedSignal = signal;
        return 1;
      });

      await runWithConcurrencyLimit(items, 1, worker);

      expect(receivedSignal).toBeInstanceOf(AbortSignal);
      expect(receivedSignal?.aborted).toBe(false);
    });

    it("should_throw_when_signal_already_aborted", async () => {
      // Arrange
      const items = [1, 2, 3];
      const controller = new AbortController();
      controller.abort();
      const worker = vi.fn(async (item: number) => item);

      // Act & Assert
      await expect(
        runWithConcurrencyLimit(items, 2, worker, { signal: controller.signal })
      ).rejects.toThrow("concurrency pool aborted");
    });

    it("should_stop_processing_when_aborted", async () => {
      // Arrange
      const items = [1, 2, 3, 4, 5];
      const controller = new AbortController();
      let callCount = 0;
      
      const worker = vi.fn(async (item: number) => {
        callCount++;
        if (item === 2) {
          controller.abort();
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
        return item;
      });

      // Act & Assert
      await expect(
        runWithConcurrencyLimit(items, 1, worker, { signal: controller.signal })
      ).rejects.toThrow("concurrency pool aborted");
      
      // 中断後は全アイテムが処理されない
      expect(callCount).toBeLessThan(items.length);
    });

    it("should_propagate_abort_to_sibling_workers_on_error", async () => {
      const items = [1, 2, 3];
      let abortedSeen = 0;

      const worker = vi.fn(async (item: number, _index: number, signal?: AbortSignal) => {
        if (item === 1) {
          throw new Error("boom");
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
        if (signal?.aborted) {
          abortedSeen += 1;
        }
        return item;
      });

      await expect(runWithConcurrencyLimit(items, 3, worker)).rejects.toThrow("boom");
      expect(abortedSeen).toBeGreaterThan(0);
    });

    it("should_allow_opt_out_of_abort_on_error", async () => {
      const items = [1, 2, 3];
      let abortedSeen = 0;
      let completedWorkers = 0;

      const worker = vi.fn(async (item: number, _index: number, signal?: AbortSignal) => {
        if (item === 1) {
          throw new Error("boom");
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (signal?.aborted) {
          abortedSeen += 1;
        }
        completedWorkers += 1;
        return item;
      });

      await expect(
        runWithConcurrencyLimit(items, 3, worker, { abortOnError: false }),
      ).rejects.toThrow("boom");
      expect(abortedSeen).toBe(0);
      expect(completedWorkers).toBe(2);
    });
  });

  describe("エラーハンドリング", () => {
    it("should_throw_first_error_encountered", async () => {
      // Arrange
      const items = [1, 2, 3];
      const worker = vi.fn(async (item: number) => {
        if (item === 2) {
          throw new Error("Error at item 2");
        }
        return item;
      });

      // Act & Assert
      await expect(
        runWithConcurrencyLimit(items, 1, worker)
      ).rejects.toThrow("Error at item 2");
    });

    it("should_throw_error_even_with_parallel_workers", async () => {
      // Arrange
      const items = [1, 2, 3, 4];
      const worker = vi.fn(async (item: number) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (item === 3) {
          throw new Error("Failed at 3");
        }
        return item;
      });

      // Act & Assert
      await expect(
        runWithConcurrencyLimit(items, 2, worker)
      ).rejects.toThrow("Failed at 3");
    });

    it("should_preserve_error_type", async () => {
      // Arrange
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = "CustomError";
        }
      }
      
      const items = [1, 2];
      const worker = vi.fn(async () => {
        throw new CustomError("Custom failure");
      });

      // Act & Assert
      await expect(
        runWithConcurrencyLimit(items, 1, worker)
      ).rejects.toThrow(CustomError);
    });
  });

  describe("型安全性", () => {
    it("should_preserve_item_type_in_result", async () => {
      // Arrange
      interface TestItem {
        id: number;
        name: string;
      }
      
      const items: TestItem[] = [
        { id: 1, name: "a" },
        { id: 2, name: "b" },
      ];
      
      const worker = async (item: TestItem): Promise<string> => item.name;

      // Act
      const result = await runWithConcurrencyLimit(items, 2, worker);

      // Assert
      expect(result).toEqual(["a", "b"]);
    });

    it("should_work_with_different_return_type", async () => {
      // Arrange
      const items = [1, 2, 3];
      const worker = async (item: number): Promise<{ doubled: number }> => ({
        doubled: item * 2,
      });

      // Act
      const result = await runWithConcurrencyLimit(items, 2, worker);

      // Assert
      expect(result).toEqual([
        { doubled: 2 },
        { doubled: 4 },
        { doubled: 6 },
      ]);
    });
  });

  describe("境界値", () => {
    it("should_handle_large_array", async () => {
      // Arrange
      const items = Array.from({ length: 100 }, (_, i) => i);
      const worker = vi.fn(async (item: number) => item * 2);

      // Act
      const result = await runWithConcurrencyLimit(items, 10, worker);

      // Assert
      expect(result.length).toBe(100);
      expect(result[0]).toBe(0);
      expect(result[99]).toBe(198);
    });

    it("should_handle_limit_greater_than_items", async () => {
      // Arrange
      const items = [1, 2];
      const worker = vi.fn(async (item: number) => item);

      // Act
      const result = await runWithConcurrencyLimit(items, 100, worker);

      // Assert
      expect(result).toEqual([1, 2]);
    });

    it("should_handle_single_item_with_limit_1", async () => {
      // Arrange
      const items = [42];
      const worker = vi.fn(async (item: number) => item);

      // Act
      const result = await runWithConcurrencyLimit(items, 1, worker);

      // Assert
      expect(result).toEqual([42]);
    });
  });

  describe("並列数制限の振る舞い", () => {
    it("should_never_exceed_specified_concurrency_limit", async () => {
      // Arrange
      const items = [1, 2, 3, 4, 5, 6, 7, 8];
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const worker = async (item: number) => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise((resolve) => setTimeout(resolve, 10));
        currentConcurrent--;
        return item;
      };

      // Act - limit=3で実行
      await runWithConcurrencyLimit(items, 3, worker);

      // Assert - 最大並列数がlimitを超えない
      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });

    it("should_use_full_concurrency_when_limit_exceeds_items", async () => {
      // Arrange
      const items = [1, 2];
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const worker = async (item: number) => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise((resolve) => setTimeout(resolve, 10));
        currentConcurrent--;
        return item;
      };

      // Act - limit=10で実行（itemsより多い）
      await runWithConcurrencyLimit(items, 10, worker);

      // Assert - 最大並列数はitems数と同じ
      expect(maxConcurrent).toBe(2);
    });
  });
});

// ============================================================================
// プロパティベーステスト (Property-Based Tests)
// ============================================================================

/**
 * 数値アイテムのArbitrary
 */
const arbNumberItems: fc.Arbitrary<number[]> = fc.array(fc.integer({ min: 0, max: 100 }), {
  maxLength: 20,
});

/**
 * limitのArbitrary（正規化前の値を含む）
 */
const arbLimit: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: -10, max: 100 }), // 通常値 + 負の値
  fc.constant(NaN),
  fc.constant(Infinity),
  fc.constant(-Infinity),
  fc.double({ min: 0.1, max: 10.9 }) // 小数
);

describe("プロパティベーステスト: runWithConcurrencyLimit", () => {
  describe("結果順序の保存", () => {
    // 不変条件: 結果配列の順序は入力順と一致する
    it("PBT: 結果配列の順序は入力順と一致する", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer({ min: 0, max: 100 }), { maxLength: 10 }),
          fc.integer({ min: 1, max: 5 }),
          async (items, limit) => {
            // Arrange
            const worker = async (item: number) => item * 2;

            // Act
            const result = await runWithConcurrencyLimit(items, limit, worker);

            // Assert
            expect(result.length).toBe(items.length);
            for (let i = 0; i < items.length; i++) {
              expect(result[i]).toBe(items[i] * 2);
            }
          }
        )
      );
    });

    // 不変条件: 結果配列の長さは入力と同じ
    it("PBT: 結果配列の長さは入力と同じ", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ maxLength: 10 }), { maxLength: 15 }),
          fc.integer({ min: 1, max: 10 }),
          async (items, limit) => {
            // Arrange
            const worker = async (item: string) => item.toUpperCase();

            // Act
            const result = await runWithConcurrencyLimit(items, limit, worker);

            // Assert
            expect(result.length).toBe(items.length);
          }
        )
      );
    });
  });

  describe("limit正規化の不変条件", () => {
    // 不変条件: 空配列は常に空配列を返す
    it("PBT: 空配列は常に空配列を返す", async () => {
      await fc.assert(
        fc.asyncProperty(arbLimit, async (limit) => {
          // Arrange
          const items: number[] = [];
          const worker = vi.fn();

          // Act
          const result = await runWithConcurrencyLimit(items, limit, worker);

          // Assert
          expect(result).toEqual([]);
          expect(worker).not.toHaveBeenCalled();
        })
      );
    });

    // 不変条件: NaN limitは1として扱われる
    it("PBT: NaN limitでも処理は完了する", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer({ min: 0, max: 10 }), { minLength: 1, maxLength: 5 }),
          async (items) => {
            // Arrange
            const worker = async (item: number) => item;

            // Act
            const result = await runWithConcurrencyLimit(items, NaN, worker);

            // Assert
            expect(result.length).toBe(items.length);
          }
        )
      );
    });

    // 不変条件: 負のlimitは1として扱われる
    it("PBT: 負のlimitでも処理は完了する", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer({ min: 0, max: 10 }), { minLength: 1, maxLength: 5 }),
          fc.integer({ min: -100, max: -1 }),
          async (items, negativeLimit) => {
            // Arrange
            const worker = async (item: number) => item;

            // Act
            const result = await runWithConcurrencyLimit(items, negativeLimit, worker);

            // Assert
            expect(result.length).toBe(items.length);
          }
        )
      );
    });

    // 不変条件: Infinity limitはitems.lengthとして扱われる
    it("PBT: Infinity limitでも処理は完了する", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer({ min: 0, max: 10 }), { minLength: 1, maxLength: 5 }),
          async (items) => {
            // Arrange
            const worker = async (item: number) => item;

            // Act
            const result = await runWithConcurrencyLimit(items, Infinity, worker);

            // Assert
            expect(result.length).toBe(items.length);
          }
        )
      );
    });

    // 不変条件: 小数limitは整数に切り捨てられる
    it("PBT: 小数limitは整数に切り捨てられる", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer({ min: 0, max: 10 }), { minLength: 1, maxLength: 5 }),
          fc.double({ min: 1.1, max: 4.9, noNaN: true }),
          async (items, floatLimit) => {
            // Arrange
            const worker = async (item: number) => item;

            // Act
            const result = await runWithConcurrencyLimit(items, floatLimit, worker);

            // Assert
            expect(result.length).toBe(items.length);
          }
        )
      );
    });
  });

  describe("決定性", () => {
    // 決定性: 同じ入力で同じ結果
    it("PBT: 同じ入力で同じ結果", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer({ min: 0, max: 50 }), { maxLength: 10 }),
          fc.integer({ min: 1, max: 5 }),
          async (items, limit) => {
            // Arrange
            const worker = async (item: number) => item * 2;

            // Act
            const result1 = await runWithConcurrencyLimit(items, limit, worker);
            const result2 = await runWithConcurrencyLimit(items, limit, worker);

            // Assert
            expect(result1).toEqual(result2);
          }
        )
      );
    });
  });

  describe("型安全性", () => {
    // 型安全性: 異なる型の変換でも正しく動作
    it("PBT: 異なる型の変換が正しく動作", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer({ min: 0, max: 100 }), { maxLength: 5 }),
          fc.integer({ min: 1, max: 3 }),
          async (items, limit) => {
            // Arrange
            const worker = async (item: number): Promise<{ value: number; str: string }> => ({
              value: item,
              str: String(item),
            });

            // Act
            const result = await runWithConcurrencyLimit(items, limit, worker);

            // Assert
            expect(result.length).toBe(items.length);
            for (let i = 0; i < items.length; i++) {
              expect(result[i].value).toBe(items[i]);
              expect(result[i].str).toBe(String(items[i]));
            }
          }
        )
      );
    });
  });

  describe("インデックス引数", () => {
    // 不変条件: workerに渡されるindexは常に正しい
    it("PBT: workerに渡されるindexは常に正しい", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 1, maxLength: 5 }), { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 1, max: 5 }),
          async (items, limit) => {
            // Arrange
            const indices: number[] = [];
            const worker = async (_item: string, index: number) => {
              indices.push(index);
              return index;
            };

            // Act
            const result = await runWithConcurrencyLimit(items, limit, worker);

            // Assert: 結果は0, 1, 2, ... (入力順)
            expect(result).toEqual(items.map((_, i) => i));
            // すべてのインデックスが呼ばれている
            expect(indices.sort()).toEqual(items.map((_, i) => i));
          }
        )
      );
    });
  });

  describe("エラー伝播", () => {
    // 不変条件: エラーが発生した場合、結果は返されない
    it("PBT: エラーが発生した場合、例外がスローされる", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 5 }),
          fc.integer({ min: 1, max: 100 }),
          fc.integer({ min: 1, max: 5 }),
          async (items, errorOnValue, limit) => {
            // Arrange
            const errorMessage = `Error at ${errorOnValue}`;
            const worker = async (item: number) => {
              if (item === errorOnValue) {
                throw new Error(errorMessage);
              }
              return item;
            };

            // Act & Assert
            const hasErrorItem = items.includes(errorOnValue);
            if (hasErrorItem) {
              await expect(runWithConcurrencyLimit(items, limit, worker)).rejects.toThrow();
            } else {
              const result = await runWithConcurrencyLimit(items, limit, worker);
              expect(result.length).toBe(items.length);
            }
          }
        )
      );
    });
  });
});
