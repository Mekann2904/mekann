/**
 * @abdd.meta
 * path: .pi/extensions/search/utils/output.ts
 * role: 検索ツール統一出力フォーマッター
 * why: 異なる検索バックエンド（fd, ripgrep等）の出力を統一フォーマットに変換し、エージェントが解釈可能な形式で提供するため
 * related: types.ts, metrics.ts, constants.ts, formatUtils.ts
 * public_api: truncateResults, truncateHead, parseFdOutput, formatFileCandidates
 * invariants:
 *   - truncateResults/truncateHeadは元配列を変更せず新しい配列を返す
 *   - SearchResponseのtotalは常に元の結果数を示す
 *   - truncatedがtrueの場合、results.length < totalが成立する
 * side_effects: なし（純粋関数のみ）
 * failure_modes:
 *   - stdoutが不正な形式の場合、空配列または部分的な結果を返す
 *   - output.errorが設定されている場合、フォーマット結果はエラーメッセージのみ
 * @abdd.explain
 * overview: 検索結果のトランケーション、パース、フォーマット処理を提供するユーティリティモジュール
 * what_it_does:
 *   - 検索結果配列を指定上限で切り詰め、メタデータ（total, truncated）を付与
 *   - fdコマンド出力をFileCandidate配列に変換
 *   - FileCandidate検索結果を人間可読文字列にフォーマット
 *   - 先頭・末尾からのトランケーション戦略を提供
 * why_it_exists:
 *   - 検索結果のサイズ制限によりトークン消費を抑制
 *   - バックエンド間の差異を吸収し一貫した出力形式を提供
 *   - エージェントが結果の切捨て状態を認識できるようにする
 * scope:
 *   in: 検索コマンドの生出力文字列、型付けされた検索結果配列、制限値（limit）
 *   out: SearchResponse<T>オブジェクト、人間可読フォーマット文字列
 */

/**
 * Output Formatting Utilities
 *
 * Provides consistent output formatting for all search tools:
 * - Result truncation with metadata
 * - Text summarization
 * - Error formatting
 * - Enhanced output with agent hints and statistics
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
import type { SearchMetrics } from "./metrics.js";
import { DEFAULT_LIMIT, DEFAULT_CODE_SEARCH_LIMIT, DEFAULT_SYMBOL_LIMIT } from "./constants.js";

// ============================================
// Result Truncation
// ============================================

 /**
  * 検索結果を制限し、メタデータを含める
  * @param results 検索結果の配列
  * @param limit 上限数
  * @returns 検索レスポンス
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
  * fdの出力をFileCandidate配列に変換
  * @param stdout fdコマンドの標準出力
  * @param type "file"または"dir"
  * @returns 変換後のFileCandidate配列
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
  * ファイル候補を整形する
  * @param output 検索結果
  * @returns 整形された文字列
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
  * ripgrepのJSON出力を解析します。
  * @param stdout - ripgrepの出力文字列
  * @param contextLines - コンテキスト行数
  * @returns 構造化されたマッチ情報とサマリー
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
  * サマリーマップを配列に変換し、カウント順にソートする
  * @param summary - ファイルパスとカウントのマップ
  * @returns ソートされたコード検索サマリーの配列
  */
