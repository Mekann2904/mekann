/**
 * @abdd.meta
 * path: .pi/lib/error-classifier.ts
 * role: 詳細なエラー分類機能を提供し、適切なリトライ戦略とバックオフ設定を決定する
 * why: エラーの性質に応じた適切な対処法を自動選択し、システムの回復力を向上させるため
 * related: .pi/lib/retry-with-backoff.ts, .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts
 * public_api: ErrorCategory, ErrorClassification, classifyErrorDetailed
 * invariants: 同一エラーに対しては常に同じ分類結果を返す
 * side_effects: なし（純粋関数）
 * failure_modes: 未知のエラー形式は"unknown"カテゴリに分類される
 * @abdd.explain
 * overview: HTTPステータスコード、エラーメッセージ、エラーオブジェクトからエラーを詳細に分類する
 * what_it_does:
 *   - HTTPステータスコードによる分類（401/403/429/5xx等）
 *   - エラーメッセージパターンによる分類（timeout/network/token等）
 *   - リトライ可否、バックオフ戦略、最大リトライ回数、初期遅延の決定
 *   - ユーザー向けメッセージの生成
 * why_it_exists:
 *   - エラーの性質に応じた適切なリトライ戦略を自動選択するため
 *   - 認証エラーやバリデーションエラーなどリトライ不应该なエラーを早期に検出するため
 * scope:
 *   in: エラーオブジェクト、HTTPステータスコード、エラーメッセージ
 *   out: エラーカテゴリ、リトライ可否、バックオフ戦略、最大リトライ回数、初期遅延、ユーザーメッセージ
 */

/**
 * エラーカテゴリの詳細分類
 */
export type ErrorCategory =
  | "rate_limit"
  | "capacity"
  | "timeout"
  | "auth_error"
  | "network_transient"
  | "network_permanent"
  | "validation_error"
  | "logic_error"
  | "resource_exhausted"
  | "provider_error"
  | "unknown";

/**
 * エラー分類結果
 */
export interface ErrorClassification {
  category: ErrorCategory;
  retryable: boolean;
  backoffStrategy: "exponential" | "linear" | "fixed" | "none";
  maxRetries: number;
  baseDelayMs: number;
  userMessage: string;
}

/**
 * HTTPステータスコードを抽出する
 * @summary ステータスコード抽出
 * @param error - エラーオブジェクト
 * @returns HTTPステータスコード（存在しない場合はundefined）
 */
function extractStatusCode(error: unknown): number | undefined {
  if (!error) return undefined;

  // Anthropic API エラー形式
  if (typeof error === "object" && error !== null) {
    const err = error as Record<string, unknown>;
    if (typeof err.status === "number") return err.status;
    if (typeof err.statusCode === "number") return err.statusCode;
    if (err.error && typeof err.error === "object") {
      const nested = err.error as Record<string, unknown>;
      if (typeof nested.status === "number") return nested.status;
    }
  }

  return undefined;
}

/**
 * エラーメッセージを抽出する
 * @summary メッセージ抽出
 * @param error - エラーオブジェクト
 * @returns エラーメッセージ
 */
function extractErrorMessage(error: unknown): string {
  if (!error) return "";

  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;

  if (typeof error === "object" && error !== null) {
    const err = error as Record<string, unknown>;
    if (typeof err.message === "string") return err.message;
    if (typeof err.error === "string") return err.error;
  }

  return String(error);
}

/**
 * エラーを詳細に分類する
 * @summary エラー詳細分類
 * @param error - エラーオブジェクト
 * @returns 分類結果
 */
