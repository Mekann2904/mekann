/**
 * @abdd.meta
 * path: .pi/extensions/search/utils/history-store.ts
 * role: 検索履歴の永続化ストア
 * why: セッションをまたいで検索履歴を保持し、コンテキスト継承を可能にするため
 * related: ./history.ts, ../tools/search_history.ts
 * public_api: HistoryStore, type HistoryStoreConfig, type StoredHistoryEntry, type HistorySession
 * invariants: エントリはタイムスタンプ順にソート、セッションIDは一意
 * side_effects: ファイルシステムへの読み書き
 * failure_modes: ファイルアクセス権限がない場合、メモリのみで動作
 * @abdd.explain
 * overview: 検索履歴をファイルに永続化し、セッション間で履歴を共有するストア
 * what_it_does:
 *   - 検索履歴をJSONファイルに保存
 *   - セッションごとに履歴をグループ化
 *   - 現在セッションと過去セッションの履歴を取得
 * why_it_exists:
 *   - エージェントが前回の検索コンテキストを引き継ぐため
 *   - 長期的な検索パターンの分析を可能にするため
 * scope:
 *   in: 検索履歴エントリ、セッション情報
 *   out: 永続化された履歴、セッション別履歴
 */

/**
 * History Store
 *
 * Persistent storage for search history across sessions.
 */

import * as fs from "fs";
import * as path from "path";

// ============================================
// Types
// ============================================

/**
 * 保存された履歴エントリ
 * @summary 保存履歴エントリ
 * @param id エントリの一意ID
 * @param sessionId 属するセッションID
 * @param timestamp タイムスタンプ
 * @param tool ツール名
 * @param query 検索クエリ
 * @param resultCount 結果件数
 */
export interface StoredHistoryEntry {
	/** Unique entry ID */
	id: string;
	/** Session ID */
	sessionId: string;
	/** Timestamp */
	timestamp: number;
	/** Tool name */
	tool: string;
	/** Search query */
	query: string;
	/** Result count */
	resultCount: number;
	/** Result paths (limited) */
	results: string[];
}

/**
 * セッション情報
 * @summary セッション情報
 * @param id セッションID
 * @param startTime 開始時刻
 * @param endTime 終了時刻（現在セッションの場合はundefined）
 * @param entryCount エントリ数
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

/**
 * ストア設定
 * @summary ストア設定
 * @param maxEntries 最大エントリ数
 * @param maxSessions 最大セッション数
 * @param storagePath ストレージパス
 */
export interface HistoryStoreConfig {
	/** Maximum entries to keep (default: 1000) */
	maxEntries: number;
	/** Maximum sessions to keep (default: 10) */
	maxSessions: number;
	/** Storage file path */
	storagePath?: string;
}

// ============================================
// Constants
// ============================================

const DEFAULT_CONFIG: HistoryStoreConfig = {
	maxEntries: 1000,
	maxSessions: 10,
};

const HISTORY_FILE_NAME = "search-history.json";

// ============================================
// History Store Class
// ============================================

/**
 * 検索履歴永続化ストア
 * @summary 履歴ストアクラス
 */
export class HistoryStore {
	private config: HistoryStoreConfig;
	private entries: StoredHistoryEntry[] = [];
	private currentSessionId: string;
	private storagePath: string | null = null;
	private loaded = false;

	/**
	 * @summary ストア初期化
	 * @param config ストア設定
	 * @param cwd 作業ディレクトリ
	 */
	constructor(config: Partial<HistoryStoreConfig> = {}, cwd?: string) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.currentSessionId = this.generateSessionId();

