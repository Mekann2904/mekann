/**
 * @abdd.meta
 * path: .pi/extensions/task-flow.ts
 * role: タスクフロー統合ツール（委任、プラン変換、コンテキスト設定）を提供
 * why: タスク管理とサブエージェント実行の統合により、効率的なワークフロー自動化を実現するため
 * related: .pi/extensions/task.ts, .pi/extensions/plan.ts, .pi/extensions/subagents/task-execution.ts
 * public_api: task_delegate, task_from_plan, task_context_set
 * invariants: タスクとプランのストレージは既存フォーマットと互換性を維持、ステータス遷移は一方向のみ、ストレージ保存失敗時はバックアップを作成
 * side_effects: .pi/tasks/storage.json、.pi/plans/storage.jsonへの読み書き、バックアップファイル作成、サブエージェントプロセス起動、console.errorによるエラーログ出力
 * failure_modes: サブエージェントタイムアウト、ストレージ破損、無効なタスク/プランID、ストレージ書き込み失敗（バックアップ試行付き）
 * @abdd.explain
 * overview: タスク管理機能とサブエージェント実行を統合し、プランからのタスク作成やタスクの自動委任を可能にする。ストレージ保存時のエラーハンドリングを備える
 * what_it_does:
 *   - task_delegate: タスクをサブエージェントに委任し、成功時に自動完了
 *   - task_from_plan: プランのステップからタスクを一括作成
 *   - task_context_set: 現在のタスクコンテキストを設定/クリア
 *   - saveTaskStorage: ストレージ保存失敗時にバックアップファイルを作成し、データ損失を防ぐ
 * why_it_exists:
 *   - プランからタスクへの変換を自動化するため
 *   - タスク委任のワークフローを簡素化するため
 *   - セッション間でタスクコンテキストを維持するため
 *   - ストレージ障害時のデータ保護を提供するため
 * scope:
 *   in: タスクID、プランID、サブエージェントID、各種オプションパラメータ
 *   out: ストレージ更新、バックアップファイル（エラー時）、サブエージェント実行結果、コンテキスト設定確認
 */

// File: .pi/extensions/task-flow.ts
// Description: Task flow integration tools for delegating, creating from plans, and context management
// Why: Enables seamless workflow integration between tasks, plans, and subagent execution
// Related: .pi/extensions/task.ts, .pi/extensions/plan.ts, .pi/extensions/subagents/task-execution.ts

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { runSubagentTask } from "./subagents/task-execution";
import { loadStorage as loadSubagentStorage } from "./subagents/storage";
import type { SubagentDefinition } from "./subagents/storage";
import { getInstanceId } from "./ul-workflow.js";

// ============================================
// Type Definitions (local copies for type safety)
// ============================================

/**
 * タスクの優先度
 */
type TaskPriority = "low" | "medium" | "high" | "urgent";

/**
 * タスクのステータス
 */
type TaskStatus = "todo" | "in_progress" | "completed" | "cancelled" | "failed";

/**
 * タスクのデータモデル
 * Note: Duplicated from task.ts because it's not exported
 */
interface Task {
	id: string;
	title: string;
	description?: string;
	status: TaskStatus;
	priority: TaskPriority;
	tags: string[];
	dueDate?: string;
	assignee?: string;
	createdAt: string;
	updatedAt: string;
	completedAt?: string;
	parentTaskId?: string;
	ownerInstanceId?: string; // 所有するpiインスタンスID
	claimedAt?: string;       // 所有取得時刻
}

/**
 * タスクストレージのデータモデル
 * Note: Duplicated from task.ts because it's not exported
 */
interface TaskStorage {
	tasks: Task[];
	currentTaskId?: string;
}

/**
 * プランステップのデータモデル
 * Note: Duplicated from plan.ts because it's not exported
 */
interface PlanStep {
	id: string;
	title: string;
	description?: string;
	status: "pending" | "in_progress" | "completed" | "blocked";
	estimatedTime?: number;
	dependencies?: string[];
}

