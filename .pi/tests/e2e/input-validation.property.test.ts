/**
 * @abdd.meta
 * path: .pi/tests/e2e/input-validation.property.test.ts
 * role: 入力バリデーションのプロパティベーステスト
 * why: 入力データの不変条件を体系的に検証するため
 * related: .pi/lib/validation-utils.ts, .pi/lib/output-validation.ts
 * public_api: なし（テストファイル）
 * invariants: テストは冪等性を持つ、fast-checkによるランダム入力で検証
 * side_effects: なし（テスト実行環境でのみ動作）
 * failure_modes: テスト失敗時は詳細なエラーメッセージを出力
 * @abdd.explain
 * overview: fast-checkを使用したプロパティベーステスト
 * what_it_does:
 *   - ランダム入力によるバリデーションの検証
 *   - 不変条件のプロパティチェック
 *   - エッジケースの自動発見
 * why_it_exists:
 *   - 手動では見つけにくいエッジケースを発見するため
 *   - 入力バリデーションの完全性を保証するため
 * scope:
 *   in: fast-checkのArbitrary
 *   out: テスト結果（成功/失敗）
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ============================================================================
// テスト対象の関数（簡易版）
// ============================================================================

/**
 * タスク名のバリデーション
 * - 空文字は許可
 * - 最大10000文字
 * - 制御文字は除外される
 */
function validateTaskName(input: string): {
  valid: boolean;
  sanitized: string;
  error?: string;
} {
  // 長さチェック
  if (input.length > 10000) {
    return {
      valid: false,
      sanitized: "",
      error: "Task name too long",
    };
  }

  // 制御文字を除去
  const sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  return {
    valid: true,
    sanitized,
  };
}

/**
 * タイムアウト値の正規化
 * - 最小値: 100ms
 * - 最大値: 3600000ms (1時間)
 * - デフォルト: 30000ms
 */
function normalizeTimeout(input: number | undefined): number {
  const DEFAULT_TIMEOUT = 30000;
  const MIN_TIMEOUT = 100;
  const MAX_TIMEOUT = 3600000;

  if (input === undefined || input === null || isNaN(input)) {
    return DEFAULT_TIMEOUT;
  }

  return Math.max(MIN_TIMEOUT, Math.min(MAX_TIMEOUT, Math.floor(input)));
}

/**
 * 再試行回数の正規化
 * - 最小値: 0
 * - 最大値: 10
 * - デフォルト: 3
 */
function normalizeRetries(input: number | undefined): number {
  const DEFAULT_RETRIES = 3;
  const MIN_RETRIES = 0;
  const MAX_RETRIES = 10;

  if (input === undefined || input === null || isNaN(input)) {
    return DEFAULT_RETRIES;
  }

  return Math.max(MIN_RETRIES, Math.min(MAX_RETRIES, Math.floor(input)));
}

/**
 * JSONパース（安全版）
 */
