/**
 * Shared agent utility functions.
 * Consolidates duplicate implementations from:
 * - .pi/extensions/loop.ts (createRunId)
 * - .pi/extensions/subagents.ts (createRunId, computeLiveWindow)
 * - .pi/extensions/agent-teams.ts (createRunId, computeLiveWindow)
 */

import { randomBytes } from "node:crypto";

/**
 * Creates a unique run ID with timestamp and random suffix.
 * Format: YYYYMMDD-HHMMSS-xxxxxx (where xxxxxx is 6 hex chars)
 * @returns A unique run ID string
 */
export function createRunId(): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  const suffix = randomBytes(3).toString("hex");
  return `${stamp}-${suffix}`;
}

/**
 * Computes a sliding window for live list display.
 * Centers the cursor when possible, adjusts when near boundaries.
 * @param cursor - Current cursor position (0-indexed)
 * @param total - Total number of items
 * @param maxRows - Maximum rows to display
 * @returns Object with start (inclusive) and end (exclusive) indices
 */
export function computeLiveWindow(
  cursor: number,
  total: number,
  maxRows: number,
): { start: number; end: number } {
  if (total <= maxRows) return { start: 0, end: total };
  const clampedCursor = Math.max(0, Math.min(total - 1, cursor));
  const start = Math.max(0, Math.min(total - maxRows, clampedCursor - (maxRows - 1)));
  return { start, end: Math.min(total, start + maxRows) };
}
