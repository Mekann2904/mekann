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
import { estimateTaskComplexity, type TaskComplexity } from "../lib/agent-utils";

// ワークフローのフェーズ
type WorkflowPhase = "idle" | "research" | "plan" | "annotate" | "implement" | "completed" | "aborted";

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
}

// ディレクトリパス
const WORKFLOW_DIR = ".pi/ul-workflow";
const TASKS_DIR = path.join(WORKFLOW_DIR, "tasks");
const TEMPLATES_DIR = path.join(WORKFLOW_DIR, "templates");

// 現在のワークフロー状態（セッション内）
let currentWorkflow: WorkflowState | null = null;

/**
 * タスクが明確なゴールを持つかどうかを判定する
 * 明確なゴールがある場合は、planフェーズを省略できる可能性がある
 * @summary 明確なゴール判定
 * @param task - タスク文字列
 * @returns 明確なゴールがあるかどうか
 */
function looksLikeClearGoalTask(task: string): boolean {
  const normalized = String(task || "").trim().toLowerCase();

  // 明確なゴールを示すパターン
  const clearGoalPatterns = [
    /^add\s+/i,           // "add feature X"
    /^fix\s+/i,           // "fix bug in Y"
    /^update\s+/i,        // "update component Z"
    /^implement\s+/i,     // "implement API endpoint"
    /^create\s+/i,        // "create new module"
    /^refactor\s+/i,      // "refactor function"
    /^remove\s+/i,        // "remove deprecated code"
    /^rename\s+/i,        // "rename variable"
  ];

  // 曖昧なゴールを示すパターン
  const ambiguousPatterns = [
    /^investigate\s+/i,   // "investigate performance"
    /^analyze\s+/i,       // "analyze architecture"
    /^review\s+/i,        // "review codebase"
    /^improve\s+/i,       // "improve performance" (何をどう改善するか不明)
    /^optimize\s+/i,      // "optimize query" (具体的な目標が不明)
    /^\?/,                // 疑問符開始
    /^how\s+/i,           // "how to..."
    /^what\s+/i,          // "what is..."
  ];

  if (ambiguousPatterns.some((p) => p.test(normalized))) {
    return false;
  }

  if (clearGoalPatterns.some((p) => p.test(normalized))) {
    return true;
  }

  // デフォルト: 明確でないと仮定
  return false;
}

/**
 * タスク規模に基づいてフェーズ構成を決定する
 * 小規模タスクはフェーズを削減し、大規模タスクは全フェーズを実行
 * @summary 動的フェーズ決定
 * @param task - タスク文字列
 * @returns フェーズの配列
 */
