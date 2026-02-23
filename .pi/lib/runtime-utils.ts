/**
 * @abdd.meta
 * path: .pi/lib/runtime-utils.ts
 * role: ランタイムユーティリティ
 * why: サブエージェントおよびエージェントチームの実行において、データ変換、設定正規化、ID生成などの共通処理を提供するため
 * related: ./retry-with-backoff.js, @mariozechner/pi-ai
 * public_api: trimForError, buildRateLimitKey, buildTraceTaskId, normalizeTimeoutMs, createRetrySchema, toRetryOverrides
 * invariants:
 *   - trimForErrorの出力は空白が正規化され、最大長を超える場合は末尾が"..."で終わる
 *   - buildRateLimitKeyの出力は小文字に変換され、"::"で連結される
 *   - buildTraceTaskIdのシーケンス番号は0以上の整数となる
 *   - normalizeTimeoutMsの出力は1以上の整数または0となる
 * side_effects: なし
 * failure_modes:
 *   - normalizeTimeoutMs: オブジェクトや配列が渡された場合、fallback値が返る
 *   - toRetryOverrides: 不正な型が渡された場合、undefinedが返る
 * @abdd.explain
 * overview: エージェント実行環境で利用される文字列操作、ID生成、タイムアウト設定、リトライスキーマ定義を行う純粋関数の集合
 * what_it_does:
 *   - エラーメッセージの文字列を正規化・切断する
 *   - プロバイダとモデル名からレート制限キーを生成する
 *   - トレースIDとデリゲートIDから一意のタスクIDを生成する
 *   - 任意の入力値を数値（ミリ秒）に正規化する
 *   - リトライ設定の型定義スキーマを生成する
 *   - リトライ設定のオブジェクトを型安全な形式に変換する
 * why_it_exists:
 *   - 実行時のエラーハンドリングとロギングのフォーマットを統一するため
 *   - 外部入力や設定値を安全な内部形式に変換するため
 *   - ランタイムの挙動を制御するパラメータ（タイムアウト、リトライ）を検証・生成するため
 * scope:
 *   in: 文字列、数値、unknown型の設定値、ID構成要素
 * out: 整形済み文字列、正規化された数値、型定義オブジェクト、設定オブジェクト
 */

/**
 * Runtime utilities for subagent and agent team execution.
 * Provides timeout handling, retry schema, and error formatting utilities.
 */

import { Type } from "@mariozechner/pi-ai";

import type { RetryWithBackoffOverrides } from "./retry-with-backoff.js";

/**
 * エラーメッセージ整形
 * @summary エラーメッセージを整形
 * @param message - 対象のメッセージ
 * @param maxLength - 最大長
 * @returns 整形されたメッセージ
 */
export function trimForError(message: string, maxLength = 600): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}

/**
 * レート制限キー生成
 * @summary レート制限キー生成
 * @param provider - プロバイダ名
 * @param model - モデル名
 * @returns 生成されたレート制限キー
 */
export function buildRateLimitKey(provider: string, model: string): string {
  return `${provider.toLowerCase()}::${model.toLowerCase()}`;
}

/**
 * トレースID生成
 * @summary トレースIDを生成
 * @param traceId - トレースID
 * @param delegateId - 委譲先ID
 * @param sequence - シーケンス番号
 * @returns 生成されたトレースタスクID
 */
export function buildTraceTaskId(
  traceId: string | undefined,
  delegateId: string,
  sequence: number,
): string {
  const safeTrace = (traceId || "trace-unknown").trim();
  const safeDelegate = (delegateId || "delegate-unknown").trim();
  return `${safeTrace}:${safeDelegate}:${Math.max(0, Math.trunc(sequence))}`;
}

/**
 * タイムアウト正規化
 * @summary タイムアウトを正規化
 * @param value 入力値
 * @param fallback デフォルト値
 * @returns 正規化されたタイムアウト時間
 */
export function normalizeTimeoutMs(value: unknown, fallback: number): number {
  // オブジェクトガード: {toString: ...}のようなオブジェクトはNumber()変換でエラーになる
  if (typeof value === "object" && value !== null) return fallback;
  if (Array.isArray(value)) return fallback;

  const resolved = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  if (resolved <= 0) return 0;
  return Math.max(1, Math.trunc(resolved));
}

/**
 * スキーマ生成
 * @summary リトライスキーマを作成
 * @returns void
 */
export function createRetrySchema() {
  return Type.Optional(
    Type.Object({
      maxRetries: Type.Optional(
        Type.Number({ description: "Max retry count (ignored in stable profile)" }),
      ),
      initialDelayMs: Type.Optional(
        Type.Number({ description: "Initial backoff delay in ms (ignored in stable profile)" }),
      ),
      maxDelayMs: Type.Optional(
        Type.Number({ description: "Max backoff delay in ms (ignored in stable profile)" }),
      ),
      multiplier: Type.Optional(
        Type.Number({ description: "Backoff multiplier (ignored in stable profile)" }),
      ),
      jitter: Type.Optional(
        Type.String({ description: "Jitter mode: full | partial | none (ignored in stable profile)" }),
      ),
    }),
  );
}

/**
 * リトライ設定変換
 * @summary リトライ設定を変換
 * @param value 入力値
 * @returns リトライ設定オブジェクト
 */
export function toRetryOverrides(value: unknown): RetryWithBackoffOverrides | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const jitter =
    raw.jitter === "full" || raw.jitter === "partial" || raw.jitter === "none"
      ? raw.jitter
      : undefined;
  return {
    maxRetries: typeof raw.maxRetries === "number" ? raw.maxRetries : undefined,
    initialDelayMs: typeof raw.initialDelayMs === "number" ? raw.initialDelayMs : undefined,
    maxDelayMs: typeof raw.maxDelayMs === "number" ? raw.maxDelayMs : undefined,
    multiplier: typeof raw.multiplier === "number" ? raw.multiplier : undefined,
    jitter,
  };
}

/**
 * 並行数変換
 * @summary 並行数リミットを取得
 * @param value 入力値
 * @param fallback デフォルト値
 * @returns 並行数
 */
export function toConcurrencyLimit(value: unknown, fallback: number): number {
  // オブジェクトガード: {toString: ...}のようなオブジェクトはNumber()変換でエラーになる
  if (typeof value === "object" && value !== null) return fallback;
  if (Array.isArray(value)) return fallback;

  const resolved = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  if (resolved <= 0) return fallback;
  return Math.max(1, Math.trunc(resolved));
}
