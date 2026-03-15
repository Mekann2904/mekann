/**
 * @abdd.meta
 * path: .pi/extensions/ul-workflow.ts
 * role: Research-Plan-Annotate-Implement workflow extension for UL mode
 * why: Enables structured workflow with mandatory plan approval before implementation
 * related: .pi/extensions/ul-dual-mode.ts, .pi/extensions/subagents.ts
 * public_api: Extension init function via `registerExtension`
 * invariants: Workflow must be approved before implementation phase
 * side_effects: Creates files in .pi/ul-workflow/tasks/, delegates to subagents
 * failure_modes: Subagent delegation may fail; file operations may fail if permissions denied
 * @abdd.explain
 * overview: Structured workflow extension implementing Research-Plan-Annotate-Implement cycle
 * what_it_does:
 *   - Creates research.md via researcher subagent
 *   - Creates plan.md via architect subagent
 *   - Monitors plan.md for user annotations
 *   - Implements code only after explicit approval
 * why_it_exists: Enforces plan-review-approval discipline before code changes
 * scope:
 *   in: User task description, subagent execution tools
 *   out: Files in .pi/ul-workflow/tasks/, tool invocations
 */

// File: .pi/extensions/ul-workflow.ts
// Description: Research-Plan-Annotate-Implement workflow for UL mode
// Why: Enforces plan-review-approval discipline before implementation
// Related: .pi/extensions/ul-dual-mode.ts, .pi/extensions/subagents.ts

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import * as fs from "fs";
import * as path from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { promises as fsPromises } from "fs";
import { randomBytes } from "node:crypto";
import { withFileLock, atomicWriteTextFile } from "../lib/storage/storage-lock.js";
import { selectArtifactContent } from "../lib/artifact-output.js";
import {
  isCompletionBlocked,
  loadWorkspaceVerificationConfig,
  loadWorkspaceVerificationState,
  resolveWorkspaceVerificationPlan,
} from "../lib/workspace-verification.js";

// ワークフローのフェーズ
type WorkflowPhase = "idle" | "research" | "plan" | "annotate" | "implement" | "review" | "completed" | "aborted";

// =============================================================================
// 統一フロー定義
// =============================================================================

/**
 * 統一フェーズ構成
 * @summary 統一フロー
 * @description すべてのタスクで適用される統一フロー
 * - Research (DAG並列): コードベースの深い理解
 * - Plan: 詳細な実装計画の作成
 * - Annotate: ユーザーによる計画レビュー（必須）
 * - Implement (DAG並列): 計画に基づく実装
 * - Completed: 完了
 */
const UNIFIED_PHASES: WorkflowPhase[] = [
  "research",
  "plan",
  "annotate",
  "implement",
  "review",
  "completed",
];

/**
 * 統一実行設定
 * @summary 実行設定
 */
const UNIFIED_EXECUTION_CONFIG = {
  useDag: true,
  maxConcurrency: 3,
  requireHumanApproval: true,
  subagentTimeoutMs: 5 * 60 * 1000, // 5 minutes default timeout
} as const;

// ワークフロー状態
interface WorkflowState {
  taskId: string;
  taskDescription: string;
  phase: WorkflowPhase;
  phases: WorkflowPhase[];  // 動的に決定されたフェーズ一覧
  phaseIndex: number;       // 現在のフェーズインデックス
  createdAt: string;
  updatedAt: string;
  approvedPhases: string[];
  annotationCount: number;
  ownerInstanceId: string;  // {sessionId}-{pid} format for multi-instance safety
  executionPlanId?: string;
}

// Active workflow registry for cross-instance coordination
export interface ActiveWorkflowRegistryEntry {
  activeTaskId: string | null;
  ownerInstanceId: string | null;
  updatedAt: string;
}

interface ActiveWorkflowRegistry {
  activeTaskId: string | null;
  ownerInstanceId: string | null;
  updatedAt: string;
  activeByInstance?: Record<string, ActiveWorkflowRegistryEntry>;
}

// ディレクトリパス
const WORKFLOW_DIR = ".pi/ul-workflow";
const TASKS_DIR = path.join(WORKFLOW_DIR, "tasks");
const TEMPLATES_DIR = path.join(WORKFLOW_DIR, "templates");
const ACTIVE_FILE = path.join(WORKFLOW_DIR, "active.json");

// 所有権管理ユーティリティをインポート（内部使用）
import {
  getInstanceId,
  extractPidFromInstanceId,
  isProcessAlive,
  isOwnerProcessDead,
  type OwnershipResult,
} from "../lib/core/ownership.js";

// 他モジュール向けに再エクスポート（subagents.ts等で利用）
export {
  getInstanceId,
  extractPidFromInstanceId,
  isProcessAlive,
  isOwnerProcessDead,
  type OwnershipResult,
};

function createEmptyActiveWorkflowRegistry(): ActiveWorkflowRegistry {
  return {
    activeTaskId: null,
    ownerInstanceId: null,
    updatedAt: new Date().toISOString(),
    activeByInstance: {},
  };
}

function readActiveWorkflowRegistry(): ActiveWorkflowRegistry {
  try {
    if (!fs.existsSync(ACTIVE_FILE)) {
      return createEmptyActiveWorkflowRegistry();
    }

    const raw = readFileSync(ACTIVE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<ActiveWorkflowRegistry>;
    return {
      activeTaskId: parsed.activeTaskId ?? null,
      ownerInstanceId: parsed.ownerInstanceId ?? null,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      activeByInstance: parsed.activeByInstance ?? {},
    };
  } catch (error) {
    console.error("[ul-workflow] readActiveWorkflowRegistry failed:", error);
    return createEmptyActiveWorkflowRegistry();
  }
}

function resolveGlobalActiveEntry(
  registry: ActiveWorkflowRegistry,
): ActiveWorkflowRegistryEntry {
  const entries = Object.values(registry.activeByInstance ?? {}).filter(
    (entry) => entry.activeTaskId,
  );

  if (entries.length === 0) {
    return {
      activeTaskId: null,
      ownerInstanceId: null,
      updatedAt: new Date().toISOString(),
    };
  }

  entries.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return entries[0];
}

export function resolveInstanceActiveTaskId(
  registry: ActiveWorkflowRegistry,
  instanceId: string,
): string | null {
  const instanceEntry = registry.activeByInstance?.[instanceId];
  const fallbackToLegacyEntry = registry.ownerInstanceId === instanceId;
  return instanceEntry?.activeTaskId
    ?? (fallbackToLegacyEntry ? registry.activeTaskId : null);
}

export function updateActiveWorkflowRegistryForInstance(
  registry: ActiveWorkflowRegistry,
  instanceId: string,
  state: WorkflowState | null,
): ActiveWorkflowRegistry {
  const nextRegistry: ActiveWorkflowRegistry = {
    activeTaskId: registry.activeTaskId,
    ownerInstanceId: registry.ownerInstanceId,
    updatedAt: registry.updatedAt,
    activeByInstance: { ...(registry.activeByInstance ?? {}) },
  };

  if (state) {
    nextRegistry.activeByInstance![instanceId] = {
      activeTaskId: state.taskId,
      ownerInstanceId: state.ownerInstanceId,
      updatedAt: new Date().toISOString(),
    };
  } else {
    delete nextRegistry.activeByInstance![instanceId];
  }

  const globalEntry = resolveGlobalActiveEntry(nextRegistry);
  nextRegistry.activeTaskId = globalEntry.activeTaskId;
  nextRegistry.ownerInstanceId = globalEntry.ownerInstanceId;
  nextRegistry.updatedAt = globalEntry.updatedAt;

  return nextRegistry;
}

function writeActiveWorkflowRegistry(registry: ActiveWorkflowRegistry): void {
  if (!fs.existsSync(WORKFLOW_DIR)) {
    fs.mkdirSync(WORKFLOW_DIR, { recursive: true });
  }

  const nextRegistry = { ...registry };
  const globalEntry = resolveGlobalActiveEntry(nextRegistry);
  nextRegistry.activeTaskId = globalEntry.activeTaskId;
  nextRegistry.ownerInstanceId = globalEntry.ownerInstanceId;
  nextRegistry.updatedAt = globalEntry.updatedAt;

  atomicWriteTextFile(ACTIVE_FILE, JSON.stringify(nextRegistry, null, 2));
}

// File-based workflow access (replaces memory variable)
export function getCurrentWorkflow(): WorkflowState | null {
  try {
    const registry = readActiveWorkflowRegistry();
    const instanceId = getInstanceId();
    const taskId = resolveInstanceActiveTaskId(registry, instanceId);

    if (!taskId) {
      return null;
    }

    return loadState(taskId);
  } catch {
    return null;
  }
}

export function setCurrentWorkflow(state: WorkflowState | null): void {
  const instanceId = getInstanceId();
  const registry = readActiveWorkflowRegistry();
  const nextRegistry = updateActiveWorkflowRegistryForInstance(
    registry,
    instanceId,
    state,
  );
  writeActiveWorkflowRegistry(nextRegistry);
}

function getToolExecutor(ctx: unknown):
  | ((toolName: string, params: Record<string, unknown>) => Promise<AgentToolResult<unknown>>)
  | undefined {
  const anyCtx = ctx as {
    callTool?: (toolName: string, params: Record<string, unknown>) => Promise<AgentToolResult<unknown>>;
    executeTool?: (options: { toolName: string; params: Record<string, unknown> }) => Promise<AgentToolResult<unknown>>;
  };

  if (typeof anyCtx.callTool === "function") {
    return (toolName, params) => anyCtx.callTool!(toolName, params);
  }

  if (typeof anyCtx.executeTool === "function") {
    return (toolName, params) => anyCtx.executeTool!({ toolName, params });
  }

  return undefined;
}

function resolveWorkflowArtifactPath(taskId: string, phase: WorkflowPhase): string | null {
  if (phase === "research") {
    return path.join(getTaskDir(taskId), "research.md");
  }
  if (phase === "plan" || phase === "annotate") {
    return path.join(getTaskDir(taskId), "plan.md");
  }
  if (phase === "implement") {
    // 実装フェーズではplan.mdが必須（実装はplanに基づいて行われる）
    return path.join(getTaskDir(taskId), "plan.md");
  }
  if (phase === "review") {
    // レビューフェーズではreview.mdが必須
    return path.join(getTaskDir(taskId), "review.md");
  }
  return null;
}

async function assertPhaseArtifactReady(taskId: string, phase: WorkflowPhase): Promise<void> {
  const artifactPath = resolveWorkflowArtifactPath(taskId, phase);
  if (!artifactPath) {
    return;
  }

  // リトライロジック: ファイルシステムのレースコンディションを回避
  // - 空コンテンツ（書き込み中の可能性）
  // - 一時的エラー（EACCES, EMFILE, EBUSY）
  const maxRetries = 3;
  const baseDelayMs = 50;
  const transientErrors = ["EACCES", "EMFILE", "EBUSY", "EAGAIN"];

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    try {
      const content = await fsPromises.readFile(artifactPath, "utf-8");
      if (content.trim()) {
        return; // 成功: 有効なコンテンツが読み取れた
      }
      // 空コンテンツ: 書き込み中の可能性があるためリトライ
      lastError = new Error(`${phase}.md が空です（書き込み中の可能性）: ${artifactPath}`);
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === "ENOENT") {
        // ファイルなし: リトライせず即座にエラー
        throw new Error(`${phase}.md がまだ生成されていません: ${artifactPath}`);
      }
      if (nodeErr.code && transientErrors.includes(nodeErr.code)) {
        // 一時的エラー: リトライ
        lastError = nodeErr;
        continue;
      }
      // その他のエラー: 即座にスロー
      throw err;
    }
  }

  // リトライ上限到達
  throw lastError || new Error(`${phase}.md がまだ生成されていません: ${artifactPath}`);
}

function getVerificationGateReason(cwd: string): string | null {
  const config = loadWorkspaceVerificationConfig(cwd);
  if (!config.enabled) {
    return null;
  }

  const state = loadWorkspaceVerificationState(cwd);
  const resolvedPlan = resolveWorkspaceVerificationPlan(config, cwd);
  if (!isCompletionBlocked(config, state, resolvedPlan)) {
    return null;
  }

  if (config.requireReplanOnRepeatedFailure && state.replanRequired) {
    return "workspace_verify_replan で修復方針を記録してください。";
  }

  if (config.requireProofReview && state.pendingProofReview) {
    return "workspace_verify_ack で proof artifact を承認してください。";
  }

  if (state.pendingReviewArtifact) {
    return "workspace_verify_review と workspace_verify_review_ack を完了してください。";
  }

  return "workspace_verify を成功させてください。";
}

type UlDagTask = {
  id: string;
  description: string;
  assignedAgent: string;
  dependencies: string[];
  inputContext?: string[];
  priority?: "critical" | "high" | "normal" | "low";
};

function buildDagToolParams(options: {
  task: string;
  ulTaskId?: string;
  artifactPath?: string;
  artifactTaskId?: string;
  dynamicResearch?: {
    task: string;
    gapTaskId: string;
    synthesisTaskId: string;
  };
  dynamicPlan?: {
    task: string;
    gapTaskId: string;
    synthesisTaskId: string;
  };
  dynamicImplement?: {
    task: string;
    gapTaskId: string;
    synthesisTaskId: string;
  };
  dynamicReview?: {
    task: string;
    gapTaskId: string;
    synthesisTaskId: string;
  };
  planId: string;
  planDescription: string;
  tasks: UlDagTask[];
}): Record<string, unknown> {
  return {
    task: options.task,
    ulTaskId: options.ulTaskId,
    artifactPath: options.artifactPath,
    artifactTaskId: options.artifactTaskId,
    dynamicResearch: options.dynamicResearch,
    dynamicPlan: options.dynamicPlan,
    dynamicImplement: options.dynamicImplement,
    dynamicReview: options.dynamicReview,
    autoGenerate: false,
    plan: {
      id: options.planId,
      description: options.planDescription,
      tasks: options.tasks,
    },
  };
}

function buildSingleAgentDagParams(options: {
  subagentId: string;
  task: string;
  extraContext?: string;
  ulTaskId?: string;
}): Record<string, unknown> {
  const contextualizedTask = options.extraContext?.trim()
    ? `${options.task}\n\n追加コンテキスト:\n${options.extraContext.trim()}`
    : options.task;

  return buildDagToolParams({
    task: contextualizedTask,
    ulTaskId: options.ulTaskId,
    planId: `${options.subagentId}-single-step`,
    planDescription: `${options.subagentId} single step execution`,
    tasks: [
      {
        id: options.subagentId,
        description: contextualizedTask,
        assignedAgent: options.subagentId,
        dependencies: [],
      },
    ],
  });
}

function buildResearchNodeOutputContract(): string {
  return [
    "出力フォーマット:",
    "- findings: 事実",
    "- evidence: 根拠",
    "- open_questions: 未解決論点",
    "- plan_impact: plan にどう効くか",
    "- confidence: 0.0-1.0",
  ].join("\n");
}

export type ResearchFollowupDecision = {
  needsExternalDeepDive: boolean;
  needsCodebaseDeepDive: boolean;
  rationale: string;
};

export type PlanFollowupDecision = {
  needsChangesDeepDive: boolean;
  needsValidationDeepDive: boolean;
  rationale: string;
};

export type ImplementFollowupDecision = {
  needsFixupDeepDive: boolean;
  needsVerificationDeepDive: boolean;
  rationale: string;
};

export type ReviewFollowupDecision = {
  needsRiskDeepDive: boolean;
  needsVerificationDeepDive: boolean;
  rationale: string;
};

export function extractDagTaskSection(output: string, taskId: string): string {
  const normalized = String(output || "");
  const pattern = new RegExp(`## ${taskId}\\nStatus: [^\\n]*\\n([\\s\\S]*?)(?=\\n## [^\\n]+\\nStatus:|$)`);
  const match = normalized.match(pattern);
  return match?.[1]?.trim() ?? "";
}

export function normalizeGapDecision(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (["yes", "true", "required", "needed"].includes(normalized)) return true;
  if (["no", "false", "none", "not_needed", "not-needed"].includes(normalized)) return false;
  return null;
}

export function decideResearchFollowups(baseOutput: string): ResearchFollowupDecision {
  const gapSection = extractDagTaskSection(baseOutput, "research-gap-check");
  const externalMatch = gapSection.match(/DEEP_DIVE_EXTERNAL:\s*([^\n]+)/i);
  const codebaseMatch = gapSection.match(/DEEP_DIVE_CODEBASE:\s*([^\n]+)/i);
  const rationaleMatch = gapSection.match(/RATIONALE:\s*([\s\S]*?)$/i);

  const explicitExternal = externalMatch ? normalizeGapDecision(externalMatch[1]) : null;
  const explicitCodebase = codebaseMatch ? normalizeGapDecision(codebaseMatch[1]) : null;
  const rationale = rationaleMatch?.[1]?.trim() || "gap-check output did not provide an explicit rationale";

  if (explicitExternal !== null || explicitCodebase !== null) {
    return {
      needsExternalDeepDive: explicitExternal ?? false,
      needsCodebaseDeepDive: explicitCodebase ?? false,
      rationale,
    };
  }

  const noDive = /no additional deep dive needed|no deep dive needed|plan ready/i.test(gapSection);
  return {
    needsExternalDeepDive: !noDive && /(external|official docs|reference|api surface|library|spec)/i.test(gapSection),
    needsCodebaseDeepDive: !noDive && /(codebase|risk|file|implementation|constraint|reuse)/i.test(gapSection),
    rationale,
  };
}