export function summarizeResults(
  summary: Map<string, number>
): CodeSearchSummary[] {
  return Array.from(summary.entries())
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count);
}

 /**
  * コード検索結果を表示用に整形する
  * @param output - 検索結果オブジェクト
  * @returns 整形された文字列
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
  * ctagsのJSON出力をパースする
  * @param stdout ctagsの出力文字列
  * @returns パースされたシンボル定義の配列
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
  * 従来のctags形式を解析します。
  * @param stdout ctagsの出力文字列
  * @returns 解析されたシンボル定義の配列
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
  * シンボルの検索結果をフォーマットする
  * @param output シンボル定義の検索結果
  * @returns フォーマットされた文字列
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
  * 標準化されたエラーレスポンスを作成する
  * @param error エラーメッセージ
  * @returns エラー情報を含む検索レスポンス
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
  * コード検索のエラーレスポンスを作成する
  * @param error エラーメッセージ
  * @returns エラー情報を含むコード検索結果
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
  * エラーを整形して表示用文字列を返す
  * @param tool ツール名
  * @param error エラー情報
  * @returns 整形されたエラーメッセージ
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
  * 特殊文字をエスケープする
  * @param text エスケープ対象の文字列
  * @returns エスケープされた文字列
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
  * テキストを省略記号付きで切り詰める。
  * @param text 対象のテキスト
  * @param maxLength 最大長
  * @returns 切り詰められたテキスト
  */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

 /**
  * 絶対パスから相対パスを計算する
  * @param absolute 絶対パス
  * @param cwd カレントワーキングディレクトリ
  * @returns 相対パス、または絶対パス
  */
export function relativePath(absolute: string, cwd: string): string {
  if (absolute.startsWith(cwd)) {
    const rel = absolute.slice(cwd.length);
    return rel.startsWith("/") ? rel.slice(1) : rel;
  }
  return absolute;
}

// ============================================
// Enhanced Output Types
// ============================================

 /**
  * エージェント向けの推奨次回アクション
  */
export type SuggestedNextAction =
  | "refine_pattern"      // Pattern too broad, narrow it down
  | "expand_scope"        // Pattern too narrow, broaden search
  | "try_different_tool"  // Current tool not optimal
  | "increase_limit"      // Results truncated, may need more
  | "regenerate_index";   // Index may be stale

 /**
  * 検索結果のヒント情報
  * @param confidence 結果の信頼度（0.0-1.0）
  * @param suggestedNextAction 次に推奨されるアクション
  * @param alternativeTools 代替候補のツールリスト
  */
export interface SearchHints {
  /**
   * Confidence in the results (0.0-1.0).
   * Lower values indicate uncertain or incomplete results.
   */
  confidence: number;

  /**
   * Suggested next action if results are unsatisfactory.
   */
  suggestedNextAction?: SuggestedNextAction;

  /**
   * Alternative tools that might be more effective.
   */
  alternativeTools?: string[];

  /**
   * Related queries that might be useful.
   */
  relatedQueries?: string[];
}

 /**
  * 検索操作に関する統計情報。
  * @param filesSearched 検索または列挙されたファイル数
  * @param durationMs 実行時間（ミリ秒）
  * @param indexHitRate インデックス使用時のヒット率
  */
export interface SearchStats {
  /**
   * Number of files searched or enumerated.
   */
  filesSearched: number;

  /**
   * Execution time in milliseconds.
   */
  durationMs: number;

  /**
   * Index hit rate if index was used.
   */
  indexHitRate?: number;
}

 /**
  * エージェントのヒントや統計情報を含む拡張出力
  * @param {T[]} results 検索結果
  * @param {number} total 切り捨て前の結果の総数
  * @param {boolean} truncated 上限により結果が切り捨てられたかどうか
  */
export interface EnhancedOutput<T> {
  /**
   * Search results.
   */
  results: T[];

  /**
   * Total number of results before truncation.
   */
  total: number;

  /**
   * Whether results were truncated due to limit.
   */
  truncated: boolean;

  /**
   * Error message if operation failed.
   */
  error?: string;

  /**
   * Agent hints for result interpretation.
   */
  hints: SearchHints;

  /**
   * Search operation statistics.
   */
  stats: SearchStats;
}

// ============================================
// Enhanced Output Factories
// ============================================

 /**
  * 検索レスポンスから拡張出力を生成する
  * @param response 基本的な検索レスポンス
  * @param metrics 検索に関するメトリクス
  * @param hints 検索ヒントの一部（オプション）
  * @returns 拡張された出力オブジェクト
  */
