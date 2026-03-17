/**
 * @abdd.meta
 * path: .pi/extensions/observability-data.ts
 * role: ComprehensiveLoggerが出力するイベントログを読み取り、リアルタイムイベント購読を提供する拡張機能
 * why: ログイベントのクエリ、フィルタリング、集計を可能にし、リアルタイムな実験監視とクロス拡張機能連携を実現するため
 * related: ../lib/comprehensive-logger.ts, ../lib/comprehensive-logger-config.ts, ../lib/comprehensive-logger-types.ts
 * public_api: observability_data ツール, subscribe_experiment_events ツール, subscribeExperimentEvents, observability コマンド
 * invariants: getConfig().logDir から正しいパスを取得する、onExperimentEvent()で実験イベントを購読する
 * side_effects: ファイルシステムからの読み取り、実験イベントキャッシュの更新、コールバック通知
 * failure_modes: ログディレクトリが存在しない、ログファイルが破損、イベントコールバックでの例外
 */

/**
 * Observability Data Extension
 * Reads ComprehensiveLogger events and provides queryable observability data
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { getConfig } from "../lib/comprehensive-logger-config";
import type { LogEvent, EventType, BaseEvent } from "../lib/comprehensive-logger-types";
import { onExperimentEvent } from "../lib/comprehensive-logger";

// ============================================
// Types
// ============================================

export interface ObservabilityQuery {
	/** Filter by event type(s) */
	eventTypes?: EventType[];
	/** Filter by task ID */
	taskId?: string;
	/** Filter by session ID */
	sessionId?: string;
	/** Start timestamp (ISO string) */
	from?: string;
	/** End timestamp (ISO string) */
	to?: string;
	/** Maximum number of events to return */
	limit?: number;
	/** Include statistics aggregation */
	includeStats?: boolean;
	/**
	 * Trial directory path for pi-events.jsonl
	 * When specified, reads from {trialDir}/agent/pi-events.jsonl instead of events-{date}.jsonl
	 * This enables querying LLM metrics from terminal-bench experiments
	 */
	trialDir?: string;
	/**
	 * Include MetricsCollector events (.pi/metrics/)
	 * When true, also reads scheduler events (preemption, work_steal, task_completion)
	 * @default true
	 */
	includeMetrics?: boolean;
}

export interface ObservabilityStats {
	totalEvents: number;
	eventsByType: Record<string, number>;
	errorCount: number;
	toolCallsCount: number;
	llmCallsCount: number;
	tasksCount: number;
	firstEventAt?: string;
	lastEventAt?: string;
	/** パースエラー数（データ損失の指標） */
	parseErrors?: number;
	/** 不完全な行数（書き込み中または切り捨て） */
	incompleteLines?: number;
	/** リトライ後に回復した行数 */
	recoveredLines?: number;
}

export interface ObservabilityResult {
	events: LogEvent[];
	stats?: ObservabilityStats;
	query: ObservabilityQuery;
	logDir: string;
	/** MetricsCollectorディレクトリパス */
	metricsDir?: string;
	filesRead: string[];
	/** 全ファイルのパース統計（データ損失の可視化用） */
	parseStats?: {
		totalParseErrors: number;
		totalIncompleteLines: number;
		totalRecoveredLines: number;
	};
}

// ============================================
// Exports for Programmatic Use
// ============================================

export { queryObservabilityData };
export { getLogDir, listLogFiles, parseLogFile, parseLogFileWithStats, parsePiEventsFile };
export { getMetricsDir, listMetricsFiles, parseMetricsFile };
export { calculateStats };
export { subscribeExperimentEvents, getRecentExperimentEvents };
export type { ExperimentEventCallback };

// ============================================
// Real-Time Event Subscriptions
// ============================================

/** Maximum number of events to cache for real-time queries */
const REALTIME_CACHE_SIZE = 100;

/** Callback type for experiment event subscriptions */
type ExperimentEventCallback = (event: LogEvent) => void;

/** Cached recent experiment events for real-time queries */
const recentExperimentEvents: LogEvent[] = [];

/** Registered callbacks for experiment event notifications */
const experimentEventCallbacks = new Set<ExperimentEventCallback>();

/** Flag to track if subscription is active */
let experimentSubscriptionActive = false;

/**
 * Subscribe to experiment events in real-time
 * @summary 実験イベントのリアルタイム購読
 * @param callback Event callback function
 * @returns Unsubscribe function
 */