export function classifyErrorDetailed(error: unknown): ErrorClassification {
  const statusCode = extractStatusCode(error);
  const message = extractErrorMessage(error).toLowerCase();

  // 401 Unauthorized / 403 Forbidden
  if (statusCode === 401 || statusCode === 403) {
    return {
      category: "auth_error",
      retryable: false,
      backoffStrategy: "none",
      maxRetries: 0,
      baseDelayMs: 0,
      userMessage: "Authentication failed. Please check your API key.",
    };
  }

  // 429 Rate Limit
  if (statusCode === 429) {
    return {
      category: "rate_limit",
      retryable: true,
      backoffStrategy: "exponential",
      maxRetries: 4,
      baseDelayMs: 1000,
      userMessage: "Rate limit exceeded. Retrying with backoff...",
    };
  }

  // 502 Bad Gateway / 503 Service Unavailable / 504 Gateway Timeout
  if (statusCode === 502 || statusCode === 503 || statusCode === 504) {
    return {
      category: "network_transient",
      retryable: true,
      backoffStrategy: "exponential",
      maxRetries: 3,
      baseDelayMs: 2000,
      userMessage: "Provider service temporarily unavailable. Retrying...",
    };
  }

  // 500 Internal Server Error
  if (statusCode === 500) {
    // プロバイダー側の一時的エラーの可能性
    if (message.includes("overloaded") || message.includes("capacity")) {
      return {
        category: "capacity",
        retryable: true,
        backoffStrategy: "exponential",
        maxRetries: 3,
        baseDelayMs: 5000,
        userMessage: "Provider is overloaded. Retrying...",
      };
    }

    return {
      category: "provider_error",
      retryable: true,
      backoffStrategy: "exponential",
      maxRetries: 2,
      baseDelayMs: 2000,
      userMessage: "Provider error occurred. Retrying...",
    };
  }

  // 400 Bad Request
  if (statusCode === 400) {
    if (message.includes("context_length") || message.includes("token")) {
      return {
        category: "resource_exhausted",
        retryable: false,
        backoffStrategy: "none",
        maxRetries: 0,
        baseDelayMs: 0,
        userMessage: "Context length exceeded. Please reduce input size.",
      };
    }

    return {
      category: "validation_error",
      retryable: false,
      backoffStrategy: "none",
      maxRetries: 0,
      baseDelayMs: 0,
      userMessage: "Invalid request. Please check your input.",
    };
  }

  // 408 Request Timeout
  if (statusCode === 408) {
    return {
      category: "timeout",
      retryable: true,
      backoffStrategy: "linear",
      maxRetries: 2,
      baseDelayMs: 5000,
      userMessage: "Request timed out. Retrying with longer timeout...",
    };
  }

  // タイムアウト系（メッセージベース）
  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("etimedout") ||
    message.includes("econn timed out")
  ) {
    return {
      category: "timeout",
      retryable: true,
      backoffStrategy: "linear",
      maxRetries: 2,
      baseDelayMs: 5000,
      userMessage: "Request timed out. Retrying with longer timeout...",
    };
  }

  // ネットワークエラー（恒久的）
  if (
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("net::err")
  ) {
    return {
      category: "network_permanent",
      retryable: false,
      backoffStrategy: "none",
      maxRetries: 0,
      baseDelayMs: 0,
      userMessage: "Network error. Please check your connection.",
    };
  }

  // ネットワークエラー（一時的）
  if (
    message.includes("econnreset") ||
    message.includes("socket hang up")
  ) {
    return {
      category: "network_transient",
      retryable: true,
      backoffStrategy: "exponential",
      maxRetries: 2,
      baseDelayMs: 1000,
      userMessage: "Connection reset. Retrying...",
    };
  }

  // レートリミット関連（メッセージベース）
  if (
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("quota exceeded")
  ) {
    return {
      category: "rate_limit",
      retryable: true,
      backoffStrategy: "exponential",
      maxRetries: 4,
      baseDelayMs: 1000,
      userMessage: "Rate limit exceeded. Retrying with backoff...",
    };
  }

  // 容量関連（メッセージベース）
  if (
    message.includes("overloaded") ||
    message.includes("capacity") ||
    message.includes("temporarily unavailable")
  ) {
    return {
      category: "capacity",
      retryable: true,
      backoffStrategy: "exponential",
      maxRetries: 3,
      baseDelayMs: 5000,
      userMessage: "Provider is overloaded. Retrying...",
    };
  }

  // 未知のエラー
  return {
    category: "unknown",
    retryable: false,
    backoffStrategy: "none",
    maxRetries: 0,
    baseDelayMs: 0,
    userMessage: `Unknown error: ${message.slice(0, 100)}`,
  };
}

/**
 * エラーがリトライ可能かどうかを判定する
 * @summary リトライ可否判定
 * @param error - エラーオブジェクト
 * @returns リトライ可能かどうか
 */
export function isErrorRetryable(error: unknown): boolean {
  return classifyErrorDetailed(error).retryable;
}

/**
 * エラーのユーザー向けメッセージを取得する
 * @summary ユーザーメッセージ取得
 * @param error - エラーオブジェクト
 * @returns ユーザー向けメッセージ
 */
export function getErrorUserMessage(error: unknown): string {
  return classifyErrorDetailed(error).userMessage;
}

/**
 * バックオフ戦略に基づいて待機時間を計算する
 * @summary 待機時間計算
 * @param attempt - 現在の試行回数
 * @param classification - エラー分類結果
 * @returns 待機時間（ミリ秒）
 */
export function computeBackoffDelayFromClassification(
  attempt: number,
  classification: ErrorClassification,
): number {
  const { backoffStrategy, baseDelayMs } = classification;

  if (backoffStrategy === "none" || baseDelayMs === 0) {
    return 0;
  }

  const safeAttempt = Math.max(1, Math.trunc(attempt));

  switch (backoffStrategy) {
    case "fixed":
      return baseDelayMs;

    case "linear":
      return baseDelayMs * safeAttempt;

    case "exponential":
      return Math.min(
        60000,  // 最大60秒
        baseDelayMs * Math.pow(2, safeAttempt - 1)
      );

    default:
      return baseDelayMs;
  }
}
