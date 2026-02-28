/**
 * @abdd.meta
 * path: .pi/lib/agent.ts
 * role: エージェント関連モジュールの統合エントリーポイント
 * why: 関連する型、定数、ユーティリティを単一のパスからインポート可能にするため
 * related: ./agent-types.ts, ./agent-utils.ts, ./agent-common.ts, ./agent-errors.ts
 * public_api: createRunId, computeLiveWindow, isRetryableEntityError, getModelBaseTimeoutMs, createAdaptivePenaltyController
 * invariants: 全てのエクスポートはLayer 1のモジュールから再エクスポートされる
 * side_effects: なし（純粋な再エクスポートのみ）
 * failure_modes: 元ファイルの読み込みエラー、または循環参照によるインポート失敗
 * @abdd.explain
 * overview: エージェント、サブエージェント、チームに関連する全ての型とユーティリティを集約したバレルファイル
 * what_it_does:
 *   - 型定義の再エクスポート
 *   - 実行ユーティリティの再エクスポート
 *   - エラー処理・検証ユーティリティの再エクスポート
 *   - タイムアウト・ペナルティ制御ロジックの再エクスポート
 * why_it_exists:
 *   - インポート元で複雑なパス指定を不要にするため
 *   - lib全体をインポートせずに機能単位で読み込むため
 * scope:
 *   in: ./agent-types.js, ./agent-utils.js, ./agent-common.js などLayer 1モジュール群
 *   out: Agent実装クラス、ツールキット、テストコード
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
export { GRACEFUL_SHUTDOWN_DELAY_MS } from "../process-utils.js";

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
  type TeamNormalizedOutputAPI,
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