/**
 * プランのデータモデル
 * Note: Duplicated from plan.ts because it's not exported
 */
interface Plan {
	id: string;
	name: string;
	description?: string;
	createdAt: string;
	updatedAt: string;
	status: "draft" | "active" | "completed" | "cancelled";
	steps: PlanStep[];
}

/**
 * プランストレージのデータモデル
 * Note: Duplicated from plan.ts because it's not exported
 */
interface PlanStorage {
	plans: Plan[];
	currentPlanId?: string;
}

// ============================================
// Storage Management
// ============================================

const TASK_DIR = ".pi/tasks";
const TASK_STORAGE_FILE = join(TASK_DIR, "storage.json");
const PLAN_DIR = ".pi/plans";
const PLAN_STORAGE_FILE = join(PLAN_DIR, "storage.json");

let taskIdSequence = 0;

/**
 * タスクディレクトリを確保
 * @summary タスクディレクトリ作成
 */
function ensureTaskDir(): void {
	if (!existsSync(TASK_DIR)) {
		mkdirSync(TASK_DIR, { recursive: true });
	}
}

/**
 * プランディレクトリを確保
 * @summary プランディレクトリ作成
 */
function ensurePlanDir(): void {
	if (!existsSync(PLAN_DIR)) {
		mkdirSync(PLAN_DIR, { recursive: true });
	}
}

/**
 * タスクストレージを読み込み
 * @summary タスクストレージ読込
 * @returns タスクストレージオブジェクト
 */
function loadTaskStorage(): TaskStorage {
	ensureTaskDir();
	if (!existsSync(TASK_STORAGE_FILE)) {
		const empty: TaskStorage = { tasks: [] };
		writeFileSync(TASK_STORAGE_FILE, JSON.stringify(empty, null, 2), "utf-8");
		return empty;
	}
	try {
		const content = readFileSync(TASK_STORAGE_FILE, "utf-8");
		return JSON.parse(content);
	} catch {
		return { tasks: [] };
	}
}

/**
 * タスクストレージを保存
 * @summary タスクストレージ保存
 * @param storage 保存するタスクストレージ
 * @throws バックアップ保存も失敗した場合はエラーログのみ出力
 */
function saveTaskStorage(storage: TaskStorage): void {
	ensureTaskDir();
	try {
		writeFileSync(TASK_STORAGE_FILE, JSON.stringify(storage, null, 2), "utf-8");
	} catch (error) {
		console.error(`[task-flow] Failed to save task storage:`, error);
		// Attempt backup save
		const backupFile = `${TASK_STORAGE_FILE}.backup-${Date.now()}`;
		try {
			writeFileSync(backupFile, JSON.stringify(storage, null, 2), "utf-8");
			console.error(`[task-flow] Backup saved to: ${backupFile}`);
		} catch {
			// Final fallback - data loss is possible
			console.error(`[task-flow] CRITICAL: Could not save backup either`);
		}
	}
}

/**
 * プランストレージを読み込み
 * @summary プランストレージ読込
 * @returns プランストレージオブジェクト
 */
function loadPlanStorage(): PlanStorage {
	ensurePlanDir();
	if (!existsSync(PLAN_STORAGE_FILE)) {
		const empty: PlanStorage = { plans: [] };
		writeFileSync(PLAN_STORAGE_FILE, JSON.stringify(empty, null, 2), "utf-8");
		return empty;
	}
	try {
		const content = readFileSync(PLAN_STORAGE_FILE, "utf-8");
		return JSON.parse(content);
	} catch {
		return { plans: [] };
	}
}

/**
 * 一意なタスクIDを生成
 * @summary タスクID生成
 * @returns 生成されたタスクID
 */
function generateTaskId(): string {
	taskIdSequence += 1;
	return `task-${Date.now()}-${taskIdSequence}`;
}

// ============================================
// Status Mapping for task_from_plan
// ============================================

