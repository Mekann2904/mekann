/**
 * model-optimizer — type definitions for provider-aware model optimization.
 */

/** Providers that are currently optimized. */
export type OptimizedProviderId = "openai" | "openai-codex";

/** Compaction hint style per provider family. */
export type CompactionStyle = "standard-openai" | "codex-code-preserving";

/**
 * Static profile describing provider-specific optimization data.
 *
 * This is pure provider metadata.  Runtime enable/disable decisions are
 * stored in ActiveOptimizationState and driven by mekann settings.
 */
export interface ModelOptimizationProfile {
	provider: OptimizedProviderId;
	displayName: string;
	/** Regex patterns that indicate a context-overflow error for this provider. */
	overflowPatterns: RegExp[];
	/** Compaction hint style (reserved for Phase 2). */
	compactionStyle: CompactionStyle;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/** Per-model usage metrics aggregated over the current session. */
export interface ModelMetrics {
	requests: number;
	totalLatencyMs: number;
	totalInputTokens: number;
	totalOutputTokens: number;
}

/** Per-provider usage metrics aggregated over the current session. */
export interface ProviderMetrics {
	requests: number;
	totalLatencyMs: number;
	totalInputTokens: number;
	totalOutputTokens: number;
}

/** Snapshot recorded at the start of a compaction. */
export interface CompactionRecord {
	provider?: string;
	modelId?: string;
	tokensBefore?: number;
	firstKeptEntryId?: string;
	at: number;
}

/** Session-local metrics collected by the optimizer. */
export interface ModelOptimizerMetrics {
	requestsObserved: number;
	totalLatencyMs: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	overflowRecoveries: number;
	compactionsObserved: number;
	compactionsCompleted: number;
	postCompactionHintsInjected: number;
	lastCompaction?: CompactionRecord;
	byProvider: Record<string, ProviderMetrics>;
	byModel: Record<string, ModelMetrics>;
}

/** Create a fresh zeroed metrics object. */
export function createMetrics(): ModelOptimizerMetrics {
	return {
		requestsObserved: 0,
		totalLatencyMs: 0,
		totalInputTokens: 0,
		totalOutputTokens: 0,
		overflowRecoveries: 0,
		compactionsObserved: 0,
		compactionsCompleted: 0,
		postCompactionHintsInjected: 0,
		byProvider: {},
		byModel: {},
	};
}

// ---------------------------------------------------------------------------
// Active state
// ---------------------------------------------------------------------------

/** Runtime state for the currently active model/provider. */
export interface ActiveOptimizationState {
	profile?: ModelOptimizationProfile;
	provider?: string;
	modelId?: string;
	/** Master on/off: featureEnabled AND current provider is a known target. */
	enabled: boolean;
	lastSelectedAt?: number;
	/** Whether the optimizer master toggle (model-optimizer.enabled) is on. */
	featureEnabled: boolean;
	/** Whether overflow recovery is enabled via settings. */
	overflowRecoveryEnabled: boolean;
	/** Whether metrics collection is enabled via settings. */
	metricsEnabled: boolean;
	/** Whether debug-log notifications are enabled. */
	enableDebugLogging: boolean;
	/** Per-provider enable flags from settings (openai.enabled / openaiCodex.enabled). */
	providerEnabled: Record<string, boolean>;
	/** Whether compaction observer is enabled via settings. */
	compactionObserverEnabled: boolean;
	/** Whether post-compaction hint injection is enabled via settings. */
	postCompactionHintEnabled: boolean;
	/** Session-local metrics accumulator. */
	metrics: ModelOptimizerMetrics;
	/** Pending post-compaction hint. Set by session_compact, consumed by before_agent_start. */
	pendingPostCompactionHint?: {
		provider: OptimizedProviderId;
		modelId?: string;
		createdAt: number;
	};
}
