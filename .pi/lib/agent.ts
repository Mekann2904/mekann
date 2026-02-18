/**
 * @abdd.meta
 * path: .pi/lib/agent.ts
 * role: エージェント、サブエージェント、チームに関連する全ての型定数とユーティリティ関数の集約エントリポイント
 * why: 個別のモジュールファイルを直接インポートせず、単一のパスから必要な機能をインポートするため
 * related: .pi/lib/agent-types.js, .pi/lib/agent-utils.js, .pi/lib/agent-common.js, .pi/lib/agent-errors.js
 * public_api: ThinkingLevel, createRunId, computeLiveWindow, resolveTimeoutWithEnv, isRetryableEntityError, getModelBaseTimeoutMs, createAdaptivePenaltyController, validateSubagentOutput
 * invariants: このファイル自体にはロジック実装を持たず、全てのエクスポートはLayer 1の各モジュールから再エクスポートされる
 * side_effects: なし（定数と型、純粋関数のみを提供）
 * failure_modes: 元のモジュールで型定義または実装が欠落している場合、インポート時にコンパイルエラーが発生する
 * @abdd.explain
 * overview: エージェントシステムの構成要素をまとめるバレルファイル（Barrel file）
 * what_it_does:
 *   - 型定義（ThinkingLevel, RunOutcomeCodeなど）を再エクスポートする
 *   - ランタイム設定定数（タイムアウト、再試行回数など）を再エクスポートする
 *   - ユーティリティ関数（ID生成、バリデーション、エラー処理など）を再エクスポートする
 * why_it_exists:
 *   - インポートパスの整理と階層化を行い、利用者が必要な機能を簡単に見つけられるようにするため
 *   - lib以下の実装詳細を隠蔽し、公開APIの一貫性を保つため
 * scope:
 *   in: なし（このファイルは他のモジュールに依存するのみ）
 *   out: エージェント実行、設定、エラーハンドリング、バリデーションに関連する全ての公開型と関数
 */

/**
 * Agent-related utilities and types.
 *
 * Aggregates all agent, subagent, and team-related exports
 * for convenient importing without pulling in all of lib.
 *
 * Usage:
 *   import { ... } from "./lib/agent.js";
 */

// Agent types (Layer 1)
export {
  type ThinkingLevel,
  type RunOutcomeCode,
  type RunOutcomeSignal,
  DEFAULT_AGENT_TIMEOUT_MS,
} from "./agent-types.js";

// Agent utilities (Layer 1)
export { createRunId, computeLiveWindow } from "./agent-utils.js";

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

// Process utilities (Layer 1)
export { GRACEFUL_SHUTDOWN_DELAY_MS } from "./process-utils.js";

// Subagent types (Layer 1)
export {
  type SubagentLiveStreamView,
  type SubagentLiveViewMode,
  type SubagentLiveItem,
  type SubagentMonitorLifecycle,
  type SubagentMonitorStream,
  type SubagentMonitorResource,
  type SubagentLiveMonitorController,
  type SubagentNormalizedOutput,
  type SubagentParallelCapacityResolution,
  type DelegationState,
  type PrintCommandResult,
} from "./subagent-types.js";

// Team types (Layer 1)
export {
  type TeamLivePhase,
  type TeamLiveViewMode,
  type TeamLiveItem,
  type TeamMonitorLifecycle,
  type TeamMonitorPhase,
  type TeamMonitorEvents,
  type TeamMonitorStream,
  type TeamMonitorDiscussion,
  type TeamMonitorResource,
  type AgentTeamLiveMonitorController,
  type TeamNormalizedOutput,
  type TeamParallelCapacityCandidate,
  type TeamParallelCapacityResolution,
  type TeamFrontmatter,
  type TeamMemberFrontmatter,
  type ParsedTeamMarkdown,
} from "./team-types.js";

// Structured Logger utilities (Layer 1)
export {
  StructuredLogger,
  ChildLogger,
  type LogLevel,
  type LogContext,
  type StructuredLogEntry,
  type StructuredLoggerOptions,
  getMinLogLevel,
  resetMinLogLevelCache,
  formatTimestamp,
  shouldLog,
  formatError,
  serializeLogEntry,
  formatReadableEntry,
  getDefaultLogger,
  resetDefaultLogger,
  createLogger,
  getSubagentLogger,
  getAgentTeamsLogger,
  getStorageLogger,
  logInfo,
  logWarn,
  logError,
  logDebug,
} from "./structured-logger.js";