export function enhanceOutput<T>(
  response: SearchResponse<T>,
  metrics: SearchMetrics,
  hints?: Partial<SearchHints>
): EnhancedOutput<T> {
  const defaultHints: SearchHints = {
    confidence: calculateConfidence(response, metrics),
    ...hints,
  };

  return {
    results: response.results,
    total: response.total,
    truncated: response.truncated,
    error: response.error,
    hints: defaultHints,
    stats: {
      filesSearched: metrics.filesSearched,
      durationMs: metrics.durationMs,
      indexHitRate: metrics.indexHitRate,
    },
  };
}

/**
 * Calculate confidence score based on results and metrics.
 */
function calculateConfidence<T>(
  response: SearchResponse<T>,
  metrics: SearchMetrics
): number {
  // No results = low confidence
  if (response.total === 0) {
    return 0.1;
  }

  // Error = very low confidence
  if (response.error) {
    return 0.0;
  }

  // Few results = moderate confidence
  if (response.total < 5) {
    return 0.6;
  }

  // Many results with truncation = high confidence but may need refinement
  if (response.truncated) {
    return 0.8;
  }

  // Good number of results without truncation
  return 0.9;
}

 /**
  * 検索結果に基づき推奨される次のアクションを決定します。
  * @param response 検索レスポンス
  * @param pattern 検索パターン（省略可）
  * @returns 推奨されるアクション、または条件に合致しない場合はundefined
  */
export function suggestNextAction<T>(
  response: SearchResponse<T>,
  pattern?: string
): SuggestedNextAction | undefined {
  // No results - try expanding scope
  if (response.total === 0) {
    return "expand_scope";
  }

  // Too many results truncated - suggest refinement
  if (response.truncated && response.total > DEFAULT_LIMIT * 2) {
    return "refine_pattern";
  }

  // Moderate truncation - might need more results
  if (response.truncated) {
    return "increase_limit";
  }

  return undefined;
}

 /**
  * 検索結果からヒントを生成する
  * @param response 検索レスポンス
  * @param metrics 検索メトリクス
  * @param toolName ツール名
  * @returns 生成されたヒント
  */
export function createHints<T>(
  response: SearchResponse<T>,
  metrics: SearchMetrics,
  toolName: string
): SearchHints {
  const confidence = calculateConfidence(response, metrics);
  const suggestedNextAction = suggestNextAction(response);

  const hints: SearchHints = {
    confidence,
    suggestedNextAction,
  };

  // Suggest alternative tools based on context
  if (response.total === 0 || confidence < 0.5) {
    hints.alternativeTools = getAlternativeTools(toolName);
  }

  return hints;
}

/**
 * Get alternative tools for a given tool.
 */
function getAlternativeTools(toolName: string): string[] {
  const alternatives: Record<string, string[]> = {
    file_candidates: ["code_search", "sym_find"],
    code_search: ["file_candidates", "sym_find"],
    sym_find: ["code_search", "file_candidates"],
    sym_index: [],
  };

  return alternatives[toolName] ?? [];
}

// ============================================
// Simple Hints Factory (Lightweight Version)
// ============================================

 /**
  * シンプルな信頼度を計算する
  * @param count - 検索結果の件数
  * @param truncated - 結果が切り詰められているか
  * @returns 信頼度（0.0〜1.0）
  */
export function calculateSimpleConfidence(count: number, truncated: boolean): number {
  if (count === 0) return 0.1;
  if (count > 50 || truncated) return 0.9;
  return Math.min(0.5 + count * 0.01, 0.85);
}

 /**
  * シンプルなパラメータからヒントを作成
  * @param toolName - 検索ツールの名前
  * @param resultCount - 返された結果の件数
  * @param truncated - 結果が切り詰められたかどうか
  * @param queryPattern - 使用された検索パターン
  * @returns 生成された検索ヒント
  */
