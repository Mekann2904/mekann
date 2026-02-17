// File: .pi/extensions/agent-teams.ts
// Description: Adds multi-member agent team orchestration tools for pi.
// Why: Enables proactive parallel collaboration across specialized teammate roles.
// Related: .pi/extensions/subagents.ts, .pi/extensions/plan.ts, README.md

import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import { Type } from "@mariozechner/pi-ai";
import { getMarkdownTheme, parseFrontmatter, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Key, Markdown, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";


// Import shared plan mode utilities
import {
  ensureDir,
  formatDurationMs,
  normalizeForSingleLine,
  toTailLines,
  appendTail,
  countOccurrences,
  estimateLineCount,
  looksLikeMarkdown,
  renderPreviewWithMarkdown,
  extractStatusCodeFromMessage,
  classifyPressureError,
  isCancelledErrorMessage,
  isTimeoutErrorMessage,
  toErrorMessage,
  LIVE_TAIL_LIMIT,
  LIVE_MARKDOWN_PREVIEW_MIN_WIDTH,
  formatBytes,
  formatClockTime,
  createRunId,
  computeLiveWindow,
  ThinkingLevel,
  RunOutcomeCode,
  RunOutcomeSignal,
  DEFAULT_AGENT_TIMEOUT_MS,
  computeModelTimeoutMs,
  getLiveStatusGlyph,
  isEnterInput,
  finalizeLiveLines,
  type LiveStatus,
  validateTeamMemberOutput,
  trimForError,
  buildRateLimitKey,
  buildTraceTaskId,
  createRetrySchema,
  toConcurrencyLimit,
  resolveEffectiveTimeoutMs,
} from "../lib";
import { createChildAbortController } from "../lib/abort-utils";
import {
  createAdaptivePenaltyController,
} from "../lib/adaptive-penalty.js";
import { SchemaValidationError, ValidationError } from "../lib/errors.js";
import { getLogger } from "../lib/comprehensive-logger";
import type { OperationType } from "../lib/comprehensive-logger-types";
import { getCostEstimator, type ExecutionHistoryEntry, CostEstimator } from "../lib/cost-estimator";

const logger = getLogger();
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
} from "./agent-teams/storage";

// Import judge module (extracted for SRP compliance)
import {
  type TeamUncertaintyProxy,
  clampConfidence,
  parseUnitInterval,
  extractDiscussionSection,
  countKeywordSignals,
  countEvidenceSignals,
  analyzeMemberOutput,
  computeProxyUncertainty,
  buildFallbackJudge,
  runFinalJudge,
} from "./agent-teams/judge";

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
  type PartnerReferenceResultV2,
} from "./agent-teams/communication";

// Import definition-loader module (extracted for SRP compliance)
import {
  parseTeamMarkdownFile,
  loadTeamDefinitionsFromDir,
  loadTeamDefinitionsFromMarkdown,
  createDefaultTeams,
  mergeDefaultTeam,
  ensureDefaults,
} from "./agent-teams/definition-loader";

// Import live-monitor module (extracted for SRP compliance)
import {
  renderAgentTeamLiveView,
  createAgentTeamLiveMonitor,
  toTeamLiveItemKey,
} from "./agent-teams/live-monitor";

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
} from "./agent-teams/member-execution";

// Import parallel-execution module (extracted for SRP compliance)
import {
  type TeamParallelCapacityCandidate,
  type TeamParallelCapacityResolution,
  buildMemberParallelCandidates,
  buildTeamAndMemberParallelCandidates,
  resolveTeamParallelCapacity,
} from "./agent-teams/parallel-execution";

// Import result-aggregation module (extracted for SRP compliance)
import {
  isRetryableTeamMemberError,
  resolveTeamFailureOutcome,
  resolveTeamMemberAggregateOutcome,
  resolveTeamParallelRunOutcome,
  buildTeamResultText,
} from "./agent-teams/result-aggregation";

// Import team types from lib (extracted for maintainability)
// Note: Only types with matching structures are imported.
// TeamNormalizedOutput, TeamParallelCapacityCandidate, TeamParallelCapacityResolution
// have different implementations in this file (runtime-specific) vs lib (API-specific).
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
} from "../lib/team-types.js";

// Local alias for backward compatibility (TeamLiveViewMode = LiveViewMode with "discussion")
type LiveViewMode = TeamLiveViewMode;

// Import PrintCommandResult from subagent-types (shared type)
import { type PrintCommandResult } from "../lib/subagent-types.js";

// Re-export judge types for external use
export type { TeamUncertaintyProxy } from "./agent-teams/judge";

// Re-export definition-loader functions for external use (backward compatibility)
export {
  parseTeamMarkdownFile,
  loadTeamDefinitionsFromDir,
  loadTeamDefinitionsFromMarkdown,
  createDefaultTeams,
  mergeDefaultTeam,
  ensureDefaults,
} from "./agent-teams/definition-loader";

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
} from "./agent-teams/member-execution";

// Re-export parallel-execution functions for external use (backward compatibility)
export {
  type TeamParallelCapacityCandidate,
  type TeamParallelCapacityResolution,
  buildMemberParallelCandidates,
  buildTeamAndMemberParallelCandidates,
  resolveTeamParallelCapacity,
} from "./agent-teams/parallel-execution";

// Re-export result-aggregation functions for external use (backward compatibility)
export {
  isRetryableTeamMemberError,
  resolveTeamFailureOutcome,
  resolveTeamMemberAggregateOutcome,
  resolveTeamParallelRunOutcome,
  buildTeamResultText,
} from "./agent-teams/result-aggregation";

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
const LIVE_EVENT_TAIL_LIMIT = Math.max(60, Number(process.env.PI_LIVE_EVENT_TAIL_LIMIT) || 120);
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
} from "../lib/agent-common.js";
import {
  isRetryableTeamMemberError as sharedIsRetryableTeamMemberError,
  resolveTeamFailureOutcome as sharedResolveTeamFailureOutcome,
  resolveTeamMemberAggregateOutcome as sharedResolveTeamMemberAggregateOutcome,
  trimErrorMessage as sharedTrimErrorMessage,
  buildDiagnosticContext as sharedBuildDiagnosticContext,
} from "../lib/agent-errors.js";
import { runWithConcurrencyLimit } from "../lib/concurrency";
import {
  getTeamMemberExecutionRules,
} from "../lib/execution-rules";
import {
	isPlanModeActive,
	PLAN_MODE_WARNING,
} from "../lib/plan-mode-shared";
import {
  getRateLimitGateSnapshot,
  isRetryableError,
  retryWithBackoff,
  type RetryWithBackoffOverrides,
} from "../lib/retry-with-backoff";

import {
  formatRuntimeStatusLine,
  getRuntimeSnapshot,
  getSharedRuntimeState,
  notifyRuntimeCapacityChanged,
  resetRuntimeTransientState,
  reserveRuntimeCapacity,
  tryReserveRuntimeCapacity,
  type RuntimeCapacityReservationLease,
  waitForRuntimeOrchestrationTurn,
} from "./agent-runtime";
import {
  runPiPrintMode as sharedRunPiPrintMode,
  type PrintExecutorOptions,
} from "./shared/pi-print-executor";
import {
  buildRuntimeLimitError,
  buildRuntimeQueueWaitError,
  startReservationHeartbeat,
  refreshRuntimeStatus as sharedRefreshRuntimeStatus,
} from "./shared/runtime-helpers";

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
export { renderAgentTeamLiveView, createAgentTeamLiveMonitor } from "./agent-teams/live-monitor";

