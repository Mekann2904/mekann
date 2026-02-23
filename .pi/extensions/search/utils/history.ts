/**
 * @abdd.meta
 * path: .pi/extensions/search/utils/history.ts
 * role: 検索履歴のデータモデルと設定定義
 * why: 検索履歴の構造、保存制限、候補生成の基礎となる型情報を提供するため
 * related: .pi/extensions/search/utils/historyManager.ts, .pi/extensions/search/index.ts
 * public_api: SearchHistoryEntry, HistoryConfig, QuerySuggestion, DEFAULT_HISTORY_CONFIG
 * invariants: results配列はmaxResultsPerEntry以下の長さ, timestampはDate.now()由来の数値
 * side_effects: なし（純粋な型定義と定数エクスポート）
 * failure_modes: なし（実行時ロジックを持たないため）
 * @abdd.explain
 * overview: 検索履歴管理機能におけるデータ構造とデフォルト設定を定義するモジュール
 * what_it_does:
 *   - 検索履歴エントリ（SearchHistoryEntry）の型定義
 *   - 履歴保持設定（HistoryConfig）の型定義
 *   - クエリ候補（QuerySuggestion）の型定義
 *   - デフォルト設定値（DEFAULT_HISTORY_CONFIG）のエクスポート
 * why_it_exists:
 *   - 履歴データの構造を一元管理し、型安全を担保するため
 *   - 履歴の容量制限（maxEntries, maxResultsPerEntry）を定義するため
 *   - クエリサジェスト機能で使用するデータ形式を統一するため
 * scope:
 *   in: なし
 *   out: SearchHistoryEntry, HistoryConfig, QuerySuggestion, DEFAULT_HISTORY_CONFIG
 */

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
 * 検索履歴エントリ
 * @summary 検索履歴を保持
 * @param timestamp 検索実行時のタイムスタンプ
 * @param tool 使用したツール名
 * @param params 検索パラメータ
 * @param query 検索クエリ
 * @param results 検索結果
 * @returns 検索履歴のエントリオブジェクト
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
 * 履歴管理の設定を定義
 * @summary 履歴設定を定義
 * @param maxEntries 保持する最大エントリ数
 * @param maxResultsPerEntry エントリごとに保存する最大結果パス数
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
 * クエリ候補インターフェース
 * @summary クエリ候補の定義
 * @returns なし
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
 * 検索履歴管理クラス
 * @summary 検索履歴を管理
 * @returns なし
 */
export class SearchHistory {
	private entries: SearchHistoryEntry[] = [];
	private config: HistoryConfig;

	constructor(config: Partial<HistoryConfig> = {}) {
		this.config = { ...DEFAULT_HISTORY_CONFIG, ...config };
	}

	/**
	 * 履歴エントリ追加
	 * @summary 履歴エントリを追加
	 * @param entry 追加する履歴エントリ
	 * @returns 追加された履歴エントリ
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
	 * 最近のクエリ取得
	 * @summary 最近のクエリを取得
	 * @param limit 取得上限数
	 * @param tool ツール名
	 * @returns 最近のクエリ候補リスト
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
	 * 関連クエリ取得
	 * @summary 関連クエリを取得
	 * @param query 検索クエリ
	 * @param limit 取得上限数
	 * @returns 関連クエリの候補リスト
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
	 * @summary エントリを取得
	 * @param timestamp タイムスタンプ
	 * @returns 一致するエントリ、または undefined
	 */
	getEntry(timestamp: number): SearchHistoryEntry | undefined {
		return this.entries.find((e) => e.timestamp === timestamp);
	}

	/**
	 * 全エントリを取得
	 * @summary 全エントリ取得
	 * @returns 検索履歴エントリの配列
	 */
	getAllEntries(): SearchHistoryEntry[] {
		return [...this.entries];
	}

	/**
	 * 履歴をすべてクリア
	 * @summary 履歴をすべてクリア
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
 * @summary 検索履歴取得
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
 * 検索履歴をリセットする
 * @summary 履歴リセット
 * @returns なし
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
