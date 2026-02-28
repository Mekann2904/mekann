/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/extension.ts
 * role: 複数のエージェントで構成されるチームの定義、実行、監視、結果の永続化を行う拡張機能の実装
 * why: 専門化されたロールを持つエージェント間で並列かつ協調的なタスク実行を可能にするため
 * related: .pi/extensions/agent-teams/judge.ts, .pi/extensions/agent-teams/storage.ts, .pi/extensions/subagents.ts, .pi/extensions/plan.ts
 * public_api: TeamDefinition, TeamMemberResult, TeamRunRecord, createRunId
 * invariants: チーム実行IDは一意である、通信ラウンド数は最大値を超えない、リトライ回数は制限内である
 * side_effects: ファイルシステムへのチーム定義と実行履歴の書き込み、ログ出力、外部モデルAPIの呼び出し
 * failure_modes: API通信エラー、スキーマ検証失敗、タイムアウト、ディスク容量不足、循環的な通信による無限ループ
 * @abdd.explain
 * overview: マルチエージェントシステムのオーケストレーションを提供する。チーム定義のロード、メンバー間の通信調整、審査（Judge）による合意形成、実行結果の追跡と保存を行う。
 * what_it_does:
 *   - チーム定義ファイルの読み込みと検証
 *   - 各メンバーの並列実行と出力の検証
 *   - メンバー間のコミュニケーション（議論）フェーズの管理
 *   - 最終審査（Judge）による合意形成と不確実性の評価
 *   - 実行結果のシリアライズとファイルシステムへの保存
 *   - コスト見積もりと実行ログの記録
 * why_it_exists:
 *   - 単一のエージェントでは対応困難な複雑なタスクを分担するため
 *   - 異なる視点を持つエージェントが議論することで回答の精度を高めるため
 *   - 並列実行によるタスク完了時間の短縮を図るため
 * scope:
 *   in: ExtensionAPI（システムコンテキスト）、TeamDefinition（チーム設定）、ユーザー入力
 *   out: TeamRunRecord（実行結果）、TUI表示、ファイルシステム更新、APIリクエスト
 */

// File: .pi/extensions/agent-teams.ts
// Description: Adds multi-member agent team orchestration tools for pi.
// Why: Enables proactive parallel collaboration across specialized teammate roles.
// Related: .pi/extensions/subagents.ts, .pi/extensions/plan.ts, README.md

import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import { Type } from "@mariozechner/pi-ai";
import { integrateWithTeamExecution } from "../tool-compiler.js";
import type { ToolCall } from "../../lib/tool-compiler-types.js";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Key, Markdown, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";


// Import shared plan mode utilities
import { ensureDir } from "../../lib/core/fs-utils.js";
import {
  formatDurationMs,
  formatBytes,
  formatClockTime,
  normalizeForSingleLine,
} from "../../lib/core/format-utils.js";
import {
  getLiveStatusGlyph,
  isEnterInput,
  finalizeLiveLines,
  type LiveStatus,
} from "../../lib/live-view-utils.js";
import {
  toTailLines,
  looksLikeMarkdown,
  appendTail,
  countOccurrences,
  estimateLineCount,
  renderPreviewWithMarkdown,
  LIVE_TAIL_LIMIT,
  LIVE_MARKDOWN_PREVIEW_MIN_WIDTH,
} from "../../lib/tui/tui-utils.js";
import {
  extractStatusCodeFromMessage,
  classifyPressureError,
  isCancelledErrorMessage,
  isTimeoutErrorMessage,
  toErrorMessage,
} from "../../lib/core/error-utils.js";
import { createRunId, computeLiveWindow } from "../../lib/agent/agent-utils.js";
import {
  ThinkingLevel,
  RunOutcomeCode,
  RunOutcomeSignal,
  DEFAULT_AGENT_TIMEOUT_MS,
} from "../../lib/agent/agent-types.js";
import { computeModelTimeoutMs } from "../../lib/agent/model-timeouts.js";
import { validateTeamMemberOutput } from "../../lib/output-validation.js";
import { trimForError, buildRateLimitKey, buildTraceTaskId, createRetrySchema, toConcurrencyLimit } from "../../lib/agent/runtime-utils.js";
import { resolveEffectiveTimeoutMs } from "../../lib/runtime-error-builders.js";
import { createChildAbortController } from "../../lib/abort-utils";
import {
  createAdaptivePenaltyController,
} from "../../lib/adaptive-penalty.js";
import {
  SchemaValidationError,
  ValidationError,
  TeamDefinitionError,
} from "../../lib/core/errors.js";
import { getLogger } from "../../lib/comprehensive-logger";
import type { OperationType } from "../../lib/comprehensive-logger-types";
import { getCostEstimator, type ExecutionHistoryEntry, CostEstimator } from "../../lib/cost-estimator";

const logger = getLogger();

/**
 * Check if Tool Compiler is enabled via environment variable
 * @summary Tool Compiler有効化チェック
 * @returns Tool Compilerが有効な場合はtrue
 */
function isToolCompilerEnabled(): boolean {
  return process.env.PI_TOOL_COMPILER_ENABLED === "true";
}

/**
 * Fuse member tools if Tool Compiler is enabled
 * @summary メンバーツール融合ヘルパー
 * @param memberTools - メンバーIDとツール定義のマップ
 * @returns 融合結果のマップ（有効な場合）、または空マップ
 */
function fuseMemberToolsIfEnabled(
  memberTools: Map<string, Array<{ name: string; arguments: Record<string, unknown> }>>
): Map<string, Array<{ name: string; description: string; parameters: Record<string, unknown> }>> {
  if (!isToolCompilerEnabled()) {
    return new Map();
  }

  try {
    const toolCallsMap = new Map<string, ToolCall[]>();
    for (const [memberId, tools] of memberTools.entries()) {
      toolCallsMap.set(
        memberId,
        tools.map((t, idx) => ({
          id: `tool-${memberId}-${idx}`,
          name: t.name,
          arguments: t.arguments,
        }))
      );
    }

    const compiledResults = integrateWithTeamExecution(toolCallsMap);
    const fusedToolsMap = new Map<string, Array<{ name: string; description: string; parameters: Record<string, unknown> }>>();

    for (const [memberId, compiled] of compiledResults.entries()) {
      if (compiled.fusedOperations.length > 0) {
        fusedToolsMap.set(
          memberId,
          compiled.fusedOperations.map((op) => ({
            name: op.fusedId,
            description: `Fused: ${op.toolCalls.map((t) => t.name).join(" + ")}`,
            parameters: { type: "object", properties: {} },
          }))
        );
      }
    }

    return fusedToolsMap;
  } catch {
    // Fallback on error - return empty map to use original tools
    return new Map();
  }
}

import {
  type TeamEnabledState,
  type TeamStrategy,
  type TeamMember,
  type TeamDefinition,
  type TeamMemberResult,
  type TeamJudgeVerdict,
  type TeamFinalJudge,
  type TeamCommunicationAuditEntry,
  type TeamRunRecord,
  type TeamStorage,
  type TeamPaths,
  MAX_RUNS_TO_KEEP,
  TEAM_DEFAULTS_VERSION,
  getPaths,
  ensurePaths,
  toId,
  loadStorage,
  saveStorage,
  saveStorageWithPatterns,
} from "./storage";

// Import judge module (extracted for SRP compliance)
import {
  type TeamUncertaintyProxy,
  type JudgeExplanation,
  clampConfidence,
  parseUnitInterval,
  extractDiscussionSection,
  countKeywordSignals,
  countEvidenceSignals,
  analyzeMemberOutput,
  computeProxyUncertainty,
  buildFallbackJudge,
  runFinalJudge,
} from "./judge";

// Import communication module (extracted for SRP compliance)
import {
  DEFAULT_COMMUNICATION_ROUNDS,
  MAX_COMMUNICATION_ROUNDS,
  MAX_COMMUNICATION_PARTNERS,
  COMMUNICATION_CONTEXT_FIELD_LIMIT,
  COMMUNICATION_CONTEXT_OTHER_LIMIT,
  COMMUNICATION_INSTRUCTION_PATTERN,
  DEFAULT_FAILED_MEMBER_RETRY_ROUNDS,
  MAX_FAILED_MEMBER_RETRY_ROUNDS,
  normalizeCommunicationRounds,
  normalizeFailedMemberRetryRounds,
  shouldRetryFailedMemberResult as shouldRetryFailedMemberResultBase,
  shouldPreferAnchorMember,
  createCommunicationLinksMap,
  sanitizeCommunicationSnippet,
  extractField,
  buildCommunicationContext,
  buildPrecomputedContextMap,
  detectPartnerReferences,
  detectPartnerReferencesV2,
  clearBeliefStateCache,
  type PartnerReferenceResultV2,
} from "./communication";

// Import definition-loader module (extracted for SRP compliance)
import {
  parseTeamMarkdownFile,
  loadTeamDefinitionsFromDir,
  loadTeamDefinitionsFromMarkdown,
  createDefaultTeams,
  mergeDefaultTeam,
  ensureDefaults,
  validateTeamDefinition,
  type TeamValidationError,
} from "./definition-loader";

// Import live-monitor module (extracted for SRP compliance)
import {
  renderAgentTeamLiveView,
  createAgentTeamLiveMonitor,
  toTeamLiveItemKey,
} from "./live-monitor";

// Import member-execution module (extracted for SRP compliance)
import {
  type TeamNormalizedOutput,
  normalizeTeamMemberOutput,
  mergeSkillArrays,
  resolveEffectiveTeamMemberSkills,
  formatTeamMemberSkillsSection,
  loadSkillContent,
  buildSkillsSectionWithContent,
  buildTeamMemberPrompt,
  runMember,
} from "./member-execution";

// Import result-aggregation module (extracted for SRP compliance)
import {
  isRetryableTeamMemberError,
  resolveTeamFailureOutcome,
  resolveTeamMemberAggregateOutcome,
  resolveTeamParallelRunOutcome,
  buildTeamResultText,
  aggregateTeamResults,
  type AggregationStrategy,
  type AggregationResult,
  type AggregationInput,
} from "./result-aggregation";

// Import team-orchestrator module (extracted for SRP compliance)
import {
  runTeamTask,
  shouldRetryFailedMemberResult,
  type TeamTaskInput,
  type TeamTaskResult,
} from "./team-orchestrator.js";

// Import team types from lib (extracted for maintainability)
// Note: Only types with matching structures are imported.
// TeamNormalizedOutput (runtime-specific in member-execution.ts) vs TeamNormalizedOutputAPI (API-specific in lib/team-types.ts)
// TeamParallelCapacityCandidate, TeamParallelCapacityResolution have different implementations similarly.
import {
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
  type TeamFrontmatter,
  type TeamMemberFrontmatter,
  type ParsedTeamMarkdown,
  type LiveStreamView,
} from "../../lib/team-types.js";

