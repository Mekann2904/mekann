/**
 * @abdd.meta
 * path: .pi/lib/validation-utils.ts
 * role: 数値検証・変換ユーティリティの集約モジュール
 * why: 複数の拡張機能間で重複していた実装（context-usage-dashboard.ts等）を一元管理し、コードの重複を排除するため
 * related: context-usage-dashboard.ts, agent-usage-tracker.ts, retry-with-backoff.ts, loop.ts
 * public_api: toFiniteNumber, toFiniteNumberWithDefault, toBoundedInteger, toBoundedFloat, clampInteger, clampFloat, BoundedIntegerResult, BoundedFloatResult
 * invariants: clampIntegerは整数を返す（Math.truncにより）, toFiniteNumberは有限数のみを変換する
 * side_effects: なし（純粋関数）
 * failure_modes: Number()変換による意図しない型強制（数値文字列等が変換される）
 * @abdd.explain
 * overview: 拡張機能間で共有される数値検証および型変換処理を提供するライブラリ
 * what_it_does:
 *   - unknown型の値を有限数またはデフォルト値に変換する
 *   - 整数値が指定範囲内に収まるか検証する
 *   - 数値を指定範囲内に収める（クランプ処理）
 *   - 浮動小数点数を指定範囲内に収める
 * why_it_exists:
 *   - バリデーション処理の重複を排除し、メンテナンス性を向上させる
 *   - 型安全な数値変換ロジックを再利用可能にする
 * scope:
 *   in: unknown型の任意の値, 数値, 数値変換可能な文字列, 範囲定義(min/max)
 *   out: number | undefined, BoundedIntegerResult型の検証結果オブジェクト, 範囲制限された数値
 */

/**
 * Validation utilities shared across extensions.
 * Consolidates duplicate implementations from:
 * - context-usage-dashboard.ts
 * - agent-usage-tracker.ts
 * - retry-with-backoff.ts
 * - loop.ts
 * - rsa.ts
 */

/**
 * 有限数値を取得する
 * @summary 有限数値を取得
 * @param value 変換対象の値
 * @returns 有限数値またはundefined
 */
export function toFiniteNumber(value: unknown): number | undefined {
  // Handle arrays specially - single-element arrays can be converted
  if (Array.isArray(value)) {
    if (value.length === 0) return 0;
    if (value.length === 1) return toFiniteNumber(value[0]);
    return undefined; // Multi-element arrays are NaN
  }
  // Guard against objects with throwing/symbol toString (e.g., {toString: 0})
  if (typeof value === "object" && value !== null) {
    return undefined;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

/**
 * 有限数値を取得する
 * @summary 有限数値を取得
 * @param value 変換対象の値
 * @param fallback デフォルト値
 * @returns 変換された有限数値
 */
export function toFiniteNumberWithDefault(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback;
}

/**
 * 整数値の範囲制限結果を表す型
 * @summary 範囲制限結果の型
 * @returns 成功時は値、失敗時はエラー情報
 */
export type BoundedIntegerResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

/**
 * 浮動小数点数の範囲制限結果を表す型
 * @summary 範囲制限結果の型
 * @returns 成功時は値、失敗時はエラー情報
 */
export type BoundedFloatResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

/**
 * 整数値の検証と範囲制限を行う
 * @summary 整数値を検証・制限
 * @param value - 検証対象の値
 * @param fallback - 未定義時のフォールバック値
 * @param min - 最小値
 * @param max - 最大値
 * @param field - フィールド名（エラーメッセージ用）
 * @returns 検証結果を含むオブジェクト
 */
export function toBoundedInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  field: string,
): BoundedIntegerResult {
  let resolved: number;
  try {
    resolved = value === undefined ? fallback : Number(value);
  } catch {
    return { ok: false, error: `${field} must be an integer.` };
  }
  if (!Number.isFinite(resolved) || !Number.isInteger(resolved)) {
    return { ok: false, error: `${field} must be an integer.` };
  }
  if (resolved < min || resolved > max) {
    return { ok: false, error: `${field} must be in [${min}, ${max}].` };
  }
  return { ok: true, value: resolved };
}

/**
 * 浮動小数点数の検証と範囲制限を行う
 * @summary 浮動小数点数を検証・制限
 * @param value - 検証対象の値
 * @param fallback - 未定義時のフォールバック値
 * @param min - 最小値
 * @param max - 最大値
 * @param field - フィールド名（エラーメッセージ用）
 * @returns 検証結果を含むオブジェクト
 */
export function toBoundedFloat(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  field: string,
): BoundedFloatResult {
  let resolved: number;
  try {
    resolved = value === undefined ? fallback : Number(value);
  } catch {
    return { ok: false, error: `${field} must be a number.` };
  }
  if (!Number.isFinite(resolved)) {
    return { ok: false, error: `${field} must be a number.` };
  }
  if (resolved < min || resolved > max) {
    return { ok: false, error: `${field} must be in [${min}, ${max}].` };
  }
  return { ok: true, value: resolved };
}

/**
 * 整数値を指定範囲内に制限する
 * @summary 整数値を制限
 * @param value - 入力値
 * @param min - 最小値
 * @param max - 最大値
 * @returns 範囲内に制限された整数値
 */
export function clampInteger(value: number, min: number, max: number): number {
  // NaNの場合はminを返す
  if (Number.isNaN(value)) return min;
  // 無限大の場合はmax、無限小の場合はminを返す
  if (value === Infinity) return max;
  if (value === -Infinity) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/**
 * 浮動小数点数を指定範囲内に制限する
 * @summary 浮動小数点数を制限
 * @param value - 入力値
 * @param min - 最小値
 * @param max - 最大値
 * @returns 範囲内に制限された数値
 */
export function clampFloat(value: number, min: number, max: number): number {
  // NaNの場合はminを返す
  if (Number.isNaN(value)) return min;
  // 無限大の場合はmax、無限小の場合はminを返す
  if (value === Infinity) return max;
  if (value === -Infinity) return min;
  return Math.min(max, Math.max(min, value));
}
