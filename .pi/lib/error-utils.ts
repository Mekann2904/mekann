/**
 * @abdd.meta
 * path: .pi/lib/error-utils.ts
 * role: エラー処理の共通ユーティリティ実装
 * why: agent-teams.ts, subagents.ts, loop.ts, rsa.ts に存在していた重複実装を統一し、保守性を向上させるため
 * related: agent-teams.ts, subagents.ts, loop.ts, rsa.ts
 * public_api: toErrorMessage, extractStatusCodeFromMessage, classifyPressureError, isCancelledErrorMessage, isTimeoutErrorMessage
 * invariants: エラーメッセージ文字列化処理は null や undefined を含む unknown 型を正しく文字列に変換する
 * side_effects: なし
 * failure_modes: 正規表現によるステータスコード抽出において、メッセージ内の意図しない数値をステータスコードとして誤認する可能性がある
 * @abdd.explain
 * overview: 拡張機能間で共有されるエラー処理ユーティリティ
 * what_it_does:
 *   - unknown 型のエラーを文字列メッセージに正規化する
 *   - エラーメッセージからHTTPステータスコード（4xx, 5xx）を抽出する
 *   - エラーをレートリミット、タイムアウト、容量超過などの圧力カテゴリに分類する
 *   - エラーメッセージに基づき、キャンセルやタイムアウトの発生を判定する
 * why_it_exists:
 *   - エラー判定ロジックの重複を排除し、コードベースの一貫性を保つため
 *   - 外部APIや実行環境からのエラー応答を統一的な基準でハンドリングするため
 * scope:
 *   in: unknown 型のエラーオブジェクト、エラーメッセージ文字列
 *   out: 文字列、数値、判定結果、または分類タイプ
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