export function decidePlanFollowups(baseOutput: string): PlanFollowupDecision {
  const gapSection = extractDagTaskSection(baseOutput, "plan-gap-check");
  const changesMatch = gapSection.match(/DEEP_DIVE_CHANGES:\s*([^\n]+)/i);
  const validationMatch = gapSection.match(/DEEP_DIVE_VALIDATION:\s*([^\n]+)/i);
  const rationaleMatch = gapSection.match(/RATIONALE:\s*([\s\S]*?)$/i);

  const explicitChanges = changesMatch ? normalizeGapDecision(changesMatch[1]) : null;
  const explicitValidation = validationMatch ? normalizeGapDecision(validationMatch[1]) : null;
  const rationale = rationaleMatch?.[1]?.trim() || "plan gap-check output did not provide an explicit rationale";

  if (explicitChanges !== null || explicitValidation !== null) {
    return {
      needsChangesDeepDive: explicitChanges ?? false,
      needsValidationDeepDive: explicitValidation ?? false,
      rationale,
    };
  }

  const noDive = /no additional deep dive needed|no deep dive needed|plan ready/i.test(gapSection);
  return {
    needsChangesDeepDive: !noDive && /(change|file|implementation|snippet|scope|dependency)/i.test(gapSection),
    needsValidationDeepDive: !noDive && /(validation|verify|test|risk|rollback|acceptance)/i.test(gapSection),
    rationale,
  };
}

export function decideImplementFollowups(baseOutput: string): ImplementFollowupDecision {
  const gapSection = extractDagTaskSection(baseOutput, "implement-gap-check");
  const fixupMatch = gapSection.match(/DEEP_DIVE_FIXUP:\s*([^\n]+)/i);
  const verificationMatch = gapSection.match(/DEEP_DIVE_VERIFICATION:\s*([^\n]+)/i);
  const rationaleMatch = gapSection.match(/RATIONALE:\s*([\s\S]*?)$/i);

  const explicitFixup = fixupMatch ? normalizeGapDecision(fixupMatch[1]) : null;
  const explicitVerification = verificationMatch ? normalizeGapDecision(verificationMatch[1]) : null;
  const rationale = rationaleMatch?.[1]?.trim() || "implement gap-check output did not provide an explicit rationale";

  if (explicitFixup !== null || explicitVerification !== null) {
    return {
      needsFixupDeepDive: explicitFixup ?? false,
      needsVerificationDeepDive: explicitVerification ?? false,
      rationale,
    };
  }

  const noDive = /no additional deep dive needed|no deep dive needed|ready for review/i.test(gapSection);
  return {
    needsFixupDeepDive: !noDive && /(fix|implementation|bug|regression|follow-up|adjust)/i.test(gapSection),
    needsVerificationDeepDive: !noDive && /(verification|verify|test|proof|artifact|review)/i.test(gapSection),
    rationale,
  };
}

export function decideReviewFollowups(baseOutput: string): ReviewFollowupDecision {
  const gapSection = extractDagTaskSection(baseOutput, "review-gap-check");
  const riskMatch = gapSection.match(/DEEP_DIVE_RISK:\s*([^\n]+)/i);
  const verificationMatch = gapSection.match(/DEEP_DIVE_VERIFICATION:\s*([^\n]+)/i);
  const rationaleMatch = gapSection.match(/RATIONALE:\s*([\s\S]*?)$/i);

  const explicitRisk = riskMatch ? normalizeGapDecision(riskMatch[1]) : null;
  const explicitVerification = verificationMatch ? normalizeGapDecision(verificationMatch[1]) : null;
  const rationale = rationaleMatch?.[1]?.trim() || "review gap-check output did not provide an explicit rationale";

  if (explicitRisk !== null || explicitVerification !== null) {
    return {
      needsRiskDeepDive: explicitRisk ?? false,
      needsVerificationDeepDive: explicitVerification ?? false,
      rationale,
    };
  }

  const noDive = /no additional deep dive needed|no deep dive needed|ready for workspace verify/i.test(gapSection);
  return {
    needsRiskDeepDive: !noDive && /(risk|security|regression|rollback|impact)/i.test(gapSection),
    needsVerificationDeepDive: !noDive && /(verification|verify|test|artifact|proof|review)/i.test(gapSection),
    rationale,
  };
}

function buildResearchBaseDagParams(
  task: string,
  taskId: string,
): Record<string, unknown> {
  const artifactTaskId = "research-gap-check";
  const sharedOutputContract = buildResearchNodeOutputContract();

  return buildDagToolParams({
    task: `UL research phase for: ${task}`,
    ulTaskId: taskId,
    artifactTaskId,
    planId: "ul-research-base-dag",
    planDescription: "UL research base phase with staged fan-out and gap check",
    tasks: [
      {
        id: "research-intent",
        description: `調査対象: ${task}

Stage 0: Intent clarification
- ユーザ入力を顧客要求として解釈する
- ユーザが本当に欲しい成果、成功条件、制約、不明点を整理する
- 何を外部調査すべきか、何を codebase で確認すべきかを切り分ける
- この後の並列調査ノードに渡す論点を明示する

停止条件:
- Requested Outcome / Constraints / Unknowns が埋まる
- 並列調査ノードの観点を定義できる

${sharedOutputContract}`,
        assignedAgent: "researcher",
        dependencies: [],
        priority: "critical",
      },
      {
        id: "research-external",
        description: `調査対象: ${task}

Stage 1 parallel: External research
- 採用している技術スタック、関連ライブラリ、API surface を特定する
- 公式ドキュメント、一次情報、信頼できる技術資料を web で調べる
- ライブラリの使い方、制約、既知の落とし穴、推奨構成を確認する
- 使った参考文献を source / title / URL 単位で残す
- 外部調査ツールが使えない場合は、その制約自体を明記する
- 調査結果を plan にどう反映するかまで整理する

停止条件:
- 主要な技術選択肢、または推奨方向を説明できる
- 公式 docs / references を最低限そろえた、または未取得理由を説明できる

${sharedOutputContract}`,
        assignedAgent: "researcher",
        dependencies: ["research-intent"],
        inputContext: ["research-intent"],
        priority: "high",
      },
      {
        id: "research-codebase",
        description: `調査対象: ${task}

Stage 1 parallel: Codebase reality check
- 既存コードがある場合だけ、関連ファイルと流用可能な実装を確認する
- 現在の制約、既存パターン、壊しやすい点を洗い出す
- 新規プロジェクトで既存実装が薄い場合は、その reality を明示する

停止条件:
- 再利用候補、主要制約、変更候補ファイルを説明できる
- 既存資産が薄いなら薄いと根拠付きで言える

${sharedOutputContract}`,
        assignedAgent: "researcher",
        dependencies: ["research-intent"],
        inputContext: ["research-intent"],
        priority: "high",
      },
      {
        id: "research-risk",
        description: `調査対象: ${task}

Stage 1 parallel: Risk research
- セキュリティ、運用、性能、データ破壊性、依存更新リスクを調べる
- このタスク特有の落とし穴と、調査不足だと危ない論点を挙げる
- 高リスク判定に必要な根拠を先に集める

停止条件:
- high-risk / normal を判断する材料がある
- 深掘りが必要なリスク領域を列挙できる

${sharedOutputContract}`,
        assignedAgent: "researcher",
        dependencies: ["research-intent"],
        inputContext: ["research-intent"],
        priority: "high",
      },
      {
        id: "research-gap-check",
        description: `調査対象: ${task}

Stage 2: Gap check
- intent / external / codebase / risk の結果を読み、plan に進むための不足を判定する
- 追加深掘りが必要なら、その対象を external か codebase/risk に絞る
- 明示的に次の行を出力する
  DEEP_DIVE_EXTERNAL: yes|no
  DEEP_DIVE_CODEBASE: yes|no
  RATIONALE: <reason>
- 不足がなければ "no additional deep dive needed" と明記する

停止条件:
- 追加深掘りの要否を判断できる
- plan に進める条件、または不足理由を説明できる

${sharedOutputContract}`,
        assignedAgent: "researcher",
        dependencies: ["research-external", "research-codebase", "research-risk"],
        inputContext: ["research-intent", "research-external", "research-codebase", "research-risk"],
        priority: "critical",
      },
    ],
  });
}

function buildResearchFollowupDagParams(
  task: string,
  researchPath: string,
  taskId: string,
  baseOutput: string,
  decision: ResearchFollowupDecision,
): Record<string, unknown> {
  const artifactTaskId = "research-synthesis";
  const tasks: UlDagTask[] = [];
  const baseContext = `Base research findings:\n${baseOutput.trim() || "No base output captured."}\n\nGap-check rationale:\n${decision.rationale}`;

  if (decision.needsExternalDeepDive) {
    tasks.push({
      id: "research-deep-dive-external",
      description: `調査対象: ${task}

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
      dependencies: [],
      priority: "high",
    });
  }

  if (decision.needsCodebaseDeepDive) {
    tasks.push({
      id: "research-deep-dive-codebase",
      description: `調査対象: ${task}

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
      dependencies: [],
      priority: "high",
    });
  }

  tasks.push({
    id: artifactTaskId,
    description: `以下の base research と follow-up research を統合し、最終的な research.md を Markdown で完成させてください。

タスク: ${task}
保存先: ${researchPath}

Base research:
${baseOutput.trim() || "No base output captured."}

Gap-check decision:
- external deep dive: ${decision.needsExternalDeepDive ? "required" : "not needed"}
- codebase deep dive: ${decision.needsCodebaseDeepDive ? "required" : "not needed"}
- rationale: ${decision.rationale}

必須要件:
- 調査結果を後で参照できる文書として整理する
- User Intent, Requested Outcome, Constraints, Unknowns を整理する
- 調査対象の技術スタック、関連ライブラリ、API surface を整理する
- 外部調査で何を見て、何を plan に反映するかを書く
- References セクションを作り、使った公式ドキュメントや資料を列挙する
- 外部調査をしなかった場合は、なぜ不要だったか、またはなぜ実行できなかったかを書く
- ローカルコードの確認結果は、外部調査と要求解釈の後に整理する
- Gap Check の結論と deep dive の要否を反映する
- 最後に Plan Inputs を整理し、plan に渡す判断材料を明示する
- 関連ファイルパスを明記する
- inventory で終わらず、plan に渡す設計材料までまとめる
- 最後に必ず次のセクションを含める

## 高リスク判定

### 判定結果
- [ ] high-risk（高リスク）
- [ ] normal（通常）

### 判定根拠
- なぜその判定なのかを簡潔に書く

出力ルール:
- 出力はそのまま research.md として保存できる完成形の Markdown のみ
- deep dive が不要だった場合は、その判断も本文に明記する`,
    assignedAgent: "researcher",
    dependencies: tasks.map((taskNode) => taskNode.id),
    inputContext: tasks.map((taskNode) => taskNode.id),
    priority: "critical",
  });

  return buildDagToolParams({
    task: `UL research follow-up phase for: ${task}`,
    ulTaskId: taskId,
    artifactPath: researchPath,
    artifactTaskId,
    planId: "ul-research-followup-dag",
    planDescription: "UL research follow-up phase with optional deep dives and synthesis",
    tasks,
  });
}

function buildDynamicResearchDagParams(
  task: string,
  researchPath: string,
  taskId: string,
): Record<string, unknown> {
  const sharedOutputContract = buildResearchNodeOutputContract();

  return buildDagToolParams({
    task: `UL research dynamic phase for: ${task}`,
    ulTaskId: taskId,
    artifactPath: researchPath,
    artifactTaskId: "research-synthesis",
    planId: "ul-research-dynamic-dag",
    planDescription: "UL research phase with dynamic deep-dive insertion",
    tasks: [
      {
        id: "research-intent",
        description: `調査対象: ${task}

Stage 0: Intent clarification
- ユーザ入力を顧客要求として解釈する
- ユーザが本当に欲しい成果、成功条件、制約、不明点を整理する
- 何を外部調査すべきか、何を codebase で確認すべきかを切り分ける
- この後の並列調査ノードに渡す論点を明示する

停止条件:
- Requested Outcome / Constraints / Unknowns が埋まる
- 並列調査ノードの観点を定義できる

${sharedOutputContract}`,
        assignedAgent: "researcher",
        dependencies: [],
        priority: "critical",
      },
      {
        id: "research-external",
        description: `調査対象: ${task}

Stage 1 parallel: External research
- 採用している技術スタック、関連ライブラリ、API surface を特定する
- 公式ドキュメント、一次情報、信頼できる技術資料を web で調べる
- ライブラリの使い方、制約、既知の落とし穴、推奨構成を確認する
- 外部調査ツールが使えない場合は、その制約自体を明記する
- 調査結果を plan にどう反映するかまで整理する

停止条件:
- 主要な技術選択肢、または推奨方向を説明できる
- 公式 docs / references を最低限そろえた、または未取得理由を説明できる

${sharedOutputContract}`,
        assignedAgent: "researcher",
        dependencies: ["research-intent"],
        inputContext: ["research-intent"],
        priority: "high",
      },
      {
        id: "research-codebase",
        description: `調査対象: ${task}

Stage 1 parallel: Codebase reality check
- 既存コードがある場合だけ、関連ファイルと流用可能な実装を確認する
- 現在の制約、既存パターン、壊しやすい点を洗い出す
- 新規プロジェクトで既存実装が薄い場合は、その reality を明示する

停止条件:
- 再利用候補、主要制約、変更候補ファイルを説明できる
- 既存資産が薄いなら薄いと根拠付きで言える

${sharedOutputContract}`,
        assignedAgent: "researcher",
        dependencies: ["research-intent"],
        inputContext: ["research-intent"],
        priority: "high",
      },
      {
        id: "research-risk",
        description: `調査対象: ${task}

Stage 1 parallel: Risk research
- セキュリティ、運用、性能、データ破壊性、依存更新リスクを調べる
- このタスク特有の落とし穴と、調査不足だと危ない論点を挙げる
- 高リスク判定に必要な根拠を先に集める

停止条件:
- high-risk / normal を判断する材料がある
- 深掘りが必要なリスク領域を列挙できる

${sharedOutputContract}`,
        assignedAgent: "researcher",
        dependencies: ["research-intent"],
        inputContext: ["research-intent"],
        priority: "high",
      },
      {
        id: "research-gap-check",
        description: `調査対象: ${task}

Stage 2: Gap check
- intent / external / codebase / risk の結果を読み、plan に進むための不足を判定する
- 追加深掘りが必要なら、その対象を external か codebase/risk に絞る
- 明示的に次の行を出力する
  DEEP_DIVE_EXTERNAL: yes|no
  DEEP_DIVE_CODEBASE: yes|no
  RATIONALE: <reason>
- 不足がなければ "no additional deep dive needed" と明記する

停止条件:
- 追加深掘りの要否を判断できる
- plan に進める条件、または不足理由を説明できる

${sharedOutputContract}`,
        assignedAgent: "researcher",
        dependencies: ["research-external", "research-codebase", "research-risk"],
        inputContext: ["research-intent", "research-external", "research-codebase", "research-risk"],
        priority: "critical",
      },
      {
        id: "research-synthesis",
        description: `以下の research 結果を統合し、最終的な research.md を Markdown で完成させてください。

タスク: ${task}
保存先: ${researchPath}

必須要件:
- 調査結果を後で参照できる文書として整理する
- User Intent, Requested Outcome, Constraints, Unknowns を整理する
- 調査対象の技術スタック、関連ライブラリ、API surface を整理する
- 外部調査で何を見て、何を plan に反映するかを書く
- References セクションを作り、使った公式ドキュメントや資料を列挙する
- 外部調査をしなかった場合は、なぜ不要だったか、またはなぜ実行できなかったかを書く
- ローカルコードの確認結果は、外部調査と要求解釈の後に整理する
- Gap Check の結論と deep dive の要否を反映する
- 最後に Plan Inputs を整理し、plan に渡す判断材料を明示する
- 関連ファイルパスを明記する
- inventory で終わらず、plan に渡す設計材料までまとめる

出力ルール:
- 出力はそのまま research.md として保存できる完成形の Markdown のみ
- deep dive が不要だった場合は、その判断も本文に明記する`,
        assignedAgent: "researcher",
        dependencies: ["research-gap-check"],
        inputContext: ["research-intent", "research-external", "research-codebase", "research-risk", "research-gap-check"],
        priority: "critical",
      },
    ],
    dynamicResearch: {
      task,
      gapTaskId: "research-gap-check",
      synthesisTaskId: "research-synthesis",
    },
  });
}

