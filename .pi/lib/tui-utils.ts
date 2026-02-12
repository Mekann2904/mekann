/**
 * TUI (Terminal User Interface) utilities shared across extensions.
 * Consolidates duplicate implementations from:
 * - agent-teams.ts
 * - subagents.ts
 *
 * Layer 0: No dependencies on other lib modules.
 */

import { Markdown, getMarkdownTheme } from "@mariozechner/pi-tui";

/** Default maximum length for tail content */
export const LIVE_TAIL_LIMIT = 40_000;

/** Minimum width for markdown preview rendering */
export const LIVE_MARKDOWN_PREVIEW_MIN_WIDTH = 24;

/**
 * Appends a chunk to the current tail string, respecting the maximum length.
 * If the result exceeds maxLength, the beginning is truncated.
 * @param current - The current tail string
 * @param chunk - The chunk to append
 * @param maxLength - Maximum length of the result (default: LIVE_TAIL_LIMIT)
 * @returns The new tail string
 */
export function appendTail(current: string, chunk: string, maxLength = LIVE_TAIL_LIMIT): string {
  if (!chunk) return current;
  const next = `${current}${chunk}`;
  if (next.length <= maxLength) return next;
  return next.slice(next.length - maxLength);
}

/**
 * Splits a tail string into lines, trims trailing whitespace, and limits the number of lines.
 * Empty lines at the end are removed before limiting.
 * @param tail - The tail string to process
 * @param limit - Maximum number of lines to return
 * @returns Array of processed lines
 */
export function toTailLines(tail: string, limit: number): string[] {
  const lines = tail
    .split(/\r?\n/)
    .map((line) => line.trimEnd());
  // Remove empty lines from the end
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  if (lines.length <= limit) return lines;
  return lines.slice(lines.length - limit);
}

/**
 * Counts occurrences of a target string within an input string.
 * @param input - The string to search in
 * @param target - The string to search for
 * @returns The number of occurrences
 */
export function countOccurrences(input: string, target: string): number {
  if (!input || !target) return 0;
  let count = 0;
  let index = 0;
  while (index < input.length) {
    const found = input.indexOf(target, index);
    if (found < 0) break;
    count += 1;
    index = found + target.length;
  }
  return count;
}

/**
 * Estimates line count based on byte count and newline count.
 * @param bytes - The byte count
 * @param newlineCount - The number of newlines
 * @param endsWithNewline - Whether the content ends with a newline
 * @returns Estimated line count
 */
export function estimateLineCount(bytes: number, newlineCount: number, endsWithNewline: boolean): number {
  if (bytes <= 0) return 0;
  return newlineCount + (endsWithNewline ? 0 : 1);
}

/**
 * Checks if a string looks like Markdown content.
 * Detects common Markdown patterns: headers, lists, code blocks, links, etc.
 * @param input - The string to check
 * @returns True if the string appears to be Markdown
 */
export function looksLikeMarkdown(input: string): boolean {
  const text = input.trim();
  if (!text) return false;
  // Headers
  if (/^#{1,6}\s+/m.test(text)) return true;
  // Unordered lists
  if (/^\s*[-*+]\s+/m.test(text)) return true;
  // Ordered lists
  if (/^\s*\d+\.\s+/m.test(text)) return true;
  // Code blocks
  if (/```/.test(text)) return true;
  // Links
  if (/\[[^\]]+\]\([^)]+\)/.test(text)) return true;
  // Blockquotes
  if (/^\s*>\s+/m.test(text)) return true;
  // Tables
  if (/^\s*\|.+\|\s*$/m.test(text)) return true;
  // Bold
  if (/\*\*[^*]+\*\*/.test(text)) return true;
  // Inline code
  if (/`[^`]+`/.test(text)) return true;
  return false;
}

/**
 * Result type for markdown preview rendering.
 */
export interface MarkdownPreviewResult {
  lines: string[];
  renderedAsMarkdown: boolean;
}

/**
 * Renders text as Markdown if it looks like Markdown, otherwise returns plain lines.
 * @param text - The text to render
 * @param width - The width for rendering
 * @param maxLines - Maximum number of lines to return
 * @returns Object with lines and whether it was rendered as Markdown
 */
export function renderPreviewWithMarkdown(
  text: string,
  width: number,
  maxLines: number,
): MarkdownPreviewResult {
  if (!text.trim()) {
    return { lines: [], renderedAsMarkdown: false };
  }

  if (!looksLikeMarkdown(text)) {
    return { lines: toTailLines(text, maxLines), renderedAsMarkdown: false };
  }

  try {
    const markdown = new Markdown(text, 0, 0, getMarkdownTheme());
    const rendered = markdown.render(Math.max(LIVE_MARKDOWN_PREVIEW_MIN_WIDTH, width));
    if (rendered.length === 0) {
      return { lines: toTailLines(text, maxLines), renderedAsMarkdown: false };
    }
    if (rendered.length <= maxLines) {
      return { lines: rendered, renderedAsMarkdown: true };
    }
    return { lines: rendered.slice(rendered.length - maxLines), renderedAsMarkdown: true };
  } catch {
    return { lines: toTailLines(text, maxLines), renderedAsMarkdown: false };
  }
}
