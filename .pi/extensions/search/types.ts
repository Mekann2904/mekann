/**
 * @abdd.meta
 * path: .pi/extensions/search/types.ts
 * role: 検索拡張機能のデータ構造定義
 * why: file_candidates, code_search, sym_index, sym_find 間で共通利用される型を一元管理し、インターフェースの整合性を保つため
 * related: .pi/extensions/search/file_candidates.ts, .pi/extensions/search/code_search.ts, .pi/extensions/search/sym_index.ts
 * public_api: SearchHints, SearchDetails, SearchResponse, SearchErrorResponse, FileCandidatesInput, FileCandidate, FileCandidatesOutput
 * invariants:
 * - SearchResponse.resultsは総件数(total)以下である
 * - SearchErrorResponseは常にtotal=0, results=[]を持つ
 * - FileCandidate.typeは"file"または"dir"のいずれかである
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: 検索関連ツール間で共有されるTypeScriptの型定義ファイル
 * what_it_does:
 * - 検索結果の共通レスポンス型(SearchResponse)とエラー型(SearchErrorResponse)を定義する
 * - 検索ヒントや次のアクション提案に関する型(SearchHints, SearchDetails)を提供する
 * - ファイル候補検索(file_candidates)の入力・出力型を定義する
 * - コード検索(code_search)の入力型を定義する
 * why_it_exists:
 * - 複数の検索ツールで同一のデータ構造を利用するため
 * - 型定義を集中管理することでメンテナンス性と一貫性を確保するため
 * scope:
 * in: TypeScriptコンパイラ、検索拡張機能モジュール
 * out: 検索ツールの関数シグネチャ、レスポンスオブジェクト
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
 * コンテキスト予算警告レベル
 * @summary 予算警告レベルを取得
 */
export type ContextBudgetWarning = "ok" | "approaching" | "exceeds_recommended";

/**
 * 検索結果のヒント情報
 * @summary ヒント情報を取得
 * @param confidence 結果の信頼度（0.0-1.0）
 * @param suggestedNextAction 次に推奨されるアクション
 * @param alternativeTools 代替候補のツールリスト
 * @param estimatedTokens 推定トークン数
 * @param contextBudgetWarning コンテキスト予算警告レベル
 */