export function determineWorkflowPhases(task: string): WorkflowPhase[] {
  const complexity = estimateTaskComplexity(task);
  const hasClearGoal = looksLikeClearGoalTask(task);

  switch (complexity) {
    case "low":
      if (hasClearGoal) {
        // 小規模かつ明確なタスク: research + implement のみ
        return ["research", "implement", "completed"];
      }
      // 小規模だが不明確: plan を含める
      return ["research", "plan", "implement", "completed"];

    case "medium":
      // 中規模: annotate は省略可能
      if (hasClearGoal) {
        return ["research", "plan", "implement", "completed"];
      }
      return ["research", "plan", "annotate", "implement", "completed"];

    case "high":
      // 大規模: すべてのフェーズを実行
      return ["research", "plan", "annotate", "implement", "completed"];
  }
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

  if (!fs.existsSync(taskDir)) {
    fs.mkdirSync(taskDir, { recursive: true });
  }

  fs.writeFileSync(statusPath, JSON.stringify(state, null, 2), "utf-8");
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
function loadState(taskId: string): WorkflowState | null {
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

      // BEGIN FIX: BUG-001 空タスク検証
      const trimmedTask = String(task || "").trim();
      if (!trimmedTask) {
        return makeResult("エラー: タスク説明を入力してください。\n\n使用例:\n  ul_workflow_start({ task: 'バグを修正する' })", { error: "empty_task" });
      }

      if (trimmedTask.length < 5) {
        return makeResult(`エラー: タスク説明が短すぎます（現在: ${trimmedTask.length}文字）。\n\n少なくとも5文字以上の説明を入力してください。`, { error: "task_too_short", length: trimmedTask.length });
      }
      // END FIX

      if (currentWorkflow && currentWorkflow.phase !== "completed" && currentWorkflow.phase !== "aborted") {
        return makeResult(`エラー: すでにアクティブなワークフローがあります (taskId: ${currentWorkflow.taskId}, phase: ${currentWorkflow.phase})\nまず ul_workflow_status で確認するか ul_workflow_abort で中止してください。`, { error: "workflow_already_active" });
      }

      const taskId = generateTaskId(trimmedTask);
      const now = new Date().toISOString();

      // タスク規模に基づいてフェーズ構成を動的に決定
      const phases = determineWorkflowPhases(trimmedTask);

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
      };

      createTaskFile(taskId, trimmedTask);
      saveState(currentWorkflow);

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

  // ステータス表示ツール
  pi.registerTool({
    name: "ul_workflow_status",
    label: "UL Workflow Status",
    description: "現在のワークフローステータスを表示",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      if (!currentWorkflow) {
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
        completed: "完了",
        aborted: "中止",
      };

      const planAnnotations = currentWorkflow.phase === "annotate" || currentWorkflow.phase === "implement"
        ? extractAnnotations(readPlanFile(currentWorkflow.taskId))
        : [];

      const workflow = currentWorkflow;  // Capture for closure

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
      if (!currentWorkflow) {
        return makeResult("エラー: アクティブなワークフローがありません。", { error: "no_active_workflow" });
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
        text += `\nワークフローが完了しました。\n`;
      }
      
      return makeResult(text, { taskId: currentWorkflow.taskId, previousPhase, nextPhase });
    },
  });

  // 注釈ツール
  pi.registerTool({
    name: "ul_workflow_annotate",
    label: "Annotate UL Workflow Plan",
    description: "plan.mdの注釈を検出・適用",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      if (!currentWorkflow) {
        return makeResult("エラー: アクティブなワークフローがありません。", { error: "no_active_workflow" });
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

  // 中止ツール
  pi.registerTool({
    name: "ul_workflow_abort",
    label: "Abort UL Workflow",
    description: "ワークフローを中止",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      if (!currentWorkflow) {
        return makeResult("エラー: アクティブなワークフローがありません。", { error: "no_active_workflow" });
      }
      
      const taskId = currentWorkflow.taskId;
      currentWorkflow.phase = "aborted";
      currentWorkflow.updatedAt = new Date().toISOString();
      saveState(currentWorkflow);
      
      currentWorkflow = null;
      
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
      
      if (currentWorkflow && currentWorkflow.phase !== "completed" && currentWorkflow.phase !== "aborted") {
        return makeResult(`エラー: すでにアクティブなワークフローがあります (taskId: ${currentWorkflow.taskId})`, { error: "workflow_already_active" });
      }
      
      const state = loadState(task_id);
      if (!state) {
        return makeResult(`エラー: タスク ${task_id} が見つかりません。`, { error: "task_not_found" });
      }
      
      currentWorkflow = state;
      
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
      const taskId = params.task_id || currentWorkflow?.taskId;
      if (!taskId) {
        return makeResult("エラー: task_id が指定されていません。", { error: "no_task_id" });
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
",
  extraContext: "research.md は永続的な成果物です。単なる要約ではなく、後で参照できる詳細なドキュメントを作成してください。"
)
\`\`\`

調査完了後:
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
      const taskId = params.task_id || currentWorkflow?.taskId;
      if (!taskId) {
        return makeResult("エラー: task_id が指定されていません。", { error: "no_task_id" });
      }
      
      const researchPath = path.join(getTaskDir(taskId), "research.md");
      
      return makeResult(`計画フェーズの実行指示

Task ID: ${taskId}
タスク: ${params.task}

以下の subagent_run を実行してください:

\`\`\`
subagent_run(
  subagentId: "architect",
  task: "以下のタスクの詳細な実装計画を作成し、plan.mdを生成してください。

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
",
  extraContext: "plan.md はユーザーのレビュー対象です。後で注釈が追加されることを想定して構造化してください。"
)
\`\`\`

計画作成完了後:
  ul_workflow_approve() で注釈フェーズへ
`, { taskId, phase: "plan" });
    },
  });

  // 実装実行ツール（サブエージェント委任のヘルパー）
  pi.registerTool({
    name: "ul_workflow_implement",
    label: "Execute UL Workflow Implement Phase",
    description: "実装フェーズを実行（implementerへの委任指示を生成）",
    parameters: Type.Object({
      task_id: Type.Optional(Type.String({ description: "タスクID（省略時は現在のワークフローを使用）" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const taskId = params.task_id || currentWorkflow?.taskId;
      if (!taskId) {
        return makeResult("エラー: task_id が指定されていません。", { error: "no_task_id" });
      }
      
      if (!currentWorkflow?.approvedPhases.includes("annotate")) {
        return makeResult(`エラー: annotate フェーズが承認されていません。

現在の承認済みフェーズ: ${currentWorkflow?.approvedPhases.join(", ") || "なし"}

実装の前に:
1. ul_workflow_approve() で plan フェーズを承認
2. plan.md に注釈を追加
3. ul_workflow_annotate() で注釈を適用
4. ul_workflow_approve() で annotate フェーズを承認
`, { error: "annotate_not_approved" });
      }
      
      const planPath = path.join(getTaskDir(taskId), "plan.md");
      
      return makeResult(`実装フェーズの実行指示

Task ID: ${taskId}

以下の subagent_run を実行してください:

\`\`\`
subagent_run(
  subagentId: "implementer",
  task: "plan.md に記載されたすべての作業を実施してください。

計画ファイル: ${planPath}

実装要件:
- すべてのタスクとフェーズを完了するまで作業を停止しない
- タスクまたはフェーズが完了したら plan.md 内で完了済みとしてマーク
- 不要なコメントや JSDoc を追加しない
- 未知の型を使用しない
- 常に型チェックを実行する
",
  extraContext: "実装は機械的な作業です。創造的な判断は計画段階で完了しています。"
)
\`\`\`

実装完了後:
  ul_workflow_approve() でワークフロー完了
`, { taskId, phase: "implement" });
    },
  });

  // スラッシュコマンド
  pi.registerCommand("ul-workflow-start", {
    description: "UL Workflow Modeを開始",
    handler: async (args, ctx) => {
      const task = args.trim();
      if (!task) {
        ctx.ui.notify("タスク説明を入力してください: /ul-workflow-start <task>", "warning");
        return;
      }

      if (currentWorkflow && currentWorkflow.phase !== "completed" && currentWorkflow.phase !== "aborted") {
        ctx.ui.notify(`エラー: すでにアクティブなワークフローがあります (taskId: ${currentWorkflow.taskId})`, "warning");
        return;
      }

      const taskId = generateTaskId(task);
      const now = new Date().toISOString();

      // タスク規模に基づいてフェーズ構成を動的に決定
      const phases = determineWorkflowPhases(task);

      currentWorkflow = {
        taskId,
        taskDescription: task,
        phase: phases[0],
        phases,
        phaseIndex: 0,
        createdAt: now,
        updatedAt: now,
        approvedPhases: [],
        annotationCount: 0,
      };

      createTaskFile(taskId, task);
      saveState(currentWorkflow);

      const phaseStr = phases.map((p) => p.toUpperCase()).join(" -> ");
      ctx.ui.notify(`ワークフロー開始: ${taskId}\nフェーズ: ${phaseStr}`, "info");
    },
  });

  pi.registerCommand("ul-workflow-status", {
    description: "ワークフローのステータスを表示",
    handler: async (_args, ctx) => {
      if (!currentWorkflow) {
        ctx.ui.notify("アクティブなワークフローはありません", "info");
        return;
      }
      const workflow = currentWorkflow;
      const phaseStr = workflow.phases
        .map((p, i) => (i === workflow.phaseIndex ? `[${p.toUpperCase()}]` : p.toUpperCase()))
        .join(" -> ");
      ctx.ui.notify(`Task: ${workflow.taskId}\nPhases: ${phaseStr}\nApproved: ${workflow.approvedPhases.join(", ") || "none"}`, "info");
    },
  });

  pi.registerCommand("ul-workflow-approve", {
    description: "現在のフェーズを承認",
    handler: async (_args, ctx) => {
      if (!currentWorkflow) {
        ctx.ui.notify("エラー: アクティブなワークフローがありません", "warning");
        return;
      }
      
      if (currentWorkflow.phase === "completed" || currentWorkflow.phase === "aborted") {
        ctx.ui.notify(`エラー: ワークフローは既に${currentWorkflow.phase === "completed" ? "完了" : "中止"}しています`, "warning");
        return;
      }
      
      const previousPhase = currentWorkflow.phase;
      currentWorkflow.approvedPhases.push(previousPhase);
      const nextPhase = advancePhase(currentWorkflow);
      
      ctx.ui.notify(`${previousPhase.toUpperCase()} 承認 → ${nextPhase.toUpperCase()}`, "info");
    },
  });

  pi.registerCommand("ul-workflow-annotate", {
    description: "plan.mdの注釈を適用",
    handler: async (_args, ctx) => {
      if (!currentWorkflow) {
        ctx.ui.notify("エラー: アクティブなワークフローがありません", "warning");
        return;
      }
      
      const planContent = readPlanFile(currentWorkflow.taskId);
      if (!planContent) {
        ctx.ui.notify("エラー: plan.md が見つかりません", "warning");
        return;
      }
      
      const annotations = extractAnnotations(planContent);
      currentWorkflow.annotationCount = annotations.length;
      currentWorkflow.updatedAt = new Date().toISOString();
      saveState(currentWorkflow);
      
      ctx.ui.notify(`${annotations.length} 件の注釈を検出`, "info");
    },
  });

  pi.registerCommand("ul-workflow-abort", {
    description: "ワークフローを中止",
    handler: async (_args, ctx) => {
      if (!currentWorkflow) {
        ctx.ui.notify("エラー: アクティブなワークフローがありません", "warning");
        return;
      }
      
      const taskId = currentWorkflow.taskId;
      currentWorkflow.phase = "aborted";
      currentWorkflow.updatedAt = new Date().toISOString();
      saveState(currentWorkflow);
      currentWorkflow = null;
      
      ctx.ui.notify(`ワークフロー中止: ${taskId}`, "info");
    },
  });
}