/**
 * プランステップのステータスからタスクステータスへのマッピング
 */
const STATUS_MAP: Record<PlanStep["status"], TaskStatus> = {
	pending: "todo",
	in_progress: "in_progress",
	completed: "completed",
	blocked: "todo",
};

// ============================================
// Extension Registration
// ============================================

// モジュールレベルのフラグ（reload時のリスナー重複登録防止）
let isInitialized = false;

export default function (pi: ExtensionAPI) {
	if (isInitialized) return;
	isInitialized = true;

	// ============================================
	// Tool: task_delegate
	// ============================================
	pi.registerTool({
		name: "task_delegate",
		label: "Delegate Task to Subagent",
		description: "Delegate a task to a subagent and automatically complete it on success",
		parameters: Type.Object({
			taskId: Type.String({ description: "ID of the task to delegate" }),
			subagentId: Type.Optional(Type.String({ description: "Target subagent id (default: auto-select)" })),
			extraContext: Type.Optional(Type.String({ description: "Optional supplemental context" })),
			timeoutMs: Type.Optional(Type.Number({ description: "Idle timeout in ms (default: 300000)" })),
			autoComplete: Type.Optional(Type.Boolean({ description: "Auto-complete on success (default: true)" })),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const storage = loadTaskStorage();
			const task = storage.tasks.find(t => t.id === params.taskId);

			if (!task) {
				return {
					content: [{ type: "text", text: `Task not found: ${params.taskId}` }],
					details: { error: "task_not_found" }
				};
			}

			if (task.status === "completed" || task.status === "cancelled") {
				return {
					content: [{ type: "text", text: `Task already ${task.status}` }],
					details: { error: "invalid_status" }
				};
			}

			// Update to in_progress and record owner
			task.status = "in_progress";
			task.ownerInstanceId = getInstanceId();
			task.claimedAt = new Date().toISOString();
			task.updatedAt = new Date().toISOString();
			saveTaskStorage(storage);

			// Load subagent
			const subagentStorage = loadSubagentStorage(ctx.cwd);
			const agent = params.subagentId
				? subagentStorage.agents.find(a => a.id === params.subagentId && a.enabled === "enabled")
				: subagentStorage.agents.find(a => a.enabled === "enabled");

			if (!agent) {
				task.status = "failed";
				task.updatedAt = new Date().toISOString();
				saveTaskStorage(storage);
				return {
					content: [{ type: "text", text: "No available subagent" }],
					details: { error: "no_subagent" }
				};
			}

			const taskContent = task.description
				? `${task.title}\n\n${task.description}`
				: task.title;

			try {
				const result = await runSubagentTask({
					agent,
					task: taskContent,
					extraContext: params.extraContext,
					timeoutMs: params.timeoutMs ?? 300000,
					cwd: ctx.cwd,
					modelProvider: ctx.model?.provider,
					modelId: ctx.model?.id,
					signal,
				});

				// Reload storage to get latest state
				const currentStorage = loadTaskStorage();
				const currentTask = currentStorage.tasks.find(t => t.id === params.taskId);

				if (currentTask) {
					if (result.runRecord.status === "completed" && params.autoComplete !== false) {
						currentTask.status = "completed";
						currentTask.completedAt = new Date().toISOString();
					} else if (result.runRecord.status === "failed") {
						currentTask.status = "failed";
					}
					currentTask.updatedAt = new Date().toISOString();
					saveTaskStorage(currentStorage);
				}

				return {
					content: [{
						type: "text",
						text: result.output || result.runRecord.summary
					}],
					details: {
						taskId: task.id,
						subagentId: agent.id,
						runRecord: result.runRecord
					}
				};
			} catch (error) {
				// Reload storage to get latest state
				const currentStorage = loadTaskStorage();
				const currentTask = currentStorage.tasks.find(t => t.id === params.taskId);

				if (currentTask) {
					currentTask.status = "failed";
					currentTask.updatedAt = new Date().toISOString();
					saveTaskStorage(currentStorage);
				}

				return {
					content: [{
						type: "text",
						text: `Execution failed: ${error instanceof Error ? error.message : String(error)}`
					}],
					details: { error: String(error) }
				};
			}
		},
	});

	// ============================================
	// Tool: task_from_plan
	// ============================================
	pi.registerTool({
		name: "task_from_plan",
		label: "Create Tasks from Plan",
		description: "Create tasks from all steps in a plan",
		parameters: Type.Object({
			planId: Type.String({ description: "ID of the plan to convert" }),
			priority: Type.Optional(Type.String({ description: "Priority for all tasks (default: medium)" })),
			tags: Type.Optional(Type.Array(Type.String({ description: "Tags to add to all tasks" }))),
			skipCompleted: Type.Optional(Type.Boolean({ description: "Skip completed steps (default: true)" })),
			linkToPlan: Type.Optional(Type.Boolean({ description: "Add plan link tag (default: true)" })),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const planStorage = loadPlanStorage();
			const plan = planStorage.plans.find(p => p.id === params.planId);

			if (!plan) {
				return {
					content: [{ type: "text", text: `Plan not found: ${params.planId}` }],
					details: { error: "plan_not_found" }
				};
			}

			const taskStorage = loadTaskStorage();
			const taskIds: string[] = [];
			let skippedCount = 0;

			for (const step of plan.steps) {
				if (params.skipCompleted !== false && step.status === "completed") {
					skippedCount++;
					continue;
				}

				const taskTags = [
					...(params.tags ?? []),
					...(params.linkToPlan !== false ? [`plan:${plan.id}`] : []),
				];

				const task: Task = {
					id: generateTaskId(),
					title: step.title,
					description: step.description,
					status: STATUS_MAP[step.status] || "todo",
					priority: (params.priority as TaskPriority) ?? "medium",
					tags: taskTags,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					parentTaskId: step.dependencies?.[0],
				};

				taskStorage.tasks.push(task);
				taskIds.push(task.id);
			}

			saveTaskStorage(taskStorage);

			return {
				content: [{
					type: "text",
					text: `Created ${taskIds.length} tasks from plan "${plan.name}"${skippedCount > 0 ? ` (skipped ${skippedCount} completed steps)` : ""}`
				}],
				details: {
					planId: plan.id,
					planName: plan.name,
					createdCount: taskIds.length,
					skippedCount,
					taskIds
				}
			};
		},
	});

	// ============================================
	// Tool: task_context_set
	// ============================================
	pi.registerTool({
		name: "task_context_set",
		label: "Set Task Context",
		description: "Set the current task context for the session",
		parameters: Type.Object({
			taskId: Type.String({ description: "Task ID to set as current context (empty or 'clear' to clear)" }),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const storage = loadTaskStorage();

			if (!params.taskId || params.taskId === "clear") {
				storage.currentTaskId = undefined;
				saveTaskStorage(storage);
				return {
					content: [{ type: "text", text: "Task context cleared" }],
					details: { cleared: true }
				};
			}

			const task = storage.tasks.find(t => t.id === params.taskId);
			if (!task) {
				return {
					content: [{ type: "text", text: `Task not found: ${params.taskId}` }],
					details: { error: "task_not_found" }
				};
			}

			storage.currentTaskId = params.taskId;
			saveTaskStorage(storage);

			return {
				content: [{
					type: "text",
					text: `Task context set to: ${task.title} (${task.id})`
				}],
				details: {
					taskId: task.id,
					cleared: false,
					task: {
						id: task.id,
						title: task.title,
						status: task.status
					}
				}
			};
		},
	});

	// Extension loaded notification
	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.notify("Task Flow Extension loaded", "info");
	});

	// セッション終了時にリスナー重複登録防止フラグをリセット
	pi.on("session_shutdown", async () => {
		isInitialized = false;
	});
}