export function createSimpleHints(
  toolName: string,
  resultCount: number,
  truncated: boolean,
  queryPattern?: string
): SearchHints {
  const confidence = calculateSimpleConfidence(resultCount, truncated);

  const hints: SearchHints = {
    confidence,
  };

  if (resultCount === 0) {
    hints.suggestedNextAction = "refine_pattern";
    hints.alternativeTools = getAlternativeTools(toolName);
  } else if (truncated) {
    hints.suggestedNextAction = "increase_limit";
  }

  // Could add related queries based on queryPattern in future
  if (queryPattern && resultCount === 0) {
    hints.relatedQueries = generateRelatedQueries(queryPattern);
  }

  return hints;
}

/**
 * Generate related query suggestions based on the original query.
 */
function generateRelatedQueries(query: string): string[] {
  const related: string[] = [];

  // Try removing common prefixes
  if (query.includes("*")) {
    related.push(query.replace(/\*/g, ""));
  }

  // Try adding common suffixes
  if (!query.includes(".")) {
    related.push(`${query}.ts`);
    related.push(`${query}.js`);
  }

  // Try camelCase conversion
  if (query.includes("-") || query.includes("_")) {
    const camelCased = query
      .replace(/[-_](.)/g, (_, c) => c.toUpperCase())
      .replace(/[-_]/g, "");
    related.push(camelCased);
  }

  return related.slice(0, 3);
}

// ============================================
// Enhanced Output Formatting
// ============================================

 /**
  * 拡張出力を表示用にフォーマットします。
  * @param output 拡張出力オブジェクト
  * @param formatResult 結果を文字列化する関数
  * @returns フォーマットされた文字列
  */
export function formatEnhancedOutput<T>(
  output: EnhancedOutput<T>,
  formatResult: (result: T) => string
): string {
  const lines: string[] = [];

  // Header with count and status
  const status = output.error
    ? "Error"
    : output.truncated
      ? "Truncated"
      : "Complete";
  lines.push(`Results: ${output.total} (${status})`);
  lines.push("");

  // Error if present
  if (output.error) {
    lines.push(`Error: ${output.error}`);
    lines.push("");
  }

  // Results
  for (const result of output.results) {
    lines.push(formatResult(result));
  }

  // Truncation notice
  if (output.truncated) {
    lines.push("");
    lines.push(`... and ${output.total - output.results.length} more results`);
  }

  // Hints
  if (output.hints.confidence < 0.7 || output.hints.suggestedNextAction) {
    lines.push("");
    lines.push("--- Hints ---");
    lines.push(`Confidence: ${(output.hints.confidence * 100).toFixed(0)}%`);

    if (output.hints.suggestedNextAction) {
      lines.push(`Suggestion: ${formatSuggestedAction(output.hints.suggestedNextAction)}`);
    }

    if (output.hints.alternativeTools && output.hints.alternativeTools.length > 0) {
      lines.push(`Alternative tools: ${output.hints.alternativeTools.join(", ")}`);
    }
  }

  // Stats
  lines.push("");
  lines.push("--- Statistics ---");
  lines.push(`Duration: ${output.stats.durationMs.toFixed(0)}ms`);
  lines.push(`Files searched: ${output.stats.filesSearched}`);

  if (output.stats.indexHitRate !== undefined) {
    lines.push(`Index hit rate: ${(output.stats.indexHitRate * 100).toFixed(1)}%`);
  }

  return lines.join("\n");
}

/**
 * Format suggested action for display.
 */
function formatSuggestedAction(action: SuggestedNextAction): string {
  const descriptions: Record<SuggestedNextAction, string> = {
    refine_pattern: "Narrow down the search pattern for more specific results",
    expand_scope: "Broaden the search pattern or remove filters",
    try_different_tool: "Try using a different search tool",
    increase_limit: "Increase the result limit to see more matches",
    regenerate_index: "The symbol index may be outdated, run sym_index",
  };

  return descriptions[action] ?? action;
}
