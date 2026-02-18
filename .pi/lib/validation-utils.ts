/**
 * @abdd.meta
 * path: .pi/lib/validation-utils.ts
 * role: 共通バリデーションユーティリティライブラリ
 * why: 複数の拡張機能間で重複していた数値変換・検証ロジックを一元管理し、保守性を向上させるため
 * related: context-usage-dashboard.ts, agent-usage-tracker.ts, retry-with-backoff.ts, loop.ts
 * public_api: toFiniteNumber, toFiniteNumberWithDefault, toBoundedInteger, clampInteger, clampFloat, BoundedIntegerResult
 * invariants: 全てのclamp系関数はmin <= result <= maxを満たす、toFiniteNumber系は無限大やNaNを返さない
 * side_effects: なし（純粋関数のみ）
 * failure_modes: toBoundedIntegerは非整数または範囲外の入力でok: falseとエラーメッセージを返す、toFiniteNumberは非有限値でundefinedを返す
 * @abdd.explain
 * overview: 不明な値の数値変換、範囲制限、整数検証を行う純粋関数セットを提供する
 * what_it_does:
 *   - unknown型を有限数値またはundefinedに変換する
 *   - 数値を指定範囲[min, max]内に制限する
 *   - 整数値の検証と範囲チェックを行い結果オブジェクトを返す
 * why_it_exists:
 *   - context-usage-dashboard, agent-usage-tracker, retry-with-backoff, loop, rsaで重複実装を解消
 *   - 型安全な数値処理の統一インターフェース提供
 * scope:
 *   in: unknown, number, fallback値, min/max範囲指定, フィールド名（エラー用）
 *   out: 有限数値, undefined, BoundedIntegerResult（成功値またはエラー）
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
  * 不明な値を有限の数値に変換する
  * @param value - 変換対象の値
  * @returns 有限の数値、または変換不可の場合はundefined
  */
export function toFiniteNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

 /**
  * 有限数またはデフォルト値を返す
  * @param value - 変換対象の値
  * @param fallback - 変換失敗時のフォールバック値（デフォルト: 0）
  * @returns 有限数またはフォールバック値
  */
export function toFiniteNumberWithDefault(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback;
}

 /**
  * 整数範囲検証の結果型
  */
export type BoundedIntegerResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

 /**
  * 整数値の検証と範囲制限を行う
  * @param value - 検証対象の値
  * @param fallback - 未定義時のフォールバック値
  * @param min - 許容される最小値
  * @param max - 許容される最大値
  * @param field - エラーメッセージ用のフィールド名
  * @returns 値またはエラーを含む検証結果
  */
export function toBoundedInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  field: string,
): BoundedIntegerResult {
  const resolved = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(resolved) || !Number.isInteger(resolved)) {
    return { ok: false, error: `${field} must be an integer.` };
  }
  if (resolved < min || resolved > max) {
    return { ok: false, error: `${field} must be in [${min}, ${max}].` };
  }
  return { ok: true, value: resolved };
}

 /**
  * 整数値を指定範囲内に制限する
  * @param value - 制限対象の値
  * @param min - 最小値
  * @param max - 最大値
  * @returns 範囲内に制限された整数値
  */
export function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

 /**
  * 浮動小数点数を指定範囲内に制限する
  * @param value - 対象の数値
  * @param min - 最小値
  * @param max - 最大値
  * @returns 範囲内に収められた数値
  */
export function clampFloat(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
