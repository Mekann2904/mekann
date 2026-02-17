/**
 * Search History Management
 *
 * Tracks search queries and their results for:
 * - Query suggestions based on past searches
 * - Finding related queries
 * - Tracking which results were actually used
 */

// ============================================
// Types
// ============================================

/**
 * Entry in the search history.
 */
export interface SearchHistoryEntry {
	/**
	 * Timestamp when the search was performed (Date.now()).
	 */
	timestamp: number;

	/**
	 * Name of the tool used (file_candidates, code_search, etc.).
	 */
	tool: string;

	/**
	 * Original search parameters.
	 */
	params: Record<string, unknown>;

	/**
	 * Primary search query (extracted from params).
	 */
	query: string;

	/**
	 * Result file paths (limited to first 10 for storage efficiency).
	 */
	results: string[];

	/**
	 * Whether the user/agent used any of the results.
	 */
	accepted: boolean;
}

/**
 * Configuration for history management.
 */
export interface HistoryConfig {
	/**
	 * Maximum number of entries to keep.
	 */
	maxEntries: number;

	/**
	 * Maximum number of result paths to store per entry.
	 */
	maxResultsPerEntry: number;
}

/**
 * Query with metadata for suggestions.
 */
export interface QuerySuggestion {
	/**
	 * The query string.
	 */
	query: string;

	/**
	 * How many times this query was used.
	 */
	count: number;

	/**
	 * When this query was last used.
	 */
	lastUsed: number;

	/**
	 * Whether results were accepted.
	 */
	wasAccepted: boolean;
}

// ============================================
// Default Configuration
// ============================================

/**
 * Default history configuration.
 */
export const DEFAULT_HISTORY_CONFIG: HistoryConfig = {
	maxEntries: 100,
	maxResultsPerEntry: 10,
};

// ============================================
// History Store
// ============================================

/**
 * In-memory search history store.
 * Designed for easy extension to persistent storage.
 */
export class SearchHistory {
	private entries: SearchHistoryEntry[] = [];
	private config: HistoryConfig;

	constructor(config: Partial<HistoryConfig> = {}) {
		this.config = { ...DEFAULT_HISTORY_CONFIG, ...config };
	}

	/**
	 * Add a new entry to the history.
	 */
	addHistoryEntry(entry: Omit<SearchHistoryEntry, "timestamp" | "accepted">): SearchHistoryEntry {
		const fullEntry: SearchHistoryEntry = {
			...entry,
			timestamp: Date.now(),
			accepted: false,
			results: entry.results.slice(0, this.config.maxResultsPerEntry),
		};

		this.entries.unshift(fullEntry);

		// Enforce max entries limit
		if (this.entries.length > this.config.maxEntries) {
			this.entries = this.entries.slice(0, this.config.maxEntries);
		}

		return fullEntry;
	}

	/**
	 * Get recent queries, optionally filtered by tool.
	 */
	getRecentQueries(limit: number = 10, tool?: string): QuerySuggestion[] {
		const queryMap = new Map<string, QuerySuggestion>();

		const filtered = tool
			? this.entries.filter((e) => e.tool === tool)
			: this.entries;

		for (const entry of filtered) {
			const existing = queryMap.get(entry.query);
			if (existing) {
				existing.count++;
				existing.lastUsed = Math.max(existing.lastUsed, entry.timestamp);
				existing.wasAccepted = existing.wasAccepted || entry.accepted;
			} else {
				queryMap.set(entry.query, {
					query: entry.query,
					count: 1,
					lastUsed: entry.timestamp,
					wasAccepted: entry.accepted,
				});
			}
		}

		// Sort by last used, then by count
		return Array.from(queryMap.values())
			.sort((a, b) => {
				if (a.wasAccepted !== b.wasAccepted) {
					return a.wasAccepted ? -1 : 1;
				}
				return b.lastUsed - a.lastUsed;
			})
			.slice(0, limit);
	}

