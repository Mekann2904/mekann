/**
 * Shared library index (DEPRECATED - Use Focused Entry Points).
 *
 * @deprecated This barrel export is deprecated. Import from focused entry points instead:
 *   - lib/agent.ts   - Agent-related types and utilities (subagents, teams)
 *   - lib/storage.ts - Storage-related utilities (run index, patterns, semantic memory)
 *   - lib/core.ts    - Core utilities (errors, validation, formatting)
 *
 * This file will be removed in a future version.
 * See: docs/architecture.md for migration guide.
 *
 * Architecture Layers:
 *   Layer 0: Core utilities (error, validation, formatting) -> lib/core.ts
 *   Layer 1: Agent utilities (types, timeouts, runtime) -> lib/agent.ts
 *   Layer 2: Advanced utilities (embeddings, memory) -> lib/storage.ts
 *   Layer 3: Coordination (cross-instance, scheduling) -> lib/storage.ts
 *
 * Migration Example:
 *   // Before (deprecated):
 *   import { PiError, createRunId, loadRunIndex } from "./lib/index.js";
 *
 *   // After (recommended):
 *   import { PiError } from "./lib/core.js";
 *   import { createRunId } from "./lib/agent.js";
 *   import { loadRunIndex } from "./lib/storage.js";
 */

// Re-export from focused entry points for backward compatibility
// New code should import directly from agent.ts, storage.ts, or core.ts
export * from "./core.js";
export * from "./agent.js";
export * from "./storage.js";

// ============================================================================
// Additional Layer 2/3 exports (not yet migrated to focused entry points)
// These will be moved to storage.ts in a future refactoring phase.
// ============================================================================

// Live monitor base utilities (Layer 2 - TUI)
export {
  type LiveItemStatus,
  type LiveStreamView,
  type LiveViewMode,
  type BaseLiveItem,
  type BaseLiveMonitorController,
  type CreateLiveItemInput,
  type LiveMonitorFactoryOptions,
  type LiveViewHeaderData,
  type HandleInputResult,
  createBaseLiveItem,
  appendStreamChunk,
  getStreamTail,
  getStreamBytes,
  getStreamLineCount,
  renderLiveViewHeader,
  renderListKeyboardHints,
  renderDetailKeyboardHints,
  renderListWindow,
  renderBaseListItemLine,
  renderSelectedItemSummary,
  renderDetailHeader,
  renderStreamOutput,
  handleListModeInput,
  handleDetailModeInput,
  applyInputResult,
  LIVE_PREVIEW_LINE_LIMIT,
  LIVE_LIST_WINDOW_SIZE,
} from "./tui/live-monitor-base.js";

// Skill registry utilities (Layer 2)
export {
  type SkillDefinition,
  type SkillReference,
  type ResolvedSkill,
  type ResolveSkillsOptions,
  type ResolveSkillsResult,
  type SkillMergeConfig,
  resolveSkills,
  mergeSkills,
  mergeSkillArrays,
  formatSkillsForPrompt,
  formatSkillsWithContent,
  loadSkillsForAgent,
  validateSkillReferences,
} from "./skill-registry.js";

// Semantic Repetition Detection utilities (Layer 2)
export {
  type SemanticRepetitionResult,
  type SemanticRepetitionOptions,
  type TrajectorySummary,
  DEFAULT_REPETITION_THRESHOLD,
  DEFAULT_MAX_TEXT_LENGTH,
  detectSemanticRepetition,
  detectSemanticRepetitionFromEmbeddings,
  TrajectoryTracker,
  isSemanticRepetitionAvailable,
  getRecommendedAction,
} from "./semantic-repetition.js";

// Intent-Aware Limits utilities (Layer 2)
export {
  type TaskIntent,
  type IntentBudget,
  type IntentClassificationInput,
  type IntentClassificationResult,
  INTENT_BUDGETS,
  classifyIntent,
  getIntentBudget,
  applyIntentLimits,
  getEffectiveRepetitionThreshold,
  isIntentClassificationAvailable,
  getAllIntentBudgets,
  summarizeIntentClassification,
} from "./intent-aware-limits.js";

// Dynamic Parallelism utilities (Layer 2)
export {
  type ParallelismConfig,
  type ProviderHealth,
  type DynamicAdjusterConfig,
  type ErrorEvent,
  DynamicParallelismAdjuster,
  getParallelismAdjuster,
  createParallelismAdjuster,
  resetParallelismAdjuster,
  getParallelism,
  adjustForError,
  attemptRecovery,
  formatDynamicParallelismSummary,
} from "./dynamic-parallelism.js";

// Checkpoint Manager utilities (Layer 2)
export {
  type Checkpoint,
  type CheckpointSaveResult,
  type PreemptionResult,
  type CheckpointManagerConfig,
  type CheckpointStats,
  type CheckpointSource,
  type CheckpointPriority,
  initCheckpointManager,
  getCheckpointManager,
  resetCheckpointManager,
  isCheckpointManagerInitialized,
  getCheckpointDir,
  getCheckpointConfigFromEnv,
} from "./checkpoint-manager.js";

