/**
 * Search Extension Type Definitions
 *
 * Common types used across file_candidates, code_search, sym_index, and sym_find tools.
 */

// ============================================
// Common Response Types
// ============================================

/**
 * Agent hints for search results.
 */
export interface SearchHints {
  confidence: number;
  suggestedNextAction?: "refine_pattern" | "expand_scope" | "try_different_tool" | "increase_limit" | "regenerate_index";
  alternativeTools?: string[];
  relatedQueries?: string[];
}

/**
 * Additional details in search response.
 */
export interface SearchDetails {
  hints?: SearchHints;
}

/**
 * Base response structure for all search tools.
 * Includes pagination metadata for truncated results.
 */
export interface SearchResponse<T> {
  total: number;
  truncated: boolean;
  results: T[];
  error?: string;
  details?: SearchDetails;
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

/**
 * ファイルまたはディレクトリの候補を表すインターフェース
 *
 * 検索結果として返されるファイルまたはディレクトリの基本情報を定義します。
 *
 * @property path - ファイルまたはディレクトリのパス
 * @property type - エントリの種類（"file" または "dir"）
 */
export interface FileCandidate {
  path: string;
  type: "file" | "dir";
/**
 * /**
 * * コード検索の入力パラメータを定義するインターフェース
 * *
 * * @property pattern - 検索パターン（正規表現サポート）
 * * @property path - 検索対象パス
 * * @property type - ファイルタイプフィルタ（ts, js, pyなど）
 * * @property ignore
 */
}

export type FileCandidatesOutput = SearchResponse<FileCandidate>;

// ============================================
// code_search Types
// ============================================

export interface CodeSearchInput {
  /** Search pattern (regex supported) */
  pattern: string;
  /** Search scope path */
/**
   * コード検索の一致結果を表すインターフェース
   *
   * @property file - 一致が見つかったファイルのパス
   * @property line - 一致した行番号
   * @property column - 一致した列番号（オプション）
   * @property text - 一致したテキスト
   * @property context - 前後のコンテキスト行（オプション）
   */
  path?: string;
  /** File type filter (ts, js, py, etc.) */
  type?: string;
  /** Case-insensitive search */
/**
   * /**
   * * コード検索の出力結果を表すインターフェース
   * *
   * * @property total - 検索に一致した総件数
   * * @property truncated - �
   */
  ignoreCase?: boolean;
  /** Literal search (disable regex) */
  literal?: boolean;
  /** Context lines before and after match */
  context?: number;
  /** Result limit (default: 50) */
/**
   * シンボルインデックス作成の入力パラメータ
   *
   * @property path - インデックス作成対象のパス
   * @property force - 強制的に再生成するかどうか
   * @property cwd - 作業ディレクトリ
   */
  limit?: number;
  /** Exclusion patterns (e.g., ["node_modules", "dist"]). Empty array disables defaults. */
/**
   * シンボルインデックス作成の結果を表すインターフェース
   *
   * @property indexed - インデックス化されたシンボルの数
   * @property outputPath - 生成されたインデックスファイルの出力パス
   * @property error - エラーが発生した場合のエラーメッセージ
   */
  exclude?: string[];
  /** Working directory */
  cwd?: string;
/**
 * シンボル検索の入力パラメータを定義するインターフェース
 *
 * @property name - シンボル名のパターン
 * @property kind - シンボル種別フィルタ（function, class, variable など）
 * @property file - ファイルフィルタ
 * @property limit - 結果の最大件数（デフォルト: 50）
 * @property cwd - 作業ディレクトリ
 */
}

export interface CodeSearchMatch {
  file: string;
/**
   * /**
   * * シンボルの定義情報を表すインターフェース
   * *
   * * コード内のシンボル（関数、クラス、変数など）の位置と詳細情報を保持する。
   * *
   * * @property name - シンボル名
   * * @property kind - シンボルの種類（function, class, variable等）
   * * @property file - 定義されているファイルパス
   * * @property line - 定義行番号
   * * @property signature - シグネチャ情報（省略可能）
   * * @property scope - スコープ情報（省略可能）
   * * @example
   * * const symbol: SymbolDefinition = {
   * *   name: 'myFunction',
   * *   kind:
   */
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
  details?: SearchDetails;
}

// ============================================
// sym_index Types
// ============================================

/**
 * CLIコマンド実行エラーを表すインターフェース
 *
 * Errorを継承し、コマンド実行の失敗に関する詳細情報を保持する。
 *
 * @property code - プロセスの終了コード
 * @property stdout - 標準出力の内容
 * @property stderr - 標準エラー出力の内容
 * @property command - 実行されたコマンド文字列
 * @example
 * try {
/**
  * 外部ツールの利用可否を表すインターフェース
  *
  * fd、rg、ctagsなどの外部CLIツールがシステムにインストールされているかどうかを示します。
  *
  * @property fd - fd（ファイル検索ツール）の利用可否
  * @property rg - rg（ripgrep）の利用可否
/**
   * /**
   * * ツールのバージョン情報を表す
   * *
   * * 検出されたツールの名前、バージョン、実行パスを保持します。
   * *
   * * @property name - ツール名
   * * @property version - ツールのバージョン文字列
   * *
   */
  * @property ctags - ctagsの利用可否
  * @property ctagsJson - JSON出力対応のuniversal-ctagsの利用可否
  * @example
  * const availability: ToolAvailability = {
  *   fd: true,
  *   rg: true,
  *   ctags: false,
  *   ctagsJson: false
  * };
  */
 *   await executeCommand('grep');
 * } catch (error) {
 *   const cliError = error as CliError;
 *   console.error(`Command failed: ${cliError.command}`);
 *   console.error(`Exit code: ${cliError.code}`);
 * }
 */
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
/**
   * ripgrep検索終了メッセージを表すインターフェース
   *
   * 検索完了時に出力され、検索対象のパスと統計情報を含みます。
   * 統計情報には経過時間、検索回数、マッチ数などが含まれます。
   */
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

