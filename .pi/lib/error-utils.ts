/**
 * Error handling utilities shared across extensions.
 * Consolidates duplicate implementations from:
 * - agent-teams.ts
 * - subagents.ts
 * - loop.ts
 * - rsa.ts
 */

/**
 * Converts an unknown error to a string message.
 * @param error - The error to convert
 * @returns The error message as a string
 */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Extracts HTTP status code from an error message.
 * Looks for 429 or 5xx status codes in the message.
 * @param error - The error to extract from
 * @returns The status code if found, undefined otherwise
 */
export function extractStatusCodeFromMessage(error: unknown): number | undefined {
  const message = toErrorMessage(error);
  const codeMatch = message.match(/\b(429|5\d{2})\b/);
  if (!codeMatch) return undefined;
  const code = Number(codeMatch[1]);
  return Number.isFinite(code) ? code : undefined;
}

/**
 * Pressure error classification types.
 */
export type PressureErrorType = "rate_limit" | "timeout" | "capacity" | "other";

/**
 * Classifies an error into pressure-related categories.
 * @param error - The error to classify
 * @returns The classification type
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
 * Checks if an error message indicates cancellation.
 * @param error - The error to check
 * @returns True if the error indicates cancellation
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
 * Checks if an error message indicates a timeout.
 * @param error - The error to check
 * @returns True if the error indicates a timeout
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
