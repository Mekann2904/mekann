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
 * Type for DEFAULT_EXCLUDES array items
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
