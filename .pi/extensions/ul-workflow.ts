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
}

// Active workflow registry for cross-instance coordination
interface ActiveWorkflowRegistry {
  activeTaskId: string | null;
  ownerInstanceId: string | null;
  updatedAt: string;
}

// ディレクトリパス
const WORKFLOW_DIR = ".pi/ul-workflow";
const TASKS_DIR = path.join(WORKFLOW_DIR, "tasks");
const TEMPLATES_DIR = path.join(WORKFLOW_DIR, "templates");
const ACTIVE_FILE = path.join(WORKFLOW_DIR, "active.json");

// Generate unique instance ID matching cross-instance coordinator format
/**
 * インスタンスIDを取得
 * @summary ID取得
 * @returns インスタンスID文字列
 */
export function getInstanceId(): string {
  return `${process.env.PI_SESSION_ID || "default"}-${process.pid}`;
}

// File-based workflow access (replaces memory variable)
function getCurrentWorkflow(): WorkflowState | null {
  try {
    if (!fs.existsSync(ACTIVE_FILE)) return null;
    const raw = readFileSync(ACTIVE_FILE, "utf-8");
    const registry: ActiveWorkflowRegistry = JSON.parse(raw);
    if (!registry.activeTaskId) return null;
    return loadState(registry.activeTaskId);
  } catch {
    return null;
  }
}

function setCurrentWorkflow(state: WorkflowState | null): void {
  if (!fs.existsSync(WORKFLOW_DIR)) {
    fs.mkdirSync(WORKFLOW_DIR, { recursive: true });
  }

  const registry: ActiveWorkflowRegistry = state ? {
    activeTaskId: state.taskId,
    ownerInstanceId: state.ownerInstanceId,
    updatedAt: new Date().toISOString(),
  } : {
    activeTaskId: null,
    ownerInstanceId: null,
    updatedAt: new Date().toISOString(),
  };

  atomicWriteTextFile(ACTIVE_FILE, JSON.stringify(registry, null, 2));
}

/**
 * プロセスが生存しているかどうかを確認する
 * @summary プロセス生存確認
 * @param pid - プロセスID
 * @returns プロセスが生存している場合true
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * インスタンスIDからPIDを抽出する
 * @summary PID抽出
 * @param instanceId - インスタンスID（例: "default-34147"）
 * @returns プロセスID（抽出できない場合はnull）
 */
export function extractPidFromInstanceId(instanceId: string): number | null {
  const match = instanceId.match(/-(\d+)$/);
  if (!match) return null;
  const pid = Number(match[1]);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

/**
 * コンテキストからrunSubagentを安全に取得する
 * @summary runSubagent取得
 * @param ctx - 拡張コンテキスト
 * @returns runSubagent関数、または undefined
 */
function getRunSubagent(ctx: unknown): ((options: {
  subagentId: string;
  task: string;
  extraContext?: string;
}) => Promise<AgentToolResult<unknown>>) | undefined {
  const anyCtx = ctx as {
    runSubagent?: (options: {
      subagentId: string;
      task: string;
      extraContext?: string;
    }) => Promise<AgentToolResult<unknown>>;
  };
  return anyCtx.runSubagent;
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
  const runSubagent = getRunSubagent(ctx);
  if (!runSubagent) {
    throw new Error("runSubagent APIが利用できません");
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
    runSubagent(options),
    timeoutPromise
  ]);
}

/**
 * 以前の所有者のプロセスが終了しているかどうかを確認する
 * @summary 古い所有者の終了確認
 * @param ownerInstanceId - 所有者のインスタンスID
 * @returns プロセスが終了している場合true
 */
function isOwnerProcessDead(ownerInstanceId: string): boolean {
  const pid = extractPidFromInstanceId(ownerInstanceId);
  if (!pid) return false;
  return !isProcessAlive(pid);
}

/**
 * 所有権チェック結果
 */
