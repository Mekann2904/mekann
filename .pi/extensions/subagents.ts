/**
 * @abdd.meta
 * path: .pi/extensions/subagents.ts
 * role: piシステムにおけるサブエージェントの作成、管理、および実行デリゲーションを拡張するモジュール
 * why: タスクを専門のヘルパーエージェントに委譲し、積極的なタスク処理を実行するデフォルトワークフローを提供するため
 * related: .pi/extensions/agent-teams.ts, .pi/extensions/agent-runtime, .pi/extensions/shared/pi-print-executor, .pi/lib/agent-common.js
 * public_api: サブエージェント定義、実行ツール、実行レコード管理関数
 * invariants: サブエージェントの実行は同時実行制限およびランタイムキャパシティ内で行われる
 * side_effects: ファイルシステムへのログ・レコード書き込み、グローバルエラーハンドラーの設定、共有ランタイム状態の更新
 * failure_modes: APIレート制限、ネットワークエラー、タイムアウト、バリデーション失敗
 * @abdd.explain
 * overview: メインエージェントがタスクをサブエージェントに委任するための機能を提供する拡張モジュール
 * what_it_does:
 *   - サブエージェントのライフサイクル（作成、実行、終了）を管理する
 *   - 再試行ポリシー、バックオフ、ペナルティ制御による堅牢な実行制御を行う
 *   - 実行結果の検証、エラー分類、およびログへの記録を行う
 *   - 他のエージェントやランタイムリソースとの競合を管理するための並行性制限を適用する
 * why_it_exists:
 *   - 単一のエージェントでは処理が複雑化または肥大化するタスクを分割し責任を分担するため
 *   - 再試可能な特定のジョブに特化した軽量なヘルパーを動的に起動するため
 *   - システム全体のリソース消費を管理しつつ、並列してタスクを進行させるため
 * scope:
 *   in: 拡張API (ExtensionAPI), サブエージェント定義, 実行パラメータ
 *   out: サブエージェント実行イベント, ステータス更新, ファイルシステムへの永続化データ
 */

// File: .pi/extensions/subagents.ts
// Description: Adds subagent creation, management, and delegated execution tools for pi.
// Why: Enables proactive task delegation to focused helper agents as a default workflow.
// Related: .pi/extensions/agent-teams.ts, .pi/extensions/question.ts, README.md

import { readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { Type } from "@mariozechner/pi-ai";
import { integrateWithSubagents } from "./tool-compiler.js";
import type { ToolCall } from "../lib/tool-compiler-types.js";
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
import { setupGlobalErrorHandlers } from "../lib/global-error-handler.js";
import { createRunId, computeLiveWindow } from "../lib/agent-utils.js";
import {
  ThinkingLevel,
  RunOutcomeCode,
  RunOutcomeSignal,
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
import { getAgentSpecializationWeight } from "../lib/dag-weight-calculator.js";
import { getLogger } from "../lib/comprehensive-logger";
import type { OperationType } from "../lib/comprehensive-logger-types";
import { runWithConcurrencyLimit } from "../lib/concurrency";
import {
  getSubagentExecutionRules,
} from "../lib/execution-rules";
import {
  getInstanceId,
  loadState,
  isProcessAlive,
  extractPidFromInstanceId,
} from "./ul-workflow.js";
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
  isNetworkErrorRetryable,
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
import {
  generateSessionId,
  addSession,
  updateSession,
  removeSession,
  type RuntimeSession,
} from "../lib/runtime-sessions.js";
import { getCostEstimator, type ExecutionHistoryEntry } from "../lib/cost-estimator";
import { detectTier, getConcurrencyLimit } from "../lib/provider-limits";

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
 * Fuse tools if Tool Compiler is enabled and beneficial
 * @summary ツール融合ヘルパー
 * @param tools - ツール呼び出し配列
 * @returns 融合されたツール定義（融合が有益な場合）、または空配列
 */
function fuseToolsIfEnabled(
  tools: Array<{ name: string; arguments: Record<string, unknown> }>
): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
  if (!isToolCompilerEnabled() || tools.length < 2) {
    return [];
  }

  try {
    const toolCalls: ToolCall[] = tools.map((t, idx) => ({
      id: `tool-${idx}`,
      name: t.name,
      arguments: t.arguments,
    }));

    const { compiled, shouldUseFusion } = integrateWithSubagents(toolCalls);

    if (!shouldUseFusion) {
      return [];
    }

    return compiled.fusedOperations.map((op) => ({
      name: op.fusedId,
      description: `Fused: ${op.toolCalls.map((t) => t.name).join(" + ")}`,
      parameters: { type: "object", properties: {} },
    }));
  } catch {
    // Fallback on error - return empty array to use original tools
    return [];
  }
}

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
  buildSubagentPrompt as buildSubagentTaskPrompt,
  runSubagentTask,
  isRetryableSubagentError,
  buildFailureSummary,
  resolveSubagentFailureOutcome,
  mergeSkillArrays,
  resolveEffectiveSkills,
  formatSkillsSection,
  extractSummary,
} from "./subagents/task-execution";

// Import DAG execution types and utilities
import {
  type TaskPlan,
  type TaskNode,
  type DagResult,
  type DagTaskResult,
} from "../lib/dag-types.js";
import { validateTaskPlan } from "../lib/dag-validator.js";
import {
  DagExecutor,
  executeDag,
  buildSubagentPrompt,
} from "../lib/dag-executor.js";
import { generateDagFromTask, DagGenerationError } from "../lib/dag-generator.js";

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

