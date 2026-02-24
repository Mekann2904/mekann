/**
 * @abdd.meta
 * path: .pi/extensions/search/tools/search_history.ts
 * role: 検索履歴管理ツール
 * why: 過去の検索クエリの参照、コンテキスト継承、セッション管理を提供するため
 * related: ../utils/history-store.ts, ../utils/history.ts
 * public_api: searchHistory, searchHistoryToolDefinition, type SearchHistoryInput, type SearchHistoryResult
 * invariants: 履歴はタイムスタンプ順でソート済み
 * side_effects: 履歴ファイルへの読み書き
 * failure_modes: ストレージにアクセスできない場合、メモリのみで動作
 * @abdd.explain
 * overview: 検索履歴の取得、クリア、保存を行うツール
 * what_it_does:
 *   - 現在セッションと過去セッションの履歴を取得
 *   - 検索クエリを履歴に保存
 *   - 履歴のクリア
 * why_it_exists:
 *   - エージェントが前回の検索コンテキストを参照できるようにするため
 *   - セッション間での検索パターンの継承を可能にするため
 * scope:
 *   in: アクション（get/clear/save_query）、セッション指定、クエリ
 *   out: 履歴エントリ配列
 */

/**
 * search_history Tool
 *
 * Manage search history across sessions for context inheritance.
 */

import type { SearchDetails } from "../types.js";
import { getHistoryStore, type StoredHistoryEntry, type HistorySession } from "../utils/history-store.js";

// ============================================
// Types
// ============================================

/**
 * 検索履歴の入力パラメータ
 * @summary 履歴入力
 * @param action アクション種別
 * @param session セッション指定
 * @param limit 取得上限
 * @param query 保存するクエリ
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

// ============================================
// Constants
// ============================================

const DEFAULT_LIMIT = 50;

// ============================================
// Main Implementation
// ============================================

/**
 * 検索履歴を管理
 * @summary 履歴管理実行
 * @param input 入力パラメータ
 * @param cwd 作業ディレクトリ
 * @returns 履歴結果
 */
export async function searchHistory(
	input: SearchHistoryInput,
	cwd: string
): Promise<SearchHistoryResult> {
	const store = getHistoryStore(cwd);
	const action = input.action ?? "get";
	const session = input.session ?? "all";
	const limit = input.limit ?? DEFAULT_LIMIT;

	try {
		switch (action) {
			case "get": {
				const entries = store.getHistory(session, limit);
				const sessions = store.getSessions();

				return {
					queries: entries.map(formatEntry),
					session,
					total: entries.length,
					sessions: sessions.slice(0, 10),
					details: {
						hints: {
							confidence: 1.0,
							estimatedTokens: entries.length * 30,
						},
					},
				};
			}

			case "clear": {
				store.clear(session);

				return {
					queries: [],
					session,
					total: 0,
					details: {
						hints: {
							confidence: 1.0,
							suggestedNextAction: undefined,
						},
					},
				};
			}

			case "save_query": {
				if (!input.query) {
					return {
						queries: [],
						session,
						total: 0,
						error: "query is required for save_query action",
					};
				}

				const entry = store.saveQuery(input.query, input.tool);

				return {
					queries: [formatEntry(entry)],
					session,
					total: 1,
					details: {
						hints: {
							confidence: 1.0,
						},
					},
				};
			}

			default:
				return {
					queries: [],
					session,
					total: 0,
					error: `Unknown action: ${action}`,
				};
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		return {
			queries: [],
			session,
			total: 0,
			error: errorMessage,
		};
	}
}

/**
 * エントリをフォーマット
 * @summary エントリフォーマット
 * @param entry 保存されたエントリ
 * @returns フォーマット済みクエリ
 */
function formatEntry(entry: StoredHistoryEntry): HistoryQuery {
	return {
		query: entry.query,
		tool: entry.tool,
		timestamp: new Date(entry.timestamp).toISOString(),
		resultCount: entry.resultCount,
	};
}

/**
 * 履歴結果をフォーマット
 * @summary 結果フォーマット
 * @param output 出力データ
 * @returns フォーマット済み文字列
 */
export function formatSearchHistory(output: SearchHistoryResult): string {
	const lines: string[] = [];

	if (output.error) {
		lines.push(`Error: ${output.error}`);
		return lines.join("\n");
	}

	lines.push(`Search History (${output.session} session)`);
	lines.push(`Total: ${output.total} queries`);
	lines.push("");

	if (output.queries.length === 0) {
		lines.push("No history entries found.");
		return lines.join("\n");
	}

	for (const query of output.queries) {
		const time = new Date(query.timestamp).toLocaleString();
		lines.push(`[${time}] ${query.tool}: ${query.query}`);
		if (query.resultCount > 0) {
			lines.push(`  Results: ${query.resultCount}`);
		}
	}

	// セッション情報
	if (output.sessions && output.sessions.length > 0) {
		lines.push("");
		lines.push("Available Sessions:");
		for (const session of output.sessions.slice(0, 5)) {
			const startTime = new Date(session.startTime).toLocaleString();
			const current = session.endTime === undefined ? " (current)" : "";
			lines.push(`  - ${session.id}${current}: ${session.entryCount} entries, started ${startTime}`);
		}
	}

	return lines.join("\n");
}

/**
 * Tool definition for pi.registerTool
 */
export const searchHistoryToolDefinition = {
	name: "search_history",
	label: "Search History",
	description:
		"Manage search history across sessions. Use 'get' to retrieve history, 'clear' to delete history, 'save_query' to manually save a query. Supports filtering by session (current/previous/all).",
	parameters: null, // Will be set in index.ts
};