		if (this.config.storagePath) {
			this.storagePath = this.config.storagePath;
		} else if (cwd) {
			this.storagePath = path.join(cwd, ".pi", "cache", HISTORY_FILE_NAME);
		}
	}

	/**
	 * 現在のセッションIDを取得
	 * @summary セッションID取得
	 * @returns 現在のセッションID
	 */
	getCurrentSessionId(): string {
		return this.currentSessionId;
	}

	/**
	 * 新しいセッションを開始
	 * @summary 新規セッション開始
	 * @returns 新しいセッションID
	 */
	startNewSession(): string {
		// 現在のセッションを終了
		this.finalizeCurrentSession();

		// 新しいセッションIDを生成
		this.currentSessionId = this.generateSessionId();
		return this.currentSessionId;
	}

	/**
	 * エントリを追加
	 * @summary エントリ追加
	 * @param tool ツール名
	 * @param query 検索クエリ
	 * @param resultCount 結果件数
	 * @param results 結果パス
	 * @returns 追加されたエントリ
	 */
	addEntry(
		tool: string,
		query: string,
		resultCount: number,
		results: string[] = []
	): StoredHistoryEntry {
		// 遅延読み込み
		if (!this.loaded) {
			this.load();
		}

		const entry: StoredHistoryEntry = {
			id: this.generateEntryId(),
			sessionId: this.currentSessionId,
			timestamp: Date.now(),
			tool,
			query,
			resultCount,
			results: results.slice(0, 10),
		};

		this.entries.unshift(entry);

		// 最大エントリ数を超えた場合は古いエントリを削除
		if (this.entries.length > this.config.maxEntries) {
			this.entries = this.entries.slice(0, this.config.maxEntries);
		}

		// 保存
		this.save();

		return entry;
	}

	/**
	 * 履歴を取得
	 * @summary 履歴取得
	 * @param session セッション指定
	 * @param limit 取得上限
	 * @returns 履歴エントリ配列
	 */
	getHistory(
		session: "current" | "previous" | "all" = "all",
		limit: number = 50
	): StoredHistoryEntry[] {
		// 遅延読み込み
		if (!this.loaded) {
			this.load();
		}

		let filtered = this.entries;

		if (session === "current") {
			filtered = filtered.filter((e) => e.sessionId === this.currentSessionId);
		} else if (session === "previous") {
			filtered = filtered.filter((e) => e.sessionId !== this.currentSessionId);
		}

		return filtered.slice(0, limit);
	}

	/**
	 * セッション一覧を取得
	 * @summary セッション一覧取得
	 * @returns セッション情報配列
	 */
	getSessions(): HistorySession[] {
		// 遅延読み込み
		if (!this.loaded) {
			this.load();
		}

		const sessionMap = new Map<string, HistorySession>();

		for (const entry of this.entries) {
			const existing = sessionMap.get(entry.sessionId);
			if (existing) {
				existing.entryCount++;
				existing.startTime = Math.min(existing.startTime, entry.timestamp);
				if (entry.sessionId !== this.currentSessionId) {
					existing.endTime = Math.max(existing.endTime ?? 0, entry.timestamp);
				}
			} else {
				sessionMap.set(entry.sessionId, {
					id: entry.sessionId,
					startTime: entry.timestamp,
					endTime: entry.sessionId === this.currentSessionId ? undefined : entry.timestamp,
					entryCount: 1,
				});
			}
		}

		// 開始時刻の降順でソート
		return Array.from(sessionMap.values()).sort((a, b) => b.startTime - a.startTime);
	}

	/**
	 * クエリを保存（簡易版）
	 * @summary クエリ保存
	 * @param query 検索クエリ
	 * @param tool ツール名
	 * @returns 保存されたエントリ
	 */
	saveQuery(query: string, tool: string = "unknown"): StoredHistoryEntry {
		return this.addEntry(tool, query, 0, []);
	}

	/**
	 * 履歴をクリア
	 * @summary 履歴クリア
	 * @param session セッション指定（省略時は全クリア）
	 */
	clear(session?: "current" | "previous" | "all"): void {
		if (!session || session === "all") {
			this.entries = [];
		} else if (session === "current") {
			this.entries = this.entries.filter((e) => e.sessionId !== this.currentSessionId);
		} else if (session === "previous") {
			this.entries = this.entries.filter((e) => e.sessionId === this.currentSessionId);
		}

		this.save();
	}

	/**
	 * 履歴をファイルから読み込み
	 * @summary 履歴読み込み
	 */
	load(): void {
		this.loaded = true;

		if (!this.storagePath) {
			return;
		}

		try {
			if (fs.existsSync(this.storagePath)) {
				const data = fs.readFileSync(this.storagePath, "utf-8");
				const parsed = JSON.parse(data) as StoredHistoryEntry[];
				if (Array.isArray(parsed)) {
					this.entries = parsed;
				}
			}
		} catch (error) {
			// エラーは無視して空の状態で続行
			console.error("Failed to load history:", error);
		}
	}

	/**
	 * 履歴をファイルに保存
	 * @summary 履歴保存
	 */
	save(): void {
		if (!this.storagePath) {
			return;
		}

		try {
			// ディレクトリを作成
			const dir = path.dirname(this.storagePath);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}

			fs.writeFileSync(this.storagePath, JSON.stringify(this.entries, null, 2), "utf-8");
		} catch (error) {
			console.error("Failed to save history:", error);
		}
	}

	// ============================================
	// Private Methods
	// ============================================

	/**
	 * セッションIDを生成
	 * @summary セッションID生成
	 * @returns セッションID
	 */
	private generateSessionId(): string {
		return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	}

	/**
	 * エントリIDを生成
	 * @summary エントリID生成
	 * @returns エントリID
	 */
	private generateEntryId(): string {
		return `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	}

	/**
	 * 現在のセッションを終了処理
	 * @summary セッション終了処理
	 */
	private finalizeCurrentSession(): void {
		// 現在のセッションのエントリを更新（必要に応じて）
		// 現在は特になし
	}
}

// ============================================
// Global Instance
// ============================================

let globalStore: HistoryStore | undefined;

/**
 * グローバル履歴ストアを取得
 * @summary グローバルストア取得
 * @param cwd 作業ディレクトリ
 * @returns 履歴ストア
 */
export function getHistoryStore(cwd?: string): HistoryStore {
	if (!globalStore) {
		globalStore = new HistoryStore({}, cwd);
	}
	return globalStore;
}

/**
 * グローバル履歴ストアをリセット
 * @summary ストアリセット
 */
export function resetHistoryStore(): void {
	globalStore = undefined;
}