// Use unified stable runtime constants directly from lib/agent-common.ts
// (Local aliases removed for DRY compliance)

const runtimeState = getSharedRuntimeState().subagents;

const adaptivePenalty = createAdaptivePenaltyController({
  isStable: STABLE_RUNTIME_PROFILE,
  maxPenalty: SHARED_ADAPTIVE_PARALLEL_MAX_PENALTY,
  decayMs: SHARED_ADAPTIVE_PARALLEL_DECAY_MS,
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

// ============================================================================
// Phase 1.1: Single Responsibility Verification (BUG-001)
// ============================================================================

/**
 * 責任重複チェック結果
 * @summary 責任重複チェック結果
 */
export interface ResponsibilityCheck {
  subagentId: string;
  skills: string[];
  overlaps: string[];
}

/**
 * サブエージェント間でスキル（責任）の重複を検出する
 * @summary 責任重複検出
 * @param subagents - サブエージェント定義の配列
 * @returns 重複しているスキルと関連エージェントのリスト
 */
export function validateSingleResponsibility(
  subagents: SubagentDefinition[]
): ResponsibilityCheck[] {
  const skillMap = new Map<string, string[]>();
  
  // 各スキルを持つエージェントをマッピング
  for (const subagent of subagents) {
    for (const skill of subagent.skills || []) {
      const existing = skillMap.get(skill) || [];
      existing.push(subagent.id);
      skillMap.set(skill, existing);
    }
  }
  
  const violations: ResponsibilityCheck[] = [];
  const processedAgents = new Set<string>();
  
  // 重複しているスキルを検出
  for (const [skill, owners] of skillMap) {
    if (owners.length > 1) {
      // 最初のエージェントを代表として、他を重複先として記録
      const primaryAgent = owners[0];
      if (!processedAgents.has(primaryAgent)) {
        violations.push({
          subagentId: primaryAgent,
          skills: [skill],
          overlaps: owners.slice(1)
        });
        processedAgents.add(primaryAgent);
      } else {
        // 既存の違反に追加
        const existing = violations.find(v => v.subagentId === primaryAgent);
        if (existing) {
          existing.skills.push(skill);
        }
      }
    }
  }
  
  return violations;
}

// ============================================================================
// UL Workflow Ownership Check (Ownership System Fix)
// ============================================================================

/**
 * ULワークフローの所有権チェック結果
 * @summary UL所有権チェック結果
 */
export interface UlWorkflowOwnershipResult {
  owned: boolean;
  ownerInstanceId?: string;
  ownerPid?: number;
}

/**
 * ULワークフローの所有権を確認する
 * 委任ツールがULワークフローの所有権を尊重するために使用
 * @summary UL所有権確認
 * @param taskId - ULワークフローのタスクID
 * @returns 所有権チェック結果
 */
export function checkUlWorkflowOwnership(taskId: string): UlWorkflowOwnershipResult {
  const state = loadState(taskId);
  
  if (!state) {
    // 状態が存在しない = 所有権競合なし
    return { owned: true };
  }
  
  const instanceId = getInstanceId();
  const ownerPid = extractPidFromInstanceId(state.ownerInstanceId);
  
  if (state.ownerInstanceId === instanceId) {
    return { owned: true, ownerInstanceId: state.ownerInstanceId };
  }
  
  if (ownerPid && isProcessAlive(ownerPid)) {
    return {
      owned: false,
      ownerInstanceId: state.ownerInstanceId,
      ownerPid
    };
  }
  
  // 所有者が死んでいる = 取得可能
  return { owned: true, ownerInstanceId: state.ownerInstanceId };
}

/**
 * Infer dependencies between subagents for DAG-based execution
 * @summary サブエージェント依存関係推論
 * @param agents - 選択されたエージェント
 * @param task - タスク記述
 * @returns 推論された依存関係
 */
function inferSubagentDependencies(
  agents: SubagentDefinition[],
  task: string,
): { hasDependencies: boolean; dependencies: Map<string, string[]>; description: string } {
  const deps = new Map<string, string[]>();
  const agentIds = new Set(agents.map((a) => a.id));
  const descriptions: string[] = [];

  // Rule 1: Research → Implementation dependency
  const hasResearcher = agentIds.has("researcher");
  const hasImplementer = agentIds.has("implementer") || Array.from(agentIds).some((id) => id.startsWith("implement"));

  if (hasResearcher && hasImplementer) {
    const implAgents = Array.from(agentIds).filter((id) => id === "implementer" || id.startsWith("implement"));
    implAgents.forEach((id) => {
      deps.set(id, ["researcher"]);
    });
    descriptions.push("researcher -> implementer (research informs implementation)");
  }

  // Rule 2: Implementation → Review dependency
  const hasReviewer = agentIds.has("reviewer") || agentIds.has("code-reviewer");
  if (hasImplementer && hasReviewer) {
    const implAgents = Array.from(agentIds).filter((id) => id === "implementer" || id.startsWith("implement"));
    const reviewAgent = agentIds.has("reviewer") ? "reviewer" : "code-reviewer";
    deps.set(reviewAgent, implAgents);
    descriptions.push("implementer -> reviewer (review requires implementation)");
  }

  // Rule 3: Implementation → Test dependency
  const hasTester = agentIds.has("tester");
  if (hasImplementer && hasTester) {
    const implAgents = Array.from(agentIds).filter((id) => id === "implementer" || id.startsWith("implement"));
    deps.set("tester", implAgents);
    descriptions.push("implementer -> tester (tests require implementation)");
  }

  // Rule 4: Architect → Implementation dependency
  const hasArchitect = agentIds.has("architect");
  if (hasArchitect && hasImplementer) {
    const implAgents = Array.from(agentIds).filter((id) => id === "implementer" || id.startsWith("implement"));
    implAgents.forEach((id) => {
      const existing = deps.get(id) || [];
      deps.set(id, [...existing, "architect"]);
    });
    descriptions.push("architect -> implementer (design guides implementation)");
  }

  const hasDependencies = deps.size > 0;
  const description = hasDependencies
    ? descriptions.map((d, i) => `  ${i + 1}. ${d}`).join("\n")
    : "No dependencies detected";

  return { hasDependencies, dependencies: deps, description };
}

/**
 * Refresh runtime status display in the UI with subagent-specific parameters.
 * @see ./shared/runtime-helpers.ts:refreshRuntimeStatus for the underlying implementation.
 */
interface RuntimeStatusContext {
	ui: {
		setStatus: (key: string, value: string) => void;
	};
}
function refreshRuntimeStatus(ctx: RuntimeStatusContext): void {
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

// Note: toRetryOverrides is kept locally because it checks STABLE_RUNTIME_PROFILE
// which is specific to this module. The lib version does not have this check.
function toRetryOverrides(value: unknown): RetryWithBackoffOverrides | undefined {
  // Stable profile: reject ad-hoc retry tuning to keep behavior deterministic.
  if (STABLE_RUNTIME_PROFILE) return undefined;
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

// Note: Background job system removed - subagent_run and subagent_run_parallel
// now execute synchronously like agent_team_run for consistent behavior.

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

  // Default changed from "current" to "all" to promote parallel execution
  const mode = String(process.env.PI_SUBAGENT_PARALLEL_DEFAULT || "all")
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
  // グローバルエラーハンドラを設定（一度だけ）
  setupGlobalErrorHandlers();

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
      ulTaskId: Type.Optional(Type.String({ description: "UL workflow task ID. If provided, checks ownership before execution." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      // ULワークフロー所有権チェック
      if (params.ulTaskId) {
        const ownership = checkUlWorkflowOwnership(params.ulTaskId);
        if (!ownership.owned) {
          return {
            content: [{ type: "text" as const, text: `subagent_run error: UL workflow ${params.ulTaskId} is owned by another instance (${ownership.ownerInstanceId}).` }],
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

      // Synchronous execution (matching agent_team_run behavior)
      logger.startOperation("subagent_run" as OperationType, agent.id, {
        task: params.task,
        params: {
          subagentId: agent.id,
          extraContext: params.extraContext,
          timeoutMs: params.timeoutMs,
        },
      });

      let capacityReservation: RuntimeCapacityReservationLease | undefined;
      let stopReservationHeartbeat: (() => void) | undefined;
      let liveMonitor: SubagentLiveMonitorController | undefined;
      // Create session ID before try for catch access
      let sessionId = generateSessionId();
      try {
        const queueSnapshot = getRuntimeSnapshot();
        const dispatchPermit = await acquireRuntimeDispatchPermit({
          toolName: "subagent_run",
          candidate: {
            additionalRequests: 1,
            additionalLlm: 1,
          },
          tenantKey: agent.id,
          source: "scheduled",
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
          const capacityOutcome: RunOutcomeSignal = dispatchPermit.aborted
            ? { outcomeCode: "CANCELLED", retryRecommended: false }
            : dispatchPermit.timedOut
              ? { outcomeCode: "TIMEOUT", retryRecommended: true }
              : { outcomeCode: "RETRYABLE_FAILURE", retryRecommended: true };
          return {
            content: [{ type: "text" as const, text: errorMessage }],
            details: {
              error: dispatchPermit.aborted ? "runtime_dispatch_aborted" : "runtime_dispatch_blocked",
              reasons: dispatchPermit.reasons,
              waitedMs: dispatchPermit.waitedMs,
              timedOut: dispatchPermit.timedOut,
              aborted: dispatchPermit.aborted,
              outcomeCode: capacityOutcome.outcomeCode,
              retryRecommended: capacityOutcome.retryRecommended,
            },
          };
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
          title: `Subagent Run: ${agent.id}`,
          items: [{ id: agent.id, name: agent.name }],
        });

        // Create runtime session for tracking
        const runtimeSession: RuntimeSession = {
          id: sessionId,
          type: "subagent",
          agentId: agent.id,
          taskTitle: params.task.slice(0, 100),
          status: "starting",
          startedAt: Date.now(),
        };
        addSession(runtimeSession);

        runtimeState.activeRunRequests += 1;
        notifyRuntimeCapacityChanged();
        refreshRuntimeStatus(ctx);
        capacityReservation.consume();

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
            // Update session status to running
            updateSession(sessionId, { status: "running" });
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

        // Update session with final status
        updateSession(sessionId, {
          status: result.runRecord.status === "failed" ? "failed" : "completed",
          completedAt: Date.now(),
          message: result.runRecord.summary || result.runRecord.error,
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
          if (pressureError !== "other" && pressureError !== "cancelled") {
            adaptivePenalty.raise(pressureError);
          }
          const errorMessage = result.runRecord.error || "subagent run failed";
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
          return {
            content: [{ type: "text" as const, text: errorMessage }],
            details: {
              runRecord: result.runRecord,
              subagentId: agent.id,
              outcomeCode: "NONRETRYABLE_FAILURE" as RunOutcomeCode,
              retryRecommended: false,
            },
          };
        } else {
          adaptivePenalty.lower();
          logger.endOperation({
            status: "success",
            tokensUsed: 0,
            outputLength: result.output?.length ?? 0,
            outputFile: result.runRecord.outputFile,
            childOperations: 0,
            toolCalls: 0,
          });
          return {
            content: [{ type: "text" as const, text: result.output || result.runRecord.summary }],
            details: {
              runRecord: result.runRecord,
              subagentId: agent.id,
              outcomeCode: "SUCCESS" as RunOutcomeCode,
              retryRecommended: false,
            },
          };
        }
      } catch (error) {
        const errorMessage = toErrorMessage(error);
        // Update session to failed status
        updateSession(sessionId, {
          status: "failed",
          completedAt: Date.now(),
          message: errorMessage,
        });
        logger.endOperation({
          status: "failure",
          tokensUsed: 0,
          outputLength: 0,
          childOperations: 0,
          toolCalls: 0,
          error: {
            type: "subagent_error",
            message: errorMessage,
            stack: "",
          },
        });
        return {
          content: [{ type: "text" as const, text: errorMessage }],
          details: {
            error: "execution_error",
            subagentId: agent.id,
            outcomeCode: "NONRETRYABLE_FAILURE" as RunOutcomeCode,
            retryRecommended: false,
          },
        };
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
      ulTaskId: Type.Optional(Type.String({ description: "UL workflow task ID. If provided, checks ownership before execution." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      // ULワークフロー所有権チェック
      if (params.ulTaskId) {
        const ownership = checkUlWorkflowOwnership(params.ulTaskId);
        if (!ownership.owned) {
          return {
            content: [{ type: "text" as const, text: `subagent_run_parallel error: UL workflow ${params.ulTaskId} is owned by another instance (${ownership.ownerInstanceId}).` }],
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

      // Synchronous execution (matching agent_team_run behavior)
      logger.startOperation(
        "subagent_run_parallel" as OperationType,
        activeAgents.map((agent) => agent.id).join(","),
        {
          task: params.task,
          params: {
            subagentIds: activeAgents.map((agent) => agent.id),
            extraContext: params.extraContext,
            timeoutMs: params.timeoutMs,
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
          source: "scheduled",
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
          const capacityOutcome: RunOutcomeSignal = dispatchPermit.aborted
            ? { outcomeCode: "CANCELLED", retryRecommended: false }
            : dispatchPermit.timedOut
              ? { outcomeCode: "TIMEOUT", retryRecommended: true }
              : { outcomeCode: "RETRYABLE_FAILURE", retryRecommended: true };
          return {
            content: [{ type: "text" as const, text: errorText }],
            details: {
              error: dispatchPermit.aborted ? "runtime_dispatch_aborted" : "runtime_dispatch_blocked",
              reasons: dispatchPermit.reasons,
              waitedMs: dispatchPermit.waitedMs,
              timedOut: dispatchPermit.timedOut,
              aborted: dispatchPermit.aborted,
              outcomeCode: capacityOutcome.outcomeCode,
              retryRecommended: capacityOutcome.retryRecommended,
            },
          };
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
          title: `Subagent Run Parallel`,
          items: activeAgents.map((agent) => ({ id: agent.id, name: agent.name })),
        });

        // Dependency inference for parallel execution - AUTO DAG FALLBACK
        const inferredDeps = inferSubagentDependencies(activeAgents, params.task);
        if (inferredDeps.hasDependencies) {
          // Auto-switch to DAG execution instead of returning recommendation
          console.log("[subagent_run_parallel] Auto-switching to DAG execution due to detected dependencies");
          console.log(`[subagent_run_parallel] Detected: ${inferredDeps.description}`);

          try {
            // Generate DAG plan from task
            const dagPlan = await generateDagFromTask(params.task, {
              maxDepth: 4,
              maxTasks: activeAgents.length + 2,
            });

            console.log(`[subagent_run_parallel] Generated DAG: ${dagPlan.id} (${dagPlan.tasks.length} tasks)`);

            // Create live monitor items from DAG tasks
            const monitorItems = dagPlan.tasks.map((t) => ({
              id: t.id,
              name: t.description.slice(0, 50),
            }));

            liveMonitor = createSubagentLiveMonitor(ctx, {
              title: `Subagent Run Parallel (DAG): ${dagPlan.id}`,
              items: monitorItems,
            });

            // Execute DAG
            const dagResult = await executeDag<{ runRecord: SubagentRunRecord; output: string; prompt: string }>(
              dagPlan,
              async (task, _context) => {
                const agentId = task.assignedAgent ?? storage.currentAgentId;
                const agent = agentId
                  ? storage.agents.find((a) => a.id === agentId)
                  : pickAgent(storage);

                if (!agent) {
                  throw new Error(`No subagent found for task ${task.id}`);
                }

                liveMonitor?.markStarted(task.id);

                const result = await runSubagentTask({
                  agent,
                  task: buildSubagentPrompt(task, _context),
                  extraContext: params.extraContext,
                  timeoutMs,
                  cwd: ctx.cwd,
                  modelProvider: ctx.model?.provider,
                  modelId: ctx.model?.id,
                  onTextDelta: (delta) => {
                    liveMonitor?.appendChunk(task.id, "stdout", delta);
                  },
                });

                liveMonitor?.markFinished(
                  task.id,
                  result.runRecord.status,
                  result.runRecord.summary,
                  result.runRecord.error,
                );

                return result;
              },
              {
                maxConcurrency: Math.max(1, effectiveParallelism),
                abortOnFirstError: false,
              },
            );

            // Collect results from taskResults map
            const allResults = Array.from(dagResult.taskResults.values());
            for (const taskResult of allResults) {
              if (taskResult.output && typeof taskResult.output === "object" && "runRecord" in taskResult.output) {
                const output = taskResult.output as { runRecord: SubagentRunRecord };
                storage.runs.push(output.runRecord);
                pi.appendEntry("subagent-run", output.runRecord);
              }
            }
            await saveStorageWithPatterns(ctx.cwd, storage);

            const failedTasks = allResults.filter((r) => r.status === "failed");
            const dagSummary = `[DAG Auto-Execution] ${dagPlan.tasks.length} tasks, ${allResults.length - failedTasks.length} succeeded, ${failedTasks.length} failed`;

            logger.endOperation({
              status: failedTasks.length > 0 ? "partial" : "success",
              tokensUsed: 0,
              outputLength: dagSummary.length,
              childOperations: allResults.length,
              toolCalls: 0,
            });

            return {
              content: [{
                type: "text" as const,
                text: `${dagSummary}

Auto-switched to DAG execution due to detected dependencies:
${inferredDeps.description}

${allResults.map((r) => {
  const status = r.status === "completed" ? "DONE" : "FAIL";
  const output = r.output as { runRecord?: SubagentRunRecord } | undefined;
  return `[${status}] ${r.taskId}: ${output?.runRecord?.summary?.slice(0, 100) || r.error || "completed"}`;
}).join("\n")}
`,
              }],
              details: {
                dagPlanId: dagPlan.id,
                taskCount: dagPlan.tasks.length,
                succeededCount: allResults.length - failedTasks.length,
                failedCount: failedTasks.length,
                inferredDependencies: inferredDeps.dependencies,
                autoSwitched: true,
                outcomeCode: failedTasks.length > 0 ? "PARTIAL_SUCCESS" as RunOutcomeCode : "SUCCESS" as RunOutcomeCode,
              },
            };
          } catch (dagError) {
            // DAG generation/execution failed - fallback to parallel execution
            console.log(`[subagent_run_parallel] DAG execution failed, falling back to parallel: ${dagError}`);
            // Continue to normal parallel execution below
          }
        }

        runtimeState.activeRunRequests += 1;
        notifyRuntimeCapacityChanged();
        refreshRuntimeStatus(ctx);
        capacityReservation.consume();

        // DynTaskMAS: エージェントの重みを計算（専門性ベース）
        // 重みが大きい（専門性が高い）エージェントを優先的に実行
        const agentWeights = new Map<string, number>();
        for (const agent of activeAgents) {
          const weight = getAgentSpecializationWeight(agent.id);
          agentWeights.set(agent.id, weight);
        }

        // Promise.allSettledパターンで部分失敗を許容
        type SubagentTaskResult = { runRecord: SubagentRunRecord; output: string; prompt: string };
        type SettledTaskResult = { status: 'fulfilled' | 'rejected'; value?: SubagentTaskResult; reason?: unknown; index: number };

        const settledResults = await runWithConcurrencyLimit(
          activeAgents,
          Math.max(1, effectiveParallelism),
          async (agent): Promise<SubagentTaskResult> => {
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
          {
            signal: _signal,
            usePriorityScheduling: true,
            itemWeights: agentWeights,
            getItemId: (agent: SubagentDefinition) => agent.id,
            settleMode: 'allSettled',
            abortOnError: false,
          },
        ) as unknown as SettledTaskResult[];

        // allSettled結果を分類
        const succeededResults = settledResults
          .filter((r) => r.status === 'fulfilled' && r.value)
          .map((r) => r.value as SubagentTaskResult);

        const rejectedResults = settledResults.filter((r) => r.status === 'rejected');

        // 結果を統合（成功したもののみ）
        const results = succeededResults;

        // 拒否されたタスクをエージェントIDと共に記録
        const rejectedDetails = rejectedResults.map((r) => {
          const agent = activeAgents[r.index];
          return {
            agentId: agent?.id ?? `unknown-${r.index}`,
            error: r.reason instanceof Error ? r.reason.message : String(r.reason),
          };
        });

        for (const result of results) {
          storage.runs.push(result.runRecord);
          pi.appendEntry("subagent-run", result.runRecord);
        }
        await saveStorageWithPatterns(ctx.cwd, storage);

        // Include rejected results in failure count
        const failed = results.filter((result) => result.runRecord.status === "failed");
        const totalFailed = failed.length + rejectedResults.length;
        
        if (totalFailed > 0) {
          const pressureSignals = failed
            .map((result) => classifyPressureError(result.runRecord.error || ""))
            .filter((signal): signal is "rate_limit" | "capacity" => signal !== "other");
          if (pressureSignals.length > 0) {
            const hasRateLimit = pressureSignals.includes("rate_limit");
            adaptivePenalty.raise(hasRateLimit ? "rate_limit" : "capacity");
          }
          const errorMessage = [
            ...failed.map((result) => `${result.runRecord.agentId}:${result.runRecord.error}`),
            ...rejectedDetails.map((r) => `${r.agentId}:${r.error}`),
          ].join(" | ");
          logger.endOperation({
            status: "partial",
            tokensUsed: 0,
            outputLength: 0,
            childOperations: results.length,
            toolCalls: 0,
          });
          // Build aggregated output similar to agent-teams
          const aggregatedOutput = results
            .map((result) => {
              const status = result.runRecord.status === "completed" ? "SUCCESS" : "FAILED";
              return `## ${result.runRecord.agentId}\nStatus: ${status}\n${result.output || result.runRecord.summary || ""}`;
            })
            .join("\n\n");
          const failedMemberIds = [...failed.map((result) => result.runRecord.agentId), ...rejectedDetails.map(r => r.agentId)];
          return {
            content: [{ type: "text" as const, text: aggregatedOutput }],
            details: {
              results: results.map((result) => ({
                agentId: result.runRecord.agentId,
                status: result.runRecord.status,
                summary: result.runRecord.summary,
                error: result.runRecord.error,
              })),
              rejectedResults: rejectedDetails,
              failedMemberIds,
              successCount: results.length - failed.length,
              totalCount: activeAgents.length,
              outcomeCode: totalFailed === activeAgents.length ? "NONRETRYABLE_FAILURE" as RunOutcomeCode : "PARTIAL_SUCCESS" as RunOutcomeCode,
              retryRecommended: totalFailed > 0,
            },
          };
        } else {
          adaptivePenalty.lower();
          logger.endOperation({
            status: "success",
            tokensUsed: 0,
            outputLength: 0,
            childOperations: results.length,
            toolCalls: 0,
          });
          // Build aggregated output
          const aggregatedOutput = results
            .map((result) => {
              return `## ${result.runRecord.agentId}\nStatus: SUCCESS\n${result.output || result.runRecord.summary || ""}`;
            })
            .join("\n\n");
          return {
            content: [{ type: "text" as const, text: aggregatedOutput }],
            details: {
              results: results.map((result) => ({
                agentId: result.runRecord.agentId,
                status: result.runRecord.status,
                summary: result.runRecord.summary,
                output: result.output,
              })),
              successCount: results.length,
              totalCount: results.length,
              outcomeCode: "SUCCESS" as RunOutcomeCode,
              retryRecommended: false,
            },
          };
        }
      } catch (error) {
        const errorMessage = toErrorMessage(error);
        logger.endOperation({
          status: "failure",
          tokensUsed: 0,
          outputLength: 0,
          childOperations: 0,
          toolCalls: 0,
          error: {
            type: "subagent_parallel_error",
            message: errorMessage,
            stack: "",
          },
        });
        return {
          content: [{ type: "text" as const, text: errorMessage }],
          details: {
            error: "execution_error",
            outcomeCode: "NONRETRYABLE_FAILURE" as RunOutcomeCode,
            retryRecommended: false,
          },
        };
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
    },
  });

  // DAG-based subagent execution
  pi.registerTool({
    name: "subagent_run_dag",
    label: "Subagent Run DAG",
    description:
      "Run tasks with dependency-aware parallel execution. Decomposes a task into a DAG of subtasks and executes them in parallel where dependencies allow. Plan auto-generated when omitted.",
    parameters: Type.Object({
      task: Type.String({ description: "Task to decompose and execute" }),
      plan: Type.Optional(
        Type.Object({
          id: Type.String(),
          description: Type.String(),
          tasks: Type.Array(
            Type.Object({
              id: Type.String(),
              description: Type.String(),
              assignedAgent: Type.Optional(Type.String()),
              dependencies: Type.Array(Type.String()),
              priority: Type.Optional(Type.String()),
              inputContext: Type.Optional(Type.Array(Type.String())),
            }),
          ),
        }),
      ),
      autoGenerate: Type.Optional(Type.Boolean({
        description: "Auto-generate DAG when plan omitted (default: true)"
      })),
      maxConcurrency: Type.Optional(Type.Number({ description: "Maximum parallel tasks (default: 3)" })),
      abortOnFirstError: Type.Optional(Type.Boolean({ description: "Stop on first task failure (default: false)" })),
      timeoutMs: Type.Optional(Type.Number({ description: "Per-task timeout in ms (default: 300000)" })),
      ulTaskId: Type.Optional(Type.String({ description: "UL workflow task ID. If provided, checks ownership before execution." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      // ULワークフロー所有権チェック
      if (params.ulTaskId) {
        const ownership = checkUlWorkflowOwnership(params.ulTaskId);
        if (!ownership.owned) {
          return {
            content: [{ type: "text" as const, text: `subagent_run_dag error: UL workflow ${params.ulTaskId} is owned by another instance (${ownership.ownerInstanceId}).` }],
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
      const maxConcurrency = params.maxConcurrency ?? 3;
      const abortOnFirstError = params.abortOnFirstError ?? false;
      const timeoutMs = resolveEffectiveTimeoutMs(
        params.timeoutMs,
        ctx.model?.id,
        DEFAULT_AGENT_TIMEOUT_MS,
      );

      // Build or use provided plan
      let taskPlan: TaskPlan;

      if (params.plan) {
        // Use provided plan (existing logic)
        taskPlan = {
          id: params.plan.id,
          description: params.plan.description,
          tasks: params.plan.tasks.map((t) => ({
            id: t.id,
            description: t.description,
            assignedAgent: t.assignedAgent,
            dependencies: t.dependencies,
            priority: t.priority as "critical" | "high" | "normal" | "low" | undefined,
            inputContext: t.inputContext,
          })),
          metadata: {
            createdAt: Date.now(),
            model: ctx.model?.id ?? "unknown",
            totalEstimatedMs: 0,
            maxDepth: 0,
          },
        };
      } else if (params.autoGenerate !== false) {
        // AUTO-GENERATE DAG
        try {
          taskPlan = await generateDagFromTask(params.task, {
            maxDepth: 4,
            maxTasks: 10,
          });

          // Log auto-generation success
          console.log(`[subagent_run_dag] Auto-generated plan: ${taskPlan.id} (${taskPlan.tasks.length} tasks, max depth: ${taskPlan.metadata.maxDepth})`);
        } catch (genError) {
          const errorMsg = genError instanceof DagGenerationError
            ? `subagent_run_dag error: failed to auto-generate plan - ${genError.message} (code: ${genError.code})`
            : `subagent_run_dag error: failed to auto-generate plan - ${genError}`;

          return {
            content: [{ type: "text" as const, text: errorMsg }],
            details: {
              error: "auto_generation_failed",
              outcomeCode: "NONRETRYABLE_FAILURE" as RunOutcomeCode,
              retryRecommended: false,
            },
          };
        }
      } else {
        // autoGenerate explicitly false, plan required
        return {
          content: [
            {
              type: "text" as const,
              text: "subagent_run_dag error: plan parameter required when autoGenerate=false",
            },
          ],
          details: {
            error: "plan_required",
            outcomeCode: "NONRETRYABLE_FAILURE" as RunOutcomeCode,
            retryRecommended: false,
          },
        };
      }

      // Validate plan
      const validation = validateTaskPlan(taskPlan);
      if (!validation.valid) {
        return {
          content: [
            {
              type: "text" as const,
              text: `subagent_run_dag error: invalid plan - ${validation.errors.join("; ")}`,
            },
          ],
          details: {
            error: "invalid_plan",
            validationErrors: validation.errors,
            validationWarnings: validation.warnings,
            outcomeCode: "NONRETRYABLE_FAILURE" as RunOutcomeCode,
            retryRecommended: false,
          },
        };
      }

      logger.startOperation("subagent_run_dag" as OperationType, taskPlan.id, {
        task: params.task,
        params: { taskCount: taskPlan.tasks.length, maxConcurrency },
      });

      let liveMonitor: SubagentLiveMonitorController | undefined;
      let capacityReservation: RuntimeCapacityReservationLease | undefined;
      let stopReservationHeartbeat: (() => void) | undefined;

      try {
        const snapshot = getRuntimeSnapshot();
        const dispatchPermit = await acquireRuntimeDispatchPermit({
          toolName: "subagent_run_dag",
          candidate: {
            additionalRequests: 1,
            additionalLlm: Math.min(maxConcurrency, taskPlan.tasks.length),
          },
          tenantKey: taskPlan.id,
          source: "scheduled",
          estimatedDurationMs: 60_000 * taskPlan.tasks.length,
          estimatedRounds: taskPlan.tasks.length,
          maxWaitMs: snapshot.limits.capacityWaitMs,
          pollIntervalMs: snapshot.limits.capacityPollMs,
          signal: _signal,
        });

        if (!dispatchPermit.allowed || !dispatchPermit.lease) {
          const errorText = buildRuntimeLimitError("subagent_run_dag", dispatchPermit.reasons, {
            waitedMs: dispatchPermit.waitedMs,
            timedOut: dispatchPermit.timedOut,
          });
          logger.endOperation({
            status: "failure",
            tokensUsed: 0,
            outputLength: 0,
            childOperations: 0,
            toolCalls: 0,
            error: { type: "capacity_error", message: errorText, stack: "" },
          });
          const capacityOutcome: RunOutcomeSignal = dispatchPermit.aborted
            ? { outcomeCode: "CANCELLED", retryRecommended: false }
            : dispatchPermit.timedOut
              ? { outcomeCode: "TIMEOUT", retryRecommended: true }
              : { outcomeCode: "RETRYABLE_FAILURE", retryRecommended: true };
          return {
            content: [{ type: "text" as const, text: errorText }],
            details: {
              error: dispatchPermit.aborted ? "runtime_dispatch_aborted" : "runtime_dispatch_blocked",
              reasons: dispatchPermit.reasons,
              outcomeCode: capacityOutcome.outcomeCode,
              retryRecommended: capacityOutcome.retryRecommended,
            },
          };
        }

        capacityReservation = dispatchPermit.lease;
        stopReservationHeartbeat = startReservationHeartbeat(capacityReservation);

        // Create live monitor items from task plan
        const monitorItems = taskPlan.tasks.map((t) => ({
          id: t.id,
          name: t.description.slice(0, 50),
        }));

        liveMonitor = createSubagentLiveMonitor(ctx, {
          title: `Subagent Run DAG: ${taskPlan.id}`,
          items: monitorItems,
        });

        runtimeState.activeRunRequests += 1;
        notifyRuntimeCapacityChanged();
        refreshRuntimeStatus(ctx);
        capacityReservation.consume();

        // Execute DAG using DagExecutor
        const dagResult = await executeDag<{ runRecord: SubagentRunRecord; output: string; prompt: string }>(
          taskPlan,
          async (task, context) => {
            // Determine agent to use
            const agentId = task.assignedAgent ?? storage.currentAgentId;
            const agent = agentId
              ? storage.agents.find((a) => a.id === agentId)
              : pickAgent(storage);

            if (!agent) {
              throw new Error(`No subagent found for task ${task.id}`);
            }

            // Build prompt with context from dependencies
            const promptWithContext = buildSubagentPrompt(task, context);

            liveMonitor?.markStarted(task.id);
            runtimeState.activeAgents += 1;
            notifyRuntimeCapacityChanged();
            refreshRuntimeStatus(ctx);

            try {
              const result = await runSubagentTask({
                agent,
                task: promptWithContext,
                extraContext: context,
                timeoutMs,
                cwd: ctx.cwd,
                modelProvider: ctx.model?.provider,
                modelId: ctx.model?.id,
                onTextDelta: (delta) => {
                  liveMonitor?.appendChunk(task.id, "stdout", delta);
                },
                onStderrChunk: (chunk) => {
                  liveMonitor?.appendChunk(task.id, "stderr", chunk);
                },
              });

              liveMonitor?.markFinished(
                task.id,
                result.runRecord.status,
                result.runRecord.summary,
                result.runRecord.error,
              );

              storage.runs.push(result.runRecord);
              pi.appendEntry("subagent-run", result.runRecord);

              return result;
            } finally {
              runtimeState.activeAgents = Math.max(0, runtimeState.activeAgents - 1);
              notifyRuntimeCapacityChanged();
              refreshRuntimeStatus(ctx);
            }
          },
          {
            maxConcurrency,
            abortOnFirstError,
            signal: _signal,
            onTaskError: (taskId, error) => {
              liveMonitor?.markFinished(taskId, "failed", error.message, error.message);
            },
          },
        );

        await saveStorageWithPatterns(ctx.cwd, storage);

        // Build result
        const completedCount = dagResult.completedTaskIds.length;
        const failedCount = dagResult.failedTaskIds.length;

        const aggregatedOutput = Array.from(dagResult.taskResults.entries())
          .map(([taskId, result]) => {
            const status = result.status.toUpperCase();
            const output =
              result.status === "completed"
                ? (result.output as { runRecord: SubagentRunRecord; output: string; prompt: string })?.output ?? ""
                : result.error?.message ?? "";
            return `## ${taskId}\nStatus: ${status}\n${output}`;
          })
          .join("\n\n");

        logger.endOperation({
          status: dagResult.overallStatus === "completed" ? "success" : dagResult.overallStatus === "partial" ? "partial" : "failure",
          tokensUsed: 0,
          outputLength: aggregatedOutput.length,
          childOperations: taskPlan.tasks.length,
          toolCalls: 0,
        });

        return {
          content: [{ type: "text" as const, text: aggregatedOutput }],
          details: {
            planId: taskPlan.id,
            overallStatus: dagResult.overallStatus,
            totalDurationMs: dagResult.totalDurationMs,
            completedTaskIds: dagResult.completedTaskIds,
            failedTaskIds: dagResult.failedTaskIds,
            skippedTaskIds: dagResult.skippedTaskIds,
            successCount: completedCount,
            failureCount: failedCount,
            outcomeCode:
              dagResult.overallStatus === "completed"
                ? ("SUCCESS" as RunOutcomeCode)
                : dagResult.overallStatus === "partial"
                  ? ("PARTIAL_SUCCESS" as RunOutcomeCode)
                  : ("NONRETRYABLE_FAILURE" as RunOutcomeCode),
            retryRecommended: failedCount > 0,
          },
        };
      } catch (error) {
        const errorMessage = toErrorMessage(error);
        logger.endOperation({
          status: "failure",
          tokensUsed: 0,
          outputLength: 0,
          childOperations: 0,
          toolCalls: 0,
          error: { type: "dag_execution_error", message: errorMessage, stack: "" },
        });
        return {
          content: [{ type: "text" as const, text: errorMessage }],
          details: {
            error: "execution_error",
            outcomeCode: "NONRETRYABLE_FAILURE" as RunOutcomeCode,
            retryRecommended: false,
          },
        };
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
              adaptivePenaltyMax: SHARED_ADAPTIVE_PARALLEL_MAX_PENALTY,
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
            adaptivePenalty: adaptivePenalty.get(),
            adaptivePenaltyMax: SHARED_ADAPTIVE_PARALLEL_MAX_PENALTY,
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
      "Subagent extension loaded (subagent_list, subagent_run, subagent_run_parallel)",
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
