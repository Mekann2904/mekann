/**
 * @abdd.meta
 * path: .pi/extensions/search/types.ts
 * role: 検索拡張機能で共有される型定義の集約モジュール
 * why: file_candidates, code_search, sym_index, sym_findツール間でデータ構造を統一し、型安全性と保守性を確保するため
 * related: .pi/extensions/search/file_candidates.ts, .pi/extensions/search/code_search.ts, .pi/extensions/search/sym_index.ts
 * public_api: SearchHints, SearchDetails, SearchResponse, SearchErrorResponse, FileCandidatesInput, FileCandidate, FileCandidatesOutput
 * invariants:
 *   - SearchResponseのtotalはresultsの長さと一致する
 *   - SearchErrorResponseのtotalは常に0、truncatedは常にfalseである
 *   - FileCandidate.typeは"file"または"dir"のいずれかである
 * side_effects: なし（純粋な型定義モジュールである）
 * failure_modes: 型定義の不整合による実行時エラー、インターフェースの変更忘れによる他モジュールとの非互換
 * @abdd.explain
 * overview: 検索関連ツール全体で利用される共通のレスポンス構造、入力オプション、およびエンティティ型を定義する
 * what_it_does:
 *   - 検索結果の共通フォーマット（SearchResponse）を提供する
 *   - 検索結果のメタデータやヒント（SearchHints）を定義する
 *   - ファイル候補検索（file_candidates）の入力と出力の型を定義する
 * why_it_exists:
 *   - 複数の検索ツール間で重複する型定義を排除し、DRY原則を守るため
 *   - 検索結果の標準的な構造（件数、切り詰めフラグ、エラー情報）を統一するため
 * scope:
 *   in: なし
 *   out: 検索機能を利用するすべてのツールおよびAIエージェント
 */

/**
 * Search Extension Type Definitions
 *
 * Common types used across file_candidates, code_search, sym_index, and sym_find tools.
 */

// ============================================
// Common Response Types
// ============================================

/**
 * 共通で使用される型定義
 * @summary 共通型定義
 */
export interface SearchHints {
  confidence: number;
  suggestedNextAction?: "refine_pattern" | "expand_scope" | "try_different_tool" | "increase_limit" | "regenerate_index";
  alternativeTools?: string[];
  relatedQueries?: string[];
}

/**
 * 検索に関するヒント情報
 * @summary 検索ヒントを取得
 * @param suggestedNextAction 推奨される次のアクション
 * @param alternativeTools 代替ツールのリスト
 * @param relatedQueries 関連するクエリのリスト
 */
export interface SearchDetails {
  hints?: SearchHints;
}

/**
 * 検索結果の追加詳細
 * @summary 検索詳細を取得
 * @param hints 検索に関するヒント情報
 */
export interface SearchResponse<T> {
  total: number;
  truncated: boolean;
  results: T[];
  error?: string;
  details?: SearchDetails;
}

/**
 * 検索エラーレスポンス
 * @summary エラーを返す
 * @param error エラーメッセージ
 * @param total 総件数（常に0）
 * @param truncated 結果が切り詰められているか（常にfalse）
 * @param results 結果配列（常に空）
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

/**
 * ファイル候補入力
 * @summary ファイル候補検索
 * @param pattern Globパターン
 * @param type エントリタイプのフィルタ
 * @param extension 拡張子フィルタ
 * @param exclude 除外パターン
 * @param maxDepth 最大ディレクトリ深さ
 * @param limit 結果の上限
 * @param cwd 作業ディレクトリ
 */
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
 * @summary ファイル候補定義
 * @description ファイルまたはディレクトリの候補
 * @param path - ファイルまたはディレクトリのパス
 * @param type - エントリの種類（"file" または "dir"）
 */
export interface FileCandidate {
  path: string;
  type: "file" | "dir";
}

 /**
  * ファイル候補の検索レスポンス
  */
export type FileCandidatesOutput = SearchResponse<FileCandidate>;

// ============================================
// code_search Types
// ============================================

