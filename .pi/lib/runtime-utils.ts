/**
 * @abdd.meta
 * path: .pi/lib/runtime-utils.ts
 * role: サブエージェントおよびエージェントチーム実行のためのランタイムユーティリティ
 * why: タイムアウト、リトライ、同時実行制御、ID生成、エラー整形など、実行時に必要となる共通処理を一箇所に集約し再利用性と信頼性を確保するため
 * related: ./retry-with-backoff.js, @mariozechner/pi-ai
 * public_api: trimForError, buildRateLimitKey, buildTraceTaskId, normalizeTimeoutMs, createRetrySchema, toRetryOverrides, toConcurrencyLimit
 * invariants: すべての数値変換関数は0以上の整数を返す、文字列キー生成は小文字化・正規化された空白を使用する
 * side_effects: なし
 * failure_modes: 不正な型入力によるフォールバック値の使用、数値変換時の精度消失
 * @abdd.explain
 * overview: エージェントシステムの実行制御に関連する補助関数群を提供するモジュール。
 * what_it_does:
 *   - エラーメッセージの空白正規化と文字数制限による整形
 *   - プロバイダとモデル名に基づくレート制限キーの生成
 *   - トレースID、デリゲートID、シーケンス番号による一意タスクIDの生成
 *   - 任意の入力値からのタイムアウトミリ秒と同時実行数の正規化
 *   - TypeBoxによるリトライ設定スキーマの定義と、生オブジェクトから型安全なオプションへの変換
 * why_it_exists:
 *   - ランタイム設定の検証と正規化ロジックを共通化し、実装の重複を防ぐため
 *   - 外部入力の型安全性を保証し、実行時エラーを未然に防ぐため
 * scope:
 *   in: 生の文字列、数値、不明型のオブジェクト
 *   out: 正規化された文字列、数値、TypeBoxスキーマ、型定義されたオプションオブジェクト
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
