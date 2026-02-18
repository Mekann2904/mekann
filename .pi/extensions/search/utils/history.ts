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
  * 検索履歴のエントリ。
  * @param timestamp 検索実行時のタイムスタンプ
  * @param tool 使用したツール名
  * @param params 検索パラメータ
  * @param query 検索クエリ
  * @param results 検索結果
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
  * 履歴管理の設定。
  * @param maxEntries 保持する最大エントリ数。
  * @param maxResultsPerEntry エントリごとに保存する最大結果パス数。
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
  * サジェッション用のクエリとメタデータ
  * @param query クエリ文字列
  * @param count 使用回数
  * @param lastUsed 最終使用日時
  * @param wasAccepted 受け入れられたかどうか
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
  * 検索履歴を管理するクラス
  * @constructor
  * @param config - 履歴の設定（オプション）
  */
export class SearchHistory {
	private entries: SearchHistoryEntry[] = [];
	private config: HistoryConfig;

	constructor(config: Partial<HistoryConfig> = {}) {
		this.config = { ...DEFAULT_HISTORY_CONFIG, ...config };
	}

	 /**
	  * 履歴に新しいエントリを追加する。
	  * @param entry - 追加するエントリ（タイムスタンプと承認状態を除く）
	  * @returns 追加された完全なエントリ情報
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
	  * 最近の検索クエリを取得する
	  * @param limit 取得件数（デフォルト: 10）
	  * @param tool フィルタリングするツール名（オプション）
	  * @returns 検索クエリの候補リスト
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
	  * 指定されたクエリに関連するクエリを検索
	  * @param query 検索クエリ
	  * @param limit 最大取得数
	  * @returns 関連クエリの配列
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
	  * 検索結果が使用されたエントリをマークする
	  * @param timestamp エントリのタイムスタンプ
	  * @returns 更新に成功したかどうか
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
	  * タイムスタンプからエントリを取得する
	  * @param timestamp タイムスタンプ
	  * @returns 一致するエントリ、または undefined
	  */
	getEntry(timestamp: number): SearchHistoryEntry | undefined {
		return this.entries.find((e) => e.timestamp === timestamp);
	}

	 /**
	  * 全エントリを取得する（デバッグ/エクスポート用）
	  * @returns 検索履歴エントリの配列
	  */
	getAllEntries(): SearchHistoryEntry[] {
		return [...this.entries];
	}

	 /**
	  * 履歴をすべてクリアする
	  * @returns なし
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
  * グローバル検索履歴を取得する。
  * @returns 検索履歴オブジェクト
  */
export function getSearchHistory(): SearchHistory {
	if (!globalHistory) {
		globalHistory = new SearchHistory();
	}
	return globalHistory;
}

 /**
  * グローバル履歴インスタンスをリセット
  * @returns {void}
  */
export function resetSearchHistory(): void {
	globalHistory = undefined;
}

// ============================================
// Utility Functions
// ============================================

 /**
  * ツールのパラメータからクエリ文字列を抽出する
  * @param tool ツール名
  * @param params パラメータオブジェクト
  * @returns 抽出されたクエリ文字列
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
  * ツール実行から履歴エントリを作成する
  * @param tool ツール名
  * @param params 実行パラメータ
  * @param results 実行結果の文字列配列
  * @returns タイムスタンプと受理フラグを除く履歴エントリ
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
