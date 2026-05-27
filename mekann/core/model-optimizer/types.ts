/**
 * model-optimizer — type definitions for API-based model optimization.
 */

/**
 * Static profile describing optimization data for a specific API protocol.
 *
 * Profiles are resolved from `Model.api` via `API_FAMILY_MAP` in profiles.ts.
 * Runtime enable/disable decisions are stored in ActiveOptimizationState
 * and driven by mekann settings.
 */
export interface OptimizationProfile {
	/** Regex patterns that indicate a context-overflow error for this API. */
	overflowPatterns: RegExp[];
	/** Prompt hint injected after compaction for this API protocol. */
	postCompactionHint: string;
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
	profile?: OptimizationProfile;
	provider?: string;
	modelId?: string;
	/** API protocol string from the current model (e.g. "openai-responses"). */
	api?: string;
	/** Master on/off: featureEnabled AND current api has a known profile. */
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
	/** Per-API-family enable flags from settings (openaiFamily.enabled / openaiCodex.enabled). */
	apiFamilyEnabled: Record<string, boolean>;
	/** Whether compaction observer is enabled via settings. */
	compactionObserverEnabled: boolean;
	/** Whether post-compaction hint injection is enabled via settings. */
	postCompactionHintEnabled: boolean;
	/** Session-local metrics accumulator. */
	metrics: ModelOptimizerMetrics;
	/** Pending post-compaction hint. Set by session_compact, consumed by before_agent_start. */
	pendingPostCompactionHint?: {
		api: string;
		modelId?: string;
		createdAt: number;
	};
}
