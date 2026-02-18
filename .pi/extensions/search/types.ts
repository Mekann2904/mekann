/**
 * @abdd.meta
 * path: .pi/extensions/search/types.ts
 * role: 検索拡張機能全体で使用する型定義の集約モジュール
 * why: file_candidates, code_search, sym_index, sym_findツール間で共通する型を一元管理し、型の一貫性と再利用性を確保するため
 * related: file_candidates.ts, code_search.ts, sym_index.ts, sym_find.ts
 * public_api: SearchHints, SearchDetails, SearchResponse<T>, SearchErrorResponse, FileCandidatesInput, FileCandidate, FileCandidatesOutput
 * invariants: SearchErrorResponseはtotal=0, truncated=false, results=[]を固定値として持つ、SearchResponseのtotalはresults.length以上の値を取る
 * side_effects: なし（型定義のみをエクスポートし、実行時処理は存在しない）
 * failure_modes: なし（純粋な型定義ファイルのため実行時エラーは発生しない）
 * @abdd.explain
 * overview: 検索拡張機能の共通型定義ファイル。ジェネリックな検索レスポンス構造と各ツール固有の入出力型を提供する。
 * what_it_does:
 *   - 検索結果の汎用コンテナとしてSearchResponse<T>を定義し、ページネーション情報とエラーハンドリングを統一
 *   - SearchHintsを通じてエージェントへの次アクション提案機能を型化
 *   - FileCandidatesInputでglobパターン、拡張子フィルタ、除外パターン等の検索条件を型定義
 *   - SearchErrorResponseでエラー時の固定構造を型レベルで保証
 * why_it_exists:
 *   - 複数の検索ツール間でレスポンス形式を統一し、エージェントが一貫した方法で結果を処理できるようにするため
 *   - 型安全性を通じて検索APIの契約を明確化し、実装ミスをコンパイル時に検出するため
 * scope:
 *   in: なし（外部依存なし）
 *   out: 検索ツール群で使用される全ての型定義
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
  * 検索結果に対するエージェントへのヒント。
  * @param confidence 検索結果の信頼度
  * @param suggestedNextAction 推奨される次のアクション
  * @param alternativeTools 代替ツールのリスト
  * @param relatedQueries 関連するクエリのリスト
  */
export interface SearchHints {
  confidence: number;
  suggestedNextAction?: "refine_pattern" | "expand_scope" | "try_different_tool" | "increase_limit" | "regenerate_index";
  alternativeTools?: string[];
  relatedQueries?: string[];
}

 /**
  * 検索結果の追加詳細
  * @param hints 検索に関するヒント情報
  */
export interface SearchDetails {
  hints?: SearchHints;
}

 /**
  * 検索ツールの基本レスポンス構造
  * @param total 総件数
  * @param truncated 結果が切り詰められているか
  * @param results 検索結果の配列
  * @param error エラーメッセージ
  * @param details 追加詳細情報
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
  * ファイル候補の検索入力オプション
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
  * ファイルまたはディレクトリの候補
  * @param path - ファイルまたはディレクトリのパス
  * @param type - エントリの種類（"file" または "dir"）
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

 /**
  * ファイル候補の検索レスポンス
  */
export type FileCandidatesOutput = SearchResponse<FileCandidate>;

// ============================================
// code_search Types
// ============================================

 /**
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

 /**
  * コード検索のマッチ結果を表すインターフェース
  * @property file - ファイルパス
  * @property line - 行番号
  * @property column - 列番号
  * @property text - マッチしたテキスト
  * @property context - コンテキスト情報
  */
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

 /**
  * コード検索のサマリー情報
  * @param file ファイルパス
  * @param count ヒット数
  */
export interface CodeSearchSummary {
  file: string;
  count: number;
}

 /**
  * コード検索の出力結果
  * @param total 検索ヒット数の合計
  * @param truncated 結果が切り詰められているかどうか
  * @param summary ファイルごとの検索結果の概要
  * @param results 検索ヒットしたコードの詳細リスト
  * @param error エラーメッセージ（存在する場合）
  * @param details 検索の詳細情報
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
 /**
  * シンボルインデックスの入力オプション
  * @param path インデックス対象のパス
  * @param force 強制的に再生成するかどうか
  * @param cwd 作業ディレクトリ
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
  * シンボルインデックス作成の出力結果
  * @param indexed インデックス化されたシンボル数
  * @param outputPath 出力先のパス
  * @param error エラーメッセージ（任意）
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
  * シンボル検索の入力オプション
  * @param name シンボル名パターン
  * @param kind シンボル種別フィルタ
  * @param file ファイルフィルタ
  * @param limit 結果の最大件数 (デフォルト: 50)
  * @param cwd 作業ディレクトリ
  */
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

 /**
  * シンボル定義を表すインターフェース
  * @param name シンボル名
  * @param kind シンボルの種類
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
  * シンボル検索の出力型
  */