// Local alias for backward compatibility (TeamLiveViewMode = LiveViewMode with "discussion")
type LiveViewMode = TeamLiveViewMode;

// Import PrintCommandResult from subagent-types (shared type)
import { type PrintCommandResult } from "../../lib/agent/subagent-types.js";

// Re-export judge types for external use
export type { TeamUncertaintyProxy } from "./judge";

// Re-export definition-loader functions for external use (backward compatibility)
export {
  parseTeamMarkdownFile,
  loadTeamDefinitionsFromDir,
  loadTeamDefinitionsFromMarkdown,
  createDefaultTeams,
  mergeDefaultTeam,
  ensureDefaults,
  validateTeamFrontmatter,
  validateTeamDefinition,
  type TeamValidationError,
} from "./definition-loader";

// Re-export member-execution functions for external use (backward compatibility)
export {
  type TeamNormalizedOutput,
  normalizeTeamMemberOutput,
  mergeSkillArrays,
  resolveEffectiveTeamMemberSkills,
  formatTeamMemberSkillsSection,
  loadSkillContent,
  buildSkillsSectionWithContent,
  buildTeamMemberPrompt,
  runMember,
} from "./member-execution";

// Re-export result-aggregation functions for external use (backward compatibility)
export {
  isRetryableTeamMemberError,
  resolveTeamFailureOutcome,
  resolveTeamMemberAggregateOutcome,
  resolveTeamParallelRunOutcome,
  buildTeamResultText,
} from "./result-aggregation";

// Re-export formatters for backward compatibility
export { formatTeamList, formatRecentRuns, debugCostEstimation } from "./team-formatters.js";
// Import formatters for internal use
import { formatTeamList, formatRecentRuns, debugCostEstimation } from "./team-formatters.js";

// Re-export helpers for backward compatibility
export { pickTeam, pickDefaultParallelTeams } from "./team-helpers.js";
// Import helpers for internal use
import { pickTeam, pickDefaultParallelTeams } from "./team-helpers.js";

// Re-export team-orchestrator functions for backward compatibility
export {
  runTeamTask,
  shouldRetryFailedMemberResult,
  type TeamTaskInput,
  type TeamTaskResult,
} from "./team-orchestrator.js";

// Re-export types for external use
export type {
  TeamEnabledState,
  TeamStrategy,
  TeamMember,
  TeamDefinition,
  TeamMemberResult,
  TeamJudgeVerdict,
  TeamFinalJudge,
  TeamCommunicationAuditEntry,
  TeamRunRecord,
  TeamStorage,
  TeamPaths,
};

// Re-export team types for external use (from lib/team-types.ts)
export type {
  TeamLivePhase,
  TeamLiveViewMode,
  TeamLiveItem,
  AgentTeamLiveMonitorController,
  TeamFrontmatter,
  TeamMemberFrontmatter,
  ParsedTeamMarkdown,
};

const LIVE_PREVIEW_LINE_LIMIT = 120;
const LIVE_LIST_WINDOW_SIZE = 22;
// イベント配列サイズ（環境変数で上書き可能、デフォルトは120に削減）
const LIVE_EVENT_TAIL_LIMIT = (() => {
  const envVal = process.env.PI_LIVE_EVENT_TAIL_LIMIT;
  if (envVal !== undefined) {
    const parsed = Number(envVal);
    if (!Number.isFinite(parsed) || parsed < 60) {
      console.warn(
        `[agent-teams/extension] Invalid PI_LIVE_EVENT_TAIL_LIMIT="${envVal}", using default 120`
      );
      return 120;
    }
    return Math.max(60, parsed);
  }
  return 120;
})();
const LIVE_EVENT_INLINE_LINE_LIMIT = 8;
const LIVE_EVENT_DETAIL_LINE_LIMIT = 28;
// Communication constants moved to ./agent-teams/communication.ts

// Use unified stable runtime constants from lib/agent-common.ts
import {
  STABLE_RUNTIME_PROFILE,
  ADAPTIVE_PARALLEL_MAX_PENALTY as SHARED_ADAPTIVE_PARALLEL_MAX_PENALTY,
  ADAPTIVE_PARALLEL_DECAY_MS as SHARED_ADAPTIVE_PARALLEL_DECAY_MS,
  STABLE_MAX_RETRIES,
  STABLE_INITIAL_DELAY_MS,
  STABLE_MAX_DELAY_MS,
  STABLE_MAX_RATE_LIMIT_RETRIES,
  STABLE_MAX_RATE_LIMIT_WAIT_MS,
  TEAM_MEMBER_CONFIG,
  buildFailureSummary as sharedBuildFailureSummary,
} from "../../lib/agent/agent-common.js";
import {
  isRetryableTeamMemberError as sharedIsRetryableTeamMemberError,
  resolveTeamFailureOutcome as sharedResolveTeamFailureOutcome,
  resolveTeamMemberAggregateOutcome as sharedResolveTeamMemberAggregateOutcome,
  trimErrorMessage as sharedTrimErrorMessage,
  buildDiagnosticContext as sharedBuildDiagnosticContext,
} from "../../lib/agent/agent-errors.js";
import { calculateTeamWeight } from "../../lib/dag-weight-calculator.js";
import { runWithConcurrencyLimit } from "../../lib/concurrency";
import {
  getTeamMemberExecutionRules,
} from "../../lib/execution-rules";
import {
	isPlanModeActive,
	PLAN_MODE_WARNING,
} from "../../lib/plan-mode-shared";
import {
  getRateLimitGateSnapshot,
  isNetworkErrorRetryable,
  retryWithBackoff,
  type RetryWithBackoffOverrides,
} from "../../lib/retry-with-backoff.js";

import {
  acquireRuntimeDispatchPermit,
  formatRuntimeStatusLine,
  getRuntimeSnapshot,
  getSharedRuntimeState,
  notifyRuntimeCapacityChanged,
  resetRuntimeTransientState,
} from "../agent-runtime";
import { checkUlWorkflowOwnership } from "../subagents.js";
import {
  runPiPrintMode as sharedRunPiPrintMode,
  type PrintExecutorOptions,
} from "../shared/pi-print-executor";
import {
  buildRuntimeLimitError,
  startReservationHeartbeat,
  refreshRuntimeStatus as sharedRefreshRuntimeStatus,
} from "../shared/runtime-helpers";
import {
  getCommunicationConfigV2,
  createCommunicationLinksMapV2,
  resolveUniqueCommIds,
  createCommIdMaps,
  type CommIdEntry,
} from "./communication";

// Local aliases for backward compatibility
const STABLE_AGENT_TEAM_RUNTIME = STABLE_RUNTIME_PROFILE;
const ADAPTIVE_PARALLEL_MAX_PENALTY = SHARED_ADAPTIVE_PARALLEL_MAX_PENALTY;
const ADAPTIVE_PARALLEL_DECAY_MS = SHARED_ADAPTIVE_PARALLEL_DECAY_MS;
const STABLE_AGENT_TEAM_MAX_RETRIES = STABLE_MAX_RETRIES;
const STABLE_AGENT_TEAM_INITIAL_DELAY_MS = STABLE_INITIAL_DELAY_MS;
const STABLE_AGENT_TEAM_MAX_DELAY_MS = STABLE_MAX_DELAY_MS;
const STABLE_AGENT_TEAM_MAX_RATE_LIMIT_RETRIES = STABLE_MAX_RATE_LIMIT_RETRIES;
const STABLE_AGENT_TEAM_MAX_RATE_LIMIT_WAIT_MS = STABLE_MAX_RATE_LIMIT_WAIT_MS;

const runtimeState = getSharedRuntimeState().teams;
const adaptivePenalty = createAdaptivePenaltyController({
  isStable: STABLE_AGENT_TEAM_RUNTIME,
  maxPenalty: ADAPTIVE_PARALLEL_MAX_PENALTY,
  decayMs: ADAPTIVE_PARALLEL_DECAY_MS,
});

// Note: Live monitoring functions are imported from ./agent-teams/live-monitor.ts
// Re-export for backward compatibility
export { renderAgentTeamLiveView, createAgentTeamLiveMonitor } from "./live-monitor";

// Communication functions moved to ./agent-teams/communication.ts

// Note: shouldRetryFailedMemberResult is now imported from ./team-orchestrator.ts

// Note: toRetryOverrides is kept locally because it checks STABLE_AGENT_TEAM_RUNTIME
// which is specific to this module. The lib version does not have this check.
function toRetryOverrides(value: unknown): RetryWithBackoffOverrides | undefined {
  // Stable profile: ignore per-call retry tuning to avoid unpredictable fan-out.
  if (STABLE_AGENT_TEAM_RUNTIME) return undefined;
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const jitter =
    raw.jitter === "full" || raw.jitter === "partial" || raw.jitter === "none"
      ? raw.jitter
      : undefined;
  return {
    maxRetries: typeof raw.maxRetries === "number" ? raw.maxRetries : undefined,
    initialDelayMs: typeof raw.initialDelayMs === "number" ? raw.initialDelayMs : undefined,
    maxDelayMs: typeof raw.maxDelayMs === "number" ? raw.maxDelayMs : undefined,
    multiplier: typeof raw.multiplier === "number" ? raw.multiplier : undefined,
    jitter,
  };
}

/**
 * 集約戦略の正規化結果
 * @summary 集約戦略設定
 */
interface AggregationConfig {
  strategy: AggregationStrategy;
}

/**
 * aggregationStrategyパラメータを正規化する
 * デフォルトは'rule-based'（後方互換性維持）
 *
 * @param param - ユーザー指定のaggregationStrategyパラメータ
 * @returns 正規化されたAggregationConfig
 */
function normalizeAggregationConfig(param: unknown): AggregationConfig {
  const validStrategies: AggregationStrategy[] = ['rule-based', 'majority-vote', 'best-confidence', 'llm-aggregate'];

  if (typeof param === 'string' && validStrategies.includes(param as AggregationStrategy)) {
    return { strategy: param as AggregationStrategy };
  }

  // デフォルトは'rule-based'（現在の動作）
  return { strategy: 'rule-based' };
}

// Note: mergeDefaultTeam is now imported from ./agent-teams/definition-loader

/**
 * Refresh runtime status display in the UI with agent-team-specific parameters.
 * @see ./shared/runtime-helpers.ts:refreshRuntimeStatus for the underlying implementation.
 */