function subscribeExperimentEvents(callback: ExperimentEventCallback): () => void {
	experimentEventCallbacks.add(callback);
	return () => experimentEventCallbacks.delete(callback);
}

/**
 * Get recent experiment events from the real-time cache
 * @summary 最近の実験イベントを取得
 * @param limit Maximum number of events to return
 * @returns Array of recent experiment events
 */
function getRecentExperimentEvents(limit: number = 50): LogEvent[] {
	return recentExperimentEvents.slice(0, limit);
}

/**
 * Handle experiment event from ComprehensiveLogger
 * @summary 実験イベントを処理
 * @param event LogEvent with experiment_* eventType
 */
function handleExperimentEvent(event: { type: string; data: unknown }): void {
	// Create a LogEvent-like object for the cache
	const logEvent: LogEvent = {
		eventId: `realtime-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		eventType: event.type as EventType,
		sessionId: "realtime",
		taskId: "experiment",
		operationId: "experiment-monitor",
		timestamp: new Date().toISOString(),
		component: {
			type: "extension",
			name: "observability-data",
		},
		data: event.data,
	} as LogEvent;

	// Add to cache (circular buffer)
	recentExperimentEvents.unshift(logEvent);
	if (recentExperimentEvents.length > REALTIME_CACHE_SIZE) {
		recentExperimentEvents.pop();
	}

	// Notify all registered callbacks
	for (const callback of experimentEventCallbacks) {
		try {
			callback(logEvent);
		} catch (err) {
			console.error("[observability-data] Experiment event callback error:", err);
		}
	}
}

/**
 * Initialize experiment event subscription
 * @summary 実験イベント購読を初期化
 */
function initExperimentEventSubscription(): void {
	if (experimentSubscriptionActive) {
		return;
	}

	// Subscribe to experiment events from ComprehensiveLogger
	onExperimentEvent(handleExperimentEvent);
	experimentSubscriptionActive = true;
}

// ============================================
// Log Reading Functions
// ============================================

/**
 * ログディレクトリパスを取得
 * getConfig().logDir から正しいパスを返す
 */
function getLogDir(): string {
	const config = getConfig();
	return resolve(config.logDir);
}

/**
 * 指定日付のログファイルパスを生成
 */
function getLogFilePath(logDir: string, date: string): string {
	return join(logDir, `events-${date}.jsonl`);
}

/**
 * ログディレクトリ内の全ログファイルをリスト
 */
function listLogFiles(logDir: string): string[] {
	if (!existsSync(logDir)) {
		return [];
	}

	return readdirSync(logDir)
		.filter((f) => f.startsWith("events-") && f.endsWith(".jsonl"))
		.map((f) => join(logDir, f))
		.sort((a, b) => b.localeCompare(a)); // 新しい順
}

/**
 * パース結果
 */
interface ParseResult {
	events: LogEvent[];
	parseErrors: number;
	incompleteLines: number;
	/** リトライ後に回復した不完全な行数 */
	recoveredLines?: number;
}

/**
 * ログファイルを読み込んでイベントをパース
 * @summary ログをパースする
 * @param filePath ファイルパス
 * @returns パース結果
 */
function parseLogFile(filePath: string): LogEvent[] {
	const result = parseLogFileWithStats(filePath);
	return result.events;
}

/**
 * BaseEvent必須フィールドを検証
 * @summary イベントを検証する
 * @param event 検証対象イベント
 * @returns エラーメッセージ（問題ない場合はnull）
 */
function validateBaseEvent(event: Partial<LogEvent>): string | null {
	// 必須フィールドのリスト
	const requiredFields: Array<keyof BaseEvent> = [
		"eventId",
		"eventType",
		"sessionId",
		"taskId",
		"operationId",
		"timestamp",
		"component",
	];

	// 未定義またはnullのフィールドを検出
	const missingFields = requiredFields.filter(
		(field) => event[field] === undefined || event[field] === null
	);
	if (missingFields.length > 0) {
		return `missing required fields: ${missingFields.join(", ")} (eventId=${event.eventId ?? "unknown"})`;
	}

	// 型チェック
	if (typeof event.timestamp !== "string") {
		return `timestamp must be string (eventId=${event.eventId ?? "unknown"})`;
	}
	if (typeof event.eventId !== "string") {
		return `eventId must be string`;
	}
	if (typeof event.eventType !== "string") {
		return `eventType must be string (eventId=${event.eventId})`;
	}
	if (typeof event.sessionId !== "string") {
		return `sessionId must be string (eventId=${event.eventId})`;
	}
	if (typeof event.taskId !== "string") {
		return `taskId must be string (eventId=${event.eventId})`;
	}
	if (typeof event.operationId !== "string") {
		return `operationId must be string (eventId=${event.eventId})`;
	}

	// componentの詳細チェック
	if (
		typeof event.component !== "object" ||
		event.component === null ||
		typeof event.component.type !== "string" ||
		typeof event.component.name !== "string"
	) {
		return `component must have type and name (eventId=${event.eventId})`;
	}

	return null;
}

/**
 * ログファイルを読み込んでイベントをパース（統計付き）
 * @summary ログをパース（統計付き）
 * @param filePath ファイルパス
 * @returns パース結果
 */
function parseLogFileWithStats(filePath: string): ParseResult {
	const result: ParseResult = {
		events: [],
		parseErrors: 0,
		incompleteLines: 0,
		recoveredLines: 0,
	};

	if (!existsSync(filePath)) {
		return result;
	}

	// リトライ設定: 不完全な行を検出した際に再読み込みを試行
	const maxRetries = 3;
	const retryDelayMs = 50;
	let attempt = 0;
	let content = readFileSync(filePath, "utf-8");
	let lines = content.split("\n").filter(Boolean);

	// 不完全な行を収集
	let incompleteIndices: number[] = lines
		.map((line, index) => (!line.endsWith("}") ? index : -1))
		.filter((i) => i >= 0);

	// リトライループ: 不完全な行が残っている場合は再読み込み
	while (incompleteIndices.length > 0 && attempt < maxRetries) {
		attempt++;
		// 同期待機（busy-wait）
		const start = Date.now();
		while (Date.now() - start < retryDelayMs) {
			// busy-wait
		}

		// ファイルを再読み込み
		content = readFileSync(filePath, "utf-8");
		lines = content.split("\n").filter(Boolean);

		// 以前不完全だった行が完全になったかを確認
		const newIncompleteIndices: number[] = [];
		for (const idx of incompleteIndices) {
			if (idx < lines.length && lines[idx].endsWith("}")) {
				// 回復成功
				result.recoveredLines!++;
			} else if (idx < lines.length) {
				// まだ不完全
				newIncompleteIndices.push(idx);
			}
			// idx >= lines.length の場合は行が削除されたとみなし、スキップ
		}
		incompleteIndices = newIncompleteIndices;
	}

	// パース処理
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// 行整合性チェック: 不完全な行（書き込み中の可能性）を検出
		if (!line.endsWith("}")) {
			result.incompleteLines++;
			continue;
		}

		try {
			const event = JSON.parse(line) as LogEvent;
			// BaseEvent必須フィールド検証: 全7フィールドをチェック
			const validationError = validateBaseEvent(event);
			if (validationError) {
				result.parseErrors++;
				console.warn(
					`[observability-data] Invalid event in ${filePath}: ${validationError}`
				);
				continue;
			}
			result.events.push(event);
		} catch (error) {
			// パースエラーをログ出力（無言でドロップしない）
			result.parseErrors++;
			console.warn(
				`[observability-data] JSON parse error in ${filePath}: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	// 不完全な行があった場合は警告（読み取り中に書き込みが発生した可能性）
	if (result.incompleteLines > 0) {
		const recoveredMsg = result.recoveredLines! > 0 ? ` (${result.recoveredLines} recovered)` : "";
		console.warn(
			`[observability-data] ${result.incompleteLines} incomplete line(s) detected in ${filePath}${recoveredMsg} (possible concurrent write)`
		);
	}

	return result;
}

// ============================================
// pi-events.jsonl Parsing (terminal-bench format)
// ============================================

/**
 * pi-events.jsonlのLLM usageをLogEvent形式に変換
 * @summary pi-eventsをLogEventに変換
 */
interface PiEventUsage {
	input: number;
	output: number;
	cacheRead?: number;
	cacheWrite?: number;
	totalTokens?: number;
	cost?: {
		total?: number;
	};
}

interface PiEventMessage {
	role?: string;
	usage?: PiEventUsage;
}

interface PiEventPartial {
	usage?: PiEventUsage;
	content?: Array<{
		type?: string;
		thinking?: string;
		text?: string;
	}>;
}

interface PiEventAssistantMessageEvent {
	type?: string;
	partial?: PiEventPartial;
	message?: PiEventMessage;
}

interface PiEventParsed {
	type?: string;
	message?: PiEventMessage;
	assistantMessageEvent?: PiEventAssistantMessageEvent;
	timestamp?: string;
}

/**
 * pi-events.jsonlのイベントを解析してLLMメトリクスを抽出
 * message_start/message_update形式をLogEvent風のオブジェクトに変換
 * @summary pi-eventsをパース
 * @param line 1行のJSON文字列
 * @param trialDir trialディレクトリパス
 * @param lineIndex 行番号
 * @returns LogEvent風のオブジェクトまたはnull
 */
function parsePiEventLine(
	line: string,
	trialDir: string,
	lineIndex: number
): LogEvent | null {
	if (!line.startsWith("{")) {
		return null;
	}

	try {
		const parsed = JSON.parse(line) as PiEventParsed;
		const type = parsed.type || "";

		// message_startからusageを抽出
		if (type === "message_start" && parsed.message) {
			const message = parsed.message;
			const usage = message.usage;

			if (usage && (usage.input > 0 || usage.output > 0)) {
				return {
					eventId: `pi-event-${lineIndex}`,
					eventType: "llm_response" as EventType,
					sessionId: "terminal-bench",
					taskId: trialDir.split("/").pop() || "unknown",
					operationId: `pi-op-${lineIndex}`,
					timestamp: parsed.timestamp || new Date().toISOString(),
					component: {
						type: "extension" as const,
						name: "terminal-bench",
					},
					data: {
						provider: "terminal-bench",
						model: "unknown",
						inputTokens: usage.input || 0,
						outputTokens: usage.output || 0,
						totalTokens: usage.totalTokens || (usage.input || 0) + (usage.output || 0),
						durationMs: 0,
						responseLength: 0,
						stopReason: "end_turn" as const,
						toolsCalled: [],
						cacheReadTokens: usage.cacheRead || 0,
						cacheWriteTokens: usage.cacheWrite || 0,
						estimatedCost: usage.cost?.total || 0,
					},
				} as LogEvent;
			}
		}

		// message_updateからusageを抽出
		if (type === "message_update" && parsed.assistantMessageEvent) {
			const event = parsed.assistantMessageEvent;
			const usage = event.partial?.usage || event.message?.usage;

			if (usage && (usage.input > 0 || usage.output > 0)) {
				return {
					eventId: `pi-event-${lineIndex}`,
					eventType: "llm_response" as EventType,
					sessionId: "terminal-bench",
					taskId: trialDir.split("/").pop() || "unknown",
					operationId: `pi-op-${lineIndex}`,
					timestamp: parsed.timestamp || new Date().toISOString(),
					component: {
						type: "extension" as const,
						name: "terminal-bench",
					},
					data: {
						provider: "terminal-bench",
						model: "unknown",
						inputTokens: usage.input || 0,
						outputTokens: usage.output || 0,
						totalTokens: usage.totalTokens || (usage.input || 0) + (usage.output || 0),
						durationMs: 0,
						responseLength: 0,
						stopReason: "end_turn" as const,
						toolsCalled: [],
						cacheReadTokens: usage.cacheRead || 0,
						cacheWriteTokens: usage.cacheWrite || 0,
						estimatedCost: usage.cost?.total || 0,
					},
				} as LogEvent;
			}
		}

		return null;
	} catch {
		return null;
	}
}

/**
 * trialディレクトリ内のpi-events.jsonlを読み込む
 * @summary pi-events.jsonlを読込
 * @param trialDir trialディレクトリパス
 * @returns パース結果
 */
function parsePiEventsFile(trialDir: string): ParseResult {
	const result: ParseResult = {
		events: [],
		parseErrors: 0,
		incompleteLines: 0,
	};

	const eventsPath = join(trialDir, "agent", "pi-events.jsonl");
	if (!existsSync(eventsPath)) {
		return result;
	}

	const text = readFileSync(eventsPath, "utf-8");
	const lines = text.split("\n").filter(Boolean);

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!line) continue;

		// 行整合性チェック
		if (!line.endsWith("}")) {
			result.incompleteLines++;
			continue;
		}

		const event = parsePiEventLine(line, trialDir, i);
		if (event) {
			result.events.push(event);
		}
	}

	return result;
}

