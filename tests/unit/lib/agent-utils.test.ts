/**
 * agent-utils.ts 単体テスト
 * カバレッジ: createRunId, computeLiveWindow
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
} from "vitest";
import * as fc from "fast-check";
import { createRunId, computeLiveWindow } from "../../../.pi/lib/agent-utils.js";

// ============================================================================
// createRunId テスト
// ============================================================================

describe("createRunId", () => {
  describe("正常ケース", () => {
    it("一意なIDを生成する", () => {
      const id1 = createRunId();
      const id2 = createRunId();
      expect(id1).not.toBe(id2);
    });

    it("文字列を返す", () => {
      const id = createRunId();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });

    it("正しい形式を持つ", () => {
      const id = createRunId();
      // 形式: YYYY-MM-DD-HH-MM-SS-xxxxxx (xxxxxx is hex suffix)
      expect(id).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-[a-f0-9]{6}$/);
    });

    it("日付部分が現在日時と一致する", () => {
      const now = new Date();
      const id = createRunId();
      const expectedDate = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
      ].join("-");
      expect(id.startsWith(expectedDate)).toBe(true);
    });
  });

  describe("IDの一意性", () => {
    it("100回生成で全て一意", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(createRunId());
      }
      expect(ids.size).toBe(100);
    });

    it("短時間での連続生成でも一意", () => {
      const ids = Array.from({ length: 50 }, () => createRunId());
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(50);
    });
  });

  describe("フォーマット詳細", () => {
    it("タイムスタンプ部分が正しい形式", () => {
      const id = createRunId();
      const parts = id.split("-");
      expect(parts).toHaveLength(7);
      expect(parts.slice(0, 6).join("-")).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/);
      expect(parts[6]).toMatch(/^[a-f0-9]{6}$/);
    });

    it("サフィックスが6文字の16進数", () => {
      const id = createRunId();
      const suffix = id.split("-")[6];
      expect(suffix).toMatch(/^[a-f0-9]{6}$/);
    });
  });
});

// ============================================================================
// computeLiveWindow テスト
// ============================================================================

describe("computeLiveWindow", () => {
  describe("基本ケース", () => {
    it("total <= maxRows_全範囲を返す", () => {
      const result = computeLiveWindow(0, 10, 20);
      expect(result).toEqual({ start: 0, end: 10 });
    });

    it("total === maxRows_全範囲を返す", () => {
      const result = computeLiveWindow(5, 10, 10);
      expect(result).toEqual({ start: 0, end: 10 });
    });

    it("total > maxRows_ウィンドウを返す", () => {
      const result = computeLiveWindow(5, 20, 10);
      expect(result.end - result.start).toBe(10);
    });
  });

  describe("カーソル位置", () => {
    it("先頭付近_先頭から表示", () => {
      const result = computeLiveWindow(0, 20, 10);
      expect(result.start).toBe(0);
      expect(result.end).toBe(10);
    });

    it("中央_中央付近を表示", () => {
      const result = computeLiveWindow(10, 20, 10);
      expect(result.start).toBe(1);
      expect(result.end).toBe(11);
    });

    it("末尾付近_末尾を表示", () => {
      const result = computeLiveWindow(19, 20, 10);
      expect(result.start).toBe(10);
      expect(result.end).toBe(20);
    });

    it("末尾_末尾を表示", () => {
      const result = computeLiveWindow(19, 20, 10);
      expect(result.end).toBe(20);
      expect(result.end - result.start).toBe(10);
    });
  });

  describe("境界値", () => {
    it("cursor = 0", () => {
      const result = computeLiveWindow(0, 100, 10);
      expect(result.start).toBe(0);
      expect(result.end).toBe(10);
    });

    it("cursor = total - 1", () => {
      const result = computeLiveWindow(99, 100, 10);
      expect(result.end).toBe(100);
      expect(result.start).toBe(90);
    });

    it("total = 0", () => {
      const result = computeLiveWindow(0, 0, 10);
      expect(result).toEqual({ start: 0, end: 0 });
    });

    it("total = 1", () => {
      const result = computeLiveWindow(0, 1, 10);
      expect(result).toEqual({ start: 0, end: 1 });
    });

    it("maxRows = 1", () => {
      const result = computeLiveWindow(5, 20, 1);
      expect(result.end - result.start).toBe(1);
      expect(result.start).toBeLessThanOrEqual(5);
      expect(result.end).toBeGreaterThan(5);
    });
  });

  describe("カーソルのクランプ", () => {
    it("cursor < 0_0にクランプ", () => {
      const result = computeLiveWindow(-5, 20, 10);
      expect(result.start).toBe(0);
      expect(result.end).toBe(10);
    });

    it("cursor >= total_total-1にクランプ", () => {
      const result = computeLiveWindow(100, 20, 10);
      expect(result.end).toBe(20);
    });

    it("cursor大幅超過_正しくクランプ", () => {
      const result = computeLiveWindow(1000, 20, 10);
      expect(result.end).toBe(20);
      expect(result.start).toBe(10);
    });
  });

  describe("ウィンドウの不変条件", () => {
    it("start >= 0", () => {
      const cases = [
        [0, 100, 10],
        [50, 100, 10],
        [99, 100, 10],
        [-10, 100, 10],
        [100, 100, 10],
      ] as const;

      cases.forEach(([cursor, total, maxRows]) => {
        const result = computeLiveWindow(cursor, total, maxRows);
        expect(result.start).toBeGreaterThanOrEqual(0);
      });
    });

    it("end <= total", () => {
      const cases = [
        [0, 100, 10],
        [50, 100, 10],
        [99, 100, 10],
        [100, 100, 10],
        [1000, 100, 10],
      ] as const;

      cases.forEach(([cursor, total, maxRows]) => {
        const result = computeLiveWindow(cursor, total, maxRows);
        expect(result.end).toBeLessThanOrEqual(total);
      });
    });

    it("end - start <= maxRows (total > maxRows)", () => {
      const cases = [
        [0, 100, 10],
        [25, 100, 10],
        [50, 100, 10],
        [75, 100, 10],
        [99, 100, 10],
      ] as const;

      cases.forEach(([cursor, total, maxRows]) => {
        const result = computeLiveWindow(cursor, total, maxRows);
        expect(result.end - result.start).toBeLessThanOrEqual(maxRows);
      });
    });

    it("cursorがウィンドウ内にある", () => {
      const cases = [
        [0, 100, 10],
        [25, 100, 10],
        [50, 100, 10],
        [75, 100, 10],
        [99, 100, 10],
      ] as const;

      cases.forEach(([cursor, total, maxRows]) => {
        const result = computeLiveWindow(cursor, total, maxRows);
        const clampedCursor = Math.max(0, Math.min(total - 1, cursor));
        // クランプされたカーソルがウィンドウ内にあることを確認
        expect(clampedCursor).toBeGreaterThanOrEqual(result.start);
        expect(clampedCursor).toBeLessThan(result.end);
      });
    });
  });

  describe("エッジケース", () => {
    it("maxRows > total_全範囲", () => {
      const result = computeLiveWindow(5, 10, 100);
      expect(result).toEqual({ start: 0, end: 10 });
    });

    it("maxRows = total_全範囲", () => {
      const result = computeLiveWindow(5, 10, 10);
      expect(result).toEqual({ start: 0, end: 10 });
    });

    it("大きなtotal", () => {
      const result = computeLiveWindow(500, 1000, 10);
      expect(result.end - result.start).toBe(10);
      expect(result.start).toBeGreaterThanOrEqual(0);
      expect(result.end).toBeLessThanOrEqual(1000);
    });

    it("maxRows = 2", () => {
      const result = computeLiveWindow(5, 20, 2);
      expect(result.end - result.start).toBe(2);
    });
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  describe("createRunId", () => {
    it("生成されたIDは常に正しい形式", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 100 }), (seed) => {
          const id = createRunId();
          expect(id).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-[a-f0-9]{6}$/);
        })
      );
    });

    it("複数回の呼び出しで常に一意", () => {
      fc.assert(
        fc.property(fc.integer({ min: 2, max: 50 }), (count) => {
          const ids = new Set<string>();
          for (let i = 0; i < count; i++) {
            ids.add(createRunId());
          }
          expect(ids.size).toBe(count);
        })
      );
    });
  });

  describe("computeLiveWindow", () => {
    it("不変条件: start >= 0 && end <= total && start <= end", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),  // cursor
          fc.integer({ min: 0, max: 1000 }),  // total
          fc.integer({ min: 1, max: 100 }),   // maxRows
          (cursor, total, maxRows) => {
            const result = computeLiveWindow(cursor, total, maxRows);

            // 不変条件
            expect(result.start).toBeGreaterThanOrEqual(0);
            expect(result.end).toBeGreaterThanOrEqual(result.start);
            expect(result.end).toBeLessThanOrEqual(total);
          }
        )
      );
    });

    it("ウィンドウサイズは maxRows 以下", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -100, max: 200 }),
          fc.integer({ min: 0, max: 200 }),
          fc.integer({ min: 1, max: 50 }),
          (cursor, total, maxRows) => {
            const result = computeLiveWindow(cursor, total, maxRows);
            expect(result.end - result.start).toBeLessThanOrEqual(maxRows);
          }
        )
      );
    });

    it("total <= maxRows の場合、全範囲を返す", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 50 }),
          fc.integer({ min: 1, max: 50 }).filter(t => t <= 10),
          fc.integer({ min: 10, max: 100 }),
          (cursor, total, maxRows) => {
            fc.pre(total <= maxRows);
            const result = computeLiveWindow(cursor, total, maxRows);
            expect(result).toEqual({ start: 0, end: total });
          }
        )
      );
    });

    it("total > 0 の場合、ウィンドウサイズ > 0", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -100, max: 200 }),
          fc.integer({ min: 1, max: 200 }),
          fc.integer({ min: 1, max: 50 }),
          (cursor, total, maxRows) => {
            const result = computeLiveWindow(cursor, total, maxRows);
            // total > 0 なら何か表示される
            if (total > 0) {
              expect(result.end).toBeGreaterThan(0);
            }
          }
        )
      );
    });

    it("クランプされたカーソルがウィンドウ内にある", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -100, max: 200 }),
          fc.integer({ min: 1, max: 200 }),
          fc.integer({ min: 1, max: 50 }),
          (cursor, total, maxRows) => {
            const result = computeLiveWindow(cursor, total, maxRows);
            if (total > 0) {
              const clampedCursor = Math.max(0, Math.min(total - 1, cursor));
              // カーソルが範囲内にあることを確認
              expect(clampedCursor).toBeGreaterThanOrEqual(result.start);
              expect(clampedCursor).toBeLessThanOrEqual(result.end);
            }
          }
        )
      );
    });
  });
});