function buildPlanDagParams(
  task: string,
  researchPath: string,
  planPath: string,
  taskId: string,
): Record<string, unknown> {
  const artifactTaskId = "plan-synthesis";

  return buildDagToolParams({
    task: `UL plan phase for: ${task}`,
    ulTaskId: taskId,
    artifactPath: planPath,
    artifactTaskId,
    planId: "ul-plan-phase",
    planDescription: "UL plan phase with parallel drafting and synthesis",
    tasks: [
      {
        id: "plan-findings",
        description: `タスク: ${task}

前提資料: ${researchPath}

観点:
- research.md から顧客要求の解釈を抽出する
- 何を作れば成功かを受け入れ条件へ変換する
- 優先度、依存関係、危険箇所を明確にする
- 実装前に確認すべき前提を列挙する

出力:
- 計画の根拠になる分析メモ`,
        assignedAgent: "architect",
        dependencies: [],
        priority: "high",
      },
      {
        id: "plan-changes",
        description: `タスク: ${task}

前提資料: ${researchPath}

観点:
- 変更対象ファイル候補を洗い出す
- 具体的な実装方針とコードスニペット案を作る
- 並列実装しやすい単位へ分解する
- 要求解釈と設計判断がどうつながるかを明示する

出力:
- ファイルパスと変更内容中心の計画メモ`,
        assignedAgent: "architect",
        dependencies: [],
        priority: "high",
      },
      {
        id: "plan-validation",
        description: `タスク: ${task}

前提資料: ${researchPath}

観点:
- 検証方法、回帰テスト、確認手順を整理する
- トレードオフ、ロールバック観点、未解決リスクをまとめる
- 実装後に何をもって完了とみなすかを明確にする

出力:
- 検証とリスク中心の計画メモ`,
        assignedAgent: "architect",
        dependencies: [],
        priority: "high",
      },
      {
        id: artifactTaskId,
        description: `依存タスクの内容を統合し、最終的な plan.md を Markdown で完成させてください。

タスク: ${task}
事前調査: ${researchPath}
保存先: ${planPath}

必須要件:
- User Intent と Analyst Interpretation が分かること
- 詳細なアプローチの説明
- 実際の変更内容を示すコードスニペット
- 変更対象となるファイルパス
- 考慮事項やトレードオフ
- タスクリスト（チェックボックス形式）
- ユーザーがレビューしやすい構造

出力ルール:
- 出力はそのまま plan.md として保存できる完成形の Markdown のみ
- 実装前レビュー用の文書として、簡潔かつ具体的にまとめる`,
        assignedAgent: "architect",
        dependencies: ["plan-findings", "plan-changes", "plan-validation"],
        inputContext: ["plan-findings", "plan-changes", "plan-validation"],
        priority: "critical",
      },
    ],
  });
}

function buildDynamicPlanDagParams(
  task: string,
  researchPath: string,
  planPath: string,
  taskId: string,
): Record<string, unknown> {
  return buildDagToolParams({
    task: `UL dynamic plan phase for: ${task}`,
    ulTaskId: taskId,
    artifactPath: planPath,
    artifactTaskId: "plan-synthesis",
    dynamicPlan: {
      task,
      gapTaskId: "plan-gap-check",
      synthesisTaskId: "plan-synthesis",
    },
    planId: "ul-plan-dynamic-dag",
    planDescription: "UL plan phase with dynamic deep-dive insertion",
    tasks: [
      {
        id: "plan-findings",
        description: `タスク: ${task}

前提資料: ${researchPath}

Stage 0:
- research.md から顧客要求の解釈を抽出する
- 何を作れば成功かを受け入れ条件へ変換する
- 優先度、依存関係、危険箇所を明確にする
- 実装前に確認すべき前提を列挙する`,
        assignedAgent: "architect",
        dependencies: [],
        priority: "high",
      },
      {
        id: "plan-changes",
        description: `タスク: ${task}

前提資料: ${researchPath}

Stage 1 parallel:
- 変更対象ファイル候補を洗い出す
- 具体的な実装方針とコードスニペット案を作る
- 並列実装しやすい単位へ分解する
- 要求解釈と設計判断がどうつながるかを明示する`,
        assignedAgent: "architect",
        dependencies: [],
        priority: "high",
      },
      {
        id: "plan-validation",
        description: `タスク: ${task}

前提資料: ${researchPath}

Stage 1 parallel:
- 検証方法、回帰テスト、確認手順を整理する
- トレードオフ、ロールバック観点、未解決リスクをまとめる
- 実装後に何をもって完了とみなすかを明確にする`,
        assignedAgent: "architect",
        dependencies: [],
        priority: "high",
      },
      {
        id: "plan-gap-check",
        description: `タスク: ${task}

Stage 2:
- findings / changes / validation の結果を読み、plan.md を完成させるのに不足があるか判定する
- 追加深掘りが必要なら、changes か validation に絞る
- 明示的に次の行を出力する
  DEEP_DIVE_CHANGES: yes|no
  DEEP_DIVE_VALIDATION: yes|no
  RATIONALE: <reason>
- 不足がなければ "no additional deep dive needed" と明記する`,
        assignedAgent: "architect",
        dependencies: ["plan-findings", "plan-changes", "plan-validation"],
        inputContext: ["plan-findings", "plan-changes", "plan-validation"],
        priority: "critical",
      },
      {
        id: "plan-synthesis",
        description: `依存タスクの内容を統合し、最終的な plan.md を Markdown で完成させてください。

タスク: ${task}
事前調査: ${researchPath}
保存先: ${planPath}

必須要件:
- User Intent と Analyst Interpretation が分かること
- 詳細なアプローチの説明
- 実際の変更内容を示すコードスニペット
- 変更対象となるファイルパス
- 考慮事項やトレードオフ
- タスクリスト（チェックボックス形式）
- ユーザーがレビューしやすい構造
- Gap Check の結論と deep dive の要否を反映する

出力ルール:
- 出力はそのまま plan.md として保存できる完成形の Markdown のみ
- 実装前レビュー用の文書として、簡潔かつ具体的にまとめる`,
        assignedAgent: "architect",
        dependencies: ["plan-gap-check"],
        inputContext: ["plan-findings", "plan-changes", "plan-validation", "plan-gap-check"],
        priority: "critical",
      },
    ],
  });
}

function buildDynamicImplementDagParams(
  task: string,
  planPath: string,
  taskId: string,
): Record<string, unknown> {
  return buildDagToolParams({
    task: `UL dynamic implement phase for: ${task}`,
    ulTaskId: taskId,
    artifactTaskId: "implement-synthesis",
    dynamicImplement: {
      task,
      gapTaskId: "implement-gap-check",
      synthesisTaskId: "implement-synthesis",
    },
    planId: "ul-implement-dynamic-dag",
    planDescription: "UL implement phase with dynamic fixup insertion",
    tasks: [
      {
        id: "implement-core",
        description: `タスク: ${task}

前提資料: ${planPath}

Stage 0:
- plan.md に従って最小の実装を入れる
- 既存パターンを壊さず、まず quick and dirty な最小スライスを通す
- 実装内容と触ったファイルを明示する`,
        assignedAgent: "implementer",
        dependencies: [],
        priority: "critical",
      },
      {
        id: "implement-verify-prep",
        description: `タスク: ${task}

前提資料: ${planPath}

Stage 1 parallel:
- 実装後に必要な verify 手順、重点確認項目、proof artifact を整理する
- どのテストや確認が必要かを review フェーズへ渡せる形にする`,
        assignedAgent: "implementer",
        dependencies: [],
        priority: "high",
      },
      {
        id: "implement-gap-check",
        description: `タスク: ${task}

Stage 2:
- implement-core と implement-verify-prep の結果を読み、review に進む前の不足を判定する
- 明示的に次の行を出力する
  DEEP_DIVE_FIXUP: yes|no
  DEEP_DIVE_VERIFICATION: yes|no
  RATIONALE: <reason>
- 不足がなければ "ready for review" または "no additional deep dive needed" と明記する`,
        assignedAgent: "implementer",
        dependencies: ["implement-core", "implement-verify-prep"],
        inputContext: ["implement-core", "implement-verify-prep"],
        priority: "critical",
      },
      {
        id: "implement-synthesis",
        description: `依存タスクの内容を統合し、実装サマリを作成してください。

タスク: ${task}
前提資料: ${planPath}

必須要件:
- 実装した内容
- 変更したファイル
- 未解決のリスク
- 推奨する verify 手順
- Gap Check の結論と deep dive の要否`,
        assignedAgent: "implementer",
        dependencies: ["implement-gap-check"],
        inputContext: ["implement-core", "implement-verify-prep", "implement-gap-check"],
        priority: "critical",
      },
    ],
  });
}

function buildDynamicReviewDagParams(
  task: string,
  planPath: string,
  reviewPath: string,
  taskId: string,
): Record<string, unknown> {
  return buildDagToolParams({
    task: `UL dynamic review phase for: ${task}`,
    ulTaskId: taskId,
    artifactPath: reviewPath,
    artifactTaskId: "review-synthesis",
    dynamicReview: {
      task,
      gapTaskId: "review-gap-check",
      synthesisTaskId: "review-synthesis",
    },
    planId: "ul-review-dynamic-dag",
    planDescription: "UL review preparation phase with dynamic deep-dive insertion",
    tasks: [
      {
        id: "review-readout",
        description: `タスク: ${task}

前提資料: ${planPath}

Stage 0:
- plan.md と実装結果から、何が変わったかを reviewer 視点で整理する
- 影響範囲、回帰しやすい箇所、重点レビュー観点を列挙する`,
        assignedAgent: "reviewer",
        dependencies: [],
        priority: "high",
      },
      {
        id: "review-verify-prep",
        description: `タスク: ${task}

前提資料: ${planPath}

Stage 1 parallel:
- workspace_verify に渡すべき verify 手順、proof artifact、確認順序を整理する
- review artifact が必要になりそうな論点を先に挙げる`,
        assignedAgent: "reviewer",
        dependencies: [],
        priority: "high",
      },
      {
        id: "review-gap-check",
        description: `タスク: ${task}

Stage 2:
- readout / verify-prep の結果を読み、workspace_verify に進む前の不足を判定する
- 明示的に次の行を出力する
  DEEP_DIVE_RISK: yes|no
  DEEP_DIVE_VERIFICATION: yes|no
  RATIONALE: <reason>
- 不足がなければ "ready for workspace verify" または "no additional deep dive needed" と明記する`,
        assignedAgent: "reviewer",
        dependencies: ["review-readout", "review-verify-prep"],
        inputContext: ["review-readout", "review-verify-prep"],
        priority: "critical",
      },
      {
        id: "review-synthesis",
        description: `依存タスクの内容を統合し、review.md を Markdown で完成させてください。

タスク: ${task}
前提資料: ${planPath}
保存先: ${reviewPath}

必須要件:
- 変更サマリ
- 高リスク箇所
- 重点確認ポイント
- 推奨する workspace_verify 手順
- 必要になりそうな proof / review artifact
- Gap Check の結論と deep dive の要否`,
        assignedAgent: "reviewer",
        dependencies: ["review-gap-check"],
        inputContext: ["review-readout", "review-verify-prep", "review-gap-check"],
        priority: "critical",
      },
    ],
  });
}

/**
 * サブエージェント実行にタイムアウト保護を追加する
 * @summary タイムアウト付きサブエージェント実行
 * @param ctx - 拡張コンテキスト
 * @param options - サブエージェント実行オプション
 * @param timeoutMs - タイムアウト時間（ミリ秒）、デフォルトは5分
 * @returns サブエージェント実行結果
 * @throws タイムアウト時はエラーをスロー
 */
async function runSubagentWithTimeout(
  ctx: unknown,
  options: {
    subagentId: string;
    task: string;
    extraContext?: string;
  },
  timeoutMs: number = UNIFIED_EXECUTION_CONFIG.subagentTimeoutMs
): Promise<AgentToolResult<unknown>> {
  const executeTool = getToolExecutor(ctx);
  if (!executeTool) {
    throw new Error("subagent_run_dag APIが利用できません");
  }

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(
        `サブエージェント実行がタイムアウトしました（${timeoutMs}ms）\n` +
        `サブエージェントID: ${options.subagentId}\n` +
        `タスク: ${options.task.slice(0, 100)}...`
      ));
    }, timeoutMs);
  });

  return Promise.race([
    executeTool("subagent_run_dag", buildSingleAgentDagParams(options)),
    timeoutPromise
  ]);
}

async function runSubagentViaDagTool(
  ctx: unknown,
  options: {
    subagentId: string;
    task: string;
    extraContext?: string;
    ulTaskId?: string;
    dagParams?: Record<string, unknown>;
  },
): Promise<AgentToolResult<unknown>> {
  const executeTool = getToolExecutor(ctx);
  if (!executeTool) {
    throw new Error("subagent_run_dag APIが利用できません");
  }

  return executeTool(
    "subagent_run_dag",
    options.dagParams ?? buildSingleAgentDagParams(options),
  );
}