// ============================================
// Incremental Index Types
// ============================================

/**
 * Manifest entry for tracking file changes.
 * Used to detect which files need re-indexing.
 */
export interface ManifestEntry {
  /**
   * Content hash of the file (MD5 or similar).
   */
  hash: string;

  /**
   * Last modification time timestamp.
   */
  mtime: number;

  /**
   * Shard ID where this file's symbols are stored.
   */
  shardId: number;
}

/**
 * Index manifest structure.
 * Maps file paths to their manifest entries.
 */
export type IndexManifest = Record<string, ManifestEntry>;

/**
 * Index metadata structure.
 * Contains global information about the index.
 */
export interface IndexMetadata {
  /**
   * Timestamp when the index was created.
   */
  createdAt: number;

  /**
   * Timestamp when the index was last updated.
   */
  updatedAt: number;

  /**
   * Source directory that was indexed.
   */
  sourceDir: string;

  /**
   * Total number of symbols in the index.
   */
  totalSymbols: number;

  /**
   * Total number of files indexed.
   */
  totalFiles: number;

  /**
   * Number of shards.
   */
  shardCount: number;

  /**
   * Version of the index format.
   */
  version: number;
}

/**
 * Shard header structure.
 * Each shard file starts with this header.
 */
export interface ShardHeader {
  /**
   * Shard ID (0-indexed).
   */
  id: number;

  /**
   * Number of entries in this shard.
   */
  entryCount: number;

  /**
   * Timestamp when this shard was created.
   */
  createdAt: number;

  /**
   * Timestamp when this shard was last updated.
   */
  updatedAt: number;
}

// ============================================
// Semantic Index Types
// ============================================

/**
 * Code embedding entry for semantic search.
 * Represents a chunk of code with its vector embedding.
 */
export interface CodeEmbedding {
  /** Unique identifier for this embedding */
  id: string;

  /** Relative file path */
  file: string;

  /** Starting line number */
  line: number;

  /** Code content */
  code: string;

  /** Vector embedding */
  embedding: number[];

  /** Metadata about the code chunk */
  metadata: {
    /** Programming language */
    language: string;

    /** Symbol name (if applicable) */
    symbol?: string;

    /** Kind of code chunk */
    kind?: "function" | "class" | "variable" | "chunk";

    /** Embedding dimensions */
    dimensions: number;

    /** Model used for embedding */
    model: string;

    /** Token count (approximate) */
    tokens?: number;
  };
}

/**
 * Semantic index input parameters.
 */
export interface SemanticIndexInput {
  /** Target path for indexing (default: project root) */
  path?: string;

  /** Force regeneration even if index exists */
  force?: boolean;

  /** Chunk size in characters (default: 500) */
  chunkSize?: number;

  /** Overlap between chunks in characters (default: 50) */
  chunkOverlap?: number;

  /** File extensions to include (default: ts,tsx,js,jsx,py,go,rs) */
  extensions?: string[];

  /** Working directory */
  cwd?: string;
}

/**
 * Semantic index output result.
 */
export interface SemanticIndexOutput {
  /** Number of embeddings indexed */
  indexed: number;

  /** Number of files processed */
  files: number;

  /** Path to the generated index file */
  outputPath: string;

  /** Error message if indexing failed */
  error?: string;
}

/**
 * Semantic search input parameters.
 */
export interface SemanticSearchInput {
  /** Search query (natural language or code snippet) */
  query: string;

  /** Maximum number of results (default: 10) */
  topK?: number;

  /** Minimum similarity threshold (default: 0.5) */
  threshold?: number;

  /** Filter by programming language */
  language?: string;

  /** Filter by symbol kind */
  kind?: ("function" | "class" | "variable" | "chunk")[];

  /** Working directory */
  cwd?: string;
}

/**
 * Semantic search result item.
 */
export interface SemanticSearchResult {
  /** Relative file path */
  file: string;

  /** Starting line number */
  line: number;

  /** Code content */
  code: string;

  /** Similarity score (0-1) */
  similarity: number;

  /** Metadata about the code chunk */
  metadata: CodeEmbedding["metadata"];
}

/**
 * Semantic search output result.
 */
export interface SemanticSearchOutput {
  /** Total number of matches */
  total: number;

  /** Whether results were truncated */
  truncated: boolean;

  /** Search results sorted by similarity */
  results: SemanticSearchResult[];

  /** Error message if search failed */
  error?: string;
}

/**
 * Semantic index metadata.
 * Stored alongside the index for tracking.
 */
export interface SemanticIndexMetadata {
  /** Timestamp when the index was created */
  createdAt: number;

  /** Timestamp when the index was last updated */
  updatedAt: number;

  /** Source directory that was indexed */
  sourceDir: string;

  /** Total number of embeddings */
  totalEmbeddings: number;

  /** Total number of files indexed */
  totalFiles: number;

  /** Embedding model used */
  model: string;

  /** Embedding dimensions */
  dimensions: number;

  /** Version of the index format */
  version: number;
}
