/**
 * @abdd.meta
 * path: .pi/extensions/observability-data.ts
 * role: ComprehensiveLoggerが出力するイベントログを読み取り、observabilityデータを提供する拡張機能
 * why: ログイベントのクエリ、フィルタリング、集計を可能にし、システムの動作を可視化するため
 * related: ../lib/comprehensive-logger.ts, ../lib/comprehensive-logger-config.ts, ../lib/comprehensive-logger-types.ts
 * public_api: observability_data ツール, observability コマンド
 * invariants: getConfig().logDir から正しいパスを取得する
 * side_effects: ファイルシステムからの読み取り
 * failure_modes: ログディレクトリが存在しない、ログファイルが破損
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
import type { LogEvent, EventType } from "../lib/comprehensive-logger-types";

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
}

export interface ObservabilityResult {
	events: LogEvent[];
	stats?: ObservabilityStats;
	query: ObservabilityQuery;
	logDir: string;
	filesRead: string[];
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
	};

	if (!existsSync(filePath)) {
		return result;
	}

	const content = readFileSync(filePath, "utf-8");
	const lines = content.split("\n").filter(Boolean);

	for (const line of lines) {
		// 行整合性チェック: 不完全な行（書き込み中の可能性）を検出
		if (!line.endsWith("}")) {
			result.incompleteLines++;
			continue;
		}

		try {
			const event = JSON.parse(line) as LogEvent;
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
		console.warn(
			`[observability-data] ${result.incompleteLines} incomplete line(s) detected in ${filePath} (possible concurrent write)`
		);
	}

	return result;
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
    const targetFiles = getTargetLogFiles(logDir, query.from, query.to);
    const filesRead: string[] = [];
    // 全イベントを収集
    let allEvents: LogEvent[] = [];
    for (const file of targetFiles) {
        const events = parseLogFile(file);
        if (events.length > 0) {
            allEvents = allEvents.concat(events);
            filesRead.push(file);
        }
    }
    // フィルタリング
    const filteredEvents = filterEvents(allEvents, query);
    // 統計計算（オプション)
    const stats = query.includeStats !== false ? calculateStats(filteredEvents) : undefined;
    return {
        events: filteredEvents,
        stats,
        query,
        logDir,
        filesRead
    }
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
});
// ============================================
// Extension Registration
// ============================================
export default function (pi: ExtensionAPI): void {
    pi.registerTool({
        name: "observability_data",
        label: "Observability Data",
        description:
            "ComprehensiveLoggerが記録したイベントログをクエリしてobservabilityデータを取得する。" +
            "イベントタイプ、タスクID、セッションID、日時範囲でフィルタリング可能。",
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
                        const ts = event.timestamp.slice(11, 23);
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