// ============================================
// MetricsCollector Events (.pi/metrics/)
// ============================================

/** MetricsCollector default directory */
const DEFAULT_METRICS_DIR = ".pi/metrics";

/**
 * メトリクスディレクトリパスを取得
 * @summary メトリクスディレクトリ取得
 * @returns メトリクスディレクトリパス
 */
function getMetricsDir(): string {
	return resolve(DEFAULT_METRICS_DIR);
}

/**
 * メトリクスディレクトリ内の全ログファイルをリスト
 * @summary メトリクスファイル一覧取得
 * @param metricsDir メトリクスディレクトリ
 * @returns ファイルパスの配列
 */
function listMetricsFiles(metricsDir: string): string[] {
	if (!existsSync(metricsDir)) {
		return [];
	}

	return readdirSync(metricsDir)
		.filter((f) => f.startsWith("scheduler-metrics-") && f.endsWith(".jsonl"))
		.map((f) => join(metricsDir, f))
		.sort((a, b) => b.localeCompare(a)); // 新しい順
}

/**
 * MetricsCollectorイベントをLogEvent形式に変換
 * @summary メトリクスイベント変換
 * @param entry MetricsCollectorから読み込んだエントリ
 * @param lineIndex 行番号
 * @returns LogEventまたはnull
 */