// Communication functions moved to ./agent-teams/communication.ts

// Local wrapper for shouldRetryFailedMemberResult that passes classifyPressureError
function shouldRetryFailedMemberResult(result: TeamMemberResult, retryRound: number): boolean {
  return shouldRetryFailedMemberResultBase(result, retryRound, classifyPressureError);
}

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

// Note: TeamParallelCapacityCandidate, TeamParallelCapacityResolution,
// buildMemberParallelCandidates, buildTeamAndMemberParallelCandidates,
// resolveTeamParallelCapacity are imported from ./agent-teams/parallel-execution

// Note: mergeDefaultTeam is now imported from ./agent-teams/definition-loader

// Wrapper for shared refreshRuntimeStatus with agent-team-specific parameters
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

function formatTeamList(storage: TeamStorage): string {
  if (storage.teams.length === 0) {
    return "No teams found.";
  }

  const lines: string[] = ["Agent teams:"];
  for (const team of storage.teams) {
    const marker = team.id === storage.currentTeamId ? "*" : " ";
    lines.push(`${marker} ${team.id} (${team.enabled}) - ${team.name}`);
    lines.push(`  ${team.description}`);
    for (const member of team.members) {
      lines.push(
        `   - ${member.id} (${member.enabled ? "enabled" : "disabled"}) ${member.role}: ${member.description}`,
      );
    }
  }
  return lines.join("\n");
}