// Metrics Collector utilities (Layer 2)
export {
  type SchedulerMetrics,
  type TaskCompletionEvent,
  type PreemptionEvent,
  type WorkStealEvent,
  type MetricsSummary,
  type MetricsCollectorConfig,
  type StealingStats,
  initMetricsCollector,
  getMetricsCollector,
  resetMetricsCollector,
  isMetricsCollectorInitialized,
  recordStealingAttempt,
  getMetricsConfigFromEnv,
} from "./metrics-collector.js";

// Task Scheduler utilities (Layer 3)
export {
  type TaskSource,
  type TaskCostEstimate,
  type ScheduledTask,
  type TaskResult,
  type QueueStats,
  type SchedulerConfig,
  type HybridSchedulerConfig,
  createTaskId,
  getScheduler,
  createScheduler,
  resetScheduler,
  PREEMPTION_MATRIX,
  shouldPreempt,
  preemptTask,
  resumeFromCheckpoint,
} from "./task-scheduler.js";

// Cross-Instance Coordinator utilities (Layer 3)
export {
  type ActiveModelInfo,
  type InstanceInfo,
  type CoordinatorConfig,
  type CoordinatorState,
  type StealableQueueEntry,
  type BroadcastQueueState,
  registerInstance,
  unregisterInstance,
  updateHeartbeat,
  cleanupDeadInstances,
  getActiveInstanceCount,
  getActiveInstances,
  getMyParallelLimit,
  getDynamicParallelLimit,
  shouldAttemptWorkStealing,
  getWorkStealingCandidates,
  updateWorkloadInfo,
  getCoordinatorStatus,
  isCoordinatorInitialized,
  getTotalMaxLlm,
  getEnvOverrides,
  setActiveModel,
  clearActiveModel,
  clearAllActiveModels,
  getActiveInstancesForModel,
  getModelParallelLimit,
  getModelUsageSummary,
  broadcastQueueState,
  getRemoteQueueStates,
  checkRemoteCapacity,
  stealWork,
  getWorkStealingSummary,
  cleanupQueueStates,
  isIdle,
  findStealCandidate,
  safeStealWork,
  getStealingStats,
  resetStealingStats,
  cleanupExpiredLocks,
  enhancedHeartbeat,
} from "./cross-instance-coordinator.js";

// Runtime Configuration (Layer 0 - Core)
export {
  type RuntimeProfile,
  type RuntimeConfig,
  getRuntimeConfig,
  getConfigVersion,
  reloadRuntimeConfig,
  getRuntimeProfile,
  isStableProfile,
  validateConfigConsistency,
  formatRuntimeConfig,
} from "./runtime-config.js";

// Unified Limit Resolver (Layer 3 - Coordination)
export {
  type UnifiedLimitInput,
  type LimitBreakdown,
  type UnifiedLimitResult,
  type UnifiedEnvConfig,
  setRuntimeSnapshotProvider,
  isSnapshotProviderInitialized,
  getInitializationState,
  resolveUnifiedLimits,
  formatUnifiedLimitsResult,
  getAllLimitsSummary,
  getUnifiedEnvConfig,
} from "./unified-limit-resolver.js";

// Adaptive Rate Controller (Layer 2)
export {
  type LearnedLimit,
  type AdaptiveControllerState,
  type RateLimitEvent,
  type PredictiveAnalysis,
  initAdaptiveController,
  shutdownAdaptiveController,
  getEffectiveLimit,
  recordEvent,
  record429,
  recordSuccess,
  getAdaptiveState,
  getLearnedLimit,
  resetLearnedLimit,
  resetAllLearnedLimits,
  setGlobalMultiplier,
  configureRecovery,
  isRateLimitError,
  formatAdaptiveSummary,
  analyze429Probability,
  getPredictiveAnalysis,
  shouldProactivelyThrottle,
  getPredictiveConcurrency,
  setPredictiveEnabled,
  setPredictiveThreshold,
  getSchedulerAwareLimit,
  notifyScheduler429,
  notifySchedulerTimeout,
  notifySchedulerSuccess,
  getCombinedRateControlSummary,
} from "./adaptive-rate-controller.js";

// Provider Limits (Layer 1)
export {
  type ModelLimits,
  type ModelTierLimits,
  type ProviderLimitsConfig,
  type ResolvedModelLimits,
  getLimitsConfig,
  reloadLimits,
  resolveLimits,
  getConcurrencyLimit,
  getRpmLimit,
  listProviders,
  listModels,
  saveUserLimits,
  getBuiltinLimits,
  detectTier,
  formatLimitsSummary,
} from "./provider-limits.js";
