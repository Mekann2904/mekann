/**
 * DeferredJsonParser — accumulates streaming JSON chunks without re-parsing.
 *
 * Replaces the O(n²) pattern of:
 *   block.partialJson += delta;
 *   block.arguments = parseStreamingJson(block.partialJson); // full re-parse each time
 *
 * With: accumulate chunks, parse only once when getResult() is called.
 */

export class DeferredJsonParser {
  private chunks: string[] = [];
  private appendCount = 0;
  private parseCount = 0;

  /**
   * Append a delta chunk. No parsing is performed.
   * Returns `this` for chaining.
   */
  append(chunk: string): this {
    if (chunk.length > 0) {
      this.chunks.push(chunk);
    }
    this.appendCount++;
    return this;
  }

  /**
   * Get the parsed result. Parses accumulated chunks exactly once.
   * Returns {} for empty, whitespace-only, or malformed input.
   */
  getResult(): Record<string, unknown> {
    if (this.chunks.length === 0) return {};

    const full = this.chunks.join("");
    if (full.trim() === "") return {};

    this.parseCount++;
    try {
      return JSON.parse(full) as Record<string, unknown>;
    } catch {
      // Try repairing: close unclosed braces/brackets
      try {
        const repaired = this.attemptRepair(full);
        return JSON.parse(repaired) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
  }

  /**
   * Number of append() calls since last reset.
   */
  getAppendCount(): number {
    return this.appendCount;
  }

  /**
   * Number of parse attempts since last reset.
   * Should be much less than appendCount for O(1) amortized parsing.
   */
  getParseCount(): number {
    return this.parseCount;
  }

  /**
   * Reset all accumulated state.
   */
  reset(): void {
    this.chunks = [];
    this.appendCount = 0;
    this.parseCount = 0;
  }

  private attemptRepair(json: string): string {
    // Count unmatched open braces/brackets
    let openBraces = 0;
    let openBrackets = 0;
    let inString = false;
    let escape = false;

    for (const ch of json) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        if (inString) escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") openBraces++;
      else if (ch === "}") openBraces--;
      else if (ch === "[") openBrackets++;
      else if (ch === "]") openBrackets--;
    }

    // Append closing characters
    let repaired = json;
    // Remove trailing partial content after last complete value
    if (inString) repaired += '"';

    // Trim trailing incomplete key-value pairs
    // e.g., '{"a": 1, "b' -> '{"a": 1}'
    repaired = this.trimTrailingIncomplete(repaired);

    // Recount after trimming
    openBraces = 0;
    openBrackets = 0;
    inString = false;
    escape = false;
    for (const ch of repaired) {
      if (escape) { escape = false; continue; }
      if (ch === "\\") { if (inString) escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") openBraces++;
      else if (ch === "}") openBraces--;
      else if (ch === "[") openBrackets++;
      else if (ch === "]") openBrackets--;
    }

    for (let i = 0; i < openBrackets; i++) repaired += "]";
    for (let i = 0; i < openBraces; i++) repaired += "}";

    return repaired;
  }

  private trimTrailingIncomplete(json: string): string {
    // Look for trailing comma followed by incomplete content
    // e.g., '{"a": 1, ' or '{"a": 1, "b'
    const trailingCommaIdx = this.findLastCommaOutsideStrings(json);
    if (trailingCommaIdx === -1) return json;

    // Check if everything after the comma looks incomplete
    const afterComma = json.slice(trailingCommaIdx + 1).trim();
    if (afterComma === "") {
      return json.slice(0, trailingCommaIdx);
    }

    // Check if it's an incomplete key (unclosed string) or incomplete value
    if (this.hasUnclosedString(afterComma)) {
      // Remove the incomplete key-value pair
      return json.slice(0, trailingCommaIdx);
    }

    return json;
  }

  private findLastCommaOutsideStrings(json: string): number {
    let inString = false;
    let escape = false;
    let lastComma = -1;

    for (let i = 0; i < json.length; i++) {
      const ch = json[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\") { if (inString) escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === ",") lastComma = i;
    }

    return lastComma;
  }

  private hasUnclosedString(str: string): boolean {
    let inString = false;
    let escape = false;
    for (const ch of str) {
      if (escape) { escape = false; continue; }
      if (ch === "\\") { if (inString) escape = true; continue; }
      if (ch === '"') inString = !inString;
    }
    return inString;
  }
}