interface OwnershipResult {
  owned: boolean;
  error?: string;
  autoClaim?: boolean;
  previousOwner?: string;
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

// 現在のワークフロー状態（セッション内）- DEPRECATED: Use getCurrentWorkflow()
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
  return `subagent_run({ subagentId: "${subagentId}", task: "${task.replace(/"/g, '\\"')}" }) → ${outputPath}`;
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
    task: `以下のタスクについてコードベースを徹底的に調査し、research.mdを作成してください。

タスク: ${task}

保存先: ${researchPath}

調査要件:
- 対象フォルダの内容を詳細に理解する
- 仕組み、機能、すべての仕様を深く理解する
- 関連するファイルパスを明記する
- 依存関係を分析する

強調すべき点:
- 「深く」「詳細にわたって」「複雑な部分まで」「すべてを徹底的に」調査する
- 表面的な読み取りでは不十分です
- 関数のシグネチャレベルではなく、実際の動作を理解してください

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
    extraContext: `research.md は ${researchPath} に保存してください。永続的な成果物です。単なる要約ではなく、後で参照できる詳細なドキュメントを作成してください。高リスク判定は必ず含めてください。`,
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
    extraContext: "plan.md はユーザーのレビュー対象です。後で注釈が追加されることを想定して構造化してください。",
  };
}

/**
 * WorkflowRunResult - ul_workflow_runの実行結果
 */
interface WorkflowRunResult {
  taskId: string;
  phase: WorkflowPhase;
  planContent?: string;
  needsConfirmation: boolean;
  nextAction?: {
    tool: string;
    description: string;
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
function saveState(state: WorkflowState): void {
  const taskDir = getTaskDir(state.taskId);
  const statusPath = path.join(taskDir, "status.json");

  withFileLock(statusPath, () => {
    if (!fs.existsSync(taskDir)) {
      fs.mkdirSync(taskDir, { recursive: true });
    }
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
  const taskDir = getTaskDir(state.taskId);
  const statusPath = path.join(taskDir, "status.json");

  await fsPromises.mkdir(taskDir, { recursive: true });
  await fsPromises.writeFile(statusPath, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * 状態を読み込む
 */
export function loadState(taskId: string): WorkflowState | null {
  const statusPath = path.join(getTaskDir(taskId), "status.json");
  try {
    const content = fs.readFileSync(statusPath, "utf-8");
    return JSON.parse(content);
  } catch {
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
  } catch {
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
  } catch {
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
 * 拡張機能を登録
 * @summary UL Workflow拡張を登録
 * @param pi - 拡張機能APIインターフェース
 * @returns なし
 */
export default function registerUlWorkflowExtension(pi: ExtensionAPI) {
  
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
1. researcher サブエージェントが調査を実行します
2. 調査結果は .pi/ul-workflow/tasks/${taskId}/research.md に保存されます
3. 調査が完了したら ul_workflow_approve で次のフェーズへ進みます

調査を実行するには:
  ul_workflow_research({ task: "${task}", task_id: "${taskId}" })
`, { taskId, phase: phases[0], phases });
    },
  });

  // 統合ワンフロー実行ツール
  // ul_workflow_run と ul_workflow_dag を統合し、複雑度判定で自動選択
  pi.registerTool({
    name: "ul_workflow_run",
    label: "Run UL Workflow",
    description: "Research-Plan-Implementを自動実行。複雑度に応じてシーケンシャルまたはDAG並列実行を自動選択。plan確認のみインタラクティブ。",
    parameters: Type.Object({
      task: Type.String({ description: "実行するタスク" }),
      mode: Type.Optional(Type.Union([
        Type.Literal("auto"),
        Type.Literal("sequential"),
        Type.Literal("parallel")
      ], { description: "実行モード: auto=自動選択（デフォルト）, sequential=逐次実行, parallel=DAG並列実行" })),
      maxConcurrency: Type.Optional(Type.Number({ description: "並列実行時の最大並列数（デフォルト: 3）" })),
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

      // 統一フロー: 常にDAG並列実行
      const useDag = UNIFIED_EXECUTION_CONFIG.useDag;
      const effectiveConcurrency = maxConcurrency; // パラメータから取得（デフォルト3）
      const phases: WorkflowPhase[] = [...UNIFIED_PHASES];
      
      console.log(`[ul_workflow_run] Mode: ${mode}, Execution: unified-flow, DAG: ${useDag}, Concurrency: ${effectiveConcurrency}`);

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
      if ((ctx as any).runSubagent) {
        try {
          // === PHASE 1: Research（逐次）===
          console.log(`[ul_workflow_run] Phase 1: Research (sequential)`);
          const researchInstruction = generateResearchInstruction(trimmedTask, researchPath, taskId);
          await runSubagentWithTimeout(ctx, {
            subagentId: researchInstruction.subagentId,
            task: researchInstruction.task,
            extraContext: researchInstruction.extraContext,
          });

          // === PHASE 2: Plan（逐次）===
          console.log(`[ul_workflow_run] Phase 2: Plan (sequential)`);
          const planInstruction = generatePlanInstruction(trimmedTask, researchPath, planPath, taskId);
          await runSubagentWithTimeout(ctx, {
            subagentId: planInstruction.subagentId,
            task: planInstruction.task,
            extraContext: planInstruction.extraContext,
          });

          currentWorkflow.approvedPhases.push("research", "plan");
          currentWorkflow.phase = "plan";
          currentWorkflow.phaseIndex = 1;
          currentWorkflow.updatedAt = new Date().toISOString();
          saveState(currentWorkflow);

          const planContent = readPlanFile(taskId);

          // === PHASE 3: Annotate（ユーザーレビュー）===
          // Plan承認後、自動的にannotateフェーズへ移行
          currentWorkflow.approvedPhases.push("plan");
          currentWorkflow.phase = "annotate";
          currentWorkflow.phaseIndex = 2;
          currentWorkflow.updatedAt = new Date().toISOString();
          saveState(currentWorkflow);

          // === ユーザーレビュー（Annotateフェーズ）===
          // UIの有無に関わらず、detailsベースで質問を返す
          return {
            content: [{ type: "text", text: `## Plan作成完了（レビュー待ち - Annotateフェーズ）

Task: ${trimmedTask}
Execution Mode: 統一フロー（Research/Plan: 逐次、Implement: DAG並列）
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
              useDagForImplement: true,
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

          // === PHASE 3: Implement（DAG並列または逐次）===
          if (!currentWorkflow) {
            return makeResult("エラー: ワークフロー状態が見つかりません", { error: "no_workflow" });
          }
          // TypeScript control flow: currentWorkflow is non-null after the check above
          currentWorkflow.approvedPhases.push("plan");
          currentWorkflow.phase = "implement";
          currentWorkflow.phaseIndex = 3;
          currentWorkflow.updatedAt = new Date().toISOString();
          saveState(currentWorkflow);

          // DAG並列実行（useDag=trueの場合）
          if (useDag) {
            console.log(`[ul_workflow_run] Phase 3: Implement (DAG parallel, concurrency: ${effectiveConcurrency})`);
            
            try {
              const { generateDagFromTask } = await import("../lib/dag-generator.js");
              const { executeDag } = await import("../lib/dag-executor.js");

              // 実装フェーズ用のDAGを生成（plan.mdベース）
              const dagPlan = await generateDagFromTask(`plan.mdを実装: ${planPath}`);

              console.log(`[ul_workflow_run] Generated implementation DAG: ${dagPlan.id} (${dagPlan.tasks.length} tasks)`);

              const dagResult = await executeDag<{ output: string; phase: string }>(
                dagPlan,
                async (task, _context) => {
                  let subagentId = "implementer";
                  const taskLower = task.description.toLowerCase();

                  if (taskLower.includes("test") || taskLower.includes("テスト")) {
                    subagentId = "tester";
                  } else if (taskLower.includes("review") || taskLower.includes("レビュー")) {
                    subagentId = "reviewer";
                  }

                  console.log(`[ul_workflow_run] DAG task ${task.id} -> ${subagentId}`);

                  const result = await runSubagentWithTimeout(ctx, {
                    subagentId,
                    task: task.description,
                    extraContext: `Part of implementation workflow. Plan: ${planPath}`,
                  });

                  const contentItem = result?.content?.[0];
                  const outputText = contentItem && 'text' in contentItem ? contentItem.text : "completed";
                  return {
                    output: outputText,
                    phase: subagentId,
                  };
                },
                {
                  maxConcurrency: effectiveConcurrency,
                  abortOnFirstError: false,
                },
              );

              const allResults = Array.from(dagResult.taskResults.values());
              const failedTasks = allResults.filter((r) => r.status === "failed");

              if (currentWorkflow) {
                currentWorkflow.phase = "completed";
                currentWorkflow.phaseIndex = phases.length - 1;
                currentWorkflow.approvedPhases.push("implement");
                currentWorkflow.updatedAt = new Date().toISOString();
                saveState(currentWorkflow);
              }
              setCurrentWorkflow(null);

              const summary = `## UL Workflow完了（統合モード）

Task: ${trimmedTask}
Execution Mode: 統一フロー（Research/Plan: 逐次、Implement: DAG並列）

### フェーズ実行結果
- Research: 完了（逐次）
- Plan: 完了（逐次 + ユーザーレビュー）
- Implement: 完了（DAG並列）

### DAG実行詳細
- Plan ID: ${dagPlan.id}
- タスク数: ${dagPlan.tasks.length}
- 最大深度: ${dagPlan.metadata.maxDepth}
- 並列数: ${effectiveConcurrency}

### タスク結果
${allResults.map((r) => {
  const status = r.status === "completed" ? "DONE" : "FAIL";
  const output = r.output as { phase?: string } | undefined;
  return `- [${status}] ${r.taskId}: ${output?.phase || "unknown"}`;
}).join("\n")}

${failedTasks.length > 0 ? `\n### 失敗タスク\n${failedTasks.map((f) => `- ${f.taskId}: ${f.error}`).join("\n")}` : ""}

### 次のステップ: コミット

\`\`\`
ul_workflow_commit()
\`\`\`
`;

              return {
                content: [{ type: "text", text: summary }],
                details: {
                  taskId,
                  phase: "completed",
                  executionMode: "unified-flow",
                  dagPlanId: dagPlan.id,
                  taskCount: dagPlan.tasks.length,
                  succeededCount: allResults.length - failedTasks.length,
                  failedCount: failedTasks.length,
                  outcomeCode: failedTasks.length > 0 ? "PARTIAL_SUCCESS" : "SUCCESS",
                  suggestCommit: true,
                },
              };
            } catch (dagError) {
              console.log(`[ul_workflow_run] DAG execution failed, falling back to sequential implement: ${dagError}`);
              // Fall through to sequential implement
            }
          }

          // 逐次実装（DAG失敗時）
          console.log(`[ul_workflow_run] Phase 3: Implement (sequential fallback)`);
          await runSubagentWithTimeout(ctx, {
            subagentId: "implementer",
            task: `plan.mdを実装: ${planPath}`,
            extraContext: "機械的に実装してください。"
          });

          if (currentWorkflow) {
            currentWorkflow.approvedPhases.push("implement");
            currentWorkflow.phase = "completed";
            currentWorkflow.phaseIndex = 3;
            currentWorkflow.updatedAt = new Date().toISOString();
            saveState(currentWorkflow);
          }
          setCurrentWorkflow(null);

          return makeResult(`## 実装完了（逐次フォールバック）

Task ID: ${taskId}
Execution Mode: unified-flow (sequential fallback)

ワークフローが完了しました。

### 次のステップ: コミット

\`\`\`
ul_workflow_commit()
\`\`\`
`, { taskId, phase: "completed", executionMode: "unified-flow", suggestCommit: true });

        } catch (error) {
          return makeResult(`エラー: サブエージェント実行中にエラーが発生しました。\n\n${error}`, { error: "subagent_error", details: String(error) });
        }
      }

      // 手動実行モード（runSubagent APIが利用できない場合）
      // 統一フロー: Research → Plan → [ユーザーレビュー] → Implement
      if ((ctx as any).runSubagent) {
        try {
          // Researchフェーズ実行
          await runSubagentWithTimeout(ctx, {
            subagentId: "researcher",
            task: `調査タスク: ${trimmedTask}\n\n保存先: ${researchPath}`,
            extraContext: "詳細に調査し、research.mdを作成してください。"
          });

          // Planフェーズ実行（詳細な指示を使用）
          const planInstruction = generatePlanInstruction(trimmedTask, researchPath, planPath, taskId);
          await runSubagentWithTimeout(ctx, {
            subagentId: planInstruction.subagentId,
            task: planInstruction.task,
            extraContext: planInstruction.extraContext,
          });

          currentWorkflow.approvedPhases.push("research", "plan");
          currentWorkflow.phase = "plan";
          currentWorkflow.phaseIndex = 1;
          currentWorkflow.updatedAt = new Date().toISOString();
          saveState(currentWorkflow);

          const planContent = readPlanFile(taskId);

          // Plan確認を返す（detailsベース）
          return {
            content: [{ type: "text", text: `## Plan作成完了

Task: ${trimmedTask}
Execution Mode: 統一フロー

\`\`\`markdown
${planContent}
\`\`\`
` }],
            details: {
              taskId,
              phase: "plan",
              executionMode: "unified-flow",
              autoExecute: true,
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
          return makeResult(`エラー: サブエージェント実行中にエラーが発生しました。\n\n${error}`, { error: "subagent_error", details: String(error) });
        }
      }

      // runSubagent APIが利用できない場合
      return makeResult(`## UL Workflow開始

Task: ${trimmedTask}
ID: ${taskId}
Execution Mode: unified-flow (manual)

### 手順1: Research
\`\`\`
subagent_run({
  subagentId: "researcher",
  task: "調査: ${trimmedTask.replace(/"/g, '\\"')}",
  extraContext: "結果を ${researchPath} に保存"
})
\`\`\`

### 手順2: Plan（Research完了後）
\`\`\`
subagent_run({
  subagentId: "architect",
  task: "計画作成: ${trimmedTask.replace(/"/g, '\\"')}",
  extraContext: "事前調査: ${researchPath}, 結果を ${planPath} に保存"
})
\`\`\`

### 手順3: Plan確認（Plan完了後）
\`\`\`
ul_workflow_confirm_plan()
\`\`\`
`, { taskId, phase: "research", nextPhase: "plan", executionMode: "unified-flow" });
    },
  });

  // ステータス表示ツール
  pi.registerTool({
    name: "ul_workflow_status",
    label: "UL Workflow Status",
    description: "現在のワークフローステータスを表示",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const workflow = getCurrentWorkflow();
      if (!workflow) {
        return makeResult(`アクティブなワークフローはありません。

新しいワークフローを開始するには:
  ul_workflow_start({ task: "タスク説明" })
`, { active: false });
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
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
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
      
      const previousPhase = currentWorkflow.phase;

      // BEGIN FIX: BUG-002 事前状態保存
      // approvedPhasesを変更する前に、現在の状態を保存
      const preApprovalState = JSON.parse(JSON.stringify(currentWorkflow));
      // END FIX
      
      currentWorkflow.approvedPhases.push(previousPhase);
      
      // ガード: planが承認されていない場合は実装フェーズに進めない
      if (previousPhase === "annotate" && !currentWorkflow.approvedPhases.includes("plan")) {
        // BEGIN FIX: BUG-002 ロールバック
        currentWorkflow.approvedPhases.pop();  // 追加したフェーズを削除
        // END FIX
        return makeResult("エラー: plan フェーズが承認されていません。先に plan.md を承認してください。", { error: "plan_not_approved" });
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
        text += `\n実装を開始するには:\n  ul_workflow_implement({ task_id: "${currentWorkflow.taskId}" })\n`;
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

      // BUG FIX: 終了フェーズではアクティブ状態をクリア + タスクディレクトリ削除
      let taskDirectoryDeleted: boolean | undefined;
      let taskDirectoryError: string | undefined;
      if (nextPhase === "completed" || nextPhase === "aborted") {
        setCurrentWorkflow(null);
        // 完了/中止したタスクディレクトリを削除
        const taskDir = path.join(TASKS_DIR, currentWorkflow.taskId);
        try {
          await fsPromises.rm(taskDir, { recursive: true, force: true });
          taskDirectoryDeleted = true;
        } catch (e) {
          // ディレクトリ削除に失敗してもクリティカルではない
          console.error(`Failed to remove task directory: ${taskDir}`, e);
          taskDirectoryDeleted = false;
          taskDirectoryError = e instanceof Error ? e.message : String(e);
        }
      } else {
        setCurrentWorkflow(currentWorkflow);
      }

      const responseDetails: Record<string, unknown> = {
        taskId: currentWorkflow.taskId,
        previousPhase,
        nextPhase
      };

      // Include deletion status in response
      if (taskDirectoryDeleted !== undefined) {
        responseDetails.taskDirectoryDeleted = taskDirectoryDeleted;
        if (taskDirectoryError) {
          responseDetails.taskDirectoryError = taskDirectoryError;
        }
      }

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
      currentWorkflow.ownerInstanceId = instanceId;
      currentWorkflow.updatedAt = now;

      saveState(currentWorkflow);
      setCurrentWorkflow(currentWorkflow);

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

      if (currentWorkflow.phase !== "annotate") {
        return makeResult(`エラー: annotateフェーズではありません（現在: ${currentWorkflow.phase}）\n\nul_workflow_run 完了後、自動的にannotateフェーズに移行します。`, { error: "wrong_phase" });
      }

      if (!currentWorkflow.approvedPhases.includes("plan")) {
        return makeResult("エラー: planフェーズが承認されていません。先にplan.mdを承認してください。", { error: "plan_not_approved" });
      }

      const taskId = currentWorkflow.taskId;
      const planPath = path.join(getTaskDir(taskId), "plan.md");

      // annotateフェーズを承認してimplementフェーズへ進む
      currentWorkflow.approvedPhases.push("annotate");
      currentWorkflow.phase = "implement";
      currentWorkflow.phaseIndex = 3;
      currentWorkflow.updatedAt = new Date().toISOString();
      saveState(currentWorkflow);
      setCurrentWorkflow(currentWorkflow);

      // runSubagent APIが利用可能な場合は自動実行
      if ((ctx as any).runSubagent) {
        try {
          const implementResult = await runSubagentWithTimeout(ctx, {
            subagentId: "implementer",
            task: `plan.mdを実装: ${planPath}`,
            extraContext: "機械的に実装してください。"
          });

          // 完了
          currentWorkflow.approvedPhases.push("implement");
          currentWorkflow.phase = "completed";
          currentWorkflow.phaseIndex = 3;
          currentWorkflow.updatedAt = new Date().toISOString();
          saveState(currentWorkflow);
          setCurrentWorkflow(null);  // Clear active registry

          return makeResult(`## 実装完了

Task ID: ${taskId}

ワークフローが完了しました。

### 次のステップ: コミット

以下を実行してコミットを作成してください:

\`\`\`
ul_workflow_commit()
\`\`\`

または手動でコミット:

\`\`\`bash
# 変更確認
git status && git diff

# ステージング（選択的）
git add <変更したファイル>

# コミット
git commit -m "feat: ..."
\`\`\`
`, { taskId, phase: "completed", suggestCommit: true });
        } catch (error) {
          return makeResult(`エラー: 実装フェーズ中にエラーが発生しました。\n\n${error}`, { error: "implement_error", details: String(error) });
        }
      }

      // runSubagent APIが利用できない場合は簡潔な指示生成モード
      return makeResult(`## 実装フェーズ開始

\`\`\`
subagent_run({
  subagentId: "implementer",
  task: "plan.mdを実装: ${planPath}",
  extraContext: "機械的に実装してください。"
})
\`\`\`

完了後: ul_workflow_commit() でコミット
`, { taskId, phase: "implement" });
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

      if (currentWorkflow.phase !== "plan") {
        return makeResult(`エラー: planフェーズではありません（現在: ${currentWorkflow.phase}）`, { error: "wrong_phase" });
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

      // runSubagent APIが利用可能な場合は自動実行
      if ((ctx as any).runSubagent) {
        try {
          await runSubagentWithTimeout(ctx, {
            subagentId: "architect",
            task: `plan.md修正: ${trimmedModifications}\n\nファイル: ${planPath}`,
            extraContext: "既存の内容を尊重しつつ修正してください。"
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
              phase: "plan",
              autoExecute: true,
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
          return makeResult(`エラー: plan修正中にエラーが発生しました。\n\n${error}`, { error: "modify_error", details: String(error) });
        }
      }

      // runSubagent APIが利用できない場合は簡潔な指示生成モード
      return makeResult(`## Plan修正

\`\`\`
subagent_run({
  subagentId: "architect",
  task: "plan.md修正: ${trimmedModifications.replace(/"/g, '\\"')}",
  extraContext: "ファイル: ${planPath}"
})
\`\`\`

修正後: \`ul_workflow_confirm_plan()\` で確認
`, { taskId, modificationCount: currentWorkflow.annotationCount });
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
    description: "研究フェーズを実行（researcherへの委任指示を生成）",
    parameters: Type.Object({
      task: Type.String({ description: "調査するタスク" }),
      task_id: Type.Optional(Type.String({ description: "タスクID（省略時は現在のワークフローを使用）" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
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
      
      return makeResult(`研究フェーズの実行指示

Task ID: ${taskId}
タスク: ${params.task}

以下の subagent_run を実行してください:

\`\`\`
subagent_run(
  subagentId: "researcher",
  task: "以下のタスクについてコードベースを徹底的に調査し、research.mdを作成してください。

タスク: ${params.task}

調査要件:
- 対象フォルダの内容を詳細に理解する
- 仕組み、機能、すべての仕様を深く理解する
- 調査結果を .pi/ul-workflow/tasks/${taskId}/research.md に保存する

強調すべき点:
- 「深く」「詳細にわたって」「複雑な部分まで」「すべてを徹底的に」調査する
- 表面的な読み取りでは不十分です
- 関数のシグネチャレベルではなく、実際の動作を理解してください

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

### 推奨アクション
high-risk の場合:
- repo_audit ツールの実行を推奨
- 理由: 3層アーキテクチャ（Initiator/Explorer/Validator）による包括的な監査が可能
",
  extraContext: "research.md は永続的な成果物です。単なる要約ではなく、後で参照できる詳細なドキュメントを作成してください。高リスク判定は必ず含めてください。",
  ulTaskId: "${taskId}"
)
\`\`\`

調査完了後:
  research.md の「高リスク判定」を確認し、high-risk の場合は:
  repo_audit({ target: \"<対象>\", scope: \"module\" }) の実行を検討

  ul_workflow_approve() で次のフェーズへ
`, { taskId, phase: "research" });
    },
  });

  // 計画作成ツール（サブエージェント委任のヘルパー）
  pi.registerTool({
    name: "ul_workflow_plan",
    label: "Execute UL Workflow Plan Phase",
    description: "計画フェーズを実行（architectへの委任指示を生成）",
    parameters: Type.Object({
      task: Type.String({ description: "計画するタスク" }),
      task_id: Type.Optional(Type.String({ description: "タスクID（省略時は現在のワークフローを使用）" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
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

      return makeResult(`計画フェーズの実行指示

Task ID: ${taskId}
タスク: ${params.task}

以下の subagent_run を実行してください:

\`\`\`
subagent_run(
  subagentId: "architect",
  task: """以下のタスクの詳細な実装計画を作成し、plan.mdを生成してください。

タスク: ${params.task}

事前調査: ${researchPath}

計画要件:
- 詳細なアプローチの説明
- 実際の変更内容を示すコードスニペット
- 変更対象となるファイルパス
- 考慮事項やトレードオフの分析
- タスクリスト（チェックボックス形式）

保存先: .pi/ul-workflow/tasks/${taskId}/plan.md

重要:
- research.md の内容を十分に参照してください
- 既存のコードパターンを尊重してください
- コードスニペットは実際の変更を反映してください
""",
  extraContext: "plan.md はユーザーのレビュー対象です。後で注釈が追加されることを想定して構造化してください。",
  ulTaskId: "${taskId}"
)
\`\`\`

計画作成完了後:
  ul_workflow_confirm_plan() でplanを確認してください
`, { taskId, phase: "plan" });
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
      const workflow = getCurrentWorkflow();
      if (!workflow) {
        return makeResult("エラー: アクティブなワークフローがありません。", { error: "no_active_workflow" });
      }

      const ownership = checkOwnership(workflow);
      if (!ownership.owned) {
        return makeResult(`エラー: このワークフローは他のインスタンスが所有しています。`, { error: ownership.error });
      }

      // git-workflowスキルの読み込みを促す
      const skillPath = ".pi/skills/git-workflow/SKILL.md";

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

詳細はgit-workflowスキルを参照: ${skillPath}
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
      ctx.ui.notify(`Task: ${workflow.taskId}\nPhases: ${phaseStr}\nApproved: ${workflow.approvedPhases.join(", ") || "none"}`, "info");
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
      
      if (workflow.phase === "completed" || workflow.phase === "aborted") {
        ctx.ui.notify(`エラー: ワークフローは既に${workflow.phase === "completed" ? "完了" : "中止"}しています`, "warning");
        return;
      }
      
      const previousPhase = workflow.phase;
      workflow.approvedPhases.push(previousPhase);
      const nextPhase = advancePhase(workflow);
      saveState(workflow);
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
      
      const taskId = workflow.taskId;
      workflow.phase = "aborted";
      workflow.updatedAt = new Date().toISOString();
      saveState(workflow);
      setCurrentWorkflow(null);
      
      ctx.ui.notify(`ワークフロー中止: ${taskId}`, "info");
    },
  });
}