function convertMetricsEntryToLogEvent(
	entry: Record<string, unknown>,
	lineIndex: number
): LogEvent | null {
	const type = entry.type as string;
	if (!type) return null;

	const timestamp = typeof entry.timestamp === "number"
		? new Date(entry.timestamp).toISOString()
		: new Date().toISOString();

	const baseEvent = {
		eventId: `metrics-${lineIndex}-${Date.now()}`,
		sessionId: "metrics-collector",
		taskId: (entry.taskId as string) || "unknown",
		operationId: `metrics-op-${lineIndex}`,
		timestamp,
		component: {
			type: "extension" as const,
			name: "metrics-collector",
		},
	};

	switch (type) {
		case "preemption":
			return {
				...baseEvent,
				eventType: "preemption",
				data: {
					taskId: (entry.taskId as string) || "unknown",
					reason: (entry.reason as string) || "unknown",
				},
			} as LogEvent;

		case "work_steal":
			return {
				...baseEvent,
				eventType: "work_steal",
				data: {
					sourceInstance: (entry.sourceInstance as string) || "unknown",
					taskId: (entry.taskId as string) || "unknown",
				},
			} as LogEvent;

		case "task_completion":
			return {
				...baseEvent,
				eventType: "task_completion",
				data: {
					taskId: (entry.taskId as string) || "unknown",
					source: (entry.source as string) || "unknown",
					provider: (entry.provider as string) || "unknown",
					model: (entry.model as string) || "unknown",
					priority: (entry.priority as string) || "unknown",
					waitedMs: (entry.waitedMs as number) || 0,
					executionMs: (entry.executionMs as number) || 0,
					success: (entry.success as boolean) ?? false,
				},
			} as LogEvent;

		case "metrics_snapshot":
			return {
				...baseEvent,
				eventType: "metrics_snapshot",
				data: {
					memoryUsageMB: 0,
					cpuPercent: 0,
					eventsTotal: 0,
					tasksCompleted: (entry.tasksCompletedPerMin as number) || 0,
					operationsCompleted: 0,
					toolCallsTotal: 0,
					tokensTotal: 0,
					errorRate: 0,
					avgResponseTimeMs: (entry.avgWaitMs as number) || 0,
					p95ResponseTimeMs: (entry.p99WaitMs as number) || 0,
				},
			} as LogEvent;

		case "rate_limit_hit":
			// rate_limit_hitイベントはMetricsSnapshotEventとして扱う
			// (EventTypeにrate_limit_hitがないため、metrics_snapshotとして記録)
			return {
				...baseEvent,
				eventType: "metrics_snapshot",
				data: {
					memoryUsageMB: 0,
					cpuPercent: 0,
					eventsTotal: 0,
					tasksCompleted: 0,
					operationsCompleted: 0,
					toolCallsTotal: 0,
					tokensTotal: 0,
					errorRate: 0,
					avgResponseTimeMs: 0,
					p95ResponseTimeMs: 0,
				},
			} as LogEvent;

		default:
			return null;
	}
}

