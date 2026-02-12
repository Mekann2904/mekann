// File: .pi/extensions/subagents.ts
// Description: Adds subagent creation, management, and delegated execution tools for pi.
// Why: Enables proactive task delegation to focused helper agents as a default workflow.
// Related: .pi/extensions/agent-teams.ts, .pi/extensions/question.ts, README.md

import { getMarkdownTheme, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { Key, Markdown, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";
import { atomicWriteTextFile, withFileLock } from "../lib/storage-lock";
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
	isBashCommandAllowed,
	isPlanModeActive,
	PLAN_MODE_WARNING,
} from "../lib/plan-mode-shared";
import {
  getRateLimitGateSnapshot,
  isRetryableError,
  retryWithBackoff,
  type RetryWithBackoffOverrides,
} from "../lib/retry-with-backoff";
import { runWithConcurrencyLimit } from "../lib/concurrency";
import {
  getSubagentExecutionRules,
} from "../lib/execution-rules";
import {
  ensureDir,
  formatDurationMs,
  toTailLines,
  appendTail,
  countOccurrences,
  estimateLineCount,
  looksLikeMarkdown,
  renderPreviewWithMarkdown,
  formatBytes,
  formatClockTime,
  extractStatusCodeFromMessage,
  classifyPressureError,
  isCancelledErrorMessage,
  isTimeoutErrorMessage,
  toErrorMessage,
  LIVE_TAIL_LIMIT,
  LIVE_MARKDOWN_PREVIEW_MIN_WIDTH,
  createRunId,
  computeLiveWindow,
  ThinkingLevel,
  RunOutcomeCode,
  RunOutcomeSignal,
  DEFAULT_AGENT_TIMEOUT_MS,
} from "../lib";

type AgentEnabledState = "enabled" | "disabled";

interface SubagentDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  provider?: string;
  model?: string;
  enabled: AgentEnabledState;
  createdAt: string;
  updatedAt: string;
}

interface SubagentRunRecord {
  runId: string;
  agentId: string;
  task: string;
  summary: string;
  status: "completed" | "failed";
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
  outputFile: string;
  error?: string;
}

interface SubagentStorage {
  agents: SubagentDefinition[];
  runs: SubagentRunRecord[];
  currentAgentId?: string;
  defaultsVersion?: number;
}

interface SubagentPaths {
  baseDir: string;
  runsDir: string;
  storageFile: string;
}

interface PrintCommandResult {
  output: string;
  latencyMs: number;
}

const MAX_RUNS_TO_KEEP = 100;
const SUBAGENT_DEFAULTS_VERSION = 2;
const LIVE_PREVIEW_LINE_LIMIT = 36;
const LIVE_LIST_WINDOW_SIZE = 20;
const STABLE_SUBAGENT_RUNTIME = true;
const ADAPTIVE_PARALLEL_MAX_PENALTY = STABLE_SUBAGENT_RUNTIME ? 0 : 3;
const ADAPTIVE_PARALLEL_DECAY_MS = 8 * 60 * 1000;
const STABLE_SUBAGENT_MAX_RETRIES = 4;
const STABLE_SUBAGENT_INITIAL_DELAY_MS = 1_000;
const STABLE_SUBAGENT_MAX_DELAY_MS = 30_000;
const STABLE_SUBAGENT_MAX_RATE_LIMIT_RETRIES = 6;
const STABLE_SUBAGENT_MAX_RATE_LIMIT_WAIT_MS = 90_000;
const DEFAULT_DIRECT_WRITE_CONFIRM_WINDOW_MS = 60_000;

const runtimeState = getSharedRuntimeState().subagents;

const adaptiveParallelState = {
  penalty: 0,
  updatedAtMs: Date.now(),
};

function resolveDirectWriteConfirmWindowMs(): number {
  const raw = Number(process.env.PI_DIRECT_WRITE_CONFIRM_WINDOW_MS ?? DEFAULT_DIRECT_WRITE_CONFIRM_WINDOW_MS);
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_DIRECT_WRITE_CONFIRM_WINDOW_MS;
  }
  return Math.max(5_000, Math.min(300_000, Math.trunc(raw)));
}

const delegationState = {
  delegatedThisRequest: false,
  directWriteConfirmedThisRequest: false,
  pendingDirectWriteConfirmUntilMs: 0,
  sessionDelegationCalls: 0,
};

const DELEGATION_TOOL_NAMES = new Set([
  "subagent_run",
  "subagent_run_parallel",
  "agent_team_run",
  "agent_team_run_parallel",
]);
const ENFORCE_DELEGATION_FIRST = String(process.env.PI_ENFORCE_DELEGATION_FIRST ?? "1") === "1";
const DIRECT_WRITE_CONFIRM_WINDOW_MS = resolveDirectWriteConfirmWindowMs();

type LiveItemStatus = "pending" | "running" | "completed" | "failed";
type LiveStreamView = "stdout" | "stderr";
type LiveViewMode = "list" | "detail";

interface SubagentLiveItem {
  id: string;
  name: string;
  status: LiveItemStatus;
  startedAtMs?: number;
  finishedAtMs?: number;
  lastChunkAtMs?: number;
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
}

interface SubagentLiveMonitorController {
  markStarted: (agentId: string) => void;
  appendChunk: (agentId: string, stream: LiveStreamView, chunk: string) => void;
  markFinished: (
    agentId: string,
    status: "completed" | "failed",
    summary: string,
    error?: string,
  ) => void;
  close: () => void;
  wait: () => Promise<void>;
}

function getLiveStatusGlyph(status: LiveItemStatus): string {
  if (status === "completed") return "OK";
  if (status === "failed") return "!!";
  if (status === "running") return ">>";
  return "..";
}

function isEnterInput(rawInput: string): boolean {
  return (
    matchesKey(rawInput, Key.enter) ||
    rawInput === "\r" ||
    rawInput === "\n" ||
    rawInput === "\r\n" ||
    rawInput === "enter"
  );
}

function finalizeLiveLines(lines: string[], height?: number): string[] {
  if (!height || height <= 0) {
    return lines;
  }
  if (lines.length > height) {
    return lines.slice(0, height);
  }
  const padded = [...lines];
  while (padded.length < height) {
    padded.push("");
  }
  return padded;
}

