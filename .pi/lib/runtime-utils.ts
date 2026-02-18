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
