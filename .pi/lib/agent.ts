/**
 * @abdd.meta
 * path: .pi/lib/agent.ts
 * role: エージェント関連モジュールの統合エクスポートポイント
 * why: 複数のエージェント関連モジュールから必要な型・定数・関数を一元再エクスポートし、利用側のimport文を簡潔にするため
 * related: agent-types.js, agent-common.js, agent-errors.js, runtime-utils.js
 * public_api: ThinkingLevel, RunOutcomeCode, RunOutcomeSignal, createRunId, computeLiveWindow, pickFieldCandidate, normalizeEntityOutput, resolveFailureOutcome, resolveAggregateOutcome, getModelBaseTimeoutMs, computeModelTimeoutMs, createAdaptivePenaltyController, getLiveStatusGlyph, validateSubagentOutput, validateTeamMemberOutput, buildRateLimitKey, createRetrySchema, toConcurrencyLimit, resolveEffectiveTimeoutMs
 * invariants: 再エクスポートのみを行い、独自の実装ロジックを含まない
 * side_effects: なし（純粋な再エクスポートモジュール）
 * failure_modes: なし（依存モジュールの読み込み失敗時のみModuleNotFoundErrorが発生）
 * @abdd.explain
 * overview: エージェント、サブエージェント、チーム関連の型定義・ユーティリティ関数・定数を集約して再エクスポートするバレルモジュール
 * what_it_does:
 *   - agent-typesから型定義とタイムアウト定数を再エクスポート
 *   - agent-utils, agent-commonからユーティリティ関数と設定定数を再エクスポート
 *   - agent-errorsからエラー判定・解決関数を再エクスポート
 *   - model-timeouts, adaptive-penaltyからタイムアウト計算・ペナルティ制御を再エクスポート
 *   - live-view-utils, output-validationからUI・検証ユーティリティを再エクスポート
 *   - runtime-utils, process-utilsから実行時ユーティリティを再エクスポート
 * why_it_exists:
 *   - lib全体をimportしなくてもエージェント関連機能だけを効率的に参照可能にするため
 *   - 利用側で複数のサブモジュールパスを個別に指定する手間を削減するため
 * scope:
 *   in: なし（再エクスポートのみ）
 *   out: 全てのエクスポートは他モジュールへの委譲
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
