/**
 * Shared library index.
 * Re-exports all common utilities for convenient importing.
 */

// Error handling utilities (Layer 0)
export {
  toErrorMessage,
  extractStatusCodeFromMessage,
  classifyPressureError,
  isCancelledErrorMessage,
  isTimeoutErrorMessage,
  type PressureErrorType,
} from "./error-utils.js";

// TUI utilities (Layer 0)
export {
  appendTail,
  toTailLines,
  countOccurrences,
  estimateLineCount,
  looksLikeMarkdown,
  renderPreviewWithMarkdown,
  LIVE_TAIL_LIMIT,
  LIVE_MARKDOWN_PREVIEW_MIN_WIDTH,
  type MarkdownPreviewResult,
} from "./tui-utils.js";

// Validation utilities (Layer 0)
export {
  toFiniteNumber,
  toFiniteNumberWithDefault,
  toBoundedInteger,
  clampInteger,
  clampFloat,
  type BoundedIntegerResult,
} from "./validation-utils.js";

// File system utilities (Layer 0)
export { ensureDir } from "./fs-utils.js";

// Formatting utilities (Layer 0)
export {
  formatDuration,
  formatDurationMs,
  formatBytes,
  formatClockTime,
  normalizeForSingleLine,
} from "./format-utils.js";

// Agent types (Layer 1)
export {
  type ThinkingLevel,
  type RunOutcomeCode,
  type RunOutcomeSignal,
  DEFAULT_AGENT_TIMEOUT_MS,
} from "./agent-types.js";

// Process utilities (Layer 1)
export { GRACEFUL_SHUTDOWN_DELAY_MS } from "./process-utils.js";

// Agent utilities (Layer 1)
export { createRunId, computeLiveWindow } from "./agent-utils.js";

// Model timeout utilities (Layer 1)
export {
  MODEL_TIMEOUT_BASE_MS,
  THINKING_LEVEL_MULTIPLIERS,
  getModelBaseTimeoutMs,
  computeModelTimeoutMs,
  computeProgressiveTimeoutMs,
  type ComputeModelTimeoutOptions,
} from "./model-timeouts.js";

// Adaptive penalty controller (Layer 1)
export {
  createAdaptivePenaltyController,
  type AdaptivePenaltyState,
  type AdaptivePenaltyOptions,
  type AdaptivePenaltyController,
} from "./adaptive-penalty.js";

// Live view utilities (Layer 1)
export {
  getLiveStatusGlyph,
  isEnterInput,
  finalizeLiveLines,
  type LiveStatus,
} from "./live-view-utils.js";

// Output validation utilities (Layer 1)
export {
  hasIntentOnlyContent,
  hasNonEmptyResultSection,
  validateSubagentOutput,
  validateTeamMemberOutput,
  type SubagentValidationOptions,
  type TeamMemberValidationOptions,
} from "./output-validation.js";

// Runtime utilities (Layer 1)
export {
  trimForError,
  buildRateLimitKey,
  buildTraceTaskId,
  normalizeTimeoutMs,
  createRetrySchema,
  toRetryOverrides,
  toConcurrencyLimit,
} from "./runtime-utils.js";

// Runtime error builders (Layer 1)
export { resolveEffectiveTimeoutMs } from "./runtime-error-builders.js";

// Agent common utilities (Layer 1)
export {
  STABLE_RUNTIME_PROFILE,
  ADAPTIVE_PARALLEL_MAX_PENALTY,
  ADAPTIVE_PARALLEL_DECAY_MS,
  STABLE_MAX_RETRIES,
  STABLE_INITIAL_DELAY_MS,
  STABLE_MAX_DELAY_MS,
  STABLE_MAX_RATE_LIMIT_RETRIES,
  STABLE_MAX_RATE_LIMIT_WAIT_MS,
  type EntityType,
  type EntityConfig,
  SUBAGENT_CONFIG,
  TEAM_MEMBER_CONFIG,
  type NormalizedEntityOutput,
  type PickFieldCandidateOptions,
  pickFieldCandidate,
  pickSummaryCandidate,
  pickClaimCandidate,
  type NormalizeEntityOutputOptions,
  normalizeEntityOutput,
  isEmptyOutputFailureMessage,
  buildFailureSummary,
  resolveTimeoutWithEnv,
} from "./agent-common.js";

// Agent error utilities (Layer 1)
export {
  isRetryableEntityError,
  isRetryableSubagentError,
  isRetryableTeamMemberError,
  resolveFailureOutcome,
  resolveSubagentFailureOutcome,
  resolveTeamFailureOutcome,
  type EntityResultItem,
  resolveAggregateOutcome,
  resolveSubagentParallelOutcome,
  resolveTeamMemberAggregateOutcome,
  trimErrorMessage,
  buildDiagnosticContext,
} from "./agent-errors.js";