function renderSubagentLiveView(input: {
  title: string;
  items: SubagentLiveItem[];
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

  if (items.length === 0) {
    add(theme.fg("dim", "[q] close"));
    add("");
    add(theme.fg("dim", "no running subagents"));
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
    add(theme.fg("dim", "[j/k] move  [up/down] move  [g/G] jump  [enter] detail  [tab] stream  [q] close"));
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
      const base = `${prefix} [${glyph}] ${item.id} (${item.name})`;
      const outLines = estimateLineCount(item.stdoutBytes, item.stdoutNewlineCount, item.stdoutEndsWithNewline);
      const errLines = estimateLineCount(item.stderrBytes, item.stderrNewlineCount, item.stderrEndsWithNewline);
      const meta = `${statusText} ${formatDurationMs(item)} out:${formatBytes(item.stdoutBytes)}/${outLines}l err:${formatBytes(item.stderrBytes)}/${errLines}l`;
      add(`${isSelected ? theme.fg("accent", base) : base} ${theme.fg("dim", meta)}`);
    }

    if (range.end < items.length) {
      add(theme.fg("dim", `... ${items.length - range.end} below ...`));
    }

    add("");
    add(
      theme.fg(
        "dim",
        `selected ${clampedCursor + 1}/${items.length}: ${selected.id} (${selected.name}) | status:${selected.status} | elapsed:${formatDurationMs(selected)}`,
      ),
    );

    const inlineMetadataLines = 4;
    const inlineMinPreviewLines = 3;
    const height = input.height ?? 0;
    const remaining = height > 0 ? height - lines.length : 0;
    const canShowInline = height > 0 && remaining >= inlineMetadataLines + inlineMinPreviewLines;

    if (!canShowInline) {
      add(theme.fg("dim", "press [enter] to open detailed output view"));
      return finalizeLiveLines(lines, input.height);
    }

    const previewStream: LiveStreamView =
      selected.status === "failed" &&
      input.stream === "stdout" &&
      selected.stdoutBytes === 0 &&
      selected.stderrBytes > 0
        ? "stderr"
        : input.stream;
    const selectedTail = previewStream === "stdout" ? selected.stdoutTail : selected.stderrTail;
    const inlinePreviewLimit = Math.max(
      inlineMinPreviewLines,
      Math.min(
        LIVE_PREVIEW_LINE_LIMIT,
        Math.max(1, height - lines.length - inlineMetadataLines),
      ),
    );
    const inlinePreview = renderPreviewWithMarkdown(selectedTail, input.width, inlinePreviewLimit);
    const summaryText = selected.summary || "-";
    const errorText = selected.error || "-";
    add(theme.fg("dim", `inline detail (${previewStream}) | [tab] switch stream`));
    add(theme.fg("dim", `summary: ${summaryText}`));
    add(theme.fg(selected.error ? "error" : "dim", `error: ${errorText}`));
    add(theme.fg("dim", `render mode: ${inlinePreview.renderedAsMarkdown ? "markdown" : "raw"}`));
    if (inlinePreview.lines.length === 0) {
      add(theme.fg("dim", "(no output yet)"));
    } else {
      for (const line of inlinePreview.lines) {
        add(line);
      }
    }
    return finalizeLiveLines(lines, input.height);
  }

  add(theme.fg("dim", "[j/k] move target  [up/down] move  [g/G] jump  [tab] stdout/stderr  [b|esc] back  [q] close"));
  add("");
  add(theme.bold(theme.fg("accent", `selected ${clampedCursor + 1}/${items.length}: ${selected.id} (${selected.name})`)));
  add(
    theme.fg(
      "dim",
      `status:${selected.status} | elapsed:${formatDurationMs(selected)} | started:${formatClockTime(selected.startedAtMs)} | last:${formatClockTime(selected.lastChunkAtMs)} | finished:${formatClockTime(selected.finishedAtMs)}`,
    ),
  );
  add(theme.fg("dim", `stdout ${formatBytes(selected.stdoutBytes)} (${selectedOutLines} lines)`));
  add(theme.fg("dim", `stderr ${formatBytes(selected.stderrBytes)} (${selectedErrLines} lines)`));
  if (selected.summary) {
    add(theme.fg("dim", `summary: ${selected.summary}`));
  }
  if (selected.error) {
    add(theme.fg(selected.status === "failed" ? "error" : "dim", `error: ${selected.error}`));
  }
  add("");
  const previewStream: LiveStreamView =
    selected.status === "failed" &&
    input.stream === "stdout" &&
    selected.stdoutBytes === 0 &&
    selected.stderrBytes > 0
      ? "stderr"
      : input.stream;
  const selectedTail = previewStream === "stdout" ? selected.stdoutTail : selected.stderrTail;
  const selectedStreamBytes = previewStream === "stdout" ? selected.stdoutBytes : selected.stderrBytes;
  const selectedStreamLines = previewStream === "stdout" ? selectedOutLines : selectedErrLines;
  add(
    theme.bold(
      theme.fg(
        "accent",
        `[${selected.id}] ${previewStream} tail (last ${LIVE_PREVIEW_LINE_LIMIT} lines | total ${formatBytes(
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
  return finalizeLiveLines(lines, input.height);
}

function createSubagentLiveMonitor(
  ctx: any,
  input: {
    title: string;
    items: Array<{ id: string; name: string }>;
  },
): SubagentLiveMonitorController | undefined {
  if (!ctx?.hasUI || !ctx?.ui?.custom) {
    return undefined;
  }

  const items: SubagentLiveItem[] = input.items.map((item) => ({
    id: item.id,
    name: item.name,
    status: "pending",
    stdoutTail: "",
    stderrTail: "",
    stdoutBytes: 0,
    stderrBytes: 0,
    stdoutNewlineCount: 0,
    stderrNewlineCount: 0,
    stdoutEndsWithNewline: false,
    stderrEndsWithNewline: false,
  }));
  const byId = new Map(items.map((item) => [item.id, item]));
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
          renderSubagentLiveView({
            title: input.title,
            items,
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
    markStarted: (agentId: string) => {
      const item = byId.get(agentId);
      if (!item || closed) return;
      item.status = "running";
      item.startedAtMs = Date.now();
      queueRender();
    },
    appendChunk: (agentId: string, targetStream: LiveStreamView, chunk: string) => {
      const item = byId.get(agentId);
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
    markFinished: (agentId: string, status: "completed" | "failed", summary: string, error?: string) => {
      const item = byId.get(agentId);
      if (!item || closed) return;
      item.status = status;
      item.summary = summary;
      item.error = error;
      item.finishedAtMs = Date.now();
      queueRender();
    },
    close,
    wait: async () => {
      await uiPromise;
    },
  };
}

function trimForError(message: string, maxLength = 600): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}

function isRetryableSubagentError(error: unknown, statusCode?: number): boolean {
  if (isRetryableError(error, statusCode)) {
    return true;
  }

  const message = toErrorMessage(error).toLowerCase();
  return message.includes("subagent returned empty output");
}

function isEmptyOutputFailureMessage(message: string): boolean {
  return message.toLowerCase().includes("subagent returned empty output");
}

function buildFailureSummary(message: string): string {
  const lowered = message.toLowerCase();
  if (lowered.includes("empty output")) return "(failed: empty output)";
  if (lowered.includes("timed out") || lowered.includes("timeout")) return "(failed: timeout)";
  if (lowered.includes("rate limit") || lowered.includes("429")) return "(failed: rate limit)";
  return "(failed)";
}

function buildRateLimitKey(provider: string, model: string): string {
  return `${provider.toLowerCase()}::${model.toLowerCase()}`;
}

function resolveSubagentFailureOutcome(error: unknown): RunOutcomeSignal {
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
  if (isRetryableSubagentError(error, statusCode)) {
    return { outcomeCode: "RETRYABLE_FAILURE", retryRecommended: true };
  }

  return { outcomeCode: "NONRETRYABLE_FAILURE", retryRecommended: false };
}

function resolveSubagentParallelOutcome(results: Array<{ runRecord: SubagentRunRecord }>): RunOutcomeSignal & {
  failedSubagentIds: string[];
} {
  const failed = results.filter((result) => result.runRecord.status === "failed");
  if (failed.length === 0) {
    return {
      outcomeCode: "SUCCESS",
      retryRecommended: false,
      failedSubagentIds: [],
    };
  }

  const failedSubagentIds = failed.map((result) => result.runRecord.agentId);
  const retryableFailureCount = failed.filter((result) => {
    const failure = resolveSubagentFailureOutcome(result.runRecord.error || result.runRecord.summary);
    return failure.retryRecommended;
  }).length;
  const hasAnySuccess = failed.length < results.length;

  if (hasAnySuccess) {
    return {
      outcomeCode: "PARTIAL_SUCCESS",
      retryRecommended: retryableFailureCount > 0,
      failedSubagentIds,
    };
  }

  return retryableFailureCount > 0
    ? {
        outcomeCode: "RETRYABLE_FAILURE",
        retryRecommended: true,
        failedSubagentIds,
      }
    : {
        outcomeCode: "NONRETRYABLE_FAILURE",
        retryRecommended: false,
        failedSubagentIds,
      };
}

function buildTraceTaskId(traceId: string | undefined, delegateId: string, sequence: number): string {
  const safeTrace = (traceId || "trace-unknown").trim();
  const safeDelegate = (delegateId || "delegate-unknown").trim();
  return `${safeTrace}:${safeDelegate}:${Math.max(0, Math.trunc(sequence))}`;
}

function decayAdaptivePenalty(nowMs = Date.now()): void {
  if (STABLE_SUBAGENT_RUNTIME) return;
  const elapsed = Math.max(0, nowMs - adaptiveParallelState.updatedAtMs);
  if (adaptiveParallelState.penalty <= 0 || elapsed < ADAPTIVE_PARALLEL_DECAY_MS) return;
  const steps = Math.floor(elapsed / ADAPTIVE_PARALLEL_DECAY_MS);
  if (steps <= 0) return;
  adaptiveParallelState.penalty = Math.max(0, adaptiveParallelState.penalty - steps);
  adaptiveParallelState.updatedAtMs = nowMs;
}

function raiseAdaptivePenalty(reason: "rate_limit" | "timeout" | "capacity"): void {
  if (STABLE_SUBAGENT_RUNTIME) {
    void reason;
    return;
  }
  decayAdaptivePenalty();
  adaptiveParallelState.penalty = Math.min(
    ADAPTIVE_PARALLEL_MAX_PENALTY,
    adaptiveParallelState.penalty + 1,
  );
  adaptiveParallelState.updatedAtMs = Date.now();
  void reason;
}

function lowerAdaptivePenalty(): void {
  if (STABLE_SUBAGENT_RUNTIME) return;
  decayAdaptivePenalty();
  if (adaptiveParallelState.penalty <= 0) return;
  adaptiveParallelState.penalty = Math.max(0, adaptiveParallelState.penalty - 1);
  adaptiveParallelState.updatedAtMs = Date.now();
}

function getAdaptivePenalty(): number {
  if (STABLE_SUBAGENT_RUNTIME) return 0;
  decayAdaptivePenalty();
  return adaptiveParallelState.penalty;
}

function applyAdaptiveParallelLimit(baseLimit: number): number {
  if (STABLE_SUBAGENT_RUNTIME) return Math.max(1, Math.trunc(baseLimit));
  const penalty = getAdaptivePenalty();
  if (penalty <= 0) return baseLimit;
  const divisor = penalty + 1;
  return Math.max(1, Math.floor(baseLimit / divisor));
}

function hasIntentOnlyContent(output: string): boolean {
  const compact = output.replace(/\s+/g, " ").trim();
  if (!compact) return false;
  const lower = compact.toLowerCase();
  const enIntentOnly =
    (lower.startsWith("i'll ") || lower.startsWith("i will ") || lower.startsWith("let me ")) &&
    /(analy|review|investig|start|check|examin|look)/.test(lower);
  const jaIntentOnly =
    /(確認|調査|分析|レビュー|検討|開始).{0,20}(します|します。|していきます|しますね|します。)/.test(compact);
  return enIntentOnly || jaIntentOnly;
}

function hasNonEmptyResultSection(output: string): boolean {
  const lines = output.split(/\r?\n/);
  const resultIndex = lines.findIndex((line) => /^\s*RESULT\s*:/i.test(line));
  if (resultIndex < 0) return false;

  const sameLineContent = lines[resultIndex].replace(/^\s*RESULT\s*:/i, "").trim();
  if (sameLineContent.length > 0) return true;

  for (let index = resultIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*[A-Z_]+\s*:/.test(line)) break;
    if (line.trim().length > 0) return true;
  }

  return false;
}

function validateSubagentOutput(output: string): { ok: boolean; reason?: string } {
  const trimmed = output.trim();
  if (!trimmed) {
    return { ok: false, reason: "empty output" };
  }

  const minChars = 48;
  if (trimmed.length < minChars) {
    return { ok: false, reason: `too short (${trimmed.length} chars)` };
  }

  const requiredLabels = ["SUMMARY:", "RESULT:", "NEXT_STEP:"];
  const missingLabels = requiredLabels.filter((label) => !new RegExp(`^\\s*${label}`, "im").test(trimmed));
  if (missingLabels.length > 0) {
    return { ok: false, reason: `missing labels: ${missingLabels.join(", ")}` };
  }
  if (!hasNonEmptyResultSection(trimmed)) {
    return { ok: false, reason: "empty RESULT section" };
  }

  const nonEmptyLines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (nonEmptyLines.length <= 3 && hasIntentOnlyContent(trimmed)) {
    return { ok: false, reason: "intent-only output" };
  }

  return { ok: true };
}

interface SubagentNormalizedOutput {
  ok: boolean;
  output: string;
  degraded: boolean;
  reason?: string;
}

function pickSubagentSummaryCandidate(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return "回答を整形しました。";

  const first =
    lines.find((line) => !/^(SUMMARY|RESULT|NEXT_STEP)\s*:/i.test(line)) ?? lines[0];
  const compact = first
    .replace(/^[-*]\s+/, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!compact) return "回答を整形しました。";
  return compact.length <= 90 ? compact : `${compact.slice(0, 90)}...`;
}

function normalizeSubagentOutput(output: string): SubagentNormalizedOutput {
  const trimmed = output.trim();
  if (!trimmed) {
    return { ok: false, output: "", degraded: false, reason: "empty output" };
  }

  const quality = validateSubagentOutput(trimmed);
  if (quality.ok) {
    return { ok: true, output: trimmed, degraded: false };
  }

  const summary = pickSubagentSummaryCandidate(trimmed);
  const nextStep = hasIntentOnlyContent(trimmed)
    ? "対象ファイルを確認し、具体的な差分を列挙する。"
    : "none";
  const structured = [
    `SUMMARY: ${summary}`,
    "",
    "RESULT:",
    trimmed,
    "",
    `NEXT_STEP: ${nextStep}`,
  ].join("\n");
  const structuredQuality = validateSubagentOutput(structured);
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

function normalizeTimeoutMs(value: unknown, fallback: number): number {
  const resolved = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  if (resolved <= 0) return 0;
  return Math.max(1, Math.trunc(resolved));
}

function createRetrySchema() {
  return Type.Optional(
    Type.Object({
      maxRetries: Type.Optional(Type.Number({ description: "Max retry count (ignored in stable profile)" })),
      initialDelayMs: Type.Optional(Type.Number({ description: "Initial backoff delay in ms (ignored in stable profile)" })),
      maxDelayMs: Type.Optional(Type.Number({ description: "Max backoff delay in ms (ignored in stable profile)" })),
      multiplier: Type.Optional(Type.Number({ description: "Backoff multiplier (ignored in stable profile)" })),
      jitter: Type.Optional(Type.String({ description: "Jitter mode: full | partial | none (ignored in stable profile)" })),
    }),
  );
}

function toRetryOverrides(value: unknown): RetryWithBackoffOverrides | undefined {
  // Stable profile: reject ad-hoc retry tuning to keep behavior deterministic.
  if (STABLE_SUBAGENT_RUNTIME) return undefined;
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

function toConcurrencyLimit(value: unknown, fallback: number): number {
  const resolved = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  if (resolved <= 0) return fallback;
  return Math.max(1, Math.trunc(resolved));
}

interface SubagentParallelCapacityResolution {
  allowed: boolean;
  requestedParallelism: number;
  appliedParallelism: number;
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

async function resolveSubagentParallelCapacity(input: {
  requestedParallelism: number;
  additionalRequests: number;
  maxWaitMs: number;
  pollIntervalMs: number;
  signal?: AbortSignal;
}): Promise<SubagentParallelCapacityResolution> {
  const requestedParallelism = Math.max(1, Math.trunc(input.requestedParallelism));
  let immediateAttempts = 0;
  for (let candidate = requestedParallelism; candidate >= 1; candidate -= 1) {
    immediateAttempts += 1;
    const attempt = tryReserveRuntimeCapacity({
      toolName: "subagent_run_parallel",
      additionalRequests: input.additionalRequests,
      additionalLlm: candidate,
    });
    if (attempt.allowed && attempt.reservation) {
      return {
        allowed: true,
        requestedParallelism,
        appliedParallelism: candidate,
        reduced: candidate < requestedParallelism,
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

  // Immediate枠が取れない場合は最小枠(1)を待機し、予約を取得してから実行する。
  const waitResult = await reserveRuntimeCapacity({
    toolName: "subagent_run_parallel",
    additionalRequests: input.additionalRequests,
    additionalLlm: 1,
    maxWaitMs: input.maxWaitMs,
    pollIntervalMs: input.pollIntervalMs,
    signal: input.signal,
  });

  if (!waitResult.allowed || !waitResult.reservation) {
    return {
      allowed: false,
      requestedParallelism,
      appliedParallelism: 1,
      reduced: requestedParallelism > 1,
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
    requestedParallelism,
    appliedParallelism: 1,
    reduced: requestedParallelism > 1,
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

function buildRuntimeLimitError(
  toolName: string,
  reasons: string[],
  options?: {
    waitedMs?: number;
    timedOut?: boolean;
  },
): string {
  const snapshot = getRuntimeSnapshot();
  const waitLine =
    options?.waitedMs === undefined
      ? undefined
      : `待機時間: ${options.waitedMs}ms${options.timedOut ? " (timeout)" : ""}`;
  return [
    `${toolName} blocked: runtime limit reached.`,
    ...reasons.map((reason) => `- ${reason}`),
    `現在: requests=${snapshot.totalActiveRequests}, llm=${snapshot.totalActiveLlm}`,
    `上限: requests=${snapshot.limits.maxTotalActiveRequests}, llm=${snapshot.limits.maxTotalActiveLlm}`,
    waitLine,
    "ヒント: 対象数を減らすか、実行中ジョブの完了を待って再実行してください。",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function buildRuntimeQueueWaitError(
  toolName: string,
  queueWait: {
    waitedMs: number;
    attempts: number;
    timedOut: boolean;
    aborted: boolean;
    queuePosition: number;
    queuedAhead: number;
  },
): string {
  const snapshot = getRuntimeSnapshot();
  const mode = queueWait.aborted ? "aborted" : queueWait.timedOut ? "timeout" : "blocked";
  const queuedPreview = snapshot.queuedTools.length > 0 ? snapshot.queuedTools.join(", ") : "-";
  return [
    `${toolName} blocked: orchestration queue ${mode}.`,
    `- queued_ahead: ${queueWait.queuedAhead}`,
    `- queue_position: ${queueWait.queuePosition}`,
    `- waited_ms: ${queueWait.waitedMs}`,
    `- attempts: ${queueWait.attempts}`,
    `現在: active_orchestrations=${snapshot.activeOrchestrations}, queued=${snapshot.queuedOrchestrations}`,
    `上限: max_concurrent_orchestrations=${snapshot.limits.maxConcurrentOrchestrations}`,
    `待機中ツール: ${queuedPreview}`,
    "ヒント: 同時に走らせる run を減らすか、先行ジョブ完了後に再実行してください。",
  ].join("\n");
}

function refreshRuntimeStatus(ctx: any): void {
  if (!ctx?.hasUI || !ctx?.ui) return;
  const snapshot = getRuntimeSnapshot();

  if (
    snapshot.totalActiveRequests <= 0 &&
    snapshot.totalActiveLlm <= 0 &&
    snapshot.activeOrchestrations <= 0 &&
    snapshot.queuedOrchestrations <= 0
  ) {
    ctx.ui.setStatus?.("subagent-runtime", undefined);
    return;
  }

  ctx.ui.setStatus?.(
    "subagent-runtime",
    [
      `LLM実行中:${snapshot.totalActiveLlm}`,
      `(Sub:${snapshot.subagentActiveAgents}/Team:${snapshot.teamActiveAgents})`,
      `Req:${snapshot.totalActiveRequests}`,
      `Queue:${snapshot.activeOrchestrations}/${snapshot.limits.maxConcurrentOrchestrations}+${snapshot.queuedOrchestrations}`,
    ].join(" "),
  );
}

function startReservationHeartbeat(
  reservation: RuntimeCapacityReservationLease,
): () => void {
  // 期限切れによるゾンビ予約を防ぐため、実行中は定期的にTTLを延長する。
  const intervalMs = 5_000;
  const timer = setInterval(() => {
    try {
      reservation.heartbeat();
    } catch {
      // noop
    }
  }, intervalMs);
  timer.unref?.();
  return () => {
    clearInterval(timer);
  };
}

function markDelegationUsed(): void {
  delegationState.delegatedThisRequest = true;
  delegationState.directWriteConfirmedThisRequest = false;
  delegationState.pendingDirectWriteConfirmUntilMs = 0;
  delegationState.sessionDelegationCalls += 1;
}

function resolveToolInputPath(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const record = input as Record<string, unknown>;
  const candidates = [
    record.path,
    record.file,
    record.filePath,
    record.file_path,
    record.pathname,
    record.targetPath,
    record.target_path,
    record.to,
  ];
  for (const value of candidates) {
    if (typeof value !== "string") continue;
    const normalized = value.trim().replace(/^@+/, "");
    if (normalized) return normalized;
  }
  return "";
}

function isDocumentationPath(pathValue: string): boolean {
  const normalized = pathValue.trim().replace(/\\/g, "/").toLowerCase();
  if (!normalized) return false;
  if (normalized.endsWith(".md") || normalized.endsWith(".mdx")) return true;
  if (normalized.endsWith("readme") || normalized.endsWith("readme.md")) return true;
  return (
    normalized.startsWith("docs/") ||
    normalized.includes("/docs/") ||
    normalized.startsWith(".pi/docs/") ||
    normalized.includes("/.pi/docs/")
  );
}

function isWriteLikeToolCall(event: any): boolean {
  const toolName = String(event?.toolName || "").toLowerCase();
  if (toolName === "edit" || toolName === "write") {
    const targetPath = resolveToolInputPath(event?.input);
    if (targetPath && isDocumentationPath(targetPath)) {
      // ドキュメント更新では委譲強制より編集体験を優先する。
      return false;
    }
    return true;
  }

  if (toolName === "bash") {
    const command = (event?.input as any)?.command;
    return typeof command === "string" && !isBashCommandAllowed(command);
  }

  return false;
}

function getPaths(cwd: string): SubagentPaths {
  const baseDir = join(cwd, ".pi", "subagents");
  return {
    baseDir,
    runsDir: join(baseDir, "runs"),
    storageFile: join(baseDir, "storage.json"),
  };
}

function ensurePaths(cwd: string): SubagentPaths {
  const paths = getPaths(cwd);
  ensureDir(paths.baseDir);
  ensureDir(paths.runsDir);
  return paths;
}

function createDefaultAgents(nowIso: string): SubagentDefinition[] {
  return [
    {
      id: "researcher",
      name: "Researcher",
      description: "Fast code and docs investigator. Great for broad discovery and fact collection.",
      systemPrompt:
        "You are the Researcher subagent. Collect concrete facts quickly. Use short bullet points. Include file paths and exact findings. Avoid implementation changes.",
      enabled: "enabled",
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "architect",
      name: "Architect",
      description: "Design-focused helper for decomposition, constraints, and migration plans.",
      systemPrompt:
        "You are the Architect subagent. Propose minimal, modular designs. Prefer explicit trade-offs and short execution plans.",
      enabled: "enabled",
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "implementer",
      name: "Implementer",
      description: "Implementation helper for scoped coding tasks and fixes.",
      systemPrompt:
        "You are the Implementer subagent. Deliver precise, minimal code-focused output. Mention assumptions. Keep scope tight.",
      enabled: "enabled",
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "reviewer",
      name: "Reviewer",
      description: "Read-only reviewer for risk checks, tests, and quality feedback.",
      systemPrompt:
        "You are the Reviewer subagent. Do not propose broad rewrites. Highlight critical issues first, then warnings, then optional improvements.",
      enabled: "enabled",
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "tester",
      name: "Tester",
      description: "Validation helper focused on reproducible checks and minimal test plans.",
      systemPrompt:
        "You are the Tester subagent. Propose deterministic validation steps first. Prefer quick, high-signal checks and explicit expected outcomes.",
      enabled: "enabled",
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];
}

function loadStorage(cwd: string): SubagentStorage {
  const paths = ensurePaths(cwd);
  const nowIso = new Date().toISOString();

  const fallback: SubagentStorage = {
    agents: createDefaultAgents(nowIso),
    runs: [],
    currentAgentId: "researcher",
    defaultsVersion: SUBAGENT_DEFAULTS_VERSION,
  };

  if (!existsSync(paths.storageFile)) {
    saveStorage(cwd, fallback);
    return fallback;
  }

  try {
    const parsed = JSON.parse(readFileSync(paths.storageFile, "utf-8")) as Partial<SubagentStorage>;
    const storage: SubagentStorage = {
      agents: Array.isArray(parsed.agents) ? parsed.agents : [],
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      currentAgentId: typeof parsed.currentAgentId === "string" ? parsed.currentAgentId : undefined,
      defaultsVersion:
        typeof parsed.defaultsVersion === "number" && Number.isFinite(parsed.defaultsVersion)
          ? Math.trunc(parsed.defaultsVersion)
          : 0,
    };
    return ensureDefaults(storage, nowIso);
  } catch {
    saveStorage(cwd, fallback);
    return fallback;
  }
}

function saveStorage(cwd: string, storage: SubagentStorage): void {
  const paths = ensurePaths(cwd);
  const normalized: SubagentStorage = {
    ...storage,
    runs: storage.runs.slice(-MAX_RUNS_TO_KEEP),
    defaultsVersion: SUBAGENT_DEFAULTS_VERSION,
  };
  withFileLock(paths.storageFile, () => {
    const merged = mergeSubagentStorageWithDisk(paths.storageFile, normalized);
    atomicWriteTextFile(paths.storageFile, JSON.stringify(merged, null, 2));
    pruneSubagentRunArtifacts(paths, merged.runs);
  });
}

function ensureDefaults(storage: SubagentStorage, nowIso: string): SubagentStorage {
  const defaults = createDefaultAgents(nowIso);
  const defaultIds = new Set(defaults.map((agent) => agent.id));
  const existingById = new Map(storage.agents.map((agent) => [agent.id, agent]));
  const mergedAgents: SubagentDefinition[] = [];

  // Keep built-in definitions synchronized so prompt updates actually apply.
  for (const defaultAgent of defaults) {
    const existing = existingById.get(defaultAgent.id);
    if (!existing) {
      mergedAgents.push(defaultAgent);
      continue;
    }
    mergedAgents.push(mergeDefaultSubagent(existing, defaultAgent));
  }

  // Preserve user-defined agents as-is.
  for (const agent of storage.agents) {
    if (!defaultIds.has(agent.id)) {
      mergedAgents.push(agent);
    }
  }

  storage.agents = mergedAgents;
  storage.defaultsVersion = SUBAGENT_DEFAULTS_VERSION;

  if (!storage.currentAgentId || !storage.agents.some((agent) => agent.id === storage.currentAgentId)) {
    storage.currentAgentId = defaults[0]?.id;
  }

  return storage;
}

function mergeDefaultSubagent(
  existing: SubagentDefinition,
  fallback: SubagentDefinition,
): SubagentDefinition {
  const hasDrift =
    existing.name !== fallback.name ||
    existing.description !== fallback.description ||
    existing.systemPrompt !== fallback.systemPrompt;
  return {
    ...fallback,
    enabled: existing.enabled,
    provider: existing.provider,
    model: existing.model,
    createdAt: existing.createdAt || fallback.createdAt,
    updatedAt: hasDrift ? new Date().toISOString() : existing.updatedAt || fallback.updatedAt,
  };
}

function pruneSubagentRunArtifacts(paths: SubagentPaths, runs: SubagentRunRecord[]): void {
  let files: string[] = [];
  try {
    files = readdirSync(paths.runsDir);
  } catch {
    return;
  }

  const keep = new Set(
    runs
      .map((run) => basename(run.outputFile || ""))
      .filter((name) => name.endsWith(".json")),
  );
  if (runs.length > 0 && keep.size === 0) {
    return;
  }

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    if (keep.has(file)) continue;
    try {
      unlinkSync(join(paths.runsDir, file));
    } catch {
      // noop
    }
  }
}

function mergeSubagentStorageWithDisk(
  storageFile: string,
  next: SubagentStorage,
): SubagentStorage {
  let disk: Partial<SubagentStorage> = {};
  try {
    if (existsSync(storageFile)) {
      disk = JSON.parse(readFileSync(storageFile, "utf-8")) as Partial<SubagentStorage>;
    }
  } catch {
    disk = {};
  }

  const diskAgents = Array.isArray(disk.agents) ? disk.agents : [];
  const nextAgents = Array.isArray(next.agents) ? next.agents : [];
  const agentById = new Map<string, SubagentDefinition>();
  for (const agent of diskAgents) {
    if (!agent || typeof agent !== "object") continue;
    if (typeof (agent as { id?: unknown }).id !== "string") continue;
    const id = (agent as { id: string }).id.trim();
    if (!id) continue;
    agentById.set(agent.id, agent);
  }
  for (const agent of nextAgents) {
    if (!agent || typeof agent !== "object") continue;
    if (typeof (agent as { id?: unknown }).id !== "string") continue;
    const id = (agent as { id: string }).id.trim();
    if (!id) continue;
    agentById.set(agent.id, agent);
  }
  const mergedAgents = Array.from(agentById.values());

  const diskRuns = Array.isArray(disk.runs) ? disk.runs : [];
  const nextRuns = Array.isArray(next.runs) ? next.runs : [];
  const runById = new Map<string, SubagentRunRecord>();
  for (const run of diskRuns) {
    if (!run || typeof run !== "object") continue;
    if (typeof (run as { runId?: unknown }).runId !== "string") continue;
    const runId = (run as { runId: string }).runId.trim();
    if (!runId) continue;
    runById.set(run.runId, run);
  }
  for (const run of nextRuns) {
    if (!run || typeof run !== "object") continue;
    if (typeof (run as { runId?: unknown }).runId !== "string") continue;
    const runId = (run as { runId: string }).runId.trim();
    if (!runId) continue;
    runById.set(run.runId, run);
  }
  const mergedRuns = Array.from(runById.values())
    .sort((left, right) => {
      const leftKey = left.finishedAt || left.startedAt || "";
      const rightKey = right.finishedAt || right.startedAt || "";
      return leftKey.localeCompare(rightKey);
    })
    .slice(-MAX_RUNS_TO_KEEP);

  const candidateCurrent =
    typeof next.currentAgentId === "string" && next.currentAgentId.trim()
      ? next.currentAgentId
      : typeof disk.currentAgentId === "string" && disk.currentAgentId.trim()
        ? disk.currentAgentId
        : undefined;
  const currentAgentId =
    candidateCurrent && mergedAgents.some((agent) => agent.id === candidateCurrent)
      ? candidateCurrent
      : mergedAgents[0]?.id;

  const diskDefaults =
    typeof disk.defaultsVersion === "number" && Number.isFinite(disk.defaultsVersion)
      ? Math.trunc(disk.defaultsVersion)
      : 0;

  return {
    agents: mergedAgents,
    runs: mergedRuns,
    currentAgentId,
    defaultsVersion: Math.max(SUBAGENT_DEFAULTS_VERSION, diskDefaults),
  };
}

function toAgentId(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\-\s_]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/\-+/g, "-")
    .replace(/^\-+|\-+$/g, "")
    .slice(0, 48);
}

function formatAgentList(storage: SubagentStorage): string {
  if (storage.agents.length === 0) {
    return "No subagents found.";
  }

  const lines: string[] = ["Subagents:"];
  for (const agent of storage.agents) {
    const mark = agent.id === storage.currentAgentId ? "*" : " ";
    lines.push(
      `${mark} ${agent.id} (${agent.enabled}) - ${agent.name}\n  ${agent.description}`,
    );
  }
  return lines.join("\n");
}

function formatRecentRuns(storage: SubagentStorage, limit = 10): string {
  const runs = storage.runs.slice(-limit).reverse();
  if (runs.length === 0) {
    return "No subagent runs yet.";
  }

  const lines: string[] = ["Recent subagent runs:"];
  for (const run of runs) {
    lines.push(
      `- ${run.runId} | ${run.agentId} | ${run.status} | ${run.summary} | ${run.startedAt}`,
    );
  }
  return lines.join("\n");
}

function extractSummary(output: string): string {
  const match = output.match(/^\s*summary\s*:\s*(.+)$/im);
  if (match?.[1]) {
    return match[1].trim();
  }

  const first = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!first) {
    return "(no summary)";
  }

  return first.length > 120 ? `${first.slice(0, 120)}...` : first;
}

function buildSubagentPrompt(input: {
  agent: SubagentDefinition;
  task: string;
  extraContext?: string;
  enforcePlanMode?: boolean;
}): string {
  const lines: string[] = [];
  lines.push(`You are running as delegated subagent: ${input.agent.name} (${input.agent.id}).`);
  lines.push(`Role description: ${input.agent.description}`);
  lines.push("");
  lines.push("Subagent operating instructions:");
  lines.push(input.agent.systemPrompt);
  lines.push("");
  lines.push("Task from lead agent:");
  lines.push(input.task);

  if (input.extraContext?.trim()) {
    lines.push("");
    lines.push("Extra context:");
    lines.push(input.extraContext.trim());
  }

  // Subagent plan mode enforcement
  if (input.enforcePlanMode) {
    lines.push("");
    lines.push(PLAN_MODE_WARNING);
  }

  lines.push("");
  lines.push(getSubagentExecutionRules(true));

  lines.push("");
  lines.push("Output format (strict):");
  lines.push("SUMMARY: <short summary>");
  lines.push("CLAIM: <1-sentence core claim (optional, for research/analysis tasks)>");
  lines.push("EVIDENCE: <comma-separated evidence with file:line references where possible (optional)>");
  lines.push("CONFIDENCE: <0.00-1.00 (optional, for research/analysis tasks)>");
  lines.push("DISCUSSION: <when working with other agents: references to their outputs, agreements/disagreements, consensus (optional)>");
  lines.push("RESULT:");
  lines.push("<main answer>");
  lines.push("NEXT_STEP: <specific next action or none>");

  return lines.join("\n");
}

async function runPiPrintMode(input: {
  provider?: string;
  model?: string;
  prompt: string;
  timeoutMs: number;
  signal?: AbortSignal;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
}): Promise<PrintCommandResult> {
  if (input.signal?.aborted) {
    throw new Error("subagent run aborted");
  }

  const args = ["-p", "--no-extensions"];

  if (input.provider) {
    args.push("--provider", input.provider);
  }

  if (input.model) {
    args.push("--model", input.model);
  }

  args.push(input.prompt);

  return await new Promise<PrintCommandResult>((resolvePromise, rejectPromise) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let forceKillTimer: NodeJS.Timeout | undefined;
    const startedAt = Date.now();

    const child = spawn("pi", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const killSafely = (sig: NodeJS.Signals) => {
      if (!child.killed) {
        try {
          child.kill(sig);
        } catch {
          // noop
        }
      }
    };

    const onAbort = () => {
      killSafely("SIGTERM");
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }
      forceKillTimer = setTimeout(() => killSafely("SIGKILL"), 500);
      finish(() => rejectPromise(new Error("subagent run aborted")));
    };

    const timeoutEnabled = input.timeoutMs > 0;
    const timeout = timeoutEnabled
      ? setTimeout(() => {
          timedOut = true;
          killSafely("SIGTERM");
          if (forceKillTimer) {
            clearTimeout(forceKillTimer);
          }
          forceKillTimer = setTimeout(() => killSafely("SIGKILL"), 500);
        }, input.timeoutMs)
      : undefined;

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }
      input.signal?.removeEventListener("abort", onAbort);
    };

    input.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      stdout += text;
      input.onStdoutChunk?.(text);
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      stderr += text;
      input.onStderrChunk?.(text);
    });

    child.on("error", (error) => {
      finish(() => rejectPromise(error));
    });

    child.on("close", (code) => {
      finish(() => {
        if (timedOut) {
          rejectPromise(new Error(`subagent timed out after ${input.timeoutMs}ms`));
          return;
        }

        if (code !== 0) {
          rejectPromise(new Error(stderr.trim() || `subagent exited with code ${code}`));
          return;
        }

        const output = stdout.trim();
        if (!output) {
          const stderrMessage = trimForError(stderr);
          rejectPromise(
            new Error(
              stderrMessage
                ? `subagent returned empty output; stderr=${stderrMessage}`
                : "subagent returned empty output",
            ),
          );
          return;
        }

        resolvePromise({
          output,
          latencyMs: Date.now() - startedAt,
        });
      });
    });
  });
}

function pickAgent(storage: SubagentStorage, requestedId?: string): SubagentDefinition | undefined {
  if (requestedId) {
    return storage.agents.find((agent) => agent.id === requestedId);
  }

  if (storage.currentAgentId) {
    const current = storage.agents.find((agent) => agent.id === storage.currentAgentId);
    if (current) return current;
  }

  return storage.agents.find((agent) => agent.enabled === "enabled");
}

function pickDefaultParallelAgents(storage: SubagentStorage): SubagentDefinition[] {
  const enabledAgents = storage.agents.filter((agent) => agent.enabled === "enabled");
  if (enabledAgents.length === 0) return [];

  const mode = String(process.env.PI_SUBAGENT_PARALLEL_DEFAULT || "current")
    .trim()
    .toLowerCase();
  if (mode === "all") {
    return enabledAgents;
  }

  const currentEnabled = storage.currentAgentId
    ? enabledAgents.find((agent) => agent.id === storage.currentAgentId)
    : undefined;
  if (currentEnabled) {
    return [currentEnabled];
  }

  return enabledAgents.slice(0, 1);
}

async function runSubagentTask(input: {
  agent: SubagentDefinition;
  task: string;
  extraContext?: string;
  timeoutMs: number;
  cwd: string;
  retryOverrides?: RetryWithBackoffOverrides;
  modelProvider?: string;
  modelId?: string;
  signal?: AbortSignal;
  onStart?: () => void;
  onEnd?: () => void;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
}): Promise<{ runRecord: SubagentRunRecord; output: string; prompt: string }> {
  const runId = createRunId();
  const startedAtMs = Date.now();
  const startedAt = new Date().toISOString();
  const paths = ensurePaths(input.cwd);
  const outputFile = join(paths.runsDir, `${runId}.json`);

  // Check if plan mode is active (via environment variable set by plan.ts)
  const planModeActive = isPlanModeActive();

  const prompt = buildSubagentPrompt({
    agent: input.agent,
    task: input.task,
    extraContext: input.extraContext,
    enforcePlanMode: planModeActive,
  });
  const resolvedProvider = input.agent.provider ?? input.modelProvider ?? "(session-default)";
  const resolvedModel = input.agent.model ?? input.modelId ?? "(session-default)";
  const rateLimitKey = buildRateLimitKey(resolvedProvider, resolvedModel);
  let retryCount = 0;
  let lastRetryStatusCode: number | undefined;
  let lastRetryMessage = "";
  let lastRateLimitWaitMs = 0;
  let lastRateLimitHits = 0;
  let rateLimitGateLogged = false;
  let rateLimitStderrLogged = false;
  const effectiveRetryOverrides: RetryWithBackoffOverrides | undefined = STABLE_SUBAGENT_RUNTIME
    ? {
        // Stable profile: avoid immediate 429 failures by allowing bounded retries.
        maxRetries: STABLE_SUBAGENT_MAX_RETRIES,
        initialDelayMs: STABLE_SUBAGENT_INITIAL_DELAY_MS,
        maxDelayMs: STABLE_SUBAGENT_MAX_DELAY_MS,
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
    input.onStderrChunk?.(chunk);
  };

  input.onStart?.();
  try {
    try {
      const commandResult = await retryWithBackoff(
        async () => {
          const result = await runPiPrintMode({
            provider: input.agent.provider ?? input.modelProvider,
            model: input.agent.model ?? input.modelId,
            prompt,
            timeoutMs: input.timeoutMs,
            signal: input.signal,
            onStdoutChunk: input.onStdoutChunk,
            onStderrChunk: emitStderrChunk,
          });
          const normalized = normalizeSubagentOutput(result.output);
          if (!normalized.ok) {
            throw new Error(`subagent low-substance output: ${normalized.reason}`);
          }
          if (normalized.degraded) {
            emitStderrChunk(
              `[normalize] subagent output normalized: reason=${normalized.reason || "format-mismatch"}\n`,
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
          maxRateLimitRetries: STABLE_SUBAGENT_MAX_RATE_LIMIT_RETRIES,
          maxRateLimitWaitMs: STABLE_SUBAGENT_MAX_RATE_LIMIT_WAIT_MS,
          onRateLimitWait: ({ waitMs, hits }) => {
            lastRateLimitWaitMs = waitMs;
            lastRateLimitHits = hits;
            if (!rateLimitGateLogged) {
              rateLimitGateLogged = true;
              emitStderrChunk(
                `[rate-limit-gate] provider=${resolvedProvider} model=${resolvedModel} wait=${waitMs}ms hits=${hits}\n`,
              );
            }
          },
          shouldRetry: (error, statusCode) => isRetryableSubagentError(error, statusCode),
          onRetry: ({ attempt, statusCode, error }) => {
            retryCount = attempt;
            lastRetryStatusCode = statusCode;
            lastRetryMessage = trimForError(toErrorMessage(error), 160);
            const shouldLog =
              statusCode !== 429 || attempt === 1;
            if (shouldLog) {
              const errorText = statusCode === 429 ? "rate limit" : lastRetryMessage;
              emitStderrChunk(
                `[retry] attempt=${attempt} status=${statusCode ?? "-"} error=${errorText}\n`,
              );
            }
          },
        },
      );

      const summary = extractSummary(commandResult.output);
      const finishedAt = new Date().toISOString();

      const runRecord: SubagentRunRecord = {
        runId,
        agentId: input.agent.id,
        task: input.task,
        summary,
        status: "completed",
        startedAt,
        finishedAt,
        latencyMs: commandResult.latencyMs,
        outputFile,
      };

      writeFileSync(
        outputFile,
        JSON.stringify(
          {
            run: runRecord,
            prompt,
            output: commandResult.output,
          },
          null,
          2,
        ),
        "utf-8",
      );

      return {
        runRecord,
        output: commandResult.output,
        prompt,
      };
    } catch (error) {
      let message = toErrorMessage(error);
      let recoveredOutput = "";

      // 空出力だけは1回だけ救済リランする。成功すれば failed を回避する。
      if (isEmptyOutputFailureMessage(message)) {
        if (input.signal?.aborted) {
          message = "subagent run aborted";
        } else {
          const recoveryPrompt = [
            prompt,
            "",
            "重要: 直前の実行が空出力でした。必ず Output format を満たして出力してください。",
          ].join("\n");
          const recoveryTimeoutMs =
            input.timeoutMs > 0 ? Math.min(input.timeoutMs, 180_000) : 180_000;
          try {
            const recoveryResult = await runPiPrintMode({
              provider: input.agent.provider ?? input.modelProvider,
              model: input.agent.model ?? input.modelId,
              prompt: recoveryPrompt,
              timeoutMs: recoveryTimeoutMs,
              signal: input.signal,
              onStdoutChunk: input.onStdoutChunk,
              onStderrChunk: emitStderrChunk,
            });
            const recoveryNormalized = normalizeSubagentOutput(recoveryResult.output);
            if (recoveryNormalized.ok) {
              recoveredOutput = recoveryNormalized.output;
              const finishedAt = new Date().toISOString();
              const summary = extractSummary(recoveredOutput);
              const runRecord: SubagentRunRecord = {
                runId,
                agentId: input.agent.id,
                task: input.task,
                summary,
                status: "completed",
                startedAt,
                finishedAt,
                latencyMs: recoveryResult.latencyMs,
                outputFile,
              };
              writeFileSync(
                outputFile,
                JSON.stringify(
                  {
                    run: runRecord,
                    prompt,
                    output: recoveredOutput,
                    recovery: {
                      used: true,
                      reason: "empty_output",
                      timeoutMs: recoveryTimeoutMs,
                      normalized: recoveryNormalized.degraded,
                      normalizeReason: recoveryNormalized.reason,
                    },
                  },
                  null,
                  2,
                ),
                "utf-8",
              );
              return {
                runRecord,
                output: recoveredOutput,
                prompt,
              };
            }
            message = `subagent recovery output rejected: ${recoveryNormalized.reason || "unknown quality error"}`;
          } catch (recoveryError) {
            message = `${message}; recovery_failed=${trimForError(toErrorMessage(recoveryError), 220)}`;
          }
        }
      }

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
      if (diagnostic) {
        message = `${message} | ${diagnostic}`;
      }

      const finishedAt = new Date().toISOString();
      const runRecord: SubagentRunRecord = {
        runId,
        agentId: input.agent.id,
        task: input.task,
        summary: buildFailureSummary(message),
        status: "failed",
        startedAt,
        finishedAt,
        latencyMs: Math.max(0, Date.now() - startedAtMs),
        outputFile,
        error: message,
      };

      writeFileSync(
        outputFile,
        JSON.stringify(
          {
            run: runRecord,
            prompt,
            output: "",
            error: message,
          },
          null,
          2,
        ),
        "utf-8",
      );

      return {
        runRecord,
        output: "",
        prompt,
      };
    }
  } finally {
    input.onEnd?.();
  }
}

export default function registerSubagentExtension(pi: ExtensionAPI) {
  // サブエージェント一覧
  pi.registerTool({
    name: "subagent_list",
    label: "Subagent List",
    description: "List all subagent definitions and the current default subagent.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const storage = loadStorage(ctx.cwd);
      saveStorage(ctx.cwd, storage);

      return {
        content: [{ type: "text" as const, text: formatAgentList(storage) }],
        details: {
          currentAgentId: storage.currentAgentId,
          agents: storage.agents,
        },
      };
    },
  });

  // サブエージェント作成
  pi.registerTool({
    name: "subagent_create",
    label: "Subagent Create",
    description: "Create a custom subagent definition for delegated runs.",
    parameters: Type.Object({
      id: Type.Optional(Type.String({ description: "Unique id (lowercase-hyphen). Optional." })),
      name: Type.String({ description: "Display name for the subagent" }),
      description: Type.String({ description: "When this subagent should be used" }),
      systemPrompt: Type.String({ description: "Core instruction prompt for this subagent" }),
      provider: Type.Optional(Type.String({ description: "Optional provider override" })),
      model: Type.Optional(Type.String({ description: "Optional model override" })),
      setCurrent: Type.Optional(Type.Boolean({ description: "Set this subagent as current default" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const storage = loadStorage(ctx.cwd);
      const nowIso = new Date().toISOString();

      const resolvedId = toAgentId(params.id || params.name);
      if (!resolvedId) {
        return {
          content: [{ type: "text" as const, text: "subagent_create error: id could not be generated." }],
          details: { error: "invalid_id" },
        };
      }

      if (storage.agents.some((agent) => agent.id === resolvedId)) {
        return {
          content: [{ type: "text" as const, text: `subagent_create error: id already exists (${resolvedId}).` }],
          details: { error: "duplicate_id", id: resolvedId },
        };
      }

      const newAgent: SubagentDefinition = {
        id: resolvedId,
        name: params.name,
        description: params.description,
        systemPrompt: params.systemPrompt,
        provider: params.provider,
        model: params.model,
        enabled: "enabled",
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      storage.agents.push(newAgent);
      if (params.setCurrent) {
        storage.currentAgentId = newAgent.id;
      }

      saveStorage(ctx.cwd, storage);

      return {
        content: [{ type: "text" as const, text: `Created subagent: ${newAgent.id} (${newAgent.name})` }],
        details: { agent: newAgent, currentAgentId: storage.currentAgentId },
      };
    },
  });

  // サブエージェント設定更新（有効/無効、デフォルト変更）
  pi.registerTool({
    name: "subagent_configure",
    label: "Subagent Configure",
    description: "Update enabled state or set current default subagent.",
    parameters: Type.Object({
      subagentId: Type.String({ description: "Target subagent id" }),
      enabled: Type.Optional(Type.Boolean({ description: "Enable or disable the subagent" })),
      setCurrent: Type.Optional(Type.Boolean({ description: "Set as current default subagent" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const storage = loadStorage(ctx.cwd);
      const agent = storage.agents.find((item) => item.id === params.subagentId);

      if (!agent) {
        return {
          content: [{ type: "text" as const, text: `subagent_configure error: not found (${params.subagentId})` }],
          details: { error: "not_found" },
        };
      }

      if (params.enabled !== undefined) {
        agent.enabled = params.enabled ? "enabled" : "disabled";
        agent.updatedAt = new Date().toISOString();
      }

      if (params.setCurrent) {
        storage.currentAgentId = agent.id;
      }

      saveStorage(ctx.cwd, storage);

      return {
        content: [
          {
            type: "text" as const,
            text: `Updated subagent: ${agent.id} (${agent.enabled})${storage.currentAgentId === agent.id ? " [current]" : ""}`,
          },
        ],
        details: {
          agent,
          currentAgentId: storage.currentAgentId,
        },
      };
    },
  });

  // サブエージェント実行
  pi.registerTool({
    name: "subagent_run",
    label: "Subagent Run",
    description:
      "Run one focused delegated task with one subagent. Use this as a single-specialist fallback when subagent_run_parallel with 2+ specialists is not needed.",
    parameters: Type.Object({
      task: Type.String({ description: "Task for the delegated subagent" }),
      subagentId: Type.Optional(Type.String({ description: "Target subagent id. Defaults to current subagent" })),
      extraContext: Type.Optional(Type.String({ description: "Optional supplemental context" })),
      timeoutMs: Type.Optional(Type.Number({ description: "Timeout in milliseconds (default: 600000). Use 0 to disable timeout." })),
      retry: createRetrySchema(),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const storage = loadStorage(ctx.cwd);
      const agent = pickAgent(storage, params.subagentId);
      const retryOverrides = toRetryOverrides(params.retry);

      if (!agent) {
        return {
          content: [{ type: "text" as const, text: "subagent_run error: no available subagent." }],
          details: {
            error: "missing_subagent",
            outcomeCode: "NONRETRYABLE_FAILURE" as RunOutcomeCode,
            retryRecommended: false,
          },
        };
      }

      if (agent.enabled !== "enabled") {
        return {
          content: [{ type: "text" as const, text: `subagent_run error: subagent is disabled (${agent.id}).` }],
          details: {
            error: "subagent_disabled",
            subagentId: agent.id,
            outcomeCode: "NONRETRYABLE_FAILURE" as RunOutcomeCode,
            retryRecommended: false,
          },
        };
      }

      const queueSnapshot = getRuntimeSnapshot();
      const queueWait = await waitForRuntimeOrchestrationTurn({
        toolName: "subagent_run",
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
              text: buildRuntimeQueueWaitError("subagent_run", queueWait),
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
        const snapshot = getRuntimeSnapshot();
        const capacityCheck = await reserveRuntimeCapacity({
          toolName: "subagent_run",
          additionalRequests: 1,
          additionalLlm: 1,
          maxWaitMs: snapshot.limits.capacityWaitMs,
          pollIntervalMs: snapshot.limits.capacityPollMs,
          signal,
        });
        if (!capacityCheck.allowed || !capacityCheck.reservation) {
          raiseAdaptivePenalty("capacity");
          const capacityOutcome: RunOutcomeSignal = capacityCheck.aborted
            ? { outcomeCode: "CANCELLED", retryRecommended: false }
            : capacityCheck.timedOut
              ? { outcomeCode: "TIMEOUT", retryRecommended: true }
              : { outcomeCode: "RETRYABLE_FAILURE", retryRecommended: true };
          return {
            content: [
              {
                type: "text" as const,
                text: buildRuntimeLimitError("subagent_run", capacityCheck.reasons, {
                  waitedMs: capacityCheck.waitedMs,
                  timedOut: capacityCheck.timedOut,
                }),
              },
            ],
            details: {
              error: "runtime_limit_reached",
              reasons: capacityCheck.reasons,
              projectedRequests: capacityCheck.projectedRequests,
              projectedLlm: capacityCheck.projectedLlm,
              waitedMs: capacityCheck.waitedMs,
              timedOut: capacityCheck.timedOut,
              aborted: capacityCheck.aborted,
              adaptiveParallelPenalty: getAdaptivePenalty(),
              queuedAhead: queueWait.queuedAhead,
              queuePosition: queueWait.queuePosition,
              queueWaitedMs: queueWait.waitedMs,
              traceId: queueWait.orchestrationId,
              outcomeCode: capacityOutcome.outcomeCode,
              retryRecommended: capacityOutcome.retryRecommended,
            },
          };
        }
        const capacityReservation = capacityCheck.reservation;
        const stopReservationHeartbeat = startReservationHeartbeat(capacityReservation);

        try {
          const timeoutMs = normalizeTimeoutMs(params.timeoutMs, DEFAULT_AGENT_TIMEOUT_MS);
          const liveMonitor = createSubagentLiveMonitor(ctx, {
            title: "Subagent Run (detailed live view)",
            items: [{ id: agent.id, name: agent.name }],
          });

          runtimeState.activeRunRequests += 1;
          notifyRuntimeCapacityChanged();
          refreshRuntimeStatus(ctx);
          // 予約は admission 制御のためだけに使い、開始後は active カウンタへ責務を移す。
          capacityReservation.consume();
          try {
            const result = await runSubagentTask({
              agent,
              task: params.task,
              extraContext: params.extraContext,
              timeoutMs,
              cwd: ctx.cwd,
              retryOverrides,
              modelProvider: ctx.model?.provider,
              modelId: ctx.model?.id,
              signal,
              onStart: () => {
                liveMonitor?.markStarted(agent.id);
                runtimeState.activeAgents += 1;
                notifyRuntimeCapacityChanged();
                refreshRuntimeStatus(ctx);
              },
              onEnd: () => {
                runtimeState.activeAgents = Math.max(0, runtimeState.activeAgents - 1);
                notifyRuntimeCapacityChanged();
                refreshRuntimeStatus(ctx);
              },
              onStdoutChunk: (chunk) => {
                liveMonitor?.appendChunk(agent.id, "stdout", chunk);
              },
              onStderrChunk: (chunk) => {
                liveMonitor?.appendChunk(agent.id, "stderr", chunk);
              },
            });
            liveMonitor?.markFinished(
              agent.id,
              result.runRecord.status,
              result.runRecord.summary,
              result.runRecord.error,
            );

            storage.runs.push(result.runRecord);
            saveStorage(ctx.cwd, storage);
            pi.appendEntry("subagent-run", result.runRecord);

            if (result.runRecord.status === "failed") {
              const pressureError = classifyPressureError(result.runRecord.error || "");
              if (pressureError !== "other") {
                raiseAdaptivePenalty(pressureError);
              }
              const failureOutcome = resolveSubagentFailureOutcome(
                result.runRecord.error || result.runRecord.summary,
              );
              return {
                content: [{ type: "text" as const, text: `subagent_run failed: ${result.runRecord.error}` }],
                details: {
                  error: result.runRecord.error,
                  run: result.runRecord,
                  traceId: queueWait.orchestrationId,
                  taskId: buildTraceTaskId(queueWait.orchestrationId, result.runRecord.agentId, 0),
                  adaptiveParallelPenalty: getAdaptivePenalty(),
                  queuedAhead: queueWait.queuedAhead,
                  queuePosition: queueWait.queuePosition,
                  queueWaitedMs: queueWait.waitedMs,
                  outcomeCode: failureOutcome.outcomeCode,
                  retryRecommended: failureOutcome.retryRecommended,
                },
              };
            }

            lowerAdaptivePenalty();

            return {
              content: [
                {
                  type: "text" as const,
                  text: [
                    `Subagent run completed: ${result.runRecord.runId}`,
                    `Subagent: ${agent.id} (${agent.name})`,
                    `Summary: ${result.runRecord.summary}`,
                    `Latency: ${result.runRecord.latencyMs}ms`,
                    `Output file: ${result.runRecord.outputFile}`,
                    "",
                    result.output,
                  ].join("\n"),
                },
              ],
              details: {
                run: result.runRecord,
                subagent: {
                  id: agent.id,
                  name: agent.name,
                },
                traceId: queueWait.orchestrationId,
                taskId: buildTraceTaskId(queueWait.orchestrationId, agent.id, 0),
                output: result.output,
                adaptiveParallelPenalty: getAdaptivePenalty(),
                queuedAhead: queueWait.queuedAhead,
                queuePosition: queueWait.queuePosition,
                queueWaitedMs: queueWait.waitedMs,
                outcomeCode: "SUCCESS" as RunOutcomeCode,
                retryRecommended: false,
              },
            };
          } finally {
            runtimeState.activeRunRequests = Math.max(0, runtimeState.activeRunRequests - 1);
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

  // サブエージェント並列実行
  pi.registerTool({
    name: "subagent_run_parallel",
    label: "Subagent Run Parallel",
    description:
      "Run selected subagents in parallel. Strongly recommended when using subagents; pass explicit subagentIds with 2+ specialists for meaningful fan-out.",
    parameters: Type.Object({
      task: Type.String({ description: "Task delegated to all selected subagents" }),
      subagentIds: Type.Optional(Type.Array(Type.String({ description: "Subagent id list" }))),
      extraContext: Type.Optional(Type.String({ description: "Optional shared context" })),
      timeoutMs: Type.Optional(Type.Number({ description: "Timeout in milliseconds (default: 600000). Use 0 to disable timeout." })),
      retry: createRetrySchema(),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const storage = loadStorage(ctx.cwd);
      const retryOverrides = toRetryOverrides(params.retry);
      const requestedIds = Array.isArray(params.subagentIds)
        ? Array.from(new Set(params.subagentIds.map((id) => String(id).trim()).filter(Boolean)))
        : [];

      const selectedAgents =
        requestedIds.length > 0
          ? requestedIds
              .map((id) => storage.agents.find((agent) => agent.id === id))
              .filter((agent): agent is SubagentDefinition => Boolean(agent))
          : pickDefaultParallelAgents(storage);

      const missingIds =
        requestedIds.length > 0
          ? requestedIds.filter((id) => !storage.agents.some((agent) => agent.id === id))
          : [];

      if (missingIds.length > 0) {
        return {
          content: [{ type: "text" as const, text: `subagent_run_parallel error: unknown ids: ${missingIds.join(", ")}` }],
          details: {
            error: "unknown_ids",
            missingIds,
            outcomeCode: "NONRETRYABLE_FAILURE" as RunOutcomeCode,
            retryRecommended: false,
          },
        };
      }

      const activeAgents = selectedAgents.filter((agent) => agent.enabled === "enabled");
      if (activeAgents.length === 0) {
        return {
          content: [{ type: "text" as const, text: "subagent_run_parallel error: no enabled subagents selected." }],
          details: {
            error: "no_enabled_subagents",
            outcomeCode: "NONRETRYABLE_FAILURE" as RunOutcomeCode,
            retryRecommended: false,
          },
        };
      }

      const queueSnapshot = getRuntimeSnapshot();
      const queueWait = await waitForRuntimeOrchestrationTurn({
        toolName: "subagent_run_parallel",
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
              text: buildRuntimeQueueWaitError("subagent_run_parallel", queueWait),
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
        const snapshot = getRuntimeSnapshot();
        const configuredParallelLimit = toConcurrencyLimit(snapshot.limits.maxParallelSubagentsPerRun, 1);
        const baselineParallelism = Math.max(
          1,
          Math.min(
            configuredParallelLimit,
            activeAgents.length,
            Math.max(1, snapshot.limits.maxTotalActiveLlm),
          ),
        );
        const adaptivePenaltyBefore = getAdaptivePenalty();
        const effectiveParallelism = applyAdaptiveParallelLimit(baselineParallelism);
        const parallelCapacity = await resolveSubagentParallelCapacity({
          requestedParallelism: effectiveParallelism,
          additionalRequests: 1,
          maxWaitMs: snapshot.limits.capacityWaitMs,
          pollIntervalMs: snapshot.limits.capacityPollMs,
          signal,
        });
        if (!parallelCapacity.allowed) {
          raiseAdaptivePenalty("capacity");
          const capacityOutcome: RunOutcomeSignal = parallelCapacity.aborted
            ? { outcomeCode: "CANCELLED", retryRecommended: false }
            : parallelCapacity.timedOut
              ? { outcomeCode: "TIMEOUT", retryRecommended: true }
              : { outcomeCode: "RETRYABLE_FAILURE", retryRecommended: true };
          return {
            content: [
              {
                type: "text" as const,
                text: buildRuntimeLimitError("subagent_run_parallel", parallelCapacity.reasons, {
                  waitedMs: parallelCapacity.waitedMs,
                  timedOut: parallelCapacity.timedOut,
                }),
              },
            ],
            details: {
              error: "runtime_limit_reached",
              reasons: parallelCapacity.reasons,
              projectedRequests: parallelCapacity.projectedRequests,
              projectedLlm: parallelCapacity.projectedLlm,
              waitedMs: parallelCapacity.waitedMs,
              timedOut: parallelCapacity.timedOut,
              aborted: parallelCapacity.aborted,
              capacityAttempts: parallelCapacity.attempts,
              configuredParallelLimit,
              baselineParallelism,
              requestedParallelism: parallelCapacity.requestedParallelism,
              appliedParallelism: parallelCapacity.appliedParallelism,
              parallelismReduced: parallelCapacity.reduced,
              adaptivePenaltyBefore,
              adaptivePenaltyAfter: getAdaptivePenalty(),
              requestedSubagentCount: activeAgents.length,
              queuedAhead: queueWait.queuedAhead,
              queuePosition: queueWait.queuePosition,
              queueWaitedMs: queueWait.waitedMs,
              traceId: queueWait.orchestrationId,
              outcomeCode: capacityOutcome.outcomeCode,
              retryRecommended: capacityOutcome.retryRecommended,
            },
          };
        }
        if (!parallelCapacity.reservation) {
          raiseAdaptivePenalty("capacity");
          return {
            content: [
              {
                type: "text" as const,
                text: "subagent_run_parallel blocked: capacity reservation missing.",
              },
            ],
            details: {
              error: "runtime_reservation_missing",
              requestedParallelism: parallelCapacity.requestedParallelism,
              appliedParallelism: parallelCapacity.appliedParallelism,
              queuedAhead: queueWait.queuedAhead,
              queuePosition: queueWait.queuePosition,
              queueWaitedMs: queueWait.waitedMs,
              traceId: queueWait.orchestrationId,
              outcomeCode: "RETRYABLE_FAILURE" as RunOutcomeCode,
              retryRecommended: true,
            },
          };
        }
        const appliedParallelism = parallelCapacity.appliedParallelism;
        const capacityReservation = parallelCapacity.reservation;
        const stopReservationHeartbeat = startReservationHeartbeat(capacityReservation);

        try {
          const timeoutMs = normalizeTimeoutMs(params.timeoutMs, DEFAULT_AGENT_TIMEOUT_MS);
          const liveMonitor = createSubagentLiveMonitor(ctx, {
            title: `Subagent Run Parallel (detailed live view: ${activeAgents.length} agents)`,
            items: activeAgents.map((agent) => ({ id: agent.id, name: agent.name })),
          });

          runtimeState.activeRunRequests += 1;
          notifyRuntimeCapacityChanged();
          refreshRuntimeStatus(ctx);
          // 予約は admission 制御のためだけに使い、開始後は active カウンタへ責務を移す。
          capacityReservation.consume();
          try {
            const results = await runWithConcurrencyLimit(
              activeAgents,
              appliedParallelism,
              async (agent) => {
                const result = await runSubagentTask({
                  agent,
                  task: params.task,
                  extraContext: params.extraContext,
                  timeoutMs,
                  cwd: ctx.cwd,
                  retryOverrides,
                  modelProvider: ctx.model?.provider,
                  modelId: ctx.model?.id,
                  signal,
                  onStart: () => {
                    liveMonitor?.markStarted(agent.id);
                    runtimeState.activeAgents += 1;
                    notifyRuntimeCapacityChanged();
                    refreshRuntimeStatus(ctx);
                  },
                  onEnd: () => {
                    runtimeState.activeAgents = Math.max(0, runtimeState.activeAgents - 1);
                    notifyRuntimeCapacityChanged();
                    refreshRuntimeStatus(ctx);
                  },
                  onStdoutChunk: (chunk) => {
                    liveMonitor?.appendChunk(agent.id, "stdout", chunk);
                  },
                  onStderrChunk: (chunk) => {
                    liveMonitor?.appendChunk(agent.id, "stderr", chunk);
                  },
                });
                // 各サブエージェントの終了は、全体終了を待たずに即座に画面へ反映する。
                liveMonitor?.markFinished(
                  result.runRecord.agentId,
                  result.runRecord.status,
                  result.runRecord.summary,
                  result.runRecord.error,
                );
                return result;
              },
              { signal },
            );

            for (const result of results) {
              storage.runs.push(result.runRecord);
              pi.appendEntry("subagent-run", result.runRecord);
            }
            saveStorage(ctx.cwd, storage);

            const failed = results.filter((result) => result.runRecord.status === "failed");
            const pressureFailures = failed.filter((result) => {
              const pressure = classifyPressureError(result.runRecord.error || "");
              return pressure !== "other";
            }).length;
            if (pressureFailures > 0) {
              raiseAdaptivePenalty("rate_limit");
            } else {
              lowerAdaptivePenalty();
            }
            const parallelOutcome = resolveSubagentParallelOutcome(results);
            const adaptivePenaltyAfter = getAdaptivePenalty();
            const lines: string[] = [];
            lines.push(`Parallel subagent run completed (${results.length} agents).`);
            lines.push(
              `Applied parallel limit: ${appliedParallelism} concurrent subagents (requested=${effectiveParallelism}, baseline=${baselineParallelism}, adaptive_penalty=${adaptivePenaltyBefore}->${adaptivePenaltyAfter}).`,
            );
            if (parallelCapacity.reduced) {
              lines.push(
                `Parallelism was reduced to fit current runtime capacity (waited=${parallelCapacity.waitedMs}ms).`,
              );
            }
            lines.push(
              failed.length === 0
                ? "All subagents completed successfully."
                : `${results.length - failed.length}/${results.length} subagents completed (${failed.length} failed).`,
            );
            lines.push("");
            lines.push("Results:");

            for (const result of results) {
              const run = result.runRecord;
              const state = run.status === "completed" ? "ok" : "failed";
              lines.push(`- ${run.agentId} [${state}] ${run.summary} (${run.outputFile})`);
            }

            lines.push("");
            lines.push("Detailed outputs:");
            for (const result of results) {
              lines.push(`\n### ${result.runRecord.agentId}`);
              if (result.runRecord.status === "failed") {
                lines.push(`FAILED: ${result.runRecord.error}`);
              } else {
                lines.push(result.output);
              }
            }

            return {
              content: [{ type: "text" as const, text: lines.join("\n") }],
              details: {
                selectedSubagents: activeAgents.map((agent) => agent.id),
                configuredParallelLimit,
                baselineParallelism,
                requestedParallelism: effectiveParallelism,
                appliedParallelism,
                parallelismReduced: parallelCapacity.reduced,
                capacityWaitedMs: parallelCapacity.waitedMs,
                adaptivePenaltyBefore,
                adaptivePenaltyAfter,
                pressureFailureCount: pressureFailures,
                queuedAhead: queueWait.queuedAhead,
                queuePosition: queueWait.queuePosition,
                queueWaitedMs: queueWait.waitedMs,
                traceId: queueWait.orchestrationId,
                runs: results.map((result) => result.runRecord),
                delegateTasks: results.map((result, index) => ({
                  taskId: buildTraceTaskId(queueWait.orchestrationId, result.runRecord.agentId, index),
                  delegateId: result.runRecord.agentId,
                  runId: result.runRecord.runId,
                  status: result.runRecord.status,
                })),
                failedSubagentIds: parallelOutcome.failedSubagentIds,
                outcomeCode: parallelOutcome.outcomeCode,
                retryRecommended: parallelOutcome.retryRecommended,
              },
            };
          } finally {
            runtimeState.activeRunRequests = Math.max(0, runtimeState.activeRunRequests - 1);
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

  // ランタイム状態
  pi.registerTool({
    name: "subagent_status",
    label: "Subagent Status",
    description: "Show active subagent request count and active subagent agent count.",
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
              adaptivePenalty: getAdaptivePenalty(),
              adaptivePenaltyMax: ADAPTIVE_PARALLEL_MAX_PENALTY,
            }),
          },
        ],
        details: {
          activeRunRequests: snapshot.subagentActiveRequests,
          activeAgents: snapshot.subagentActiveAgents,
          activeTeamRuns: snapshot.teamActiveRuns,
          activeTeamAgents: snapshot.teamActiveAgents,
          totalActiveRequests: snapshot.totalActiveRequests,
          totalActiveLlm: snapshot.totalActiveLlm,
          maxTotalActiveRequests: snapshot.limits.maxTotalActiveRequests,
          maxTotalActiveLlm: snapshot.limits.maxTotalActiveLlm,
          maxParallelSubagentsPerRun: snapshot.limits.maxParallelSubagentsPerRun,
          maxParallelTeamsPerRun: snapshot.limits.maxParallelTeamsPerRun,
          maxParallelTeammatesPerTeam: snapshot.limits.maxParallelTeammatesPerTeam,
          maxConcurrentOrchestrations: snapshot.limits.maxConcurrentOrchestrations,
          capacityWaitMs: snapshot.limits.capacityWaitMs,
          capacityPollMs: snapshot.limits.capacityPollMs,
          activeOrchestrations: snapshot.activeOrchestrations,
          queuedOrchestrations: snapshot.queuedOrchestrations,
          queuedTools: snapshot.queuedTools,
          adaptiveParallelPenalty: getAdaptivePenalty(),
          storedRunRecords: storage.runs.length,
        },
      };
    },
  });

  // 実行履歴
  pi.registerTool({
    name: "subagent_runs",
    label: "Subagent Runs",
    description: "Show recent subagent run history.",
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
  pi.registerCommand("subagent", {
    description: "Manage and run subagents (list, runs, status, default, enable, disable)",
    handler: async (args, ctx) => {
      const input = (args || "").trim();
      const storage = loadStorage(ctx.cwd);

      if (!input || input === "help") {
        ctx.ui.notify("/subagent list | /subagent runs | /subagent status | /subagent default <id> | /subagent enable <id> | /subagent disable <id>", "info");
        return;
      }

      if (input === "list") {
        pi.sendMessage({ customType: "subagent-list", content: formatAgentList(storage), display: true });
        return;
      }

      if (input === "runs") {
        pi.sendMessage({ customType: "subagent-runs", content: formatRecentRuns(storage), display: true });
        return;
      }

      if (input === "status") {
        pi.sendMessage({
          customType: "subagent-status",
          content: formatRuntimeStatusLine({
            storedRuns: storage.runs.length,
            adaptivePenalty: getAdaptivePenalty(),
            adaptivePenaltyMax: ADAPTIVE_PARALLEL_MAX_PENALTY,
          }),
          display: true,
        });
        return;
      }

      const [command, id] = input.split(/\s+/, 2);
      if (!id) {
        ctx.ui.notify("subagent id is required", "warning");
        return;
      }

      const target = storage.agents.find((agent) => agent.id === id);
      if (!target) {
        ctx.ui.notify(`Subagent not found: ${id}`, "error");
        return;
      }

      if (command === "default") {
        storage.currentAgentId = target.id;
        saveStorage(ctx.cwd, storage);
        ctx.ui.notify(`Current subagent set: ${target.id}`, "success");
        return;
      }

      if (command === "enable" || command === "disable") {
        target.enabled = command === "enable" ? "enabled" : "disabled";
        target.updatedAt = new Date().toISOString();
        saveStorage(ctx.cwd, storage);
        ctx.ui.notify(`Subagent ${target.id} is now ${target.enabled}`, "success");
        return;
      }

      ctx.ui.notify(`Unknown command: ${command}`, "warning");
    },
  });

  // セッション開始時にデフォルト定義を作成。
  pi.on("session_start", async (_event, ctx) => {
    const storage = loadStorage(ctx.cwd);
    saveStorage(ctx.cwd, storage);
    delegationState.delegatedThisRequest = false;
    delegationState.directWriteConfirmedThisRequest = false;
    delegationState.pendingDirectWriteConfirmUntilMs = 0;
    resetRuntimeTransientState();
    refreshRuntimeStatus(ctx);
    ctx.ui.notify("Subagent extension loaded (subagent_list, subagent_run, subagent_run_parallel)", "info");
  });

  // 委譲前の直接編集を抑止して、委譲ファーストを強制する。
  pi.on("tool_call", async (event, _ctx) => {
    if (!ENFORCE_DELEGATION_FIRST) {
      return;
    }

    const toolName = String(event.toolName || "").toLowerCase();
    if (DELEGATION_TOOL_NAMES.has(toolName)) {
      markDelegationUsed();
      return;
    }

    if (!isWriteLikeToolCall(event)) {
      return;
    }

    if (delegationState.delegatedThisRequest || delegationState.directWriteConfirmedThisRequest) {
      return;
    }

    const nowMs = Date.now();
    if (delegationState.pendingDirectWriteConfirmUntilMs > nowMs) {
      // 2回目の同意入力として扱い、このリクエストでは直接編集を許可する。
      delegationState.directWriteConfirmedThisRequest = true;
      delegationState.pendingDirectWriteConfirmUntilMs = 0;
      return;
    }

    const expiresInSec = Math.max(1, Math.ceil(DIRECT_WRITE_CONFIRM_WINDOW_MS / 1000));
    delegationState.pendingDirectWriteConfirmUntilMs = nowMs + DIRECT_WRITE_CONFIRM_WINDOW_MS;
    return {
      block: true,
      reason: [
        "Delegation-first confirmation required before direct edits.",
        `Re-run the same write/edit command within ${expiresInSec}s to confirm direct editing for this request.`,
        "Or run subagent_run_parallel / agent_team_run_parallel first.",
        "Set PI_ENFORCE_DELEGATION_FIRST=0 to disable policy.",
      ].join(" "),
    };
  });

  // デフォルトでマルチエージェント委譲を積極化する。
  pi.on("before_agent_start", async (event, _ctx) => {
    delegationState.delegatedThisRequest = false;
    delegationState.directWriteConfirmedThisRequest = false;
    delegationState.pendingDirectWriteConfirmUntilMs = 0;
    if (String(process.env.PI_SUBAGENT_PROACTIVE_PROMPT || "1") !== "1") {
      return;
    }

    const proactivePrompt = `
---
## Proactive Multi-Agent Execution Policy

For non-trivial tasks, actively orchestrate multiple agent teams and use subagents as focused follow-ups.

Default workflow:
- Decompose the request into 2-4 parallel tracks.
- Prefer \`agent_team_run_parallel\` with explicit \`teamIds\`.
- Use \`strategy: "parallel"\`, \`communicationRounds: 1\`, \`failedMemberRetryRounds: 1\` as the baseline.
- If conflicts remain after the first pass, run one additional focused team round.
- When subagents are needed, strongly prefer \`subagent_run_parallel\` with explicit \`subagentIds\`.
- Use at least 2 subagents when calling \`subagent_run_parallel\` (recommended: 2-4).
- If only one specialist is needed, use \`subagent_run\` instead of a one-agent parallel call.

Do not avoid orchestration just because direct execution is possible.
Only skip fan-out when the task is truly trivial (single obvious step).
---`;

    return {
      systemPrompt: `${event.systemPrompt}${proactivePrompt}`,
    };
  });
}
