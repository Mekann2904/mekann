// File: .pi/extensions/agent-teams.ts
// Description: Adds multi-member agent team orchestration tools for pi.
// Why: Enables proactive parallel collaboration across specialized teammate roles.
// Related: .pi/extensions/subagents.ts, .pi/extensions/plan.ts, README.md

import { getMarkdownTheme, parseFrontmatter, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { Key, Markdown, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
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

// Import shared plan mode utilities
import {
	isPlanModeActive,
	PLAN_MODE_WARNING,
} from "../lib/plan-mode-shared";
import {
  createAdaptivePenaltyController,
} from "../lib/adaptive-penalty.js";
import {
  getRateLimitGateSnapshot,
  isRetryableError,
  retryWithBackoff,
  type RetryWithBackoffOverrides,
} from "../lib/retry-with-backoff";
import { runWithConcurrencyLimit } from "../lib/concurrency";
import {
  getTeamMemberExecutionRules,
} from "../lib/execution-rules";
import {
  buildRuntimeLimitError,
  buildRuntimeQueueWaitError,
  startReservationHeartbeat,
  refreshRuntimeStatus as sharedRefreshRuntimeStatus,
} from "./shared/runtime-helpers";
import {
  runPiPrintMode as sharedRunPiPrintMode,
  type PrintExecutorOptions,
} from "./shared/pi-print-executor";
import {
  postTeamVerificationHook,
  formatVerificationResult,
  type VerificationHookResult,
} from "./shared/verification-hooks.js";
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
  hasIntentOnlyContent,
  validateTeamMemberOutput,
  trimForError,
  buildRateLimitKey,
  buildTraceTaskId,
  createRetrySchema,
  toConcurrencyLimit,
  resolveEffectiveTimeoutMs,
} from "../lib";
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

// Re-export judge types for external use
export type { TeamUncertaintyProxy } from "./agent-teams/judge";

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

// Team frontmatter types for markdown parsing
interface TeamFrontmatter {
  id: string;
  name: string;
  description: string;
  enabled: "enabled" | "disabled";
  strategy?: "parallel" | "sequential";
  skills?: string[];
  members: TeamMemberFrontmatter[];
}

interface TeamMemberFrontmatter {
  id: string;
  role: string;
  description: string;
  enabled?: boolean;
  provider?: string;
  model?: string;
  skills?: string[];
}

interface ParsedTeamMarkdown {
  frontmatter: TeamFrontmatter;
  content: string;
  filePath: string;
}

interface PrintCommandResult {
  output: string;
  latencyMs: number;
}

const LIVE_PREVIEW_LINE_LIMIT = 120;
const LIVE_LIST_WINDOW_SIZE = 22;
// イベント配列サイズ（環境変数で上書き可能、デフォルトは120に削減）
const LIVE_EVENT_TAIL_LIMIT = Math.max(60, Number(process.env.PI_LIVE_EVENT_TAIL_LIMIT) || 120);
const LIVE_EVENT_INLINE_LINE_LIMIT = 8;
const LIVE_EVENT_DETAIL_LINE_LIMIT = 28;
// Communication constants moved to ./agent-teams/communication.ts

/**
 * Extract confidence value from team member output.
 * Parses CONFIDENCE field, defaults to 0.5 if not found or invalid.
 */
function extractConfidenceFromOutput(output: string): number {
  const match = output.match(/CONFIDENCE:\s*([0-9.]+)/i);
  if (match) {
    const parsed = parseFloat(match[1]);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
      return parsed;
    }
  }
  return 0.5;
}

/**
 * Run verification for a completed team task.
 * Returns the verification result or undefined if verification is disabled/failed.
 */
