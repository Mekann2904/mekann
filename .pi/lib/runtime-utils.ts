/**
 * Runtime utilities for subagent and agent team execution.
 * Provides timeout handling, retry schema, and error formatting utilities.
 */

import { Type } from "@mariozechner/pi-ai";
import type { RetryWithBackoffOverrides } from "./retry-with-backoff.js";

/**
 * Trim message for error display, normalizing whitespace.
 * @param message - Message to trim
 * @param maxLength - Maximum length (default: 600)
 * @returns Trimmed message
 */
export function trimForError(message: string, maxLength = 600): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}

/**
 * Build rate limit key from provider and model.
 * @param provider - Provider name
 * @param model - Model name
 * @returns Normalized rate limit key
 */
export function buildRateLimitKey(provider: string, model: string): string {
  return `${provider.toLowerCase()}::${model.toLowerCase()}`;
}

/**
 * Build trace task ID for debugging and logging.
 * @param traceId - Trace ID (optional)
 * @param delegateId - Delegate ID
 * @param sequence - Sequence number
 * @returns Formatted trace task ID
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
 * Normalize timeout value in milliseconds.
 * @param value - Timeout value (unknown)
 * @param fallback - Fallback value if invalid
 * @returns Normalized timeout in milliseconds
 */
export function normalizeTimeoutMs(value: unknown, fallback: number): number {
  const resolved = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  if (resolved <= 0) return 0;
  return Math.max(1, Math.trunc(resolved));
}

/**
 * Create retry schema for tool input validation.
 * @returns TypeBox schema for retry options
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
 * Convert retry input value to RetryWithBackoffOverrides.
 *
 * Note: This is the "unstable" version that does NOT check STABLE_*_RUNTIME.
 * Extensions (subagents.ts, agent-teams.ts) have their own local versions that
 * return undefined in stable mode. If you want to use this function from extensions,
 * you must handle stable mode check in the caller.
 *
 * @param value - Raw retry input value
 * @returns RetryWithBackoffOverrides or undefined
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
 * Convert concurrency limit input to number.
 * @param value - Raw concurrency limit value
 * @param fallback - Fallback value if invalid
 * @returns Normalized concurrency limit
 */
export function toConcurrencyLimit(value: unknown, fallback: number): number {
  const resolved = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  if (resolved <= 0) return fallback;
  return Math.max(1, Math.trunc(resolved));
}
