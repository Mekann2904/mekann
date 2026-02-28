/**
 * エラーハンドリングユーティリティ
 * @module lib/error-utils
 */

/**
 * @summary 圧力エラーの種別
 */
export type PressureErrorType = "rate_limit" | "capacity" | "timeout" | "cancelled" | "other";

/**
 * unknownをErrorに安全に変換
 */
export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === "string") {
    return new Error(error);
  }
  return new Error(String(error));
}

/**
 * @summary エラーメッセージを抽出
 * @param error - 処理対象のエラー
 * @returns エラーメッセージ文字列
 */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  // オブジェクトや配列の場合はJSON.stringifyを試みる
  if (typeof error === "object" && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      // 循環参照などJSON化できない場合はString()にフォールバック
      try {
        return String(error);
      } catch {
        return "[object Object]";
      }
    }
  }
  // null, undefined, number, boolean など
  try {
    return String(error);
  } catch {
    return String(typeof error);
  }
}

/**
 * unknownからエラーメッセージを抽出
 */
export function getErrorMessage(error: unknown): string {
  return toErrorMessage(error);
}

/**
 * エラーオブジェクトかどうかを判定する型ガード
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * 文字列エラーかどうかを判定する型ガード
 */
export function isStringError(error: unknown): error is string {
  return typeof error === "string";
}

/**
 * @summary メッセージからHTTPステータスコードを抽出
 * @param error - 検索対象のエラーまたはメッセージ
 * @returns ステータスコード（429または5xxのみ）、見つからない場合はundefined
 */
export function extractStatusCodeFromMessage(error: unknown): number | undefined {
  const message = toErrorMessage(error);
  const match = message.match(/\b(\d{3})\b/);
  if (match) {
    const code = parseInt(match[1], 10);
    // 429（rate limit）または5xx（server error）のみを対象とする
    if (code === 429 || (code >= 500 && code <= 599)) {
      return code;
    }
  }
  return undefined;
}

/**
 * @summary メッセージから圧力エラーの種別を分類
 * @param error - 分類対象のエラーまたはメッセージ
 * @returns 圧力エラーの種別
 */
export function classifyPressureError(error: unknown): PressureErrorType {
  const message = typeof error === "string" ? error : toErrorMessage(error);
  const lowerMessage = message.toLowerCase();
  const statusCode = extractStatusCodeFromMessage(error);

  if (statusCode === 429) return "rate_limit";
  if (statusCode === 503) return "capacity";

  if (lowerMessage.includes("rate limit") || lowerMessage.includes("429") || lowerMessage.includes("too many requests")) {
    return "rate_limit";
  }
  if (
    lowerMessage.includes("capacity") ||
    lowerMessage.includes("overload") ||
    lowerMessage.includes("runtime limit") ||
    lowerMessage.includes("limit reached")
  ) {
    return "capacity";
  }
  if (lowerMessage.includes("timeout") || lowerMessage.includes("timed out")) {
    return "timeout";
  }
  if (lowerMessage.includes("cancel") || lowerMessage.includes("abort")) {
    return "cancelled";
  }
  return "other";
}

/**
 * @summary キャンセルエラーかどうかを判定
 * @param error - 判定対象のエラーまたはメッセージ
 * @returns キャンセルエラーの場合true
 */
export function isCancelledErrorMessage(error: unknown): boolean {
  const message = typeof error === "string" ? error : toErrorMessage(error);
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes("cancel") ||
    lowerMessage.includes("abort") ||
    message.includes("中断") ||
    message.includes("キャンセル")
  );
}

/**
 * @summary タイムアウトエラーかどうかを判定
 * @param error - 判定対象のエラーまたはメッセージ
 * @returns タイムアウトエラーの場合true
 */
export function isTimeoutErrorMessage(error: unknown): boolean {
  const message = typeof error === "string" ? error : toErrorMessage(error);
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes("timeout") ||
    lowerMessage.includes("timed out") ||
    lowerMessage.includes("time out") ||
    message.includes("時間切れ") ||
    message.includes("タイムアウト")
  );
}