export type SymFindOutput = SearchResponse<SymbolDefinition>;

// ============================================
// CLI Execution Types
// ============================================

 /**
  * CLI実行オプション
  * @param cwd 作業ディレクトリ
  * @param timeout タイムアウト（ミリ秒）
  * @param signal 中断用シグナル
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
  * CLIコマンドの実行結果を表します
  * @param code 終了コード
  * @param stdout 標準出力
  * @param stderr 標準エラー
  * @param timedOut タイムアウトしたかどうか
  * @param killed シグナルによって強制終了されたかどうか
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
  * CLIエラー情報を表すインターフェース
  * @param code 終了コード
  * @param stdout 標準出力
  * @param stderr 標準エラー出力
  * @param command 実行されたコマンド
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
  * 各ツールの利用可能性を表す
  * @param fd fdコマンドが利用可能かどうか
  * @param rg rgコマンドが利用可能かどうか
  * @param ctags ctagsコマンドが利用可能かどうか
  * @param ctagsJson JSON出力対応のctagsが利用可能かどうか
  */
export interface ToolAvailability {
  fd: boolean;
  rg: boolean;
  ctags: boolean;
  ctagsJson: boolean; // universal-ctags with JSON output
}

 /**
  * ツールのバージョン情報
  * @param name ツール名
  * @param version バージョン文字列
  * @param path 実行ファイルのパス
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
  * キャッシュされたシンボルインデックスのエントリ
  * @param name シンボル名
  * @param kind シンボルの種類
  * @param file ファイルパス
  * @param line 行番号
  * @param signature シグネチャ（オプション）
  * @param scope スコープ（オプション）
  * @param pattern パターン（オプション）
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
  * Ripgrep JSON出力フォーマットのサブセット
  * @param type - 一致タイプ
  * @param data - 一致データ（パス、行番号、サブマッチ等）
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
  * ripgrepの検索開始メッセージ
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
  * ripgrepの検索終了メッセージ
  * @param type メッセージタイプ "end"
  * @param data 検索結果の統計情報とパス情報
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
  * ripgrepの出力型（マッチ、開始、終了）
  */
export type RgOutput = RgMatch | RgBegin | RgEnd;

// ============================================
// Incremental Index Types
// ============================================

 /**
  * マニフェストエントリ
  * @param hash ファイルの内容ハッシュ（MD5等）
  * @param mtime 最終更新日時のタイムスタンプ
  * @param shardId このファイルのシンボルが格納されているシャードID
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
  * インデックスマニフェスト構造
  * @type {Record<string, ManifestEntry>}
  */
export type IndexManifest = Record<string, ManifestEntry>;

 /**
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
  * シャードヘッダー構造
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
  * セマンティックインデックスの出力結果
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
  * セマンティック検索の入力パラメータ
  * @param query 検索クエリ（自然言語またはコードスニペット）
  * @param topK 最大結果数（デフォルト: 10）
  * @param threshold 類似度のしきい値（デフォルト: 0.5）
  * @param language プログラミング言語によるフィルタ
  * @param kind シンボルの種類によるフィルタ
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
  * セマンティック検索の結果アイテム
  * @param file 相対ファイルパス
  * @param line 開始行番号
  * @param code コード内容
  * @param similarity 類似度スコア (0-1)
  * @param metadata コードチャンクのメタデータ
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
  * セマンティック検索の出力結果
  * @param total 一致件数の合計
  * @param truncated 結果が切り詰められたかどうか
  * @param results 類似度順にソートされた検索結果
  * @param error 検索失敗時のエラーメッセージ
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
  * セマンティックインデックスのメタデータ
  * @param createdAt インデックス作成時のタイムスタンプ
  * @param updatedAt インデックス最終更新時のタイムスタンプ
  * @param sourceDir インデックス化されたソースディレクトリ
  * @param totalEmbeddings 埋め込みベクトルの総数
  * @param totalFiles インデックス化されたファイルの総数
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
