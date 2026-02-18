/**
 * @abdd.meta
 * path: .pi/extensions/search/utils/metrics.ts
 * role: 検索操作のパフォーマンス計測とメトリクス収集ユーティリティ
 * why: 検索処理の実行時間、ファイル数、インデックスヒット率などの統計情報を追跡し、モニタリング・デバッグ・ユーザーフィードバックに使用するため
 * related: search-engine.ts, search-coordinator.ts, performance-monitor.ts
 * public_api: SearchMetrics, ExtendedSearchMetrics, MetricsCollector
 * invariants: durationMsは必ず0以上の数値、indexHitRateは設定時0.0-1.0の範囲、filesSearchedは0以上
 * side_effects: なし（純粋なデータ構造と計測ユーティリティ）
 * failure_modes: performance.now()が使用できない環境での計測エラー
 * @abdd.explain
 * overview: 検索拡張機能向けのパフォーマンスメトリクス型定義と収集クラスを提供する
 * what_it_does:
 *   - SearchMetricsインターフェースで基本メトリクス（実行時間、検索ファイル数、インデックスヒット率）を定義
 *   - ExtendedSearchMetricsでCLI実行時間、解析時間、結果切り捨て情報を追加
 *   - MetricsCollectorクラスでメソッドチェーンによるメトリクス収集を提供
 * why_it_exists:
 *   - 検索操作のパフォーマンス可視化とボトルネック特定
 *   - CLIツールとネイティブフォールバックの性能比較
 *   - ユーザーへの検索進捗・統計フィードバック
 * scope:
 *   in: ツール名、検索ファイル数、インデックスヒット率、CLI/解析時間、結果数
 *   out: SearchMetrics/ExtendedSearchMetricsオブジェクト、経過時間の取得
 */

/**
 * Search Extension Metrics
 *
 * Performance metrics and statistics for search operations.
 * Used for monitoring, debugging, and providing feedback to users.
 */

// ============================================
// Core Metrics Types
// ============================================

 /**
  * 検索操作のパフォーマンス指標。
  * @param durationMs 総実行時間（ミリ秒）。
  * @param filesSearched 検索または列挙されたファイル数。
  * @param indexHitRate インデックス使用時のヒット率（0.0-1.0）。
  */
export interface SearchMetrics {
	/**
	 * Total execution time in milliseconds.
	 */
	durationMs: number;

	/**
	 * Number of files searched or enumerated.
	 */
	filesSearched: number;

	/**
	 * Index hit rate (0.0-1.0) if index was used.
	 * Higher values indicate more efficient searches.
	 */
	indexHitRate?: number;

	/**
	 * Name of the tool that generated these metrics.
	 */
	toolName: string;
}

 /**
  * 拡張検索メトリクス
  * @param cliTimeMs 外部CLIツールの実行時間（ミリ秒）
  * @param parseTimeMs 結果の解析時間（ミリ秒）
  * @param totalResults 切り捨て前の結果数
  * @param returnedResults 返された結果数
  * @param truncated 結果が切り捨てられたかどうか
  */
export interface ExtendedSearchMetrics extends SearchMetrics {
	/**
	 * Time spent in the external CLI tool (if applicable).
	 */
	cliTimeMs?: number;

	/**
	 * Time spent parsing results.
	 */
	parseTimeMs?: number;

	/**
	 * Number of results before truncation.
	 */
	totalResults: number;

	/**
	 * Number of results after truncation.
	 */
	returnedResults: number;

	/**
	 * Whether results were truncated.
	 */
	truncated: boolean;

	/**
	 * Whether fallback (native) implementation was used.
	 */
	usedFallback: boolean;
}

// ============================================
// Metrics Collector
// ============================================

 /**
  * 操作の時間計測用メトリクスコレクタ
  * @param toolName ツール名
  */
export class MetricsCollector {
	private startTime: number;
	private toolName: string;
	private filesSearched = 0;
	private indexHitRate: number | undefined;

	constructor(toolName: string) {
		this.toolName = toolName;
		this.startTime = performance.now();
	}

	/**
	 * Set the number of files searched.
	 */
	setFilesSearched(count: number): this {
		this.filesSearched = count;
		return this;
	}

	 /**
	  * インデックスのヒット率を設定する。
	  * @param rate ヒット率
	  * @returns this
	  */
	setIndexHitRate(rate: number): this {
		this.indexHitRate = rate;
		return this;
	}

	 /**
	  * 経過時間（ミリ秒）を取得する。
	  * @returns 経過時間（ミリ秒）
	  */
	elapsedMs(): number {
		return performance.now() - this.startTime;
	}

	 /**
	  * メトリクスを確定して返却します。
	  * @returns 検索メトリクス
	  */
	finish(): SearchMetrics {
		return {
			durationMs: this.elapsedMs(),
			filesSearched: this.filesSearched,
			indexHitRate: this.indexHitRate,
			toolName: this.toolName,
		};
	}
}

// ============================================
// Metrics Aggregation
// ============================================

 /**
  * 複数操作の集計メトリクス
  * @param operationCount 操作の合計回数
  * @param totalDurationMs 合計実行時間（ミリ秒）
  * @param averageDurationMs 平均実行時間（ミリ秒）
  */
export interface AggregatedMetrics {
	/**
	 * Total number of operations.
	 */
	operationCount: number;

	/**
	 * Total execution time in milliseconds.
	 */
	totalDurationMs: number;

	/**
	 * Average execution time in milliseconds.
	 */
	averageDurationMs: number;

