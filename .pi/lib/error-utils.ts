/**
 * Error handling utilities shared across extensions.
 * Consolidates duplicate implementations from:
 * - agent-teams.ts
 * - subagents.ts
 * - loop.ts
 * - rsa.ts
 */

/**
 * 不明なエラーを文字列メッセージに変換します
 * @param error - 変換対象のエラー
 * @returns エラーメッセージの文字列
 */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

 /**
  * エラーメッセージからHTTPステータスコードを抽出
  * @param error - 対象のエラー
  * @returns 見つかったステータスコード、なければ undefined
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
  * エラーがキャンセルを示すか判定する
  * @param error - 検査対象のエラー
  * @returns キャンセルを示す場合はtrue
  */
export function isCancelledErrorMessage(error: unknown): boolean {
  const message = toErrorMessage(error).toLowerCase();
  return (
    message.includes("aborted") ||
    message.includes("cancelled") ||
    message.includes("canceled") ||
    message.includes("中断") ||
    message.includes("キャンセル")
  );
}

 /**
  * エラーがタイムアウトか判定する
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
