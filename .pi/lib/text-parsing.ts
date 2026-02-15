/**
 * Shared text parsing utilities for structured output processing.
 * Extracted to avoid circular dependencies between modules.
 *
 * Related: judge.ts, output-schema.ts, output-validation.ts
 */

// ============================================================================
// Number Utilities
// ============================================================================

/**
 * Clamp a confidence value to the valid range [0, 1].
 * Invalid values default to 0.5 (neutral).
 */
export function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

/**
 * Parse a unit interval value from a string.
 * Handles both decimal (0.5) and percentage (50%) formats.
 * Returns undefined for invalid or empty input.
 */
export function parseUnitInterval(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!value) return undefined;

  const percent = value.endsWith("%");
  const numeric = Number.parseFloat(percent ? value.slice(0, -1) : value);
  if (!Number.isFinite(numeric)) return undefined;

  if (percent || numeric > 1) {
    return clampConfidence(numeric / 100);
  }
  return clampConfidence(numeric);
}

// ============================================================================
// Text Extraction Utilities
// ============================================================================

/**
 * Extract a named field from structured output text.
 * Matches patterns like "FIELD_NAME: value" (case-insensitive).
 */
export function extractField(output: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = output.match(new RegExp(`^\\s*${escaped}\\s*:\\s*(.+)$`, "im"));
  return match?.[1]?.trim();
}

/**
 * Extract multiple lines for a named field.
 * Returns content from the field label until the next major label.
 */
export function extractMultilineField(output: string, name: string): string {
  const pattern = new RegExp(`^${name}\\s*:\\s*$`, "im");
  const lines = output.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => pattern.test(line));

  if (startIndex === -1) {
    return "";
  }

  const fieldLines: string[] = [];
  // Include same-line content if present
  const sameLineMatch = lines[startIndex].match(new RegExp(`^${name}\\s*:\\s*(.*)$`, "i"));
  if (sameLineMatch && sameLineMatch[1].trim()) {
    fieldLines.push(sameLineMatch[1].trim());
  }

  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    // Stop at the next major label
    if (/^(SUMMARY|CLAIM|EVIDENCE|CONFIDENCE|DISCUSSION|RESULT|NEXT_STEP)\s*:/i.test(line)) {
      break;
    }
    fieldLines.push(line);
  }

  return fieldLines.join("\n").trim();
}

// ============================================================================
// Text Analysis Utilities
// ============================================================================

/**
 * Count how many keywords appear in the output text.
 * Used for signal detection in member outputs.
 */
export function countKeywordSignals(output: string, keywords: string[]): number {
  const lowered = output.toLowerCase();
  let count = 0;
  for (const keyword of keywords) {
    if (lowered.includes(keyword.toLowerCase())) {
      count += 1;
    }
  }
  return count;
}