	/**
	 * Minimum execution time in milliseconds.
	 */
	minDurationMs: number;

	/**
	 * Maximum execution time in milliseconds.
	 */
	maxDurationMs: number;

	/**
	 * Total files searched across all operations.
	 */
	totalFilesSearched: number;

	/**
	 * Average index hit rate (if applicable).
	 */
	averageIndexHitRate?: number;

	/**
	 * Breakdown by tool name.
	 */
	byTool: Record<string, ToolMetricsSummary>;
}

 /**
  * 単一ツールのメトリクス概要
  * @param count 操作回数
  * @param totalDurationMs 総実行時間
  * @param averageDurationMs 平均実行時間
  */
export interface ToolMetricsSummary {
	/**
	 * Number of operations for this tool.
	 */
	count: number;

	/**
	 * Total execution time.
	 */
	totalDurationMs: number;

	/**
	 * Average execution time.
	 */
	averageDurationMs: number;
}

 /**
  * メトリクスを集計してサマリーを生成する
  * @param metrics - 検索メトリクスの配列
  * @returns 集計されたメトリクスサマリー
  */
export function aggregateMetrics(metrics: SearchMetrics[]): AggregatedMetrics {
	if (metrics.length === 0) {
		return {
			operationCount: 0,
			totalDurationMs: 0,
			averageDurationMs: 0,
			minDurationMs: 0,
			maxDurationMs: 0,
			totalFilesSearched: 0,
			byTool: {},
		};
	}

	const durations = metrics.map((m) => m.durationMs);
	const hitRates = metrics
		.filter((m) => m.indexHitRate !== undefined)
		.map((m) => m.indexHitRate!);

	const byTool: Record<string, ToolMetricsSummary> = {};
	for (const m of metrics) {
		if (!byTool[m.toolName]) {
			byTool[m.toolName] = {
				count: 0,
				totalDurationMs: 0,
				averageDurationMs: 0,
			};
		}
		byTool[m.toolName].count++;
		byTool[m.toolName].totalDurationMs += m.durationMs;
	}

	// Calculate averages
	for (const tool of Object.values(byTool)) {
		tool.averageDurationMs = tool.totalDurationMs / tool.count;
	}

	return {
		operationCount: metrics.length,
		totalDurationMs: durations.reduce((a, b) => a + b, 0),
		averageDurationMs:
			durations.reduce((a, b) => a + b, 0) / durations.length,
		minDurationMs: Math.min(...durations),
		maxDurationMs: Math.max(...durations),
		totalFilesSearched: metrics.reduce((a, m) => a + m.filesSearched, 0),
		averageIndexHitRate:
			hitRates.length > 0
				? hitRates.reduce((a, b) => a + b, 0) / hitRates.length
				: undefined,
		byTool,
	};
}

// ============================================
// Metrics Formatting
// ============================================

 /**
  * 検索メトリクスを表示用にフォーマットする
  * @param metrics 検索メトリクス
  * @returns フォーマットされた文字列
  */
export function formatMetrics(metrics: SearchMetrics): string {
	const lines: string[] = [
		`Tool: ${metrics.toolName}`,
		`Duration: ${formatDuration(metrics.durationMs)}`,
		`Files searched: ${metrics.filesSearched}`,
	];

	if (metrics.indexHitRate !== undefined) {
		lines.push(`Index hit rate: ${(metrics.indexHitRate * 100).toFixed(1)}%`);
	}

	return lines.join("\n");
}

 /**
  * ミリ秒を読みやすい時間文字列に変換
  * @param ms ミリ秒単位の時間
  * @returns フォーマットされた時間文字列
  */
export function formatDuration(ms: number): string {
	if (ms < 1) {
		return `${(ms * 1000).toFixed(0)}us`;
	}
	if (ms < 1000) {
		return `${ms.toFixed(0)}ms`;
	}
	if (ms < 60000) {
		return `${(ms / 1000).toFixed(2)}s`;
	}
	return `${(ms / 60000).toFixed(1)}m`;
}

// ============================================
// Performance Thresholds
// ============================================

 /**
  * 検索操作のパフォーマンスしきい値
  * @param fast 高速操作の最大許容時間 (ms)
  * @param normal 通常操作の最大許容時間 (ms)
  * @param slow 低速操作の最大許容時間 (ms)
  */
export interface PerformanceThresholds {
	/**
	 * Maximum acceptable duration for fast operations (ms).
	 */
	fast: number;

	/**
	 * Maximum acceptable duration for normal operations (ms).
	 */
	normal: number;

	/**
	 * Maximum acceptable duration for slow operations (ms).
	 */
	slow: number;
}

/**
 * Default performance thresholds.
 */
export const DEFAULT_THRESHOLDS: PerformanceThresholds = {
	fast: 100,    // < 100ms is fast
	normal: 1000, // < 1s is normal
	slow: 5000,   // < 5s is acceptable, > 5s is slow
};

 /**
  * 実行時間に基づいて速度を分類する
  * @param durationMs 実行時間（ミリ秒）
  * @param thresholds 各速度の閾値
  * @returns "fast", "normal", "slow", "very-slow" のいずれか
  */
export function classifySpeed(
	durationMs: number,
	thresholds: PerformanceThresholds = DEFAULT_THRESHOLDS
): "fast" | "normal" | "slow" | "very-slow" {
	if (durationMs < thresholds.fast) return "fast";
	if (durationMs < thresholds.normal) return "normal";
	if (durationMs < thresholds.slow) return "slow";
	return "very-slow";
}