export interface SearchHints {
  confidence: number;
  suggestedNextAction?: "refine_pattern" | "expand_scope" | "try_different_tool" | "increase_limit" | "regenerate_index";
  alternativeTools?: string[];
  relatedQueries?: string[];
  /** Estimated token count for the results */
  estimatedTokens?: number;
  /** Context budget warning level */
  contextBudgetWarning?: ContextBudgetWarning;
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
 * シンボル検索の詳細レベル
 * @summary 詳細レベルを指定
 */
export type DetailLevel = "full" | "signature" | "outline";

/**
 * シンボル検索の入力パラメータ
 * @summary 検索入力パラメータ
 * @param name シンボル名
 * @param kind 種類
 * @param file ファイルパス
 * @param limit 結果の上限数
 * @param detailLevel 詳細レベル（full/singature/outline）
 * @param cwd 作業ディレクトリ
 */
export interface SymFindInput {
  /** Symbol name pattern */
  name?: string;
  /** Symbol kind filter (function, class, variable, etc.) */
  kind?: string[];
  /** File filter */
  file?: string;
  /** Scope filter (e.g., class name to find methods within) */
  scope?: string;
  /** Result limit (default: 50) */
  limit?: number;
  /** Detail level: full (default), signature (method signatures only), outline (structure only) */
  detailLevel?: DetailLevel;
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

// ============================================
// context_explore Types
// ============================================

/**
 * 階層的文脈検索のステップ定義
 * @summary 検索ステップ定義
 */
export interface ContextExploreStep {
  /** Step type */
  type: "find_class" | "find_methods" | "search_code" | "get_callers";
  /** Search query pattern */
  query?: string;
  /** Reference to previous step result ($0 = first result, $1 = second, etc.) */
  classRef?: string;
  /** Scope filter */
  scope?: string;
}

/**
 * 階層的文脈検索の入力パラメータ
 * @summary 文脈検索入力
 */
export interface ContextExploreInput {
  /** Chain of search steps to execute */
  steps: ContextExploreStep[];
  /** Token budget for results (default: 15000) */
  contextBudget?: number;
  /** Compression mode: full (default), signature, summary */
  compression?: "full" | "signature" | "summary";
  /** Working directory */
  cwd?: string;
}

/**
 * 単一ステップの実行結果
 * @summary ステップ結果
 */
export interface ContextExploreStepResult {
  /** Step index */
  stepIndex: number;
  /** Step type */
  type: ContextExploreStep["type"];
  /** Result count */
  count: number;
  /** Estimated tokens for this step */
  estimatedTokens: number;
  /** Results (may be compressed) */
  results: unknown[];
}

/**
 * 階層的文脈検索の出力
 * @summary 文脈検索出力
 */
export interface ContextExploreOutput {
  /** Total results across all steps */
  total: number;
  /** Whether results were compressed */
  compressed: boolean;
  /** Total estimated tokens */
  estimatedTokens: number;
  /** Token budget used */
  contextBudget: number;
  /** Results per step */
  steps: ContextExploreStepResult[];
  /** Error message if failed */
  error?: string;
  /** Details with hints */
  details?: SearchDetails;
}

// ============================================
// search_class Types
// ============================================

/**
 * クラス検索の入力パラメータ
 * @summary クラス検索入力
 */
export interface SearchClassInput {
  /** Class name pattern (supports wildcards: *, ?) */
  name: string;
  /** Include method list (default: true) */
  includeMethods?: boolean;
  /** Detail level: full (default), signature, outline */
  detailLevel?: DetailLevel;
  /** File path filter */
  file?: string;
  /** Maximum results (default: 20) */
  limit?: number;
}

/**
 * クラス内メソッド情報
 * @summary メソッド情報
 */
export interface ClassMethod {
  /** Method name */
  name: string;
  /** Method signature */
  signature?: string;
  /** Line number */
  line: number;
  /** Kind (method, function) */
  kind: string;
}

/**
 * クラス検索結果の単一エントリ
 * @summary クラス検索エントリ
 */
export interface ClassSearchResult {
  /** Class name */
  name: string;
  /** Class kind (class, interface, struct) */
  kind: string;
  /** File path */
  file: string;
  /** Line number */
  line: number;
  /** Class signature (if available) */
  signature?: string;
  /** Methods within the class (if includeMethods=true) */
  methods?: ClassMethod[];
}

/**
 * クラス検索の出力結果
 * @summary クラス検索出力
 */
export interface SearchClassOutput {
  /** Total number of matches */
  total: number;
  /** Whether results were truncated */
  truncated: boolean;
  /** Search results */
  results: ClassSearchResult[];
  /** Error message if search failed */
  error?: string;
  /** Details with hints */
  details?: SearchDetails;
}

// ============================================
// search_method Types
// ============================================

/**
 * メソッド検索の入力パラメータ
 * @summary メソッド検索入力
 */
export interface SearchMethodInput {
  /** Method name pattern (supports wildcards: *, ?) */
  method: string;
  /** Filter by class name */
  className?: string;
  /** Include implementation code (default: false) */
  includeImplementation?: boolean;
  /** Detail level: full (default), signature, outline */
  detailLevel?: DetailLevel;
  /** File path filter */
  file?: string;
  /** Maximum results (default: 30) */
  limit?: number;
}

/**
 * メソッド検索結果の単一エントリ
 * @summary メソッド検索エントリ
 */
export interface MethodSearchResult {
  /** Method name */
  name: string;
  /** Method kind (method, function) */
  kind: string;
  /** File path */
  file: string;
  /** Line number */
  line: number;
  /** Method signature */
  signature?: string;
  /** Containing class/scope */
  scope?: string;
  /** Implementation code (if includeImplementation=true) */
  implementation?: string;
}

/**
 * メソッド検索の出力結果
 * @summary メソッド検索出力
 */
export interface SearchMethodOutput {
  /** Total number of matches */
  total: number;
  /** Whether results were truncated */
  truncated: boolean;
  /** Search results */
  results: MethodSearchResult[];
  /** Error message if search failed */
  error?: string;
  /** Details with hints */
  details?: SearchDetails;
}

// ============================================
// fault_localize Types
// ============================================

/**
 * SBFLアルゴリズムの種類
 * @summary アルゴリズム種別
 */
export type SBFLAlgorithm = "ochiai" | "tarantula" | "op2";

/**
 * バグ位置特定の入力パラメータ
 * @summary バグ位置特定入力
 */
export interface FaultLocalizeInput {
  /** Test execution command (e.g., "npm test", "pytest") */
  testCommand: string;
  /** List of failing test names (auto-detected if omitted) */
  failingTests?: string[];
  /** List of passing test names */
  passingTests?: string[];
  /** Suspiciousness threshold (default: 0.5) */
  suspiciousnessThreshold?: number;
  /** Path to coverage report file */
  coverageReport?: string;
  /** SBFL algorithm to use (default: ochiai) */
  algorithm?: SBFLAlgorithm;
}

/**
 * 単一の怪しいコード位置
 * @summary 怪しい位置
 */
export interface SuspiciousLocation {
  /** Method/function name */
  method: string;
  /** File path */
  file: string;
  /** Line number */
  line: number;
  /** Suspiciousness score (0.0-1.0) */
  suspiciousness: number;
  /** Times covered by failing tests */
  coveredByFailing: number;
  /** Times covered by passing tests */
  coveredByPassing: number;
}

/**
 * バグ位置特定の出力結果
 * @summary バグ位置特定出力
 */
export interface FaultLocalizeResult {
  /** Suspicious locations sorted by suspiciousness (descending) */
  locations: SuspiciousLocation[];
  /** Algorithm used */
  algorithm: SBFLAlgorithm;
  /** Total number of tests analyzed */
  totalTests: number;
  /** Number of failing tests */
  failingTestCount: number;
  /** Number of passing tests */
  passingTestCount: number;
  /** Whether test execution was actually performed */
  testExecuted: boolean;
  /** Error message if localization failed */
  error?: string;
  /** Details with hints */
  details?: SearchDetails;
}

// ============================================
// search_history Types
// ============================================

/**
 * 検索履歴の入力パラメータ
 * @summary 履歴入力
 */
export interface SearchHistoryInput {
  /** Action to perform */
  action: "get" | "clear" | "save_query";
  /** Session filter */
  session?: "current" | "previous" | "all";
  /** Maximum entries to return (default: 50) */
  limit?: number;
  /** Query to save (for save_query action) */
  query?: string;
  /** Tool name (for save_query action) */
  tool?: string;
}

/**
 * 履歴クエリ情報
 * @summary 履歴クエリ
 */
export interface HistoryQuery {
  /** Query string */
  query: string;
  /** Tool name */
  tool: string;
  /** Timestamp */
  timestamp: string;
  /** Result count */
  resultCount: number;
}

/**
 * 検索履歴の出力結果
 * @summary 履歴出力
 */
export interface SearchHistoryResult {
  /** History queries */
  queries: HistoryQuery[];
  /** Session filter applied */
  session: string;
  /** Total count (before limit) */
  total: number;
  /** Available sessions */
  sessions?: HistorySession[];
  /** Error message if operation failed */
  error?: string;
  /** Details with hints */
  details?: SearchDetails;
}

/**
 * セッション情報
 * @summary セッション情報
 */
export interface HistorySession {
  /** Session ID */
  id: string;
  /** Session start time */
  startTime: number;
  /** Session end time (undefined for current session) */
  endTime?: number;
  /** Number of entries in this session */
  entryCount: number;
}

// ============================================
// ast_summary Types
// ============================================

/**
 * ASTノードの種類
 * @summary ASTノード種別
 */
export type AstNodeKind = "class" | "function" | "method" | "variable" | "interface" | "enum";

/**
 * ASTノード情報
 * @summary ASTノード定義
 */
export interface AstNode {
  /** Node name */
  name: string;
  /** Node kind */
  kind: AstNodeKind;
  /** Signature (for functions/methods) */
  signature?: string;
  /** Line number */
  line?: number;
  /** Child nodes */
  children?: AstNode[];
  /** Called functions/methods */
  calls?: string[];
}

/**
 * AST要約の入力パラメータ
 * @summary AST要約入力
 */
export interface AstSummaryInput {
  /** File path to analyze */
  file: string;
  /** Output format (default: tree) */
  format?: "tree" | "flat" | "json";
  /** Depth level for tree display (default: 2) */
  depth?: number;
  /** Include type information (default: true) */
  includeTypes?: boolean;
  /** Include call relationships (default: false) */
  includeCalls?: boolean;
}

/**
 * AST要約の統計情報
 * @summary AST統計
 */
export interface AstSummaryStats {
  /** Total classes */
  totalClasses: number;
  /** Total functions */
  totalFunctions: number;
  /** Total methods */
  totalMethods: number;
  /** Total variables */
  totalVariables: number;
}

/**
 * AST要約の出力結果
 * @summary AST要約出力
 */
export interface AstSummaryResult {
  /** File path */
  file: string;
  /** Output format */
  format: string;
  /** Root AST nodes */
  root: AstNode[];
  /** Statistics */
  stats: AstSummaryStats;
  /** Error message if failed */
  error?: string;
}

// ============================================
// merge_results Types
// ============================================

/**
 * 検索ソースの種類
 * @summary ソース種別
 */
export type SearchSourceType = "semantic" | "symbol" | "code";

/**
 * マージ対象の検索ソース
 * @summary 検索ソース定義
 */
export interface MergeSource {
  /** Source type */
  type: SearchSourceType;
  /** Search query */
  query: string;
  /** Weight for this source (default: 1.0) */
  weight?: number;
}

/**
 * マージ戦略
 * @summary マージ戦略種別
 */
export type MergeStrategy = "weighted" | "rank_fusion" | "interleave";

/**
 * 統合検索結果の入力パラメータ
 * @summary 統合検索入力
 */
export interface MergeResultsInput {
  /** Search sources to merge */
  sources: MergeSource[];
  /** Deduplicate results (default: true) */
  deduplicate?: boolean;
  /** Maximum results (default: 20) */
  limit?: number;
  /** Merge strategy (default: weighted) */
  mergeStrategy?: MergeStrategy;
}

/**
 * 統合された検索結果
 * @summary 統合結果エントリ
 */
export interface MergedResult {
  /** File path */
  file: string;
  /** Line number */
  line?: number;
  /** Content snippet */
  content: string;
  /** Combined score */
  score: number;
  /** Source types that found this result */
  sources: string[];
}

/**
 * 統合検索の統計情報
 * @summary 統合統計
 */
export interface MergeResultsStats {
  /** Total sources queried */
  totalSources: number;
  /** Total results before deduplication */
  totalResults: number;
  /** Duplicates removed */
  duplicatesRemoved: number;
}

/**
 * 統合検索の出力結果
 * @summary 統合検索出力
 */
export interface MergeResultsResult {
  /** Merged results sorted by score */
  merged: MergedResult[];
  /** Statistics */
  stats: MergeResultsStats;
  /** Error message if failed */
  error?: string;
}