/**
 * メトリクスファイルを読み込んでイベントをパース
 * @summary メトリクスファイルをパース
 * @param filePath ファイルパス
 * @returns パース結果
 */
function parseMetricsFile(filePath: string): ParseResult {
	const result: ParseResult = {
		events: [],
		parseErrors: 0,
		incompleteLines: 0,
	};

	if (!existsSync(filePath)) {
		return result;
	}

	const text = readFileSync(filePath, "utf-8");
	const lines = text.split("\n").filter(Boolean);

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!line) continue;

		// 行整合性チェック
		if (!line.endsWith("}")) {
			result.incompleteLines++;
			continue;
		}

		try {
			const entry = JSON.parse(line) as Record<string, unknown>;
			const event = convertMetricsEntryToLogEvent(entry, i);
			if (event) {
				result.events.push(event);
			}
		} catch {
			result.parseErrors++;
		}
	}

	return result;
}

/**
 * 日付範囲から対象メトリクスファイルを特定
 * @summary 対象メトリクスファイル特定
 * @param metricsDir メトリクスディレクトリ
 * @param from 開始日時
 * @param to 終了日時
 * @returns ファイルパスの配列
 */
function getTargetMetricsFiles(
	metricsDir: string,
	from?: string,
	to?: string
): string[] {
	const allFiles = listMetricsFiles(metricsDir);

	if (!from && !to) {
		return allFiles;
	}

	const fromDate = from ? new Date(from) : null;
	const toDate = to ? new Date(to) : null;

	return allFiles.filter((file) => {
		// ファイル名から日付を抽出: scheduler-metrics-YYYY-MM-DD.jsonl
		const match = file.match(/scheduler-metrics-(\d{4}-\d{2}-\d{2})(?:-\d+)?\.jsonl$/);
		if (!match) return false;

		const fileDate = new Date(match[1]);
		if (fromDate && fileDate < fromDate) return false;
		if (toDate && fileDate > toDate) return false;
		return true;
	});
}

