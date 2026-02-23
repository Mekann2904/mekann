/**
 * @abdd.meta
 * path: .pi/lib/error-utils.ts
 * role: エラー解析・分類ユーティリティ
 * why: 複数の拡張機能に散在していた重複実装を集約し、エラーハンドリングの統一性と保守性を向上させるため
 * related: agent-teams.ts, subagents.ts, loop.ts, rsa.ts
 * public_api: toErrorMessage, extractStatusCodeFromMessage, classifyPressureError, isCancelledErrorMessage, isTimeoutErrorMessage
 * invariants: 全関数はunknown型を受け取り、例外を投げずに安全に値を返す
 * side_effects: なし（純粋関数）
 * failure_modes: オブジェクトのJSON.stringify失敗時に"[object Object]"を返す
 * @abdd.explain
 * overview: 拡張機能間で共有されるエラーハンドリングの共通ライブラリ
 * what_it_does:
 *   - エラーオブジェクトから文字列表現を抽出する
 *   - メッセージ内のステータスコード（4xx, 5xx）を抽出する
 *   - エラーをレート制限、タイムアウト、容量超過、その他に分類する
 *   - キャンセルやタイムアウトによるエラーかを判定する
 * why_it_exists:
 *   - agent-teams.ts, subagents.ts, loop.ts, rsa.ts に存在していた重複コードを排除するため
 *   - エラー判定ロジックを一箇所に集約し、バグ修正や判定条件の追加を容易にするため
 * scope:
 *   in: エラーオブジェクト（unknown型）
 *   out: 文字列、数値、ブール値、または列挙型
 */

/**
 * Error handling utilities shared across extensions.
 * Consolidates duplicate implementations from:
 * - agent-teams.ts
 * - subagents.ts
 * - loop.ts
 * - rsa.ts
 */

/**
 * エラーメッセージ取得
 * @summary メッセージを文字列化
 * @param error エラーオブジェクト
 * @returns エラーメッセージ文字列
 */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  // オブジェクトガード: {toString: ...}のようなオブジェクトはString()変換でエラーになる
  if (typeof error === "object" && error !== null) {
    // ErrorでないオブジェクトはJSON文字列化を試みる
    try {
      return JSON.stringify(error);
    } catch {
      return "[object Object]";
    }
  }
  return String(error);
}

/**
 * ステータスコード抽出
 * @summary ステータスコードを抽出
 * @param error エラーオブジェクト
 * @returns ステータスコードまたはundefined
 */
export function extractStatusCodeFromMessage(error: unknown): number | undefined {
  const message = toErrorMessage(error);
  const codeMatch = message.match(/\b(429|5\d{2})\b/);
  if (!codeMatch) return undefined;
  const code = Number(codeMatch[1]);
  return Number.isFinite(code) ? code : undefined;
}

/**
 * 圧力エラーの分類型
 * @summary 圧力エラー分類
 * @returns エラーの種別
 */
export type PressureErrorType = "rate_limit" | "timeout" | "capacity" | "other";

 /**
  * エラーを圧力関連のカテゴリに分類する
  * @param error 分類対象のエラー
  * @returns 分類タイプ
  */
export function classifyPressureError(error: unknown): PressureErrorType {
  const message = toErrorMessage(error).toLowerCase();
  if (message.includes("runtime limit reached") || message.includes("capacity")) return "capacity";
  if (message.includes("timed out") || message.includes("timeout")) return "timeout";
  const statusCode = extractStatusCodeFromMessage(error);
  if (statusCode === 429 || message.includes("rate limit") || message.includes("too many requests")) {
    return "rate_limit";
  }
  return "other";
}

/**
 * キャンセル済みか判定
 * @summary エラー判定
 * @param error - 検査対象のエラー
 * @returns キャンセルを示す場合はtrue
 */
export function isCancelledErrorMessage(error: unknown): boolean {
  const message = toErrorMessage(error).toLowerCase();
  return (
    message.includes("aborted") ||
    message.includes("stop reason: abort") ||
    message.includes("cancelled") ||
    message.includes("canceled") ||
    message.includes("中断") ||
    message.includes("キャンセル")
  );
}

/**
 * タイムアウト判定
 * @summary タイムアウト判定
 * @param error - 検査対象のエラー
 * @returns タイムアウトの場合true
 */
export function isTimeoutErrorMessage(error: unknown): boolean {
  const message = toErrorMessage(error).toLowerCase();
  return (
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("time out") ||
    message.includes("時間切れ") ||
    message.includes("タイムアウト")
  );
}
