/**
 * @abdd.meta
 * path: .pi/lib/runtime-utils.ts
 * role: エージェント実行ランタイム用ユーティリティ関数群
 * why: タイムアウト、リトライ、レート制限、同時実行制御の設定正規化とID生成を集約し、サブエージェント実行の安定性を確保するため
 * related: retry-with-backoff.js, agent-executor.ts, subagent-handler.ts, types.ts
 * public_api: trimForError, buildRateLimitKey, buildTraceTaskId, normalizeTimeoutMs, createRetrySchema, toRetryOverrides, toConcurrencyLimit
 * invariants:
 *   - normalizeTimeoutMsは常に0以上の整数を返す（入力が正の有限値なら1以上、無効ならfallback）
 *   - toConcurrencyLimitは常に1以上の整数またはfallbackを返す
 *   - buildRateLimitKeyは常に小文字のprovider::model形式を返す
 * side_effects: なし（純粋関数のみ）
 * failure_modes:
 *   - trimForErrorに不正な文字列入力時は空文字を返す
 *   - normalizeTimeoutMsに無効値入力時はfallback値を返す
 *   - toRetryOverridesに不正なオブジェクト入力時はundefinedを返す
 * @abdd.explain
 * overview: サブエージェントとエージェントチーム実行のためのランタイムユーティリティ関数を提供する
 * what_it_does:
 *   - エラーメッセージの正規化・短縮（trimForError）
 *   - レート制限キーとトレースタスクIDの生成（buildRateLimitKey, buildTraceTaskId）
 *   - タイムアウト値の正規化（normalizeTimeoutMs）
 *   - リトライ設定のTypeBoxスキーマ作成とオーバーライド変換（createRetrySchema, toRetryOverrides）
 *   - 同時実行数の正規化（toConcurrencyLimit）
 * why_it_exists:
 *   - LLMプロバイダ呼び出しの設定値を安全に正規化し、実行時エラーを防ぐ
 *   - 分散トレースとデバッグ用に一意なIDを生成する
 *   - リトライ設定のバリデーションと型安全性を担保する
 * scope:
 *   in: 文字列、数値、unknown型の設定値
 *   out: 正規化された数値、文字列、TypeBoxスキーマ、RetryWithBackoffOverrides
 */

/**
 * Runtime utilities for subagent and agent team execution.
 * Provides timeout handling, retry schema, and error formatting utilities.
 */

import { Type } from "@mariozechner/pi-ai";

import type { RetryWithBackoffOverrides } from "./retry-with-backoff.js";

 /**
  * エラー表示用にメッセージを整形・短縮
  * @param message - 処理対象のメッセージ
  * @param maxLength - 最大長（デフォルト: 600）
  * @returns 整形されたメッセージ
  */
export function trimForError(message: string, maxLength = 600): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}

 /**
  * プロバイダとモデルからレート制限キーを生成
  * @param provider - プロバイダ名
  * @param model - モデル名
  * @returns 正規化されたレート制限キー
  */
export function buildRateLimitKey(provider: string, model: string): string {
  return `${provider.toLowerCase()}::${model.toLowerCase()}`;
}

 /**
  * トレースタスクIDを生成する
  * @param traceId - トレースID（省略可）
  * @param delegateId - デリゲートID
  * @param sequence - シーケンス番号
  * @returns フォーマットされたトレースタスクID
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
  * タイムアウト値（ミリ秒）を正規化します。
  * @param value - タイムアウト値（任意の型）
  * @param fallback - 値が無効な場合のフォールバック値
  * @returns 正規化されたタイムアウト値（ミリ秒）
  */
export function normalizeTimeoutMs(value: unknown, fallback: number): number {
  const resolved = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  if (resolved <= 0) return 0;
  return Math.max(1, Math.trunc(resolved));
}

 /**
  * リトライ設定のスキーマを作成する
  * @returns TypeBoxによるリトライオプションのスキーマ
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
  * リトライ入力値をRetryWithBackoffOverridesに変換する。
  * @param value - 生のリトライ入力値
  * @returns RetryWithBackoffOverridesまたはundefined
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
  * 同時実行数の入力値を数値に変換する。
  * @param value - 生の同時実行数の値
  * @param fallback - 無効な場合の代替値
  * @returns 正規化された同時実行数
  */
export function toConcurrencyLimit(value: unknown, fallback: number): number {
  const resolved = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  if (resolved <= 0) return fallback;
  return Math.max(1, Math.trunc(resolved));
}