/**
 * 日付範囲から対象ログファイルを特定
 */
function getTargetLogFiles(
	logDir: string,
	from?: string,
	to?: string
): string[] {
	const allFiles = listLogFiles(logDir);

	if (!from && !to) {
		return allFiles;
	}

	const fromDate = from ? new Date(from) : null;
	const toDate = to ? new Date(to) : null;

	return allFiles.filter((file) => {
		// ファイル名から日付を抽出: events-YYYY-MM-DD.jsonl
        const match = file.match(/events-(\d{4}-\d{2}-\d{2})\.jsonl$/);
        if (!match) return false;

        const fileDate = new Date(match[1]);
        if (fromDate && fileDate < fromDate) return false;
        if (toDate && fileDate > toDate) return false;
        return true;
    });
}

/**
 * 猡定のイベントをフィルタリング
 */
function filterEvents(events: LogEvent[], query: ObservabilityQuery): LogEvent[] {
    let filtered = [...events];
    // イベントタイプでフィルタ
    if (query.eventTypes && query.eventTypes.length > 0) {
        const typeSet = new Set(query.eventTypes);
        filtered = filtered.filter((e) => typeSet.has(e.eventType));
    }
    // タスクIDでフィルタ
    if (query.taskId) {
        filtered = filtered.filter((e) => e.taskId === query.taskId)
    }
    // セッションIDでフィルタ
    if (query.sessionId) {
        filtered = filtered.filter((e) => e.sessionId === query.sessionId)
    }
    // タイムスタンプ範囲でフィルタ
    if (query.from) {
        const fromMs = new Date(query.from).getTime();
        filtered = filtered.filter((e) => new Date(e.timestamp).getTime() >= fromMs);
    }
    if (query.to) {
        const toMs = new Date(query.to).getTime();
        filtered = filtered.filter((e) => new Date(e.timestamp).getTime() <= toMs);
    }
    // タイムスタンプ順にソート（新しい順）
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    // 件数制限
    if (query.limit && query.limit > 0) {
        filtered = filtered.slice(0, query.limit);
    }
    return filtered;
}
/**
 * 統計を計算
 */
function calculateStats(events: LogEvent[]): ObservabilityStats {
    const stats: ObservabilityStats = {
        totalEvents: events.length,
        eventsByType: {},
        errorCount: 0,
        toolCallsCount: 0,
        llmCallsCount: 0,
        tasksCount: 0,
    };
    const taskIds = new Set<string>();
    for (const event of events) {
        // イベントタイプ別カウント
        stats.eventsByType[event.eventType] = (stats.eventsByType[event.eventType] || 0) + 1;
        // エラーカウント
        if (event.eventType === "tool_error" || event.eventType === "llm_error") {
            stats.errorCount++;
        }
        // ツール呼び出しカウント
        if (event.eventType === "tool_call") {
            stats.toolCallsCount++;
        }
        // LLM呼び出しカウント
        if (event.eventType === "llm_request" || event.eventType === "llm_response") {
            stats.llmCallsCount++;
        }
        // タスクID収集
        if (event.taskId) {
            taskIds.add(event.taskId);
        }
        // 最初/最後のイベント時刻
        const ts = event.timestamp;
        if (!stats.firstEventAt || ts < stats.firstEventAt) {
            stats.firstEventAt = ts;
        }
        if (!stats.lastEventAt || ts > stats.lastEventAt) {
            stats.lastEventAt = ts;
        }
    }
    stats.tasksCount = taskIds.size;
    return stats;
}
/**
 * メインクエリ関数
 */
