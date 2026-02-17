/**
 * Search Result Integration Helpers
 *
 * Utilities for merging and ranking results from multiple search tools:
 * - Unified result format
 * - Relevance ranking
 * - Deduplication
 */

import type { CodeSearchMatch, SymbolDefinition, FileCandidate } from "../types";

// ============================================
// Types
// ============================================

/**
 * Unified search result format across all tools.
 */
export interface UnifiedSearchResult {
	/**
	 * File path (always present).
	 */
	file: string;

	/**
	 * Line number (if applicable).
	 */
	line?: number;

	/**
	 * Column number (if applicable).
	 */
	column?: number;

	/**
	 * Code snippet or symbol name.
	 */
	snippet?: string;

	/**
	 * Relevance score (higher is more relevant).
	 */
	score: number;

	/**
	 * Tools that found this result.
	 */
	sources: string[];

	/**
	 * Result type.
	 */
	type: "file" | "match" | "symbol";

	/**
	 * Additional metadata.
	 */
	metadata?: Record<string, unknown>;
}

/**
 * Options for merging results.
 */
export interface MergeOptions {
	/**
	 * Whether to boost results found by multiple tools.
	 */
	boostMultiSource: boolean;

	/**
	 * Multiplier for multi-source boost.
	 */
	multiSourceBoost: number;

	/**
	 * Maximum results to return.
	 */
	limit: number;
}

/**
 * Options for ranking results.
 */
export interface RankOptions {
	/**
	 * Query to rank against.
	 */
	query: string;

	/**
	 * Weight for exact matches.
	 */
	exactMatchWeight: number;

	/**
	 * Weight for partial matches.
	 */
	partialMatchWeight: number;

	/**
	 * Weight for file path matches.
	 */
	pathMatchWeight: number;
}

// ============================================
// Default Configuration
// ============================================

/**
 * Default merge options.
 */
export const DEFAULT_MERGE_OPTIONS: MergeOptions = {
	boostMultiSource: true,
	multiSourceBoost: 1.5,
	limit: 100,
};

/**
 * Default ranking options.
 */
export const DEFAULT_RANK_OPTIONS: RankOptions = {
	query: "",
	exactMatchWeight: 1.0,
	partialMatchWeight: 0.5,
	pathMatchWeight: 0.3,
};

// ============================================
// Result Converters
// ============================================

/**
 * Convert FileCandidate to UnifiedSearchResult.
 */
export function fileCandidateToUnified(
	candidate: FileCandidate,
	source: string = "file_candidates"
): UnifiedSearchResult {
	return {
		file: candidate.path,
		score: 0.5, // Base score for file matches
		sources: [source],
		type: "file",
		metadata: {
			entryType: candidate.type,
		},
	};
}

/**
 * Convert CodeSearchMatch to UnifiedSearchResult.
 */
export function codeSearchMatchToUnified(
	match: CodeSearchMatch,
	source: string = "code_search"
): UnifiedSearchResult {
	return {
		file: match.file,
		line: match.line,
		column: match.column,
		snippet: match.text,
		score: 0.7, // Base score for code matches
		sources: [source],
		type: "match",
		metadata: {
			context: match.context,
		},
	};
}

/**
 * Convert SymbolDefinition to UnifiedSearchResult.
 */
export function symbolDefinitionToUnified(
	symbol: SymbolDefinition,
	source: string = "sym_find"
): UnifiedSearchResult {
	return {
		file: symbol.file,
		line: symbol.line,
		snippet: `${symbol.kind} ${symbol.scope ? symbol.scope + "::" : ""}${symbol.name}${symbol.signature || ""}`,
		score: 0.8, // Base score for symbol matches
		sources: [source],
		type: "symbol",
		metadata: {
			name: symbol.name,
			kind: symbol.kind,
			signature: symbol.signature,
			scope: symbol.scope,
		},
	};
}

// ============================================
// Result Merging
// ============================================

/**
 * Merge multiple UnifiedSearchResult arrays.
 * Deduplicates by file:line combination and combines sources.
 */
export function mergeSearchResults(
	resultArrays: UnifiedSearchResult[][],
	options: Partial<MergeOptions> = {}
): UnifiedSearchResult[] {
	const opts = { ...DEFAULT_MERGE_OPTIONS, ...options };
	const merged = new Map<string, UnifiedSearchResult>();

	for (const results of resultArrays) {
		for (const result of results) {
			// Create a unique key for deduplication
			const key = createResultKey(result);

			const existing = merged.get(key);
			if (existing) {
				// Combine sources
				for (const source of result.sources) {
					if (!existing.sources.includes(source)) {
						existing.sources.push(source);
					}
				}

				// Boost score for multi-source results
				if (opts.boostMultiSource && existing.sources.length > 1) {
					existing.score = existing.score * opts.multiSourceBoost;
				}

				// Merge metadata
				if (result.metadata) {
					existing.metadata = {
						...existing.metadata,
						...result.metadata,
					};
				}
			} else {
				merged.set(key, { ...result });
			}
		}
	}

	return Array.from(merged.values());
}

/**
 * Create a unique key for a result.
 * Uses file + line + column for uniqueness.
 */
function createResultKey(result: UnifiedSearchResult): string {
	if (result.line !== undefined) {
		return `${result.file}:${result.line}:${result.column ?? 0}`;
	}
	return result.file;
}

