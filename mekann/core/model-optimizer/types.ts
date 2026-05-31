/**
 * model-optimizer — type definitions.
 *
 * The optimizer is structured as a root orchestrator that delegates to
 * provider-specific optimizer modules.  Each module lives in its own
 * directory (e.g. `openai/`) and implements `ProviderOptimizerModule`.
 */

import type { SettingSchema } from "../../settings/types.js";

// ---------------------------------------------------------------------------
// Module interface
// ---------------------------------------------------------------------------

/**
 * A provider-specific optimizer module.
 *
 * Modules live in subdirectories (e.g. `openai/`, `deepseek/`) and declare
 * which APIs they support, how to detect overflow, what compaction hints to
 * inject, and what settings they expose.
 *
 * All methods receive the small structural model surface needed by optimizer
 * modules.  This keeps shared settings/typecheck paths independent from the
 * concrete pi-ai package while remaining compatible with pi-ai's Model<Api>.
 */
export interface OptimizerModel {
	api: string;
	id: string;
	provider: string;
}

export interface ProviderOptimizerModule {
	/** Unique module identifier (e.g. "openai", "deepseek"). */
	id: string;

	/** Whether this module handles the given model (typically by `model.api`). */
	supports(model: OptimizerModel): boolean;

	/**
	 * Settings family key for the given model.
	 * Returns `undefined` if the model is not supported.
	 */
	familyKey(model: OptimizerModel): string | undefined;

	/**
	 * Detect whether an error message is a context-overflow error.
	 * Return `true` if the message should be rewritten.
	 */
	detectOverflow(ctx: { model: OptimizerModel; errorMessage: string }): boolean;

	/**
	 * Rewrite an overflow error message.
	 * Default canonical form: `context_length_exceeded: <original>`.
	 */
	rewriteOverflow(ctx: { model: OptimizerModel; errorMessage: string }): string;

	/**
	 * Build a post-compaction continuation hint.
	 * Return `undefined` to skip hint injection.
	 */
	buildPostCompactionHint(ctx: { model: OptimizerModel }): string | undefined;

	/** Settings contributed by this module. */
	settings: SettingSchema<boolean>[];
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
	/** Currently active optimizer module, or undefined if no module supports the current model. */
	activeModule?: ProviderOptimizerModule;
	provider?: string;
	modelId?: string;
	/** API protocol string from the current model (e.g. "openai-responses"). */
	api?: string;
	/** Master on/off: featureEnabled AND active module exists AND family enabled. */
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
	/** Per-API-family enable flags from settings. */
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