function refreshRuntimeStatus(ctx: any): void {
  const snapshot = getRuntimeSnapshot();
  sharedRefreshRuntimeStatus(
    ctx,
    "agent-team-runtime",
    "Team",
    snapshot.teamActiveAgents,
    "Sub",
    snapshot.subagentActiveAgents,
  );
}

/**
 * Run pi-print mode for team member execution.
 */
async function runPiPrintMode(input: {
  provider?: string;
  model?: string;
  prompt: string;
  timeoutMs: number;
  signal?: AbortSignal;
  onTextDelta?: (delta: string) => void;
  onStderrChunk?: (chunk: string) => void;
}): Promise<PrintCommandResult> {
  return sharedRunPiPrintMode({
    ...input,
    entityLabel: "agent team member",
  });
}

// Note: runMember is now imported from ./agent-teams/member-execution

/**
 * エージェントチーム拡張登録
 * @summary 拡張登録
 * @param pi 拡張APIインターフェース
 * @returns void
 */
export default function registerAgentTeamsExtension(pi: ExtensionAPI) {
  function reportTeamExecutionFailure(scope: "agent_team_run" | "agent_team_run_parallel", teamId: string, errorMessage: string, ctx: any): void {
    const message = `${scope} failed [${teamId}]: ${errorMessage}`;
    ctx.ui.notify(message, "error");
    pi.sendMessage({
      customType: "agent-team-run-failed",
      content: message,
      display: true,
    });
  }

  // チーム一覧
  pi.registerTool({
    name: "agent_team_list",
    label: "Agent Team List",
    description: "設定済みのエージェントチームとメンバー一覧を表示する。",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const nowIso = new Date().toISOString();
      let storage = loadStorage(ctx.cwd);
      storage = ensureDefaults(storage, nowIso, ctx.cwd);
      saveStorage(ctx.cwd, storage);

      return {
        content: [{ type: "text" as const, text: formatTeamList(storage) }],
        details: {
          currentTeamId: storage.currentTeamId,
          teams: storage.teams,
        },
      };
    },
  });

  // チーム作成
  pi.registerTool({
    name: "agent_team_create",
    label: "Agent Team Create",
    description: "独立したメンバーロールを持つカスタムエージェントチームを作成する。",
    parameters: Type.Object({
      id: Type.Optional(Type.String({ description: "Team id (lowercase-hyphen). Optional." })),
      name: Type.String({ description: "Team display name" }),
      description: Type.String({ description: "What this team is best for" }),
      members: Type.Array(
        Type.Object({
          id: Type.String({ description: "Teammate id" }),
          role: Type.String({ description: "Teammate role name" }),
          description: Type.String({ description: "Teammate mission" }),
          provider: Type.Optional(Type.String({ description: "Optional provider override" })),
          model: Type.Optional(Type.String({ description: "Optional model override" })),
          enabled: Type.Optional(Type.Boolean({ description: "Enabled state (default true)" })),
        }),
        { minItems: 1 },
      ),
      setCurrent: Type.Optional(Type.Boolean({ description: "Set new team as current default" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const storage = loadStorage(ctx.cwd);
      const nowIso = new Date().toISOString();

      const resolvedId = toId(params.id || params.name);
      if (!resolvedId) {
        return {
          content: [{ type: "text" as const, text: "agent_team_create error: id could not be generated." }],
          details: { error: "invalid_id" },
        };
      }

      if (storage.teams.some((team) => team.id === resolvedId)) {
        return {
          content: [{ type: "text" as const, text: `agent_team_create error: id already exists (${resolvedId}).` }],
          details: { error: "duplicate_id", id: resolvedId },
        };
      }

      const members: TeamMember[] = params.members.map((member) => ({
        id: toId(member.id) || `member-${randomBytes(2).toString("hex")}`,
        role: member.role,
        description: member.description,
        provider: member.provider,
        model: member.model,
        enabled: member.enabled === undefined ? true : Boolean(member.enabled),
      }));

      const team: TeamDefinition = {
        id: resolvedId,
        name: params.name,
        description: params.description,
        enabled: "enabled",
        members,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      // バリデーションを実行
      const validationErrors = validateTeamDefinition(team);
      if (validationErrors.length > 0) {
        const errorMessages = validationErrors.map((e: TeamValidationError) => `${e.field}: ${e.message}`);
        return {
          content: [
            {
              type: "text" as const,
              text: `agent_team_create error: validation failed\n${errorMessages.join("\n")}`,
            },
          ],
          details: {
            error: "validation_failed",
            violations: validationErrors,
          },
        };
      }

      storage.teams.push(team);
      if (params.setCurrent) {
        storage.currentTeamId = team.id;
      }

      saveStorage(ctx.cwd, storage);

      return {
        content: [{ type: "text" as const, text: `Created agent team: ${team.id} (${team.name})` }],
        details: {
          team,
          currentTeamId: storage.currentTeamId,
        },
      };
    },
  });

  // チーム設定更新
  pi.registerTool({
    name: "agent_team_configure",
    label: "Agent Team Configure",
    description: "チームの有効化/無効化、デフォルトチームの設定を行う。",
    parameters: Type.Object({
      teamId: Type.String({ description: "Target team id" }),
      enabled: Type.Optional(Type.Boolean({ description: "Enable or disable this team" })),
      setCurrent: Type.Optional(Type.Boolean({ description: "Set this team as current default" })),
      memberId: Type.Optional(Type.String({ description: "Optional member id to update" })),
      memberEnabled: Type.Optional(Type.Boolean({ description: "Enabled state for a specific member" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const storage = loadStorage(ctx.cwd);
      const team = storage.teams.find((item) => item.id === params.teamId);

      if (!team) {
        return {
          content: [{ type: "text" as const, text: `agent_team_configure error: team not found (${params.teamId})` }],
          details: { error: "team_not_found", teamId: params.teamId },
        };
      }

      if (params.enabled !== undefined) {
        team.enabled = params.enabled ? "enabled" : "disabled";
      }

      if (params.memberId && params.memberEnabled !== undefined) {
        const member = team.members.find((item) => item.id === params.memberId);
        if (!member) {
          return {
            content: [
              {
                type: "text" as const,
                text: `agent_team_configure error: member not found (${params.memberId}) in team (${team.id})`,
              },
            ],
            details: { error: "member_not_found", teamId: team.id, memberId: params.memberId },
          };
        }
        member.enabled = Boolean(params.memberEnabled);
      }

      if (params.setCurrent) {
        storage.currentTeamId = team.id;
      }

      team.updatedAt = new Date().toISOString();
      saveStorage(ctx.cwd, storage);

      return {
        content: [{ type: "text" as const, text: `Updated team: ${team.id} (${team.enabled})` }],
        details: {
          team,
          currentTeamId: storage.currentTeamId,
        },
      };
    },
  });

  // チーム実行
  pi.registerTool({
    name: "agent_team_run",
    label: "Agent Team Run",
    description:
      "複数のメンバーエージェントでタスクを実行する。複数チームを並列実行できる場合はagent_team_run_parallelを使用。",
    parameters: Type.Object({
      task: Type.String({ description: "Task for the team" }),
      teamId: Type.Optional(Type.String({ description: "Target team id (default current team)" })),
      strategy: Type.Optional(Type.String({ description: "parallel (default) or sequential" })),
      sharedContext: Type.Optional(Type.String({ description: "Shared instructions for all teammates" })),
      successCriteria: Type.Optional(
        Type.Array(Type.String(), { description: "Success criteria for the task (e.g., ['Tests pass', 'Documentation updated'])" }),
      ),
      communicationRounds: Type.Optional(
        Type.Number({ description: "Additional communication rounds among teammates (stable profile: fixed 0)" }),
      ),
      failedMemberRetryRounds: Type.Optional(
        Type.Number({ description: "Retry rounds for failed members only (stable profile: fixed 0)" }),
      ),
      timeoutMs: Type.Optional(Type.Number({ description: "Timeout per teammate run in ms (default: 600000). Use 0 to disable timeout." })),
      retry: createRetrySchema(),
      ulTaskId: Type.Optional(Type.String({ description: "UL workflow task ID. If provided, checks ownership before execution." })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (String(process.env.PI_AGENT_TEAM_CHILD_RUN || "0") === "1") {
        return {
          content: [
            {
              type: "text" as const,
              text: "agent_team_run error: disabled in agent-team member child execution (recursion blocked).",
            },
          ],
          details: {
            error: "team_recursion_blocked",
            outcomeCode: "NONRETRYABLE_FAILURE" as RunOutcomeCode,
            retryRecommended: false,
          },
        };
      }

      // ULワークフロー所有権チェック
      if (params.ulTaskId) {
        const ownership = checkUlWorkflowOwnership(params.ulTaskId);
        if (!ownership.owned) {
          return {
            content: [{ type: "text" as const, text: `agent_team_run error: UL workflow ${params.ulTaskId} is owned by another instance (${ownership.ownerInstanceId}).` }],
            details: {
              error: "ul_workflow_not_owned",
              ulTaskId: params.ulTaskId,
              ownerInstanceId: ownership.ownerInstanceId,
              ownerPid: ownership.ownerPid,
              outcomeCode: "NONRETRYABLE_FAILURE" as RunOutcomeCode,
              retryRecommended: false,
            },
          };
        }
      }

      const storage = loadStorage(ctx.cwd);
      const team = pickTeam(storage, params.teamId);
      const retryOverrides = toRetryOverrides(params.retry);

      if (!team) {
        return {
          content: [{ type: "text" as const, text: "agent_team_run error: no available team." }],
          details: {
            error: "missing_team",
            outcomeCode: "NONRETRYABLE_FAILURE" as RunOutcomeCode,
            retryRecommended: false,
          },
        };
      }

      if (team.enabled !== "enabled") {
        return {
          content: [{ type: "text" as const, text: `agent_team_run error: team is disabled (${team.id}).` }],
          details: {
            error: "team_disabled",
            teamId: team.id,
            outcomeCode: "NONRETRYABLE_FAILURE" as RunOutcomeCode,
            retryRecommended: false,
          },
        };
      }

      const activeMembers = team.members.filter((member) => member.enabled);
      if (activeMembers.length === 0) {
        return {
          content: [{ type: "text" as const, text: `agent_team_run error: no enabled members in team (${team.id}).` }],
          details: {
            error: "no_active_members",
            teamId: team.id,
            outcomeCode: "NONRETRYABLE_FAILURE" as RunOutcomeCode,
            retryRecommended: false,
          },
        };
      }

      // Logger: start team operation tracking
      const teamOperationId = logger.startOperation("team_run" as OperationType, team.id, {
        task: params.task,
        params: {
          teamId: team.id,
          strategy: params.strategy,
          sharedContext: params.sharedContext,
          communicationRounds: params.communicationRounds,
          timeoutMs: params.timeoutMs,
        },
      });

      // repoaudit戦略を含む3-way分岐
      const strategy: TeamStrategy =
        String(params.strategy || "parallel").toLowerCase() === "sequential"
          ? "sequential"
          : String(params.strategy || "parallel").toLowerCase() === "repoaudit"
            ? "repoaudit"
            : "parallel";
      const communicationRounds = normalizeCommunicationRounds(
        params.communicationRounds,
        DEFAULT_COMMUNICATION_ROUNDS,
        STABLE_AGENT_TEAM_RUNTIME,
      );
      const failedMemberRetryRounds = normalizeFailedMemberRetryRounds(
        params.failedMemberRetryRounds,
        DEFAULT_FAILED_MEMBER_RETRY_ROUNDS,
        STABLE_AGENT_TEAM_RUNTIME,
      );

      // Use V2 links if feature flag is enabled
      const commConfig = getCommunicationConfigV2();
      let communicationLinks: Map<string, string[]>;
      let commIdEntries: CommIdEntry[] = [];
      
      if (commConfig.linksV2) {
        commIdEntries = resolveUniqueCommIds(activeMembers, team.id);
        communicationLinks = createCommunicationLinksMapV2(activeMembers, {
          round: 0,
          seed: team.id,
          strategy: "ring",
        });
      } else {
        communicationLinks = createCommunicationLinksMap(activeMembers);
      }

      const snapshot = getRuntimeSnapshot();
      const configuredMemberParallelLimit = toConcurrencyLimit(
        snapshot.limits.maxParallelTeammatesPerTeam,
        1,
      );
      const baselineMemberParallelism =
        strategy === "parallel"
          ? Math.max(
              1,
              Math.min(
                configuredMemberParallelLimit,
                activeMembers.length,
                Math.max(1, snapshot.limits.maxTotalActiveLlm),
              ),
            )
          : 1;
      const adaptivePenaltyBefore = adaptivePenalty.get();
      const effectiveMemberParallelism =
        strategy === "parallel"
          ? adaptivePenalty.applyLimit(baselineMemberParallelism)
          : 1;
      const dispatchPermit = await acquireRuntimeDispatchPermit({
        toolName: "agent_team_run",
        candidate: {
          additionalRequests: 1,
          additionalLlm: Math.min(effectiveMemberParallelism, snapshot.limits.maxParallelTeammatesPerTeam),
        },
        tenantKey: team.id,
        source: "scheduled",
        estimatedDurationMs: Math.round(60_000 * (1 + communicationRounds * 0.3)),
        estimatedRounds: Math.max(1, activeMembers.length + communicationRounds),
        maxWaitMs: snapshot.limits.capacityWaitMs,
        pollIntervalMs: snapshot.limits.capacityPollMs,
        signal,
      });
      if (!dispatchPermit.allowed || !dispatchPermit.lease) {
        adaptivePenalty.raise("capacity");
        const capacityOutcome: RunOutcomeSignal = dispatchPermit.aborted
          ? { outcomeCode: "CANCELLED", retryRecommended: false }
          : dispatchPermit.timedOut
            ? { outcomeCode: "TIMEOUT", retryRecommended: true }
            : { outcomeCode: "RETRYABLE_FAILURE", retryRecommended: true };
        return {
          content: [
            {
              type: "text" as const,
              text: buildRuntimeLimitError("agent_team_run", dispatchPermit.reasons, {
                waitedMs: dispatchPermit.waitedMs,
                timedOut: dispatchPermit.timedOut,
              }),
            },
          ],
          details: {
            error: dispatchPermit.aborted ? "runtime_dispatch_aborted" : "runtime_dispatch_blocked",
            reasons: dispatchPermit.reasons,
            projectedRequests: dispatchPermit.projectedRequests,
            projectedLlm: dispatchPermit.projectedLlm,
            waitedMs: dispatchPermit.waitedMs,
            timedOut: dispatchPermit.timedOut,
            aborted: dispatchPermit.aborted,
            capacityAttempts: dispatchPermit.attempts,
            configuredMemberParallelLimit,
            baselineMemberParallelism,
            requestedMemberParallelism: effectiveMemberParallelism,
            appliedMemberParallelism: effectiveMemberParallelism,
            parallelismReduced: false,
            adaptivePenaltyBefore,
            adaptivePenaltyAfter: adaptivePenalty.get(),
            requestedMemberCount: activeMembers.length,
            failedMemberRetryRounds,
            queuedAhead: dispatchPermit.queuedAhead,
            queuePosition: dispatchPermit.queuePosition,
            queueWaitedMs: dispatchPermit.waitedMs,
            traceId: dispatchPermit.orchestrationId,
            outcomeCode: capacityOutcome.outcomeCode,
            retryRecommended: capacityOutcome.retryRecommended,
          },
        };
      }
      const appliedMemberParallelism = effectiveMemberParallelism;
      const capacityReservation = dispatchPermit.lease;
      const stopReservationHeartbeat = startReservationHeartbeat(capacityReservation);

      const timeoutMs = resolveEffectiveTimeoutMs(params.timeoutMs, ctx.model?.id, DEFAULT_AGENT_TIMEOUT_MS);

      // Get cost estimate and adjust for team size and communication rounds
      const baseEstimate = getCostEstimator().estimate(
        "agent_team_run",
        ctx.model?.provider,
        ctx.model?.id,
        params.task
      );
      const teamSize = activeMembers.length;
      const adjustedTokens = Math.round(baseEstimate.estimatedTokens * teamSize);
      const adjustedDurationMs = Math.round(baseEstimate.estimatedDurationMs * (1 + communicationRounds * 0.3));

      debugCostEstimation("agent_team_run", {
        team: team.id,
        base_ms: baseEstimate.estimatedDurationMs,
        base_tokens: baseEstimate.estimatedTokens,
        adjusted_ms: adjustedDurationMs,
        adjusted_tokens: adjustedTokens,
        team_size: teamSize,
        rounds: communicationRounds,
        method: baseEstimate.method,
      });

      const liveMonitor = createAgentTeamLiveMonitor(ctx, {
        title: `Agent Team Run (detailed live view: ${team.id})`,
        items: activeMembers.map((member) => ({
          key: toTeamLiveItemKey(team.id, member.id),
          label: `${team.id}/${member.id} (${member.role})`,
          partners: (communicationLinks.get(member.id) ?? []).map((partnerId) => `${team.id}/${partnerId}`),
        })),
      });
      liveMonitor?.appendBroadcastEvent(
        `orchestration prepared: team=${team.id} strategy=${strategy} member_parallel=${appliedMemberParallelism} requested_member_parallel=${effectiveMemberParallelism} baseline=${baselineMemberParallelism} adaptive_penalty=${adaptivePenaltyBefore} communication_rounds=${communicationRounds} failed_member_retries=${failedMemberRetryRounds}`,
      );
      liveMonitor?.appendBroadcastEvent(
        `runtime capacity granted: projected_requests=${dispatchPermit.projectedRequests} projected_llm=${dispatchPermit.projectedLlm}`,
      );

      // 待機状態があった場合はUIに反映
      if (dispatchPermit.waitedMs > 0 || (dispatchPermit.queuePosition && dispatchPermit.queuePosition > 0)) {
        liveMonitor?.updateQueueStatus({
          isWaiting: false, // 既に許可されたので待機終了
          waitedMs: dispatchPermit.waitedMs,
          queuePosition: dispatchPermit.queuePosition,
          queuedAhead: dispatchPermit.queuedAhead,
        });
      }

      runtimeState.activeTeamRuns += 1;
      notifyRuntimeCapacityChanged();
      refreshRuntimeStatus(ctx);
      // 予約は admission 制御のみ。開始後は active カウンタで実行中負荷を表現する。
      capacityReservation.consume();

      const onMemberStart = (member: TeamMember) => {
        const key = toTeamLiveItemKey(team.id, member.id);
        liveMonitor?.markStarted(key);
        liveMonitor?.appendEvent(key, "member process spawned");
        runtimeState.activeTeammates += 1;
        notifyRuntimeCapacityChanged();
        refreshRuntimeStatus(ctx);
      };

      const onMemberEnd = (member: TeamMember) => {
        liveMonitor?.appendEvent(toTeamLiveItemKey(team.id, member.id), "member process exited");
        runtimeState.activeTeammates = Math.max(0, runtimeState.activeTeammates - 1);
        notifyRuntimeCapacityChanged();
        refreshRuntimeStatus(ctx);
      };

        try {
          const { runRecord, memberResults, communicationAudit, uncertaintyProxy, uncertaintyProxyExplanation } = await runTeamTask({
            team,
            task: params.task,
            strategy,
            memberParallelLimit: appliedMemberParallelism,
            communicationRounds,
            failedMemberRetryRounds,
            communicationLinks,
            sharedContext: params.sharedContext,
            successCriteria: params.successCriteria,
            timeoutMs,
            cwd: ctx.cwd,
            retryOverrides,
            fallbackProvider: ctx.model?.provider,
            fallbackModel: ctx.model?.id,
            signal,
            onMemberStart,
            onMemberEnd,
            onMemberTextDelta: (member, delta) => {
              liveMonitor?.appendChunk(toTeamLiveItemKey(team.id, member.id), "stdout", delta);
            },
            onMemberStderrChunk: (member, chunk) => {
              liveMonitor?.appendChunk(toTeamLiveItemKey(team.id, member.id), "stderr", chunk);
            },
            onMemberPhase: (member, phase, round) => {
              liveMonitor?.markPhase(toTeamLiveItemKey(team.id, member.id), phase, round);
            },
            onMemberEvent: (member, event) => {
              liveMonitor?.appendEvent(toTeamLiveItemKey(team.id, member.id), event);
            },
            onTeamEvent: (event) => {
              liveMonitor?.appendBroadcastEvent(event);
            },
            onMemberResult: (member, result) => {
              const diagnostics = result.diagnostics
                ? ` confidence=${result.diagnostics.confidence.toFixed(2)} evidence=${result.diagnostics.evidenceCount}`
                : "";
              liveMonitor?.appendEvent(
                toTeamLiveItemKey(team.id, member.id),
                `result received: status=${result.status}${diagnostics}`,
              );
              // Extract and append DISCUSSION section
              const discussion = extractDiscussionSection(result.output);
              if (discussion.trim()) {
                liveMonitor?.appendDiscussion(
                  toTeamLiveItemKey(team.id, member.id),
                  discussion,
                );
              }
              liveMonitor?.markFinished(
                toTeamLiveItemKey(team.id, member.id),
                result.status,
                result.summary,
                result.error,
              );
            },
          });

          storage.runs.push(runRecord);
          // Use saveStorageWithPatterns for automatic pattern extraction
          await saveStorageWithPatterns(ctx.cwd, storage);

          pi.appendEntry("agent-team-run", runRecord);
          const pressureFailures = memberResults.filter((result) => {
            if (result.status !== "failed") return false;
            return classifyPressureError(result.error || "") !== "other";
          }).length;
          if (pressureFailures > 0) {
            adaptivePenalty.raise("rate_limit");
          } else {
            adaptivePenalty.lower();
          }
          const teamOutcome = resolveTeamMemberAggregateOutcome(memberResults);
          const adaptivePenaltyAfter = adaptivePenalty.get();

          const aggregatedOutput = buildTeamResultText({
            run: runRecord,
            team,
            memberResults,
            communicationAudit,
          });

          logger.endOperation({
            status: teamOutcome.outcomeCode === "SUCCESS" ? "success" : "partial",
            tokensUsed: 0,
            outputLength: aggregatedOutput.length,
            outputFile: runRecord.outputFile,
            childOperations: memberResults.length,
            toolCalls: 0,
          });
          return {
            content: [
              {
                type: "text" as const,
                text: aggregatedOutput,
              },
            ],
            details: {
              run: runRecord,
              team: {
                id: team.id,
                name: team.name,
              },
              configuredMemberParallelLimit,
              baselineMemberParallelism,
              requestedMemberParallelism: effectiveMemberParallelism,
              appliedMemberParallelism,
              parallelismReduced: false,
              capacityWaitedMs: dispatchPermit.waitedMs,
              adaptivePenaltyBefore,
              adaptivePenaltyAfter,
              pressureFailureCount: pressureFailures,
              queuedAhead: dispatchPermit.queuedAhead,
              queuePosition: dispatchPermit.queuePosition,
              queueWaitedMs: dispatchPermit.waitedMs,
              traceId: dispatchPermit.orchestrationId,
              teamTaskId: buildTraceTaskId(dispatchPermit.orchestrationId, team.id, 0),
              communicationRounds,
              failedMemberRetryRounds,
              communicationLinks: Object.fromEntries(
                activeMembers.map((member) => [member.id, communicationLinks.get(member.id) ?? []]),
              ),
              memberResults,
              memberTaskIds: memberResults.map((result, index) => ({
                taskId: buildTraceTaskId(dispatchPermit.orchestrationId, result.memberId, index),
                delegateId: result.memberId,
                status: result.status,
              })),
              communicationAudit,
              uncertaintyProxy,
              uncertaintyProxyExplanation,
              failedMemberIds: teamOutcome.failedMemberIds,
              outcomeCode: teamOutcome.outcomeCode,
              retryRecommended: teamOutcome.retryRecommended,
            },
          };
        } catch (error) {
          const errorMessage = toErrorMessage(error);
          reportTeamExecutionFailure("agent_team_run", team.id, errorMessage, ctx);
          const pressure = classifyPressureError(errorMessage);
          if (pressure !== "other" && pressure !== "cancelled") {
            adaptivePenalty.raise(pressure);
          }
          const adaptivePenaltyAfter = adaptivePenalty.get();
          liveMonitor?.appendBroadcastEvent(`team run failed: ${normalizeForSingleLine(errorMessage, 200)}`);
          for (const member of activeMembers) {
            liveMonitor?.markFinished(
              toTeamLiveItemKey(team.id, member.id),
              "failed",
              "(failed)",
              errorMessage,
            );
          }
          const fallbackJudge = buildFallbackJudge({
            memberResults: [],
            error: errorMessage,
          });
          const failureOutcome = resolveTeamFailureOutcome(errorMessage);
          logger.endOperation({
            status: "failure",
            tokensUsed: 0,
            outputLength: 0,
            childOperations: 0,
            toolCalls: 0,
            error: {
              type: "team_error",
              message: errorMessage,
              stack: "",
            },
          });
          return {
            content: [
              {
                type: "text" as const,
                text: [
                  `agent_team_run failed: ${errorMessage}`,
                  `Final judge: ${fallbackJudge.verdict} (${Math.round(fallbackJudge.confidence * 100)}%)`,
                  `Uncertainty: intra=${fallbackJudge.uIntra.toFixed(2)}, inter=${fallbackJudge.uInter.toFixed(2)}, sys=${fallbackJudge.uSys.toFixed(2)}`,
                  `Collapse signals: ${fallbackJudge.collapseSignals.join(", ") || "none"}`,
                  `Reason: ${fallbackJudge.reason}`,
                  `Next step: ${fallbackJudge.nextStep}`,
                ].join("\n"),
              },
            ],
            details: {
              error: errorMessage,
              teamId: team.id,
              configuredMemberParallelLimit,
              baselineMemberParallelism,
              requestedMemberParallelism: effectiveMemberParallelism,
              appliedMemberParallelism,
              parallelismReduced: false,
              capacityWaitedMs: dispatchPermit.waitedMs,
              adaptivePenaltyBefore,
              adaptivePenaltyAfter,
              failedMemberRetryRounds,
              queuedAhead: dispatchPermit.queuedAhead,
              queuePosition: dispatchPermit.queuePosition,
              queueWaitedMs: dispatchPermit.waitedMs,
              traceId: dispatchPermit.orchestrationId,
              teamTaskId: buildTraceTaskId(dispatchPermit.orchestrationId, team.id, 0),
              finalJudge: {
                verdict: fallbackJudge.verdict,
                confidence: fallbackJudge.confidence,
                reason: fallbackJudge.reason,
                nextStep: fallbackJudge.nextStep,
                uIntra: fallbackJudge.uIntra,
                uInter: fallbackJudge.uInter,
                uSys: fallbackJudge.uSys,
                collapseSignals: fallbackJudge.collapseSignals,
              },
              outcomeCode: failureOutcome.outcomeCode,
              retryRecommended: failureOutcome.retryRecommended,
            },
          };
        } finally {
          runtimeState.activeTeamRuns = Math.max(0, runtimeState.activeTeamRuns - 1);
          notifyRuntimeCapacityChanged();
          refreshRuntimeStatus(ctx);
          stopReservationHeartbeat();
          capacityReservation.release();

          // liveMonitorのクローズを安全に実行
          try {
            await liveMonitor?.close?.();
          } catch (monitorError) {
            const monitorErrorMsg = monitorError instanceof Error ? monitorError.message : String(monitorError);
            console.warn(`[agent-teams] liveMonitor.close failed: ${monitorErrorMsg}`);
          }

          try {
            await liveMonitor?.wait();
          } catch (monitorError) {
            const monitorErrorMsg = monitorError instanceof Error ? monitorError.message : String(monitorError);
            console.warn(`[agent-teams] liveMonitor.wait failed: ${monitorErrorMsg}`);
          }
        }
      refreshRuntimeStatus(ctx);
    },
  });

  // 複数チーム並列実行
  pi.registerTool({
    name: "agent_team_run_parallel",
    label: "Agent Team Run Parallel",
    description:
      "選択したチームを並列実行する。teamIdsを省略した場合、現在の有効なチームのみを実行（保守的デフォルト）。",
    parameters: Type.Object({
      task: Type.String({ description: "Task delegated to all selected teams" }),
      teamIds: Type.Optional(Type.Array(Type.String({ description: "Team id list" }))),
      strategy: Type.Optional(Type.String({ description: "Member strategy per team: parallel (default) or sequential" })),
      sharedContext: Type.Optional(Type.String({ description: "Shared instructions for all teammates" })),
      successCriteria: Type.Optional(
        Type.Array(Type.String(), { description: "Success criteria for the task (e.g., ['Tests pass', 'Documentation updated'])" }),
      ),
      communicationRounds: Type.Optional(
        Type.Number({ description: "Additional communication rounds among teammates (stable profile: fixed 0)" }),
      ),
      failedMemberRetryRounds: Type.Optional(
        Type.Number({ description: "Retry rounds for failed members only in each team (stable profile: fixed 0)" }),
      ),
      timeoutMs: Type.Optional(Type.Number({ description: "Timeout per teammate run in ms (default: 600000). Use 0 to disable timeout." })),
      retry: createRetrySchema(),
      aggregationStrategy: Type.Optional(Type.Union([
        Type.Literal('rule-based', { description: "Current deterministic behavior (default)" }),
        Type.Literal('majority-vote', { description: "Most common verdict wins" }),
        Type.Literal('best-confidence', { description: "Highest confidence result wins" }),
        Type.Literal('llm-aggregate', { description: "LLM synthesizes final result" }),
      ], { description: "Aggregation strategy for parallel team results" })),
      ulTaskId: Type.Optional(Type.String({ description: "UL workflow task ID. If provided, checks ownership before execution." })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (String(process.env.PI_AGENT_TEAM_CHILD_RUN || "0") === "1") {
        return {
          content: [
            {
              type: "text" as const,
              text: "agent_team_run_parallel error: disabled in agent-team member child execution (recursion blocked).",
            },
          ],
          details: {
            error: "team_recursion_blocked",
            outcomeCode: "NONRETRYABLE_FAILURE" as RunOutcomeCode,
            retryRecommended: false,
          },
        };
      }

      // ULワークフロー所有権チェック
      if (params.ulTaskId) {
        const ownership = checkUlWorkflowOwnership(params.ulTaskId);
        if (!ownership.owned) {
          return {
            content: [{ type: "text" as const, text: `agent_team_run_parallel error: UL workflow ${params.ulTaskId} is owned by another instance (${ownership.ownerInstanceId}).` }],
            details: {
              error: "ul_workflow_not_owned",
              ulTaskId: params.ulTaskId,
              ownerInstanceId: ownership.ownerInstanceId,
              ownerPid: ownership.ownerPid,
              outcomeCode: "NONRETRYABLE_FAILURE" as RunOutcomeCode,
              retryRecommended: false,
            },
          };
        }
      }

      const storage = loadStorage(ctx.cwd);
      const retryOverrides = toRetryOverrides(params.retry);

      const requestedIds = Array.isArray(params.teamIds)
        ? Array.from(new Set(params.teamIds.map((id) => String(id).trim()).filter(Boolean)))
        : [];

      const selectedTeams =
        requestedIds.length > 0
          ? requestedIds
              .map((id) => storage.teams.find((team) => team.id === id))
              .filter((team): team is TeamDefinition => Boolean(team))
          : pickDefaultParallelTeams(storage);

      const missingIds =
        requestedIds.length > 0
          ? requestedIds.filter((id) => !storage.teams.some((team) => team.id === id))
          : [];

      if (missingIds.length > 0) {
        return {
          content: [{ type: "text" as const, text: `agent_team_run_parallel error: unknown ids: ${missingIds.join(", ")}` }],
          details: {
            error: "unknown_ids",
            missingIds,
            outcomeCode: "NONRETRYABLE_FAILURE" as RunOutcomeCode,
            retryRecommended: false,
          },
        };
      }

      const enabledTeams = selectedTeams.filter((team) => team.enabled === "enabled");
      if (enabledTeams.length === 0) {
        return {
          content: [{ type: "text" as const, text: "agent_team_run_parallel error: no enabled teams selected." }],
          details: {
            error: "no_enabled_teams",
            outcomeCode: "NONRETRYABLE_FAILURE" as RunOutcomeCode,
            retryRecommended: false,
          },
        };
      }

      // Logger: start parallel team operation tracking
      const parallelTeamOperationId = logger.startOperation("team_run" as OperationType, enabledTeams.map(t => t.id).join(","), {
        task: params.task,
        params: {
          teamIds: enabledTeams.map(t => t.id),
          strategy: params.strategy,
          sharedContext: params.sharedContext,
          communicationRounds: params.communicationRounds,
          timeoutMs: params.timeoutMs,
        },
      });

      // repoaudit戦略を含む3-way分岐
      const strategy: TeamStrategy =
        String(params.strategy || "parallel").toLowerCase() === "sequential"
          ? "sequential"
          : String(params.strategy || "parallel").toLowerCase() === "repoaudit"
            ? "repoaudit"
            : "parallel";
      const communicationRounds = normalizeCommunicationRounds(
        params.communicationRounds,
        DEFAULT_COMMUNICATION_ROUNDS,
        STABLE_AGENT_TEAM_RUNTIME,
      );
      const failedMemberRetryRounds = normalizeFailedMemberRetryRounds(
        params.failedMemberRetryRounds,
        DEFAULT_FAILED_MEMBER_RETRY_ROUNDS,
        STABLE_AGENT_TEAM_RUNTIME,
      );
      const timeoutMs = resolveEffectiveTimeoutMs(params.timeoutMs, ctx.model?.id, DEFAULT_AGENT_TIMEOUT_MS);
      const aggregationConfig = normalizeAggregationConfig(params.aggregationStrategy);
      const snapshot = getRuntimeSnapshot();
      const configuredTeamParallelLimit = toConcurrencyLimit(snapshot.limits.maxParallelTeamsPerRun, 1);
      const baselineTeamParallelism = Math.max(
        1,
        Math.min(
          configuredTeamParallelLimit,
          enabledTeams.length,
          Math.max(1, snapshot.limits.maxTotalActiveRequests),
        ),
      );
      const adaptivePenaltyBefore = adaptivePenalty.get();
      const effectiveTeamParallelism = adaptivePenalty.applyLimit(baselineTeamParallelism);
      const configuredMemberParallelLimit = toConcurrencyLimit(
        snapshot.limits.maxParallelTeammatesPerTeam,
        1,
      );
      const maxEnabledMembersPerTeam = enabledTeams.reduce((maxCount, team) => {
        const enabledMemberCount = team.members.filter((member) => member.enabled).length;
        return Math.max(maxCount, enabledMemberCount);
      }, 0);
      const desiredLlmBudgetPerTeam = Math.max(
        1,
        Math.floor(Math.max(1, snapshot.limits.maxTotalActiveLlm) / effectiveTeamParallelism),
      );
      const baselineMemberParallelism =
        strategy === "parallel"
          ? Math.max(
              1,
              Math.min(
                configuredMemberParallelLimit,
                maxEnabledMembersPerTeam,
                desiredLlmBudgetPerTeam,
              ),
            )
          : 1;
      const effectiveMemberParallelism =
        strategy === "parallel"
          ? adaptivePenalty.applyLimit(baselineMemberParallelism)
          : 1;
      const dispatchPermit = await acquireRuntimeDispatchPermit({
        toolName: "agent_team_run_parallel",
        candidate: {
          additionalRequests: Math.min(effectiveTeamParallelism, snapshot.limits.maxParallelTeamsPerRun),
          additionalLlm: Math.min(
            effectiveTeamParallelism * effectiveMemberParallelism,
            snapshot.limits.maxParallelTeamsPerRun * snapshot.limits.maxParallelTeammatesPerTeam,
          ),
        },
        tenantKey: enabledTeams.map((team) => team.id).sort().join("+"),
        source: "scheduled",
        estimatedDurationMs: Math.round(90_000 * (1 + communicationRounds * 0.3)),
        estimatedRounds: Math.max(1, enabledTeams.length * (1 + communicationRounds)),
        maxWaitMs: snapshot.limits.capacityWaitMs,
        pollIntervalMs: snapshot.limits.capacityPollMs,
        signal,
      });
      if (!dispatchPermit.allowed || !dispatchPermit.lease) {
        adaptivePenalty.raise("capacity");
        const capacityOutcome: RunOutcomeSignal = dispatchPermit.aborted
          ? { outcomeCode: "CANCELLED", retryRecommended: false }
          : dispatchPermit.timedOut
            ? { outcomeCode: "TIMEOUT", retryRecommended: true }
            : { outcomeCode: "RETRYABLE_FAILURE", retryRecommended: true };
        return {
          content: [
            {
              type: "text" as const,
              text: buildRuntimeLimitError("agent_team_run_parallel", dispatchPermit.reasons, {
                waitedMs: dispatchPermit.waitedMs,
                timedOut: dispatchPermit.timedOut,
              }),
            },
          ],
          details: {
            error: dispatchPermit.aborted ? "runtime_dispatch_aborted" : "runtime_dispatch_blocked",
            reasons: dispatchPermit.reasons,
            projectedRequests: dispatchPermit.projectedRequests,
            projectedLlm: dispatchPermit.projectedLlm,
            waitedMs: dispatchPermit.waitedMs,
            timedOut: dispatchPermit.timedOut,
            aborted: dispatchPermit.aborted,
            capacityAttempts: dispatchPermit.attempts,
            configuredTeamParallelLimit,
            configuredMemberParallelLimit,
            baselineTeamParallelism,
            baselineMemberParallelism,
            requestedTeamParallelism: effectiveTeamParallelism,
            requestedMemberParallelism: effectiveMemberParallelism,
            appliedTeamParallelism: effectiveTeamParallelism,
            appliedMemberParallelism: effectiveMemberParallelism,
            parallelismReduced: false,
            adaptivePenaltyBefore,
            adaptivePenaltyAfter: adaptivePenalty.get(),
            requestedTeamCount: enabledTeams.length,
            failedMemberRetryRounds,
            queuedAhead: dispatchPermit.queuedAhead,
            queuePosition: dispatchPermit.queuePosition,
            queueWaitedMs: dispatchPermit.waitedMs,
            traceId: dispatchPermit.orchestrationId,
            outcomeCode: capacityOutcome.outcomeCode,
            retryRecommended: capacityOutcome.retryRecommended,
          },
        };
      }
      const appliedTeamParallelism = effectiveTeamParallelism;
      const appliedMemberParallelism = effectiveMemberParallelism;
      const capacityReservation = dispatchPermit.lease;
      const stopReservationHeartbeat = startReservationHeartbeat(capacityReservation);
      const appliedLlmBudgetPerTeam = Math.max(
        1,
        Math.floor(Math.max(1, snapshot.limits.maxTotalActiveLlm) / appliedTeamParallelism),
      );

      try {
        const liveMonitor = createAgentTeamLiveMonitor(ctx, {
          title: `Agent Team Run Parallel (detailed live view: ${enabledTeams.length} teams)`,
          items: enabledTeams.flatMap((team) => {
            const enabledMembers = team.members.filter((member) => member.enabled);
            const communicationLinks = createCommunicationLinksMap(enabledMembers);
            return enabledMembers.map((member) => ({
              key: toTeamLiveItemKey(team.id, member.id),
              label: `${team.id}/${member.id} (${member.role})`,
              partners: (communicationLinks.get(member.id) ?? []).map(
                (partnerId) => `${team.id}/${partnerId}`,
              ),
            }));
          }),
        });
        liveMonitor?.appendBroadcastEvent(
          `parallel orchestration prepared: teams=${enabledTeams.length} team_parallel=${appliedTeamParallelism} requested_team_parallel=${effectiveTeamParallelism} (baseline=${baselineTeamParallelism}) teammate_parallel=${appliedMemberParallelism} requested_teammate_parallel=${effectiveMemberParallelism} (baseline=${baselineMemberParallelism}) adaptive_penalty=${adaptivePenaltyBefore} communication_rounds=${communicationRounds} failed_member_retries=${failedMemberRetryRounds}`,
        );
        liveMonitor?.appendBroadcastEvent(
          `runtime capacity granted: projected_requests=${dispatchPermit.projectedRequests} projected_llm=${dispatchPermit.projectedLlm}`,
        );

        const onRuntimeMemberStart = () => {
          runtimeState.activeTeammates += 1;
          notifyRuntimeCapacityChanged();
          refreshRuntimeStatus(ctx);
        };

        const onRuntimeMemberEnd = () => {
          runtimeState.activeTeammates = Math.max(0, runtimeState.activeTeammates - 1);
          notifyRuntimeCapacityChanged();
          refreshRuntimeStatus(ctx);
        };

        // Get cost estimate for parallel team execution
        const baseEstimate = getCostEstimator().estimate(
          "agent_team_run_parallel",
          ctx.model?.provider,
          ctx.model?.id,
          params.task
        );
        const totalMembers = enabledTeams.reduce(
          (sum, team) => sum + team.members.filter((m) => m.enabled).length,
          0
        );
        const adjustedTokens = Math.round(baseEstimate.estimatedTokens * totalMembers);
        const adjustedDurationMs = Math.round(baseEstimate.estimatedDurationMs * (1 + communicationRounds * 0.3));

        debugCostEstimation("agent_team_run_parallel", {
          base_ms: baseEstimate.estimatedDurationMs,
          base_tokens: baseEstimate.estimatedTokens,
          adjusted_ms: adjustedDurationMs,
          adjusted_tokens: adjustedTokens,
          teams: enabledTeams.length,
          total_members: totalMembers,
          rounds: communicationRounds,
          method: baseEstimate.method,
        });

        try {
        // 予約は admission 制御のみ。開始後は active カウンタで実行中負荷を表現する。
        capacityReservation.consume();

        // Team execution result type for early-stop support
        type TeamRunResult = {
          team: TeamDefinition;
          runRecord: TeamRunRecord;
          memberResults: TeamMemberResult[];
          communicationAudit: TeamCommunicationAuditEntry[];
          uncertaintyProxy?: TeamUncertaintyProxy;
          uncertaintyProxyExplanation?: JudgeExplanation;
        };

        // Define worker function for team execution
        const runTeamWorker = async (team: TeamDefinition): Promise<TeamRunResult> => {
          // Create child AbortController to prevent MaxListenersExceededWarning
          const { controller: childController, cleanup: cleanupAbort } = createChildAbortController(signal);
          try {
            const enabledMemberCount = team.members.filter((member) => member.enabled).length;
            const communicationLinks = createCommunicationLinksMap(
              team.members.filter((member) => member.enabled),
            );
            const teamMemberParallelLimit =
              strategy === "parallel"
                ? Math.max(
                    1,
                    Math.min(appliedMemberParallelism, enabledMemberCount, appliedLlmBudgetPerTeam),
                  )
                : 1;

            runtimeState.activeTeamRuns += 1;
            notifyRuntimeCapacityChanged();
            refreshRuntimeStatus(ctx);
            liveMonitor?.appendBroadcastEvent(
              `team ${team.id}: start strategy=${strategy} teammate_parallel=${teamMemberParallelLimit}`,
            );

            try {
              const { runRecord, memberResults, communicationAudit, uncertaintyProxy, uncertaintyProxyExplanation } = await runTeamTask({
                team,
                task: params.task,
                strategy,
                memberParallelLimit: teamMemberParallelLimit,
                communicationRounds,
                failedMemberRetryRounds,
                communicationLinks,
                sharedContext: params.sharedContext,
                successCriteria: params.successCriteria,
                timeoutMs,
                cwd: ctx.cwd,
                retryOverrides,
                fallbackProvider: ctx.model?.provider,
                fallbackModel: ctx.model?.id,
                signal: childController.signal,
              onMemberStart: (member) => {
                onRuntimeMemberStart();
                const key = toTeamLiveItemKey(team.id, member.id);
                liveMonitor?.markStarted(key);
                liveMonitor?.appendEvent(key, "member process spawned");
              },
              onMemberEnd: (member) => {
                liveMonitor?.appendEvent(toTeamLiveItemKey(team.id, member.id), "member process exited");
                onRuntimeMemberEnd();
              },
              onMemberTextDelta: (member, delta) => {
                liveMonitor?.appendChunk(toTeamLiveItemKey(team.id, member.id), "stdout", delta);
              },
              onMemberStderrChunk: (member, chunk) => {
                liveMonitor?.appendChunk(toTeamLiveItemKey(team.id, member.id), "stderr", chunk);
              },
              onMemberPhase: (member, phase, round) => {
                liveMonitor?.markPhase(toTeamLiveItemKey(team.id, member.id), phase, round);
              },
              onMemberEvent: (member, event) => {
                liveMonitor?.appendEvent(toTeamLiveItemKey(team.id, member.id), event);
              },
              onTeamEvent: (event) => {
                liveMonitor?.appendBroadcastEvent(`team ${team.id}: ${event}`);
              },
              onMemberResult: (member, result) => {
                const diagnostics = result.diagnostics
                  ? ` confidence=${result.diagnostics.confidence.toFixed(2)} evidence=${result.diagnostics.evidenceCount}`
                  : "";
                liveMonitor?.appendEvent(
                  toTeamLiveItemKey(team.id, member.id),
                  `result received: status=${result.status}${diagnostics}`,
                );
                // Extract and append DISCUSSION section
                const discussion = extractDiscussionSection(result.output);
                if (discussion.trim()) {
                  liveMonitor?.appendDiscussion(
                    toTeamLiveItemKey(team.id, member.id),
                    discussion,
                  );
                }
                liveMonitor?.markFinished(
                  toTeamLiveItemKey(team.id, member.id),
                  result.status,
                  result.summary,
                  result.error,
                );
              },
            });

            return {
              team,
              runRecord,
              memberResults,
              communicationAudit,
              uncertaintyProxy,
              uncertaintyProxyExplanation,
            };
          } catch (error) {
            const runId = createRunId();
            const startedAt = new Date().toISOString();
            const outputFile = join(ensurePaths(ctx.cwd).runsDir, `${runId}.json`);
            const message = toErrorMessage(error);
            reportTeamExecutionFailure("agent_team_run_parallel", team.id, message, ctx);
            liveMonitor?.appendBroadcastEvent(
              `team ${team.id}: run failed ${normalizeForSingleLine(message, 180)}`,
            );
            const communicationLinksRecord = Object.fromEntries(
              team.members
                .filter((entry) => entry.enabled)
                .map((entry) => [entry.id, communicationLinks.get(entry.id) ?? []]),
            );
            for (const member of team.members.filter((entry) => entry.enabled)) {
              liveMonitor?.markFinished(
                toTeamLiveItemKey(team.id, member.id),
                "failed",
                "(failed)",
                message,
              );
            }
            const finalJudge = buildFallbackJudge({
              memberResults: [],
              error: message,
            });
            const runRecord: TeamRunRecord = {
              runId,
              teamId: team.id,
              strategy,
              task: params.task,
              communicationRounds,
              communicationLinks: communicationLinksRecord,
              summary: `failed: ${message.slice(0, 120)}`,
              status: "failed",
              startedAt,
              finishedAt: new Date().toISOString(),
              memberCount: 0,
              outputFile,
              finalJudge: {
                verdict: finalJudge.verdict,
                confidence: finalJudge.confidence,
                reason: finalJudge.reason,
                nextStep: finalJudge.nextStep,
                uIntra: finalJudge.uIntra,
                uInter: finalJudge.uInter,
                uSys: finalJudge.uSys,
                collapseSignals: finalJudge.collapseSignals,
              },
            };

            writeFileSync(
              outputFile,
              JSON.stringify(
                {
                  run: runRecord,
                  team,
                  memberResults: [],
                  communicationAudit: [],
                  finalJudge,
                  task: params.task,
                  sharedContext: params.sharedContext,
                  error: message,
                },
                null,
                2,
              ),
              "utf-8",
            );

            return {
              team,
              runRecord,
              memberResults: [] as TeamMemberResult[],
              communicationAudit: [] as TeamCommunicationAuditEntry[],
            };
          } finally {
            runtimeState.activeTeamRuns = Math.max(0, runtimeState.activeTeamRuns - 1);
            notifyRuntimeCapacityChanged();
            refreshRuntimeStatus(ctx);
          }
          } finally {
            cleanupAbort();
          }
        };

        // DynTaskMAS: チームの重みを計算（メンバー構成ベース）
        const teamWeights = new Map<string, number>();
        for (const team of enabledTeams) {
          const weight = calculateTeamWeight(team);
          teamWeights.set(team.id, weight);
        }

        const results = await runWithConcurrencyLimit(enabledTeams, appliedTeamParallelism, runTeamWorker, {
          signal,
          usePriorityScheduling: true,
          itemWeights: teamWeights,
          getItemId: (team: TeamDefinition) => team.id,
        });

        for (const result of results) {
          storage.runs.push(result.runRecord);
          pi.appendEntry("agent-team-run", result.runRecord);
        }
        saveStorage(ctx.cwd, storage);

        const failed = results.filter((result) => result.runRecord.status === "failed");
        const totalTeammates = results.reduce((count, result) => count + result.runRecord.memberCount, 0);
        const pressureFailures = results.reduce((count, result) => {
          const memberPressure = result.memberResults.filter((memberResult) => {
            if (memberResult.status !== "failed") return false;
            return classifyPressureError(memberResult.error || "") !== "other";
          }).length;
          const teamPressure =
            result.runRecord.status === "failed" &&
            classifyPressureError(result.runRecord.summary || "") !== "other"
              ? 1
              : 0;
          return count + memberPressure + teamPressure;
        }, 0);
        if (pressureFailures > 0) {
          adaptivePenalty.raise("rate_limit");
        } else {
          adaptivePenalty.lower();
        }
        const parallelOutcome = resolveTeamParallelRunOutcome(results);
        const adaptivePenaltyAfter = adaptivePenalty.get();

        // Aggregate results using the specified strategy
        const aggregationInput = {
          teamResults: results.map(r => ({
            teamId: r.team.id,
            memberResults: r.memberResults,
            finalJudge: r.runRecord.finalJudge ?? {
              verdict: 'untrusted' as const,
              confidence: 0,
              reason: 'No judge available',
              nextStep: 'Re-run the team',
              uIntra: 1,
              uInter: 1,
              uSys: 1,
              collapseSignals: [],
              rawOutput: '',
            },
          })),
          strategy: aggregationConfig.strategy,
          task: params.task,
        };

        // Type assertion to ensure finalJudge has rawOutput
        const typedAggregationInput: AggregationInput = {
          ...aggregationInput,
          teamResults: aggregationInput.teamResults.map(tr => ({
            ...tr,
            finalJudge: tr.finalJudge && 'rawOutput' in tr.finalJudge
              ? tr.finalJudge
              : {
                  ...tr.finalJudge,
                  rawOutput: tr.finalJudge?.reason ?? '',
                },
          })),
        };
        const aggregationResult = await aggregateTeamResults(typedAggregationInput, {
          model: ctx.model,
          provider: ctx.model?.provider,
        });

        const lines: string[] = [];
        lines.push(`Parallel agent team run completed (${results.length} teams, ${totalTeammates} teammates).`);
        lines.push(
          `Applied limits: teams=${appliedTeamParallelism} concurrent (requested=${effectiveTeamParallelism}, baseline=${baselineTeamParallelism}), teammates/team=${appliedMemberParallelism} (requested=${effectiveMemberParallelism}, baseline=${baselineMemberParallelism}), adaptive_penalty=${adaptivePenaltyBefore}->${adaptivePenaltyAfter}.`,
        );
        lines.push(`Aggregation strategy: ${aggregationConfig.strategy}`);
        lines.push(`Failed-member retry rounds/team: ${failedMemberRetryRounds}`);
        lines.push(
          failed.length === 0
            ? "All teams completed successfully."
            : `${results.length - failed.length}/${results.length} teams completed (${failed.length} failed).`,
        );
        lines.push("");
        lines.push("Team summaries:");
        for (const result of results) {
          const state = result.runRecord.status === "completed" ? "ok" : "failed";
          lines.push(`- ${result.team.id} [${state}] ${result.runRecord.summary} (${result.runRecord.outputFile})`);
        }

        // Add aggregation result summary
        lines.push("");
        lines.push("Aggregated result:");
        lines.push(`- Strategy: ${aggregationConfig.strategy}`);
        lines.push(`- Verdict: ${aggregationResult.verdict}`);
        lines.push(`- Confidence: ${(aggregationResult.confidence * 100).toFixed(1)}%`);
        if (aggregationResult.selectedTeamId) {
          lines.push(`- Selected team: ${aggregationResult.selectedTeamId}`);
        }
        lines.push(`- Explanation: ${aggregationResult.explanation}`);

        lines.push("");
        lines.push("Detailed outputs:");
        for (const result of results) {
          lines.push("");
          lines.push(`## Team ${result.team.id}`);
          lines.push(
            buildTeamResultText({
              run: result.runRecord,
              team: result.team,
              memberResults: result.memberResults,
              communicationAudit: result.communicationAudit,
            }),
          );
        }

        logger.endOperation({
          status: parallelOutcome.outcomeCode === "SUCCESS" ? "success" : "partial",
          tokensUsed: 0,
          outputLength: lines.join("\n").length,
          childOperations: results.length,
          toolCalls: 0,
        });
        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          details: {
            selectedTeams: enabledTeams.map((team) => team.id),
            configuredTeamParallelLimit,
            configuredMemberParallelLimit,
            baselineTeamParallelism,
            baselineMemberParallelism,
            requestedTeamParallelism: effectiveTeamParallelism,
            requestedMemberParallelism: effectiveMemberParallelism,
            appliedTeamParallelism,
            appliedMemberParallelism,
            parallelismReduced: false,
            capacityWaitedMs: dispatchPermit.waitedMs,
            adaptivePenaltyBefore,
            adaptivePenaltyAfter,
            pressureFailureCount: pressureFailures,
            queuedAhead: dispatchPermit.queuedAhead,
            queuePosition: dispatchPermit.queuePosition,
            queueWaitedMs: dispatchPermit.waitedMs,
            traceId: dispatchPermit.orchestrationId,
            teamTaskIds: results.map((result, index) => ({
              taskId: buildTraceTaskId(dispatchPermit.orchestrationId, result.team.id, index),
              delegateId: result.team.id,
              runId: result.runRecord.runId,
              status: result.runRecord.status,
            })),
            communicationRounds,
            failedMemberRetryRounds,
            runs: results.map((result) => result.runRecord),
            teamResults: results.map((result) => ({
              team: { id: result.team.id, name: result.team.name },
              run: result.runRecord,
              memberResults: result.memberResults,
              memberTaskIds: result.memberResults.map((memberResult, index) => ({
                taskId: buildTraceTaskId(dispatchPermit.orchestrationId, memberResult.memberId, index),
                delegateId: memberResult.memberId,
                status: memberResult.status,
              })),
              communicationAudit: result.communicationAudit,
              uncertaintyProxy: result.uncertaintyProxy,
              uncertaintyProxyExplanation: result.uncertaintyProxyExplanation,
            })),
            failedTeamIds: parallelOutcome.failedTeamIds,
            partialTeamIds: parallelOutcome.partialTeamIds,
            failedMemberIdsByTeam: parallelOutcome.failedMemberIdsByTeam,
            aggregationStrategy: aggregationConfig.strategy,
            aggregationResult: {
              verdict: aggregationResult.verdict,
              confidence: aggregationResult.confidence,
              selectedTeamId: aggregationResult.selectedTeamId,
              explanation: aggregationResult.explanation,
            },
            outcomeCode: parallelOutcome.outcomeCode,
            retryRecommended: parallelOutcome.retryRecommended,
          },
        };
        } finally {
          // liveMonitorのクローズを安全に実行
          try {
            await liveMonitor?.close?.();
          } catch (monitorError) {
            const monitorErrorMsg = monitorError instanceof Error ? monitorError.message : String(monitorError);
            console.warn(`[agent-teams] liveMonitor.close failed (parallel): ${monitorErrorMsg}`);
          }

          try {
            await liveMonitor?.wait();
          } catch (monitorError) {
            const monitorErrorMsg = monitorError instanceof Error ? monitorError.message : String(monitorError);
            console.warn(`[agent-teams] liveMonitor.wait failed (parallel): ${monitorErrorMsg}`);
          }
        }
      } finally {
        stopReservationHeartbeat();
        capacityReservation.release();
      }
      refreshRuntimeStatus(ctx);
    },
  });

  // ランタイム状態
  pi.registerTool({
    name: "agent_team_status",
    label: "Agent Team Status",
    description: "アクティブなチーム実行数とメンバーエージェント数を表示する。",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const storage = loadStorage(ctx.cwd);
      const snapshot = getRuntimeSnapshot();
      return {
        content: [
          {
            type: "text" as const,
            text: formatRuntimeStatusLine({
              storedRuns: storage.runs.length,
              adaptivePenalty: adaptivePenalty.get(),
              adaptivePenaltyMax: ADAPTIVE_PARALLEL_MAX_PENALTY,
            }),
          },
        ],
        details: {
          activeTeamRuns: snapshot.teamActiveRuns,
          activeTeammates: snapshot.teamActiveAgents,
          activeSubagentRequests: snapshot.subagentActiveRequests,
          activeSubagentAgents: snapshot.subagentActiveAgents,
          totalActiveRequests: snapshot.totalActiveRequests,
          totalActiveLlm: snapshot.totalActiveLlm,
          maxTotalActiveRequests: snapshot.limits.maxTotalActiveRequests,
          maxTotalActiveLlm: snapshot.limits.maxTotalActiveLlm,
          maxParallelTeamsPerRun: snapshot.limits.maxParallelTeamsPerRun,
          maxParallelTeammatesPerTeam: snapshot.limits.maxParallelTeammatesPerTeam,
          maxParallelSubagentsPerRun: snapshot.limits.maxParallelSubagentsPerRun,
          maxConcurrentOrchestrations: snapshot.limits.maxConcurrentOrchestrations,
          capacityWaitMs: snapshot.limits.capacityWaitMs,
          capacityPollMs: snapshot.limits.capacityPollMs,
          activeOrchestrations: snapshot.activeOrchestrations,
          queuedOrchestrations: snapshot.queuedOrchestrations,
          queuedTools: snapshot.queuedTools,
          adaptiveParallelPenalty: adaptivePenalty.get(),
        },
      };
    },
  });

  // 実行履歴
  pi.registerTool({
    name: "agent_team_runs",
    label: "Agent Team Runs",
    description: "最近のエージェントチーム実行履歴を表示する。",
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: "Number of runs to return", minimum: 1, maximum: 50 })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const storage = loadStorage(ctx.cwd);
      const limitRaw = Number(params.limit ?? 10);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.trunc(limitRaw))) : 10;

      return {
        content: [{ type: "text" as const, text: formatRecentRuns(storage, limit) }],
        details: {
          runs: storage.runs.slice(-limit),
        },
      };
    },
  });

  // スラッシュコマンド（最小構成）
  pi.registerCommand("agent-team", {
    description: "Manage and inspect agent teams (list, runs, status, default, enable, disable)",
    handler: async (args, ctx) => {
      const input = (args || "").trim();
      const storage = loadStorage(ctx.cwd);

      if (!input || input === "help") {
        ctx.ui.notify("/agent-team list | /agent-team runs | /agent-team status | /agent-team default <id> | /agent-team enable <id> | /agent-team disable <id>", "info");
        return;
      }

      if (input === "list") {
        pi.sendMessage({ customType: "agent-team-list", content: formatTeamList(storage), display: true });
        return;
      }

      if (input === "runs") {
        pi.sendMessage({ customType: "agent-team-runs", content: formatRecentRuns(storage), display: true });
        return;
      }

      if (input === "status") {
        pi.sendMessage({
          customType: "agent-team-status",
          content: formatRuntimeStatusLine({
            storedRuns: storage.runs.length,
            adaptivePenalty: adaptivePenalty.get(),
            adaptivePenaltyMax: ADAPTIVE_PARALLEL_MAX_PENALTY,
          }),
          display: true,
        });
        return;
      }

      const [command, id] = input.split(/\s+/, 2);
      if (!id) {
        ctx.ui.notify("team id is required", "warning");
        return;
      }

      const target = storage.teams.find((team) => team.id === id);
      if (!target) {
        ctx.ui.notify(`Team not found: ${id}`, "error");
        return;
      }

      if (command === "default") {
        storage.currentTeamId = target.id;
        saveStorage(ctx.cwd, storage);
        ctx.ui.notify(`Current team set: ${target.id}`, "success");
        return;
      }

      if (command === "enable" || command === "disable") {
        target.enabled = command === "enable" ? "enabled" : "disabled";
        target.updatedAt = new Date().toISOString();
        saveStorage(ctx.cwd, storage);
        ctx.ui.notify(`Team ${target.id} is now ${target.enabled}`, "success");
        return;
      }

      ctx.ui.notify(`Unknown command: ${command}`, "warning");
    },
  });

  // セッション開始時にデフォルト定義を作成。
  pi.on("session_start", async (_event, ctx) => {
    const storage = loadStorage(ctx.cwd);
    saveStorage(ctx.cwd, storage);
    resetRuntimeTransientState();
    refreshRuntimeStatus(ctx);
    ctx.ui.notify(
      "Agent team extension loaded (agent_team_list, agent_team_run, agent_team_run_parallel, agent_team_status)",
      "info",
    );
  });

  // デフォルトでチーム活用を積極化する。
  pi.on("before_agent_start", async (event, _ctx) => {
    if (String(process.env.PI_AGENT_TEAM_PROACTIVE_PROMPT || "1") !== "1") {
      return;
    }

    const proactivePrompt = `
---
## Proactive Agent Team Orchestration Policy

For substantial coding, debugging, and review tasks, proactively run multiple agent teams.

Execution defaults:
- Prefer \`agent_team_run_parallel\` over single-team runs.
- Select 2-4 explicit \`teamIds\` with complementary viewpoints.
- Use \`strategy: "parallel"\`.
- Set \`communicationRounds: 1\` and \`failedMemberRetryRounds: 1\` by default.
- For ambiguous or high-risk tasks, raise \`communicationRounds\` to 2.
- After initial results, synthesize conflicts and run one focused follow-up team pass when needed.

If runtime capacity/rate limits are hit, reduce team count and rerun instead of skipping orchestration.
Do not claim cross-team consensus unless an agent-team tool was actually executed.
---`;

    // Check if plan mode is active via environment variable
    const planModeActive = isPlanModeActive();

    let finalPrompt = proactivePrompt;

    if (planModeActive) {
      finalPrompt = `${proactivePrompt}

---

${PLAN_MODE_WARNING}`;
    }

    return {
      systemPrompt: `${event.systemPrompt}${finalPrompt}`,
    };
  });
}