function queryObservabilityData(query: ObservabilityQuery): ObservabilityResult {
    const logDir = getLogDir();
    const metricsDir = getMetricsDir();
    const filesRead: string[] = [];
    
    // 全イベントを収集（パース統計も追跡）
    let allEvents: LogEvent[] = [];
    let totalParseErrors = 0;
    let totalIncompleteLines = 0;
    let totalRecoveredLines = 0;
    
    // trialDirが指定された場合、pi-events.jsonlから読み込む
    if (query.trialDir) {
        const trialDir = resolve(query.trialDir);
        const result = parsePiEventsFile(trialDir);
        if (result.events.length > 0) {
            allEvents = allEvents.concat(result.events);
            filesRead.push(join(trialDir, "agent", "pi-events.jsonl"));
        }
        totalParseErrors += result.parseErrors;
        totalIncompleteLines += result.incompleteLines;
    } else {
        // 通常のevents-{date}.jsonlから読み込む
        const targetFiles = getTargetLogFiles(logDir, query.from, query.to);
        
        for (const file of targetFiles) {
            const result = parseLogFileWithStats(file);
            if (result.events.length > 0) {
                allEvents = allEvents.concat(result.events);
                filesRead.push(file);
            }
            // パース統計を蓄積（イベントがなくてもエラーは記録）
            totalParseErrors += result.parseErrors;
            totalIncompleteLines += result.incompleteLines;
            totalRecoveredLines += result.recoveredLines ?? 0;
        }
    }
    
    // MetricsCollectorイベントも読み込む（デフォルトで有効）
    if (query.includeMetrics !== false) {
        const metricsFiles = getTargetMetricsFiles(metricsDir, query.from, query.to);
        
        for (const file of metricsFiles) {
            const result = parseMetricsFile(file);
            if (result.events.length > 0) {
                allEvents = allEvents.concat(result.events);
                filesRead.push(file);
            }
            totalParseErrors += result.parseErrors;
            totalIncompleteLines += result.incompleteLines;
        }
    }
    
    // フィルタリング
    const filteredEvents = filterEvents(allEvents, query);
    
    // 統計計算（オプション)
    const stats = query.includeStats !== false ? calculateStats(filteredEvents) : undefined;
    
    // パース統計をstatsに追加
    if (stats) {
        stats.parseErrors = totalParseErrors;
        stats.incompleteLines = totalIncompleteLines;
        stats.recoveredLines = totalRecoveredLines;
    }
    
    return {
        events: filteredEvents,
        stats,
        query,
        logDir,
        metricsDir,
        filesRead,
        parseStats: {
            totalParseErrors,
            totalIncompleteLines,
            totalRecoveredLines,
        },
    };
}
// ============================================
// TypeBox Schemas
// ============================================
const ObservabilityDataParams = Type.Object({
    eventTypes: Type.Optional(Type.Array(Type.String())),
    taskId: Type.Optional(Type.String()),
    sessionId: Type.Optional(Type.String()),
    from: Type.Optional(Type.String()),
    to: Type.Optional(Type.String()),
    limit: Type.Optional(Type.Number()),
    includeStats: Type.Optional(Type.Boolean()),
    trialDir: Type.Optional(Type.String()),
    includeMetrics: Type.Optional(Type.Boolean()),
});
// ============================================
// Extension Registration
// ============================================
export default function (pi: ExtensionAPI): void {
    // Initialize real-time experiment event subscription
    initExperimentEventSubscription();

    // Register pi event subscriptions for experiment_* events
    // These broadcast to pi's event system for cross-extension coordination
    pi.on("session_start", async (_event, _ctx) => {
        // Ensure subscription is active on session start
        initExperimentEventSubscription();
    });

    pi.on("session_shutdown", async () => {
        // Clear callbacks on shutdown
        experimentEventCallbacks.clear();
    });

    pi.registerTool({
        name: "observability_data",
        label: "Observability Data",
        description:
            "ComprehensiveLoggerが記録したイベントログをクエリしてobservabilityデータを取得する。" +
            "イベントタイプ、タスクID、セッションID、日時範囲でフィルタリング可能。" +
            "trialDirを指定すると、terminal-bench実験のpi-events.jsonlからLLMメトリクスを取得可能。" +
            "デフォルトでMetricsCollector(.pi/metrics/)のイベント(preemption, work_steal, task_completion)も統合して返す。",
        parameters: ObservabilityDataParams,
        async execute(toolCallId, params, signal, onUpdate, ctx) {
            const query = params as ObservabilityQuery;
            try {
                const result = queryObservabilityData(query);
                return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                    details: {},
                }
            } catch (error) {
                return {
                    content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
                    details: {},
                }
            }
        },
    })

    // Real-time experiment event subscription tool
    const SubscribeExperimentEventsParams = Type.Object({
        limit: Type.Optional(Type.Number()),
    });

    pi.registerTool({
        name: "subscribe_experiment_events",
        label: "Subscribe Experiment Events",
        description:
            "実験イベント（experiment_start, experiment_baseline, experiment_run, " +
            "experiment_improved, experiment_regressed, experiment_timeout）の" +
            "リアルタイム購読を提供する。直近の実験イベントキャッシュを返す。",
        parameters: SubscribeExperimentEventsParams,
        async execute(toolCallId, params, signal, onUpdate, ctx) {
            const limit = (params as { limit?: number }).limit ?? 50;
            try {
                const events = getRecentExperimentEvents(limit);
                return {
                    content: [{ type: "text", text: JSON.stringify({
                        subscribed: true,
                        cacheSize: recentExperimentEvents.length,
                        events,
                        message: "Real-time experiment event subscription is active. " +
                            "Events are broadcast via onExperimentEvent() callback mechanism.",
                    }, null, 2) }],
                    details: { events },
                }
            } catch (error) {
                return {
                    content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
                    details: {},
                }
            }
        },
    })

    // コマンドラインからの簡易クエリ
    pi.registerCommand("observability", {
        description: "Show recent observability events from ComprehensiveLogger",
        handler: async (_args, ctx) => {
            const logDir = getLogDir();
            const files = listLogFiles(logDir);
            if (files.length === 0) {
                ctx.ui.notify(`No log files found in ${logDir}`, "info");
                return;
            }
            // 直近のファイルから最新100件を取得
            const recentFile = files[0];
            if (!recentFile) {
                ctx.ui.notify("No log files available", "info");
                return;
            }
            const events = parseLogFile(recentFile).slice(0, 100);
            const stats = calculateStats(events);
            await ctx.ui.custom<void>((tui, theme, _kb, done) => ({
                render: (w) => {
                    const lines: string[] = [];
                    const width = Math.max(1, w);
                    lines.push(theme.bold(theme.fg("accent", "Observability Data")));
                    lines.push(theme.fg("dim", `Log directory: ${logDir}`));
                    lines.push(theme.fg("dim", `Files: ${files.length} | Events shown: ${events.length}`));
                    lines.push("");
                    // 統計サマリー
                    lines.push(theme.bold("Statistics:"));
                    lines.push(`  Total events: ${stats.totalEvents}`);
                    lines.push(`  Tool calls: ${stats.toolCallsCount}`);
                    lines.push(`  LLM calls: ${stats.llmCallsCount}`);
                    lines.push(`  Errors: ${stats.errorCount}`);
                    lines.push(`  Tasks: ${stats.tasksCount}`);
                    lines.push("");
                    // イベントタイプ別
                    lines.push(theme.bold("Events by type:"));
                    for (const [type, count] of Object.entries(stats.eventsByType).slice(0, 10)) {
                        lines.push(`  ${type}: ${count}`);
                    }
                    lines.push("");
                    // 最新イベント
                    lines.push(theme.bold("Recent events:"));
                    for (const event of events.slice(0, 20)) {
                        const ts = event.timestamp?.slice(11, 23) ?? "??:??:??.??";
                        const type = event.eventType.padEnd(20);
                        const taskId = event.taskId?.slice(0, 8) || "-";
                        lines.push(`  ${ts} ${type} ${taskId}`);
                    }
                    lines.push("");
                    lines.push(theme.fg("dim", "[q] close"));
                    return lines.map((l) => l.slice(0, width));
                },
                invalidate: () => {},
                handleInput: (input) => {
                    if (input === "q" || input === "escape") {
                        done();
                    }
                },
            }));
        },
    });
}
