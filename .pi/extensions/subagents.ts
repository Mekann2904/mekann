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

import { writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { withFileLock } from "../lib/storage/storage-lock.js";
import { getTaskStorageStateKey } from "../lib/storage/state-keys.js";

import { Type } from "@mariozechner/pi-ai";
import {
  buildPromptWithTemplates,
  getTemplatesForAgent,
} from "../lib/prompt-templates.js";
import { integrateWithSubagents } from "./tool-compiler.js";
import type { ToolCall } from "../lib/tool-compiler-types.js";
import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  classifyPressureError,
  toErrorMessage,
} from "../lib/core/error-utils.js";
import { setupGlobalErrorHandlers } from "../lib/global-error-handler.js";

import {
  RunOutcomeCode,
  RunOutcomeSignal,
  DEFAULT_AGENT_TIMEOUT_MS,
} from "../lib/agent/agent-types.js";

import { createRetrySchema, toConcurrencyLimit } from "../lib/agent/runtime-utils.js";
import { resolveEffectiveTimeoutMs } from "../lib/agent/runtime-error-builders.js";
import {
  createProviderIsolatedPenaltyController,
} from "../lib/agent/adaptive-penalty.js";
import {
  STABLE_RUNTIME_PROFILE,
  ADAPTIVE_PARALLEL_MAX_PENALTY as SHARED_ADAPTIVE_PARALLEL_MAX_PENALTY,
  ADAPTIVE_PARALLEL_DECAY_MS as SHARED_ADAPTIVE_PARALLEL_DECAY_MS,
} from "../lib/agent/agent-common.js";
import { getAgentSpecializationWeight } from "../lib/dag-weight-calculator.js";
import { getLogger } from "../lib/comprehensive-logger";
import type { OperationType } from "../lib/comprehensive-logger-types";
import { runWithConcurrencyLimit } from "../lib/concurrency";
import {
  getInstanceId,
  loadState,
  isProcessAlive,
  extractPidFromInstanceId,
  extractDagTaskSection,
  normalizeGapDecision,
  decideResearchFollowups,
  decidePlanFollowups,
  decideImplementFollowups,
  decideReviewFollowups,
  type ImplementFollowupDecision,
  type ReviewFollowupDecision,
} from "./ul-workflow.js";
import {
	loadTaskStorage as loadSharedTaskStorage,
	saveTaskStorage as saveSharedTaskStorage,
} from "../lib/storage/task-plan-store.js";

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
  type RetryWithBackoffOverrides,
} from "../lib/retry-with-backoff.js";
import {
  getSharedSemanticCache,
} from "../lib/semantic-cache.js";

import {
  runPiPrintMode as sharedRunPiPrintMode,
} from "./shared/pi-print-executor";
import {
  buildRuntimeLimitError,
  startReservationHeartbeat,
  refreshRuntimeStatus as sharedRefreshRuntimeStatus,
} from "./shared/runtime-helpers";

// AdaptOrch topology-aware orchestration
import { 
  executeWithAdaptOrch,
} from "../lib/dag/adaptorch-adapter.js";
import {
  extractDagTaskOutput,
  selectArtifactContent,
} from "../lib/artifact-output.js";

type DynamicResearchConfig = {
  task: string;
  gapTaskId: string;
  synthesisTaskId: string;
};

type DynamicPlanConfig = {
  task: string;
  gapTaskId: string;
  synthesisTaskId: string;
};

type DynamicImplementConfig = {
  task: string;
  gapTaskId: string;
  synthesisTaskId: string;
};

type DynamicReviewConfig = {
  task: string;
  gapTaskId: string;
  synthesisTaskId: string;
};

function buildDynamicResearchBaseContext(outputByTaskId: Map<string, string>, rationale: string): string {
  const baseOutput = Array.from(outputByTaskId.entries())
    .map(([taskId, output]) => `## ${taskId}\nStatus: COMPLETED\n${output}`)
    .join("\n\n");
  return `Base research findings:\n${baseOutput.trim() || "No base output captured."}\n\nGap-check rationale:\n${rationale}`;
}

function persistDagArtifactFile(
  artifactPath: string | undefined,
  artifactContent: string,
): void {
  const normalizedPath = typeof artifactPath === "string" ? artifactPath.trim() : "";
  const normalizedContent = artifactContent.trim();

  if (!normalizedPath || !normalizedContent) {
    return;
  }

  mkdirSync(dirname(normalizedPath), { recursive: true });
  writeFileSync(normalizedPath, `${normalizedContent}\n`, "utf-8");
}

import {
  generateSessionId,
  addSession,
  updateSession,
  type RuntimeSession,
} from "../lib/runtime-sessions.js";
import { getCostEstimator } from "../lib/cost-estimator";
import { detectTier, getConcurrencyLimit } from "../lib/provider-limits";
import {
  createBoundedOptionalNumberSchema,
  createOptionalEnumStringSchema,
  createOptionalStringArraySchema,
} from "../lib/tool-contracts.js";
import { createSubagentBenchmarkRun } from "../lib/agent/benchmark-harness.js";
import { mergePromptStackBenchmarkSummaries } from "../lib/agent/benchmark-harness.js";
import {
  loadAgentBenchmarkComparison,
  loadAgentBenchmarkStore,
  recordAgentBenchmarkRun,
} from "../lib/agent/benchmark-store.js";

const logger = getLogger();

// ============================================================================
// Task Storage Helpers (for auto in_progress status)
// ============================================================================

type TaskStatus = "todo" | "in_progress" | "completed" | "cancelled" | "failed";

interface Task {
	id: string;
	title: string;
	status: TaskStatus;
	updatedAt: string;
	ownerInstanceId?: string;
	claimedAt?: string;
}

interface TaskStorage {
	tasks: Task[];
}

/**
 * タスクストレージのパスを取得
 * @summary タスクストレージパス取得
 * @returns タスクストレージファイルのパス
 */
function getTaskStoragePath(): string {
  const stateKey = getTaskStorageStateKey(process.cwd());
  // SQLite database file path
  return `.pi/storage/${stateKey}.db`;
}

/**
 * タスクストレージを読み込む
 * @summary タスクストレージ読込
 */
function loadTaskStorage(): TaskStorage {
	return loadSharedTaskStorage<TaskStorage>();
}

/**
 * タスクストレージを保存
 * @summary タスクストレージ保存
 */
function saveTaskStorage(storage: TaskStorage): void {
	try {
		saveSharedTaskStorage(storage);
	} catch (error) {
		console.error(`[subagents] Failed to save task storage:`, error);
	}
}

/**
 * タスクを in_progress に設定
 * @summary タスク進行中設定（アトミック操作)
 * @param taskId - タスクID
 * @returns 設定に成功した場合はtrue
 */
function setTaskInProgress(taskId: string): boolean {
	// Use file lock to prevent TOCTOU race condition
	return withFileLock(getTaskStorageStateKey(process.cwd()), () => {
	 const storage = loadTaskStorage();
    const task = storage.tasks.find(t => t.id === taskId);
    if (!task || task.status !== "todo") {
      return false;
    }
    task.status = "in_progress";
    task.ownerInstanceId = getInstanceId();
    task.claimedAt = new Date().toISOString();
    task.updatedAt = new Date().toISOString();
    saveTaskStorage(storage);
    return true;
  });
}

// ============================================================================
// Tool Compiler Helpers
// ============================================================================

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
function _fuseToolsIfEnabled(
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
  loadStorage,
  saveStorage,
  saveStorageWithPatterns,
} from "./subagents/storage";
import {
  formatTurnExecutionSnapshot,
  loadSubagentReplayInput,
  loadSubagentTurnContextSnapshot,
} from "../lib/agent/turn-context-inspector.js";
import {
  buildTurnExecutionContext,
  deriveTurnExecutionDecisions,
} from "../lib/agent/turn-context-builder.js";
import type {
  TurnExecutionContext,
  TurnExecutionDecisions,
} from "../lib/agent/turn-context.js";

// Import live-monitor module (extracted for SRP compliance)
import {
  createSubagentLiveMonitor,
} from "./subagents/live-monitor";

// Import task-execution module (extracted for SRP compliance)
import {
  runSubagentTask,
} from "./subagents/task-execution";

// Import DAG execution types and utilities
import {
  type TaskPlan,
  type TaskNode,
} from "../lib/dag-types.js";
import { validateTaskPlan } from "../lib/dag-validator.js";
import {
  executeDag,
  buildSubagentPrompt,
  type DagBatchMutationApi,
} from "../lib/dag-executor.js";
import { generateDagFromTask, DagGenerationError } from "../lib/dag-generator.js";
import {
  isGlobalAdaptOrchEnabled,
  loadAdaptOrchConfig,
} from "../lib/dag/adaptorch-adapter.js";