/**
 * @summary コード検索入力
 * コード検索の入力パラメータ
 * @param pattern - 検索パターン（正規表現対応）
 * @param path - 検索対象のパス
 * @param type - ファイルタイプフィルタ（ts, js, pyなど）
 * @param ignoreCase - 大文字小文字を区別するか
 * @param literal - リテラル文字列として検索するか
 */
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
  /** Exclusion patterns (e.g., ["node_modules", "dist"]). Empty array disables defaults. */
  exclude?: string[];
  /** Working directory */
  cwd?: string;
}

/**
 * コード検索マッチ
 * @summary マッチ情報を出力
 * @param file - ファイルパス
 * @param line - 行番号
 * @param column - カラム番号
 * @param text - マッチしたテキスト
 * @param context - コンテキスト行
 * @returns マッチ情報オブジェクト
 */
export interface CodeSearchMatch {
  file: string;
  line: number;
  column?: number;
  text: string;
  context?: string[];
}

/**
 * コード検索サマリ
 * @summary サマリを出力
 * @param file - ファイルパス
 * @param count - ヒット件数
 * @returns サマリ情報
 */
export interface CodeSearchSummary {
  file: string;
  count: number;
}

/**
 * コード検索出力
 * @summary 検索結果を出力
 * @param total - 総ヒット件数
 * @param truncated - 結果切り捨てフラグ
 * @param summary - サマリ情報
 * @param results - 検索結果リスト
 * @param error - エラー情報
 * @returns 出力結果オブジェクト
 */
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
 *   await executeCommand('grep');
 * } catch (error) {
 *   const cliError = error as CliError;
 *   console.error(`Command failed: ${cliError.command}`);
 *   console.error(`Exit code: ${cliError.code}`);
 * }
 */
/**
 * シンボルインデックス入力
 * @summary インデックス生成入力
 * @param path - インデックス対象パス
 * @param force - 強制再生成フラグ
 * @param cwd - 作業ディレクトリ
 * @returns 入力設定オブジェクト
 */
export interface SymIndexInput {
  /** Target path for indexing */
  path?: string;
  /** Force regeneration */
  force?: boolean;
  /** Working directory */
  cwd?: string;
}

/**
 * シンボルインデックス出力
 * @summary インデックスを出力
 * @param indexed - インデックス化されたシンボル
 * @param outputPath - 出力先パス
 * @param error - エラー情報
 * @returns 出力結果オブジェクト
 */
export interface SymIndexOutput {
  indexed: number;
  outputPath: string;
  error?: string;
}

// ============================================
// sym_find Types
// ============================================

/**
 * シンボル検索の入力パラメータ
 * @summary 検索入力パラメータ
 * @param name シンボル名
 * @param kind 種類
 * @param file ファイルパス
 * @param limit 結果の上限数
 * @param cwd 作業ディレクトリ
 */
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

/**
 * シンボルの定義情報
 * @summary シンボル定義情報
 * @param name シンボル名
 * @param kind 種類
 * @param file ファイルパス
 * @param line 行番号
 * @param signature シグネチャ
 * @param scope スコープ
 */
export interface SymbolDefinition {
  name: string;
  kind: string;
  file: string;
  line: number;
  signature?: string;
  scope?: string;
}

/**
 * シンボル検索の出力結果
 * @summary シンボル検索結果
 */
export type SymFindOutput = SearchResponse<SymbolDefinition>;

// ============================================
// CLI Execution Types
// ============================================

/**
 * CLI実行時のオプション設定
 * @summary CLI実行オプション
 * @param cwd 作業ディレクトリ
 * @param timeout タイムアウト時間（ミリ秒）
 * @param signal 中断シグナル
 * @param maxOutputSize 最大出力サイズ（バイト）
 * @param env 環境変数
 */
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

/**
 * CLI実行結果を表す
 * @summary CLI実行結果
 */
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

/**
 * CLIコマンド実行時のエラー情報を表します
 * @summary CLIエラー情報
 */
export interface CliError extends Error {
  code: number;
  stdout: string;
  stderr: string;
  command: string;
}

// ============================================
// Tool Detection Types
// ============================================

/**
 * 外部ツールの利用可能性を表します
 * @summary ツール利用可否状態
 */
export interface ToolAvailability {
  fd: boolean;
  rg: boolean;
  ctags: boolean;
  ctagsJson: boolean; // universal-ctags with JSON output
}

/**
 * 外部ツールのバージョン情報を表します
 * @summary ツールバージョン情報
 */