async function runTeamVerification(
  aggregatedOutput: string,
  confidence: number,
  context: {
    teamId: string;
    task: string;
    memberOutputs: Array<{ agentId: string; output: string }>;
  },
  options: {
    provider?: string;
    model?: string;
    signal?: AbortSignal;
  }
): Promise<VerificationHookResult | undefined> {
  const verificationTimeoutMs = 60000; // Shorter timeout for focused verification task

  try {
    return await postTeamVerificationHook(
      aggregatedOutput,
      confidence,
      context,
      async (verificationAgentId, prompt) => {
        const result = await sharedRunPiPrintMode({
          provider: options.provider,
          model: options.model,
          prompt,
          timeoutMs: verificationTimeoutMs,
          signal: options.signal,
          entityLabel: "verification-agent",
        });
        return result.output;
      }
    );
  } catch (error) {
    // Verification failures should not break the main flow
    console.warn(`[Verification] Error during team verification: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

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

type TeamLiveStatus = LiveStatus;
type TeamLivePhase = "queued" | "initial" | "communication" | "judge" | "finished";
type LiveStreamView = "stdout" | "stderr";
type LiveViewMode = "list" | "detail" | "discussion";

interface TeamLiveItem {
  key: string;
  label: string;
  partners: string[];
  status: TeamLiveStatus;
  phase: TeamLivePhase;
  phaseRound?: number;
  startedAtMs?: number;
  finishedAtMs?: number;
  lastChunkAtMs?: number;
  lastEventAtMs?: number;
  lastEvent?: string;
  summary?: string;
  error?: string;
  stdoutTail: string;
  stderrTail: string;
  stdoutBytes: number;
  stderrBytes: number;
  stdoutNewlineCount: number;
  stderrNewlineCount: number;
  stdoutEndsWithNewline: boolean;
  stderrEndsWithNewline: boolean;
  events: string[];
  discussionTail: string;
  discussionBytes: number;
  discussionNewlineCount: number;
  discussionEndsWithNewline: boolean;
}

// ISP-compliant interfaces: split by responsibility
// Clients can depend only on the interfaces they actually use.

/**
 * Lifecycle operations for marking team member execution states.
 * Used by code that only needs to track start/finish transitions.
 */
interface TeamMonitorLifecycle {
  markStarted: (itemKey: string) => void;
  markFinished: (
    itemKey: string,
    status: "completed" | "failed",
    summary: string,
    error?: string,
  ) => void;
}

/**
 * Phase tracking operations for team member execution phases.
 * Used by code that only needs to manage phase transitions.
 */
interface TeamMonitorPhase {
  markPhase: (itemKey: string, phase: TeamLivePhase, round?: number) => void;
}

/**
 * Event logging operations for tracking execution events.
 * Used by code that only needs to record events.
 */
interface TeamMonitorEvents {
  appendEvent: (itemKey: string, event: string) => void;
  appendBroadcastEvent: (event: string) => void;
}

/**
 * Stream output operations for appending stdout/stderr chunks.
 * Used by code that only needs to handle output streaming.
 */
interface TeamMonitorStream {
  appendChunk: (itemKey: string, stream: LiveStreamView, chunk: string) => void;
}

/**
 * Discussion tracking operations for multi-agent communication.
 * Used by code that only needs to track discussion content.
 */
interface TeamMonitorDiscussion {
  appendDiscussion: (itemKey: string, discussion: string) => void;
}

/**
 * Resource cleanup and termination operations.
 * Used by code that only needs to manage monitor lifecycle.
 */
interface TeamMonitorResource {
  close: () => void;
  wait: () => Promise<void>;
}

/**
 * Full monitor controller combining all capabilities.
 * Extends partial interfaces to maintain backward compatibility.
 * Clients should use narrower interfaces when possible.
 */
interface AgentTeamLiveMonitorController
  extends TeamMonitorLifecycle,
    TeamMonitorPhase,
    TeamMonitorEvents,
    TeamMonitorStream,
    TeamMonitorDiscussion,
    TeamMonitorResource {}

function formatLivePhase(phase: TeamLivePhase, round?: number): string {
  if (phase === "communication") return round ? `comm#${round}` : "comm";
  if (phase === "initial") return "initial";
  if (phase === "judge") return "judge";
  if (phase === "finished") return "done";
  return "queued";
}

function pushLiveEvent(item: TeamLiveItem, rawEvent: string): void {
  const event = normalizeForSingleLine(rawEvent, 220);
  if (!event || event === "-") return;
  const now = Date.now();
  const line = `[${formatClockTime(now)}] ${event}`;
  item.events.push(line);
  if (item.events.length > LIVE_EVENT_TAIL_LIMIT) {
    item.events.splice(0, item.events.length - LIVE_EVENT_TAIL_LIMIT);
  }
  item.lastEvent = event;
  item.lastEventAtMs = now;
}

function toEventTailLines(events: string[], limit: number): string[] {
  if (events.length <= limit) return [...events];
  return events.slice(events.length - limit);
}

function toTeamLiveItemKey(teamId: string, memberId: string): string {
  return `${teamId}/${memberId}`;
}

function renderAgentTeamLiveView(input: {
  title: string;
  items: TeamLiveItem[];
  globalEvents: string[];
  cursor: number;
  mode: LiveViewMode;
  stream: LiveStreamView;
  width: number;
  height?: number;
  theme: any;
}): string[] {
  const lines: string[] = [];
  const add = (line = "") => lines.push(truncateToWidth(line, input.width));
  const theme = input.theme;
  const items = input.items;
  const running = items.filter((item) => item.status === "running").length;
  const completed = items.filter((item) => item.status === "completed").length;
  const failed = items.filter((item) => item.status === "failed").length;

  add(theme.bold(theme.fg("accent", `${input.title} [${input.mode}]`)));
  add(theme.fg("dim", `running ${running}/${items.length} | completed ${completed} | failed ${failed} | updated ${formatClockTime(Date.now())}`));
  const globalEventLimit = input.mode === "detail" ? 8 : 4;
  const recentGlobalEvents = toEventTailLines(input.globalEvents, globalEventLimit);
  if (recentGlobalEvents.length > 0) {
    add(theme.fg("dim", `team events (${input.globalEvents.length})`));
    for (const eventLine of recentGlobalEvents) {
      add(theme.fg("dim", `  ${eventLine}`));
    }
    add("");
  }

  if (items.length === 0) {
    add(theme.fg("dim", "[q] close"));
    add("");
    add(theme.fg("dim", "no running team members"));
    return finalizeLiveLines(lines, input.height);
  }

  const clampedCursor = Math.max(0, Math.min(items.length - 1, input.cursor));
  const selected = items[clampedCursor];
  const selectedOutLines = estimateLineCount(
    selected.stdoutBytes,
    selected.stdoutNewlineCount,
    selected.stdoutEndsWithNewline,
  );
  const selectedErrLines = estimateLineCount(
    selected.stderrBytes,
    selected.stderrNewlineCount,
    selected.stderrEndsWithNewline,
  );

  if (input.mode === "list") {
    add(theme.fg("dim", "[j/k] move  [up/down] move  [g/G] jump  [enter] detail  [d] discussion  [tab] stream  [q] close"));
    add("");
    const range = computeLiveWindow(clampedCursor, items.length, LIVE_LIST_WINDOW_SIZE);
    if (range.start > 0) {
      add(theme.fg("dim", `... ${range.start} above ...`));
    }

    for (let index = range.start; index < range.end; index += 1) {
      const item = items[index];
      const isSelected = index === clampedCursor;
      const prefix = isSelected ? ">" : " ";
      const glyph = getLiveStatusGlyph(item.status);
      const statusText = item.status.padEnd(9, " ");
      const base = `${prefix} [${glyph}] ${item.label}`;
      const outLines = estimateLineCount(item.stdoutBytes, item.stdoutNewlineCount, item.stdoutEndsWithNewline);
      const errLines = estimateLineCount(item.stderrBytes, item.stderrNewlineCount, item.stderrEndsWithNewline);
      const partnerPreview =
        item.partners.length > 0
          ? item.partners
              .map((partner) => partner.split("/").pop() || partner)
              .slice(0, 2)
              .join(",")
          : "-";
      const partnerOverflow = item.partners.length > 2 ? `+${item.partners.length - 2}` : "";
      const phaseText = formatLivePhase(item.phase, item.phaseRound);
      const eventText = normalizeForSingleLine(item.lastEvent || "-", 42);
      const meta = `${statusText} ${formatDurationMs(item)} phase:${phaseText} out:${formatBytes(item.stdoutBytes)}/${outLines}l err:${formatBytes(item.stderrBytes)}/${errLines}l link:${partnerPreview}${partnerOverflow} evt:${eventText}`;
      add(`${isSelected ? theme.fg("accent", base) : base} ${theme.fg("dim", meta)}`);
    }

    if (range.end < items.length) {
      add(theme.fg("dim", `... ${items.length - range.end} below ...`));
    }

    add("");
    add(
      theme.fg(
        "dim",
        `selected ${clampedCursor + 1}/${items.length}: ${selected.label} | status:${selected.status} | phase:${formatLivePhase(selected.phase, selected.phaseRound)} | elapsed:${formatDurationMs(selected)} | last_event:${formatClockTime(selected.lastEventAtMs)}`,
      ),
    );

    const inlineMetadataLines = 8;
    const inlineMinEventLines = 2;
    const inlineMinPreviewLines = 3;
    const height = input.height ?? 0;
    const remaining = height > 0 ? height - lines.length : 0;
    const canShowInline =
      height > 0 && remaining >= inlineMetadataLines + inlineMinEventLines + inlineMinPreviewLines;

    if (!canShowInline) {
      add(theme.fg("dim", "press [enter] to open detailed output view"));
      return finalizeLiveLines(lines, input.height);
    }

    const selectedTail = input.stream === "stdout" ? selected.stdoutTail : selected.stderrTail;
    // Keep inline trace + output within terminal height.
    const availableAfterMetadata = Math.max(1, height - lines.length - inlineMetadataLines);
    let inlineEventLimit = Math.max(
      inlineMinEventLines,
      Math.min(LIVE_EVENT_INLINE_LINE_LIMIT, Math.floor(availableAfterMetadata / 3)),
    );
    let inlinePreviewLimit = availableAfterMetadata - inlineEventLimit;
    if (inlinePreviewLimit < inlineMinPreviewLines) {
      const needed = inlineMinPreviewLines - inlinePreviewLimit;
      inlineEventLimit = Math.max(inlineMinEventLines, inlineEventLimit - needed);
      inlinePreviewLimit = availableAfterMetadata - inlineEventLimit;
    }
    inlinePreviewLimit = Math.max(
      inlineMinPreviewLines,
      Math.min(LIVE_PREVIEW_LINE_LIMIT, inlinePreviewLimit),
    );
    const inlinePreview = renderPreviewWithMarkdown(selectedTail, input.width, inlinePreviewLimit);
    const inlineEventLines = toEventTailLines(selected.events, inlineEventLimit);
    const summaryText = selected.summary || "-";
    const errorText = selected.error || "-";
    const linksText = selected.partners.length > 0 ? selected.partners.join(", ") : "-";
    add(theme.fg("dim", `inline detail (${input.stream}) | [tab] switch stream`));
    add(
      theme.fg(
        "dim",
        `phase: ${formatLivePhase(selected.phase, selected.phaseRound)} | last_event: ${formatClockTime(selected.lastEventAtMs)}`,
      ),
    );
    add(theme.fg("dim", `links: ${linksText}`));
    add(theme.fg("dim", `summary: ${summaryText}`));
    add(theme.fg(selected.error ? "error" : "dim", `error: ${errorText}`));
    add(theme.fg("dim", `render mode: ${inlinePreview.renderedAsMarkdown ? "markdown" : "raw"}`));
    add(theme.fg("dim", `trace tail (${inlineEventLines.length}/${selected.events.length})`));
    if (inlineEventLines.length === 0) {
      add(theme.fg("dim", "(no events yet)"));
    } else {
      for (const eventLine of inlineEventLines) {
        add(theme.fg("dim", eventLine));
      }
    }
    add(theme.fg("dim", `output tail (${input.stream})`));
    if (inlinePreview.lines.length === 0) {
      add(theme.fg("dim", "(no output yet)"));
    } else {
      for (const line of inlinePreview.lines) {
        add(line);
      }
    }
    return finalizeLiveLines(lines, input.height);
  }

  add(theme.fg("dim", "[j/k] move target  [up/down] move  [g/G] jump  [tab] stdout/stderr  [d] discussion  [b|esc] back  [q] close"));
  add("");
  add(theme.bold(theme.fg("accent", `selected ${clampedCursor + 1}/${items.length}: ${selected.label}`)));
  add(
    theme.fg(
      "dim",
      `status:${selected.status} | elapsed:${formatDurationMs(selected)} | started:${formatClockTime(selected.startedAtMs)} | last:${formatClockTime(selected.lastChunkAtMs)} | finished:${formatClockTime(selected.finishedAtMs)}`,
    ),
  );
  add(
    theme.fg(
      "dim",
      `phase:${formatLivePhase(selected.phase, selected.phaseRound)} | last_event:${formatClockTime(selected.lastEventAtMs)} | last_message:${normalizeForSingleLine(selected.lastEvent || "-", 72)}`,
    ),
  );
  add(theme.fg("dim", `stdout ${formatBytes(selected.stdoutBytes)} (${selectedOutLines} lines)`));
  add(theme.fg("dim", `stderr ${formatBytes(selected.stderrBytes)} (${selectedErrLines} lines)`));
  add(theme.fg("dim", `links: ${selected.partners.length > 0 ? selected.partners.join(", ") : "-"}`));
  if (selected.summary) {
    add(theme.fg("dim", `summary: ${selected.summary}`));
  }
  if (selected.error) {
    add(theme.fg(selected.status === "failed" ? "error" : "dim", `error: ${selected.error}`));
  }
  add("");
  const detailHeight = input.height && input.height > 0 ? input.height : undefined;
  let detailEventLimit = Math.min(LIVE_EVENT_DETAIL_LINE_LIMIT, Math.max(1, selected.events.length));
  if (detailHeight) {
    // Reserve rows for output tail so trace expansion does not hide stream output.
    const reservedForOutputSection = 11;
    const availableForEvents = Math.max(1, detailHeight - lines.length - reservedForOutputSection);
    detailEventLimit = Math.max(1, Math.min(detailEventLimit, availableForEvents));
  }
  const detailEventLines = toEventTailLines(selected.events, detailEventLimit);
  add(
    theme.bold(
      theme.fg(
        "accent",
        `[${selected.label}] execution trace (last ${detailEventLines.length} entries | total ${selected.events.length})`,
      ),
    ),
  );
  if (detailEventLines.length === 0) {
    add(theme.fg("dim", "(no events yet)"));
  } else {
    for (const eventLine of detailEventLines) {
      add(theme.fg("dim", eventLine));
    }
    if (selected.events.length > detailEventLines.length) {
      add(theme.fg("dim", `... ${selected.events.length - detailEventLines.length} older events ...`));
    }
  }
  add("");
  const selectedTail = input.stream === "stdout" ? selected.stdoutTail : selected.stderrTail;
  const selectedStreamBytes = input.stream === "stdout" ? selected.stdoutBytes : selected.stderrBytes;
  const selectedStreamLines = input.stream === "stdout" ? selectedOutLines : selectedErrLines;
  add(
    theme.bold(
      theme.fg(
        "accent",
        `[${selected.label}] ${input.stream} tail (last ${LIVE_PREVIEW_LINE_LIMIT} lines | total ${formatBytes(
          selectedStreamBytes,
        )}, ${selectedStreamLines} lines)`,
      ),
    ),
  );
  const detailPreviewLimit =
    input.height && input.height > 0
      ? Math.max(1, Math.min(LIVE_PREVIEW_LINE_LIMIT, input.height - lines.length - 1))
      : LIVE_PREVIEW_LINE_LIMIT;
  const preview = renderPreviewWithMarkdown(selectedTail, input.width, detailPreviewLimit);
  add(theme.fg("dim", `render mode: ${preview.renderedAsMarkdown ? "markdown" : "raw"}`));
  const previewLines = preview.lines;
  if (previewLines.length === 0) {
    add(theme.fg("dim", "(no output yet)"));
  } else {
    for (const line of previewLines) {
      add(line);
    }
  }

  if (input.mode === "discussion") {
    add(theme.fg("dim", "[j/k] move target  [up/down] move  [g/G] jump  [b|esc] back  [q] close"));
    add("");
    add(theme.bold(theme.fg("accent", `DISCUSSION VIEW (${clampedCursor + 1}/${items.length})`)));
    add(
      theme.fg(
        "dim",
        `status:${selected.status} | phase:${formatLivePhase(selected.phase, selected.phaseRound)} | elapsed:${formatDurationMs(selected)}`,
      ),
    );
    add("");

    // Discussion tail display for selected member
    add(
      theme.bold(
        theme.fg(
          "accent",
          `[${selected.label}] DISCUSSION section`,
        ),
      ),
    );

    const discussionLines = toTailLines(selected.discussionTail || "", LIVE_PREVIEW_LINE_LIMIT);
    if (discussionLines.length === 0) {
      add(theme.fg("dim", "(no discussion content yet)"));
    } else {
      for (const line of discussionLines) {
        add(line);
      }
    }
    add("");

    // Show discussion summary for all members
    add(theme.bold(theme.fg("accent", "Team Discussion Summary")));
    for (const item of items) {
      const hasDiscussion = (item.discussionTail || "").trim().length > 0;
      const prefix = item === selected ? "> " : "  ";
      const statusMarker = hasDiscussion ? "+" : "-";
      add(
        theme.fg(
          item === selected ? "accent" : "dim",
          `${prefix}[${statusMarker}] ${item.label} (${formatBytes(item.discussionBytes)}B, ${item.discussionNewlineCount} lines)`,
        ),
      );
    }

    return finalizeLiveLines(lines, input.height);
  }

  return finalizeLiveLines(lines, input.height);
}

function createAgentTeamLiveMonitor(
  ctx: any,
  input: {
    title: string;
    items: Array<{ key: string; label: string; partners?: string[] }>;
  },
): AgentTeamLiveMonitorController | undefined {
  if (!ctx?.hasUI || !ctx?.ui?.custom) {
    return undefined;
  }

  const items: TeamLiveItem[] = input.items.map((item) => ({
    key: item.key,
    label: item.label,
    partners: item.partners ?? [],
    status: "pending",
    phase: "queued",
    stdoutTail: "",
    stderrTail: "",
    stdoutBytes: 0,
    stderrBytes: 0,
    stdoutNewlineCount: 0,
    stderrNewlineCount: 0,
    stdoutEndsWithNewline: false,
    stderrEndsWithNewline: false,
    events: [],
    discussionTail: "",
    discussionBytes: 0,
    discussionNewlineCount: 0,
    discussionEndsWithNewline: false,
  }));
  const byKey = new Map(items.map((item) => [item.key, item]));
  const globalEvents: string[] = [];
  let cursor = 0;
  let mode: LiveViewMode = "list";
  let stream: LiveStreamView = "stdout";
  let requestRender: (() => void) | undefined;
  let doneUi: (() => void) | undefined;
  let closed = false;
  let renderTimer: NodeJS.Timeout | undefined;

  const clearRenderTimer = () => {
    if (renderTimer) {
      clearTimeout(renderTimer);
      renderTimer = undefined;
    }
  };

  const queueRender = () => {
    if (closed || !requestRender) return;
    if (renderTimer) return;
    renderTimer = setTimeout(() => {
      renderTimer = undefined;
      if (!closed) {
        requestRender?.();
      }
    }, 60);
  };

  const close = () => {
    if (closed) return;
    closed = true;
    clearRenderTimer();
    doneUi?.();
  };

  const uiPromise = ctx.ui
    .custom<void>((tui: any, theme: any, _keybindings: any, done: () => void) => {
      doneUi = done;
      requestRender = () => {
        if (!closed) {
          tui.requestRender();
        }
      };

      return {
        render: (width: number) =>
        renderAgentTeamLiveView({
            title: input.title,
            items,
            globalEvents,
            cursor,
            mode,
            stream,
            width,
            height: tui.terminal.rows,
            theme,
          }),
        invalidate: () => {},
        handleInput: (rawInput: string) => {
          if (matchesKey(rawInput, "q")) {
            close();
            return;
          }

          if (matchesKey(rawInput, Key.escape)) {
            if (mode === "detail") {
              mode = "list";
              queueRender();
              return;
            }
            close();
            return;
          }

          if (rawInput === "j" || matchesKey(rawInput, Key.down)) {
            cursor = Math.min(items.length - 1, cursor + 1);
            queueRender();
            return;
          }

          if (rawInput === "k" || matchesKey(rawInput, Key.up)) {
            cursor = Math.max(0, cursor - 1);
            queueRender();
            return;
          }

          if (rawInput === "g") {
            cursor = 0;
            queueRender();
            return;
          }

          if (rawInput === "G") {
            cursor = Math.max(0, items.length - 1);
            queueRender();
            return;
          }

          if (mode === "list" && isEnterInput(rawInput)) {
            mode = "detail";
            queueRender();
            return;
          }

          if (mode === "detail" && (rawInput === "b" || rawInput === "B")) {
            mode = "list";
            queueRender();
            return;
          }

          if ((mode === "list" || mode === "detail") && (rawInput === "d" || rawInput === "D")) {
            mode = "discussion";
            queueRender();
            return;
          }

          if (mode === "discussion" && (rawInput === "b" || rawInput === "B")) {
            mode = "list";
            queueRender();
            return;
          }

          if (rawInput === "\t" || rawInput === "tab") {
            stream = stream === "stdout" ? "stderr" : "stdout";
            queueRender();
            return;
          }
        },
      };
    }, {
      overlay: true,
      overlayOptions: () => ({
        width: "100%",
        maxHeight: "100%",
        row: 0,
        col: 0,
        margin: 0,
      }),
    })
    .catch(() => undefined)
    .finally(() => {
      closed = true;
      clearRenderTimer();
    });

  return {
    markStarted: (itemKey: string) => {
      const item = byKey.get(itemKey);
      if (!item || closed) return;
      item.status = "running";
      if (item.phase === "queued") {
        item.phase = "initial";
      }
      item.startedAtMs = Date.now();
      pushLiveEvent(item, "member process started");
      queueRender();
    },
    markPhase: (itemKey: string, phase: TeamLivePhase, round?: number) => {
      const item = byKey.get(itemKey);
      if (!item || closed) return;
      item.phase = phase;
      item.phaseRound = round;
      pushLiveEvent(item, `phase=${formatLivePhase(phase, round)}`);
      queueRender();
    },
    appendEvent: (itemKey: string, event: string) => {
      const item = byKey.get(itemKey);
      if (!item || closed) return;
      pushLiveEvent(item, event);
      queueRender();
    },
    appendBroadcastEvent: (event: string) => {
      if (closed) return;
      const now = Date.now();
      globalEvents.push(`[${formatClockTime(now)}] ${normalizeForSingleLine(event, 220)}`);
      if (globalEvents.length > LIVE_EVENT_TAIL_LIMIT) {
        globalEvents.splice(0, globalEvents.length - LIVE_EVENT_TAIL_LIMIT);
      }
      for (const item of items) {
        pushLiveEvent(item, event);
      }
      queueRender();
    },
    appendChunk: (itemKey: string, targetStream: LiveStreamView, chunk: string) => {
      const item = byKey.get(itemKey);
      if (!item || closed) return;
      if (targetStream === "stdout") {
        item.stdoutTail = appendTail(item.stdoutTail, chunk);
        item.stdoutBytes += Buffer.byteLength(chunk, "utf-8");
        item.stdoutNewlineCount += countOccurrences(chunk, "\n");
        item.stdoutEndsWithNewline = chunk.endsWith("\n");
      } else {
        item.stderrTail = appendTail(item.stderrTail, chunk);
        item.stderrBytes += Buffer.byteLength(chunk, "utf-8");
        item.stderrNewlineCount += countOccurrences(chunk, "\n");
        item.stderrEndsWithNewline = chunk.endsWith("\n");
      }
      item.lastChunkAtMs = Date.now();
      queueRender();
    },
    markFinished: (itemKey: string, status: "completed" | "failed", summary: string, error?: string) => {
      const item = byKey.get(itemKey);
      if (!item || closed) return;
      item.status = status;
      item.phase = "finished";
      item.summary = summary;
      item.error = error;
      item.finishedAtMs = Date.now();
      pushLiveEvent(item, `member ${status}: ${summary}${error ? ` | error=${normalizeForSingleLine(error, 120)}` : ""}`);
      queueRender();
    },
    appendDiscussion: (itemKey: string, discussion: string) => {
      const item = byKey.get(itemKey);
      if (!item || closed) return;
      item.discussionTail = appendTail(item.discussionTail, discussion);
      item.discussionBytes += Buffer.byteLength(discussion, "utf-8");
      item.discussionNewlineCount += countOccurrences(discussion, "\n");
      item.discussionEndsWithNewline = discussion.endsWith("\n");
      queueRender();
    },
    close,
    wait: async () => {
      await uiPromise;
    },
  };
}

function isRetryableTeamMemberError(error: unknown, statusCode?: number): boolean {
  if (isRetryableError(error, statusCode)) {
    return true;
  }

  const message = toErrorMessage(error).toLowerCase();
  return (
    message.includes("agent team member returned empty output")
  );
}



function resolveTeamFailureOutcome(error: unknown): RunOutcomeSignal {
  if (isCancelledErrorMessage(error)) {
    return { outcomeCode: "CANCELLED", retryRecommended: false };
  }
  if (isTimeoutErrorMessage(error)) {
    return { outcomeCode: "TIMEOUT", retryRecommended: true };
  }

  const pressure = classifyPressureError(error);
  if (pressure !== "other") {
    return { outcomeCode: "RETRYABLE_FAILURE", retryRecommended: true };
  }

  const statusCode = extractStatusCodeFromMessage(error);
  if (isRetryableTeamMemberError(error, statusCode)) {
    return { outcomeCode: "RETRYABLE_FAILURE", retryRecommended: true };
  }

  return { outcomeCode: "NONRETRYABLE_FAILURE", retryRecommended: false };
}

function resolveTeamMemberAggregateOutcome(memberResults: TeamMemberResult[]): RunOutcomeSignal & {
  failedMemberIds: string[];
} {
  const failed = memberResults.filter((result) => result.status === "failed");
  if (failed.length === 0) {
    return {
      outcomeCode: "SUCCESS",
      retryRecommended: false,
      failedMemberIds: [],
    };
  }

  const failedMemberIds = failed.map((result) => result.memberId);
  const retryableFailureCount = failed.filter((result) => {
    const failure = resolveTeamFailureOutcome(result.error || result.summary);
    return failure.retryRecommended;
  }).length;
  const hasAnySuccess = failed.length < memberResults.length;

  if (hasAnySuccess) {
    return {
      outcomeCode: "PARTIAL_SUCCESS",
      retryRecommended: retryableFailureCount > 0,
      failedMemberIds,
    };
  }

  return retryableFailureCount > 0
    ? {
        outcomeCode: "RETRYABLE_FAILURE",
        retryRecommended: true,
        failedMemberIds,
      }
    : {
        outcomeCode: "NONRETRYABLE_FAILURE",
        retryRecommended: false,
        failedMemberIds,
      };
}

function resolveTeamParallelRunOutcome(
  results: Array<{
    team: TeamDefinition;
    runRecord: TeamRunRecord;
    memberResults: TeamMemberResult[];
  }>,
): RunOutcomeSignal & {
  failedTeamIds: string[];
  partialTeamIds: string[];
  failedMemberIdsByTeam: Record<string, string[]>;
} {
  const failedTeamIds: string[] = [];
  const partialTeamIds: string[] = [];
  const failedMemberIdsByTeam: Record<string, string[]> = {};
  let retryableFailureCount = 0;
  let hasCompletedTeam = false;

  for (const result of results) {
    const memberOutcome = resolveTeamMemberAggregateOutcome(result.memberResults);
    if (memberOutcome.failedMemberIds.length > 0) {
      failedMemberIdsByTeam[result.team.id] = memberOutcome.failedMemberIds;
    }

    if (result.runRecord.status === "completed") {
      hasCompletedTeam = true;
      if (memberOutcome.outcomeCode === "PARTIAL_SUCCESS") {
        partialTeamIds.push(result.team.id);
        if (memberOutcome.retryRecommended) {
          retryableFailureCount += 1;
        }
      }
      continue;
    }

    failedTeamIds.push(result.team.id);
    const failedTeamOutcome = resolveTeamFailureOutcome(result.runRecord.summary || "team run failed");
    if (failedTeamOutcome.retryRecommended || memberOutcome.retryRecommended) {
      retryableFailureCount += 1;
    }
  }

  const hasAnyFailure = failedTeamIds.length > 0 || partialTeamIds.length > 0;
  if (!hasAnyFailure) {
    return {
      outcomeCode: "SUCCESS",
      retryRecommended: false,
      failedTeamIds,
      partialTeamIds,
      failedMemberIdsByTeam,
    };
  }

  if (hasCompletedTeam) {
    return {
      outcomeCode: "PARTIAL_SUCCESS",
      retryRecommended: retryableFailureCount > 0,
      failedTeamIds,
      partialTeamIds,
      failedMemberIdsByTeam,
    };
  }

  return retryableFailureCount > 0
    ? {
        outcomeCode: "RETRYABLE_FAILURE",
        retryRecommended: true,
        failedTeamIds,
        partialTeamIds,
        failedMemberIdsByTeam,
      }
    : {
        outcomeCode: "NONRETRYABLE_FAILURE",
        retryRecommended: false,
        failedTeamIds,
        partialTeamIds,
        failedMemberIdsByTeam,
      };
}

interface TeamNormalizedOutput {
  ok: boolean;
  output: string;
  degraded: boolean;
  reason?: string;
}

/**
 * Pick a candidate text for a field from unstructured output.
 * Note: Kept locally because the field format is team-member-specific.
 */
function pickTeamFieldCandidate(text: string, maxLength: number): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return "情報を整理しました。";
  const first =
    lines.find((line) => !/^(SUMMARY|CLAIM|EVIDENCE|CONFIDENCE|RESULT|NEXT_STEP)\s*:/i.test(line)) ??
    lines[0];
  const compact = first
    .replace(/^[-*]\s+/, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!compact) return "情報を整理しました。";
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength)}...`;
}

/**
 * Normalize team member output to required format.
 * Note: Kept locally (not in lib) because:
 * - Uses team-member-specific SUMMARY/CLAIM/EVIDENCE/CONFIDENCE/RESULT/NEXT_STEP format
 * - Has team-member-specific fallback messages (Japanese)
 * - Uses pickTeamFieldCandidate which is team-member-specific
 * Subagent output has different requirements (only SUMMARY/RESULT/NEXT_STEP).
 */
function normalizeTeamMemberOutput(output: string): TeamNormalizedOutput {
  const trimmed = output.trim();
  if (!trimmed) {
    return { ok: false, output: "", degraded: false, reason: "empty output" };
  }

  const quality = validateTeamMemberOutput(trimmed);
  if (quality.ok) {
    return { ok: true, output: trimmed, degraded: false };
  }

  const summary = pickTeamFieldCandidate(trimmed, 100);
  const claim = pickTeamFieldCandidate(trimmed, 120);
  const evidence = "generated-from-raw-output";
  const confidence = hasIntentOnlyContent(trimmed) ? "0.40" : "0.55";
  const nextStep = hasIntentOnlyContent(trimmed)
    ? "対象ファイルを確認し、根拠付きで結論を更新する。"
    : "none";
  const structured = [
    `SUMMARY: ${summary}`,
    `CLAIM: ${claim}`,
    `EVIDENCE: ${evidence}`,
    `CONFIDENCE: ${confidence}`,
    "RESULT:",
    trimmed,
    `NEXT_STEP: ${nextStep}`,
  ].join("\n");
  const structuredQuality = validateTeamMemberOutput(structured);
  if (structuredQuality.ok) {
    return {
      ok: true,
      output: structured,
      degraded: true,
      reason: quality.reason ?? "normalized",
    };
  }

  return {
    ok: false,
    output: "",
    degraded: false,
    reason: quality.reason ?? structuredQuality.reason ?? "normalization failed",
  };
}

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

interface TeamParallelCapacityCandidate {
  teamParallelism: number;
  memberParallelism: number;
  additionalRequests: number;
  additionalLlm: number;
}

interface TeamParallelCapacityResolution {
  allowed: boolean;
  requestedTeamParallelism: number;
  requestedMemberParallelism: number;
  appliedTeamParallelism: number;
  appliedMemberParallelism: number;
  reduced: boolean;
  reasons: string[];
  waitedMs: number;
  timedOut: boolean;
  aborted: boolean;
  attempts: number;
  projectedRequests: number;
  projectedLlm: number;
  reservation?: RuntimeCapacityReservationLease;
}

function buildMemberParallelCandidates(memberParallelism: number): TeamParallelCapacityCandidate[] {
  const requestedMemberParallelism = Math.max(1, Math.trunc(memberParallelism));
  const candidates: TeamParallelCapacityCandidate[] = [];
  for (let member = requestedMemberParallelism; member >= 1; member -= 1) {
    candidates.push({
      teamParallelism: 1,
      memberParallelism: member,
      additionalRequests: 1,
      additionalLlm: member,
    });
  }
  return candidates;
}

function buildTeamAndMemberParallelCandidates(
  teamParallelism: number,
  memberParallelism: number,
): TeamParallelCapacityCandidate[] {
  const requestedTeamParallelism = Math.max(1, Math.trunc(teamParallelism));
  const requestedMemberParallelism = Math.max(1, Math.trunc(memberParallelism));
  const candidates: TeamParallelCapacityCandidate[] = [];

  for (let team = requestedTeamParallelism; team >= 1; team -= 1) {
    for (let member = requestedMemberParallelism; member >= 1; member -= 1) {
      candidates.push({
        teamParallelism: team,
        memberParallelism: member,
        additionalRequests: team,
        additionalLlm: team * member,
      });
    }
  }

  return candidates;
}

async function resolveTeamParallelCapacity(input: {
  requestedTeamParallelism: number;
  requestedMemberParallelism: number;
  candidates: TeamParallelCapacityCandidate[];
  toolName?: string;
  maxWaitMs: number;
  pollIntervalMs: number;
  signal?: AbortSignal;
}): Promise<TeamParallelCapacityResolution> {
  const requestedTeamParallelism = Math.max(1, Math.trunc(input.requestedTeamParallelism));
  const requestedMemberParallelism = Math.max(1, Math.trunc(input.requestedMemberParallelism));
  const normalizedCandidates =
    input.candidates.length > 0
      ? input.candidates
      : [
          {
            teamParallelism: 1,
            memberParallelism: 1,
            additionalRequests: 1,
            additionalLlm: 1,
          },
        ];
  const reservationToolName = String(input.toolName || "agent_team_run_parallel");

  let immediateAttempts = 0;
  for (const candidate of normalizedCandidates) {
    immediateAttempts += 1;
    const attempt = tryReserveRuntimeCapacity({
      toolName: reservationToolName,
      additionalRequests: candidate.additionalRequests,
      additionalLlm: candidate.additionalLlm,
    });
    if (attempt.allowed && attempt.reservation) {
      return {
        allowed: true,
        requestedTeamParallelism,
        requestedMemberParallelism,
        appliedTeamParallelism: candidate.teamParallelism,
        appliedMemberParallelism: candidate.memberParallelism,
        reduced:
          candidate.teamParallelism < requestedTeamParallelism ||
          candidate.memberParallelism < requestedMemberParallelism,
        reasons: [],
        waitedMs: 0,
        timedOut: false,
        aborted: false,
        attempts: immediateAttempts,
        projectedRequests: attempt.projectedRequests,
        projectedLlm: attempt.projectedLlm,
        reservation: attempt.reservation,
      };
    }
  }

  const fallbackCandidate = normalizedCandidates[normalizedCandidates.length - 1];
  const waitResult = await reserveRuntimeCapacity({
    toolName: reservationToolName,
    additionalRequests: fallbackCandidate.additionalRequests,
    additionalLlm: fallbackCandidate.additionalLlm,
    maxWaitMs: input.maxWaitMs,
    pollIntervalMs: input.pollIntervalMs,
    signal: input.signal,
  });

  if (!waitResult.allowed || !waitResult.reservation) {
    return {
      allowed: false,
      requestedTeamParallelism,
      requestedMemberParallelism,
      appliedTeamParallelism: fallbackCandidate.teamParallelism,
      appliedMemberParallelism: fallbackCandidate.memberParallelism,
      reduced: true,
      reasons: waitResult.reasons,
      waitedMs: waitResult.waitedMs,
      timedOut: waitResult.timedOut,
      aborted: waitResult.aborted,
      attempts: immediateAttempts + waitResult.attempts,
      projectedRequests: waitResult.projectedRequests,
      projectedLlm: waitResult.projectedLlm,
    };
  }

  return {
    allowed: true,
    requestedTeamParallelism,
    requestedMemberParallelism,
    appliedTeamParallelism: fallbackCandidate.teamParallelism,
    appliedMemberParallelism: fallbackCandidate.memberParallelism,
    reduced:
      fallbackCandidate.teamParallelism < requestedTeamParallelism ||
      fallbackCandidate.memberParallelism < requestedMemberParallelism,
    reasons: [],
    waitedMs: waitResult.waitedMs,
    timedOut: false,
    aborted: false,
    attempts: immediateAttempts + waitResult.attempts,
    projectedRequests: waitResult.projectedRequests,
    projectedLlm: waitResult.projectedLlm,
    reservation: waitResult.reservation,
  };
}

// Wrapper for shared refreshRuntimeStatus with team-specific parameters
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

// ============================================================================
// Markdown-based team definitions loader
// ============================================================================

interface TeamMemberFrontmatter {
  id: string;
  role: string;
  description: string;
  enabled?: boolean;
  provider?: string;
  model?: string;
  skills?: string[];
}

interface ParsedTeamMarkdown {
  frontmatter: TeamFrontmatter;
  content: string;
  filePath: string;
}

function getTeamDefinitionsDir(cwd: string): string {
  return join(cwd, ".pi", "agent-teams", "definitions");
}

function getAgentBaseDirFromEnv(): string {
  const raw = process.env.PI_CODING_AGENT_DIR;
  if (!raw || !raw.trim()) {
    return join(homedir(), ".pi", "agent");
  }

  const value = raw.trim();
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return join(homedir(), value.slice(2));
  return value;
}

function getGlobalTeamDefinitionsDir(): string {
  return join(getAgentBaseDirFromEnv(), "agent-teams", "definitions");
}

function getBundledTeamDefinitionsDir(): string | undefined {
  // 拡張機能ファイルの隣接ディレクトリに同梱された定義を優先候補に含める。
  // これにより git package 経由の global install でも定義を見つけられる。
  if (typeof __dirname !== "string" || !__dirname) return undefined;
  return join(__dirname, "..", "agent-teams", "definitions");
}

function getCandidateTeamDefinitionsDirs(cwd: string): string[] {
  const localDir = getTeamDefinitionsDir(cwd);
  const globalDir = getGlobalTeamDefinitionsDir();
  const bundledDir = getBundledTeamDefinitionsDir();
  const candidates = [localDir, globalDir, bundledDir].filter((dir): dir is string => Boolean(dir));
  return Array.from(new Set(candidates));
}

/**
 * Parse a team markdown file with YAML frontmatter.
 */
function parseTeamMarkdownFile(filePath: string): ParsedTeamMarkdown | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const { frontmatter, body } = parseFrontmatter<TeamFrontmatter>(content);

    // Validate required fields
    if (!frontmatter.id || !frontmatter.name) {
      console.warn(`[agent-teams] Invalid team frontmatter: ${filePath} (missing id or name)`);
      return null;
    }

    // Validate enabled field
    if (frontmatter.enabled && frontmatter.enabled !== "enabled" && frontmatter.enabled !== "disabled") {
      console.warn(`[agent-teams] Invalid enabled value: ${frontmatter.enabled} in ${filePath}, defaulting to enabled`);
      frontmatter.enabled = "enabled";
    }

    // Ensure members array exists
    if (!frontmatter.members || frontmatter.members.length === 0) {
      console.warn(`[agent-teams] No members defined in ${filePath}`);
      return null;
    }

    return { frontmatter, content: body.trim(), filePath };
  } catch (error) {
    console.warn(`[agent-teams] Failed to parse ${filePath}:`, error);
    return null;
  }
}

/**
 * Load team definitions from markdown files.
 */
function loadTeamDefinitionsFromDir(definitionsDir: string, nowIso: string): TeamDefinition[] {
  const teams: TeamDefinition[] = [];
  const entries = readdirSync(definitionsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

    const filePath = join(definitionsDir, entry.name);
    const parsed = parseTeamMarkdownFile(filePath);

    if (!parsed) continue;

    const { frontmatter } = parsed;

    // Convert members from frontmatter
    const members: TeamMember[] = frontmatter.members.map((m) => ({
      id: m.id,
      role: m.role,
      description: m.description,
      provider: m.provider,
      model: m.model,
      enabled: m.enabled ?? true,
      skills: m.skills,
    }));

    teams.push({
      id: frontmatter.id,
      name: frontmatter.name,
      description: frontmatter.description,
      enabled: frontmatter.enabled,
      skills: frontmatter.skills,
      members,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  return teams;
}

function loadTeamDefinitionsFromMarkdown(cwd: string, nowIso: string): TeamDefinition[] {
  const candidates = getCandidateTeamDefinitionsDirs(cwd);
  const missingDirs: string[] = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const definitionsDir = candidates[index];
    if (!existsSync(definitionsDir)) {
      missingDirs.push(definitionsDir);
      continue;
    }

    const teams = loadTeamDefinitionsFromDir(definitionsDir, nowIso);
    if (teams.length > 0) {
      return teams;
    }
  }

  if (missingDirs.length === candidates.length) {
    console.log(
      `[agent-teams] Team definitions directory not found: ${candidates.join(", ")}, will use fallback`,
    );
  } else {
    console.log(
      `[agent-teams] Team definitions found but no valid markdown loaded (${candidates.join(", ")}), will use fallback`,
    );
  }
  return [];
}

function createRapidSwarmMembers(count: number): TeamMember[] {
  const focusAreas = [
    "APIとインターフェース契約",
    "データフローと状態遷移",
    "エラーハンドリングとエッジケース",
    "テストと検証パス",
  ] as const;
  const members: TeamMember[] = [];
  for (let index = 1; index <= count; index += 1) {
    const id = `swarm-${String(index).padStart(2, "0")}`;
    const focus = focusAreas[(index - 1) % focusAreas.length];
    members.push({
      id,
      role: `Swarm Worker ${String(index).padStart(2, "0")}`,
      description:
        `${focus}という独立したスライスを迅速に担当し、簡潔で実行可能な出力を返す。前提条件を明確に示す。`,
      enabled: true,
    });
  }
  return members;
}

function getHardcodedDefaultTeams(nowIso: string): TeamDefinition[] {
  return [
    {
      id: "core-delivery-team",
      name: "Core Delivery Team",
      description:
        "汎用的なコーディングタスクに対応するバランス型チーム。調査、実装、レビューを一連のフローで行い、高品質な成果物を迅速に提供する。Researcherが事実収集、Implementerが実装設計、Reviewerが品質保証を担当し、三者が協調して開発を進める。",
      enabled: "enabled",
      members: [
        {
          id: "research",
          role: "Researcher",
          description: "関連ファイルを網羅的に特定し、制約条件や技術的な事実を収集する。既存コードの構造、依存関係、影響範囲を徹底的に調査し、実装のための前提条件を明確化する。",
          enabled: true,
        },
        {
          id: "build",
          role: "Implementer",
          description: "最小限の実装手順を提案し、エッジケースや境界条件を考慮したチェックを行う。既存コードとの整合性を保ちながら、エレガントで安全かつ保守性の高い実装を設計する。",
          enabled: true,
        },
        {
          id: "review",
          role: "Reviewer",
          description: "提案されたアプローチに対して品質チェックとリスク評価を実施する。潜在的なバグ、パフォーマンス問題、セキュリティ上の懸念、メンテナンス性の観点から包括的なレビューを行い、改善点を特定する。",
          enabled: true,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "bug-war-room",
      name: "Bug War Room",
      description:
        "バグの根本原因調査タスクフォース。競合する仮説を検証し、決定論的な再現手順を確立した上で、最終的な合意形成を行う。Hypothesis Aが主要な仮説検証、Reproduction Specialistが再現性の担保、Consensus Analystが証拠統合と結論を担当し、三人で協調して原因特定を行う。",
      enabled: "enabled",
      members: [
        {
          id: "hypothesis-a",
          role: "Hypothesis A",
          description: "最も可能性の高い根本原因を検証し、直接的な証拠を収集する。仮説に基づいた再現手順を設計し、ログやコードの観察から裏付けを得る。",
          enabled: true,
        },
        {
          id: "reproduction",
          role: "Reproduction Specialist",
          description: "決定論的な再現手順を作成し、境界条件や環境依存の注意点を明示する。同じ手順で再現可能かを確認し、不確実性を排除する。",
          enabled: true,
        },
        {
          id: "consensus",
          role: "Consensus Analyst",
          description: "収集された証拠を統合し、信頼度をランク付けして最終的な根本原因を結論付ける。競合する仮説を比較検討し、最も可能性の高い原因を一つに絞り込む。",
          enabled: true,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "security-hardening-team",
      name: "Security Hardening Team",
      description:
        "セキュリティに特化したチーム。脅威分析、認証・認可チェック、依存関係リスク監査、パッチレビューを実施する。Threat Modelerが攻撃面のマッピング、Auth Auditorが認証監査、Security Fix Reviewerが修正レビューを担当し、三人で協調してセキュリティ向上を図る。",
      enabled: "enabled",
      members: [
        {
          id: "threat-modeler",
          role: "Threat Modeler",
          description: "攻撃対象領域、信頼境界、悪用シナリオをマッピングし、深刻度を評価する。攻撃経路を特定し、それぞれのリスクレベルを分類する。",
          enabled: true,
        },
        {
          id: "auth-auditor",
          role: "Auth Auditor",
          description: "認証、認可、セッション境界の監査を行い、回避リスクを特定する。認証バイパス、権限昇格、セッションハイジャックの可能性を検査する。",
          enabled: true,
        },
        {
          id: "security-reviewer",
          role: "Security Fix Reviewer",
          description: "提案された修正措置について網羅性とリグレッションの観点からレビューを行う。修正が完全で、新たな脆弱性を生み出していないかを確認する。",
          enabled: true,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "docs-enablement-team",
      name: "Docs Enablement Team",
      description:
        "ドキュメント作成チーム。README、運用手順書、サンプルコード、変更サマリーを網羅的に作成・更新する。README Ownerが導入フロー、Runbook Ownerが運用手順、Docs Reviewerが品質チェックを担当し、三人で協調してドキュメント品質を向上させる。",
      enabled: "enabled",
      members: [
        {
          id: "readme-owner",
          role: "README Owner",
          description: "オンボーディングとクイックスタートフローを更新し、摩擦を最小限に抑える。新しいユーザーがスムーズに導入できるよう、手順を明確かつ簡潔に記述する。",
          enabled: true,
        },
        {
          id: "runbook-owner",
          role: "Runbook Owner",
          description: "運用手順、トラブルシューティングフロー、リカバリ手順を文書化する。障害発生時の対応を明確にし、運用者が必要な情報を迅速に参照できるようにする。",
          enabled: true,
        },
        {
          id: "docs-reviewer",
          role: "Docs Reviewer",
          description: "一貫性、正確性、読者視点でのわかりやすさを相互チェックする。文書間の整合性を確認し、不明瞭な表現を特定する。",
          enabled: true,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "rapid-swarm-team",
      name: "Rapid Swarm Team",
      description:
        "スピード重視の並列ワーカーチーム。独立したタスクを積極的に並列展開できる場合に使用する。Swarm Workerがそれぞれ異なる視点で迅速にタスクを遂行し、Swarm Synthesizerが出力を統合して一つの実行計画を作成する。",
      enabled: "enabled",
      members: [
        ...createRapidSwarmMembers(2),
        {
          id: "swarm-synthesizer",
          role: "Swarm Synthesizer",
          description: "並列ワーカーの出力を統合し、重複を除去して一つの実行計画を作成する。異なる視点からの意見を総合して、矛盾のないアクションプランを導き出す。",
          enabled: true,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "refactor-migration-team",
      name: "Refactor & Migration Team",
      description:
        "リファクタリングに特化したチーム。影響分析、移行計画、実装戦略、互換性チェックを実施する。Impact Analystが影響範囲の特定、Migration Plannerが移行計画、Refactor Implementerが実装設計を担当し、三人で協調して安全なリファクタリングを行う。",
      enabled: "enabled",
      members: [
        {
          id: "impact-analyst",
          role: "Impact Analyst",
          description: "影響を受けるモジュール、依存関係、リスク集中領域をマッピングする。変更の影響範囲を特定し、リスクが高い部分を特定する。",
          enabled: true,
        },
        {
          id: "migration-planner",
          role: "Migration Planner",
          description: "段階的なロールアウトを設計し、チェックポイント、フォールバックポイント、ロールアウト順序を定義する。安全かつ順序よく移行を進めるための計画を作成する。",
          enabled: true,
        },
        {
          id: "refactor-implementer",
          role: "Refactor Implementer",
          description: "振る舞いを保持しつつ、最小限で安全なコード変更を提案する。既存の機能に影響を与えず、保守性を向上させる変更を行う。",
          enabled: true,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "code-excellence-review-team",
      name: "Code Excellence Review Team",
      description:
        "包括的なコードレビューチーム。可読性、エレガンス、保守性、長期的な運用可能性を評価する。Readability Reviewerが読みやすさ、Architecture Reviewerがアーキテクチャ、Review Synthesizerが総合評価を担当し、三人で協調してコード品質を向上させる。",
      enabled: "enabled",
      members: [
        {
          id: "readability-reviewer",
          role: "Readability Reviewer",
          description: "命名の明確さ、フローの可読性、認知的負荷をチェックする。変数名・関数名が適切か、コードの流れが追いやすいか、理解しやすさを評価する。",
          enabled: true,
        },
        {
          id: "architecture-reviewer",
          role: "Architecture Reviewer",
          description: "境界、レイヤリング、結合度、モジュール責任をレビューする。コンポーネント間の境界が適切か、層の分離ができているか、結合が疎になっているかを確認する。",
          enabled: true,
        },
        {
          id: "review-synthesizer",
          role: "Review Synthesizer",
          description: "レビュー結果を統合し、critical/should/niceの優先度に分類して具体的な修正案を提示する。最も重要な問題から順に対処するためのアクションリストを作成する。",
          enabled: true,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];
}

/**
 * Load team definitions from Markdown files if available,
 * otherwise fallback to hardcoded defaults.
 */
function createDefaultTeams(nowIso: string, cwd?: string): TeamDefinition[] {
  const effectiveCwd = cwd || process.cwd();
  const markdownTeams = loadTeamDefinitionsFromMarkdown(effectiveCwd, nowIso);

  // If Markdown teams are loaded, return them
  if (markdownTeams.length > 0) {
    return markdownTeams;
  }

  // Fallback to hardcoded defaults
  console.log("[agent-teams] Using hardcoded default teams");
  return getHardcodedDefaultTeams(nowIso);
}

function ensureDefaults(storage: TeamStorage, nowIso: string, cwd?: string): TeamStorage {
  const effectiveCwd = cwd || process.cwd();
  const defaults = createDefaultTeams(nowIso, effectiveCwd);
  const defaultIds = new Set(defaults.map((team) => team.id));
  const deprecatedDefaultIds = new Set(["investigation-team"]);
  const existingById = new Map(storage.teams.map((team) => [team.id, team]));
  const mergedTeams: TeamDefinition[] = [];

  // Keep built-in definitions synchronized so size/role fixes are applied.
  for (const defaultTeam of defaults) {
    const existing = existingById.get(defaultTeam.id);
    if (!existing) {
      mergedTeams.push(defaultTeam);
      continue;
    }
    mergedTeams.push(mergeDefaultTeam(existing, defaultTeam));
  }

  // Preserve user-defined teams and drop deprecated built-ins.
  for (const team of storage.teams) {
    if (defaultIds.has(team.id)) continue;
    if (deprecatedDefaultIds.has(team.id)) continue;
    mergedTeams.push(team);
  }

  storage.teams = mergedTeams;
  storage.defaultsVersion = TEAM_DEFAULTS_VERSION;

  if (!storage.currentTeamId || !storage.teams.some((team) => team.id === storage.currentTeamId)) {
    storage.currentTeamId = defaults[0]?.id;
  }

  return storage;
}

const LEGACY_DEFAULT_MEMBER_IDS_BY_TEAM: Record<string, Set<string>> = {
  "core-delivery-team": new Set(["architecture", "test", "risk"]),
  "bug-war-room": new Set(["hypothesis-b", "hypothesis-c"]),
  "security-hardening-team": new Set(["dependency-auditor", "input-validator"]),
  "docs-enablement-team": new Set(["examples-owner", "changes-owner"]),
  "rapid-swarm-team": new Set([
    "swarm-03",
    "swarm-04",
    "swarm-05",
    "swarm-06",
    "swarm-07",
    "swarm-08",
  ]),
  "refactor-migration-team": new Set(["compatibility-tester", "rollback-planner"]),
  "code-excellence-review-team": new Set([
    "simplicity-reviewer",
    "maintainability-reviewer",
    "testability-reviewer",
    "performance-reviewer",
    "security-reviewer",
    "consistency-reviewer",
  ]),
};

function mergeDefaultTeam(existing: TeamDefinition, fallback: TeamDefinition): TeamDefinition {
  const existingMembers = new Map(existing.members.map((member) => [member.id, member]));
  const fallbackMemberIds = new Set(fallback.members.map((member) => member.id));
  const legacyDefaultIds = LEGACY_DEFAULT_MEMBER_IDS_BY_TEAM[fallback.id] ?? new Set<string>();
  const mergedMembers = fallback.members.map((member) => {
    const existingMember = existingMembers.get(member.id);
    if (!existingMember) return member;
    return {
      ...member,
      provider: existingMember.provider,
      model: existingMember.model,
      enabled: existingMember.enabled,
    };
  });
  const preservedExtraMembers = existing.members.filter((member) => {
    if (fallbackMemberIds.has(member.id)) return false;
    if (legacyDefaultIds.has(member.id)) return false;
    return true;
  });
  const mergedMembersWithExtras = [...mergedMembers, ...preservedExtraMembers];

  const hasDrift =
    existing.name !== fallback.name ||
    existing.description !== fallback.description ||
    mergedMembersWithExtras.length !== existing.members.length ||
    mergedMembersWithExtras.some((member, index) => {
      const oldMember = existing.members[index];
      if (!oldMember) return true;
      return member.id !== oldMember.id || member.role !== oldMember.role || member.description !== oldMember.description;
    });

  return {
    ...fallback,
    enabled: existing.enabled,
    members: mergedMembersWithExtras,
    createdAt: existing.createdAt || fallback.createdAt,
    updatedAt: hasDrift ? new Date().toISOString() : existing.updatedAt || fallback.updatedAt,
  };
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

function extractSummary(output: string): string {
  const match = output.match(/^\s*summary\s*:\s*(.+)$/im);
  if (match?.[1]) {
    return match[1].trim();
  }

  const firstLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) {
    return "(no summary)";
  }

  return firstLine.length > 120 ? `${firstLine.slice(0, 120)}...` : firstLine;
}

/**
 * Merge skill arrays following inheritance rules.
 * - Empty array [] is treated as unspecified (ignored)
 * - Non-empty arrays are merged with deduplication
 */
function mergeSkillArrays(base: string[] | undefined, override: string[] | undefined): string[] | undefined {
  const hasBase = Array.isArray(base) && base.length > 0;
  const hasOverride = Array.isArray(override) && override.length > 0;

  if (!hasBase && !hasOverride) return undefined;
  if (!hasBase) return override;
  if (!hasOverride) return base;

  const merged = [...base];
  for (const skill of override) {
    if (!merged.includes(skill)) {
      merged.push(skill);
    }
  }
  return merged;
}

/**
 * Resolve effective skills for a team member.
 * Inheritance: teamSkills (common) -> memberSkills (individual)
 */
function resolveEffectiveTeamMemberSkills(
  team: TeamDefinition,
  member: TeamMember,
): string[] | undefined {
  return mergeSkillArrays(team.skills, member.skills);
}

/**
 * Format skill list for prompt inclusion (Japanese).
 */
function formatTeamMemberSkillsSection(skills: string[] | undefined): string | null {
  if (!skills || skills.length === 0) return null;
  return skills.map((skill) => `- ${skill}`).join("\n");
}

/**
 * Skill search paths in priority order.
 * - .pi/lib/skills/: Team-specific skills (only loaded when explicitly assigned)
 * - .pi/skills/: Global skills (available to all agents)
 */
const TEAM_SKILL_PATHS = [
  join(process.cwd(), ".pi", "lib", "skills"),
  join(process.cwd(), ".pi", "skills"),
];

/**
 * Load skill content from SKILL.md file.
 * Searches in team-specific path first, then global path.
 * Returns null if skill not found.
 */
function loadSkillContent(skillName: string): string | null {
  for (const basePath of TEAM_SKILL_PATHS) {
    const skillPath = join(basePath, skillName, "SKILL.md");
    if (existsSync(skillPath)) {
      try {
        const content = readFileSync(skillPath, "utf-8");
        // Extract content after frontmatter
        const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
        return frontmatterMatch ? frontmatterMatch[1].trim() : content.trim();
      } catch {
        // Continue to next path on error
      }
    }
  }
  return null;
}

/**
 * Build skills section with content for prompt inclusion.
 * Only includes skills that are explicitly assigned to the team/member.
 * Falls back to skill names only if content cannot be loaded.
 */
function buildSkillsSectionWithContent(skills: string[] | undefined): string | null {
  if (!skills || skills.length === 0) return null;

  const lines: string[] = [];

  for (const skill of skills) {
    const content = loadSkillContent(skill);
    if (content) {
      lines.push(`## ${skill}`);
      lines.push(content);
      lines.push("");
    } else {
      // Fallback: skill name only
      lines.push(`## ${skill}`);
      lines.push("(スキル内容を読み込めませんでした)");
      lines.push("");
    }
  }

  return lines.length > 0 ? lines.join("\n").trim() : null;
}

