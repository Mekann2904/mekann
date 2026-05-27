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
	/** Whether debug-log notifications are enabled. */
	enableDebugLogging: boolean;
	/** Per-provider enable flags from settings (openai.enabled / openaiCodex.enabled). */
	providerEnabled: Record<string, boolean>;
}