	/**
	 * Find queries related to the given query.
	 * Uses simple substring matching and shared results.
	 */
	getRelatedQueries(query: string, limit: number = 5): QuerySuggestion[] {
		const normalizedQuery = query.toLowerCase();
		const related = new Map<string, QuerySuggestion>();

		// Find entries with similar query text
		for (const entry of this.entries) {
			const normalizedEntry = entry.query.toLowerCase();

			// Skip identical queries
			if (normalizedEntry === normalizedQuery) continue;

			// Check for substring relationship
			if (
				normalizedEntry.includes(normalizedQuery) ||
				normalizedQuery.includes(normalizedEntry)
			) {
				this.addOrUpdateSuggestion(related, entry);
				continue;
			}

			// Check for shared results
			const entryResults = new Set(entry.results);
			const hasSharedResults = this.entries
				.filter((e) => e.query.toLowerCase() === normalizedQuery)
				.some((e) => e.results.some((r) => entryResults.has(r)));

			if (hasSharedResults) {
				this.addOrUpdateSuggestion(related, entry);
			}
		}

		return Array.from(related.values())
			.sort((a, b) => b.count - a.count)
			.slice(0, limit);
	}

	/**
	 * Mark an entry as accepted (results were used).
	 */
	markAccepted(timestamp: number): boolean {
		const entry = this.entries.find((e) => e.timestamp === timestamp);
		if (entry) {
			entry.accepted = true;
			return true;
		}
		return false;
	}

	/**
	 * Get entry by timestamp.
	 */
	getEntry(timestamp: number): SearchHistoryEntry | undefined {
		return this.entries.find((e) => e.timestamp === timestamp);
	}

	/**
	 * Get all entries (for debugging/export).
	 */
	getAllEntries(): SearchHistoryEntry[] {
		return [...this.entries];
	}

	/**
	 * Clear all history.
	 */
	clear(): void {
		this.entries = [];
	}

	/**
	 * Get the number of entries.
	 */
	get size(): number {
		return this.entries.length;
	}

	// ============================================
	// Private Helpers
	// ============================================

	private addOrUpdateSuggestion(
		map: Map<string, QuerySuggestion>,
		entry: SearchHistoryEntry
	): void {
		const existing = map.get(entry.query);
		if (existing) {
			existing.count++;
			existing.lastUsed = Math.max(existing.lastUsed, entry.timestamp);
			existing.wasAccepted = existing.wasAccepted || entry.accepted;
		} else {
			map.set(entry.query, {
				query: entry.query,
				count: 1,
				lastUsed: entry.timestamp,
				wasAccepted: entry.accepted,
			});
		}
	}
}

// ============================================
// Global Instance (Singleton)
// ============================================

/**
 * Global search history instance.
 * Shared across all search tools in a session.
 */
let globalHistory: SearchHistory | undefined;

/**
 * Get the global history instance.
 */
export function getSearchHistory(): SearchHistory {
	if (!globalHistory) {
		globalHistory = new SearchHistory();
	}
	return globalHistory;
}

/**
 * Reset the global history instance (for testing).
 */
export function resetSearchHistory(): void {
	globalHistory = undefined;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Extract the primary query string from tool parameters.
 */
export function extractQuery(tool: string, params: Record<string, unknown>): string {
	switch (tool) {
		case "file_candidates":
			return String(params.pattern || params.extension || "");
		case "code_search":
			return String(params.pattern || "");
		case "sym_find":
			return String(params.name || params.kind || "");
		case "sym_index":
			return String(params.path || "index");
		default:
			return String(params.pattern || params.query || params.name || "");
	}
}

/**
 * Create a history entry from tool execution.
 */
export function createHistoryEntry(
	tool: string,
	params: Record<string, unknown>,
	results: string[]
): Omit<SearchHistoryEntry, "timestamp" | "accepted"> {
	return {
		tool,
		params,
		query: extractQuery(tool, params),
		results,
	};
}
