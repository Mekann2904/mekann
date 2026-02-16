/**
 * Output Formatting Utilities
 *
 * Provides consistent output formatting for all search tools:
 * - Result truncation with metadata
 * - Text summarization
 * - Error formatting
 */

import type {
  SearchResponse,
  FileCandidate,
  CodeSearchMatch,
  CodeSearchOutput,
  CodeSearchSummary,
  SymbolDefinition,
  RgMatch,
  RgOutput,
} from "../types";

// ============================================
// Result Truncation
// ============================================

/**
 * Truncate results to limit and compute metadata.
 */
export function truncateResults<T>(
  results: T[],
  limit: number
): SearchResponse<T> {
  const total = results.length;
  const truncated = total > limit;
  const truncatedResults = truncated ? results.slice(0, limit) : results;

  return {
    total,
    truncated,
    results: truncatedResults,
  };
}

/**
 * Truncate from head (keep last N items).
 * Useful for keeping most recent/relevant results.
 */
export function truncateHead<T>(
  results: T[],
  limit: number
): SearchResponse<T> {
  const total = results.length;
  const truncated = total > limit;
  const truncatedResults = truncated ? results.slice(-limit) : results;

  return {
    total,
    truncated,
    results: truncatedResults,
  };
}

// ============================================
// File Candidates Formatting
// ============================================

/**
 * Parse fd output into FileCandidate array.
 */
export function parseFdOutput(
  stdout: string,
  type: "file" | "dir" = "file"
): FileCandidate[] {
  const lines = stdout.trim().split("\n").filter(Boolean);
  return lines.map((path) => ({
    path,
    type,
  }));
}

/**
 * Format file candidates for display.
 */
export function formatFileCandidates(output: SearchResponse<FileCandidate>): string {
  const lines: string[] = [];

  if (output.error) {
    lines.push(`Error: ${output.error}`);
    return lines.join("\n");
  }

  lines.push(`Found ${output.total} entries${output.truncated ? " (truncated)" : ""}`);
  lines.push("");

  for (const entry of output.results) {
    const prefix = entry.type === "dir" ? "[D]" : "[F]";
    lines.push(`${prefix} ${entry.path}`);
  }

  return lines.join("\n");
}

// ============================================
// Code Search Formatting
// ============================================

/**
 * Parse ripgrep JSON output into structured matches.
 */
export function parseRgOutput(
  stdout: string,
  contextLines: number = 0
): { matches: CodeSearchMatch[]; summary: Map<string, number> } {
  const matches: CodeSearchMatch[] = [];
  const summary = new Map<string, number>();
  const currentContext: string[] = [];
  let lastFile = "";

  const lines = stdout.trim().split("\n").filter(Boolean);

  for (const line of lines) {
    let parsed: RgOutput;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (parsed.type === "match") {
      const data = (parsed as RgMatch).data;
      const file = data.path.text;
      const matchText = data.lines.text.trimEnd();

      // Track file counts
      summary.set(file, (summary.get(file) || 0) + 1);

      // Extract column from first submatch
      let column: number | undefined;
      if (data.submatches && data.submatches.length > 0) {
        column = data.submatches[0].start + 1; // 1-indexed
      }

      // Build context
      let context: string[] | undefined;
      if (contextLines > 0 && currentContext.length > 0) {
        context = [...currentContext];
      }

      matches.push({
        file,
        line: data.line_number,
        column,
        text: matchText,
        context,
      });

      // Reset context after match
      currentContext.length = 0;
      lastFile = file;
    } else if (parsed.type === "begin") {
      // New file starting
      currentContext.length = 0;
    }
  }

  return { matches, summary };
}

/**
 * Convert summary map to array and sort by count.
 */