async function runDagLocally(
  ctx: unknown,
  dagParams: Record<string, unknown>,
): Promise<AgentToolResult<unknown>> {
  const injectedExecutor = (ctx as {
    localDagExecutor?: (params: Record<string, unknown>) => Promise<AgentToolResult<unknown>>;
  })?.localDagExecutor;
  if (typeof injectedExecutor === "function") {
    return injectedExecutor(dagParams);
  }

  const { executeDag } = await import("../lib/dag-executor.js");
  const { createDefaultAgents, loadStorage } = await import("./subagents/storage.js");
  const { createSubagentLiveMonitor } = await import("./subagents/live-monitor.js");
  const { runSubagentTask } = await import("./subagents/task-execution.js");
  const { generateSessionId, addSession, updateSession } = await import("../lib/runtime-sessions.js");
  const {
    acquireRuntimeDispatchPermit,
    getRuntimeSnapshot,
    getSharedRuntimeState,
    notifyRuntimeCapacityChanged,
  } = await import("./agent-runtime.js");
  const {
    buildRuntimeLimitError,
    refreshRuntimeStatus,
    startReservationHeartbeat,
  } = await import("./shared/runtime-helpers.js");

  const planInput = dagParams.plan as {
    id: string;
    description: string;
    tasks: Array<{
      id: string;
      description: string;
      assignedAgent?: string;
      dependencies: string[];
      priority?: "critical" | "high" | "normal" | "low";
      inputContext?: string[];
    }>;
  };
  const dynamicResearchConfig = (
    dagParams.dynamicResearch && typeof dagParams.dynamicResearch === "object"
      ? dagParams.dynamicResearch as {
        task?: string;
        gapTaskId?: string;
        synthesisTaskId?: string;
      }
      : null
  );
  const dynamicPlanConfig = (
    dagParams.dynamicPlan && typeof dagParams.dynamicPlan === "object"
      ? dagParams.dynamicPlan as {
        task?: string;
        gapTaskId?: string;
        synthesisTaskId?: string;
      }
      : null
  );
  const dynamicImplementConfig = (
    dagParams.dynamicImplement && typeof dagParams.dynamicImplement === "object"
      ? dagParams.dynamicImplement as {
        task?: string;
        gapTaskId?: string;
        synthesisTaskId?: string;
      }
      : null
  );
  const dynamicReviewConfig = (
    dagParams.dynamicReview && typeof dagParams.dynamicReview === "object"
      ? dagParams.dynamicReview as {
        task?: string;
        gapTaskId?: string;
        synthesisTaskId?: string;
      }
      : null
  );

  if (!planInput?.tasks?.length) {
    throw new Error("DAG plan が空です");
  }

  const cwd = typeof (ctx as { cwd?: unknown })?.cwd === "string"
    ? (ctx as { cwd: string }).cwd
    : process.cwd();
  const modelProvider = (ctx as { model?: { provider?: string } })?.model?.provider;
  const modelId = (ctx as { model?: { id?: string } })?.model?.id;
  const storage = loadStorage(cwd);
  if (!storage.agents.length) {
    storage.agents = createDefaultAgents(new Date().toISOString());
  }
  const snapshot = getRuntimeSnapshot();

  const taskPlan = {
    id: planInput.id,
    description: planInput.description,
    tasks: planInput.tasks.map((task) => ({
      id: task.id,
      description: task.description,
      assignedAgent: task.assignedAgent,
      dependencies: task.dependencies,
      priority: task.priority,
      inputContext: task.inputContext,
    })),
    metadata: {
      createdAt: Date.now(),
      model: modelId ?? "unknown",
      totalEstimatedMs: 0,
      maxDepth: 0,
    },
  };
  const effectiveConcurrency = Math.max(
    1,
    Math.min(
      UNIFIED_EXECUTION_CONFIG.maxConcurrency,
      snapshot.limits.maxParallelSubagentsPerRun,
      taskPlan.tasks.length,
    ),
  );
  const dispatchPermit = await acquireRuntimeDispatchPermit({
    toolName: "ul_local_dag",
    candidate: {
      additionalRequests: 1,
      additionalLlm: effectiveConcurrency,
    },
    tenantKey: taskPlan.id,
    source: "scheduled",
    estimatedDurationMs: 60_000 * taskPlan.tasks.length,
    estimatedRounds: taskPlan.tasks.length,
    maxWaitMs: snapshot.limits.capacityWaitMs,
    pollIntervalMs: snapshot.limits.capacityPollMs,
  });

  if (!dispatchPermit.allowed || !dispatchPermit.lease) {
    throw new Error(
      buildRuntimeLimitError("ul_local_dag", dispatchPermit.reasons, {
        waitedMs: dispatchPermit.waitedMs,
        timedOut: dispatchPermit.timedOut,
      }),
    );
  }

  const runtimeState = getSharedRuntimeState();
  const liveMonitor = createSubagentLiveMonitor(ctx as never, {
    title: `Subagent Run DAG: ${taskPlan.id}`,
    items: taskPlan.tasks.map((task) => ({ id: task.id, name: task.description.slice(0, 50) })),
  });
  const dagSessionId = generateSessionId();
  const stopReservationHeartbeat = startReservationHeartbeat(dispatchPermit.lease);

  addSession({
    id: dagSessionId,
    type: "subagent",
    agentId: "ul-local-dag",
    taskId: typeof dagParams.ulTaskId === "string" ? dagParams.ulTaskId : undefined,
    taskTitle: String(dagParams.task ?? taskPlan.description).slice(0, 50),
    taskDescription: String(dagParams.task ?? taskPlan.description),
    status: "starting",
    startedAt: Date.now(),
    teammateCount: taskPlan.tasks.length,
  });

  runtimeState.subagents.activeRunRequests += 1;
  notifyRuntimeCapacityChanged();
  refreshRuntimeStatus(ctx as never, "subagent-runtime", "Sub", runtimeState.subagents.activeAgents, "Team", 0);
  dispatchPermit.lease.consume();

  let dagResult;
  let followupDecision: ResearchFollowupDecision | PlanFollowupDecision | ImplementFollowupDecision | ReviewFollowupDecision | undefined;
  let dynamicResearchApplied = false;
  let dynamicPlanApplied = false;
  let dynamicImplementApplied = false;
  let dynamicReviewApplied = false;
  try {
    dagResult = await executeDag<{ output: string }>(
      taskPlan,
      async (task, context) => {
        const assignedAgentId = task.assignedAgent || "implementer";
        const agent = storage.agents.find((candidate) => candidate.id === assignedAgentId);
        if (!agent) {
          throw new Error(`subagent が見つかりません: ${assignedAgentId}`);
        }

        liveMonitor?.markStarted(task.id);
        updateSession(dagSessionId, {
          status: "running",
          message: `${task.id} running`,
        });
        runtimeState.subagents.activeAgents += 1;
        notifyRuntimeCapacityChanged();
        refreshRuntimeStatus(ctx as never, "subagent-runtime", "Sub", runtimeState.subagents.activeAgents, "Team", 0);

        try {
          const result = await runSubagentTask({
            agent,
            task: task.description,
            extraContext: context,
            timeoutMs: UNIFIED_EXECUTION_CONFIG.subagentTimeoutMs,
            cwd,
            modelProvider,
            modelId,
            onTextDelta: (delta) => {
              liveMonitor?.appendChunk(task.id, "stdout", delta);
            },
            onStderrChunk: (chunk) => {
              liveMonitor?.appendChunk(task.id, "stderr", chunk);
            },
          });

          liveMonitor?.markFinished(task.id, "completed", result.runRecord.summary, result.runRecord.error);
          return { output: result.output };
        } finally {
          runtimeState.subagents.activeAgents = Math.max(0, runtimeState.subagents.activeAgents - 1);
          notifyRuntimeCapacityChanged();
          refreshRuntimeStatus(ctx as never, "subagent-runtime", "Sub", runtimeState.subagents.activeAgents, "Team", 0);
        }
      },
      {
        maxConcurrency: effectiveConcurrency,
        abortOnFirstError: false,
        nodeTimeoutMs: UNIFIED_EXECUTION_CONFIG.subagentTimeoutMs,
        overallTimeoutMs: UNIFIED_EXECUTION_CONFIG.subagentTimeoutMs * Math.max(1, taskPlan.tasks.length),
        onBatchSettled: dynamicResearchConfig
          ? (api) => {
            const gapTaskId = dynamicResearchConfig.gapTaskId?.trim() || "research-gap-check";
            const synthesisTaskId = dynamicResearchConfig.synthesisTaskId?.trim() || "research-synthesis";
            if (dynamicResearchApplied || !api.completedTaskIds.includes(gapTaskId)) {
              return;
            }

            dynamicResearchApplied = true;
            const baseOutput = Array.from(api.results.entries())
              .map(([taskId, result]) => {
                const status = result.status.toUpperCase();
                const output =
                  result.status === "completed"
                    ? ((result.output as { output?: string } | undefined)?.output ?? "")
                    : result.error?.message ?? "";
                return `## ${taskId}\nStatus: ${status}\n${output}`;
              })
              .join("\n\n");

            followupDecision = decideResearchFollowups(baseOutput);
            const decision = followupDecision;
            const taskLabel = dynamicResearchConfig.task?.trim() || String(dagParams.task ?? taskPlan.description);
            const baseContext = `Base research findings:\n${baseOutput.trim() || "No base output captured."}\n\nGap-check rationale:\n${decision.rationale}`;

            if (decision.needsExternalDeepDive) {
              api.addNode({
                id: "research-deep-dive-external",
                description: `調査対象: ${taskLabel}

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
                description: `調査対象: ${taskLabel}

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
            ? (api) => {
              const gapTaskId = dynamicPlanConfig.gapTaskId?.trim() || "plan-gap-check";
              const synthesisTaskId = dynamicPlanConfig.synthesisTaskId?.trim() || "plan-synthesis";
              if (dynamicPlanApplied || !api.completedTaskIds.includes(gapTaskId)) {
                return;
              }

              dynamicPlanApplied = true;
              const baseOutput = Array.from(api.results.entries())
                .map(([taskId, result]) => {
                  const status = result.status.toUpperCase();
                  const output =
                    result.status === "completed"
                      ? ((result.output as { output?: string } | undefined)?.output ?? "")
                      : result.error?.message ?? "";
                  return `## ${taskId}\nStatus: ${status}\n${output}`;
                })
                .join("\n\n");

              followupDecision = decidePlanFollowups(baseOutput);
              const decision = followupDecision as PlanFollowupDecision;
              const taskLabel = dynamicPlanConfig.task?.trim() || String(dagParams.task ?? taskPlan.description);
              const baseContext = `Base plan findings:\n${baseOutput.trim() || "No base output captured."}\n\nGap-check rationale:\n${decision.rationale}`;

              if (decision.needsChangesDeepDive) {
                api.addNode({
                  id: "plan-deep-dive-changes",
                  description: `タスク: ${taskLabel}

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
                  description: `タスク: ${taskLabel}

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
              ? (api) => {
                const gapTaskId = dynamicImplementConfig.gapTaskId?.trim() || "implement-gap-check";
                const synthesisTaskId = dynamicImplementConfig.synthesisTaskId?.trim() || "implement-synthesis";
                if (dynamicImplementApplied || !api.completedTaskIds.includes(gapTaskId)) {
                  return;
                }

                dynamicImplementApplied = true;
                const baseOutput = Array.from(api.results.entries())
                  .map(([taskId, result]) => {
                    const status = result.status.toUpperCase();
                    const output =
                      result.status === "completed"
                        ? ((result.output as { output?: string } | undefined)?.output ?? "")
                        : result.error?.message ?? "";
                    return `## ${taskId}\nStatus: ${status}\n${output}`;
                  })
                  .join("\n\n");

                followupDecision = decideImplementFollowups(baseOutput);
                const decision = followupDecision as ImplementFollowupDecision;
                const taskLabel = dynamicImplementConfig.task?.trim() || String(dagParams.task ?? taskPlan.description);
                const baseContext = `Base implement findings:\n${baseOutput.trim() || "No base output captured."}\n\nGap-check rationale:\n${decision.rationale}`;

                if (decision.needsFixupDeepDive) {
                  api.addNode({
                    id: "implement-deep-dive-fixup",
                    description: `タスク: ${taskLabel}

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
                    description: `タスク: ${taskLabel}

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
                ? (api) => {
                  const gapTaskId = dynamicReviewConfig.gapTaskId?.trim() || "review-gap-check";
                  const synthesisTaskId = dynamicReviewConfig.synthesisTaskId?.trim() || "review-synthesis";
                  if (dynamicReviewApplied || !api.completedTaskIds.includes(gapTaskId)) {
                    return;
                  }

                  dynamicReviewApplied = true;
                  const baseOutput = Array.from(api.results.entries())
                    .map(([taskId, result]) => {
                      const status = result.status.toUpperCase();
                      const output =
                        result.status === "completed"
                          ? ((result.output as { output?: string } | undefined)?.output ?? "")
                          : result.error?.message ?? "";
                      return `## ${taskId}\nStatus: ${status}\n${output}`;
                    })
                    .join("\n\n");

                  followupDecision = decideReviewFollowups(baseOutput);
                  const decision = followupDecision as ReviewFollowupDecision;
                  const taskLabel = dynamicReviewConfig.task?.trim() || String(dagParams.task ?? taskPlan.description);
                  const baseContext = `Base review findings:\n${baseOutput.trim() || "No base output captured."}\n\nGap-check rationale:\n${decision.rationale}`;

                  if (decision.needsRiskDeepDive) {
                    api.addNode({
                      id: "review-deep-dive-risk",
                      description: `タスク: ${taskLabel}

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
                      description: `タスク: ${taskLabel}

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
        onTaskError: (taskId, error) => {
          liveMonitor?.markFinished(taskId, "failed", error.message, error.message);
        },
      },
    );
  } finally {
    runtimeState.subagents.activeRunRequests = Math.max(0, runtimeState.subagents.activeRunRequests - 1);
    notifyRuntimeCapacityChanged();
    refreshRuntimeStatus(ctx as never, "subagent-runtime", "Sub", runtimeState.subagents.activeAgents, "Team", 0);
    stopReservationHeartbeat();
    dispatchPermit.lease.release();
    liveMonitor?.close();
    await liveMonitor?.wait();
  }

  const preferredArtifactTaskId = typeof dagParams.artifactTaskId === "string"
    ? dagParams.artifactTaskId.trim()
    : "";
  const aggregatedOutput = Array.from(dagResult.taskResults.entries())
    .map(([taskId, result]) => {
      const status = result.status.toUpperCase();
      const output =
        result.status === "completed"
          ? ((result.output as { output?: string } | undefined)?.output ?? "")
          : result.error?.message ?? "";
      return `## ${taskId}\nStatus: ${status}\n${output}`;
    })
    .join("\n\n");

  const artifactContent = selectArtifactContent(
    dagResult.taskResults.entries(),
    preferredArtifactTaskId,
    aggregatedOutput,
  );
  const artifactPath = typeof dagParams.artifactPath === "string" ? dagParams.artifactPath.trim() : "";
  if (artifactPath && artifactContent.trim()) {
    await fsPromises.mkdir(path.dirname(artifactPath), { recursive: true });
    atomicWriteTextFile(artifactPath, `${artifactContent.trim()}\n`);
  }

  updateSession(dagSessionId, {
    status: dagResult.overallStatus === "completed" ? "completed" : "failed",
    completedAt: Date.now(),
    progress: 100,
    message: `${dagResult.completedTaskIds.length}/${taskPlan.tasks.length} tasks completed`,
  });

  return {
    content: [{ type: "text", text: aggregatedOutput }],
    details: {
      planId: taskPlan.id,
      overallStatus: dagResult.overallStatus,
      completedTaskIds: dagResult.completedTaskIds,
      failedTaskIds: dagResult.failedTaskIds,
      artifactPath: artifactPath || undefined,
      artifactTaskId: preferredArtifactTaskId || undefined,
      followupDecision,
    },
  };
}

async function runUlDelegatedTask(
  ctx: unknown,
  options: {
    subagentId: string;
    task: string;
    extraContext?: string;
    ulTaskId?: string;
    dagParams?: Record<string, unknown>;
  },
): Promise<AgentToolResult<unknown>> {
  const dagParams = options.dagParams ?? buildSingleAgentDagParams(options);
  const executeTool = getToolExecutor(ctx);
  if (executeTool) {
    return runSubagentViaDagTool(ctx, { ...options, dagParams });
  }
  return runDagLocally(ctx, dagParams);
}

async function executeResearchWorkflow(
  ctx: unknown,
  options: {
    task: string;
    taskId: string;
    researchPath: string;
    instruction: { subagentId: string; task: string; extraContext: string };
  },
): Promise<{
  baseResult: AgentToolResult<unknown> | null;
  followupResult: AgentToolResult<unknown>;
  decision: ResearchFollowupDecision;
}> {
  if (!getToolExecutor(ctx)) {
    const dynamicDagParams = buildDynamicResearchDagParams(
      options.task,
      options.researchPath,
      options.taskId,
    );
    const followupResult = await runUlDelegatedTask(ctx, {
      ...options.instruction,
      ulTaskId: options.taskId,
      dagParams: dynamicDagParams,
    });
    const decision = (
      (followupResult.details as { followupDecision?: ResearchFollowupDecision } | undefined)?.followupDecision
      ?? {
        needsExternalDeepDive: false,
        needsCodebaseDeepDive: false,
        rationale: "dynamic research DAG completed without an explicit gap-check decision",
      }
    );

    return {
      baseResult: null,
      followupResult,
      decision,
    };
  }

  const baseDagParams = buildResearchBaseDagParams(options.task, options.taskId);
  const baseResult = await runUlDelegatedTask(ctx, {
    ...options.instruction,
    ulTaskId: options.taskId,
    dagParams: baseDagParams,
  });
  const baseOutput = extractTextFromToolResult(baseResult);
  const decision = decideResearchFollowups(baseOutput);
  const followupDagParams = buildResearchFollowupDagParams(
    options.task,
    options.researchPath,
    options.taskId,
    baseOutput,
    decision,
  );
  const followupResult = await runUlDelegatedTask(ctx, {
    ...options.instruction,
    ulTaskId: options.taskId,
    dagParams: followupDagParams,
  });

  return {
    baseResult,
    followupResult,
    decision,
  };
}

async function executePlanWorkflow(
  ctx: unknown,
  options: {
    task: string;
    taskId: string;
    researchPath: string;
    planPath: string;
    instruction: { subagentId: string; task: string; extraContext: string };
  },
): Promise<{
  result: AgentToolResult<unknown>;
  decision: PlanFollowupDecision | null;
}> {
  const dagParams = buildDynamicPlanDagParams(
    options.task,
    options.researchPath,
    options.planPath,
    options.taskId,
  );
  const result = await runUlDelegatedTask(ctx, {
    ...options.instruction,
    ulTaskId: options.taskId,
    dagParams,
  });

  return {
    result,
    decision: (result.details as { followupDecision?: PlanFollowupDecision } | undefined)?.followupDecision ?? null,
  };
}

async function revisePlanWorkflow(
  ctx: unknown,
  options: {
    task: string;
    taskId: string;
    researchPath: string;
    planPath: string;
    modifications: string;
  },
): Promise<{
  result: AgentToolResult<unknown>;
  decision: PlanFollowupDecision | null;
}> {
  const revisionInstruction = generatePlanInstruction(
    `${options.task}\n\n修正要求:\n${options.modifications}`,
    options.researchPath,
    options.planPath,
    options.taskId,
  );
  const extraContext = [
    revisionInstruction.extraContext,
    `既存の plan.md を尊重しつつ、以下の修正を必ず反映してください:\n${options.modifications}`,
  ].join("\n\n");

  const result = await runUlDelegatedTask(ctx, {
    subagentId: revisionInstruction.subagentId,
    task: revisionInstruction.task,
    extraContext,
    ulTaskId: options.taskId,
    dagParams: buildDynamicPlanDagParams(
      `${options.task}\n\n修正要求:\n${options.modifications}`,
      options.researchPath,
      options.planPath,
      options.taskId,
    ),
  });

  return {
    result,
    decision: (result.details as { followupDecision?: PlanFollowupDecision } | undefined)?.followupDecision ?? null,
  };
}

async function executeImplementWorkflow(
  ctx: unknown,
  options: {
    task: string;
    taskId: string;
    planPath: string;
  },
): Promise<{
  result: AgentToolResult<unknown>;
  decision: ImplementFollowupDecision | null;
}> {
  const result = await runUlDelegatedTask(ctx, {
    subagentId: "implementer",
    task: `plan.mdを実装: ${options.planPath}`,
    extraContext: "機械的に実装してください。",
    ulTaskId: options.taskId,
    dagParams: buildDynamicImplementDagParams(options.task, options.planPath, options.taskId),
  });

  return {
    result,
    decision: (result.details as { followupDecision?: ImplementFollowupDecision } | undefined)?.followupDecision ?? null,
  };
}

async function executeReviewWorkflow(
  ctx: unknown,
  options: {
    task: string;
    taskId: string;
    planPath: string;
    reviewPath: string;
  },
): Promise<{
  result: AgentToolResult<unknown>;
  decision: ReviewFollowupDecision | null;
}> {
  const result = await runUlDelegatedTask(ctx, {
    subagentId: "reviewer",
    task: `review preparation を作成: ${options.planPath}`,
    extraContext: "workspace_verify の前に review.md を作成してください。",
    ulTaskId: options.taskId,
    dagParams: buildDynamicReviewDagParams(
      options.task,
      options.planPath,
      options.reviewPath,
      options.taskId,
    ),
  });

  return {
    result,
    decision: (result.details as { followupDecision?: ReviewFollowupDecision } | undefined)?.followupDecision ?? null,
  };
}

// Ownership check helper with process liveness check
function checkOwnership(state: WorkflowState | null, options?: { autoClaim?: boolean }): OwnershipResult {
  const instanceId = getInstanceId();
  if (!state) {
    return { owned: false, error: "no_active_workflow" };
  }
  if (state.ownerInstanceId !== instanceId) {
    // Check if the owner process is dead
    if (options?.autoClaim && isOwnerProcessDead(state.ownerInstanceId)) {
      return {
        owned: true,
        autoClaim: true,
        previousOwner: state.ownerInstanceId,
      };
    }
    return {
      owned: false,
      error: `workflow_owned_by_other: ${state.ownerInstanceId} (current: ${instanceId})`
    };
  }
  return { owned: true };
}

// 現在のワークフロー状態（セッション内）
// 注: ファイルベースの永続化を優先するが、パフォーマンスのためセッション内キャッシュとして使用
let currentWorkflow: WorkflowState | null = null;

/**
 * サブエージェント委任指示を生成するヘルパー（簡潔版）
 * @summary サブエージェント委任指示生成
 * @param subagentId - サブエージェントID
 * @param task - タスク内容（簡潔）
 * @param outputPath - 出力ファイルパス
 * @returns subagent_run呼び出し指示
 */
function generateSubagentInstructionSimple(
  subagentId: string,
  task: string,
  outputPath: string
): string {
  return `subagent_run_dag({ task: "${task.replace(/"/g, '\\"')}", autoGenerate: false, plan: { id: "${subagentId}-single-step", description: "${subagentId} single step execution", tasks: [{ id: "${subagentId}", description: "${task.replace(/"/g, '\\"')}", assignedAgent: "${subagentId}", dependencies: [] }] } }) → ${outputPath}`;
}

/**
 * plan生成指示を生成（共通）
 * @summary plan生成指示
 * @param task - タスク説明
 * @param researchPath - 調査結果のパス
/**
 * Research フェーズ用の指示を生成
 * @summary Research指示生成
 * @param task - タスク説明
 * @param researchPath - research.md出力パス
 * @param taskId - タスクID
 * @returns サブエージェントへの指示オブジェクト
 */
function generateResearchInstruction(
  task: string,
  researchPath: string,
  taskId: string
): {
  subagentId: string;
  task: string;
  extraContext: string;
} {
  return {
    subagentId: "researcher",
    task: `以下のタスクについて、ビジネスアナリストとして research.md を作成してください。

タスク: ${task}

保存先: ${researchPath}

調査要件:
- まずユーザ入力を顧客要求として解釈する
- ユーザが欲しい成果、成功条件、制約、不明点を整理する
- 必要に応じて web 検索で外部知識を集める
- その後でローカルコードや関連ファイルを確認する
- 関連するファイルパスを明記する
- 外部調査で見たことを、plan にどう反映するかまで書く

強調すべき点:
- research は単なるコード棚卸しではありません
- 新規構築、複合技術、未知ライブラリ、表現品質が重要なタスクでは web 検索を強く優先してください
- 採用技術スタックや依存ライブラリに関わる場合は、コードベースだけで結論を出さないでください
- 表面的な読み取りでは不十分です
- 調査結果は plan を深くするための材料でなければなりません

推奨セクション:
- Task Understanding
- User Intent
- Requested Outcome
- Constraints
- Unknowns
- Tech Stack / APIs To Check
- External Research Findings
- References
- Local Codebase Findings
- Risks
- Plan Inputs

【高リスク判定】（MANDATORY）
research.md の最後に以下のセクションを必ず含めてください:

## 高リスク判定

### 判定結果
- [ ] high-risk（高リスク）
- [ ] normal（通常）

### 判定根拠
以下のいずれかに該当する場合、high-risk と判定:
- 認証・認可・パスワード・シークレットに関連する変更
- データベーススキーマ・マイグレーション
- 決済・課金機能
- 本番環境へのデプロイ・リリース
- データ削除・破壊的操作
- セキュリティ脆弱性の修正
- 暗号化・復号化処理
`,
    extraContext: `research.md は ${researchPath} に保存してください。永続的な成果物です。単なる要約ではなく、後で参照できる詳細なドキュメントを作成してください。顧客要求の解釈、技術スタック調査、外部調査、ローカル確認、plan への反映をつなげて書いてください。References セクションを必ず含めてください。高リスク判定は必ず含めてください。`,
  };
}

/**
 * Plan フェーズ用の指示を生成
 * @summary Plan指示生成
 * @param task - タスク説明
 * @param researchPath - research.mdパス
 * @param planPath - plan出力パス
 * @param taskId - タスクID
 * @returns サブエージェントへの指示オブジェクト
 */
function generatePlanInstruction(
  task: string,
  researchPath: string,
  planPath: string,
  taskId: string
): {
  subagentId: string;
  task: string;
  extraContext: string;
} {
  return {
    subagentId: "architect",
    task: `以下のタスクの詳細な実装計画を作成し、plan.mdを生成してください。

タスク: ${task}

事前調査: ${researchPath}

計画要件:
- research.md にある顧客要求の解釈を明示する
- 要求から受け入れ条件、設計、実装順序への橋渡しを書く
- 詳細なアプローチの説明
- 実際の変更内容を示すコードスニペット
- 変更対象となるファイルパス
- 考慮事項やトレードオフの分析
- タスクリスト（チェックボックス形式）

保存先: ${planPath}

重要:
- research.md の内容を十分に参照してください
- 既存のコードパターンを尊重してください
- コードスニペットは実際の変更を反映してください
`,
    extraContext: "plan.md はユーザーのレビュー対象です。ユーザーは顧客でもあり開発者でもあります。レビューしやすいように、User Intent、Analyst Interpretation、Acceptance Criteria、Implementation Order のつながりが分かる構造にしてください。",
  };
}

/**
 * タスクIDを生成する
 * BUG-003 FIX: ランダムサフィックス追加で衝突回避
 */
function generateTaskId(description: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const hash = description.slice(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const suffix = randomBytes(4).toString("hex");  // 8文字のランダムサフィックス
  return `${timestamp}-${hash}-${suffix}`;
}

/**
 * ワークフローディレクトリのパスを取得
 */
function getTaskDir(taskId: string): string {
  return path.join(TASKS_DIR, taskId);
}

/**
 * 状態を保存
 */
export function saveState(state: WorkflowState): void {
  const taskDir = getTaskDir(state.taskId);
  const statusPath = path.join(taskDir, "status.json");

  if (!fs.existsSync(taskDir)) {
    fs.mkdirSync(taskDir, { recursive: true });
  }

  withFileLock(statusPath, () => {
    atomicWriteTextFile(statusPath, JSON.stringify(state, null, 2));
  });
}

/**
 * 状態を非同期で保存する
 * 大量のタスクがある場合のI/Oボトルネック削減とメインスレッドのブロック回避
 * @summary 非同期状態保存
 * @param state - ワークフロー状態
 */
async function saveStateAsync(state: WorkflowState): Promise<void> {
  // 同期版のsaveStateを使用してファイルロックとatomic writeを保証
  // 非同期関数として公開することで呼び出し元のAPIを維持
  saveState(state);
}

/**
 * 状態を読み込む
 */
export function loadState(taskId: string): WorkflowState | null {
  const statusPath = path.join(getTaskDir(taskId), "status.json");
  try {
    const content = fs.readFileSync(statusPath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    const errorCode = (error as NodeJS.ErrnoException)?.code;
    if (errorCode !== "ENOENT") {
      console.error(`[ul-workflow] loadState failed for ${taskId}:`, errorCode ?? "unknown", error);
    }
    return null;
  }
}

/**
 * 現在インスタンスが最後に触った workflow を探す。
 * completed 後に active を外しても commit へ進めるために使う。
 */
function findLatestWorkflowForInstance(options?: { includeCompleted?: boolean }): WorkflowState | null {
  try {
    if (!fs.existsSync(TASKS_DIR)) {
      return null;
    }

    const instanceId = getInstanceId();
    const taskIds = fs.readdirSync(TASKS_DIR);
    const states = taskIds
      .map((taskId) => loadState(taskId))
      .filter((state): state is WorkflowState => !!state)
      .filter((state) => state.ownerInstanceId === instanceId)
      .filter((state) => options?.includeCompleted ? true : state.phase !== "completed")
      .sort((a, b) => {
        const da = Date.parse(a.updatedAt);
        const db = Date.parse(b.updatedAt);
        // NaNチェック: 不正なタイムスタンプは後ろに配置
        if (isNaN(da) || isNaN(db)) {
          return isNaN(da) ? 1 : -1;
        }
        return db - da;
      });

    return states[0] ?? null;
  } catch (error) {
    // 予期せぬエラー（EACCES, EIO等）はログに出力
    const errorCode = (error as NodeJS.ErrnoException)?.code;
    if (errorCode === "ENOENT") {
      // ディレクトリが存在しないのは正常ケース
      return null;
    }
    // 権限エラーやI/Oエラーは警告を出力
    console.error(`findLatestWorkflowForInstance: Failed to read workflow directory: ${errorCode ?? "unknown"}`, error);
    return null;
  }
}

/**
 * 状態を非同期で読み込む
 * @summary 非同期状態読み込み
 * @param taskId - タスクID
 * @returns ワークフロー状態（存在しない場合はnull）
 */
async function loadStateAsync(taskId: string): Promise<WorkflowState | null> {
  const statusPath = path.join(getTaskDir(taskId), "status.json");
  try {
    const content = await fsPromises.readFile(statusPath, "utf-8");
    return JSON.parse(content) as WorkflowState;
  } catch (error) {
    const errorCode = (error as NodeJS.ErrnoException)?.code;
    if (errorCode !== "ENOENT") {
      console.error(`[ul-workflow] loadStateAsync failed for ${taskId}:`, errorCode ?? "unknown", error);
    }
    return null;
  }
}

/**
 * タスクファイルを作成
 */
function createTaskFile(taskId: string, description: string): void {
  const taskDir = getTaskDir(taskId);
  const taskPath = path.join(taskDir, "task.md");
  
  if (!fs.existsSync(taskDir)) {
    fs.mkdirSync(taskDir, { recursive: true });
  }
  
  const content = `# Task Definition\n\n---\ntask_id: ${taskId}\ncreated_at: ${new Date().toISOString()}\n---\n\n## Description\n\n${description}\n`;
  fs.writeFileSync(taskPath, content, "utf-8");
}

/**
 * 注釈を抽出
 */
function extractAnnotations(content: string): string[] {
  const annotations: string[] = [];
  
  // NOTE形式
  const notePattern = /<!--\s*NOTE:\s*([\s\S]+?)\s*-->/g;
  let match;
  while ((match = notePattern.exec(content)) !== null) {
    annotations.push(match[1].trim());
  }
  
  // 日本語形式
  const jpPattern = /\[注釈\]:\s*(.+?)(?=\n|$)/g;
  while ((match = jpPattern.exec(content)) !== null) {
    annotations.push(match[1].trim());
  }
  
  // ANNOTATION形式
  const annPattern = /<!--\s*ANNOTATION:\s*([\s\S]+?)\s*-->/g;
  while ((match = annPattern.exec(content)) !== null) {
    annotations.push(match[1].trim());
  }
  
  return annotations;
}

/**
 * plan.mdを読み込む
 */
function readPlanFile(taskId: string): string {
  const planPath = path.join(getTaskDir(taskId), "plan.md");
  try {
    return fs.readFileSync(planPath, "utf-8");
  } catch (error) {
    const errorCode = (error as NodeJS.ErrnoException)?.code;
    if (errorCode !== "ENOENT") {
      console.error(`[ul-workflow] readPlanFile failed for ${taskId}:`, errorCode ?? "unknown", error);
    }
    return "";
  }
}

/**
 * フェーズを進める（状態保存は呼び出し元の責任）
 * BUG-002 FIX: saveState() 呼び出しを削除
 */
function advancePhase(state: WorkflowState): WorkflowPhase {
  if (state.phaseIndex < state.phases.length - 1) {
    state.phaseIndex++;
    state.phase = state.phases[state.phaseIndex];
    state.updatedAt = new Date().toISOString();
    // saveState(state);  // 削除: 呼び出し元で制御
  }

  return state.phase;
}

/**
 * 結果を作成するヘルパー関数
 */
function makeResult(text: string, details: Record<string, unknown> = {}): AgentToolResult<unknown> {
  return {
    content: [{ type: "text", text }],
    details,
  };
}

/**
 * ユーザー確認が必要な結果を作成するヘルパー関数
 */
function makeResultWithQuestion(
  text: string,
  questionData: {
    question: string;
    header: string;
    options: Array<{ label: string; description: string }>;
  },
  details: Record<string, unknown> = {}
): AgentToolResult<unknown> {
  return {
    content: [{ type: "text", text }],
    details: {
      ...details,
      askUser: true,
      question: questionData,
    },
  };
}

/**
 * AgentToolResult から最初のテキスト本文を抜き出す。
 * subagent が成果物を書かなかった場合の最終フォールバックに使う。
 */
function extractTextFromToolResult(result: AgentToolResult<unknown> | undefined): string {
  const firstContent = result?.content?.find(
    (item): item is { type: "text"; text: string } =>
      typeof item === "object" &&
      item !== null &&
      "type" in item &&
      "text" in item &&
      item.type === "text" &&
      typeof item.text === "string",
  );
  return firstContent?.text?.trim() ?? "";
}

/**
 * 成果物ファイルを確実に残す。
 * subagent が自前で保存していればそれを優先し、未保存時だけ出力を保存する。
 */
async function ensureWorkflowArtifact(
  artifactPath: string,
  fallbackContent: string,
): Promise<{ created: boolean; content: string }> {
  try {
    const existing = await fsPromises.readFile(artifactPath, "utf-8");
    if (existing.trim()) {
      return { created: false, content: existing };
    }
  } catch (error) {
    // ENOENT is expected (file doesn't exist yet), log other errors
    const errorCode = (error as NodeJS.ErrnoException)?.code;
    if (errorCode !== "ENOENT") {
      console.error(`[ul-workflow] ensureWorkflowArtifact readFile failed for ${artifactPath}:`, errorCode ?? "unknown", error);
    }
  }

  const normalized = fallbackContent.trim() || "_No content generated._";
  await fsPromises.mkdir(path.dirname(artifactPath), { recursive: true });
  atomicWriteTextFile(artifactPath, `${normalized}\n`);
  return { created: true, content: normalized };
}

async function ensureUlExecutionPlan(
  ctx: unknown,
  workflow: WorkflowState,
  planPath: string,
): Promise<string> {
  const executeTool = getToolExecutor(ctx);
  if (!executeTool) {
    throw new Error("plan_create APIが利用できません");
  }

  if (workflow.executionPlanId) {
    await executeTool("plan_update_status", {
      planId: workflow.executionPlanId,
      status: "active",
    });
    return workflow.executionPlanId;
  }

  const planName = `UL Execute: ${workflow.taskDescription.slice(0, 40)}`;
  const createResult = await executeTool("plan_create", {
    name: planName,
    description: `UL workflow implement phase for ${workflow.taskId}`,
    goal: "plan.md の内容を実装し、verify まで進められる状態を作る",
    acceptanceCriteria: [
      "plan.md に記載された実装方針が反映される",
      "workspace_verify に進める状態になる",
    ],
    implementationOrder: [
      "plan.md を読んで実装する",
      "必要な修正を反映する",
      "workspace_verify へ進む",
    ],
    testVerification: [
      "workspace_verify を実行する",
      "必要なら workspace_verify_ack / workspace_verify_review_ack を完了する",
    ],
    fileModuleImpact: [planPath],
    documentSlug: `ul-${workflow.taskId}`,
  });

  const planId = typeof createResult?.details === "object" && createResult?.details !== null
    ? String((createResult.details as { planId?: unknown }).planId ?? "")
    : "";
  if (!planId) {
    throw new Error("UL execution plan の planId を取得できませんでした");
  }

  await executeTool("plan_update_status", {
    planId,
    status: "active",
  });

  workflow.executionPlanId = planId;
  return planId;
}

/**
 * 拡張機能を登録
 * @summary UL Workflow拡張を登録
 * @param pi - 拡張機能APIインターフェース
 * @returns なし
 */
export default function registerUlWorkflowExtension(pi: ExtensionAPI) {
  if (process.env.PI_CHILD_DISABLE_ORCHESTRATION === "1") {
    return;
  }

  
  // ワークフロー開始ツール
  pi.registerTool({
    name: "ul_workflow_start",
    label: "Start UL Workflow",
    description: "UL Workflow Modeを開始（Research-Plan-Annotate-Implement）",
    parameters: Type.Object({
      task: Type.String({ description: "実行するタスクの説明" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { task } = params;
      const instanceId = getInstanceId();

      // BEGIN FIX: BUG-001 空タスク検証
      const trimmedTask = String(task || "").trim();
      if (!trimmedTask) {
        return makeResult("エラー: タスク説明を入力してください。\n\n使用例:\n  ul_workflow_start({ task: 'バグを修正する' })", { error: "empty_task" });
      }

      if (trimmedTask.length < 5) {
        return makeResult(`エラー: タスク説明が短すぎます（現在: ${trimmedTask.length}文字）。\n\n少なくとも5文字以上の説明を入力してください。`, { error: "task_too_short", length: trimmedTask.length });
      }
      // END FIX

      // REMOVED: Global single-active-workflow check
      // Each instance can now start independent workflows.
      // Ownership is tracked per-task in state.json and enforced by checkUlWorkflowOwnership()
      // when delegation tools receive ulTaskId parameter.

      const taskId = generateTaskId(trimmedTask);
      const now = new Date().toISOString();

      // 統一フローを使用
      const phases = [...UNIFIED_PHASES];

      currentWorkflow = {
        taskId,
        taskDescription: trimmedTask,
        phase: phases[0],
        phases,
        phaseIndex: 0,
        createdAt: now,
        updatedAt: now,
        approvedPhases: [],
        annotationCount: 0,
        ownerInstanceId: instanceId,
      };

      createTaskFile(taskId, trimmedTask);
      saveState(currentWorkflow);
      setCurrentWorkflow(currentWorkflow);

      const phaseDescriptions = phases.map((p) => p.toUpperCase()).join(" -> ");

      return makeResult(`ワークフローを開始しました。

Task ID: ${taskId}
説明: ${task}

フェーズ構成: ${phaseDescriptions}
現在のフェーズ: ${phases[0].toUpperCase()}

次のステップ:
1. researcher サブエージェントが、顧客要求の解釈と必要な調査を実行します
2. 必要に応じて web 検索で外部知識を集め、research.md に整理します
3. research.md は .pi/ul-workflow/tasks/${taskId}/research.md に保存されます
4. 調査が完了したら ul_workflow_approve で次のフェーズへ進みます

調査を実行するには:
  ul_workflow_research({ task: "${task}", task_id: "${taskId}" })
`, { taskId, phase: phases[0], phases });
    },
  });

  // 互換用の統合実行ツール
  // 現在は Research / Plan を実行し、annotate でユーザー確認を返す。
  pi.registerTool({
    name: "ul_workflow_run",
    label: "Run UL Workflow",
    description: "互換用ヘルパー。現在は Research / Plan を実行して annotate で停止する。mode は互換入力として受け取るが、挙動は unified-flow に固定。",
    parameters: Type.Object({
      task: Type.String({ description: "実行するタスク" }),
      mode: Type.Optional(Type.Union([
        Type.Literal("auto"),
        Type.Literal("sequential"),
        Type.Literal("parallel")
      ], { description: "互換入力。現在の挙動は unified-flow 固定" })),
      maxConcurrency: Type.Optional(Type.Number({ description: "互換入力。将来の並列実行制御用" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { task, mode = "auto", maxConcurrency = 3 } = params;
      const instanceId = getInstanceId();
      const trimmedTask = String(task || "").trim();

      if (!trimmedTask) {
        return makeResult("エラー: タスク説明を入力してください。", { error: "empty_task" });
      }

      if (trimmedTask.length < 5) {
        return makeResult(`エラー: タスク説明が短すぎます（現在: ${trimmedTask.length}文字）。`, { error: "task_too_short", length: trimmedTask.length });
      }

      const taskId = generateTaskId(trimmedTask);
      const now = new Date().toISOString();

      const effectiveConcurrency = maxConcurrency;
      const phases: WorkflowPhase[] = [...UNIFIED_PHASES];
      
      console.log(`[ul_workflow_run] Mode input: ${mode}, Execution: unified-flow, Concurrency hint: ${effectiveConcurrency}`);

      currentWorkflow = {
        taskId,
        taskDescription: trimmedTask,
        phase: phases[0],
        phases,
        phaseIndex: 0,
        createdAt: now,
        updatedAt: now,
        approvedPhases: [],
        annotationCount: 0,
        ownerInstanceId: instanceId,
      };

      createTaskFile(taskId, trimmedTask);
      saveState(currentWorkflow);
      setCurrentWorkflow(currentWorkflow);

      const researchPath = path.join(getTaskDir(taskId), "research.md");
      const planPath = path.join(getTaskDir(taskId), "plan.md");

      // 統合アプローチ: Research → Plan（逐次）→ Implement（DAG並列）
      // すべてのモードでResearch/Planは逐次実行し、ImplementのみDAG並列化
      try {
        // === PHASE 1: Research（逐次）===
        console.log(`[ul_workflow_run] Phase 1: Research (sequential)`);
        const researchInstruction = generateResearchInstruction(trimmedTask, researchPath, taskId);
        const researchRun = await executeResearchWorkflow(ctx, {
          task: trimmedTask,
          taskId,
          researchPath,
          instruction: researchInstruction,
        });
        await ensureWorkflowArtifact(researchPath, extractTextFromToolResult(researchRun.followupResult));

        // === PHASE 2: Plan（逐次）===
        console.log(`[ul_workflow_run] Phase 2: Plan (sequential)`);
        const planInstruction = generatePlanInstruction(trimmedTask, researchPath, planPath, taskId);
        const planRun = await executePlanWorkflow(ctx, {
          task: trimmedTask,
          taskId,
          researchPath,
          planPath,
          instruction: planInstruction,
        });
        await ensureWorkflowArtifact(planPath, extractTextFromToolResult(planRun.result));

        currentWorkflow.approvedPhases.push("research", "plan");
        currentWorkflow.phase = "plan";
        currentWorkflow.phaseIndex = 1;
        currentWorkflow.updatedAt = new Date().toISOString();
        saveState(currentWorkflow);

        const planContent = readPlanFile(taskId);

        // === PHASE 3: Annotate（ユーザーレビュー）===
        // Plan作成後、自動的にannotateフェーズへ移行
        currentWorkflow.phase = "annotate";
        currentWorkflow.phaseIndex = 2;
        currentWorkflow.updatedAt = new Date().toISOString();
        saveState(currentWorkflow);

        // === ユーザーレビュー（Annotateフェーズ）===
        // UIの有無に関わらず、detailsベースで質問を返す
        return {
          content: [{ type: "text", text: `## Plan作成完了（レビュー待ち - Annotateフェーズ）

Task: ${trimmedTask}
Execution Mode: 統一フロー（Research/Plan 実行後に annotate で停止）
Current Phase: annotate

\`\`\`markdown
${planContent}
\`\`\`

### 次のステップ（Annotateフェーズ）

1. plan.mdを確認: ${planPath}
2. 必要に応じて注釈を追加:
   - エディタでplan.mdを開く
   - 注釈形式: \`<!-- NOTE: 注釈内容 -->\` または \`[注釈]: 注釈内容\`
   - \`ul_workflow_annotate()\` で注釈を適用
3. レビュー完了後、承認して実装へ:
   - \`ul_workflow_approve()\` で実装フェーズへ進む
4. または計画を修正:
   - \`ul_workflow_modify_plan({ modifications: "修正内容" })\`
` }],
            details: {
              taskId,
              phase: "annotate",
              executionMode: "unified-flow",
              modeInput: mode,
              concurrencyHint: effectiveConcurrency,
              askUser: true,
              question: {
                question: "この計画で実行しますか？",
                header: "Plan確認",
                options: [
                  { label: "実行", description: "このまま実装を開始" },
                  { label: "修正", description: "修正内容を記述" }
                ],
                multiple: false,
                custom: true
              }
            }
        };

      } catch (error) {
        if (String(error).includes("subagent_run_dag APIが利用できません")) {
          return makeResult(`## UL Workflow開始

Task: ${trimmedTask}
ID: ${taskId}
Execution Mode: unified-flow (manual)

### 手順1: Research
\`\`\`
subagent_run_dag(${JSON.stringify(buildSingleAgentDagParams({
  subagentId: "researcher",
  task: `調査タスク: ${trimmedTask}\n\n保存先: ${researchPath}`,
  extraContext: "顧客要求として解釈し、必要なら web 検索で外部知識を集め、その後で research.md を作成してください。",
  ulTaskId: taskId,
}), null, 2)})
\`\`\`

### 手順2: Plan（Research完了後）
\`\`\`
subagent_run_dag(${JSON.stringify(buildSingleAgentDagParams({
  subagentId: "architect",
  task: `計画作成: ${trimmedTask}\n\n事前調査: ${researchPath}\n\n保存先: ${planPath}`,
  extraContext: "research.md の要求解釈をもとに、User Intent と Analyst Interpretation が分かる plan.md を作成してください。",
  ulTaskId: taskId,
}), null, 2)})
\`\`\`

### 手順3: Plan確認（Plan完了後）
\`\`\`
ul_workflow_confirm_plan()
\`\`\`
`, { taskId, phase: "research", nextPhase: "plan", executionMode: "unified-flow" });
        }
        return makeResult(`エラー: サブエージェント実行中にエラーが発生しました。\n\n${error}`, { error: "subagent_error", details: String(error) });
      }
    },
  });

  // ステータス表示ツール
  pi.registerTool({
    name: "ul_workflow_status",
    label: "UL Workflow Status",
    description: "現在のワークフローステータスを表示",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const workflow = getCurrentWorkflow();
      if (!workflow) {
        return makeResult(`エラー: アクティブなワークフローがありません。

新しいワークフローを開始するには:
  ul_workflow_start({ task: "タスク説明" })
`, { error: "no_active_workflow" });
      }

      const phaseDescriptions: Record<WorkflowPhase, string> = {
        idle: "待機中",
        research: "調査フェーズ - コードベースの深い理解",
        plan: "計画フェーズ - 詳細な実装計画の作成",
        annotate: "注釈フェーズ - ユーザーによる計画のレビューと修正",
        implement: "実装フェーズ - 計画に基づくコード実装",
        review: "レビューフェーズ - 実装の品質確認",
        completed: "完了",
        aborted: "中止",
      };

      const planAnnotations = workflow.phase === "annotate" || workflow.phase === "implement"
        ? extractAnnotations(readPlanFile(workflow.taskId))
        : [];

      const phasesDisplay = workflow.phases
        .map((p, i) => {
          const marker = i === workflow.phaseIndex ? ">" : " ";
          const check = workflow.approvedPhases.includes(p) ? "x" : " ";
          return `${marker} [${check}] ${p.toUpperCase()}`;
        })
        .join("\n");

      let text = `ワークフローステータス

Task ID: ${workflow.taskId}
説明: ${workflow.taskDescription}
作成日時: ${workflow.createdAt}
更新日時: ${workflow.updatedAt}
所有者: ${workflow.ownerInstanceId || "unknown"}

フェーズ構成:
${phasesDisplay}

現在のフェーズ: ${workflow.phase.toUpperCase()}
  ${phaseDescriptions[workflow.phase]}

承認済みフェーズ: ${workflow.approvedPhases.join(", ") || "なし"}
注釈数: ${planAnnotations.length}

ファイル:
  - task.md: .pi/ul-workflow/tasks/${workflow.taskId}/task.md
  - research.md: .pi/ul-workflow/tasks/${workflow.taskId}/research.md
  - plan.md: .pi/ul-workflow/tasks/${workflow.taskId}/plan.md
  - status.json: .pi/ul-workflow/tasks/${workflow.taskId}/status.json
`;

      if (planAnnotations.length > 0) {
        text += `\n注釈一覧:\n${planAnnotations.map((a, i) => `  ${i + 1}. ${a}`).join("\n")}\n`;
      }

      if (workflow.phase === "annotate") {
        text += `
次のステップ:
1. plan.md をエディタで開いて注釈を追加してください
   <!-- NOTE: 形式または [注釈]: 形式で記述 -->
2. ul_workflow_annotate で注釈を適用
3. 満足したら ul_workflow_approve で実装フェーズへ
`;
      }

      return makeResult(text, { taskId: workflow.taskId, phase: workflow.phase, phases: workflow.phases });
    },
  });

  // 承認ツール
  pi.registerTool({
    name: "ul_workflow_approve",
    label: "Approve UL Workflow Phase",
    description: "現在のフェーズを承認して次へ進む",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const currentWorkflow = getCurrentWorkflow();
      if (!currentWorkflow) {
        return makeResult("エラー: アクティブなワークフローがありません。", { error: "no_active_workflow" });
      }

      const ownership = checkOwnership(currentWorkflow);
      if (!ownership.owned) {
        return makeResult(`エラー: このワークフローは他のインスタンスが所有しています。\n所有者: ${currentWorkflow.ownerInstanceId}`, { error: ownership.error });
      }
      
      if (currentWorkflow.phase === "completed" || currentWorkflow.phase === "aborted") {
        return makeResult(`エラー: ワークフローは既に${currentWorkflow.phase === "completed" ? "完了" : "中止"}しています。`, { error: "workflow_finished" });
      }

      try {
        await assertPhaseArtifactReady(currentWorkflow.taskId, currentWorkflow.phase);
      } catch (error) {
        return makeResult(
          `エラー: 現在のフェーズ成果物がまだ準備できていません。\n\n${error}`,
          {
            error: "phase_artifact_not_ready",
            taskId: currentWorkflow.taskId,
            phase: currentWorkflow.phase,
          },
        );
      }
      
      const previousPhase = currentWorkflow.phase;

      currentWorkflow.approvedPhases.push(previousPhase);
      
      // ガード: planが承認されていない場合は実装フェーズに進めない
      if (previousPhase === "annotate" && !currentWorkflow.approvedPhases.includes("plan")) {
        // BEGIN FIX: BUG-002 ロールバック
        currentWorkflow.approvedPhases.pop();  // 追加したフェーズを削除
        // END FIX
        return makeResult("エラー: plan フェーズが承認されていません。先に plan.md を承認してください。", { error: "plan_not_approved" });
      }

      if (previousPhase === "review") {
        const verificationCwd = typeof (ctx as { cwd?: unknown })?.cwd === "string"
          ? String((ctx as { cwd: string }).cwd)
          : process.cwd();
        const verificationGateReason = getVerificationGateReason(verificationCwd);
        if (verificationGateReason) {
          currentWorkflow.approvedPhases.pop();
          return makeResult(
            `エラー: verify が未完了です。${verificationGateReason}`,
            { error: "verification_not_cleared", taskId: currentWorkflow.taskId, phase: previousPhase },
          );
        }
      }
      
      // BEGIN FIX: BUG-002 原子的状態更新
      // フェーズ進行前に状態を永続化
      currentWorkflow.updatedAt = new Date().toISOString();
      await saveStateAsync(currentWorkflow);

      const nextPhase = advancePhase(currentWorkflow);
      // END FIX
      
      let text = `フェーズ ${previousPhase.toUpperCase()} を承認しました。\n\n次のフェーズ: ${nextPhase.toUpperCase()}\n`;

      if (nextPhase === "plan") {
        text += `\n計画を作成するには:\n  ul_workflow_plan({ task: "${currentWorkflow.taskDescription}", task_id: "${currentWorkflow.taskId}" })\n`;
      } else if (nextPhase === "annotate") {
        text += `\nplan.md をエディタで開いて注釈を追加してください:\n  .pi/ul-workflow/tasks/${currentWorkflow.taskId}/plan.md\n\n注釈形式:\n  <!-- NOTE: ここに注釈を記述 -->\n  または\n  [注釈]: ここに注釈を記述\n`;
      } else if (nextPhase === "implement") {
        text += `\n実装を開始するには:\n  ul_workflow_execute_plan()\n`;
      } else if (nextPhase === "review") {
        text += `\nverify を完了してください:\n  workspace_verify()\n`;
        text += `\n必要なら ack まで完了後、次へ進みます:\n  ul_workflow_approve()\n`;
      } else if (nextPhase === "completed") {
        text += `\nワークフローが完了しました。\n\n`;
        text += `### 次のステップ: コミット\n\n`;
        text += `実装完了後、コミットを作成することを強く推奨します:\n\n`;
        text += `\`\`\`\n`;
        text += `ul_workflow_commit()\n`;
        text += `\`\`\`\n\n`;
        text += `または、git-workflowスキルに従って手動でコミット:\n\n`;
        text += `\`\`\`bash\n`;
        text += `# 1. 変更内容を確認\n`;
        text += `git status\n`;
        text += `git diff\n\n`;
        text += `# 2. ステージング（選択的 - git add . は禁止）\n`;
        text += `git add <変更したファイル>\n\n`;
        text += `# 3. コミット（日本語・Body必須）\n`;
        text += `git commit -m "feat: ${currentWorkflow.taskDescription.slice(0, 40)}..."\n`;
        text += `\`\`\`\n`;
      }

      // Sync to file
      saveState(currentWorkflow);

      // 完了後も成果物を保持する。commit 支援と事後確認で参照するため。
      if (nextPhase === "completed" || nextPhase === "aborted") {
        setCurrentWorkflow(null);
      } else {
        setCurrentWorkflow(currentWorkflow);
      }

      const responseDetails: Record<string, unknown> = {
        taskId: currentWorkflow.taskId,
        previousPhase,
        nextPhase
      };

      return makeResult(text, responseDetails);
    },
  });

  // 所有権強制取得ツール
  pi.registerTool({
    name: "ul_workflow_force_claim",
    label: "Force Claim Workflow",
    description: "終了した所有者のワークフローの所有権を強制的に現在のインスタンスに移す",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const currentWorkflow = getCurrentWorkflow();
      if (!currentWorkflow) {
        return makeResult("エラー: アクティブなワークフローがありません。", { error: "no_active_workflow" });
      }

      const instanceId = getInstanceId();

      // Check if already owned
      if (currentWorkflow.ownerInstanceId === instanceId) {
        return makeResult(`ワークフローは既に現在のインスタンスが所有しています。\n所有者: ${instanceId}`, { alreadyOwned: true });
      }

      const previousOwner = currentWorkflow.ownerInstanceId;
      const ownerPid = extractPidFromInstanceId(previousOwner);

      // Verify owner process is dead
      if (ownerPid && isProcessAlive(ownerPid)) {
        return makeResult(
          `エラー: 所有者のプロセスがまだ実行中です。\n` +
          `所有者: ${previousOwner}\n` +
          `所有者のPID: ${ownerPid}\n` +
          `現在のインスタンス: ${instanceId}\n\n` +
          `所有者が実行中の場合は、所有権を強制的に変更することはできません。`,
          { error: "owner_still_alive", ownerPid, previousOwner }
        );
      }

      // Force claim ownership
      const now = new Date().toISOString();

      // BUG FIX: Save state before in-memory mutation for consistency
      // Backup previous state in case saveState fails
      const previousOwnerInstanceId = currentWorkflow.ownerInstanceId;
      const previousUpdatedAt = currentWorkflow.updatedAt;

      try {
        currentWorkflow.ownerInstanceId = instanceId;
        currentWorkflow.updatedAt = now;
        saveState(currentWorkflow);
        setCurrentWorkflow(currentWorkflow);
      } catch (error) {
        // Rollback on failure
        currentWorkflow.ownerInstanceId = previousOwnerInstanceId;
        currentWorkflow.updatedAt = previousUpdatedAt;
        throw error;
      }

      let statusText = `所有権を強制的に変更しました。\n\n` +
        `以前の所有者: ${previousOwner}${ownerPid ? ` (PID: ${ownerPid})` : ""}\n` +
        `新しい所有者: ${instanceId}\n`;

      if (ownerPid && !isProcessAlive(ownerPid)) {
        statusText += `\n所有者のプロセス (PID: ${ownerPid}) は終了しています。\n`;
      }

      statusText += `\nTask ID: ${currentWorkflow.taskId}\n` +
        `現在のフェーズ: ${currentWorkflow.phase.toUpperCase()}\n\n` +
        `次のステップ:\n` +
        `  ul_workflow_approve で次のフェーズに進む\n` +
        `  または\n` +
        `  ul_workflow_status で詳細を確認`;

      return makeResult(statusText, {
        taskId: currentWorkflow.taskId,
        previousOwner,
        newOwner: instanceId,
        phase: currentWorkflow.phase,
        forceClaimed: true
      });
    },
  });

  // 注釈ツール
  pi.registerTool({
    name: "ul_workflow_annotate",
    label: "Annotate UL Workflow Plan",
    description: "plan.mdの注釈を検出・適用",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const currentWorkflow = getCurrentWorkflow();
      if (!currentWorkflow) {
        return makeResult("エラー: アクティブなワークフローがありません。", { error: "no_active_workflow" });
      }

      const ownership = checkOwnership(currentWorkflow);
      if (!ownership.owned) {
        return makeResult(`エラー: このワークフローは他のインスタンスが所有しています。`, { error: ownership.error });
      }
      
      if (currentWorkflow.phase !== "annotate" && currentWorkflow.phase !== "plan") {
        return makeResult(`エラー: 現在のフェーズ (${currentWorkflow.phase}) では注釈を追加できません。annotate フェーズで実行してください。`, { error: "wrong_phase" });
      }
      
      const planContent = readPlanFile(currentWorkflow.taskId);
      if (!planContent) {
        return makeResult("エラー: plan.md が見つかりません。先に plan フェーズを完了してください。", { error: "plan_not_found" });
      }
      
      const annotations = extractAnnotations(planContent);
      
      if (annotations.length === 0) {
        return makeResult(`注釈が見つかりません。

plan.md に注釈を追加してください:
  .pi/ul-workflow/tasks/${currentWorkflow.taskId}/plan.md

注釈形式:
  <!-- NOTE: ここに注釈を記述 -->
  または
  [注釈]: ここに注釈を記述

注釈を追加したら、再度 ul_workflow_annotate を実行してください。
`, { annotationCount: 0 });
      }
      
      currentWorkflow.annotationCount = annotations.length;
      currentWorkflow.updatedAt = new Date().toISOString();
      saveState(currentWorkflow);
      setCurrentWorkflow(currentWorkflow);
      
      return makeResult(`${annotations.length} 件の注釈を検出しました。

検出された注釈:
${annotations.map((a, i) => `  ${i + 1}. ${a}`).join("\n")}

次のステップ:
1. architect サブエージェントに plan.md の更新を依頼
   ul_workflow_plan({ task: "${currentWorkflow.taskDescription}", task_id: "${currentWorkflow.taskId}" })
2. 更新された plan.md を確認
3. 満足したら ul_workflow_approve で実装フェーズへ
`, { taskId: currentWorkflow.taskId, annotationCount: annotations.length });
    },
  });

  // Plan確認ツール（新規）
  pi.registerTool({
    name: "ul_workflow_confirm_plan",
    label: "Confirm Plan",
    description: "plan.mdを表示して実行の確認を求める",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const currentWorkflow = getCurrentWorkflow();
      if (!currentWorkflow) {
        return makeResult("エラー: アクティブなワークフローがありません。", { error: "no_active_workflow" });
      }

      const ownership = checkOwnership(currentWorkflow);
      if (!ownership.owned) {
        return makeResult(`エラー: このワークフローは他のインスタンスが所有しています。`, { error: ownership.error });
      }

      if (currentWorkflow.phase !== "plan") {
        return makeResult(`エラー: planフェーズではありません（現在: ${currentWorkflow.phase}）`, { error: "wrong_phase" });
      }

      const planPath = path.join(getTaskDir(currentWorkflow.taskId), "plan.md");
      let planContent = "";
      try {
        planContent = fs.readFileSync(planPath, "utf-8");
      } catch {
        return makeResult("エラー: plan.mdが見つかりません。先にplanフェーズを完了してください。", { error: "plan_not_found" });
      }

      const taskId = currentWorkflow.taskId;

      // detailsベースで質問を返す
      return {
        content: [{ type: "text", text: `## Plan確認

Task: ${currentWorkflow.taskDescription}

\`\`\`markdown
${planContent}
\`\`\`
` }],
        details: {
          taskId,
          phase: "plan",
          askUser: true,
          question: {
            question: "この計画で実行しますか？",
            header: "Plan確認",
            options: [
              { label: "実行", description: "このまま実装を開始" },
              { label: "修正", description: "修正内容を記述" }
            ],
            multiple: false,
            custom: true
          }
        }
      };
    },
  });

  // Plan実行ツール（新規）
  pi.registerTool({
    name: "ul_workflow_execute_plan",
    label: "Execute Plan",
    description: "plan.mdに基づいて実装フェーズを実行",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const currentWorkflow = getCurrentWorkflow();
      if (!currentWorkflow) {
        return makeResult("エラー: アクティブなワークフローがありません。", { error: "no_active_workflow" });
      }

      const ownership = checkOwnership(currentWorkflow);
      if (!ownership.owned) {
        return makeResult(`エラー: このワークフローは他のインスタンスが所有しています。`, { error: ownership.error });
      }

      if (currentWorkflow.phase !== "implement") {
        return makeResult(`エラー: implement フェーズではありません（現在: ${currentWorkflow.phase}）。先に ul_workflow_approve() で実装フェーズへ進んでください。`, { error: "wrong_phase" });
      }

      if (!currentWorkflow.approvedPhases.includes("plan")) {
        return makeResult("エラー: planフェーズが承認されていません。先にplan.mdを承認してください。", { error: "plan_not_approved" });
      }

      const taskId = currentWorkflow.taskId;
      const planPath = path.join(getTaskDir(taskId), "plan.md");
      const reviewPath = path.join(getTaskDir(taskId), "review.md");

      try {
        await ensureUlExecutionPlan(ctx, currentWorkflow, planPath);
        currentWorkflow.updatedAt = new Date().toISOString();
        saveState(currentWorkflow);
        setCurrentWorkflow(currentWorkflow);

        const implementRun = await executeImplementWorkflow(ctx, {
          task: currentWorkflow.taskDescription,
          taskId,
          planPath,
        });
        const reviewRun = await executeReviewWorkflow(ctx, {
          task: currentWorkflow.taskDescription,
          taskId,
          planPath,
          reviewPath,
        });
        await ensureWorkflowArtifact(reviewPath, extractTextFromToolResult(reviewRun.result));

        // 実装後は review フェーズへ進み、verify 完了を待つ
        currentWorkflow.approvedPhases.push("implement");
        currentWorkflow.phase = "review";
        currentWorkflow.phaseIndex = currentWorkflow.phases.indexOf("review");
        currentWorkflow.updatedAt = new Date().toISOString();
        saveState(currentWorkflow);
        setCurrentWorkflow(currentWorkflow);

        return makeResult(`## 実装完了

Task ID: ${taskId}

実装は完了しました。まだ verify が必要です。

### 次のステップ: Verify

以下を実行して verify を完了してください:

\`\`\`
workspace_verify()
\`\`\`

必要なら続けて:

\`\`\`
workspace_verify_ack()
workspace_verify_review()
workspace_verify_review_ack()
\`\`\`

verify 完了後:

\`\`\`
ul_workflow_approve()
\`\`\`
`, { taskId, phase: "review", suggestVerify: true, followupDecision: reviewRun.decision ?? implementRun.decision, reviewArtifactPath: reviewPath });
      } catch (error) {
        if (String(error).includes("subagent_run_dag APIが利用できません")) {
          const dagParams = buildDynamicImplementDagParams(currentWorkflow.taskDescription, planPath, taskId);
          return makeResult(`## 実装フェーズ開始

\`\`\`
subagent_run_dag(${JSON.stringify(dagParams, null, 2)})
\`\`\`

完了後: ul_workflow_commit() でコミット
`, { taskId, phase: "implement", requiresDagExecution: true, dynamicImplement: true });
        }
        return makeResult(`エラー: 実装フェーズ中にエラーが発生しました。\n\n${error}`, { error: "implement_error", details: String(error) });
      }
    },
  });

  // Plan修正ツール（新規）
  pi.registerTool({
    name: "ul_workflow_modify_plan",
    label: "Modify Plan",
    description: "plan.mdを修正する",
    parameters: Type.Object({
      modifications: Type.String({ description: "修正内容" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const currentWorkflow = getCurrentWorkflow();
      if (!currentWorkflow) {
        return makeResult("エラー: アクティブなワークフローがありません。", { error: "no_active_workflow" });
      }

      const ownership = checkOwnership(currentWorkflow);
      if (!ownership.owned) {
        return makeResult(`エラー: このワークフローは他のインスタンスが所有しています。`, { error: ownership.error });
      }

      if (currentWorkflow.phase !== "plan" && currentWorkflow.phase !== "annotate") {
        return makeResult(`エラー: plan / annotate フェーズではありません（現在: ${currentWorkflow.phase}）`, { error: "wrong_phase" });
      }

      const { modifications } = params;
      const trimmedModifications = String(modifications || "").trim();

      if (!trimmedModifications) {
        return makeResult("エラー: 修正内容を入力してください。", { error: "empty_modifications" });
      }

      const taskId = currentWorkflow.taskId;
      const planPath = path.join(getTaskDir(taskId), "plan.md");

      currentWorkflow.annotationCount++;
      currentWorkflow.updatedAt = new Date().toISOString();
      saveState(currentWorkflow);
      setCurrentWorkflow(currentWorkflow);

      try {
        const planRun = await revisePlanWorkflow(ctx, {
          task: currentWorkflow.taskDescription,
          taskId,
          researchPath: path.join(getTaskDir(taskId), "research.md"),
          planPath,
          modifications: trimmedModifications,
        });

        const planContent = readPlanFile(taskId);

        // detailsベースで質問を返す
        return {
          content: [{ type: "text", text: `## Plan修正完了

修正: ${trimmedModifications}

\`\`\`markdown
${planContent}
\`\`\`
` }],
            details: {
              taskId,
              phase: currentWorkflow.phase,
              autoExecute: true,
              followupDecision: planRun.decision,
              askUser: true,
              question: {
                question: "この計画で実行しますか？",
                header: "Plan確認",
                options: [
                  { label: "実行", description: "このまま実装を開始" },
                  { label: "修正", description: "追加の修正内容を記述" }
                ],
                multiple: false,
                custom: true
              }
            }
        };
      } catch (error) {
        if (String(error).includes("subagent_run_dag APIが利用できません")) {
          const researchPath = path.join(getTaskDir(taskId), "research.md");
          const dagParams = buildDynamicPlanDagParams(
            `${currentWorkflow.taskDescription}\n\n修正要求:\n${trimmedModifications}`,
            researchPath,
            planPath,
            taskId,
          );
          return makeResult(`## Plan修正

\`\`\`
subagent_run_dag(${JSON.stringify(dagParams, null, 2)})
\`\`\`

修正後: \`ul_workflow_confirm_plan()\` で確認
`, { taskId, modificationCount: currentWorkflow.annotationCount, requiresDagExecution: true, dynamicPlan: true });
        }
        return makeResult(`エラー: plan修正中にエラーが発生しました。\n\n${error}`, { error: "modify_error", details: String(error) });
      }
    },
  });

  // 中止ツール
  pi.registerTool({
    name: "ul_workflow_abort",
    label: "Abort UL Workflow",
    description: "ワークフローを中止",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const currentWorkflow = getCurrentWorkflow();
      if (!currentWorkflow) {
        return makeResult("エラー: アクティブなワークフローがありません。", { error: "no_active_workflow" });
      }

      const ownership = checkOwnership(currentWorkflow);
      if (!ownership.owned) {
        return makeResult(`エラー: このワークフローは他のインスタンスが所有しています。`, { error: ownership.error });
      }
      
      const taskId = currentWorkflow.taskId;
      currentWorkflow.phase = "aborted";
      currentWorkflow.updatedAt = new Date().toISOString();
      saveState(currentWorkflow);
      setCurrentWorkflow(null);  // Clear active registry
      
      return makeResult(`ワークフローを中止しました。

Task ID: ${taskId}
状態: aborted

ファイルは保持されています:
  .pi/ul-workflow/tasks/${taskId}/

再開するには:
  ul_workflow_resume({ task_id: "${taskId}" })
`, { taskId, phase: "aborted" });
    },
  });

  // 再開ツール
  pi.registerTool({
    name: "ul_workflow_resume",
    label: "Resume UL Workflow",
    description: "中止したワークフローを再開",
    parameters: Type.Object({
      task_id: Type.String({ description: "再開するタスクID" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { task_id } = params;
      const instanceId = getInstanceId();

      // Check for existing active workflow using file-based access
      const existingWorkflow = getCurrentWorkflow();
      if (existingWorkflow && existingWorkflow.phase !== "completed" && existingWorkflow.phase !== "aborted") {
        return makeResult(`エラー: すでにアクティブなワークフローがあります (taskId: ${existingWorkflow.taskId})`, { error: "workflow_already_active" });
      }
      
      const state = loadState(task_id);
      if (!state) {
        return makeResult(`エラー: タスク ${task_id} が見つかりません。`, { error: "task_not_found" });
      }

      // 所有権チェック: 所有者が生存中の場合は再開を拒否
      const ownership = checkOwnership(state, { autoClaim: true });
      if (!ownership.owned) {
        const ownerPid = extractPidFromInstanceId(state.ownerInstanceId);
        if (ownerPid && isProcessAlive(ownerPid)) {
          return makeResult(
            `エラー: ワークフローは別のインスタンス (${state.ownerInstanceId}) が所有しています。所有者が終了した場合は ul_workflow_force_claim を使用してください。`,
            { error: "workflow_owned_by_other", ownerInstanceId: state.ownerInstanceId, ownerPid }
          );
        }
      }
      
      // 所有権を現在のインスタンスに更新
      if (ownership.autoClaim) {
        // 死んだプロセスから自動取得
      }
      state.ownerInstanceId = instanceId;
      state.updatedAt = new Date().toISOString();
      saveState(state);
      setCurrentWorkflow(state);
      
      return makeResult(`ワークフローを再開しました。

Task ID: ${state.taskId}
フェーズ: ${state.phase.toUpperCase()}
承認済み: ${state.approvedPhases.join(", ") || "なし"}

次のステップ:
  ul_workflow_status で詳細を確認
`, { taskId: state.taskId, phase: state.phase });
    },
  });

  // 研究実行ツール（サブエージェント委任のヘルパー）
  pi.registerTool({
    name: "ul_workflow_research",
    label: "Execute UL Workflow Research Phase",
    description: "研究フェーズを実行し、research.md を生成する",
    parameters: Type.Object({
      task: Type.String({ description: "調査するタスク" }),
      task_id: Type.Optional(Type.String({ description: "タスクID（省略時は現在のワークフローを使用）" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const workflow = getCurrentWorkflow();
      const taskId = params.task_id || workflow?.taskId;
      if (!taskId) {
        return makeResult("エラー: task_id が指定されていません。", { error: "no_task_id" });
      }

      // 所有権チェック
      const state = loadState(taskId);
      if (state) {
        const ownership = checkOwnership(state, { autoClaim: false });
        if (!ownership.owned) {
          const ownerPid = extractPidFromInstanceId(state.ownerInstanceId);
          if (ownerPid && isProcessAlive(ownerPid)) {
            return makeResult(
              `エラー: ワークフローは別のインスタンス (${state.ownerInstanceId}) が所有しています。`,
              { error: "workflow_owned_by_other", ownerInstanceId: state.ownerInstanceId, ownerPid }
            );
          }
        }
      }

      const researchPath = path.join(getTaskDir(taskId), "research.md");
      const instruction = generateResearchInstruction(params.task, researchPath, taskId);

      try {
        const researchRun = await executeResearchWorkflow(ctx, {
          task: params.task,
          taskId,
          researchPath,
          instruction,
        });
        const artifact = await ensureWorkflowArtifact(
          researchPath,
          extractTextFromToolResult(researchRun.followupResult),
        );

        if (state) {
          state.updatedAt = new Date().toISOString();
          saveState(state);
          setCurrentWorkflow(state);
        }

        return makeResult(`Researchフェーズ完了

Task ID: ${taskId}
成果物: ${researchPath}
保存: ${artifact.created ? "subagent出力から保存" : "既存ファイルを確認"}

次のステップ:
  ul_workflow_approve() で plan フェーズへ進んでください
`, {
            taskId,
            phase: "research",
            artifactPath: researchPath,
            artifactCreated: artifact.created,
            followupDecision: researchRun.decision,
          });
      } catch (error) {
        if (String(error).includes("subagent_run_dag APIが利用できません")) {
          const dynamicDagParams = buildDynamicResearchDagParams(params.task, researchPath, taskId);
          return makeResult(`研究フェーズの実行指示

Task ID: ${taskId}
タスク: ${params.task}

\`\`\`
subagent_run_dag(${JSON.stringify(dynamicDagParams, null, 2)})
\`\`\`

単一の dynamic research DAG として実行してください。
最後に ${researchPath} が生成されていることを確認し、ul_workflow_approve() で次に進んでください。
`, { taskId, phase: "research", artifactPath: researchPath, requiresDagExecution: true, dynamicResearch: true });
        }

        return makeResult(`エラー: research フェーズの実行に失敗しました。\n\n${error}`, {
          error: "research_error",
          details: String(error),
          taskId,
        });
      }
    },
  });

  pi.registerTool({
    name: "ul_workflow_review",
    label: "Execute UL Workflow Review Preparation Phase",
    description: "review フェーズの準備を実行し、review.md を生成する",
    parameters: Type.Object({
      task: Type.Optional(Type.String({ description: "レビュー対象タスク" })),
      task_id: Type.Optional(Type.String({ description: "タスクID（省略時は現在のワークフローを使用）" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const workflow = getCurrentWorkflow();
      const taskId = params.task_id || workflow?.taskId;
      if (!taskId) {
        return makeResult("エラー: task_id が指定されていません。", { error: "no_task_id" });
      }

      const state = loadState(taskId);
      if (!state) {
        return makeResult("エラー: タスクが見つかりません。", { error: "task_not_found", taskId });
      }

      const ownership = checkOwnership(state, { autoClaim: false });
      if (!ownership.owned) {
        return makeResult(`エラー: このワークフローは他のインスタンスが所有しています。`, { error: ownership.error });
      }

      const taskDescription = String(params.task || state.taskDescription);
      const planPath = path.join(getTaskDir(taskId), "plan.md");
      const reviewPath = path.join(getTaskDir(taskId), "review.md");

      try {
        const reviewRun = await executeReviewWorkflow(ctx, {
          task: taskDescription,
          taskId,
          planPath,
          reviewPath,
        });
        const artifact = await ensureWorkflowArtifact(
          reviewPath,
          extractTextFromToolResult(reviewRun.result),
        );

        state.phase = "review";
        state.phaseIndex = state.phases.indexOf("review");
        state.updatedAt = new Date().toISOString();
        saveState(state);
        setCurrentWorkflow(state);

        return makeResult(`Review準備フェーズ完了

Task ID: ${taskId}
成果物: ${reviewPath}
保存: ${artifact.created ? "subagent出力から保存" : "既存ファイルを確認"}

次のステップ:
  workspace_verify() を実行してください
`, {
          taskId,
          phase: "review",
          artifactPath: reviewPath,
          artifactCreated: artifact.created,
          followupDecision: reviewRun.decision,
          suggestVerify: true,
        });
      } catch (error) {
        if (String(error).includes("subagent_run_dag APIが利用できません")) {
          const dagParams = buildDynamicReviewDagParams(taskDescription, planPath, reviewPath, taskId);
          return makeResult(`レビューフェーズ準備の実行指示

Task ID: ${taskId}
タスク: ${taskDescription}

\`\`\`
subagent_run_dag(${JSON.stringify(dagParams, null, 2)})
\`\`\`

最後に ${reviewPath} が生成されていることを確認し、workspace_verify() に進んでください。
`, { taskId, phase: "review", artifactPath: reviewPath, requiresDagExecution: true, dynamicReview: true });
        }

        return makeResult(`エラー: review フェーズの実行に失敗しました。\n\n${error}`, {
          error: "review_error",
          details: String(error),
          taskId,
        });
      }
    },
  });

  // 計画作成ツール（サブエージェント委任のヘルパー）
  pi.registerTool({
    name: "ul_workflow_plan",
    label: "Execute UL Workflow Plan Phase",
    description: "計画フェーズを実行し、plan.md を生成する",
    parameters: Type.Object({
      task: Type.String({ description: "計画するタスク" }),
      task_id: Type.Optional(Type.String({ description: "タスクID（省略時は現在のワークフローを使用）" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const workflow = getCurrentWorkflow();
      const taskId = params.task_id || workflow?.taskId;
      if (!taskId) {
        return makeResult("エラー: task_id が指定されていません。", { error: "no_task_id" });
      }

      if (workflow) {
        const ownership = checkOwnership(workflow);
        if (!ownership.owned) {
          return makeResult(`エラー: このワークフローは他のインスタンスが所有しています。`, { error: ownership.error });
        }
        workflow.phase = "plan";
        workflow.phaseIndex = 1;
        workflow.approvedPhases.push("research");
        workflow.updatedAt = new Date().toISOString();
        saveState(workflow);
        setCurrentWorkflow(workflow);
      }

      const researchPath = path.join(getTaskDir(taskId), "research.md");
      const planPath = path.join(getTaskDir(taskId), "plan.md");
      const state = loadState(taskId);
      const instruction = generatePlanInstruction(params.task, researchPath, planPath, taskId);

      try {
        const planRun = await executePlanWorkflow(ctx, {
          task: params.task,
          taskId,
          researchPath,
          planPath,
          instruction,
        });
        const artifact = await ensureWorkflowArtifact(
          planPath,
          extractTextFromToolResult(planRun.result),
        );

        if (state) {
          state.phase = "plan";
          state.phaseIndex = 1;
          if (!state.approvedPhases.includes("research")) {
            state.approvedPhases.push("research");
          }
          state.updatedAt = new Date().toISOString();
          saveState(state);
          setCurrentWorkflow(state);
        }

        return makeResultWithQuestion(`Planフェーズ完了

Task ID: ${taskId}
成果物: ${planPath}
保存: ${artifact.created ? "subagent出力から保存" : "既存ファイルを確認"}

次のステップ:
  question の承認後に ul_workflow_approve() を実行し、その後 ul_workflow_execute_plan() で実装へ進んでください
`, {
            question: "plan.md を確認してください。この計画で実装を続行しますか？ 修正したい場合は Type something. を選んで修正内容を書いてください。",
            header: "Plan確認",
            options: [
              { label: "承認して続行", description: "Implement と Commit まで進む" },
              { label: "中止", description: "今回は進めない" },
            ],
          }, {
            taskId,
            phase: "plan",
            artifactPath: planPath,
            artifactCreated: artifact.created,
            followupDecision: planRun.decision,
          });
      } catch (error) {
        if (String(error).includes("subagent_run_dag APIが利用できません")) {
          const dagParams = buildDynamicPlanDagParams(params.task, researchPath, planPath, taskId);
          return makeResult(`計画フェーズの実行指示

Task ID: ${taskId}
タスク: ${params.task}

\`\`\`
subagent_run_dag(${JSON.stringify(dagParams, null, 2)})
\`\`\`

完了後は ${planPath} を確認し、question ツールで承認を取ってください。
`, { taskId, phase: "plan", artifactPath: planPath, requiresDagExecution: true, dynamicPlan: true });
        }

        return makeResult(`エラー: plan フェーズの実行に失敗しました。\n\n${error}`, {
          error: "plan_error",
          details: String(error),
          taskId,
        });
      }
    },
  });

  // コミット提案ツール（実装完了後のコミット支援）
  pi.registerTool({
    name: "ul_workflow_commit",
    label: "Commit UL Workflow Changes",
    description: "実装完了後のコミットを提案・実行する。git-workflowスキルの統合コミットパターンを使用。",
    parameters: Type.Object({
      commit_message: Type.Optional(Type.String({ description: "コミットメッセージ（省略時は自動生成）" })),
      files: Type.Optional(Type.Array(Type.String(), { description: "ステージングするファイル（省略時は変更済みファイルを自動検出）" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const workflow = getCurrentWorkflow() ?? findLatestWorkflowForInstance({ includeCompleted: true });
      if (!workflow) {
        return makeResult("エラー: アクティブなワークフローがありません。", { error: "no_active_workflow" });
      }

      const ownership = checkOwnership(workflow, { autoClaim: false });
      if (!ownership.owned) {
        return makeResult(`エラー: このワークフローは他のインスタンスが所有しています。`, { error: ownership.error });
      }

      // 現在のフェーズのアーティファクトが準備できていることを確認
      // plan.md (implementフェーズ以降) / review.md (reviewフェーズ) が存在する必要がある
      try {
        await assertPhaseArtifactReady(workflow.taskId, workflow.phase);
      } catch (error) {
        return makeResult(
          `エラー: 現在のフェーズ成果物がまだ準備できていません。\n\n${error}`,
          {
            error: "phase_artifact_not_ready",
            taskId: workflow.taskId,
            phase: workflow.phase,
          },
        );
      }

      // git-workflowスキルは workspace ごとに配置揺れがあるため、
      // 2つの候補パスを案内する。
      const skillPaths = [
        ".pi/skills/git-workflow/SKILL.md",
        ".pi/lib/skills/git-workflow/SKILL.md",
      ];

      // 変更内容を確認するための指示を生成
      const taskId = workflow.taskId;
      const planPath = path.join(getTaskDir(taskId), "plan.md");
      const taskDesc = workflow.taskDescription;

      // コミットメッセージの自動生成（簡易版）
      let suggestedMessage = params.commit_message;
      if (!suggestedMessage) {
        // タスク説明からコミットメッセージを推測
        const lowerTask = taskDesc.toLowerCase();
        let type = "feat";
        if (lowerTask.includes("fix") || lowerTask.includes("修正") || lowerTask.includes("バグ")) {
          type = "fix";
        } else if (lowerTask.includes("refactor") || lowerTask.includes("リファクタ")) {
          type = "refactor";
        } else if (lowerTask.includes("test") || lowerTask.includes("テスト")) {
          type = "test";
        } else if (lowerTask.includes("doc") || lowerTask.includes("ドキュメント")) {
          type = "docs";
        }
        suggestedMessage = `${type}: ${taskDesc.slice(0, 50)}${taskDesc.length > 50 ? "..." : ""}`;
      }

      // detailsベースでユーザーに確認
      return {
        content: [{ type: "text", text: `## コミット提案

Task: ${taskDesc}
Suggested Message: ${suggestedMessage}

### 実行手順

\`\`\`bash
# 1. 変更内容を確認
git status
git diff

# 2. ステージング（選択的 - 自分が編集したファイルのみ）
git add <変更したファイル>

# 3. コミット（日本語・Body必須）
git commit -m "${suggestedMessage.replace(/"/g, '\\"')}" -m "
## 背景
${taskDesc}

## 変更内容
plan.mdに基づく実装

## テスト方法
動作確認済み
"
\`\`\`

**重要**:
- \`git add .\`や\`git add -A\`は使用しないでください
- コミットメッセージは日本語で書いてください
- Body（本文）を含めてください

詳細はgit-workflowスキルを参照:
- ${skillPaths[0]}
- ${skillPaths[1]}
- 両方なければ、この workspace にはスキル未配置です
` }],
        details: {
          taskId,
          phase: workflow.phase,
          suggestCommit: true,
          suggestedMessage,
          askUser: true,
          question: {
            question: `以下の内容でコミットしますか？\n\n【コミットメッセージ】\n${suggestedMessage}\n\n【変更内容】\n${taskDesc}\n\n【plan.md】\n${planPath}`,
            header: "Git Commit",
            options: [
              { label: "Commit", description: "ステージング + コミットを実行" },
              { label: "Edit", description: "メッセージを編集" },
              { label: "Skip", description: "コミットせずに完了" }
            ],
            multiple: false,
            custom: true
          }
        }
      };
    },
  });

  // スラッシュコマンド
  pi.registerCommand("ul-workflow-start", {
    description: "UL Workflow Modeを開始（従来のスタイル）",
    handler: async (args, ctx) => {
      const task = args.trim();
      const instanceId = getInstanceId();
      if (!task) {
        ctx.ui.notify("タスク説明を入力してください: /ul-workflow-start <task>", "warning");
        return;
      }

      const existingWorkflow = getCurrentWorkflow();
      if (existingWorkflow && existingWorkflow.phase !== "completed" && existingWorkflow.phase !== "aborted") {
        ctx.ui.notify(`エラー: すでにアクティブなワークフローがあります (taskId: ${existingWorkflow.taskId})`, "warning");
        return;
      }

      const taskId = generateTaskId(task);
      const now = new Date().toISOString();

      // 統一フローを使用
      const phases = [...UNIFIED_PHASES];

      const workflow: WorkflowState = {
        taskId,
        taskDescription: task,
        phase: phases[0],
        phases,
        phaseIndex: 0,
        createdAt: now,
        updatedAt: now,
        approvedPhases: [],
        annotationCount: 0,
        ownerInstanceId: instanceId,
      };

      createTaskFile(taskId, task);
      saveState(workflow);
      setCurrentWorkflow(workflow);

      const phaseStr = phases.map((p) => p.toUpperCase()).join(" -> ");
      ctx.ui.notify(`ワークフロー開始: ${taskId}\nフェーズ: ${phaseStr}`, "info");
    },
  });

  pi.registerCommand("ul-workflow-run", {
    description: "UL Workflowを実行（推奨: Research-Plan-Implement自動）",
    handler: async (args, ctx) => {
      const task = args.trim();
      if (!task) {
        ctx.ui.notify("タスク説明を入力してください: /ul-workflow-run <task>", "warning");
        return;
      }

      const existingWorkflow = getCurrentWorkflow();
      if (existingWorkflow && existingWorkflow.phase !== "completed" && existingWorkflow.phase !== "aborted") {
        ctx.ui.notify(`エラー: すでにアクティブなワークフローがあります (taskId: ${existingWorkflow.taskId})\nまず /ul-workflow-abort で中止してください`, "warning");
        return;
      }

      ctx.ui.notify("ul_workflow_runツールを呼び出してください:\n\nul_workflow_run({ task: \"<task>\" })", "info");
    },
  });

  pi.registerCommand("ul-workflow-status", {
    description: "ワークフローのステータスを表示",
    handler: async (_args, ctx) => {
      const workflow = getCurrentWorkflow();
      if (!workflow) {
        ctx.ui.notify("アクティブなワークフローはありません", "info");
        return;
      }
      const phaseStr = workflow.phases
        .map((p, i) => (i === workflow.phaseIndex ? `[${p.toUpperCase()}]` : p.toUpperCase()))
        .join(" -> ");
      const instanceId = getInstanceId();
      const ownershipStatus = workflow.ownerInstanceId === instanceId ? "所有中" : `所有者: ${workflow.ownerInstanceId}`;
      ctx.ui.notify(`Task: ${workflow.taskId}\nPhases: ${phaseStr}\nApproved: ${workflow.approvedPhases.join(", ") || "none"}\n${ownershipStatus}`, "info");
    },
  });

  pi.registerCommand("ul-workflow-approve", {
    description: "現在のフェーズを承認",
    handler: async (_args, ctx) => {
      const workflow = getCurrentWorkflow();
      if (!workflow) {
        ctx.ui.notify("エラー: アクティブなワークフローがありません", "warning");
        return;
      }

      // 所有権チェック
      const ownership = checkOwnership(workflow);
      if (!ownership.owned) {
        ctx.ui.notify(`エラー: このワークフローは他のインスタンスが所有しています (${workflow.ownerInstanceId})`, "warning");
        return;
      }

      if (workflow.phase === "completed" || workflow.phase === "aborted") {
        ctx.ui.notify(`エラー: ワークフローは既に${workflow.phase === "completed" ? "完了" : "中止"}しています`, "warning");
        return;
      }

      const previousPhase = workflow.phase;

      // BUG FIX: planが承認されていない場合は実装フェーズに進めない
      if (previousPhase === "annotate" && !workflow.approvedPhases.includes("plan")) {
        ctx.ui.notify("エラー: planフェーズが承認されていません。先にplan.mdを承認してください。", "warning");
        return;
      }

      workflow.approvedPhases.push(previousPhase);

      // BEGIN FIX: BUG-002 原子的状態更新
      // フェーズ進行前に状態を永続化
      saveState(workflow);
      const nextPhase = advancePhase(workflow);
      // END FIX

      setCurrentWorkflow(workflow);

      ctx.ui.notify(`${previousPhase.toUpperCase()} 承認 → ${nextPhase.toUpperCase()}`, "info");
    },
  });

  pi.registerCommand("ul-workflow-annotate", {
    description: "plan.mdの注釈を適用",
    handler: async (_args, ctx) => {
      const workflow = getCurrentWorkflow();
      if (!workflow) {
        ctx.ui.notify("エラー: アクティブなワークフローがありません", "warning");
        return;
      }

      // 所有権チェック
      const ownership = checkOwnership(workflow);
      if (!ownership.owned) {
        ctx.ui.notify(`エラー: このワークフローは他のインスタンスが所有しています (${workflow.ownerInstanceId})`, "warning");
        return;
      }

      // フェーズチェック
      if (workflow.phase !== "annotate" && workflow.phase !== "plan") {
        ctx.ui.notify(`エラー: annotate/planフェーズではありません（現在: ${workflow.phase}）`, "warning");
        return;
      }

      const planContent = readPlanFile(workflow.taskId);
      if (!planContent) {
        ctx.ui.notify("エラー: plan.md が見つかりません", "warning");
        return;
      }

      const annotations = extractAnnotations(planContent);
      workflow.annotationCount = annotations.length;
      workflow.updatedAt = new Date().toISOString();
      saveState(workflow);
      setCurrentWorkflow(workflow);

      ctx.ui.notify(`${annotations.length} 件の注釈を検出`, "info");
    },
  });

  pi.registerCommand("ul-workflow-abort", {
    description: "ワークフローを中止",
    handler: async (_args, ctx) => {
      const workflow = getCurrentWorkflow();
      if (!workflow) {
        ctx.ui.notify("エラー: アクティブなワークフローがありません", "warning");
        return;
      }

      // 所有権チェック
      const ownership = checkOwnership(workflow);
      if (!ownership.owned) {
        ctx.ui.notify(`エラー: このワークフローは他のインスタンスが所有しています (${workflow.ownerInstanceId})`, "warning");
        return;
      }

      const taskId = workflow.taskId;
      workflow.phase = "aborted";
      workflow.updatedAt = new Date().toISOString();
      saveState(workflow);
      setCurrentWorkflow(null);

      ctx.ui.notify(`ワークフロー中止: ${taskId}`, "info");
    },
  });
}
