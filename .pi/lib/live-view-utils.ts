/**
 * Live view utilities for subagents and agent teams.
 * Shared functions for rendering live status views in TUI.
 */

/**
 * Common status type for live view items.
 * Used by both subagent live items and team member live items.
 */
export type LiveStatus = "pending" | "running" | "completed" | "failed";

/**
 * Get the glyph representation for a live status.
 * @param status - The status to convert to a glyph
 * @returns A 2-character string representing the status
 */
export function getLiveStatusGlyph(status: LiveStatus): string {
  if (status === "completed") return "OK";
  if (status === "failed") return "!!";
  if (status === "running") return ">>";
  return "..";
}

/**
 * Check if the raw input represents an Enter key press.
 * Handles multiple representations of Enter across different terminals.
 * @param rawInput - The raw input string to check
 * @returns True if the input represents Enter
 */
export function isEnterInput(rawInput: string): boolean {
  return (
    rawInput === "\r" ||
    rawInput === "\n" ||
    rawInput === "\r\n" ||
    rawInput === "enter"
  );
}

/**
 * Finalize lines for display in a fixed-height view.
 * Pads with empty strings if fewer lines than height, truncates if more.
 * @param lines - The lines to finalize
 * @param height - Optional target height for the output
 * @returns The finalized lines array
 */
export function finalizeLiveLines(lines: string[], height?: number): string[] {
  if (!height || height <= 0) {
    return lines;
  }
  if (lines.length > height) {
    return lines.slice(0, height);
  }
  const padded = [...lines];
  while (padded.length < height) {
    padded.push("");
  }
  return padded;
}
