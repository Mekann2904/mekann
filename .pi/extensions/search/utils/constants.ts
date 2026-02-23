/**
 * @abdd.meta
 * path: .pi/extensions/search/utils/constants.ts
 * role: 検索機能拡張におけるシステム設定と制限値の定義
 * why: 検索ロジック全体で一貫したデフォルト挙動と安全制約を保証するため
 * related: .pi/extensions/search/utils/indexer.ts, .pi/extensions/search/tools/codeSearch.ts, .pi/extensions/search/tools/fileSearch.ts
 * public_api: DEFAULT_EXCLUDES, DEFAULT_LIMIT, DEFAULT_CODE_SEARCH_LIMIT, DEFAULT_IGNORE_CASE, INDEX_DIR_NAME
 * invariants: DEFAULT_CODE_SEARCH_LIMITはMAX_CODE_SEARCH_LIMIT以下である
 * side_effects: なし（定数エクスポートのみ）
 * failure_modes: なし
 * @abdd.explain
 * overview: 検索ツール共通の除外パターン、結果数制限、インデックス設定を集中管理する定数ファイル
 * what_it_does:
 *   - node_modulesやdistなど、検索対象から除外するデフォルトのパス・パターンを定義する
 *   - 一般検索、コード検索、シンボル検索それぞれのデフォルト結果数と上限値を設定する
 *   - 大文字小文字の区別有無、検索深度、インデックス格納ディレクトリ名などを定義する
 * why_it_exists:
 *   - 設定値を分散させず、マジックナンバーを排除して保守性を高めるため
 *   - 検索パフォーマンスとモデルコンテキスト消費を防ぐための制限を一元的に適用するため
 * scope:
 *   in: 外部モジュールからのインポートなし（純粋な定数定義）
 *   out: 検索ユーティリティ、ツール実装ファイルへ設定値をエクスポート
 */

/**
 * Search Extension Constants
 *
 * Shared constants for all search tools including default exclusion patterns,
 * limits, and configuration values.
 */

// ============================================
// Default Exclusion Patterns
// ============================================

/**
 * Standard directories and patterns to exclude from search operations.
 * These are commonly generated directories, build outputs, cache directories,
 * and minified files that are rarely useful to search.
 */
export const DEFAULT_EXCLUDES = [
	// Node.js
	"node_modules",

	// Version control
	".git",

	// Build outputs
	"dist",
	"build",
	"coverage",

	// Framework-specific
	".next",
	".nuxt",

	// Language-specific
	"vendor",        // PHP, Go
	"__pycache__",   // Python
	".cache",        // Various

	// Minified files (usually not useful to search)
	"*.min.js",
	"*.min.css",

	// pi-specific directories
	".pi/search",
	".pi/analytics",
] as const;

/**
 * デフォルト除外要素
 * @summary デフォルト除外要素型
 * @returns {string} 除外パス文字列
 */
export type DefaultExclude = (typeof DEFAULT_EXCLUDES)[number];

// ============================================
// Default Limits
// ============================================

/**
 * Default result limit for search operations.
 * This provides a reasonable balance between completeness and performance.
 */
export const DEFAULT_LIMIT = 100;

/**
 * Default result limit for code search operations.
 * Code search results tend to be more verbose, so we use a lower limit.
 */
export const DEFAULT_CODE_SEARCH_LIMIT = 50;

/**
 * Hard cap for code_search result limit.
 * Prevents oversized tool responses that can exhaust model context.
 */
export const MAX_CODE_SEARCH_LIMIT = 80;

/**
 * Hard cap for context lines before/after each match in code_search.
 * Keeps each match payload small even when users request large context.
 */
export const MAX_CODE_SEARCH_CONTEXT = 3;

/**
 * Default result limit for symbol search operations.
 */
export const DEFAULT_SYMBOL_LIMIT = 50;

// ============================================
// Default Search Options
// ============================================

/**
 * Default case sensitivity setting.
 * Case-insensitive search is more useful in most cases.
 */
export const DEFAULT_IGNORE_CASE = true;

/**
 * Maximum directory depth for file enumeration.
 * Unlimited by default (undefined means no limit).
 */
export const DEFAULT_MAX_DEPTH: number | undefined = undefined;

// ============================================
// Index Configuration
// ============================================

/**
 * Directory name for search index storage.
 * Relative to project root.
 */
export const INDEX_DIR_NAME = ".pi/search";

/**
 * Symbol index file name.
 */
export const SYMBOL_INDEX_FILE = "symbols.jsonl";

/**
 * Index metadata file name.
 */
export const INDEX_META_FILE = "index-meta.json";

/**
 * Manifest file for incremental indexing.
 * Maps file paths to their content hashes.
 */
export const INDEX_MANIFEST_FILE = "manifest.json";

/**
 * Shard directory name within INDEX_DIR_NAME.
 */
export const SHARD_DIR_NAME = "symbols";

/**
 * Maximum entries per shard file.
 * This prevents individual shard files from becoming too large.
 */
export const MAX_ENTRIES_PER_SHARD = 10000;

// ============================================
// CLI Configuration
// ============================================

/**
 * Default timeout for CLI commands (in milliseconds).
 */
export const DEFAULT_CLI_TIMEOUT = 30_000;

/**
 * Maximum output size for CLI commands (in bytes).
 */
export const DEFAULT_MAX_OUTPUT_SIZE = 10 * 1024 * 1024; // 10MB