// ============================================
// Result Ranking
// ============================================

/**
 * Rank results by relevance to the query.
 */
export function rankByRelevance(
	results: UnifiedSearchResult[],
	query: string
): UnifiedSearchResult[] {
	const normalizedQuery = query.toLowerCase();
	const queryTerms = normalizedQuery.split(/\s+/).filter(Boolean);

	// Score each result
	const scored = results.map((result) => ({
		...result,
		score: result.score + calculateRelevanceScore(result, normalizedQuery, queryTerms),
	}));

	// Sort by score descending
	return scored.sort((a, b) => b.score - a.score);
}

/**
 * Calculate relevance score for a result.
 */
function calculateRelevanceScore(
	result: UnifiedSearchResult,
	normalizedQuery: string,
	queryTerms: string[]
): number {
	let score = 0;

	// Check snippet for matches
	if (result.snippet) {
		const normalizedSnippet = result.snippet.toLowerCase();

		// Exact query match
		if (normalizedSnippet.includes(normalizedQuery)) {
			score += 1.0;
		}

		// Individual term matches
		for (const term of queryTerms) {
			if (normalizedSnippet.includes(term)) {
				score += 0.2;
			}
		}
	}

	// Check file path for matches
	const normalizedFile = result.file.toLowerCase();
	if (normalizedFile.includes(normalizedQuery)) {
		score += 0.5;
	}

	// Check metadata (symbol name, etc.)
	if (result.metadata?.name) {
		const normalizedName = String(result.metadata.name).toLowerCase();
		if (normalizedName === normalizedQuery) {
			score += 2.0; // Exact name match is very relevant
		} else if (normalizedName.includes(normalizedQuery)) {
			score += 0.8;
		}
	}

	return score;
}

// ============================================
// Deduplication
// ============================================

/**
 * Remove duplicate results based on file:line.
 * Keeps the result with the highest score.
 */
export function deduplicateResults(results: UnifiedSearchResult[]): UnifiedSearchResult[] {
	const seen = new Map<string, UnifiedSearchResult>();

	for (const result of results) {
		const key = createResultKey(result);
		const existing = seen.get(key);

		if (!existing || result.score > existing.score) {
			seen.set(key, result);
		}
	}

	return Array.from(seen.values());
}

// ============================================
// Complete Integration Pipeline
// ============================================

/**
 * Process results from multiple tools into a unified, ranked list.
 */
export function integrateSearchResults(
	fileCandidates: FileCandidate[] = [],
	codeMatches: CodeSearchMatch[] = [],
	symbols: SymbolDefinition[] = [],
	query: string = "",
	options: Partial<MergeOptions> = {}
): UnifiedSearchResult[] {
	const opts = { ...DEFAULT_MERGE_OPTIONS, ...options };

	// Convert all results to unified format
	const unifiedFile = fileCandidates.map((c) => fileCandidateToUnified(c));
	const unifiedCode = codeMatches.map((m) => codeSearchMatchToUnified(m));
	const unifiedSymbols = symbols.map((s) => symbolDefinitionToUnified(s));

	// Merge
	const merged = mergeSearchResults(
		[unifiedFile, unifiedCode, unifiedSymbols],
		opts
	);

	// Rank
	const ranked = rankByRelevance(merged, query);

	// Deduplicate (in case ranking changed order)
	const deduped = deduplicateResults(ranked);

	// Apply limit
	return deduped.slice(0, opts.limit);
}

// ============================================
// Utility Functions
// ============================================

/**
 * Group results by file.
 */
export function groupByFile(results: UnifiedSearchResult[]): Map<string, UnifiedSearchResult[]> {
	const grouped = new Map<string, UnifiedSearchResult[]>();

	for (const result of results) {
		const list = grouped.get(result.file) || [];
		list.push(result);
		grouped.set(result.file, list);
	}

	return grouped;
}

/**
 * Filter results by type.
 */
export function filterByType(
	results: UnifiedSearchResult[],
	type: "file" | "match" | "symbol"
): UnifiedSearchResult[] {
	return results.filter((r) => r.type === type);
}

/**
 * Filter results by file pattern.
 */
export function filterByFilePattern(
	results: UnifiedSearchResult[],
	pattern: string
): UnifiedSearchResult[] {
	const regex = new RegExp(pattern.replace(/\*/g, ".*"));
	return results.filter((r) => regex.test(r.file));
}

/**
 * Format unified result for display.
 */
export function formatUnifiedResult(result: UnifiedSearchResult): string {
	const parts: string[] = [];

	// File and line
	if (result.line !== undefined) {
		parts.push(`${result.file}:${result.line}`);
	} else {
		parts.push(result.file);
	}

	// Type
	parts.push(`[${result.type}]`);

	// Sources
	parts.push(`(from: ${result.sources.join(", ")})`);

	// Score
	parts.push(`score: ${result.score.toFixed(2)}`);

	// Snippet
	if (result.snippet) {
		parts.push(`- ${result.snippet}`);
	}

	return parts.join(" ");
}

/**
 * Format multiple unified results for display.
 */
export function formatUnifiedResults(results: UnifiedSearchResult[]): string {
	const lines: string[] = [];

	lines.push(`Found ${results.length} unified results`);
	lines.push("");

	for (const result of results) {
		lines.push(formatUnifiedResult(result));
	}

	return lines.join("\n");
}