// Import types from lib/subagent-types.ts
import {
  type SubagentLiveMonitorController,
  type PrintCommandResult,
} from "../lib/agent/subagent-types.js";

// Use unified stable runtime constants directly from lib/agent-common.ts
// (Local aliases removed for DRY compliance)

const runtimeState = getSharedRuntimeState().subagents;

// Provider-isolated penalty controller for cross-provider rate limit isolation
// Phase 1 - Quick Wins: Adaptive Penalty Per-Provider Isolation
const providerIsolatedPenalty = createProviderIsolatedPenaltyController({
  isStable: STABLE_RUNTIME_PROFILE,
  maxPenalty: SHARED_ADAPTIVE_PARALLEL_MAX_PENALTY,
  decayMs: SHARED_ADAPTIVE_PARALLEL_DECAY_MS,
  decayStrategy: "hybrid",  // Faster recovery with hybrid decay
});

// Legacy adapter for backward compatibility (maps to "unknown" provider)
const adaptivePenalty = {
  get: () => providerIsolatedPenalty.getGlobalPenalty(),
  applyLimit: (baseLimit: number) => providerIsolatedPenalty.applyLimit("unknown", baseLimit),
  raise: (reason: "rate_limit" | "timeout" | "capacity") => providerIsolatedPenalty.raise("unknown", reason),
  lower: () => providerIsolatedPenalty.lower("unknown"),
};

// Phase 3 - Advanced Features: Semantic Result Cache
// Enable semantic similarity matching for cache lookups
const SEMANTIC_CACHE_ENABLED = process.env.PI_SEMANTIC_CACHE !== "0";
const SEMANTIC_CACHE_THRESHOLD = parseFloat(process.env.PI_SEMANTIC_THRESHOLD || "0.85");
const SEMANTIC_CACHE_MAX_ENTRIES = parseInt(process.env.PI_SEMANTIC_MAX_ENTRIES || "1000", 10);
const SEMANTIC_CACHE_TTL_MS = parseInt(process.env.PI_SEMANTIC_TTL_MS || "1800000", 10); // 30 minutes

/**
 * Get embedding for text (placeholder - uses simple hash for now)
 * In production, this would call an embedding API like OpenAI text-embedding-3-small
 * @summary 埋め込みベクトル取得
 */
async function getEmbedding(text: string): Promise<number[]> {
  // Simple hash-based pseudo-embedding for basic similarity detection
  // This is a placeholder - in production, use a real embedding model
  const normalized = text.toLowerCase().trim();
  const words = normalized.split(/\s+/).filter(w => w.length > 2);
  
  // Create a simple bag-of-words style embedding
  const embedding: number[] = new Array(128).fill(0);
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i] || "";
    for (let j = 0; j < word.length && j < 128; j++) {
      const charCode = word.charCodeAt(j) || 0;
      const idx = (i * 7 + j * 13 + charCode) % 128;
      embedding[idx] = (embedding[idx] || 0) + 1 / (1 + i);
    }
  }
  
  // Normalize the embedding
  const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (norm > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] = embedding[i]! / norm;
    }
  }
  
  return embedding;
}

// Initialize semantic cache
const _semanticCache = getSharedSemanticCache(
  {
    enabled: SEMANTIC_CACHE_ENABLED,
    similarityThreshold: SEMANTIC_CACHE_THRESHOLD,
    maxEntries: SEMANTIC_CACHE_MAX_ENTRIES,
    ttlMs: SEMANTIC_CACHE_TTL_MS,
  },
  getEmbedding,
);

// Note: SubagentLiveItem and monitor interfaces are imported from lib/subagent-types.ts
// LiveStreamView and LiveViewMode are re-exported from lib/subagent-types.ts (originally from lib/index.ts)

// Re-export extracted module functions for backward compatibility
export {
  renderSubagentLiveView,
  createSubagentLiveMonitor,
} from "./subagents/live-monitor";

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
  _task: string,
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

const RESULT_REUSE_ENABLED = process.env.PI_DELEGATION_RESULT_REUSE !== "0";
const RESULT_REUSE_WINDOW_MS = (() => {
  const raw = Number(process.env.PI_DELEGATION_RESULT_REUSE_WINDOW_MS ?? "600000");
  if (!Number.isFinite(raw) || raw <= 0) return 600_000;
  return Math.max(30_000, Math.min(7_200_000, Math.trunc(raw)));
})();

