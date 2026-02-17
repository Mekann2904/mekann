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
 * Performance metrics for search operations.
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
 * Extended metrics with additional details.
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
 * Simple metrics collector for timing operations.
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
	 * Set the index hit rate.
	 */
	setIndexHitRate(rate: number): this {
		this.indexHitRate = rate;
		return this;
	}

	/**
	 * Get the elapsed time in milliseconds.
	 */
	elapsedMs(): number {
		return performance.now() - this.startTime;
	}

	/**
	 * Finalize and return the metrics.
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
 * Aggregated metrics across multiple operations.
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
 * Metrics summary for a single tool.
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
 * Aggregate multiple metrics into a summary.
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
 * Format metrics for display.
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
 * Format duration in human-readable form.
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
 * Performance thresholds for search operations.
 * Used to identify slow operations.
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
 * Classify operation speed based on duration.
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