export interface ToolVersion {
  name: string;
  version: string;
  path: string;
}

// ============================================
// Internal Types
// ============================================

/**
 * シンボルインデックスのエントリを表します
 * @summary シンボルインデックス情報
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
 * 正規表現マッチ結果を表します
 * @summary 正規表現マッチ結果
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

/**
 * 検索開始メッセージ型
 * @summary 開始通知を送信
 * @param type メッセージタイプ "begin"
 * @param data 検索対象のパス情報
 */
export interface RgBegin {
  type: "begin";
  data: {
    path: { text: string };
  };
}

/**
 * 検索終了メッセージ型
 * @summary 終了通知を送信
 */
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

/**
 * ripgrep出力の共用体型
 * @summary 出力結果を判定
 * @type {RgMatch | RgBegin | RgEnd}
 */
export type RgOutput = RgMatch | RgBegin | RgEnd;

// ============================================
// Incremental Index Types
// ============================================

/**
 * マニフェストエントリ情報
 * @summary エントリ情報を取得
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
 * インデックスマニフェスト型
 * @summary マニフェストを取得
 * @type {Record<string, ManifestEntry>}
 */
export type IndexManifest = Record<string, ManifestEntry>;

/**
 * @summary インデックスメタデータ
 * インデックスのメタデータ構造
 * @param createdAt インデックスが作成されたタイムスタンプ
 * @param updatedAt インデックスが最後に更新されたタイムスタンプ
 * @param sourceDir インデックス化されたソースディレクトリ
 * @param totalSymbols インデックス内のシンボルの総数
 * @param totalFiles インデックス内のファイルの総数
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
 * シャードヘッダー定義
 * @summary シャードヘッダー取得
 * @param id シャードID（0から始まるインデックス）
 * @param entryCount このシャード内のエントリ数
 * @param createdAt 作成日時（タイムスタンプ）
 * @param updatedAt 更新日時（タイムスタンプ）
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
  * コード埋め込みエントリ（セマンティック検索用）
  * @param id 一意の識別子
  * @param file 相対ファイルパス
  * @param line 開始行番号
  * @param code コード内容
  * @param embedding ベクトル埋め込み
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
  * セマンティックインデックスの入力パラメータ
  * @param path インデックス対象のパス（デフォルト: プロジェクトルート）
  * @param force インデックスが存在しても再生成するかどうか
  * @param chunkSize チャンクサイズ（文字数、デフォルト: 500）
  * @param chunkOverlap チャンク間のオーバーラップ（文字数、デフォルト: 50）
  * @param extensions 対象とするファイル拡張子（デフォルト: ts,tsx,js,jsx,py,go,rs）
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
 * セマンティックインデックスの出力
 * @summary 出力結果を返却
 * @param indexed インデックス化された埋め込みの数
 * @param files 処理されたファイル数
 * @param outputPath 生成されたインデックスファイルのパス
 * @param error インデックス作成失敗時のエラーメッセージ
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
 * 検索の入力設定
 * @summary 検索入力定義
 * @param query 検索クエリ文字列
 * @param topK 返す最大件数
 * @param threshold 類似度の閾値
 * @param language プログラミング言語
 * @param kind シンボル種別でフィルタ
 * @param cwd 作業ディレクトリ
 * @returns 検索入力オブジェクト
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
 * 単一の検索結果
 * @summary 検索結果定義
 * @param file ファイルパス
 * @param line 行番号
 * @param code コードスニペット
 * @param similarity 類似度スコア
 * @param metadata コードチャンクのメタデータ
 * @returns 検索結果オブジェクト
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
 * 検索結果の出力形式
 * @summary 検索出力定義
 * @param total 総ヒット数
 * @param truncated 結果が切り詰められたか
 * @param results 類似度ソートされた結果
 * @param error 検索失敗時のエラー
 * @returns 検索出力データ
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
 * インデックスのメタデータ
 * @summary メタデータ定義
 * @param createdAt 作成日時
 * @param updatedAt 更新日時
 * @param sourceDir ソースディレクトリ
 * @param totalEmbeddings 総埋め込み数
 * @param totalFiles 総ファイル数
 * @returns メタデータオブジェクト
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
