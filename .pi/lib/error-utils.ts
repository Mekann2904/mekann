/**
 * @abdd.meta
 * path: .pi/lib/error-utils.ts
 * role: エラー処理ユーティリティライブラリ
 * why: 複数のエージェント拡張機能間で重複していたエラー処理ロジックを一元管理し、保守性を向上させるため
 * related: agent-teams.ts, subagents.ts, loop.ts, rsa.ts
 * public_api: toErrorMessage, extractStatusCodeFromMessage, classifyPressureError, isCancelledErrorMessage, isTimeoutErrorMessage, PressureErrorType
 * invariants: 全関数はunknown型を受け入れ、null/undefinedを含む任意の値を安全に処理する
 * side_effects: なし（純粋関数のみ）
 * failure_modes: なし（全入力に対して安全に文字列変換または分類結果を返す）
 * @abdd.explain
 * overview: エラーオブジェクトの分類・判定・変換を行う共有ユーティリティ関数群
 * what_it_does:
 *   - unknown型のエラーを文字列メッセージに変換
 *   - HTTPステータスコード429および5xxをエラーメッセージから抽出
 *   - エラーをrate_limit/timeout/capacity/otherの4種類に分類
 *   - キャンセル/タイムアウトを示すエラーメッセージを多言語で判定
 * why_it_exists:
 *   - agent-teams.ts, subagents.ts, loop.ts, rsa.tsで重複実装されていたエラー処理を統合
 *   - 日本語・英語双方のエラーメッセージを一貫して処理
 * scope:
 *   in: unknown型のエラーオブジェクト、Errorインスタンス、文字列、null/undefined
 *   out: 文字列、数値、boolean、PressureErrorTypeリテラル
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