function buildTeamMemberPrompt(input: {
  team: TeamDefinition;
  member: TeamMember;
  task: string;
  sharedContext?: string;
  phase?: "initial" | "communication";
  communicationContext?: string;
}): string {
  const lines: string[] = [];

  const phase = input.phase ?? "initial";
  const phaseLabel = phase === "initial" ? "初期検討" : "コミュニケーション";

  lines.push(`あなたはエージェントチーム ${input.team.name} (${input.team.id}) のメンバーです。`);
  lines.push(`チームミッション: ${input.team.description}`);
  lines.push(`あなたの役割: ${input.member.role} (${input.member.id})`);
  lines.push(`役割目標: ${input.member.description}`);
  lines.push(`現在フェーズ: ${phaseLabel}`);

  // Resolve and include skills (team common + member individual)
  const effectiveSkills = resolveEffectiveTeamMemberSkills(input.team, input.member);
  const skillsSection = buildSkillsSectionWithContent(effectiveSkills);
  if (skillsSection) {
    lines.push("");
    lines.push("割り当てスキル:");
    lines.push(skillsSection);
  }

  lines.push("");
  lines.push("リードからのタスク:");
  lines.push(input.task);

  if (input.sharedContext?.trim()) {
    lines.push("");
    lines.push("共有コンテキスト:");
    lines.push(input.sharedContext.trim());
  }

  if (input.communicationContext?.trim()) {
    lines.push("");
    lines.push("連携コンテキスト:");
    lines.push(input.communicationContext.trim());
  }

  // Inject plan mode warning if active
  if (isPlanModeActive()) {
    lines.push("");
    lines.push(PLAN_MODE_WARNING);
  }

  lines.push("");
  lines.push(getTeamMemberExecutionRules(phase, true));

  lines.push("");
  lines.push("Output format (strict, labels must stay in English):");
  lines.push("SUMMARY: <日本語の短い要約>");
  lines.push("CLAIM: <日本語で1文の中核主張>");
  lines.push("EVIDENCE: <根拠をカンマ区切り。可能なら file:line>");
  lines.push("CONFIDENCE: <0.00-1.00>");
  if (phase === "communication") {
    lines.push("DISCUSSION: <他のメンバーのoutputを参照し、同意点/不同意点を記述。合意形成時は「合意: [要約]」を明記（必須）>");
  } else {
    lines.push("DISCUSSION: <他のメンバーのoutputを参照し、同意点/不同意点を記述。合意形成時は「合意: [要約]」を明記（コミュニケーションフェーズで必須）>");
  }
  lines.push("RESULT:");
  lines.push("<日本語の結果本文>");
  lines.push("NEXT_STEP: <日本語で次のアクション、不要なら none>");

  return lines.join("\n");
}

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