// Storage base utilities (Layer 2)
export {
  type HasId,
  type BaseRunRecord,
  type BaseStoragePaths,
  type BaseStorage,
  createPathsFactory,
  createEnsurePaths,
  pruneRunArtifacts,
  mergeEntitiesById,
  mergeRunsById,
  resolveCurrentId,
  resolveDefaultsVersion,
  createStorageLoader,
  createStorageSaver,
  toId,
  mergeSubagentStorageWithDisk,
  mergeTeamStorageWithDisk,
} from "./storage-base.js";

// Live monitor base utilities (Layer 2)
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
} from "./live-monitor-base.js";

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

// Robustness/Perturbation testing utilities (Layer 2)
// 論文「Large Language Model Reasoning Failures」のP1推奨事項
export {
  type PerturbationType,
  type BoundaryType,
  type PerturbationTestResult,
  type BoundaryTestResult,
  type ConsistencyTestResult,
  type RobustnessTestReport,
  type RobustnessTestConfig,
  DEFAULT_ROBUSTNESS_CONFIG,
  applySynonymReplacement,
  applyWordReorder,
  applyNoiseInjection,
  applyTypoSimulation,
  applyParaphrase,
  generateBoundaryInput,
  calculateOutputDeviation,
  calculateConsistencyScore,
  extractStabilityPatterns,
  runPerturbationTest,
  runBoundaryTest,
  runConsistencyTest,
  runRobustnessTest,
  resolveRobustnessConfig,
  formatRobustnessReport,
  getRobustnessTestRules,
} from "./robustness-testing.js";

// Run Index utilities (Layer 2)
// ALMA-inspired memory indexing for run history
export {
  type IndexedRun,
  type TaskType,
  type RunIndex,
  type SearchOptions,
  type SearchResult,
  RUN_INDEX_VERSION,
  extractKeywords,
  classifyTaskType,
  extractFiles,
  indexSubagentRun,
  indexTeamRun,
  buildRunIndex,
  getRunIndexPath,
  loadRunIndex,
  saveRunIndex,
  getOrBuildRunIndex,
  searchRuns,
  findSimilarRuns,
  getRunsByType,
  getSuccessfulPatterns,
} from "./run-index.js";

// Pattern Extraction utilities (Layer 2)
// Extract reusable patterns from run history
export {
  type ExtractedPattern,
  type PatternExample,
  type PatternStorage,
  type RunData,
  PATTERN_STORAGE_VERSION,
  extractPatternFromRun,
  getPatternStoragePath,
  loadPatternStorage,
  savePatternStorage,
  addRunToPatterns,
  extractAllPatterns,
  getPatternsForTaskType,
  getTopSuccessPatterns,
  getFailurePatternsToAvoid,
  findRelevantPatterns,
} from "./pattern-extraction.js";

// Semantic Memory utilities (Layer 2)
// OpenAI Embeddings-based semantic search for run history
export {
  type RunEmbedding,
  type SemanticMemoryStorage,
  type SemanticSearchResult,
  SEMANTIC_MEMORY_VERSION,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  getSemanticMemoryPath,
  loadSemanticMemory,
  saveSemanticMemory,
  buildSemanticMemoryIndex,
  addRunToSemanticMemory,
  semanticSearch,
  findSimilarRunsById,
  isSemanticMemoryAvailable,
  getSemanticMemoryStats,
  clearSemanticMemory,
} from "./semantic-memory.js";

// Embeddings Module (Layer 2)
// Unified embedding provider interface
export {
  // Types
  type EmbeddingProvider,
  type ProviderCapabilities,
  type ProviderConfig,
  type EmbeddingModuleConfig,
  type EmbeddingResult,
  type ProviderStatus,
  type VectorSearchResult,
  // Registry
  EmbeddingProviderRegistry,
  embeddingRegistry,
  getEmbeddingProvider,
  generateEmbedding,
  generateEmbeddingsBatch,
  // Utilities
  cosineSimilarity,
  euclideanDistance,
  normalizeVector,
  findNearestNeighbors,
  isValidEmbedding,
  // Providers
  OpenAIEmbeddingProvider,
  openAIEmbeddingProvider,
  getOpenAIKey,
  setOpenAIKey,
  removeOpenAIKey,
  // Initialization
  initializeEmbeddingModule,
} from "./embeddings/index.js";

// Semantic Repetition Detection utilities (Layer 2)
// Based on "Agentic Search in the Wild" paper (arXiv:2601.17617v2)
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
// Based on "Agentic Search in the Wild" paper (arXiv:2601.17617v2)
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