export function summarizeResults(
  summary: Map<string, number>
): CodeSearchSummary[] {
  return Array.from(summary.entries())
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Format code search results for display.
 */
export function formatCodeSearch(output: CodeSearchOutput): string {
  const lines: string[] = [];

  if (output.error) {
    lines.push(`Error: ${output.error}`);
    return lines.join("\n");
  }

  lines.push(`Found ${output.total} matches in ${output.summary.length} files${output.truncated ? " (truncated)" : ""}`);
  lines.push("");

  // Show summary by file
  if (output.summary.length > 0) {
    lines.push("Files:");
    for (const { file, count } of output.summary.slice(0, 10)) {
      lines.push(`  ${file}: ${count} match${count !== 1 ? "es" : ""}`);
    }
    if (output.summary.length > 10) {
      lines.push(`  ... and ${output.summary.length - 10} more files`);
    }
    lines.push("");
  }

  // Show actual matches
  lines.push("Matches:");
  for (const match of output.results) {
    lines.push(`  ${match.file}:${match.line}:${match.column || 1}`);
    lines.push(`    ${match.text}`);
    if (match.context && match.context.length > 0) {
      for (const ctx of match.context) {
        lines.push(`    ${ctx}`);
      }
    }
  }

  return lines.join("\n");
}

// ============================================
// Symbol Formatting
// ============================================

/**
 * Parse ctags JSON output into SymbolDefinition array.
 */
export function parseCtagsOutput(stdout: string): SymbolDefinition[] {
  const symbols: SymbolDefinition[] = [];
  const lines = stdout.trim().split("\n").filter(Boolean);

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);

      // ctags JSON format fields:
      // name: symbol name
      // path: file path
      // line: line number
      // kind: symbol kind (function, class, etc.)
      // signature: function signature (if available)
      // scope: parent scope (class name, etc.)
      // pattern: regex pattern for the definition

      symbols.push({
        name: entry.name || "",
        kind: entry.kind || "unknown",
        file: entry.path || "",
        line: entry.line || 0,
        signature: entry.signature,
        scope: entry.scope,
      });
    } catch {
      // Skip malformed lines
    }
  }

  return symbols;
}

/**
 * Parse traditional ctags format as fallback.
 */
export function parseCtagsTraditional(stdout: string): SymbolDefinition[] {
  const symbols: SymbolDefinition[] = [];
  const lines = stdout.trim().split("\n").filter(Boolean);

  for (const line of lines) {
    // Skip comments
    if (line.startsWith("!")) continue;

    // Format: name\tfile\tpattern;kind or name\tfile\tline;"\tkind
    const parts = line.split("\t");
    if (parts.length < 3) continue;

    const name = parts[0];
    const file = parts[1];

    // Find kind field (usually last field like "f" for function)
    let kind = "unknown";
    let lineNum = 0;

    for (const part of parts.slice(2)) {
      // Line number format: "123;"
      const lineMatch = part.match(/^(\d+);$/);
      if (lineMatch) {
        lineNum = parseInt(lineMatch[1], 10);
        continue;
      }

      // Kind format: single letter or word
      if (/^[a-zA-Z]+$/.test(part)) {
        kind = part;
      }
    }

    if (name && file) {
      symbols.push({
        name,
        kind,
        file,
        line: lineNum,
      });
    }
  }

  return symbols;
}

/**
 * Format symbol search results for display.
 */
export function formatSymbols(output: SearchResponse<SymbolDefinition>): string {
  const lines: string[] = [];

  if (output.error) {
    lines.push(`Error: ${output.error}`);
    return lines.join("\n");
  }

  lines.push(`Found ${output.total} symbols${output.truncated ? " (truncated)" : ""}`);
  lines.push("");

  // Group by kind
  const byKind = new Map<string, SymbolDefinition[]>();
  for (const sym of output.results) {
    const list = byKind.get(sym.kind) || [];
    list.push(sym);
    byKind.set(sym.kind, list);
  }

  for (const [kind, syms] of byKind) {
    lines.push(`${kind}:`);
    for (const sym of syms) {
      const scope = sym.scope ? `${sym.scope}::` : "";
      const sig = sym.signature ? ` ${sym.signature}` : "";
      lines.push(`  ${scope}${sym.name}${sig}`);
      lines.push(`    ${sym.file}:${sym.line}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ============================================
// Error Formatting
// ============================================

/**
 * Create a standardized error response.
 */
export function createErrorResponse<T>(error: string): SearchResponse<T> {
  return {
    total: 0,
    truncated: false,
    results: [],
    error,
  };
}

/**
 * Create a standardized error response for code search.
 */
export function createCodeSearchError(error: string): CodeSearchOutput {
  return {
    total: 0,
    truncated: false,
    summary: [],
    results: [],
    error,
  };
}

/**
 * Format error for display.
 */
export function formatError(tool: string, error: unknown): string {
  if (error instanceof Error) {
    return `${tool} error: ${error.message}`;
  }
  return `${tool} error: ${String(error)}`;
}

// ============================================
// Text Utilities
// ============================================

/**
 * Escape special characters for display.
 */
export function escapeText(text: string): string {
  return text.replace(/[\n\r\t]/g, (char) => {
    switch (char) {
      case "\n": return "\\n";
      case "\r": return "\\r";
      case "\t": return "\\t";
      default: return char;
    }
  });
}

/**
 * Truncate text with ellipsis.
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

/**
 * Get relative path from absolute path.
 */
export function relativePath(absolute: string, cwd: string): string {
  if (absolute.startsWith(cwd)) {
    const rel = absolute.slice(cwd.length);
    return rel.startsWith("/") ? rel.slice(1) : rel;
  }
  return absolute;
}