async function runMember(input: {
  team: TeamDefinition;
  member: TeamMember;
  task: string;
  sharedContext?: string;
  phase?: "initial" | "communication";
  communicationContext?: string;
  timeoutMs: number;
  cwd: string;
  retryOverrides?: RetryWithBackoffOverrides;
  fallbackProvider?: string;
  fallbackModel?: string;
  signal?: AbortSignal;
  onStart?: (member: TeamMember) => void;
  onEnd?: (member: TeamMember) => void;
  onEvent?: (member: TeamMember, event: string) => void;
  onTextDelta?: (member: TeamMember, delta: string) => void;
  onStderrChunk?: (member: TeamMember, chunk: string) => void;
}): Promise<TeamMemberResult> {
  const prompt = buildTeamMemberPrompt({
    team: input.team,
    member: input.member,
    task: input.task,
    sharedContext: input.sharedContext,
    phase: input.phase,
    communicationContext: input.communicationContext,
  });
  const resolvedProvider = input.member.provider ?? input.fallbackProvider ?? "(session-default)";
  const resolvedModel = input.member.model ?? input.fallbackModel ?? "(session-default)";
  const rateLimitKey = buildRateLimitKey(resolvedProvider, resolvedModel);
  let retryCount = 0;
  let lastRetryStatusCode: number | undefined;
  let lastRetryMessage = "";
  let lastRateLimitWaitMs = 0;
  let lastRateLimitHits = 0;
  let rateLimitGateLogged = false;
  let rateLimitStderrLogged = false;
  const effectiveRetryOverrides: RetryWithBackoffOverrides | undefined = STABLE_AGENT_TEAM_RUNTIME
    ? {
        // Stable profile: avoid immediate 429 failures by allowing bounded retries.
        maxRetries: STABLE_AGENT_TEAM_MAX_RETRIES,
        initialDelayMs: STABLE_AGENT_TEAM_INITIAL_DELAY_MS,
        maxDelayMs: STABLE_AGENT_TEAM_MAX_DELAY_MS,
        multiplier: 2,
        jitter: "none",
      }
    : input.retryOverrides;
  const emitStderrChunk = (chunk: string) => {
    const isRateLimitChunk = /429|rate\s*limit|too many requests/i.test(chunk);
    if (isRateLimitChunk) {
      if (rateLimitStderrLogged) {
        return;
      }
      rateLimitStderrLogged = true;
    }
    input.onStderrChunk?.(input.member, chunk);
  };
  const phase = input.phase ?? "initial";
  input.onEvent?.(
    input.member,
    `member run start: phase=${phase} provider=${resolvedProvider} model=${resolvedModel} timeout=${input.timeoutMs}ms prompt_chars=${prompt.length}`,
  );

  input.onStart?.(input.member);
  try {
    try {
      const response = await retryWithBackoff(
        async () => {
          const result = await runPiPrintMode({
            provider: input.member.provider ?? input.fallbackProvider,
            model: input.member.model ?? input.fallbackModel,
            prompt,
            timeoutMs: input.timeoutMs,
            signal: input.signal,
            onTextDelta: (delta) => input.onTextDelta?.(input.member, delta),
            onStderrChunk: emitStderrChunk,
          });
          const normalized = normalizeTeamMemberOutput(result.output);
          if (!normalized.ok) {
            throw new Error(`agent team member low-substance output: ${normalized.reason}`);
          }
          if (normalized.degraded) {
            input.onEvent?.(
              input.member,
              `normalize: team member output normalized reason=${normalized.reason || "format-mismatch"}`,
            );
          }
          return {
            output: normalized.output,
            latencyMs: result.latencyMs,
          };
        },
        {
          cwd: input.cwd,
          overrides: effectiveRetryOverrides,
          signal: input.signal,
          rateLimitKey,
          maxRateLimitRetries: STABLE_AGENT_TEAM_MAX_RATE_LIMIT_RETRIES,
          maxRateLimitWaitMs: STABLE_AGENT_TEAM_MAX_RATE_LIMIT_WAIT_MS,
          onRateLimitWait: ({ waitMs, hits }) => {
            lastRateLimitWaitMs = waitMs;
            lastRateLimitHits = hits;
            if (!rateLimitGateLogged) {
              rateLimitGateLogged = true;
              input.onEvent?.(
                input.member,
                `shared-rate-limit wait: ${waitMs}ms hits=${hits}`,
              );
            }
          },
          shouldRetry: (error, statusCode) => isRetryableTeamMemberError(error, statusCode),
          onRetry: ({ attempt, maxRetries, delayMs, statusCode, error }) => {
            retryCount = attempt;
            lastRetryStatusCode = statusCode;
            lastRetryMessage = normalizeForSingleLine(toErrorMessage(error), 140);
            const shouldLog =
              statusCode !== 429 || attempt === 1;
            if (shouldLog) {
              const errorText =
                statusCode === 429
                  ? "rate limit"
                  : normalizeForSingleLine(toErrorMessage(error), 140);
              input.onEvent?.(
                input.member,
                `retry ${attempt}/${maxRetries}: delay=${delayMs}ms status=${statusCode ?? "-"} error=${errorText}`,
              );
            }
          },
        },
      );
      input.onEvent?.(
        input.member,
        `member run success: latency=${response.latencyMs}ms output_chars=${response.output.length}`,
      );
      const diagnostics = analyzeMemberOutput(response.output);

      return {
        memberId: input.member.id,
        role: input.member.role,
        summary: extractSummary(response.output),
        output: response.output,
        status: "completed",
        latencyMs: response.latencyMs,
        diagnostics,
      };
    } catch (error) {
      const gateSnapshot = getRateLimitGateSnapshot(rateLimitKey);
      const diagnostic = [
        `provider=${resolvedProvider}`,
        `model=${resolvedModel}`,
        `retries=${retryCount}`,
        lastRetryStatusCode !== undefined ? `last_status=${lastRetryStatusCode}` : "",
        lastRetryMessage ? `last_retry_error=${lastRetryMessage}` : "",
        lastRateLimitWaitMs > 0 ? `last_gate_wait_ms=${lastRateLimitWaitMs}` : "",
        lastRateLimitHits > 0 ? `last_gate_hits=${lastRateLimitHits}` : "",
        `gate_wait_ms=${gateSnapshot.waitMs}`,
        `gate_hits=${gateSnapshot.hits}`,
      ]
        .filter(Boolean)
        .join(" ");
      const errorMessage = diagnostic
        ? `${toErrorMessage(error)} | ${diagnostic}`
        : toErrorMessage(error);
      input.onEvent?.(
        input.member,
        `member run failed: ${normalizeForSingleLine(errorMessage, 180)}`,
      );
      return {
        memberId: input.member.id,
        role: input.member.role,
        summary: "(failed)",
        output: "",
        status: "failed",
        latencyMs: 0,
        error: errorMessage,
        diagnostics: {
          confidence: 0,
          evidenceCount: 0,
          contradictionSignals: 0,
          conflictSignals: 0,
        },
      };
    }
  } finally {
    input.onEnd?.(input.member);
  }
}

