/**
 * @abdd.meta
 * path: .pi/extensions/subagents.ts
 * role: サブエージェントの作成、管理、およびタスク委譲の実行を提供する拡張機能
 * why: フォーカスされたヘルパーエージェントへの能動的なタスク委譲をデフォルトのワークフローとして可能にするため
 * related: .pi/extensions/agent-teams.ts, .pi/extensions/agent-runtime.ts, .pi/extensions/shared/runtime-helpers.ts, .pi/lib/agent-types.ts
 * public_api: サブエージェント実行用ツール、ランタイム状態管理関数、並行性制御ユーティリティ
 * invariants: サブエージェントの実行は必ずランタイムキャパシティの予約を必要とする、出力はバリデーションルールに準拠する
 * side_effects: ファイルシステムの読み書き、ランタイム状態の更新、ログの出力
 * failure_modes: APIレートリミット、タイムアウト、キャンセル、バリデーションエラー、キャパシティ枯渇
 * @abdd.explain
 * overview: メインエージェントが特定のタスクを専門のサブエージェントに委譲し、並列または逐次的に実行するための基盤を提供するモジュール
 * what_it_does:
 *   - サブエージェントの生成とライフサイクル管理
 *   - ランタイムリソースの予約と解放（キャパシティ制御）
 *   - 再試行ポリシーとエラーハンドリングに基づく実行
 *   - 実行結果の検証とフィードバックの集約
 * why_it_exists:
 *   - 複雑なタスクを分割して並列処理効率を向上させるため
 *   - 特定のドメインに特化したエージェントによる問題解決を支援するため
 *   - システム全体の安定性を保ちながらリソースを管理するため
 * scope:
 *   in: 実行リクエスト、ツール呼び出しイベント、設定パラメータ、エージェント定義
 *   out: 実行結果、ステータス更新、ログエントリ、ファイルシステム変更
 */

// File: .pi/extensions/subagents.ts
// Description: Adds subagent creation, management, and delegated execution tools for pi.
// Why: Enables proactive task delegation to focused helper agents as a default workflow.
// Related: .pi/extensions/agent-teams.ts, .pi/extensions/question.ts, README.md

import { readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { Type } from "@mariozechner/pi-ai";
import { getMarkdownTheme, isToolCallEventType, type ExtensionAPI, type ToolCallEvent } from "@mariozechner/pi-coding-agent";
import { Key, Markdown, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";


import { ensureDir } from "../lib/fs-utils.js";
import {
  formatDurationMs,
  formatBytes,
  formatClockTime,
} from "../lib/format-utils.js";
import {
  getLiveStatusGlyph,
  isEnterInput,
  finalizeLiveLines,
  type LiveStatus,
} from "../lib/live-view-utils.js";
import {
  toTailLines,
  looksLikeMarkdown,
  appendTail,
  countOccurrences,
  estimateLineCount,
  renderPreviewWithMarkdown,
  LIVE_TAIL_LIMIT,
  LIVE_MARKDOWN_PREVIEW_MIN_WIDTH,
} from "../lib/tui/tui-utils.js";
import {
  extractStatusCodeFromMessage,
  classifyPressureError,
  isCancelledErrorMessage,
  isTimeoutErrorMessage,
  toErrorMessage,
} from "../lib/error-utils.js";
import { createRunId, computeLiveWindow } from "../lib/agent-utils.js";
import {
  ThinkingLevel,
  RunOutcomeCode,
  DEFAULT_AGENT_TIMEOUT_MS,
} from "../lib/agent-types.js";
import { computeModelTimeoutMs } from "../lib/model-timeouts.js";
import { hasNonEmptyResultSection, validateSubagentOutput } from "../lib/output-validation.js";
import { trimForError, buildRateLimitKey, createRetrySchema, toConcurrencyLimit } from "../lib/runtime-utils.js";
import { resolveEffectiveTimeoutMs } from "../lib/runtime-error-builders.js";
import {
  createAdaptivePenaltyController,
} from "../lib/adaptive-penalty.js";
import {
  STABLE_RUNTIME_PROFILE,
  ADAPTIVE_PARALLEL_MAX_PENALTY as SHARED_ADAPTIVE_PARALLEL_MAX_PENALTY,
  ADAPTIVE_PARALLEL_DECAY_MS as SHARED_ADAPTIVE_PARALLEL_DECAY_MS,
  STABLE_MAX_RETRIES,
  STABLE_INITIAL_DELAY_MS,
  STABLE_MAX_DELAY_MS,
  STABLE_MAX_RATE_LIMIT_RETRIES,
  STABLE_MAX_RATE_LIMIT_WAIT_MS,
  SUBAGENT_CONFIG,
  buildFailureSummary as sharedBuildFailureSummary,
} from "../lib/agent-common.js";
import {
  isRetryableSubagentError as sharedIsRetryableSubagentError,
  resolveSubagentFailureOutcome as sharedResolveSubagentFailureOutcome,
  trimErrorMessage as sharedTrimErrorMessage,
  buildDiagnosticContext as sharedBuildDiagnosticContext,
} from "../lib/agent-errors.js";
import { getLogger } from "../lib/comprehensive-logger";
import type { OperationType } from "../lib/comprehensive-logger-types";
import { runWithConcurrencyLimit } from "../lib/concurrency";
import {
  getSubagentExecutionRules,
} from "../lib/execution-rules";
import {
	isPlanModeActive,
	PLAN_MODE_WARNING,
} from "../lib/plan-mode-shared";
import {
  acquireRuntimeDispatchPermit,
  formatRuntimeStatusLine,
  getRuntimeSnapshot,
  getSharedRuntimeState,
  notifyRuntimeCapacityChanged,
  resetRuntimeTransientState,
  type RuntimeCapacityReservationLease,
} from "./agent-runtime";

// Import shared plan mode utilities
import {
  getRateLimitGateSnapshot,
  isRetryableError,
  retryWithBackoff,
  type RetryWithBackoffOverrides,
} from "../lib/retry-with-backoff";

import {
  runPiPrintMode as sharedRunPiPrintMode,
  type PrintExecutorOptions,
} from "./shared/pi-print-executor";
import {
  buildRuntimeLimitError,
  startReservationHeartbeat,
  refreshRuntimeStatus as sharedRefreshRuntimeStatus,
} from "./shared/runtime-helpers";

import { SchemaValidationError } from "../lib/errors.js";
import { getCostEstimator, type ExecutionHistoryEntry } from "../lib/cost-estimator";
import { detectTier, getConcurrencyLimit } from "../lib/provider-limits";

const logger = getLogger();
import {
  type SubagentDefinition,
  type SubagentRunRecord,
  type SubagentStorage,
  type SubagentPaths,
  type AgentEnabledState,
  MAX_RUNS_TO_KEEP,
  SUBAGENT_DEFAULTS_VERSION,
  getPaths,
  ensurePaths,
  createDefaultAgents,
  loadStorage,
  saveStorage,
  saveStorageWithPatterns,
} from "./subagents/storage";

// Import live-monitor module (extracted for SRP compliance)
import {
  renderSubagentLiveView,
  createSubagentLiveMonitor,
} from "./subagents/live-monitor";

// Import parallel-execution module (extracted for SRP compliance)
import {
  type SubagentParallelCapacityResolution,
  resolveSubagentParallelCapacity,
} from "./subagents/parallel-execution";

// Import task-execution module (extracted for SRP compliance)
import {
  type SubagentExecutionResult,
  normalizeSubagentOutput,
  buildSubagentPrompt,
  runSubagentTask,
  isRetryableSubagentError,
  buildFailureSummary,
  resolveSubagentFailureOutcome,
  mergeSkillArrays,
  resolveEffectiveSkills,
  formatSkillsSection,
  extractSummary,
} from "./subagents/task-execution";

// Import types from lib/subagent-types.ts
import {
  type SubagentLiveItem,
  type SubagentMonitorLifecycle,
  type SubagentMonitorStream,
  type SubagentMonitorResource,
  type SubagentLiveMonitorController,
  type PrintCommandResult,
  type LiveStreamView,
  type LiveViewMode,
} from "../lib/subagent-types.js";

const LIVE_PREVIEW_LINE_LIMIT = 36;
const LIVE_LIST_WINDOW_SIZE = 20;

// Use unified stable runtime constants from lib/agent-common.ts

// Local aliases for backward compatibility
const STABLE_SUBAGENT_RUNTIME = STABLE_RUNTIME_PROFILE;
const ADAPTIVE_PARALLEL_MAX_PENALTY = SHARED_ADAPTIVE_PARALLEL_MAX_PENALTY;
const ADAPTIVE_PARALLEL_DECAY_MS = SHARED_ADAPTIVE_PARALLEL_DECAY_MS;
const STABLE_SUBAGENT_MAX_RETRIES = STABLE_MAX_RETRIES;
const STABLE_SUBAGENT_INITIAL_DELAY_MS = STABLE_INITIAL_DELAY_MS;
const STABLE_SUBAGENT_MAX_DELAY_MS = STABLE_MAX_DELAY_MS;
const STABLE_SUBAGENT_MAX_RATE_LIMIT_RETRIES = STABLE_MAX_RATE_LIMIT_RETRIES;
const STABLE_SUBAGENT_MAX_RATE_LIMIT_WAIT_MS = STABLE_MAX_RATE_LIMIT_WAIT_MS;

const runtimeState = getSharedRuntimeState().subagents;

const adaptivePenalty = createAdaptivePenaltyController({
  isStable: STABLE_SUBAGENT_RUNTIME,
  maxPenalty: ADAPTIVE_PARALLEL_MAX_PENALTY,
  decayMs: ADAPTIVE_PARALLEL_DECAY_MS,
});

// Note: SubagentLiveItem and monitor interfaces are imported from lib/subagent-types.ts
// LiveStreamView and LiveViewMode are re-exported from lib/subagent-types.ts (originally from lib/index.ts)

// Re-export extracted module functions for backward compatibility
export {
  renderSubagentLiveView,
  createSubagentLiveMonitor,
} from "./subagents/live-monitor";

export {
  type SubagentParallelCapacityResolution,
  resolveSubagentParallelCapacity,
} from "./subagents/parallel-execution";

export {
  type SubagentExecutionResult,
  normalizeSubagentOutput,
  buildSubagentPrompt,
  runSubagentTask,
  isRetryableSubagentError,
  buildFailureSummary,
  resolveSubagentFailureOutcome,
  mergeSkillArrays,
  resolveEffectiveSkills,
  formatSkillsSection,
} from "./subagents/task-execution";

// The following local functions are now imported from modules:
// renderSubagentLiveView, createSubagentLiveMonitor -> ./subagents/live-monitor.ts
// resolveSubagentParallelCapacity -> ./subagents/parallel-execution.ts
// normalizeSubagentOutput, buildSubagentPrompt, runSubagentTask -> ./subagents/task-execution.ts

/**
 * Refresh runtime status display in the UI with subagent-specific parameters.
 * @see ./shared/runtime-helpers.ts:refreshRuntimeStatus for the underlying implementation.
 */
function refreshRuntimeStatus(ctx: any): void {
  const snapshot = getRuntimeSnapshot();
  sharedRefreshRuntimeStatus(
    ctx,
    "subagent-runtime",
    "Sub",
    snapshot.subagentActiveAgents,
    "Team",
    snapshot.teamActiveAgents,
  );
}

function debugCostEstimation(scope: string, fields: Record<string, unknown>): void {
  if (process.env.PI_DEBUG_COST_ESTIMATION !== "1") return;
  const parts = Object.entries(fields).map(([key, value]) => `${key}=${String(value)}`);
  console.error(`[cost-estimation] scope=${scope} ${parts.join(" ")}`);
}

function resolveProviderConcurrencyCap(
  agents: SubagentDefinition[],
  fallbackProvider?: string,
  fallbackModel?: string,
): number {
  let cap = Number.POSITIVE_INFINITY;
  for (const agent of agents) {
    const provider = agent.provider ?? fallbackProvider;
    const model = agent.model ?? fallbackModel;
    if (!provider || !model) continue;
    const tier = detectTier(provider, model);
    const limit = getConcurrencyLimit(provider, model, tier);
    if (Number.isFinite(limit) && limit > 0) {
      cap = Math.min(cap, limit);
    }
  }

  if (!Number.isFinite(cap) || cap <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(1, Math.trunc(cap));
}

// Note: toRetryOverrides is kept locally because it checks STABLE_SUBAGENT_RUNTIME
// which is specific to this module. The lib version does not have this check.
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

function toAgentId(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
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

type SubagentBackgroundJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed";

interface SubagentBackgroundJob {
  jobId: string;
  mode: "single" | "parallel";
  status: SubagentBackgroundJobStatus;
  task: string;
  subagentIds: string[];
  runIds: string[];
  summary?: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

const MAX_BACKGROUND_JOBS = 200;
const backgroundJobs = new Map<string, SubagentBackgroundJob>();
const backgroundJobOrder: string[] = [];

function createBackgroundJob(input: {
  mode: "single" | "parallel";
  task: string;
  subagentIds: string[];
}): SubagentBackgroundJob {
  const nowIso = new Date().toISOString();
  const job: SubagentBackgroundJob = {
    jobId: createRunId(),
    mode: input.mode,
    status: "queued",
    task: input.task,
    subagentIds: input.subagentIds,
    runIds: [],
    createdAt: nowIso,
  };
  backgroundJobs.set(job.jobId, job);
  backgroundJobOrder.push(job.jobId);
  while (backgroundJobOrder.length > MAX_BACKGROUND_JOBS) {
    const droppedId = backgroundJobOrder.shift();
    if (!droppedId) break;
    backgroundJobs.delete(droppedId);
  }
  return job;
}

function updateBackgroundJob(
  jobId: string,
  updater: (job: SubagentBackgroundJob) => SubagentBackgroundJob,
): void {
  const current = backgroundJobs.get(jobId);
  if (!current) return;
  backgroundJobs.set(jobId, updater(current));
}

function listBackgroundJobs(limit = 20): SubagentBackgroundJob[] {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  return backgroundJobOrder
    .slice(-safeLimit)
    .reverse()
    .map((jobId) => backgroundJobs.get(jobId))
    .filter((job): job is SubagentBackgroundJob => Boolean(job));
}

function formatBackgroundJobs(limit = 20): string {
  const jobs = listBackgroundJobs(limit);
  if (jobs.length === 0) {
    return "No background subagent jobs yet.";
  }
  const lines = ["Recent subagent background jobs:"];
  for (const job of jobs) {
    const subject = job.subagentIds.join(", ");
    lines.push(
      `- ${job.jobId} | ${job.mode} | ${job.status} | agents=[${subject}] | ${job.summary ?? "(no summary)"}`,
    );
  }
  return lines.join("\n");
}

/**
 * Merge skill arrays following inheritance rules.
 * - Empty array [] is treated as unspecified (ignored)
 * - Non-empty arrays are merged with deduplication
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
    entityLabel: "subagent",
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

// Note: runSubagentTask is now imported from ./subagents/task-execution

/**
 * サブエージェント拡張を登録
 * @summary 拡張機能登録
 * @param pi - 拡張機能API
 * @returns {void}
 */
export default function registerSubagentExtension(pi: ExtensionAPI) {
  // Subagent feature is explicitly disabled for this project.
  // Keep module load safe but do not register any subagent tools/commands/hooks.
  console.error("[subagents] extension is disabled by project configuration.");
  return;

  function reportBackgroundJobFailure(jobId: string, errorMessage: string, ctx: any): void {
    const message = `[${jobId}] ${errorMessage}`;
    ctx.ui.notify(`Subagent background job failed: ${message}`, "error");
    pi.sendMessage({
      customType: "subagent-background-job-failed",
      content: `Subagent background job failed: ${message}`,
      display: true,
    });
  }

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
      timeoutMs: Type.Optional(Type.Number({ description: "Idle timeout in ms - resets on each LLM output (default: 300000). Use 0 to disable." })),
      retry: createRetrySchema(),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
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

      const job = createBackgroundJob({
        mode: "single",
        task: params.task,
        subagentIds: [agent.id],
      });

      void (async () => {
        logger.startOperation("subagent_run" as OperationType, agent.id, {
          task: params.task,
          params: {
            subagentId: agent.id,
            extraContext: params.extraContext,
            timeoutMs: params.timeoutMs,
            backgroundJobId: job.jobId,
          },
        });

        let capacityReservation: RuntimeCapacityReservationLease | undefined;
        let stopReservationHeartbeat: (() => void) | undefined;
        let liveMonitor: SubagentLiveMonitorController | undefined;
        try {
          const queueSnapshot = getRuntimeSnapshot();
          const dispatchPermit = await acquireRuntimeDispatchPermit({
            toolName: "subagent_run",
            candidate: {
              additionalRequests: 1,
              additionalLlm: 1,
            },
            tenantKey: agent.id,
            source: "background",
            estimatedDurationMs: 45_000,
            estimatedRounds: 1,
            maxWaitMs: queueSnapshot.limits.capacityWaitMs,
            pollIntervalMs: queueSnapshot.limits.capacityPollMs,
            signal: _signal,
          });
          if (!dispatchPermit.allowed || !dispatchPermit.lease) {
            const errorMessage = buildRuntimeLimitError("subagent_run", dispatchPermit.reasons, {
              waitedMs: dispatchPermit.waitedMs,
              timedOut: dispatchPermit.timedOut,
            });
            updateBackgroundJob(job.jobId, (current) => ({
              ...current,
              status: "failed",
              error: errorMessage,
              finishedAt: new Date().toISOString(),
            }));
            reportBackgroundJobFailure(job.jobId, errorMessage, ctx);
            logger.endOperation({
              status: "failure",
              tokensUsed: 0,
              outputLength: 0,
              childOperations: 0,
              toolCalls: 0,
              error: {
                type: "capacity_error",
                message: errorMessage,
                stack: "",
              },
            });
            return;
          }
          capacityReservation = dispatchPermit.lease;
          stopReservationHeartbeat = startReservationHeartbeat(capacityReservation);

          const timeoutMs = resolveEffectiveTimeoutMs(
            params.timeoutMs,
            ctx.model?.id,
            DEFAULT_AGENT_TIMEOUT_MS,
          );

          const costEstimate = getCostEstimator().estimate(
            "subagent_run",
            ctx.model?.provider,
            ctx.model?.id,
            params.task,
          );
          debugCostEstimation("subagent_run", {
            agent: agent.id,
            estimated_ms: costEstimate.estimatedDurationMs,
            estimated_tokens: costEstimate.estimatedTokens,
            confidence: costEstimate.confidence.toFixed(2),
            method: costEstimate.method,
          });

          liveMonitor = createSubagentLiveMonitor(ctx, {
            title: `Subagent Run (background: ${job.jobId})`,
            items: [{ id: agent.id, name: agent.name }],
          });

          runtimeState.activeRunRequests += 1;
          notifyRuntimeCapacityChanged();
          refreshRuntimeStatus(ctx);
          capacityReservation.consume();
          updateBackgroundJob(job.jobId, (current) => ({
            ...current,
            status: "running",
            startedAt: new Date().toISOString(),
          }));

          const result = await runSubagentTask({
            agent,
            task: params.task,
            extraContext: params.extraContext,
            timeoutMs,
            cwd: ctx.cwd,
            retryOverrides,
            modelProvider: ctx.model?.provider,
            modelId: ctx.model?.id,
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
            onTextDelta: (delta) => {
              liveMonitor?.appendChunk(agent.id, "stdout", delta);
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
          await saveStorageWithPatterns(ctx.cwd, storage);
          pi.appendEntry("subagent-run", result.runRecord);

          if (result.runRecord.status === "failed") {
            const pressureError = classifyPressureError(result.runRecord.error || "");
            if (pressureError !== "other") {
              adaptivePenalty.raise(pressureError);
            }
            const errorMessage = result.runRecord.error || "subagent run failed";
            updateBackgroundJob(job.jobId, (current) => ({
              ...current,
              status: "failed",
              runIds: [result.runRecord.runId],
              summary: result.runRecord.summary,
              error: errorMessage,
              finishedAt: new Date().toISOString(),
            }));
            reportBackgroundJobFailure(job.jobId, errorMessage, ctx);
            logger.endOperation({
              status: "failure",
              tokensUsed: 0,
              outputLength: result.output?.length ?? 0,
              outputFile: result.runRecord.outputFile,
              childOperations: 0,
              toolCalls: 0,
              error: {
                type: "subagent_error",
                message: errorMessage,
                stack: "",
              },
            });
          } else {
            adaptivePenalty.lower();
            updateBackgroundJob(job.jobId, (current) => ({
              ...current,
              status: "completed",
              runIds: [result.runRecord.runId],
              summary: result.runRecord.summary,
              finishedAt: new Date().toISOString(),
            }));
            logger.endOperation({
              status: "success",
              tokensUsed: 0,
              outputLength: result.output?.length ?? 0,
              outputFile: result.runRecord.outputFile,
              childOperations: 0,
              toolCalls: 0,
            });
          }
        } catch (error) {
          updateBackgroundJob(job.jobId, (current) => ({
            ...current,
            status: "failed",
            error: toErrorMessage(error),
            finishedAt: new Date().toISOString(),
          }));
          reportBackgroundJobFailure(job.jobId, toErrorMessage(error), ctx);
          logger.endOperation({
            status: "failure",
            tokensUsed: 0,
            outputLength: 0,
            childOperations: 0,
            toolCalls: 0,
            error: {
              type: "subagent_error",
              message: toErrorMessage(error),
              stack: "",
            },
          });
        } finally {
          runtimeState.activeRunRequests = Math.max(0, runtimeState.activeRunRequests - 1);
          notifyRuntimeCapacityChanged();
          refreshRuntimeStatus(ctx);
          liveMonitor?.close();
          await liveMonitor?.wait();
          stopReservationHeartbeat?.();
          capacityReservation?.release();
          refreshRuntimeStatus(ctx);
        }
      })().catch((error) => {
        console.error("[subagent_run] Background job unhandled error:", error);
      });

      return {
        content: [{ type: "text" as const, text: `subagent_run queued as background job: ${job.jobId}` }],
        details: {
          jobId: job.jobId,
          mode: "single",
          status: "queued",
          subagentId: agent.id,
          outcomeCode: "SUCCESS" as RunOutcomeCode,
          retryRecommended: false,
        },
      };
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
      timeoutMs: Type.Optional(Type.Number({ description: "Idle timeout in ms - resets on each LLM output (default: 300000). Use 0 to disable." })),
      retry: createRetrySchema(),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
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

      const job = createBackgroundJob({
        mode: "parallel",
        task: params.task,
        subagentIds: activeAgents.map((agent) => agent.id),
      });

      void (async () => {
        logger.startOperation(
          "subagent_run_parallel" as OperationType,
          activeAgents.map((agent) => agent.id).join(","),
          {
            task: params.task,
            params: {
              subagentIds: activeAgents.map((agent) => agent.id),
              extraContext: params.extraContext,
              timeoutMs: params.timeoutMs,
              backgroundJobId: job.jobId,
            },
          },
        );

        let capacityReservation: RuntimeCapacityReservationLease | undefined;
        let stopReservationHeartbeat: (() => void) | undefined;
        let liveMonitor: SubagentLiveMonitorController | undefined;
        try {
          const snapshot = getRuntimeSnapshot();
          const configuredParallelLimit = toConcurrencyLimit(
            snapshot.limits.maxParallelSubagentsPerRun,
            1,
          );
          const baselineParallelism = Math.max(
            1,
            Math.min(
              configuredParallelLimit,
              activeAgents.length,
              Math.max(1, snapshot.limits.maxTotalActiveLlm),
              resolveProviderConcurrencyCap(
                activeAgents,
                ctx.model?.provider,
                ctx.model?.id,
              ),
            ),
          );
          const effectiveParallelism = adaptivePenalty.applyLimit(baselineParallelism);
          const dispatchPermit = await acquireRuntimeDispatchPermit({
            toolName: "subagent_run_parallel",
            candidate: {
              additionalRequests: 1,
              additionalLlm: Math.max(1, effectiveParallelism),
            },
            tenantKey: activeAgents.map((entry) => entry.id).join(","),
            source: "background",
            estimatedDurationMs: 60_000,
            estimatedRounds: Math.max(1, activeAgents.length),
            maxWaitMs: snapshot.limits.capacityWaitMs,
            pollIntervalMs: snapshot.limits.capacityPollMs,
            signal: _signal,
          });
          if (!dispatchPermit.allowed || !dispatchPermit.lease) {
            adaptivePenalty.raise("capacity");
            const errorText = buildRuntimeLimitError("subagent_run_parallel", dispatchPermit.reasons, {
              waitedMs: dispatchPermit.waitedMs,
              timedOut: dispatchPermit.timedOut,
            });
            updateBackgroundJob(job.jobId, (current) => ({
              ...current,
              status: "failed",
              error: errorText,
              finishedAt: new Date().toISOString(),
            }));
            reportBackgroundJobFailure(job.jobId, errorText, ctx);
            logger.endOperation({
              status: "failure",
              tokensUsed: 0,
              outputLength: 0,
              childOperations: 0,
              toolCalls: 0,
              error: {
                type: "capacity_error",
                message: errorText,
                stack: "",
              },
            });
            return;
          }

          capacityReservation = dispatchPermit.lease;
          stopReservationHeartbeat = startReservationHeartbeat(capacityReservation);

          const timeoutMs = resolveEffectiveTimeoutMs(
            params.timeoutMs,
            ctx.model?.id,
            DEFAULT_AGENT_TIMEOUT_MS,
          );

          const costEstimate = getCostEstimator().estimate(
            "subagent_run_parallel",
            ctx.model?.provider,
            ctx.model?.id,
            params.task,
          );
          debugCostEstimation("subagent_run_parallel", {
            estimated_ms: costEstimate.estimatedDurationMs,
            estimated_tokens: costEstimate.estimatedTokens,
            agents: activeAgents.length,
            applied_parallelism: Math.max(1, effectiveParallelism),
            confidence: costEstimate.confidence.toFixed(2),
            method: costEstimate.method,
          });

          liveMonitor = createSubagentLiveMonitor(ctx, {
            title: `Subagent Run Parallel (background: ${job.jobId})`,
            items: activeAgents.map((agent) => ({ id: agent.id, name: agent.name })),
          });

          runtimeState.activeRunRequests += 1;
          notifyRuntimeCapacityChanged();
          refreshRuntimeStatus(ctx);
          capacityReservation.consume();
          updateBackgroundJob(job.jobId, (current) => ({
            ...current,
            status: "running",
            startedAt: new Date().toISOString(),
          }));

          const results = await runWithConcurrencyLimit(
            activeAgents,
            Math.max(1, effectiveParallelism),
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
                onTextDelta: (delta) => {
                  liveMonitor?.appendChunk(agent.id, "stdout", delta);
                },
                onStderrChunk: (chunk) => {
                  liveMonitor?.appendChunk(agent.id, "stderr", chunk);
                },
              });
              liveMonitor?.markFinished(
                result.runRecord.agentId,
                result.runRecord.status,
                result.runRecord.summary,
                result.runRecord.error,
              );
              return result;
            },
          );

          for (const result of results) {
            storage.runs.push(result.runRecord);
            pi.appendEntry("subagent-run", result.runRecord);
          }
          await saveStorageWithPatterns(ctx.cwd, storage);

          const failed = results.filter((result) => result.runRecord.status === "failed");
          if (failed.length > 0) {
            const pressureSignals = failed
              .map((result) => classifyPressureError(result.runRecord.error || ""))
              .filter((signal): signal is "rate_limit" | "capacity" => signal !== "other");
            if (pressureSignals.length > 0) {
              const hasRateLimit = pressureSignals.includes("rate_limit");
              adaptivePenalty.raise(hasRateLimit ? "rate_limit" : "capacity");
            }
            const errorMessage = failed
              .map((result) => `${result.runRecord.agentId}:${result.runRecord.error}`)
              .join(" | ");
            updateBackgroundJob(job.jobId, (current) => ({
              ...current,
              status: "failed",
              runIds: results.map((result) => result.runRecord.runId),
              summary: `${results.length - failed.length}/${results.length} completed`,
              error: errorMessage,
              finishedAt: new Date().toISOString(),
            }));
            reportBackgroundJobFailure(job.jobId, errorMessage, ctx);
            logger.endOperation({
              status: "partial",
              tokensUsed: 0,
              outputLength: 0,
              childOperations: results.length,
              toolCalls: 0,
            });
          } else {
            adaptivePenalty.lower();
            updateBackgroundJob(job.jobId, (current) => ({
              ...current,
              status: "completed",
              runIds: results.map((result) => result.runRecord.runId),
              summary: `all ${results.length} subagents completed`,
              finishedAt: new Date().toISOString(),
            }));
            logger.endOperation({
              status: "success",
              tokensUsed: 0,
              outputLength: 0,
              childOperations: results.length,
              toolCalls: 0,
            });
          }
        } catch (error) {
          updateBackgroundJob(job.jobId, (current) => ({
            ...current,
            status: "failed",
            error: toErrorMessage(error),
            finishedAt: new Date().toISOString(),
          }));
          reportBackgroundJobFailure(job.jobId, toErrorMessage(error), ctx);
          logger.endOperation({
            status: "failure",
            tokensUsed: 0,
            outputLength: 0,
            childOperations: 0,
            toolCalls: 0,
            error: {
              type: "subagent_parallel_error",
              message: toErrorMessage(error),
              stack: "",
            },
          });
        } finally {
          runtimeState.activeRunRequests = Math.max(0, runtimeState.activeRunRequests - 1);
          notifyRuntimeCapacityChanged();
          refreshRuntimeStatus(ctx);
          liveMonitor?.close();
          await liveMonitor?.wait();
          stopReservationHeartbeat?.();
          capacityReservation?.release();
          refreshRuntimeStatus(ctx);
        }
      })().catch((error) => {
        console.error("[subagent_run_parallel] Background job unhandled error:", error);
      });

      return {
        content: [{ type: "text" as const, text: `subagent_run_parallel queued as background job: ${job.jobId}` }],
        details: {
          jobId: job.jobId,
          mode: "parallel",
          status: "queued",
          subagentIds: activeAgents.map((agent) => agent.id),
          outcomeCode: "SUCCESS" as RunOutcomeCode,
          retryRecommended: false,
        },
      };
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
              adaptivePenalty: adaptivePenalty.get(),
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
          adaptiveParallelPenalty: adaptivePenalty.get(),
          storedRunRecords: storage.runs.length,
          backgroundJobs: {
            total: backgroundJobOrder.length,
            queued: listBackgroundJobs(100).filter((job) => job.status === "queued").length,
            running: listBackgroundJobs(100).filter((job) => job.status === "running").length,
          },
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

  // バックグラウンドジョブ履歴
  pi.registerTool({
    name: "subagent_jobs",
    label: "Subagent Jobs",
    description: "Show recent subagent background jobs.",
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: "Number of jobs to return", minimum: 1, maximum: 100 })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const limitRaw = Number(params.limit ?? 20);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.trunc(limitRaw))) : 20;
      return {
        content: [{ type: "text" as const, text: formatBackgroundJobs(limit) }],
        details: {
          jobs: listBackgroundJobs(limit),
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
            adaptivePenalty: adaptivePenalty.get(),
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
    resetRuntimeTransientState();
    refreshRuntimeStatus(ctx);
    ctx.ui.notify(
      "Subagent extension loaded (subagent_list, subagent_run, subagent_run_parallel, subagent_jobs)",
      "info",
    );
  });

  // デフォルトでマルチエージェント委譲を積極化する。
  pi.on("before_agent_start", async (event, _ctx) => {
    if (String(process.env.PI_SUBAGENT_PROACTIVE_PROMPT || "1") !== "1") {
      return;
    }

    const proactivePrompt = `
---
## Proactive Multi-Agent Execution Policy (MANDATORY)

### WHY This Policy Exists

You are subject to cognitive biases that degrade your output:

1. **Planning Fallacy**: You underestimate task complexity. "I can do this quickly" is usually wrong.
2. **Cognitive Load Saturation**: Juggling requirements, design, implementation, and review means dropping details.
3. **Single-Perspective Blindness**: One agent = one mental model. You cannot see what you cannot see.
4. **No Self-Correction**: Working alone, you have no feedback loop to catch your own errors.
5. **Sequential Bottleneck**: One agent doing everything is SLOWER than parallel delegation.

Delegation is not bureaucracy. It is quality assurance AND speed optimization combined.

### When Direct Editing IS Appropriate

- Trivial typo fixes (1-2 characters)
- You ALREADY delegated analysis and now implement the agreed solution
- Emergency hotfixes where speed is critical

### When Direct Editing IS NOT Appropriate

- Architectural decisions
- Multi-file or multi-module changes
- Security-sensitive code (auth, crypto, permissions)
- Database schema or API contract changes
- Anything a human would want code-reviewed

### REQUIRED Execution Workflow

1. Decompose request into 2-4 parallel tracks.
2. Prefer \`agent_team_run_parallel\` with explicit \`teamIds\`.
3. Use \`strategy: "parallel"\`, \`communicationRounds: 1\`, \`failedMemberRetryRounds: 1\` as baseline.
4. If conflicts remain, run one additional focused team round.
5. For subagents: \`subagent_run_parallel\` with 2-4 explicit \`subagentIds\`.
6. If only one specialist is needed, use \`subagent_run\`.

Do NOT skip orchestration because direct execution "seems faster". It is not.
Only skip when the task is truly trivial (single obvious step, no architectural impact).
---`;

    return {
      systemPrompt: `${event.systemPrompt}${proactivePrompt}`,
    };
  });
}