function normalizeReuseText(value: string | undefined): string {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * エージェント設定のハッシュを計算する
 * 設定変更を検出してキャッシュの有効性を判定するために使用
 */
function computeAgentConfigHash(agent: SubagentDefinition): string {
  const configStr = [
    agent.systemPrompt || "",
    agent.provider || "",
    agent.model || "",
    String(agent.enabled),
    (agent.skills || []).sort().join(","),
  ].join("|");
  
  // 簡易ハッシュ（FNV-1a風）
  let hash = 2166136261;
  for (let i = 0; i < configStr.length; i++) {
    hash ^= configStr.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16);
}

export function loadSubagentRunArtifact(outputFile: string): { prompt?: string; output?: string } | null {
  if (!outputFile || !existsSync(outputFile)) return null;
  try {
    const raw = readFileSync(outputFile, "utf-8");
    const parsed = JSON.parse(raw) as { prompt?: string; output?: string };
    return parsed;
  } catch (error) {
    // エラーの種類を区別してログ出力
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (error instanceof SyntaxError) {
      console.error(`[subagents] Failed to parse artifact JSON: ${outputFile}: ${errorMessage}`);
    } else {
      console.error(`[subagents] Failed to load artifact: ${outputFile}: ${errorMessage}`);
    }
    return null;
  }
}

function findReusableSubagentRun(input: {
  storage: SubagentStorage;
  agentId: string;
  task: string;
  extraContext?: string;
}): { runRecord: SubagentRunRecord; output: string; cacheAgeMs: number } | null {
  if (!RESULT_REUSE_ENABLED) return null;

  const normalizedTask = normalizeReuseText(input.task);
  if (!normalizedTask) return null;

  const normalizedExtraContext = normalizeReuseText(input.extraContext);
  const nowMs = Date.now();

  // 現在のエージェント設定を取得してハッシュを計算
  const currentAgent = input.storage.agents.find(a => a.id === input.agentId);
  if (!currentAgent) return null; // エージェントが存在しない場合はキャッシュ不使用
  if (currentAgent.enabled !== "enabled") return null; // 無効なエージェントはキャッシュ不使用
  const currentConfigHash = computeAgentConfigHash(currentAgent);

  const recentRuns = input.storage.runs.slice().reverse();
  for (const run of recentRuns) {
    if (run.status !== "completed") continue;
    if (run.agentId !== input.agentId) continue;
    if (normalizeReuseText(run.task) !== normalizedTask) continue;

    // 設定ハッシュの比較（古いレコードにハッシュがない場合はスキップ）
    if (run.agentConfigHash && run.agentConfigHash !== currentConfigHash) {
      continue; // 設定が変更されているためキャッシュ不使用
    }

    const finishedAtMs = Date.parse(run.finishedAt || run.startedAt || "");
    if (!Number.isFinite(finishedAtMs)) continue;
    const cacheAgeMs = nowMs - finishedAtMs;
    if (cacheAgeMs < 0 || cacheAgeMs > RESULT_REUSE_WINDOW_MS) continue;

    const artifact = loadSubagentRunArtifact(run.outputFile);
    const output = artifact?.output?.trim() || run.summary || "(cached summary only)";

    if (normalizedExtraContext) {
      const normalizedPrompt = normalizeReuseText(artifact?.prompt);
      const probe = normalizedExtraContext.slice(0, 180);
      if (!normalizedPrompt || !normalizedPrompt.includes(probe)) {
        continue;
      }
    }

    return {
      runRecord: run,
      output,
      cacheAgeMs,
    };
  }

  return null;
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

function formatAgentBenchmarkStatus(args: {
  variants: ReturnType<typeof loadAgentBenchmarkComparison>["variants"];
  runs: ReturnType<typeof loadAgentBenchmarkStore>["runs"];
  limit: number;
  variantFilter?: string;
}): string {
  const filteredVariants = args.variantFilter
    ? args.variants.filter((item) => item.variantId.includes(args.variantFilter!))
    : args.variants;
  const filteredRuns = args.variantFilter
    ? args.runs.filter((item) => item.variantId.includes(args.variantFilter!))
    : args.runs;

  if (filteredRuns.length === 0) {
    return "No agent benchmark runs recorded yet.";
  }

  const lines: string[] = ["Agent benchmark summary:"];
  if (filteredVariants.length > 0) {
    const best = filteredVariants[0]!;
    lines.push(
      `Best: ${best.variantId} | completion=${(best.completionRate * 100).toFixed(1)}% | tool-failure=${(best.toolFailureRate * 100).toFixed(1)}% | turns=${best.averageTurns.toFixed(1)} | runtime-notices=${best.averageRuntimeNotificationCount.toFixed(1)}`,
    );
    lines.push(
      `Layer tokens(avg): tools=${best.averagePromptLayerTokens["tool-description"].toFixed(1)} policy=${best.averagePromptLayerTokens["system-policy"].toFixed(1)} context=${best.averagePromptLayerTokens["startup-context"].toFixed(1)} runtime=${best.averagePromptLayerTokens["runtime-notification"].toFixed(1)}`,
    );
  }

  lines.push("");
  lines.push("Recent runs:");
  for (const run of filteredRuns.slice(-args.limit).reverse()) {
    lines.push(
      `- ${run.variantId} | ${run.scenarioId} | completed=${run.completed ? "yes" : "no"} | failures=${run.toolFailures}/${run.toolCalls} | turns=${run.turns}`,
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
async function _runPiPrintMode(input: {
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

type DelegationTaskKind = "research" | "implementation" | "planning" | "review";

export function inferDelegationTaskKind(task: string, extraContext?: string): DelegationTaskKind {
  const normalized = [task, extraContext ?? ""].join(" ").toLowerCase();

  if (/\b(plan|design|architecture|migration|spec|strategy)\b/.test(normalized)) {
    return "planning";
  }
  if (/\b(review|audit|risk|security|inspect|qa)\b/.test(normalized)) {
    return "review";
  }
  if (/\b(research|investigate|analyz|search|read|explore|understand)\b/.test(normalized)) {
    return "research";
  }
  return "implementation";
}

function resolveSubagentTurnPolicy(input: {
  cwd: string;
  task: string;
  extraContext?: string;
}): {
  turnContext: TurnExecutionContext;
  turnDecisions: TurnExecutionDecisions;
} {
  const turnContext = buildTurnExecutionContext({
    cwd: input.cwd,
    startupKind: input.extraContext?.trim() ? "delta" : "baseline",
    isFirstTurn: false,
    previousContextAvailable: Boolean(input.extraContext?.trim()),
    sessionElapsedMs: 0,
  });
  const turnDecisions = deriveTurnExecutionDecisions(turnContext, {
    taskKind: inferDelegationTaskKind(input.task, input.extraContext),
    taskText: input.task,
  });

  return { turnContext, turnDecisions };
}

export function selectPreferredAgents(
  storage: SubagentStorage,
  preferredSubagentIds: string[],
): SubagentDefinition[] {
  const enabledAgents = storage.agents.filter((agent) => agent.enabled === "enabled");
  if (enabledAgents.length === 0) {
    return [];
  }

  const selected: SubagentDefinition[] = [];
  const seen = new Set<string>();

  for (const preferredId of preferredSubagentIds) {
    const matched = enabledAgents.find((agent) => agent.id === preferredId);
    if (matched && !seen.has(matched.id)) {
      selected.push(matched);
      seen.add(matched.id);
    }
  }

  for (const agent of enabledAgents) {
    if (!seen.has(agent.id)) {
      selected.push(agent);
      seen.add(agent.id);
    }
  }

  return selected;
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

function _pickDefaultParallelAgents(
  storage: SubagentStorage,
  preferredSubagentIds: string[] = [],
): SubagentDefinition[] {
  const enabledAgents = selectPreferredAgents(storage, preferredSubagentIds);
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

export function resolveTurnParallelism(input: {
  requestedMaxConcurrency?: number;
  runtimeParallelLimit: number;
  taskCount: number;
  providerParallelLimit?: number;
  policyParallelLimit: number;
}): number {
  const requested = Number.isFinite(input.requestedMaxConcurrency)
    ? Math.max(1, Math.trunc(input.requestedMaxConcurrency as number))
    : input.runtimeParallelLimit;
  const providerLimit = Number.isFinite(input.providerParallelLimit)
    ? Math.max(1, Math.trunc(input.providerParallelLimit as number))
    : Number.POSITIVE_INFINITY;

  return Math.max(
    1,
    Math.min(
      requested,
      Math.max(1, input.runtimeParallelLimit),
      Math.max(1, input.taskCount),
      Math.max(1, input.policyParallelLimit),
      providerLimit,
    ),
  );
}

const HEAVY_VALIDATION_PATTERN = /\b(test|tests|build|lint|typecheck|type-check|compile|verification|verify|smoke)\b|テスト|ビルド|型検査|検証|スモーク/i;

function isHeavyValidationText(value: string | undefined): boolean {
  return typeof value === "string" && HEAVY_VALIDATION_PATTERN.test(value);
}

function shouldSerializeHeavyValidation(task: string, extraTexts: string[] = []): boolean {
  if (isHeavyValidationText(task)) {
    return true;
  }

  return extraTexts.some((entry) => isHeavyValidationText(entry));
}

// Note: runSubagentTask is now imported from ./subagents/task-execution

/**
 * サブエージェント拡張を登録
 * @summary 拡張機能登録
 * @param pi - 拡張機能API
 * @returns {void}
 */

// モジュールレベルのフラグ（reload時のリスナー重複登録防止）
let isInitialized = false;

/**
 * テスト用のリセット関数
 * @summary isInitializedフラグをリセット
 */
export function resetForTesting(): void {
  isInitialized = false;
}

export default function registerSubagentExtension(pi: ExtensionAPI) {
  if (process.env.PI_CHILD_DISABLE_ORCHESTRATION === "1") {
    return;
  }

  if (isInitialized) return;
  isInitialized = true;

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

  /**
   * Parallel実行モードのヘルパー関数
   * subagent_run_dagから呼び出される
   */
  async function executeParallelMode(args: {
    activeAgents: SubagentDefinition[];
    cachedByAgentId: Map<string, { runRecord: SubagentRunRecord; output: string; cacheAgeMs: number }>;
    turnDecisions: TurnExecutionDecisions;
    params: {
      task: string;
      extraContext?: string;
      timeoutMs?: number;
      taskId?: string;
      ulTaskId?: string;
    };
    storage: SubagentStorage;
    snapshot: ReturnType<typeof getRuntimeSnapshot>;
    timeoutMs: number;
    retryOverrides?: Partial<{ maxRetries: number; initialDelayMs: number; maxDelayMs: number; multiplier: number; jitter: "full" | "partial" | "none" }>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ctx: any;
    _signal?: AbortSignal;
  }): Promise<{ content: { type: "text"; text: string }[]; details: Record<string, unknown> }> {
    const { activeAgents, cachedByAgentId, turnDecisions, params, storage, snapshot, timeoutMs, retryOverrides, ctx, _signal } = args;
    const trackedTaskId = typeof params.taskId === "string" && params.taskId.trim()
      ? params.taskId.trim()
      : params.ulTaskId;

    logger.startOperation(
      "subagent_run" as OperationType,
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

    const executableAgents = activeAgents.filter((agent) => !cachedByAgentId.has(agent.id));
    const cachedResults: { runRecord: SubagentRunRecord; output: string; prompt: string }[] = activeAgents
      .filter((agent) => cachedByAgentId.has(agent.id))
      .map((agent) => {
        const reusable = cachedByAgentId.get(agent.id)!;
        return {
          runRecord: reusable.runRecord,
          output: reusable.output,
          prompt: "[cache-hit]",
        };
      });

    let capacityReservation: RuntimeCapacityReservationLease | undefined;
    let stopReservationHeartbeat: (() => void) | undefined;
    let liveMonitor: SubagentLiveMonitorController | undefined;

    try {
      const providerParallelLimit = resolveProviderConcurrencyCap(
        executableAgents,
        ctx.model?.provider,
        ctx.model?.id,
      );
      const baselineParallelism = resolveTurnParallelism({
        runtimeParallelLimit: Math.min(
          toConcurrencyLimit(snapshot.limits.maxParallelSubagentsPerRun, 1),
          Math.max(1, snapshot.limits.maxTotalActiveLlm),
        ),
        taskCount: executableAgents.length,
        providerParallelLimit,
        policyParallelLimit: turnDecisions.maxParallelSubagents,
      });
      const requestedHeavyValidation = shouldSerializeHeavyValidation(
        params.task,
        [params.extraContext ?? ""],
      );
      const effectiveParallelism = requestedHeavyValidation
        ? 1
        : adaptivePenalty.applyLimit(baselineParallelism);

      const dispatchPermit = await acquireRuntimeDispatchPermit({
        toolName: "subagent_run_dag",
        candidate: {
          additionalRequests: 1,
          additionalLlm: Math.min(effectiveParallelism, snapshot.limits.maxParallelSubagentsPerRun),
          workloadClass: requestedHeavyValidation ? "heavy-validation" : "default",
        },
        tenantKey: executableAgents.map((entry) => entry.id).join(","),
        source: "scheduled",
        estimatedDurationMs: 60_000,
        estimatedRounds: Math.max(1, executableAgents.length),
        maxWaitMs: snapshot.limits.capacityWaitMs,
        pollIntervalMs: snapshot.limits.capacityPollMs,
        signal: _signal,
      });

      if (!dispatchPermit.allowed || !dispatchPermit.lease) {
        adaptivePenalty.raise("capacity");
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

      const costEstimate = getCostEstimator().estimate(
        "subagent_run",
        ctx.model?.provider,
        ctx.model?.id,
        params.task,
      );
      debugCostEstimation("subagent_run_dag", {
        estimated_ms: costEstimate.estimatedDurationMs,
        estimated_tokens: costEstimate.estimatedTokens,
        agents: activeAgents.length,
        applied_parallelism: Math.max(1, effectiveParallelism),
        confidence: costEstimate.confidence.toFixed(2),
        method: costEstimate.method,
      });

      liveMonitor = createSubagentLiveMonitor(ctx, {
        title: `Subagent Run DAG (Parallel Mode)`,
        items: activeAgents.map((agent) => ({ id: agent.id, name: agent.name })),
      });

      runtimeState.activeRunRequests += 1;
      notifyRuntimeCapacityChanged();
      refreshRuntimeStatus(ctx);
      capacityReservation.consume();

      // DynTaskMAS: エージェントの重みを計算（専門性ベース）
      const agentWeights = new Map<string, number>();
      for (const agent of executableAgents) {
        const weight = getAgentSpecializationWeight(agent.id);
        agentWeights.set(agent.id, weight);
      }

      // Create runtime session for parallel execution tracking
      const parallelSessionId = generateSessionId();
      const parallelSession: RuntimeSession = {
        id: parallelSessionId,
        type: "subagent",
        agentId: activeAgents.map((a) => a.id).join(","),
        taskId: trackedTaskId,
        taskTitle: params.task.slice(0, 50),
        taskDescription: params.task,
        status: "starting",
        startedAt: Date.now(),
        teammateCount: activeAgents.length,
      };
      addSession(parallelSession);

      // Promise.allSettledパターンで部分失敗を許容
      type SubagentTaskResult = {
        runRecord: SubagentRunRecord;
        output: string;
        prompt: string;
        promptStackSummary: import("../lib/agent/benchmark-harness.js").PromptStackBenchmarkSummary;
        runtimeNotificationCount: number;
      };
      type SettledTaskResult = { status: 'fulfilled' | 'rejected'; value?: SubagentTaskResult; reason?: unknown; index: number };

      const settledResults = await runWithConcurrencyLimit(
        executableAgents,
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
      const results = [...cachedResults, ...succeededResults];

      // 拒否されたタスクをエージェントIDと共に記録
      const rejectedDetails = rejectedResults.map((r) => {
        const agent = executableAgents[r.index];
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

      // Update session with final status
      updateSession(parallelSessionId, {
        status: totalFailed === 0 ? "completed" : (totalFailed < activeAgents.length ? "completed" : "failed"),
        completedAt: Date.now(),
        message: `${results.length - failed.length}/${activeAgents.length} agents completed`,
      });

      if (totalFailed > 0) {
        const pressureSignals = failed
          .map((result) => classifyPressureError(result.runRecord.error || ""))
          .filter((signal): signal is "rate_limit" | "capacity" => signal !== "other");
        if (pressureSignals.length > 0) {
          const hasRateLimit = pressureSignals.includes("rate_limit");
          adaptivePenalty.raise(hasRateLimit ? "rate_limit" : "capacity");
        }
        logger.endOperation({
          status: "partial",
          tokensUsed: 0,
          outputLength: 0,
          childOperations: results.length,
          toolCalls: 0,
        });
        // Build aggregated output
        const aggregatedOutput = results
          .map((result) => {
            const status = result.runRecord.status === "completed" ? "SUCCESS" : "FAILED";
            return `## ${result.runRecord.agentId}\nStatus: ${status}\n${result.output || result.runRecord.summary || ""}`;
          })
          .join("\n\n");
        const failedMemberIds = [...failed.map((result) => result.runRecord.agentId), ...rejectedDetails.map(r => r.agentId)];
        const executedPromptChars = succeededResults.reduce((sum, result) => sum + result.prompt.length, 0);
        const benchmarkRun = createSubagentBenchmarkRun({
          provider: ctx.model?.provider,
          model: ctx.model?.id,
          task: params.task,
          successCount: results.length - failed.length,
          failureCount: totalFailed,
          promptChars: executedPromptChars,
          promptStackSummary: mergePromptStackBenchmarkSummaries(
            succeededResults.map((result) => result.promptStackSummary),
          ),
          runtimeNotificationCount: succeededResults.reduce(
            (sum, result) => sum + result.runtimeNotificationCount,
            0,
          ),
        });
        try {
          recordAgentBenchmarkRun(ctx.cwd, benchmarkRun);
        } catch {
          // benchmark 保存失敗は本体処理を止めない
        }
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
            benchmarkRun,
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
        const benchmarkRun = createSubagentBenchmarkRun({
          provider: ctx.model?.provider,
          model: ctx.model?.id,
          task: params.task,
          successCount: results.length,
          failureCount: 0,
          promptChars: succeededResults.reduce((sum, result) => sum + result.prompt.length, 0),
          promptStackSummary: mergePromptStackBenchmarkSummaries(
            succeededResults.map((result) => result.promptStackSummary),
          ),
          runtimeNotificationCount: succeededResults.reduce(
            (sum, result) => sum + result.runtimeNotificationCount,
            0,
          ),
        });
        try {
          recordAgentBenchmarkRun(ctx.cwd, benchmarkRun);
        } catch {
          // benchmark 保存失敗は本体処理を止めない
        }
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
            benchmarkRun,
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
  }

  // 統合サブエージェント実行（parallel + DAG）
  pi.registerTool({
    name: "subagent_run_dag",
    label: "Subagent Run DAG",
    description:
      "Unified subagent execution tool. Supports three modes: (1) Parallel: specify subagentIds for multi-agent parallel execution, (2) DAG: specify plan for dependency-aware execution, (3) Auto: omit both for automatic DAG generation from task.",
    parameters: Type.Object({
      task: Type.String({ description: "Task to execute (used in all modes)" }),
      // Parallel mode parameters
      subagentIds: createOptionalStringArraySchema(
        "Subagent IDs for parallel execution mode. When specified, runs selected agents in parallel.",
      ),
      extraContext: Type.Optional(Type.String({ description: "Optional shared context for all subagents (parallel mode)" })),
      retry: createRetrySchema(),
      // DAG mode parameters
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
        description: "Auto-generate DAG when plan and subagentIds omitted (default: true)"
      })),
      // Common parameters
      maxConcurrency: createBoundedOptionalNumberSchema("Maximum parallel tasks (default: 3)", 1, 16),
      abortOnFirstError: Type.Optional(Type.Boolean({ description: "Stop on first task failure (default: false)" })),
      timeoutMs: createBoundedOptionalNumberSchema("Per-task timeout in ms (default: 300000)", 1_000, 3_600_000),
      taskId: Type.Optional(Type.String({ description: "Task queue task ID. If provided, runtime session tracking binds to this task." })),
      ulTaskId: Type.Optional(Type.String({ description: "UL workflow task ID. If provided, checks ownership before execution." })),
      artifactPath: Type.Optional(Type.String({ description: "Optional file path to persist the final DAG artifact." })),
      artifactTaskId: Type.Optional(Type.String({ description: "Preferred task ID whose output should be written to artifactPath." })),
      dynamicResearch: Type.Optional(
        Type.Object({
          task: Type.String(),
          gapTaskId: Type.String(),
          synthesisTaskId: Type.String(),
        }),
      ),
      dynamicPlan: Type.Optional(
        Type.Object({
          task: Type.String(),
          gapTaskId: Type.String(),
          synthesisTaskId: Type.String(),
        }),
      ),
      dynamicImplement: Type.Optional(
        Type.Object({
          task: Type.String(),
          gapTaskId: Type.String(),
          synthesisTaskId: Type.String(),
        }),
      ),
      dynamicReview: Type.Optional(
        Type.Object({
          task: Type.String(),
          gapTaskId: Type.String(),
          synthesisTaskId: Type.String(),
        }),
      ),
      // AdaptOrch拡張
      enableAdaptOrch: Type.Optional(Type.Boolean({
        description: "Enable AdaptOrch topology-aware orchestration (default: false)"
      })),
      forceTopology: createOptionalEnumStringSchema(
        "Force specific topology: parallel|sequential|hierarchical|hybrid",
        ["parallel", "sequential", "hierarchical", "hybrid"],
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const trackedTaskId = typeof params.taskId === "string" && params.taskId.trim()
        ? params.taskId.trim()
        : params.ulTaskId;

      const { turnDecisions } = resolveSubagentTurnPolicy({
        cwd: ctx.cwd,
        task: params.task,
        extraContext: typeof params.extraContext === "string" ? params.extraContext : undefined,
      });

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

      // タスクを in_progress に設定
      if (params.ulTaskId) {
        setTaskInProgress(params.ulTaskId);
      }

      const storage = loadStorage(ctx.cwd);
      const snapshot = getRuntimeSnapshot();
      const timeoutMs = resolveEffectiveTimeoutMs(
        params.timeoutMs,
        ctx.model?.id,
        DEFAULT_AGENT_TIMEOUT_MS,
      );

      if (!turnDecisions.allowSubtaskDelegation) {
        return {
          content: [{ type: "text" as const, text: "subagent_run_dag error: subtask delegation is blocked by the current autonomy policy." }],
          details: {
            error: "subtask_delegation_blocked",
            preferredSubagentIds: turnDecisions.preferredSubagentIds,
            outcomeCode: "NONRETRYABLE_FAILURE" as RunOutcomeCode,
            retryRecommended: false,
          },
        };
      }

      // ========================================
      // PARALLEL MODE: subagentIdsが指定された場合
      // ========================================
      if (params.subagentIds && params.subagentIds.length > 0) {
        const retryOverrides = toRetryOverrides(params.retry);
        const requestedIds = Array.from(new Set(params.subagentIds.map((id) => String(id).trim()).filter(Boolean)));

        const selectedAgents = requestedIds
          .map((id) => storage.agents.find((agent) => agent.id === id))
          .filter((agent): agent is SubagentDefinition => Boolean(agent));

        const missingIds = requestedIds.filter((id) => !storage.agents.some((agent) => agent.id === id));

        if (missingIds.length > 0) {
          return {
            content: [{ type: "text" as const, text: `subagent_run_dag error: unknown ids: ${missingIds.join(", ")}` }],
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
            content: [{ type: "text" as const, text: "subagent_run_dag error: no enabled subagents selected." }],
            details: {
              error: "no_enabled_subagents",
              outcomeCode: "NONRETRYABLE_FAILURE" as RunOutcomeCode,
              retryRecommended: false,
            },
          };
        }

        // キャッシュチェック
        const cachedByAgentId = new Map<string, { runRecord: SubagentRunRecord; output: string; cacheAgeMs: number }>();
        for (const agent of activeAgents) {
          const reusable = findReusableSubagentRun({
            storage,
            agentId: agent.id,
            task: params.task,
            extraContext: params.extraContext,
          });
          if (reusable) {
            cachedByAgentId.set(agent.id, reusable);
          }
        }

        // 全キャッシュヒット時は即座に返す
        if (cachedByAgentId.size === activeAgents.length) {
          const aggregatedOutput = activeAgents
            .map((agent) => {
              const reusable = cachedByAgentId.get(agent.id)!;
              const ageSec = Math.floor(reusable.cacheAgeMs / 1000);
              return `## ${agent.id}\nStatus: SUCCESS (cache-hit, age=${ageSec}s)\n${reusable.output || reusable.runRecord.summary || ""}`;
            })
            .join("\n\n");

          const benchmarkRun = createSubagentBenchmarkRun({
            provider: ctx.model?.provider,
            model: ctx.model?.id,
            task: params.task,
            successCount: activeAgents.length,
            failureCount: 0,
            promptChars: 0,
            runtimeNotificationCount: 0,
          });
          try {
            recordAgentBenchmarkRun(ctx.cwd, benchmarkRun);
          } catch {
            // benchmark 保存失敗は本体処理を止めない
          }
          return {
            content: [{ type: "text" as const, text: aggregatedOutput }],
            details: {
              results: activeAgents.map((agent) => {
                const reusable = cachedByAgentId.get(agent.id)!;
                return {
                  agentId: agent.id,
                  status: reusable.runRecord.status,
                  summary: reusable.runRecord.summary,
                  output: reusable.output,
                  cached: true,
                  cacheAgeMs: reusable.cacheAgeMs,
                };
              }),
              successCount: activeAgents.length,
              totalCount: activeAgents.length,
              cachedCount: activeAgents.length,
              outcomeCode: "SUCCESS" as RunOutcomeCode,
              retryRecommended: false,
              benchmarkRun,
            },
          };
        }

        // 依存関係推論 → 必要ならDAG実行へ自動切り替え
        const inferredDeps = inferSubagentDependencies(activeAgents, params.task);
        if (inferredDeps.hasDependencies) {
          console.log("[subagent_run_dag] Parallel mode: auto-switching to DAG execution due to dependencies");
          console.log(`[subagent_run_dag] Detected: ${inferredDeps.description}`);

          try {
            const dagPlan = await generateDagFromTask(params.task, {
              maxDepth: 4,
              maxTasks: activeAgents.length + 2,
              preferredAgents: [
                ...activeAgents.map((agent) => agent.id),
                ...turnDecisions.preferredSubagentIds,
              ],
            });

            console.log(`[subagent_run_dag] Generated DAG: ${dagPlan.id} (${dagPlan.tasks.length} tasks)`);

            // DAG実行にフォールスルー（下のDAGロジックを使用）
            params.plan = {
              id: dagPlan.id,
              description: dagPlan.description,
              tasks: dagPlan.tasks.map((t) => ({
                id: t.id,
                description: t.description,
                assignedAgent: t.assignedAgent,
                dependencies: t.dependencies,
                priority: t.priority,
                inputContext: t.inputContext,
              })),
            };
            // DAGモードへ進む
          } catch (dagError) {
            console.log(`[subagent_run_dag] DAG generation failed, continuing with parallel: ${dagError}`);
            // parallel実行を継続
          }
        }

        // parallel実行が確定した場合（DAGに切り替えなかった場合）
        if (!params.plan) {
          // parallel実行ロジックを実行してreturn
          return await executeParallelMode({
            activeAgents,
            cachedByAgentId,
            turnDecisions,
            params,
            storage,
            snapshot,
            timeoutMs,
            retryOverrides,
            ctx,
            _signal,
          });
        }
      }

      // ========================================
      // DAG MODE: plan指定 または 自動生成
      // ========================================
      const providerParallelLimit = resolveProviderConcurrencyCap(
        storage.agents,
        ctx.model?.provider,
        ctx.model?.id,
      );
      const baselineMaxConcurrency = resolveTurnParallelism({
        requestedMaxConcurrency: typeof params.maxConcurrency === "number" ? params.maxConcurrency : undefined,
        runtimeParallelLimit: Math.min(
          snapshot.limits.maxParallelSubagentsPerRun,
          Math.max(1, snapshot.limits.maxTotalActiveLlm),
        ),
        taskCount: params.plan?.tasks?.length ?? Math.max(1, turnDecisions.maxLoopIterations),
        providerParallelLimit,
        policyParallelLimit: turnDecisions.maxParallelSubagents,
      });
      const abortOnFirstError = params.abortOnFirstError ?? false;
      const dynamicResearchConfig = (
        params.dynamicResearch && typeof params.dynamicResearch === "object"
          ? params.dynamicResearch as DynamicResearchConfig
          : null
      );
      const dynamicPlanConfig = (
        params.dynamicPlan && typeof params.dynamicPlan === "object"
          ? params.dynamicPlan as DynamicPlanConfig
          : null
      );
      const dynamicImplementConfig = (
        params.dynamicImplement && typeof params.dynamicImplement === "object"
          ? params.dynamicImplement as DynamicImplementConfig
          : null
      );
      const dynamicReviewConfig = (
        params.dynamicReview && typeof params.dynamicReview === "object"
          ? params.dynamicReview as DynamicReviewConfig
          : null
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
            maxDepth: turnDecisions.maxLoopIterations <= 2 ? 2 : 4,
            maxTasks: Math.max(4, turnDecisions.maxLoopIterations * 2),
            preferredAgents: turnDecisions.preferredSubagentIds,
            extraContext: typeof params.extraContext === "string" ? params.extraContext : undefined,
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

      const requestedHeavyValidation = shouldSerializeHeavyValidation(
        params.task,
        taskPlan.tasks.map((task) => task.description),
      );
      const maxConcurrency = requestedHeavyValidation ? 1 : baselineMaxConcurrency;

      logger.startOperation("subagent_run" as OperationType, taskPlan.id, {
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
            additionalLlm: Math.min(maxConcurrency, taskPlan.tasks.length, snapshot.limits.maxParallelSubagentsPerRun),
            workloadClass: requestedHeavyValidation ? "heavy-validation" : "default",
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

        // Create runtime session for DAG execution tracking
        const dagSessionId = generateSessionId();
        const dagSession: RuntimeSession = {
          id: dagSessionId,
          type: "subagent",
          agentId: "dag-executor",
          taskId: trackedTaskId,
          taskTitle: params.task.slice(0, 50),
          taskDescription: params.task,
          status: "starting",
          startedAt: Date.now(),
          teammateCount: taskPlan.tasks.length,
        };
        addSession(dagSession);

        runtimeState.activeRunRequests += 1;
        notifyRuntimeCapacityChanged();
        refreshRuntimeStatus(ctx);
        capacityReservation.consume();

        // Execute DAG using DagExecutor or AdaptOrch
        const useAdaptOrch = !dynamicResearchConfig && !dynamicPlanConfig && !dynamicImplementConfig && !dynamicReviewConfig && (params.enableAdaptOrch ?? isGlobalAdaptOrchEnabled());
        
        const dagExecuteFn = useAdaptOrch 
          ? (plan: TaskPlan, executor: any, opts: any) => executeWithAdaptOrch(plan, executor, {
              ...opts,
              enableAdaptOrch: true,
              forceTopology: params.forceTopology as any,
            })
          : executeDag;
        
        if (useAdaptOrch) {
          console.log(`[subagent_run_dag] Using AdaptOrch topology-aware orchestration${params.forceTopology ? ` (forced: ${params.forceTopology})` : ""}`);
        }
        
        let followupDecision: ResearchFollowupDecision | PlanFollowupDecision | ImplementFollowupDecision | ReviewFollowupDecision | undefined;
        let dynamicResearchApplied = false;
        let dynamicPlanApplied = false;
        let dynamicImplementApplied = false;
        let dynamicReviewApplied = false;
        const dagResult = await dagExecuteFn<{ runRecord: SubagentRunRecord; output: string; prompt: string }>(
          taskPlan,
          async (task: TaskNode, context: string) => {
            // Determine agent to use
            const agentId = task.assignedAgent ?? storage.currentAgentId;
            const agent = agentId
              ? storage.agents.find((a) => a.id === agentId)
              : selectPreferredAgents(
                  storage,
                  deriveTurnExecutionDecisions(
                    buildTurnExecutionContext({
                      cwd: ctx.cwd,
                      startupKind: context.trim() ? "delta" : "baseline",
                      isFirstTurn: false,
                      previousContextAvailable: Boolean(context.trim()),
                      sessionElapsedMs: 0,
                    }),
                    {
                      taskKind: inferDelegationTaskKind(task.description, context),
                      taskText: task.description,
                    },
                  ).preferredSubagentIds,
                )[0] ?? pickAgent(storage);

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
            nodeTimeoutMs: timeoutMs,
            overallTimeoutMs: timeoutMs > 0 ? timeoutMs * Math.max(1, taskPlan.tasks.length) : 0,
            onBatchSettled: dynamicResearchConfig
              ? (api: DagBatchMutationApi) => {
                const gapTaskId = dynamicResearchConfig.gapTaskId?.trim() || "research-gap-check";
                const synthesisTaskId = dynamicResearchConfig.synthesisTaskId?.trim() || "research-synthesis";
                if (dynamicResearchApplied || !api.completedTaskIds.includes(gapTaskId)) {
                  return;
                }

                dynamicResearchApplied = true;
                const outputByTaskId = new Map<string, string>();
                for (const [taskId, result] of Array.from(api.results.entries())) {
                  if (result.status !== "completed") {
                    continue;
                  }
                  outputByTaskId.set(taskId, extractDagTaskOutput(result.output));
                }

                const aggregatedBaseOutput = Array.from(outputByTaskId.entries())
                  .map(([taskId, output]) => `## ${taskId}\nStatus: COMPLETED\n${output}`)
                  .join("\n\n");
                followupDecision = decideResearchFollowups(aggregatedBaseOutput);
                const decision = followupDecision;
                const baseContext = buildDynamicResearchBaseContext(outputByTaskId, decision.rationale);

                if (decision.needsExternalDeepDive) {
                  api.addNode({
                    id: "research-deep-dive-external",
                    description: `調査対象: ${dynamicResearchConfig.task}

Stage 3 conditional deep dive: External
- gap check が external deep dive を要求したため、追加で必要な公式 docs、仕様、参考実装を集める
- 技術スタック、ライブラリ、API surface の不確実性を減らす

前提:
${baseContext}

出力フォーマット:
- findings: 事実
- evidence: 根拠
- open_questions: 未解決論点
- plan_impact: plan にどう効くか
- confidence: 0.0-1.0`,
                    assignedAgent: "researcher",
                    dependencies: [gapTaskId],
                    inputContext: [gapTaskId],
                    priority: "high",
                  });
                  api.addDependency(synthesisTaskId, "research-deep-dive-external");
                  api.addInputContext(synthesisTaskId, "research-deep-dive-external");
                }

                if (decision.needsCodebaseDeepDive) {
                  api.addNode({
                    id: "research-deep-dive-codebase",
                    description: `調査対象: ${dynamicResearchConfig.task}

Stage 3 conditional deep dive: Codebase and risk
- gap check が codebase / risk deep dive を要求したため、追加で読むべきファイル、再利用候補、危険箇所を絞る
- 実装候補と壊しやすい点を plan へ渡せる粒度まで掘る

前提:
${baseContext}

出力フォーマット:
- findings: 事実
- evidence: 根拠
- open_questions: 未解決論点
- plan_impact: plan にどう効くか
- confidence: 0.0-1.0`,
                    assignedAgent: "researcher",
                    dependencies: [gapTaskId],
                    inputContext: [gapTaskId],
                    priority: "high",
                  });
                  api.addDependency(synthesisTaskId, "research-deep-dive-codebase");
                  api.addInputContext(synthesisTaskId, "research-deep-dive-codebase");
                }
              }
              : dynamicPlanConfig
                ? (api: DagBatchMutationApi) => {
                  const gapTaskId = dynamicPlanConfig.gapTaskId?.trim() || "plan-gap-check";
                  const synthesisTaskId = dynamicPlanConfig.synthesisTaskId?.trim() || "plan-synthesis";
                  if (dynamicPlanApplied || !api.completedTaskIds.includes(gapTaskId)) {
                    return;
                  }

                  dynamicPlanApplied = true;
                  const outputByTaskId = new Map<string, string>();
                  for (const [taskId, result] of Array.from(api.results.entries())) {
                    if (result.status !== "completed") {
                      continue;
                    }
                    outputByTaskId.set(taskId, extractDagTaskOutput(result.output));
                  }

                  const aggregatedBaseOutput = Array.from(outputByTaskId.entries())
                    .map(([taskId, output]) => `## ${taskId}\nStatus: COMPLETED\n${output}`)
                    .join("\n\n");
                  followupDecision = decidePlanFollowups(aggregatedBaseOutput);
                  const decision = followupDecision as PlanFollowupDecision;
                  const baseContext = buildDynamicResearchBaseContext(outputByTaskId, decision.rationale);

                  if (decision.needsChangesDeepDive) {
                    api.addNode({
                      id: "plan-deep-dive-changes",
                      description: `タスク: ${dynamicPlanConfig.task}

Stage 3 conditional deep dive: Changes
- gap check が changes deep dive を要求したため、変更対象ファイル、実装順序、コードスニペットを追加で具体化する
- 実装時に迷わない粒度まで plan を深掘りする

前提:
${baseContext}`,
                      assignedAgent: "architect",
                      dependencies: [gapTaskId],
                      inputContext: [gapTaskId],
                      priority: "high",
                    });
                    api.addDependency(synthesisTaskId, "plan-deep-dive-changes");
                    api.addInputContext(synthesisTaskId, "plan-deep-dive-changes");
                  }

                  if (decision.needsValidationDeepDive) {
                    api.addNode({
                      id: "plan-deep-dive-validation",
                      description: `タスク: ${dynamicPlanConfig.task}

Stage 3 conditional deep dive: Validation
- gap check が validation deep dive を要求したため、verify 手順、回帰、受け入れ条件、ロールバック観点を追加で具体化する
- 完了判定を曖昧にしない粒度まで plan を深掘りする

前提:
${baseContext}`,
                      assignedAgent: "architect",
                      dependencies: [gapTaskId],
                      inputContext: [gapTaskId],
                      priority: "high",
                    });
                    api.addDependency(synthesisTaskId, "plan-deep-dive-validation");
                    api.addInputContext(synthesisTaskId, "plan-deep-dive-validation");
                  }
                }
                : dynamicImplementConfig
                  ? (api: DagBatchMutationApi) => {
                    const gapTaskId = dynamicImplementConfig.gapTaskId?.trim() || "implement-gap-check";
                    const synthesisTaskId = dynamicImplementConfig.synthesisTaskId?.trim() || "implement-synthesis";
                    if (dynamicImplementApplied || !api.completedTaskIds.includes(gapTaskId)) {
                      return;
                    }

                    dynamicImplementApplied = true;
                    const outputByTaskId = new Map<string, string>();
                    for (const [taskId, result] of Array.from(api.results.entries())) {
                      if (result.status !== "completed") {
                        continue;
                      }
                      outputByTaskId.set(taskId, extractDagTaskOutput(result.output));
                    }

                    const aggregatedBaseOutput = Array.from(outputByTaskId.entries())
                      .map(([taskId, output]) => `## ${taskId}\nStatus: COMPLETED\n${output}`)
                      .join("\n\n");
                    followupDecision = decideImplementFollowups(aggregatedBaseOutput);
                    const decision = followupDecision as ImplementFollowupDecision;
                    const baseContext = buildDynamicResearchBaseContext(outputByTaskId, decision.rationale);

                    if (decision.needsFixupDeepDive) {
                      api.addNode({
                        id: "implement-deep-dive-fixup",
                        description: `タスク: ${dynamicImplementConfig.task}

Stage 3 conditional deep dive: Fixup
- gap check が fixup deep dive を要求したため、追加修正を入れて review に進める状態にする
- 残っている実装の粗さや危険箇所を潰す

前提:
${baseContext}`,
                        assignedAgent: "implementer",
                        dependencies: [gapTaskId],
                        inputContext: [gapTaskId],
                        priority: "high",
                      });
                      api.addDependency(synthesisTaskId, "implement-deep-dive-fixup");
                      api.addInputContext(synthesisTaskId, "implement-deep-dive-fixup");
                    }

                    if (decision.needsVerificationDeepDive) {
                      api.addNode({
                        id: "implement-deep-dive-verification",
                        description: `タスク: ${dynamicImplementConfig.task}

Stage 3 conditional deep dive: Verification
- gap check が verification deep dive を要求したため、verify 手順、proof artifact、確認観点を追加で具体化する
- review フェーズで迷わない粒度まで整理する

前提:
${baseContext}`,
                        assignedAgent: "implementer",
                        dependencies: [gapTaskId],
                        inputContext: [gapTaskId],
                        priority: "high",
                      });
                      api.addDependency(synthesisTaskId, "implement-deep-dive-verification");
                      api.addInputContext(synthesisTaskId, "implement-deep-dive-verification");
                    }
                  }
                  : dynamicReviewConfig
                    ? (api: DagBatchMutationApi) => {
                      const gapTaskId = dynamicReviewConfig.gapTaskId?.trim() || "review-gap-check";
                      const synthesisTaskId = dynamicReviewConfig.synthesisTaskId?.trim() || "review-synthesis";
                      if (dynamicReviewApplied || !api.completedTaskIds.includes(gapTaskId)) {
                        return;
                      }

                      dynamicReviewApplied = true;
                      const outputByTaskId = new Map<string, string>();
                      for (const [taskId, result] of Array.from(api.results.entries())) {
                        if (result.status !== "completed") {
                          continue;
                        }
                        outputByTaskId.set(taskId, extractDagTaskOutput(result.output));
                      }

                      const aggregatedBaseOutput = Array.from(outputByTaskId.entries())
                        .map(([taskId, output]) => `## ${taskId}\nStatus: COMPLETED\n${output}`)
                        .join("\n\n");
                      followupDecision = decideReviewFollowups(aggregatedBaseOutput);
                      const decision = followupDecision as ReviewFollowupDecision;
                      const baseContext = buildDynamicResearchBaseContext(outputByTaskId, decision.rationale);

                      if (decision.needsRiskDeepDive) {
                        api.addNode({
                          id: "review-deep-dive-risk",
                          description: `タスク: ${dynamicReviewConfig.task}

Stage 3 conditional deep dive: Risk
- gap check が risk deep dive を要求したため、高リスク箇所、回帰、ロールバック観点を追加で具体化する

前提:
${baseContext}`,
                          assignedAgent: "reviewer",
                          dependencies: [gapTaskId],
                          inputContext: [gapTaskId],
                          priority: "high",
                        });
                        api.addDependency(synthesisTaskId, "review-deep-dive-risk");
                        api.addInputContext(synthesisTaskId, "review-deep-dive-risk");
                      }

                      if (decision.needsVerificationDeepDive) {
                        api.addNode({
                          id: "review-deep-dive-verification",
                          description: `タスク: ${dynamicReviewConfig.task}

Stage 3 conditional deep dive: Verification
- gap check が verification deep dive を要求したため、workspace_verify 手順、proof artifact、review artifact 観点を追加で具体化する

前提:
${baseContext}`,
                          assignedAgent: "reviewer",
                          dependencies: [gapTaskId],
                          inputContext: [gapTaskId],
                          priority: "high",
                        });
                        api.addDependency(synthesisTaskId, "review-deep-dive-verification");
                        api.addInputContext(synthesisTaskId, "review-deep-dive-verification");
                      }
                    }
                    : undefined,
            onTaskError: (taskId: string, error: Error) => {
              liveMonitor?.markFinished(taskId, "failed", error.message, error.message);
            },
          },
        );

        await saveStorageWithPatterns(ctx.cwd, storage);

        // Build result
        const completedCount = dagResult.completedTaskIds.length;
        const failedCount = dagResult.failedTaskIds.length;

        // Update session with final status
        updateSession(dagSessionId, {
          status: dagResult.overallStatus === "completed" ? "completed" : "failed",
          completedAt: Date.now(),
          progress: 100,
          message: `${completedCount}/${taskPlan.tasks.length} tasks completed`,
        });

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

        const preferredArtifactTaskId = typeof params.artifactTaskId === "string"
          ? params.artifactTaskId.trim()
          : "";
        const artifactContent = selectArtifactContent(
          dagResult.taskResults.entries(),
          preferredArtifactTaskId,
          aggregatedOutput,
        );

        persistDagArtifactFile(
          typeof params.artifactPath === "string" ? params.artifactPath : undefined,
          artifactContent,
        );

        logger.endOperation({
          status: dagResult.overallStatus === "completed" ? "success" : dagResult.overallStatus === "partial" ? "partial" : "failure",
          tokensUsed: 0,
          outputLength: aggregatedOutput.length,
          childOperations: taskPlan.tasks.length,
          toolCalls: 0,
        });

        const benchmarkRun = createSubagentBenchmarkRun({
          provider: ctx.model?.provider,
          model: ctx.model?.id,
          task: params.task,
          successCount: completedCount,
          failureCount: failedCount,
          promptChars: Array.from(dagResult.taskResults.values()).reduce((sum, result) => {
            if (result.status !== "completed") {
              return sum;
            }
            const value = result.output as { prompt?: string } | undefined;
            return sum + (typeof value?.prompt === "string" ? value.prompt.length : 0);
          }, 0),
          promptStackSummary: mergePromptStackBenchmarkSummaries(
            Array.from(dagResult.taskResults.values()).flatMap((result) => {
              if (result.status !== "completed") {
                return [];
              }
              const value = result.output as { promptStackSummary?: import("../lib/agent/benchmark-harness.js").PromptStackBenchmarkSummary } | undefined;
              return value?.promptStackSummary ? [value.promptStackSummary] : [];
            }),
          ),
          runtimeNotificationCount: Array.from(dagResult.taskResults.values()).reduce((sum, result) => {
            if (result.status !== "completed") {
              return sum;
            }
            const value = result.output as { runtimeNotificationCount?: number } | undefined;
            return sum + (value?.runtimeNotificationCount ?? 0);
          }, 0),
        });
        try {
          recordAgentBenchmarkRun(ctx.cwd, benchmarkRun);
        } catch {
          // benchmark 保存失敗は本体処理を止めない
        }
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
            artifactPath: params.artifactPath,
            artifactTaskId: preferredArtifactTaskId || undefined,
            followupDecision,
            outcomeCode:
              dagResult.overallStatus === "completed"
                ? ("SUCCESS" as RunOutcomeCode)
                : dagResult.overallStatus === "partial"
                  ? ("PARTIAL_SUCCESS" as RunOutcomeCode)
                  : ("NONRETRYABLE_FAILURE" as RunOutcomeCode),
            retryRecommended: failedCount > 0,
            benchmarkRun,
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
      limit: createBoundedOptionalNumberSchema("Number of runs to return", 1, 50),
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

  pi.registerTool({
    name: "subagent_inspect_run",
    label: "Subagent Inspect Run",
    description: "Load the persisted turn execution snapshot for a subagent run.",
    parameters: Type.Object({
      runId: Type.Optional(Type.String({ description: "Run ID to inspect. Uses latest run when omitted." })),
      outputFile: Type.Optional(Type.String({ description: "Direct path to a subagent run artifact JSON." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const storage = loadStorage(ctx.cwd);
      const outputFile = typeof params.outputFile === "string" && params.outputFile.trim()
        ? params.outputFile.trim()
        : (() => {
            const runId = typeof params.runId === "string" ? params.runId.trim() : "";
            const run = runId
              ? storage.runs.find((item) => item.runId === runId)
              : storage.runs[storage.runs.length - 1];
            if (!run?.outputFile) {
              throw new Error("subagent run artifact not found");
            }
            return run.outputFile;
          })();

      const snapshot = loadSubagentTurnContextSnapshot(outputFile);

      return {
        content: [{ type: "text" as const, text: formatTurnExecutionSnapshot(snapshot) }],
        details: {
          outputFile,
          snapshot,
        },
      };
    },
  });

  pi.registerTool({
    name: "subagent_replay_run",
    label: "Subagent Replay Run",
    description: "Replay a persisted subagent run from its artifact. Use prepareOnly to inspect reconstructed input without executing.",
    parameters: Type.Object({
      runId: Type.Optional(Type.String({ description: "Run ID to replay. Uses latest run when omitted." })),
      outputFile: Type.Optional(Type.String({ description: "Direct path to a subagent run artifact JSON." })),
      prepareOnly: Type.Optional(Type.Boolean({ description: "Only reconstruct replay input without executing." })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const storage = loadStorage(ctx.cwd);
      const outputFile = typeof params.outputFile === "string" && params.outputFile.trim()
        ? params.outputFile.trim()
        : (() => {
            const runId = typeof params.runId === "string" ? params.runId.trim() : "";
            const run = runId
              ? storage.runs.find((item) => item.runId === runId)
              : storage.runs[storage.runs.length - 1];
            if (!run?.outputFile) {
              throw new Error("subagent run artifact not found");
            }
            return run.outputFile;
          })();

      const replay = loadSubagentReplayInput(outputFile);
      if (!replay.run.agentId || !replay.run.task) {
        throw new Error("subagent replay artifact is missing agentId or task");
      }

      const agent = storage.agents.find((item) => item.id === replay.run.agentId);
      if (!agent) {
        throw new Error(`subagent not found for replay: ${replay.run.agentId}`);
      }

      if (params.prepareOnly === true) {
        return {
          content: [{
            type: "text" as const,
            text: [
              "Subagent Replay Input:",
              `Agent: ${replay.run.agentId}`,
              `Task: ${replay.run.task}`,
              `CWD: ${replay.snapshot.workspace.cwd}`,
              "",
              formatTurnExecutionSnapshot(replay.snapshot),
            ].join("\n"),
          }],
          details: {
            outputFile,
            replay,
            prepared: true,
          },
        };
      }

      const timeoutMs = resolveEffectiveTimeoutMs(
        undefined,
        ctx.model?.id,
        DEFAULT_AGENT_TIMEOUT_MS,
      );
      const result = await runSubagentTask({
        agent,
        task: replay.run.task,
        timeoutMs,
        cwd: replay.snapshot.workspace.cwd || ctx.cwd,
        modelProvider: ctx.model?.provider,
        modelId: ctx.model?.id,
        replaySnapshot: replay.snapshot,
        signal,
      });

      return {
        content: [{ type: "text" as const, text: result.output || result.runRecord.summary }],
        details: {
          replayedFrom: outputFile,
          originalRunId: replay.run.runId,
          replayRunRecord: result.runRecord,
        },
      };
    },
  });

  pi.registerTool({
    name: "agent_benchmark_status",
    label: "Agent Benchmark Status",
    description: "Show stored benchmark comparison for loop and subagent runs.",
    parameters: Type.Object({
      limit: createBoundedOptionalNumberSchema("Number of recent runs to show", 1, 20),
      variantId: Type.Optional(Type.String({ description: "Optional variant filter (provider/model)" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const limitRaw = Number(params.limit ?? 10);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(20, Math.trunc(limitRaw))) : 10;
      const variantFilter = typeof params.variantId === "string" ? params.variantId.trim() : "";
      const store = loadAgentBenchmarkStore(ctx.cwd);
      const comparison = loadAgentBenchmarkComparison(ctx.cwd);
      const text = formatAgentBenchmarkStatus({
        variants: comparison.variants,
        runs: store.runs,
        limit,
        variantFilter: variantFilter || undefined,
      });

      return {
        content: [{ type: "text" as const, text }],
        details: {
          variants: variantFilter
            ? comparison.variants.filter((item) => item.variantId.includes(variantFilter))
            : comparison.variants,
          runs: variantFilter
            ? store.runs.filter((item) => item.variantId.includes(variantFilter)).slice(-limit)
            : store.runs.slice(-limit),
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
        ctx.ui.notify("/subagent list | /subagent runs | /subagent inspect [runId] | /subagent benchmark [variant] | /subagent status | /subagent default <id> | /subagent enable <id> | /subagent disable <id>", "info");
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

      if (input === "inspect" || input.startsWith("inspect ")) {
        const runId = input.startsWith("inspect ") ? input.slice("inspect ".length).trim() : "";
        const run = runId
          ? storage.runs.find((item) => item.runId === runId)
          : storage.runs[storage.runs.length - 1];
        if (!run?.outputFile) {
          ctx.ui.notify("No subagent run artifact found.", "warning");
          return;
        }
        try {
          const snapshot = loadSubagentTurnContextSnapshot(run.outputFile);
          pi.sendMessage({
            customType: "subagent-inspect-run",
            content: formatTurnExecutionSnapshot(snapshot),
            display: true,
            details: {
              runId: run.runId,
              outputFile: run.outputFile,
              snapshot,
            },
          });
        } catch (error) {
          ctx.ui.notify(`Failed to inspect subagent run: ${toErrorMessage(error)}`, "error");
        }
        return;
      }

      if (input === "benchmark" || input.startsWith("benchmark ")) {
        const variantFilter = input.startsWith("benchmark ") ? input.slice("benchmark ".length).trim() : "";
        const benchmarkStore = loadAgentBenchmarkStore(ctx.cwd);
        const comparison = loadAgentBenchmarkComparison(ctx.cwd);
        pi.sendMessage({
          customType: "agent-benchmark-status",
          content: formatAgentBenchmarkStatus({
            variants: comparison.variants,
            runs: benchmarkStore.runs,
            limit: 10,
            variantFilter: variantFilter || undefined,
          }),
          display: true,
          details: {
            variants: variantFilter
              ? comparison.variants.filter((item) => item.variantId.includes(variantFilter))
              : comparison.variants,
            runs: variantFilter
              ? benchmarkStore.runs.filter((item) => item.variantId.includes(variantFilter)).slice(-10)
              : benchmarkStore.runs.slice(-10),
          },
        });
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
    
    // AdaptOrch設定を読み込み
    await loadAdaptOrchConfig();
    if (isGlobalAdaptOrchEnabled()) {
      ctx.ui.notify(
        "Subagent extension loaded with AdaptOrch topology-aware orchestration ENABLED",
        "success",
      );
    } else {
      ctx.ui.notify(
        "Subagent extension loaded (subagent_list, subagent_run, subagent_run_parallel). Enable AdaptOrch: PI_ADAPTORCH_ENABLED=1 or enableAdaptOrch: true",
        "info",
      );
    }
  });

  // デフォルトでマルチエージェント委譲を積極化する。
  // テンプレートシステムを使用してトークン効率を向上
  pi.on("before_agent_start", async (event, _ctx) => {
    if (String(process.env.PI_SUBAGENT_PROACTIVE_PROMPT || "1") !== "1") {
      return;
    }

    // テンプレートからプロンプトを構築
    const templates = getTemplatesForAgent("default");
    const proactivePrompt = buildPromptWithTemplates(templates, "", {
      separator: "---",
    });

    return {
      systemPrompt: `${event.systemPrompt}\n${proactivePrompt}`,
    };
  });

  // セッション終了時にリスナー重複登録防止フラグをリセット
  pi.on("session_shutdown", async () => {
    isInitialized = false;
  });
}