function formatRecentRuns(storage: TeamStorage, limit = 10): string {
  const runs = storage.runs.slice(-limit).reverse();
  if (runs.length === 0) {
    return "No team runs yet.";
  }

  const lines: string[] = ["Recent team runs:"];
  for (const run of runs) {
    const judge = run.finalJudge ? ` | judge=${run.finalJudge.verdict}:${Math.round(run.finalJudge.confidence * 100)}%` : "";
    lines.push(
      `- ${run.runId} | ${run.teamId} | ${run.strategy} | ${run.status} | ${run.summary}${judge} | ${run.startedAt}`,
    );
  }
  return lines.join("\n");
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

function pickTeam(storage: TeamStorage, requestedId?: string): TeamDefinition | undefined {
  if (requestedId) {
    return storage.teams.find((team) => team.id === requestedId);
  }

  if (storage.currentTeamId) {
    const current = storage.teams.find((team) => team.id === storage.currentTeamId);
    if (current) return current;
  }

  return storage.teams.find((team) => team.enabled === "enabled");
}

function pickDefaultParallelTeams(storage: TeamStorage): TeamDefinition[] {
  const enabledTeams = storage.teams.filter((team) => team.enabled === "enabled");
  if (enabledTeams.length === 0) return [];

  const mode = String(process.env.PI_AGENT_TEAM_PARALLEL_DEFAULT || "current")
    .trim()
    .toLowerCase();
  if (mode === "all") {
    return enabledTeams;
  }

  const currentEnabled = storage.currentTeamId
    ? enabledTeams.find((team) => team.id === storage.currentTeamId)
    : undefined;
  if (currentEnabled) {
    return [currentEnabled];
  }

  return enabledTeams.slice(0, 1);
}

// Note: runMember is now imported from ./agent-teams/member-execution

async function runTeamTask(input: {
  team: TeamDefinition;
  task: string;
  strategy: TeamStrategy;
  memberParallelLimit?: number;
  communicationRounds: number;
  failedMemberRetryRounds?: number;
  communicationLinks?: Map<string, string[]>;
  sharedContext?: string;
  timeoutMs: number;
  cwd: string;
  retryOverrides?: RetryWithBackoffOverrides;
  fallbackProvider?: string;
  fallbackModel?: string;
  signal?: AbortSignal;
  onMemberStart?: (member: TeamMember) => void;
  onMemberEnd?: (member: TeamMember) => void;
  onMemberTextDelta?: (member: TeamMember, delta: string) => void;
  onMemberStderrChunk?: (member: TeamMember, chunk: string) => void;
  onMemberResult?: (member: TeamMember, result: TeamMemberResult) => void;
  onMemberPhase?: (member: TeamMember, phase: TeamLivePhase, round?: number) => void;
  onMemberEvent?: (member: TeamMember, event: string) => void;
  onTeamEvent?: (event: string) => void;
}): Promise<{ runRecord: TeamRunRecord; memberResults: TeamMemberResult[]; communicationAudit: TeamCommunicationAuditEntry[] }> {
  const enabledMembers = input.team.members.filter((member) => member.enabled);
  if (enabledMembers.length === 0) {
    throw new ValidationError(`no enabled members in team (${input.team.id})`, {
      field: "team.members",
      expected: "at least one enabled member",
      actual: "0 enabled members",
    });
  }
  // Execute all enabled members. Runtime safety is handled by memberParallelLimit.
  const activeMembers = enabledMembers;

  const runId = createRunId();
  const startedAt = new Date().toISOString();
  const paths = ensurePaths(input.cwd);
  const outputFile = join(paths.runsDir, `${runId}.json`);
  const communicationRounds =
    activeMembers.length <= 1 ? 0 : normalizeCommunicationRounds(input.communicationRounds, DEFAULT_COMMUNICATION_ROUNDS, STABLE_AGENT_TEAM_RUNTIME);
  const failedMemberRetryRounds =
    activeMembers.length <= 1
      ? 0
      : normalizeFailedMemberRetryRounds(
          input.failedMemberRetryRounds,
          DEFAULT_FAILED_MEMBER_RETRY_ROUNDS,
          STABLE_AGENT_TEAM_RUNTIME,
        );
  let failedMemberRetryApplied = 0;
  const recoveredMembers = new Set<string>();
  const communicationLinks = input.communicationLinks ?? createCommunicationLinksMap(activeMembers);
  const activeMemberById = new Map(activeMembers.map((member) => [member.id, member]));
  const memberById = new Map(input.team.members.map((member) => [member.id, member]));
  const communicationAudit: TeamCommunicationAuditEntry[] = [];

  input.onTeamEvent?.(
    `team=${input.team.id} start strategy=${input.strategy} members=${activeMembers.length} communication_rounds=${communicationRounds} failed_member_retries=${failedMemberRetryRounds}`,
  );
  const communicationPlanLine = activeMembers
    .map((member) => `${member.id}->${(communicationLinks.get(member.id) ?? []).join(",") || "-"}`)
    .join(" | ");
  input.onTeamEvent?.(`communication links: ${normalizeForSingleLine(communicationPlanLine, 320)}`);
  for (const member of activeMembers) {
    const partners = communicationLinks.get(member.id) ?? [];
    input.onMemberPhase?.(member, "queued");
    input.onMemberEvent?.(
      member,
      `queued: partners=${partners.join(", ") || "-"} shared_context=${input.sharedContext?.trim() ? "yes" : "no"}`,
    );
  }

  const emitResultEvent = (
    member: TeamMember,
    phaseLabel: string,
    result: TeamMemberResult,
  ) => {
    // Emit compact machine-like telemetry so users can see internal progress directly.
    const diagnostics = result.diagnostics
      ? ` confidence=${result.diagnostics.confidence.toFixed(2)} evidence=${result.diagnostics.evidenceCount}`
      : "";
    input.onMemberEvent?.(
      member,
      `${phaseLabel} result: status=${result.status} latency=${result.latencyMs}ms summary=${normalizeForSingleLine(result.summary, 96)}${diagnostics}${result.error ? ` error=${normalizeForSingleLine(result.error, 120)}` : ""}`,
    );
  };

  let memberResults: TeamMemberResult[] = [];
  if (input.strategy === "parallel") {
    const memberParallelLimit = toConcurrencyLimit(input.memberParallelLimit, activeMembers.length);
    input.onTeamEvent?.(`initial phase start: strategy=parallel member_parallel_limit=${memberParallelLimit}`);
    memberResults = await runWithConcurrencyLimit(
      activeMembers,
      memberParallelLimit,
      async (member) => {
        // Create child AbortController to prevent MaxListenersExceededWarning
        const { controller: childController, cleanup: cleanupAbort } = createChildAbortController(input.signal);
        try {
          input.onMemberPhase?.(member, "initial");
          input.onMemberEvent?.(member, "initial phase: dispatching run");
          const result = await runMember({
            team: input.team,
            member,
            task: input.task,
            sharedContext: input.sharedContext,
            phase: "initial",
            timeoutMs: input.timeoutMs,
            cwd: input.cwd,
            retryOverrides: input.retryOverrides,
            fallbackProvider: input.fallbackProvider,
            fallbackModel: input.fallbackModel,
            signal: childController.signal,
            onStart: input.onMemberStart,
            onEnd: input.onMemberEnd,
            onEvent: input.onMemberEvent,
            onTextDelta: input.onMemberTextDelta,
            onStderrChunk: input.onMemberStderrChunk,
          });
          emitResultEvent(member, "initial", result);
          return result;
        } finally {
          cleanupAbort();
        }
      },
      { signal: input.signal },
    );
    for (let index = 0; index < activeMembers.length; index += 1) {
      input.onMemberResult?.(activeMembers[index], memberResults[index]);
    }
    input.onTeamEvent?.(
      `initial phase finished: success=${memberResults.filter((result) => result.status === "completed").length}/${memberResults.length}`,
    );
  } else {
    input.onTeamEvent?.("initial phase start: strategy=sequential");
    for (const member of activeMembers) {
      input.onMemberPhase?.(member, "initial");
      input.onMemberEvent?.(member, "initial phase: dispatching run");
      const result = await runMember({
        team: input.team,
        member,
        task: input.task,
        sharedContext: input.sharedContext,
        phase: "initial",
        timeoutMs: input.timeoutMs,
        cwd: input.cwd,
        retryOverrides: input.retryOverrides,
        fallbackProvider: input.fallbackProvider,
        fallbackModel: input.fallbackModel,
        signal: input.signal,
        onStart: input.onMemberStart,
        onEnd: input.onMemberEnd,
        onEvent: input.onMemberEvent,
        onTextDelta: input.onMemberTextDelta,
        onStderrChunk: input.onMemberStderrChunk,
      });
      memberResults.push(result);
      emitResultEvent(member, "initial", result);
      input.onMemberResult?.(member, result);
    }
    input.onTeamEvent?.(
      `initial phase finished: success=${memberResults.filter((result) => result.status === "completed").length}/${memberResults.length}`,
    );
  }

  let canRunCommunication = memberResults.filter((result) => result.status === "completed").length >= 2;
  for (let round = 1; round <= communicationRounds; round += 1) {
    if (!canRunCommunication) {
      input.onTeamEvent?.(
        `communication round skipped: insufficient successful members (need>=2, have=${memberResults.filter((result) => result.status === "completed").length})`,
      );
      break;
    }
    input.onTeamEvent?.(`communication round ${round} start`);
    const previousResults = memberResults;
    const previousResultById = new Map(previousResults.map((result) => [result.memberId, result]));
    const communicationMembers = activeMembers.filter(
      (member) => previousResultById.get(member.id)?.status === "completed",
    );
    const skippedCommunicationMembers = activeMembers.filter(
      (member) => !communicationMembers.some((candidate) => candidate.id === member.id),
    );

    if (skippedCommunicationMembers.length > 0) {
      input.onTeamEvent?.(
        `communication round ${round}: skipped_failed_members=${skippedCommunicationMembers
          .map((member) => member.id)
          .join(",")}`,
      );
      for (const member of skippedCommunicationMembers) {
        input.onMemberEvent?.(
          member,
          `communication round ${round}: skipped (previous status=failed)`,
        );
      }
    }

    if (communicationMembers.length < 2) {
      input.onTeamEvent?.(
        `communication round ${round} skipped: insufficient successful members after filtering (need>=2, have=${communicationMembers.length})`,
      );
      canRunCommunication = false;
      break;
    }

    const contextMap = buildPrecomputedContextMap(previousResults);

    if (input.strategy === "parallel") {
      const memberParallelLimit = toConcurrencyLimit(
        input.memberParallelLimit,
        communicationMembers.length,
      );
      input.onTeamEvent?.(
        `communication round ${round}: strategy=parallel member_parallel_limit=${memberParallelLimit}`,
      );
      const roundResults = await runWithConcurrencyLimit(
        communicationMembers,
        memberParallelLimit,
        async (member) => {
          // Create child AbortController to prevent MaxListenersExceededWarning
          const { controller: childController, cleanup: cleanupAbort } = createChildAbortController(input.signal);
          try {
            const partnerIds = communicationLinks.get(member.id) ?? [];
            const partnerSnapshots = partnerIds.map((partnerId) => {
              const partnerResult = previousResults.find((result) => result.memberId === partnerId);
              const claim = partnerResult ? extractField(partnerResult.output, "CLAIM") || "-" : "-";
              return `${partnerId}:status=${partnerResult?.status || "unknown"} summary=${normalizeForSingleLine(partnerResult?.summary || "-", 70)} claim=${normalizeForSingleLine(claim, 70)}`;
            });
            input.onMemberPhase?.(member, "communication", round);
            input.onMemberEvent?.(
              member,
              `communication round ${round}: partners=${partnerIds.join(", ") || "-"} context_build=start`,
            );
            const communicationContext = buildCommunicationContext({
              team: input.team,
              member,
              round,
              partnerIds,
              contextMap,
            });
            input.onMemberEvent?.(
              member,
              `communication round ${round}: context_build=done size=${communicationContext.length}chars`,
            );
            input.onMemberEvent?.(
              member,
              `communication round ${round}: partner_snapshots=${partnerSnapshots.join(" | ") || "-"}`,
            );
            input.onMemberEvent?.(
              member,
              `communication round ${round}: context_preview=${normalizeForSingleLine(communicationContext, 200)}`,
            );

            const result = await runMember({
              team: input.team,
              member,
              task: input.task,
              sharedContext: input.sharedContext,
              phase: "communication",
              communicationContext,
              timeoutMs: input.timeoutMs,
              cwd: input.cwd,
              retryOverrides: input.retryOverrides,
              fallbackProvider: input.fallbackProvider,
              fallbackModel: input.fallbackModel,
              signal: childController.signal,
              onStart: input.onMemberStart,
              onEnd: input.onMemberEnd,
              onEvent: input.onMemberEvent,
              onTextDelta: input.onMemberTextDelta,
              onStderrChunk: input.onMemberStderrChunk,
            });
            emitResultEvent(member, `communication#${round}`, result);
            const communicationReference = detectPartnerReferencesV2(result.output, partnerIds, memberById);
            communicationAudit.push({
              round,
              memberId: member.id,
              role: member.role,
              partnerIds: [...partnerIds],
              referencedPartners: communicationReference.referencedPartners,
              missingPartners: communicationReference.missingPartners,
              contextPreview: normalizeForSingleLine(communicationContext, 200),
              partnerSnapshots,
              resultStatus: result.status,
              claimReferences: communicationReference.claimReferences.length > 0
                ? communicationReference.claimReferences
                : undefined,
            });
            input.onMemberEvent?.(
              member,
              `communication round ${round}: referenced=${communicationReference.referencedPartners.join(", ") || "-"} missing=${communicationReference.missingPartners.join(", ") || "-"}`,
            );
            return result;
          } finally {
            cleanupAbort();
          }
        },
        { signal: input.signal },
      );
      for (let index = 0; index < communicationMembers.length; index += 1) {
        input.onMemberResult?.(communicationMembers[index], roundResults[index]);
      }
      const roundResultById = new Map(roundResults.map((result) => [result.memberId, result]));
      memberResults = activeMembers.map((member) => {
        const updated = roundResultById.get(member.id);
        if (updated) return updated;
        const previous = previousResultById.get(member.id);
        if (previous) return previous;
        return {
          memberId: member.id,
          role: member.role,
          summary: "(failed)",
          output: "",
          status: "failed",
          latencyMs: 0,
          error: "member result missing after communication round",
          diagnostics: {
            confidence: 0,
            evidenceCount: 0,
            contradictionSignals: 0,
            conflictSignals: 0,
          },
        };
      });
    } else {
      const roundResults: TeamMemberResult[] = [];
      for (const member of communicationMembers) {
        const partnerIds = communicationLinks.get(member.id) ?? [];
        const partnerSnapshots = partnerIds.map((partnerId) => {
          const partnerResult = previousResults.find((result) => result.memberId === partnerId);
          const claim = partnerResult ? extractField(partnerResult.output, "CLAIM") || "-" : "-";
          return `${partnerId}:status=${partnerResult?.status || "unknown"} summary=${normalizeForSingleLine(partnerResult?.summary || "-", 70)} claim=${normalizeForSingleLine(claim, 70)}`;
        });
        input.onMemberPhase?.(member, "communication", round);
        input.onMemberEvent?.(
          member,
          `communication round ${round}: partners=${partnerIds.join(", ") || "-"} context_build=start`,
        );
        const communicationContext = buildCommunicationContext({
          team: input.team,
          member,
          round,
          partnerIds,
          contextMap,
        });
        input.onMemberEvent?.(
          member,
          `communication round ${round}: context_build=done size=${communicationContext.length}chars`,
        );
        input.onMemberEvent?.(
          member,
          `communication round ${round}: partner_snapshots=${partnerSnapshots.join(" | ") || "-"}`,
        );
        input.onMemberEvent?.(
          member,
          `communication round ${round}: context_preview=${normalizeForSingleLine(communicationContext, 200)}`,
        );
        const result = await runMember({
          team: input.team,
          member,
          task: input.task,
          sharedContext: input.sharedContext,
          phase: "communication",
          communicationContext,
          timeoutMs: input.timeoutMs,
          cwd: input.cwd,
          retryOverrides: input.retryOverrides,
          fallbackProvider: input.fallbackProvider,
          fallbackModel: input.fallbackModel,
          signal: input.signal,
          onStart: input.onMemberStart,
          onEnd: input.onMemberEnd,
          onEvent: input.onMemberEvent,
          onTextDelta: input.onMemberTextDelta,
          onStderrChunk: input.onMemberStderrChunk,
        });
        roundResults.push(result);
        emitResultEvent(member, `communication#${round}`, result);
        const communicationReference = detectPartnerReferencesV2(result.output, partnerIds, memberById);
        communicationAudit.push({
          round,
          memberId: member.id,
          role: member.role,
          partnerIds: [...partnerIds],
          referencedPartners: communicationReference.referencedPartners,
          missingPartners: communicationReference.missingPartners,
          contextPreview: normalizeForSingleLine(communicationContext, 200),
          partnerSnapshots,
          resultStatus: result.status,
          claimReferences: communicationReference.claimReferences.length > 0
            ? communicationReference.claimReferences
            : undefined,
        });
        input.onMemberEvent?.(
          member,
          `communication round ${round}: referenced=${communicationReference.referencedPartners.join(", ") || "-"} missing=${communicationReference.missingPartners.join(", ") || "-"}`,
        );
        input.onMemberResult?.(member, result);
      }
      const roundResultById = new Map(roundResults.map((result) => [result.memberId, result]));
      memberResults = activeMembers.map((member) => {
        const updated = roundResultById.get(member.id);
        if (updated) return updated;
        const previous = previousResultById.get(member.id);
        if (previous) return previous;
        return {
          memberId: member.id,
          role: member.role,
          summary: "(failed)",
          output: "",
          status: "failed",
          latencyMs: 0,
          error: "member result missing after communication round",
          diagnostics: {
            confidence: 0,
            evidenceCount: 0,
            contradictionSignals: 0,
            conflictSignals: 0,
          },
        };
      });
    }
    const roundAuditEntries = communicationAudit.filter((entry) => entry.round === round);
    const referencedCount = roundAuditEntries.filter((entry) => entry.referencedPartners.length > 0).length;
    input.onTeamEvent?.(
      `communication round ${round} evidence: referenced=${referencedCount}/${roundAuditEntries.length}`,
    );
    input.onTeamEvent?.(
      `communication round ${round} finished: success=${memberResults.filter((result) => result.status === "completed").length}/${memberResults.length}`,
    );
    canRunCommunication = memberResults.filter((result) => result.status === "completed").length >= 2;
  }

  for (let retryRound = 1; retryRound <= failedMemberRetryRounds; retryRound += 1) {
    const resultByIdBeforeRetry = new Map(memberResults.map((result) => [result.memberId, result]));
    const failedMemberResults = memberResults.filter((result) => result.status === "failed");
    if (failedMemberResults.length === 0) {
      if (retryRound === 1) {
        input.onTeamEvent?.("failed-member retry skipped: no failed members");
      }
      break;
    }

    const retryTargetIds = failedMemberResults
      .filter((result) => shouldRetryFailedMemberResult(result, retryRound))
      .map((result) => result.memberId);
    const retryTargetMembers = retryTargetIds
      .map((memberId) => activeMemberById.get(memberId))
      .filter((member): member is TeamMember => Boolean(member));
    const skippedFailedMemberIds = failedMemberResults
      .map((result) => result.memberId)
      .filter((memberId) => !retryTargetIds.includes(memberId));

    if (retryTargetMembers.length === 0) {
      input.onTeamEvent?.(
        `failed-member retry round ${retryRound}/${failedMemberRetryRounds} skipped: no retry-eligible failures`,
      );
      continue;
    }

    failedMemberRetryApplied += 1;
    const retryPhaseRound = communicationRounds + retryRound;
    const previousResults = memberResults;
    if (skippedFailedMemberIds.length > 0) {
      input.onTeamEvent?.(
        `failed-member retry round ${retryRound}: skipped_by_policy=${skippedFailedMemberIds.join(",")}`,
      );
    }
    input.onTeamEvent?.(
      `failed-member retry round ${retryRound}/${failedMemberRetryRounds} start: targets=${retryTargetMembers.map((member) => member.id).join(",")}`,
    );

    const contextMap = buildPrecomputedContextMap(previousResults);

    const runRetryMember = async (member: TeamMember): Promise<TeamMemberResult> => {
      // Create child AbortController to prevent MaxListenersExceededWarning
      const { controller: childController, cleanup: cleanupAbort } = createChildAbortController(input.signal);
      try {
        const partnerIds = communicationLinks.get(member.id) ?? [];
        const partnerSnapshots = partnerIds.map((partnerId) => {
          const partnerResult = previousResults.find((result) => result.memberId === partnerId);
          const claim = partnerResult ? extractField(partnerResult.output, "CLAIM") || "-" : "-";
          return `${partnerId}:status=${partnerResult?.status || "unknown"} summary=${normalizeForSingleLine(partnerResult?.summary || "-", 70)} claim=${normalizeForSingleLine(claim, 70)}`;
        });
        input.onMemberPhase?.(member, "communication", retryPhaseRound);
        input.onMemberEvent?.(
          member,
          `failed-member retry round ${retryRound}: partners=${partnerIds.join(", ") || "-"} context_build=start`,
        );
        const communicationContext = buildCommunicationContext({
          team: input.team,
          member,
          round: retryPhaseRound,
          partnerIds,
          contextMap,
        });
        input.onMemberEvent?.(
          member,
          `failed-member retry round ${retryRound}: context_build=done size=${communicationContext.length}chars`,
        );
        input.onMemberEvent?.(
          member,
          `failed-member retry round ${retryRound}: partner_snapshots=${partnerSnapshots.join(" | ") || "-"}`,
        );
        input.onMemberEvent?.(
          member,
          `failed-member retry round ${retryRound}: context_preview=${normalizeForSingleLine(communicationContext, 200)}`,
        );
        const result = await runMember({
          team: input.team,
          member,
          task: input.task,
          sharedContext: input.sharedContext,
          phase: "communication",
          communicationContext,
          timeoutMs: input.timeoutMs,
          cwd: input.cwd,
          retryOverrides: input.retryOverrides,
          fallbackProvider: input.fallbackProvider,
          fallbackModel: input.fallbackModel,
          signal: childController.signal,
          onStart: input.onMemberStart,
          onEnd: input.onMemberEnd,
          onEvent: input.onMemberEvent,
          onTextDelta: input.onMemberTextDelta,
          onStderrChunk: input.onMemberStderrChunk,
        });
        emitResultEvent(member, `failed-retry#${retryRound}`, result);
        const communicationReference = detectPartnerReferencesV2(result.output, partnerIds, memberById);
        communicationAudit.push({
          round: retryPhaseRound,
          memberId: member.id,
          role: member.role,
          partnerIds: [...partnerIds],
          referencedPartners: communicationReference.referencedPartners,
          missingPartners: communicationReference.missingPartners,
          contextPreview: normalizeForSingleLine(communicationContext, 200),
          partnerSnapshots,
          resultStatus: result.status,
          claimReferences: communicationReference.claimReferences.length > 0
            ? communicationReference.claimReferences
            : undefined,
        });
        input.onMemberEvent?.(
          member,
          `failed-member retry round ${retryRound}: referenced=${communicationReference.referencedPartners.join(", ") || "-"} missing=${communicationReference.missingPartners.join(", ") || "-"}`,
        );
        return result;
      } finally {
        cleanupAbort();
      }
    };

    let retriedResults: TeamMemberResult[] = [];
    if (input.strategy === "parallel") {
      const memberParallelLimit = toConcurrencyLimit(input.memberParallelLimit, retryTargetMembers.length);
      input.onTeamEvent?.(
        `failed-member retry round ${retryRound}: strategy=parallel member_parallel_limit=${memberParallelLimit}`,
      );
      retriedResults = await runWithConcurrencyLimit(
        retryTargetMembers,
        memberParallelLimit,
        async (member) => runRetryMember(member),
        { signal: input.signal },
      );
    } else {
      input.onTeamEvent?.(`failed-member retry round ${retryRound}: strategy=sequential`);
      for (const member of retryTargetMembers) {
        const result = await runRetryMember(member);
        retriedResults.push(result);
      }
    }

    const resultById = new Map(memberResults.map((result) => [result.memberId, result]));
    for (let index = 0; index < retryTargetMembers.length; index += 1) {
      const member = retryTargetMembers[index];
      const retried = retriedResults[index];
      const before = resultByIdBeforeRetry.get(member.id);
      if (before?.status === "failed" && retried.status === "completed") {
        recoveredMembers.add(member.id);
      }
      resultById.set(member.id, retried);
      input.onMemberResult?.(member, retried);
    }

    memberResults = activeMembers.map((member) => {
      const existing = resultById.get(member.id);
      if (existing) return existing;
      return {
        memberId: member.id,
        role: member.role,
        summary: "(failed)",
        output: "",
        status: "failed",
        latencyMs: 0,
        error: "member result missing after retry",
        diagnostics: {
          confidence: 0,
          evidenceCount: 0,
          contradictionSignals: 0,
          conflictSignals: 0,
        },
      };
    });

    const failedAfter = memberResults.filter((result) => result.status === "failed").length;
    input.onTeamEvent?.(
      `failed-member retry round ${retryRound} finished: failed_remaining=${failedAfter}/${memberResults.length} recovered_total=${recoveredMembers.size}`,
    );
  }

  const failed = memberResults.filter((result) => result.status === "failed");
  const communicationLinksRecord = Object.fromEntries(
    activeMembers.map((member) => [member.id, communicationLinks.get(member.id) ?? []]),
  );
  const summary =
    failed.length === 0
      ? `${memberResults.length} teammates completed. communication_rounds=${communicationRounds} failed_member_retries=${failedMemberRetryApplied}/${failedMemberRetryRounds} recovered=${recoveredMembers.size}`
      : `${memberResults.length - failed.length}/${memberResults.length} teammates completed (${failed.length} failed). communication_rounds=${communicationRounds} failed_member_retries=${failedMemberRetryApplied}/${failedMemberRetryRounds} recovered=${recoveredMembers.size}`;
  const proxy = computeProxyUncertainty(memberResults);

  const runRecord: TeamRunRecord = {
    runId,
    teamId: input.team.id,
    strategy: input.strategy,
    task: input.task,
    communicationRounds,
    failedMemberRetryRounds,
    failedMemberRetryApplied,
    recoveredMembers: Array.from(recoveredMembers),
    communicationLinks: communicationLinksRecord,
    summary,
    status: failed.length === memberResults.length ? "failed" : "completed",
    startedAt,
    finishedAt: new Date().toISOString(),
    memberCount: memberResults.length,
    outputFile,
  };

  for (const member of activeMembers) {
    input.onMemberPhase?.(member, "judge");
    input.onMemberEvent?.(member, "final judge: waiting team-level verdict");
  }
  input.onTeamEvent?.("final judge start");

  // チーム終了時に必ず最終判定を実行する（Stable profile では決定論的プロキシ判定）。
  const finalJudge = await runFinalJudge({
    team: input.team,
    task: input.task,
    strategy: input.strategy,
    memberResults,
    proxy,
    timeoutMs: input.timeoutMs,
    signal: input.signal,
  });
  input.onTeamEvent?.(
    `final judge finished: verdict=${finalJudge.verdict} confidence=${Math.round(finalJudge.confidence * 100)}% u_sys=${finalJudge.uSys.toFixed(2)}`,
  );
  for (const member of activeMembers) {
    input.onMemberEvent?.(
      member,
      `final judge verdict=${finalJudge.verdict} confidence=${Math.round(finalJudge.confidence * 100)}% next_step=${normalizeForSingleLine(finalJudge.nextStep, 120)}`,
    );
    input.onMemberPhase?.(member, "finished");
  }
  runRecord.finalJudge = {
    verdict: finalJudge.verdict,
    confidence: finalJudge.confidence,
    reason: finalJudge.reason,
    nextStep: finalJudge.nextStep,
    uIntra: finalJudge.uIntra,
    uInter: finalJudge.uInter,
    uSys: finalJudge.uSys,
    collapseSignals: finalJudge.collapseSignals,
  };

  // Record team execution for cost estimation learning
  const totalLatencyMs = memberResults.reduce((sum, r) => sum + r.latencyMs, 0);
  const executionEntry: ExecutionHistoryEntry = {
    source: "agent_team_run",
    provider: input.fallbackProvider ?? "(session-default)",
    model: input.fallbackModel ?? "(session-default)",
    taskDescription: input.task,
    actualDurationMs: totalLatencyMs,
    actualTokens: 0, // Token count not available from print mode
    success: failed.length === 0,
    timestamp: Date.now(),
  };
  try {
    getCostEstimator().recordExecution(executionEntry);
  } catch {
    // Ignore errors in cost estimation recording
  }

  writeFileSync(
    outputFile,
    JSON.stringify(
      {
        run: runRecord,
        team: input.team,
        memberResults,
        communicationAudit,
        uncertaintyProxy: proxy,
        finalJudge,
        task: input.task,
        sharedContext: input.sharedContext,
      },
      null,
      2,
    ),
    "utf-8",
  );

  return {
    runRecord,
    memberResults,
    communicationAudit,
  };
}

export default function registerAgentTeamsExtension(pi: ExtensionAPI) {
  // チーム一覧
  pi.registerTool({
    name: "agent_team_list",
    label: "Agent Team List",
    description: "List configured agent teams and teammates.",
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
    description: "Create a custom agent team with independent teammate roles.",
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
    description: "Enable or disable teams and set current default team.",
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
          content: [{ type: "text" as const, text: `agent_team_configure error: not found (${params.teamId})` }],
          details: { error: "not_found" },
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
                text: `agent_team_configure error: member not found (${params.memberId})`,
              },
            ],
            details: { error: "member_not_found" },
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
      "Run one team for a task with multiple teammate agents. Use agent_team_run_parallel when multiple teams can run concurrently.",
    parameters: Type.Object({
      task: Type.String({ description: "Task for the team" }),
      teamId: Type.Optional(Type.String({ description: "Target team id (default current team)" })),
      strategy: Type.Optional(Type.String({ description: "parallel (default) or sequential" })),
      sharedContext: Type.Optional(Type.String({ description: "Shared instructions for all teammates" })),
      communicationRounds: Type.Optional(
        Type.Number({ description: "Additional communication rounds among teammates (stable profile: fixed 0)" }),
      ),
      failedMemberRetryRounds: Type.Optional(
        Type.Number({ description: "Retry rounds for failed members only (stable profile: fixed 0)" }),
      ),
      timeoutMs: Type.Optional(Type.Number({ description: "Timeout per teammate run in ms (default: 600000). Use 0 to disable timeout." })),
      retry: createRetrySchema(),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
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

      const queueSnapshot = getRuntimeSnapshot();
      const queueWait = await waitForRuntimeOrchestrationTurn({
        toolName: "agent_team_run",
        maxWaitMs: queueSnapshot.limits.capacityWaitMs,
        pollIntervalMs: queueSnapshot.limits.capacityPollMs,
        signal,
      });
      if (!queueWait.allowed || !queueWait.lease) {
        const queueOutcome: RunOutcomeSignal = queueWait.aborted
          ? { outcomeCode: "CANCELLED", retryRecommended: false }
          : { outcomeCode: "TIMEOUT", retryRecommended: true };
        return {
          content: [
            {
              type: "text" as const,
              text: buildRuntimeQueueWaitError("agent_team_run", queueWait),
            },
          ],
          details: {
            error: queueWait.aborted ? "runtime_queue_aborted" : "runtime_queue_timeout",
            queuedAhead: queueWait.queuedAhead,
            queuePosition: queueWait.queuePosition,
            queueWaitedMs: queueWait.waitedMs,
            queueAttempts: queueWait.attempts,
            traceId: queueWait.orchestrationId,
            outcomeCode: queueOutcome.outcomeCode,
            retryRecommended: queueOutcome.retryRecommended,
          },
        };
      }
      const queueLease = queueWait.lease;

      try {
      const strategy: TeamStrategy =
        String(params.strategy || "parallel").toLowerCase() === "sequential" ? "sequential" : "parallel";
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
      const communicationLinks = createCommunicationLinksMap(activeMembers);

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
      const capacityResolution = await resolveTeamParallelCapacity({
        requestedTeamParallelism: 1,
        requestedMemberParallelism: effectiveMemberParallelism,
        candidates: buildMemberParallelCandidates(effectiveMemberParallelism),
        toolName: "agent_team_run",
        maxWaitMs: snapshot.limits.capacityWaitMs,
        pollIntervalMs: snapshot.limits.capacityPollMs,
        signal,
      });
      if (!capacityResolution.allowed) {
        adaptivePenalty.raise("capacity");
        const capacityOutcome: RunOutcomeSignal = capacityResolution.aborted
          ? { outcomeCode: "CANCELLED", retryRecommended: false }
          : capacityResolution.timedOut
            ? { outcomeCode: "TIMEOUT", retryRecommended: true }
            : { outcomeCode: "RETRYABLE_FAILURE", retryRecommended: true };
        return {
          content: [
            {
              type: "text" as const,
              text: buildRuntimeLimitError("agent_team_run", capacityResolution.reasons, {
                waitedMs: capacityResolution.waitedMs,
                timedOut: capacityResolution.timedOut,
              }),
            },
          ],
          details: {
            error: "runtime_limit_reached",
            reasons: capacityResolution.reasons,
            projectedRequests: capacityResolution.projectedRequests,
            projectedLlm: capacityResolution.projectedLlm,
            waitedMs: capacityResolution.waitedMs,
            timedOut: capacityResolution.timedOut,
            aborted: capacityResolution.aborted,
            capacityAttempts: capacityResolution.attempts,
            configuredMemberParallelLimit,
            baselineMemberParallelism,
            requestedMemberParallelism: capacityResolution.requestedMemberParallelism,
            appliedMemberParallelism: capacityResolution.appliedMemberParallelism,
            parallelismReduced: capacityResolution.reduced,
            adaptivePenaltyBefore,
            adaptivePenaltyAfter: adaptivePenalty.get(),
            requestedMemberCount: activeMembers.length,
            failedMemberRetryRounds,
            queuedAhead: queueWait.queuedAhead,
            queuePosition: queueWait.queuePosition,
            queueWaitedMs: queueWait.waitedMs,
            traceId: queueWait.orchestrationId,
            outcomeCode: capacityOutcome.outcomeCode,
            retryRecommended: capacityOutcome.retryRecommended,
          },
        };
      }
      if (!capacityResolution.reservation) {
        adaptivePenalty.raise("capacity");
        return {
          content: [
            {
              type: "text" as const,
              text: "agent_team_run blocked: capacity reservation missing.",
            },
          ],
          details: {
            error: "runtime_reservation_missing",
            requestedMemberParallelism: capacityResolution.requestedMemberParallelism,
            appliedMemberParallelism: capacityResolution.appliedMemberParallelism,
            queuedAhead: queueWait.queuedAhead,
            queuePosition: queueWait.queuePosition,
            queueWaitedMs: queueWait.waitedMs,
            traceId: queueWait.orchestrationId,
            outcomeCode: "RETRYABLE_FAILURE" as RunOutcomeCode,
            retryRecommended: true,
          },
        };
      }
      const appliedMemberParallelism = capacityResolution.appliedMemberParallelism;
      const capacityReservation = capacityResolution.reservation;
      const stopReservationHeartbeat = startReservationHeartbeat(capacityReservation);

      try {
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

        // Debug logging for cost estimation
        if (process.env.PI_DEBUG_COST_ESTIMATION === "1") {
          console.log(
            `[CostEstimation] agent_team_run: team=${team.id} ` +
            `base=(${baseEstimate.estimatedDurationMs}ms, ${baseEstimate.estimatedTokens}t) ` +
            `adjusted=(${adjustedDurationMs}ms, ${adjustedTokens}t) ` +
            `teamSize=${teamSize} rounds=${communicationRounds} method=${baseEstimate.method}`
          );
        }

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
          `runtime capacity granted: projected_requests=${capacityResolution.projectedRequests} projected_llm=${capacityResolution.projectedLlm}`,
        );

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
          const { runRecord, memberResults, communicationAudit } = await runTeamTask({
            team,
            task: params.task,
            strategy,
            memberParallelLimit: appliedMemberParallelism,
            communicationRounds,
            failedMemberRetryRounds,
            communicationLinks,
            sharedContext: params.sharedContext,
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
              parallelismReduced: capacityResolution.reduced,
              capacityWaitedMs: capacityResolution.waitedMs,
              adaptivePenaltyBefore,
              adaptivePenaltyAfter,
              pressureFailureCount: pressureFailures,
              queuedAhead: queueWait.queuedAhead,
              queuePosition: queueWait.queuePosition,
              queueWaitedMs: queueWait.waitedMs,
              traceId: queueWait.orchestrationId,
              teamTaskId: buildTraceTaskId(queueWait.orchestrationId, team.id, 0),
              communicationRounds,
              failedMemberRetryRounds,
              communicationLinks: Object.fromEntries(
                activeMembers.map((member) => [member.id, communicationLinks.get(member.id) ?? []]),
              ),
              memberResults,
              memberTaskIds: memberResults.map((result, index) => ({
                taskId: buildTraceTaskId(queueWait.orchestrationId, result.memberId, index),
                delegateId: result.memberId,
                status: result.status,
              })),
              communicationAudit,
              failedMemberIds: teamOutcome.failedMemberIds,
              outcomeCode: teamOutcome.outcomeCode,
              retryRecommended: teamOutcome.retryRecommended,
            },
          };
        } catch (error) {
          const errorMessage = toErrorMessage(error);
          const pressure = classifyPressureError(errorMessage);
          if (pressure !== "other") {
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
              parallelismReduced: capacityResolution.reduced,
              capacityWaitedMs: capacityResolution.waitedMs,
              adaptivePenaltyBefore,
              adaptivePenaltyAfter,
              failedMemberRetryRounds,
              queuedAhead: queueWait.queuedAhead,
              queuePosition: queueWait.queuePosition,
              queueWaitedMs: queueWait.waitedMs,
              traceId: queueWait.orchestrationId,
              teamTaskId: buildTraceTaskId(queueWait.orchestrationId, team.id, 0),
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
          liveMonitor?.close();
          await liveMonitor?.wait();
        }
      } finally {
        stopReservationHeartbeat();
        capacityReservation.release();
      }
      } finally {
        queueLease.release();
        refreshRuntimeStatus(ctx);
      }
    },
  });

  // 複数チーム並列実行
  pi.registerTool({
    name: "agent_team_run_parallel",
    label: "Agent Team Run Parallel",
    description:
      "Run selected teams in parallel. If teamIds are omitted, only the current enabled team runs (conservative default).",
    parameters: Type.Object({
      task: Type.String({ description: "Task delegated to all selected teams" }),
      teamIds: Type.Optional(Type.Array(Type.String({ description: "Team id list" }))),
      strategy: Type.Optional(Type.String({ description: "Member strategy per team: parallel (default) or sequential" })),
      sharedContext: Type.Optional(Type.String({ description: "Shared instructions for all teammates" })),
      communicationRounds: Type.Optional(
        Type.Number({ description: "Additional communication rounds among teammates (stable profile: fixed 0)" }),
      ),
      failedMemberRetryRounds: Type.Optional(
        Type.Number({ description: "Retry rounds for failed members only in each team (stable profile: fixed 0)" }),
      ),
      timeoutMs: Type.Optional(Type.Number({ description: "Timeout per teammate run in ms (default: 600000). Use 0 to disable timeout." })),
      retry: createRetrySchema(),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
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

      const queueSnapshot = getRuntimeSnapshot();
      const queueWait = await waitForRuntimeOrchestrationTurn({
        toolName: "agent_team_run_parallel",
        maxWaitMs: queueSnapshot.limits.capacityWaitMs,
        pollIntervalMs: queueSnapshot.limits.capacityPollMs,
        signal,
      });
      if (!queueWait.allowed || !queueWait.lease) {
        const queueOutcome: RunOutcomeSignal = queueWait.aborted
          ? { outcomeCode: "CANCELLED", retryRecommended: false }
          : { outcomeCode: "TIMEOUT", retryRecommended: true };
        return {
          content: [
            {
              type: "text" as const,
              text: buildRuntimeQueueWaitError("agent_team_run_parallel", queueWait),
            },
          ],
          details: {
            error: queueWait.aborted ? "runtime_queue_aborted" : "runtime_queue_timeout",
            queuedAhead: queueWait.queuedAhead,
            queuePosition: queueWait.queuePosition,
            queueWaitedMs: queueWait.waitedMs,
            queueAttempts: queueWait.attempts,
            traceId: queueWait.orchestrationId,
            outcomeCode: queueOutcome.outcomeCode,
            retryRecommended: queueOutcome.retryRecommended,
          },
        };
      }
      const queueLease = queueWait.lease;

      try {
      const strategy: TeamStrategy =
        String(params.strategy || "parallel").toLowerCase() === "sequential" ? "sequential" : "parallel";
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
      const capacityResolution = await resolveTeamParallelCapacity({
        requestedTeamParallelism: effectiveTeamParallelism,
        requestedMemberParallelism: effectiveMemberParallelism,
        candidates: buildTeamAndMemberParallelCandidates(
          effectiveTeamParallelism,
          effectiveMemberParallelism,
        ),
        toolName: "agent_team_run_parallel",
        maxWaitMs: snapshot.limits.capacityWaitMs,
        pollIntervalMs: snapshot.limits.capacityPollMs,
        signal,
      });
      if (!capacityResolution.allowed) {
        adaptivePenalty.raise("capacity");
        const capacityOutcome: RunOutcomeSignal = capacityResolution.aborted
          ? { outcomeCode: "CANCELLED", retryRecommended: false }
          : capacityResolution.timedOut
            ? { outcomeCode: "TIMEOUT", retryRecommended: true }
            : { outcomeCode: "RETRYABLE_FAILURE", retryRecommended: true };
        return {
          content: [
            {
              type: "text" as const,
              text: buildRuntimeLimitError("agent_team_run_parallel", capacityResolution.reasons, {
                waitedMs: capacityResolution.waitedMs,
                timedOut: capacityResolution.timedOut,
              }),
            },
          ],
          details: {
            error: "runtime_limit_reached",
            reasons: capacityResolution.reasons,
            projectedRequests: capacityResolution.projectedRequests,
            projectedLlm: capacityResolution.projectedLlm,
            waitedMs: capacityResolution.waitedMs,
            timedOut: capacityResolution.timedOut,
            aborted: capacityResolution.aborted,
            capacityAttempts: capacityResolution.attempts,
            configuredTeamParallelLimit,
            configuredMemberParallelLimit,
            baselineTeamParallelism,
            baselineMemberParallelism,
            requestedTeamParallelism: capacityResolution.requestedTeamParallelism,
            requestedMemberParallelism: capacityResolution.requestedMemberParallelism,
            appliedTeamParallelism: capacityResolution.appliedTeamParallelism,
            appliedMemberParallelism: capacityResolution.appliedMemberParallelism,
            parallelismReduced: capacityResolution.reduced,
            adaptivePenaltyBefore,
            adaptivePenaltyAfter: adaptivePenalty.get(),
            requestedTeamCount: enabledTeams.length,
            failedMemberRetryRounds,
            queuedAhead: queueWait.queuedAhead,
            queuePosition: queueWait.queuePosition,
            queueWaitedMs: queueWait.waitedMs,
            traceId: queueWait.orchestrationId,
            outcomeCode: capacityOutcome.outcomeCode,
            retryRecommended: capacityOutcome.retryRecommended,
          },
        };
      }
      if (!capacityResolution.reservation) {
        adaptivePenalty.raise("capacity");
        return {
          content: [
            {
              type: "text" as const,
              text: "agent_team_run_parallel blocked: capacity reservation missing.",
            },
          ],
          details: {
            error: "runtime_reservation_missing",
            requestedTeamParallelism: capacityResolution.requestedTeamParallelism,
            requestedMemberParallelism: capacityResolution.requestedMemberParallelism,
            appliedTeamParallelism: capacityResolution.appliedTeamParallelism,
            appliedMemberParallelism: capacityResolution.appliedMemberParallelism,
            queuedAhead: queueWait.queuedAhead,
            queuePosition: queueWait.queuePosition,
            queueWaitedMs: queueWait.waitedMs,
            traceId: queueWait.orchestrationId,
            outcomeCode: "RETRYABLE_FAILURE" as RunOutcomeCode,
            retryRecommended: true,
          },
        };
      }
      const appliedTeamParallelism = capacityResolution.appliedTeamParallelism;
      const appliedMemberParallelism = capacityResolution.appliedMemberParallelism;
      const capacityReservation = capacityResolution.reservation;
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
          `runtime capacity granted: projected_requests=${capacityResolution.projectedRequests} projected_llm=${capacityResolution.projectedLlm}`,
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

        // Debug logging for cost estimation
        if (process.env.PI_DEBUG_COST_ESTIMATION === "1") {
          console.log(
            `[CostEstimation] agent_team_run_parallel: ` +
            `base=(${baseEstimate.estimatedDurationMs}ms, ${baseEstimate.estimatedTokens}t) ` +
            `adjusted=(${adjustedDurationMs}ms, ${adjustedTokens}t) ` +
            `teams=${enabledTeams.length} totalMembers=${totalMembers} rounds=${communicationRounds} method=${baseEstimate.method}`
          );
        }

        try {
        // 予約は admission 制御のみ。開始後は active カウンタで実行中負荷を表現する。
        capacityReservation.consume();
        const results = await runWithConcurrencyLimit(
          enabledTeams,
          appliedTeamParallelism,
          async (team) => {
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
                const { runRecord, memberResults, communicationAudit } = await runTeamTask({
                  team,
                  task: params.task,
                  strategy,
                  memberParallelLimit: teamMemberParallelLimit,
                  communicationRounds,
                  failedMemberRetryRounds,
                  communicationLinks,
                  sharedContext: params.sharedContext,
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
              };
            } catch (error) {
              const runId = createRunId();
              const startedAt = new Date().toISOString();
              const outputFile = join(ensurePaths(ctx.cwd).runsDir, `${runId}.json`);
              const message = toErrorMessage(error);
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
          },
          { signal },
        );

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

        const lines: string[] = [];
        lines.push(`Parallel agent team run completed (${results.length} teams, ${totalTeammates} teammates).`);
        lines.push(
          `Applied limits: teams=${appliedTeamParallelism} concurrent (requested=${effectiveTeamParallelism}, baseline=${baselineTeamParallelism}), teammates/team=${appliedMemberParallelism} (requested=${effectiveMemberParallelism}, baseline=${baselineMemberParallelism}), adaptive_penalty=${adaptivePenaltyBefore}->${adaptivePenaltyAfter}.`,
        );
        if (capacityResolution.reduced) {
          lines.push(
            `Parallelism was reduced to fit current runtime capacity (waited=${capacityResolution.waitedMs}ms).`,
          );
        }
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
            parallelismReduced: capacityResolution.reduced,
            capacityWaitedMs: capacityResolution.waitedMs,
            adaptivePenaltyBefore,
            adaptivePenaltyAfter,
            pressureFailureCount: pressureFailures,
            queuedAhead: queueWait.queuedAhead,
            queuePosition: queueWait.queuePosition,
            queueWaitedMs: queueWait.waitedMs,
            traceId: queueWait.orchestrationId,
            teamTaskIds: results.map((result, index) => ({
              taskId: buildTraceTaskId(queueWait.orchestrationId, result.team.id, index),
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
                taskId: buildTraceTaskId(queueWait.orchestrationId, memberResult.memberId, index),
                delegateId: memberResult.memberId,
                status: memberResult.status,
              })),
              communicationAudit: result.communicationAudit,
            })),
            failedTeamIds: parallelOutcome.failedTeamIds,
            partialTeamIds: parallelOutcome.partialTeamIds,
            failedMemberIdsByTeam: parallelOutcome.failedMemberIdsByTeam,
            outcomeCode: parallelOutcome.outcomeCode,
            retryRecommended: parallelOutcome.retryRecommended,
          },
        };
        } finally {
          liveMonitor?.close();
          await liveMonitor?.wait();
        }
      } finally {
        stopReservationHeartbeat();
        capacityReservation.release();
      }
      } finally {
        queueLease.release();
        refreshRuntimeStatus(ctx);
      }
    },
  });

  // ランタイム状態
  pi.registerTool({
    name: "agent_team_status",
    label: "Agent Team Status",
    description: "Show active team run count and active teammate agent count.",
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
    description: "Show recent agent team run history.",
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