function safeJsonParse(input: string): { success: boolean; data?: unknown; error?: string } {
  try {
    const data = JSON.parse(input);
    return { success: true, data };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト: 入力バリデーション", () => {
  // ==========================================================================
  // タスク名のバリデーション
  // ==========================================================================
  describe("validateTaskName", () => {
    it("任意の文字列入力に対して、結果は常に有効または明確なエラーを返す", () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = validateTaskName(input);

          // プロパティ1: 結果は常にvalidまたはerrorを持つ
          expect(typeof result.valid).toBe("boolean");

          // プロパティ2: valid=falseの場合、errorが存在する
          if (!result.valid) {
            expect(result.error).toBeDefined();
            expect(typeof result.error).toBe("string");
          }

          // プロパティ3: valid=trueの場合、sanitizedが存在する
          if (result.valid) {
            expect(result.sanitized).toBeDefined();
            expect(typeof result.sanitized).toBe("string");
          }

          return true;
        })
      );
    });

    it("10000文字以下の文字列は常に有効", () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 10000 }), (input) => {
          const result = validateTaskName(input);
          expect(result.valid).toBe(true);
          return true;
        })
      );
    });

    it("10001文字以上の文字列は常に無効", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 10001, maxLength: 20000 }), (input) => {
          const result = validateTaskName(input);
          expect(result.valid).toBe(false);
          expect(result.error).toBe("Task name too long");
          return true;
        })
      );
    });

    it("サニタイズ後の文字列は元の文字列と同じか短い", () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 10000 }), (input) => {
          const result = validateTaskName(input);
          if (result.valid) {
            expect(result.sanitized.length).toBeLessThanOrEqual(input.length);
          }
          return true;
        })
      );
    });

    it("冪等性: バリデーションを2回適用しても同じ結果", () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 10000 }), (input) => {
          const result1 = validateTaskName(input);
          if (result1.valid) {
            const result2 = validateTaskName(result1.sanitized);
            expect(result2.valid).toBe(true);
            expect(result2.sanitized).toBe(result1.sanitized);
          }
          return true;
        })
      );
    });
  });

  // ==========================================================================
  // タイムアウト値の正規化
  // ==========================================================================
  describe("normalizeTimeout", () => {
    it("任意の数値入力に対して、結果は常に100〜3600000の範囲内", () => {
      fc.assert(
        fc.property(fc.oneof(fc.integer(), fc.float(), fc.constant(NaN)), (input) => {
          const result = normalizeTimeout(input as number);

          // プロパティ1: 結果は常に範囲内
          expect(result).toBeGreaterThanOrEqual(100);
          expect(result).toBeLessThanOrEqual(3600000);

          // プロパティ2: 結果は整数
          expect(Number.isInteger(result)).toBe(true);

          return true;
        })
      );
    });

    it("undefined入力はデフォルト値を返す", () => {
      const result = normalizeTimeout(undefined);
      expect(result).toBe(30000);
    });

    it("NaN入力はデフォルト値を返す", () => {
      const result = normalizeTimeout(NaN);
      expect(result).toBe(30000);
    });

    it("負の値は最小値にクランプされる", () => {
      fc.assert(
        fc.property(fc.integer({ max: -1 }), (input) => {
          const result = normalizeTimeout(input);
          expect(result).toBe(100);
          return true;
        })
      );
    });

    it("最大値を超える値は最大値にクランプされる", () => {
      fc.assert(
        fc.property(fc.integer({ min: 3600001 }), (input) => {
          const result = normalizeTimeout(input);
          expect(result).toBe(3600000);
          return true;
        })
      );
    });

    it("有効範囲内の値はそのまま返される（整数化のみ）", () => {
      fc.assert(
        fc.property(fc.integer({ min: 100, max: 3600000 }), (input) => {
          const result = normalizeTimeout(input);
          expect(result).toBe(input);
          return true;
        })
      );
    });
  });

  // ==========================================================================
  // 再試行回数の正規化
  // ==========================================================================
  describe("normalizeRetries", () => {
    it("任意の数値入力に対して、結果は常に0〜10の範囲内", () => {
      fc.assert(
        fc.property(fc.oneof(fc.integer(), fc.float(), fc.constant(NaN)), (input) => {
          const result = normalizeRetries(input as number);

          expect(result).toBeGreaterThanOrEqual(0);
          expect(result).toBeLessThanOrEqual(10);
          expect(Number.isInteger(result)).toBe(true);

          return true;
        })
      );
    });

    it("undefined入力はデフォルト値を返す", () => {
      const result = normalizeRetries(undefined);
      expect(result).toBe(3);
    });

    it("負の値は0にクランプされる", () => {
      fc.assert(
        fc.property(fc.integer({ max: -1 }), (input) => {
          const result = normalizeRetries(input);
          expect(result).toBe(0);
          return true;
        })
      );
    });

    it("10を超える値は10にクランプされる", () => {
      fc.assert(
        fc.property(fc.integer({ min: 11, max: 1000 }), (input) => {
          const result = normalizeRetries(input);
          expect(result).toBe(10);
          return true;
        })
      );
    });
  });

  // ==========================================================================
  // JSONパース
  // ==========================================================================
  describe("safeJsonParse", () => {
    it("任意の文字列入力に対して、結果はsuccessとdataまたはerrorを持つ", () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = safeJsonParse(input);

          expect(typeof result.success).toBe("boolean");

          if (result.success) {
            expect(result.data).toBeDefined();
          } else {
            expect(result.error).toBeDefined();
          }

          return true;
        })
      );
    });

    it("有効なJSON文字列は常に成功する", () => {
      fc.assert(
        fc.property(fc.json(), (input) => {
          const result = safeJsonParse(input);
          expect(result.success).toBe(true);
          return true;
        })
      );
    });

    it("可逆性: JSON文字列をパースして再文字列化できる", () => {
      // fast-checkの任意のJSON値を生成
      const jsonValueArbitrary = fc.oneof(
        fc.string(),
        fc.integer(),
        fc.boolean(),
        fc.constant(null),
        fc.array(fc.anything()),
        fc.dictionary(fc.string(), fc.anything())
      );

      fc.assert(
        fc.property(jsonValueArbitrary, (input) => {
          const jsonString = JSON.stringify(input);
          const result = safeJsonParse(jsonString);

          expect(result.success).toBe(true);
          if (result.success) {
            // JSONパース結果を比較（順序が異なる可能性があるため文字列化して比較）
            const reparsed = JSON.stringify(result.data);
            const original = JSON.stringify(input);
            expect(reparsed).toBe(original);
          }

          return true;
        })
      );
    });
  });

  // ==========================================================================
  // 複合プロパティ
  // ==========================================================================
  describe("複合プロパティ", () => {
    it("委譲リクエストのバリデーション: 全てのフィールドが正規化される", () => {
      const delegationRequestArbitrary = fc.record({
        task: fc.string({ maxLength: 15000 }),
        timeout: fc.oneof(fc.constant(undefined), fc.integer()),
        retries: fc.oneof(fc.constant(undefined), fc.integer()),
      });

      fc.assert(
        fc.property(delegationRequestArbitrary, (request) => {
          // タスク名のバリデーション
          const taskResult = validateTaskName(request.task);

          // タイムアウトの正規化
          const normalizedTimeout = normalizeTimeout(request.timeout);

          // 再試行回数の正規化
          const normalizedRetries = normalizeRetries(request.retries);

          // 全てのフィールドが有効な値を持つ
          if (taskResult.valid) {
            expect(normalizedTimeout).toBeGreaterThanOrEqual(100);
            expect(normalizedRetries).toBeGreaterThanOrEqual(0);
          }

          return true;
        })
      );
    });
  });
});
