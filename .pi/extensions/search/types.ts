/**
 * Search Extension Type Definitions
 *
 * Common types used across file_candidates, code_search, sym_index, and sym_find tools.
 */

// ============================================
// Common Response Types
// ============================================

/**
 * Base response structure for all search tools.
 * Includes pagination metadata for truncated results.
 */
export interface SearchResponse<T> {
  total: number;
  truncated: boolean;
  results: T[];
  error?: string;
}

/**
 * Error response structure for consistent error handling.
 */
export interface SearchErrorResponse {
  error: string;
  total: 0;
  truncated: false;
  results: [];
}

// ============================================
// file_candidates Types
// ============================================

export interface FileCandidatesInput {
  /** Glob pattern (e.g., "*.ts") */
  pattern?: string;
  /** Entry type filter */
  type?: "file" | "dir";
  /** Extension filter (e.g., ["ts", "tsx"]) */
  extension?: string[];
  /** Exclusion patterns (e.g., ["node_modules", "dist"]) */
  exclude?: string[];
  /** Maximum directory depth */
  maxDepth?: number;
  /** Result limit (default: 100) */
  limit?: number;
  /** Working directory */
  cwd?: string;
}

export interface FileCandidate {
  path: string;
  type: "file" | "dir";
}

export type FileCandidatesOutput = SearchResponse<FileCandidate>;

// ============================================
// code_search Types
// ============================================

export interface CodeSearchInput {
  /** Search pattern (regex supported) */
  pattern: string;
  /** Search scope path */
  path?: string;
  /** File type filter (ts, js, py, etc.) */
  type?: string;
  /** Case-insensitive search */
  ignoreCase?: boolean;
  /** Literal search (disable regex) */
  literal?: boolean;
  /** Context lines before and after match */
  context?: number;
  /** Result limit (default: 50) */
  limit?: number;
  /** Working directory */
  cwd?: string;
}

export interface CodeSearchMatch {
  file: string;
  line: number;
  column?: number;
  text: string;
  context?: string[];
}

export interface CodeSearchSummary {
  file: string;
  count: number;
}

export interface CodeSearchOutput {
  total: number;
  truncated: boolean;
  summary: CodeSearchSummary[];
  results: CodeSearchMatch[];
  error?: string;
}

// ============================================
// sym_index Types
// ============================================

export interface SymIndexInput {
  /** Target path for indexing */
  path?: string;
  /** Force regeneration */
  force?: boolean;
  /** Working directory */
  cwd?: string;
}

export interface SymIndexOutput {
  indexed: number;
  outputPath: string;
  error?: string;
}

// ============================================
// sym_find Types
// ============================================

export interface SymFindInput {
  /** Symbol name pattern */
  name?: string;
  /** Symbol kind filter (function, class, variable, etc.) */
  kind?: string[];
  /** File filter */
  file?: string;
  /** Result limit (default: 50) */
  limit?: number;
  /** Working directory */
  cwd?: string;
}

export interface SymbolDefinition {
  name: string;
  kind: string;
  file: string;
  line: number;
  signature?: string;
  scope?: string;
}

export type SymFindOutput = SearchResponse<SymbolDefinition>;

// ============================================
// CLI Execution Types
// ============================================

export interface CliOptions {
  /** Working directory */
  cwd?: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Maximum output size in bytes */
  maxOutputSize?: number;
  /** Environment variables */
  env?: Record<string, string>;
}

export interface CliResult {
  /** Exit code */
  code: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Whether the command timed out */
  timedOut: boolean;
  /** Whether the command was killed by signal */
  killed: boolean;
}

export interface CliError extends Error {
  code: number;
  stdout: string;
  stderr: string;
  command: string;
}

// ============================================
// Tool Detection Types
// ============================================

export interface ToolAvailability {
  fd: boolean;
  rg: boolean;
  ctags: boolean;
  ctagsJson: boolean; // universal-ctags with JSON output
}

export interface ToolVersion {
  name: string;
  version: string;
  path: string;
}

// ============================================
// Internal Types
// ============================================

/**
 * Cached symbol index structure.
 * Stored as JSONL file for streaming reads.
 */
export interface SymbolIndexEntry {
  name: string;
  kind: string;
  file: string;
  line: number;
  signature?: string;
  scope?: string;
  pattern?: string;
}

/**
 * Ripgrep JSON output format (subset used).
 * See: https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md
 */
export interface RgMatch {
  type: "match";
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
    absolute_offset: number;
    submatches: Array<{
      match: { text: string };
      start: number;
      end: number;
    }>;
  };
}

export interface RgBegin {
  type: "begin";
  data: {
    path: { text: string };
  };
}

export interface RgEnd {
  type: "end";
  data: {
    path: { text: string };
    stats: {
      elapsed: { secs: number; nanos: number };
      searches: number;
      searches_with_match: number;
      bytes_searched: number;
      bytes_printed: number;
      matched_lines: number;
      matches: number;
    };
  };
}

export type RgOutput = RgMatch | RgBegin | RgEnd;
