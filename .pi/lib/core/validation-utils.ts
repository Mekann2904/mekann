/**
 * @abdd.meta
 * path: .pi/lib/validation-utils.ts
 * role: 数値変換・検証ユーティリティ
 * why: 各拡張機能で重複していた実装を一箇所に集約し、メンテナンス性を向上させるため
 * related: context-usage-dashboard.ts, agent-usage-tracker.ts, retry-with-backoff.ts, loop.ts
 * public_api: toFiniteNumber, toFiniteNumberWithDefault, toBoundedInteger, toBoundedFloat, BoundedIntegerResult, BoundedFloatResult
 * invariants: 数値変換は厳密な型チェックを行い、無効値はundefinedまたはエラーオブジェクトとして返却する
 * side_effects: なし
 * failure_modes: 変換対象がオブジェクトの変換エラー、数値への変換失敗、指定範囲外の値によるバリデーション失敗
 * @abdd.explain
 * overview: 不明な値を安全に数値へ変換し、整数・浮動小数点数ごとに範囲検証を行うライブラリ
 * what_it_does:
 *   - unknown型の値を有限数値に変換する
 *   - 整数および浮動小数点数に対して最小値・最大値の範囲チェックを行う
 *   - 単一要素の配列を要素の値として展開して変換する
 *   - バリデーション結果を成功・失敗を表す共用型で返却する
 * why_it_exists:
 *   - 複数のモジュールで実装が分散していたため、共通ロジックとして抽出したため
 *   - 外部入力や設定値の数値化処理において、型安全性を確保する必要があったため
 * scope:
 *   in: unknown型の値、フォールバック値、数値範囲、フィールド名
 *   out: 有限数値、またはエラーメッセージを含む結果オブジェクト
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
  return Number.isFinite(fallback) ? fallback : 0;
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