function buildTeamResultText(input: {
  run: TeamRunRecord;
  team: TeamDefinition;
  memberResults: TeamMemberResult[];
  communicationAudit?: TeamCommunicationAuditEntry[];
}): string {
  const lines: string[] = [];
  lines.push(`Agent team run completed: ${input.run.runId}`);
  lines.push(`Team: ${input.team.id} (${input.team.name})`);
  lines.push(`Strategy: ${input.run.strategy}`);
  lines.push(`Communication rounds: ${input.run.communicationRounds ?? 0}`);
  lines.push(
    `Failed-member retries: ${input.run.failedMemberRetryApplied ?? 0}/${input.run.failedMemberRetryRounds ?? 0}`,
  );
  lines.push("Failed-member retry policy: round1=quality/transient only, round2+=remaining failures (rate-limit/capacity excluded)");
  if ((input.run.recoveredMembers?.length ?? 0) > 0) {
    lines.push(`Recovered members: ${(input.run.recoveredMembers ?? []).join(", ")}`);
  }
  lines.push(`Status: ${input.run.status}`);
  lines.push(`Summary: ${input.run.summary}`);
  lines.push(`Output file: ${input.run.outputFile}`);
  if (input.run.communicationLinks) {
    lines.push("Communication links:");
    for (const [memberId, partners] of Object.entries(input.run.communicationLinks)) {
      lines.push(`- ${memberId} -> ${partners.join(", ") || "-"}`);
    }
  }
  if ((input.run.communicationRounds ?? 0) > 0) {
    lines.push("Communication audit:");
    const auditEntries = (input.communicationAudit ?? [])
      .slice()
      .sort((left, right) => left.round - right.round || left.memberId.localeCompare(right.memberId));
    if (auditEntries.length === 0) {
      lines.push("- no communication exchange was recorded.");
    } else {
      const referencedCount = auditEntries.filter((entry) => entry.referencedPartners.length > 0).length;
      const fullyReferencedCount = auditEntries.filter((entry) => entry.missingPartners.length === 0).length;
      lines.push(
        `- summary: referenced_any=${referencedCount}/${auditEntries.length}, referenced_all=${fullyReferencedCount}/${auditEntries.length}`,
      );
      for (const entry of auditEntries) {
        lines.push(
          `- round ${entry.round} | ${entry.memberId} (${entry.role}) | status=${entry.resultStatus} | partners=${entry.partnerIds.join(", ") || "-"} | referenced=${entry.referencedPartners.join(", ") || "-"} | missing=${entry.missingPartners.join(", ") || "-"}`,
        );
        lines.push(`  context: ${entry.contextPreview || "-"}`);
        lines.push(`  partner_snapshots: ${entry.partnerSnapshots.join(" ; ") || "-"}`);
      }
    }
  }
  if (input.run.finalJudge) {
    lines.push(
      `Final judge: ${input.run.finalJudge.verdict} (${Math.round(input.run.finalJudge.confidence * 100)}%)`,
    );
    lines.push(
      `Uncertainty: intra=${input.run.finalJudge.uIntra.toFixed(2)}, inter=${input.run.finalJudge.uInter.toFixed(2)}, sys=${input.run.finalJudge.uSys.toFixed(2)}`,
    );
    lines.push(`Collapse signals: ${input.run.finalJudge.collapseSignals.join(", ") || "none"}`);
    lines.push(`Judge reason: ${input.run.finalJudge.reason}`);
    lines.push(`Judge next step: ${input.run.finalJudge.nextStep}`);
  }
  lines.push("");
  lines.push("Member results:");

  for (const result of input.memberResults) {
    const state = result.status === "completed" ? "ok" : "failed";
    lines.push(`- ${result.memberId} (${result.role}) [${state}] ${result.summary}`);
    if (result.error) {
      lines.push(`  error: ${result.error}`);
    }
  }

  lines.push("");
  lines.push("Detailed outputs:");
  for (const result of input.memberResults) {
    lines.push(`\n### ${result.memberId} (${result.role})`);
    lines.push(result.status === "completed" ? result.output : `FAILED: ${result.error}`);
  }

  return lines.join("\n");
}

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
    throw new Error(`no enabled members in team (${input.team.id})`);
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
        emitResultEvent(member, "initial", result);
        return result;
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
        signal: input.signal,
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

          // Run verification hook for completed team output
          const aggregatedOutput = buildTeamResultText({
            run: runRecord,
            team,
            memberResults,
            communicationAudit,
          });
          const avgConfidence = memberResults.length > 0
            ? memberResults.reduce((sum, r) => sum + extractConfidenceFromOutput(r.output), 0) / memberResults.length
            : 0.5;
          const verificationResult = await runTeamVerification(
            aggregatedOutput,
            avgConfidence,
            {
              teamId: team.id,
              task: params.task,
              memberOutputs: memberResults.map(r => ({ agentId: r.memberId, output: r.output })),
            },
            {
              provider: ctx.model?.provider,
              model: ctx.model?.id,
              signal,
            }
          );

          // Build output with verification info if available
          const outputLines = [aggregatedOutput];
          if (verificationResult?.triggered && verificationResult.result) {
            outputLines.push("");
            outputLines.push(formatVerificationResult(verificationResult));
          }

          logger.endOperation({
            status: teamOutcome.outcomeCode === "SUCCESS" ? "success" : "partial",
            tokensUsed: 0,
            outputLength: outputLines.join("\n").length,
            outputFile: runRecord.outputFile,
            childOperations: memberResults.length,
            toolCalls: 0,
          });
          return {
            content: [
              {
                type: "text" as const,
                text: outputLines.join("\n"),
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
              verification: verificationResult?.result,
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
                signal,
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

        // Run verification hooks for completed team outputs
        const teamVerificationResults: Array<{ teamId: string; result?: VerificationHookResult }> = [];
        const verificationPromises = results.map(async (result) => {
          if (result.runRecord.status !== "completed") return null;

          try {
            const teamOutput = buildTeamResultText({
              run: result.runRecord,
              team: result.team,
              memberResults: result.memberResults,
              communicationAudit: result.communicationAudit,
            });
            const avgConfidence = result.memberResults.length > 0
              ? result.memberResults.reduce((sum, r) => sum + extractConfidenceFromOutput(r.output), 0) / result.memberResults.length
              : 0.5;
            const verificationResult = await runTeamVerification(
              teamOutput,
              avgConfidence,
              {
                teamId: result.team.id,
                task: params.task,
                memberOutputs: result.memberResults.map(r => ({ agentId: r.memberId, output: r.output })),
              },
              {
                provider: ctx.model?.provider,
                model: ctx.model?.id,
                signal,
              }
            );
            return { teamId: result.team.id, result: verificationResult };
          } catch (error) {
            console.warn(`[agent-teams] Verification error for team ${result.team.id}:`, error);
            return { teamId: result.team.id, result: undefined };
          }
        });

        const resolvedVerifications = await Promise.all(verificationPromises);
        for (const v of resolvedVerifications) {
          if (v) teamVerificationResults.push(v);
        }

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

        // Add verification summaries if any teams were verified
        const verificationSummaries = teamVerificationResults.filter(v => v.result?.triggered);
        if (verificationSummaries.length > 0) {
          lines.push("");
          lines.push("Verification results:");
          for (const v of verificationSummaries) {
            if (v.result?.result) {
              lines.push(`- ${v.teamId}: ${v.result.result.finalVerdict} (confidence: ${v.result.result.confidence.toFixed(2)})`);
            }
          }
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
          // Append verification details for this team
          const teamVerification = teamVerificationResults.find(v => v.teamId === result.team.id);
          if (teamVerification?.result?.triggered) {
            lines.push("");
            lines.push(formatVerificationResult(teamVerification.result));
          }
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
            teamVerifications: teamVerificationResults.map(v => ({
              teamId: v.teamId,
              result: v.result?.result,
            })),
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
