/**
 * @abdd.meta
 * path: .pi/extensions/search/utils/metrics.ts
 * role: 検索操作のパフォーマンスメトリクス定義と収集ロジックの提供
 * why: 検索処理の監視、デバッグ、およびユーザーへのフィードバック機能を実現するため
 * related: .pi/extensions/search/services/searchHandler.ts, .pi/extensions/search/components/statusBar.ts, .pi/extensions/search/types/index.ts
 * public_api: SearchMetrics, ExtendedSearchMetrics, MetricsCollector
 * invariants: durationMsは0以上、indexHitRateは0.0〜1.0の範囲、returnedResultsはtotalResults以下
 * side_effects: performance.now()による時刻計測、インスタンス内のプロパティ更新
 * failure_modes: performance.now()が未実装環境での動作未定義、範囲外の値設定によるロジック破綻
 * @abdd.explain
 * overview: 検索処理の実行時間やファイル数などの統計情報を管理する型と、計測を行うクラスを定義するモジュール
 * what_it_does:
 *   - SearchMetricsおよびExtendedSearchMetricsインターフェースを定義する
 *   - MetricsCollectorクラスで経過時間、検索ファイル数、インデックス命中率を記録する
 *   - ビルダーパターンのようにメトリクス値を設定し、計測結果を生成する
 * why_it_exists:
 *   - 検索機能のパフォーマンスボトルネックを特定するため
 *   - 外部CLIツールと内部処理の時間を区別して計測するため
 * scope:
 *   in: ツール名、検索ファイル数、インデックス命中率
 * out: 計測開始からの経過時間を含むメトリクスオブジェクト
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
 * 検索操作のメトリクス
 * @summary メトリクス定義
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
 * 検索メトリクスインターフェース
 * @summary 検索メトリクス定義
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
 * メトリクス収集クラス
 * @summary メトリクスを収集する
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
	 * 検索ファイル数設定
	 * @summary 検索ファイル数を設定
	 * @param {number} count ファイル数
	 * @returns {this} インスタンス自身
	 */
	setFilesSearched(count: number): this {
		this.filesSearched = count;
		return this;
	}

	/**
	 * イン�デックス命中率設定
	 * @summary インデックス命中率を設定
	 * @param {number} rate 命中率
	 * @returns {this} インスタンス自身
	 */
	setIndexHitRate(rate: number): this {
		this.indexHitRate = rate;
		return this;
	}

	/**
	 * 経過時間取得
	 * @summary 経過時間を取得
	 * @returns {number} 経過時間（ミリ秒）
	 */
	elapsedMs(): number {
		return performance.now() - this.startTime;
	}

	/**
	 * 計測を終了して指標を取得
	 * @summary 計測終了
	 * @returns 計測結果の検索指標
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
 * 集計された検索指標
 * @summary 集計指標定義
 * @returns 集計された指標データ
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
 * ツール指標の概要
 * @summary ツール指標概要
 * @returns ツール指標の概要情報
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
 * 検索指標を集計
 * @summary 指標を集計
 * @param metrics 集計対象の検索指標配列
 * @returns 集計結果
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
 * 検索指標を整形
 * @summary 指標を文字列化
 * @param metrics 整形対象の検索指標
 * @returns 整形された文字列
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
 * @summary 時間文字列を生成
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
 * パフォーマンスしきい値定義
 * @summary パフォーマンスしきい値
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
 * 実行時間を分類する
 * @summary 速度を分類する
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
