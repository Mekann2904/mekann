/**
 * @abdd.meta
 * path: .pi/extensions/task.ts
 * role: タスク（作業項目）の作成、管理、実行機能を提供する拡張モジュール
 * why: 軽量なタスク管理とトラッキングを可能にするため
 * related: .pi/extensions/plan.ts, .pi/lib/comprehensive-logger.ts, README.md
 * public_api: createTask, ensureTaskDir, loadStorage, saveStorage, Task, TaskStorage
 * invariants: storage.jsonは常に有効なJSON形式、Taskのstatusは列挙値のいずれか、taskIdSequenceは単調増加
 * side_effects: .pi/tasks/storage.jsonへの読み書き、.pi/tasksディレクトリの作成
 * failure_modes: ディレクトリ作成権限がない場合、storage.jsonの破損によるパースエラー、ディスク容量不足
 * @abdd.explain
 * overview: タスク管理機能の追加により、作業項目の作成・更新・完了状態の追跡を行う
 * what_it_does:
 *   - .pi/tasks/storage.jsonへのタスクデータの永続化
 *   - Taskインターフェースに基づく構造管理
 *   - タスクIDの生成とステータス管理（todo, in_progress, completed, cancelled）
 *   - 優先度、タグ、期限、担当者の管理
 * why_it_exists:
 *   - 個別の作業項目を管理するため
 *   - 作業の進捗を可視化し、実行履歴を残すため
 * scope:
 *   in: Task名、説明、優先度、タグ、期限、担当者、外部からのAPI呼び出し
 *   out: storage.jsonへの更新、ロガーへの操作出力、AgentMessage形式の応答
 */

// File: .pi/extensions/task.ts
// Description: Adds task management functionality for pi - create, manage, and track tasks
// Why: Enables lightweight task tracking with priority, tags, and due dates
// Related: README.md, .pi/extensions/plan.ts

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { getLogger } from "../lib/comprehensive-logger";
import type { OperationType } from "../lib/comprehensive-logger-types";
import {
	ensureTaskDir as ensureSharedTaskDir,
	loadTaskStorage as loadSharedTaskStorage,
	saveTaskStorage as saveSharedTaskStorage,
} from "../lib/storage/task-plan-store.js";

const logger = getLogger();

// ============================================
// Global State
// ============================================

let taskIdSequence = 0;

// ============================================
// Type Definitions
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
 */
interface Task {
	id: string;
	title: string;
	description?: string;
	status: TaskStatus;
	priority: TaskPriority;
	tags: string[];
	dueDate?: string; // ISO 8601 format
	assignee?: string;
	createdAt: string;
	updatedAt: string;
	completedAt?: string;
	parentTaskId?: string; // For subtasks
	ownerInstanceId?: string; // 所有するpiインスタンスID
	claimedAt?: string;       // 所有取得時刻
	retryCount?: number;
	nextRetryAt?: string;
	lastError?: string;
	workspaceVerificationStatus?: "passed" | "failed";
	workspaceVerifiedAt?: string;
	workspaceVerificationMessage?: string;
	completionGateStatus?: "clear" | "blocked";
	completionGateUpdatedAt?: string;
	completionGateMessage?: string;
	completionGateBlockers?: string[];
	proofArtifacts?: string[];
	verifiedCommands?: string[];
	progressEvidence?: string[];
	verificationEvidence?: string[];
	reviewEvidence?: string[];
}

/**
 * タスクストレージのデータモデル
 */
interface TaskStorage {
	tasks: Task[];
	currentTaskId?: string;
}

// ============================================
// Storage Management
// ============================================

/**
 * タスクディレクトリを確保
 */
function ensureTaskDir(): void {
	ensureSharedTaskDir();
}

/**
 * ストレージからタスクを読み込み
 */
function loadStorage(): TaskStorage {
	return loadSharedTaskStorage<TaskStorage>();
}

/**
 * ストレージにタスクを保存
 */
function saveStorage(storage: TaskStorage): void {
	saveSharedTaskStorage(storage);
}

/**
 * 一意なタスクIDを生成
 */
function generateId(): string {
	taskIdSequence += 1;
	return `task-${Date.now()}-${taskIdSequence}`;
}

// ============================================
// Task Operations
// ============================================

/**
 * 新しいタスクを作成
 */
function createTask(
	title: string,
	description?: string,
	priority: TaskPriority = "medium",
	tags: string[] = [],
	dueDate?: string,
	assignee?: string,
	parentTaskId?: string
): Task {
	const task: Task = {
		id: generateId(),
		title,
		description,
		status: "todo",
		priority,
		tags,
		dueDate,
		assignee,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		parentTaskId,
	};
	return task;
}

/**
 * IDでタスクを検索
 */
function findTaskById(storage: TaskStorage, taskId: string): Task | undefined {
	return storage.tasks.find(t => t.id === taskId);
}

/**
 * タスクを更新
 */
function updateTask(
	storage: TaskStorage,
	taskId: string,
	updates: Partial<Omit<Task, "id" | "createdAt">>
): Task | null {
	const task = findTaskById(storage, taskId);
	if (!task) return null;

	Object.assign(task, updates);
	task.updatedAt = new Date().toISOString();

	// completedAtを自動設定
	if (updates.status === "completed" && !task.completedAt) {
		task.completedAt = new Date().toISOString();
	} else if (updates.status && updates.status !== "completed") {
		task.completedAt = undefined;
	}

	return task;
}

/**
 * タスクを削除
 */
function deleteTask(storage: TaskStorage, taskId: string): boolean {
	const initialLength = storage.tasks.length;
	storage.tasks = storage.tasks.filter(t => t.id !== taskId);
	return storage.tasks.length < initialLength;
}

/**
 * タスクを完了
 */
function completeTask(storage: TaskStorage, taskId: string): Task | null {
	return updateTask(storage, taskId, { status: "completed" });
}

/**
 * ステータスでフィルタリング
 */
function filterByStatus(storage: TaskStorage, status: TaskStatus): Task[] {
	return storage.tasks.filter(t => t.status === status);
}

/**
 * 優先度でフィルタリング
 */
function filterByPriority(storage: TaskStorage, priority: TaskPriority): Task[] {
	return storage.tasks.filter(t => t.priority === priority);
}

/**
 * タグでフィルタリング
 */
function filterByTag(storage: TaskStorage, tag: string): Task[] {
	return storage.tasks.filter(t => t.tags.includes(tag));
}

/**
 * 担当者でフィルタリング
 */
function filterByAssignee(storage: TaskStorage, assignee: string): Task[] {
	return storage.tasks.filter(t => t.assignee === assignee);
}

/**
 * サブタスクを取得
 */
function getSubtasks(storage: TaskStorage, parentTaskId: string): Task[] {
	return storage.tasks.filter(t => t.parentTaskId === parentTaskId);
}

/**
 * 期限切れタスクを取得
 */
function getOverdueTasks(storage: TaskStorage): Task[] {
	const now = new Date();
	return storage.tasks.filter(t => {
		if (t.status === "completed" || t.status === "cancelled") return false;
		if (!t.dueDate) return false;
		return new Date(t.dueDate) < now;
	});
}

// ============================================
// Formatting Functions
// ============================================

/**
 * 優先度をアイコンで表現
 */
function getPriorityIcon(priority: TaskPriority): string {
	switch (priority) {
		case "urgent": return "🔴";
		case "high": return "🟠";
		case "medium": return "🟡";
		case "low": return "🟢";
	}
}

/**
 * ステータスをアイコンで表現
 */
function getStatusIcon(status: TaskStatus): string {
	switch (status) {
		case "todo": return "○";
		case "in_progress": return "→";
		case "completed": return "✓";
		case "cancelled": return "⊗";
		case "failed": return "✗";
	}
}

/**
 * タスクの詳細をフォーマット
 */
function formatTaskDetails(task: Task): string {
	const lines: string[] = [];
	lines.push(`## Task: ${task.title}`);
	lines.push(`\nID: ${task.id}`);
	lines.push(`Status: ${getStatusIcon(task.status)} ${task.status}`);
	lines.push(`Priority: ${getPriorityIcon(task.priority)} ${task.priority}`);

	if (task.description) {
		lines.push(`\n### Description`);
		lines.push(task.description);
	}

	if (task.tags.length > 0) {
		lines.push(`\nTags: ${task.tags.map(t => `#${t}`).join(" ")}`);
	}

	if (task.dueDate) {
		const dueDate = new Date(task.dueDate);
		const isOverdue = dueDate < new Date() && task.status !== "completed";
		lines.push(`Due: ${dueDate.toLocaleString()}${isOverdue ? " (OVERDUE)" : ""}`);
	}

	if (task.assignee) {
		lines.push(`Assignee: ${task.assignee}`);
	}

	if (task.parentTaskId) {
		lines.push(`Parent Task: ${task.parentTaskId}`);
	}

	lines.push(`\nCreated: ${new Date(task.createdAt).toLocaleString()}`);
	lines.push(`Updated: ${new Date(task.updatedAt).toLocaleString()}`);

	if (task.completedAt) {
		lines.push(`Completed: ${new Date(task.completedAt).toLocaleString()}`);
	}

	if (typeof task.retryCount === "number" && task.retryCount > 0) {
		lines.push(`Retry Count: ${task.retryCount}`);
	}

	if (task.nextRetryAt) {
		lines.push(`Next Retry: ${new Date(task.nextRetryAt).toLocaleString()}`);
	}

	if (task.lastError) {
		lines.push(`Last Error: ${task.lastError}`);
	}

	return lines.join("\n");
}

/**
 * タスクリストをフォーマット
 */
function formatTaskList(tasks: Task[], title: string = "Tasks"): string {
	if (tasks.length === 0) {
		return `No ${title.toLowerCase()} found.`;
	}

	const lines: string[] = [`## ${title} (${tasks.length})`];

	// Sort by priority (urgent > high > medium > low)
	const priorityOrder: Record<TaskPriority, number> = {
		urgent: 0,
		high: 1,
		medium: 2,
		low: 3,
	};

	const sortedTasks = [...tasks].sort((a, b) => {
		// First by status (in_progress > todo > completed > cancelled)
		const statusOrder: Record<TaskStatus, number> = {
			in_progress: 0,
			todo: 1,
			completed: 2,
			cancelled: 3,
			failed: 4,
		};
		if (statusOrder[a.status] !== statusOrder[b.status]) {
			return statusOrder[a.status] - statusOrder[b.status];
		}
		// Then by priority
		return priorityOrder[a.priority] - priorityOrder[b.priority];
	});

	sortedTasks.forEach((task, idx) => {
		const icon = getStatusIcon(task.status);
		const priorityIcon = getPriorityIcon(task.priority);
		lines.push(`\n${idx + 1}. ${icon} ${priorityIcon} ${task.title}`);
		lines.push(`   ID: ${task.id}`);
		if (task.tags.length > 0) {
			lines.push(`   Tags: ${task.tags.join(", ")}`);
		}
		if (task.dueDate) {
			const dueDate = new Date(task.dueDate);
			const isOverdue = dueDate < new Date() && task.status !== "completed";
			lines.push(`   Due: ${dueDate.toLocaleDateString()}${isOverdue ? " (OVERDUE)" : ""}`);
		}
	});

	return lines.join("\n");
}

/**
 * 統計情報をフォーマット
 */
function formatTaskStats(storage: TaskStorage): string {
	const total = storage.tasks.length;
	const todo = filterByStatus(storage, "todo").length;
	const inProgress = filterByStatus(storage, "in_progress").length;
	const completed = filterByStatus(storage, "completed").length;
	const cancelled = filterByStatus(storage, "cancelled").length;
	const overdue = getOverdueTasks(storage).length;

	const lines: string[] = ["## Task Statistics"];
	lines.push(`\nTotal: ${total}`);
	lines.push(`  Todo: ${todo}`);
	lines.push(`  In Progress: ${inProgress}`);
	lines.push(`  Completed: ${completed}`);
	lines.push(`  Cancelled: ${cancelled}`);
	if (overdue > 0) {
		lines.push(`  Overdue: ${overdue}`);
	}

	// Priority breakdown
	const urgent = filterByPriority(storage, "urgent").length;
	const high = filterByPriority(storage, "high").length;
	const medium = filterByPriority(storage, "medium").length;
	const low = filterByPriority(storage, "low").length;

	lines.push(`\nBy Priority:`);
	lines.push(`  Urgent: ${urgent}`);
	lines.push(`  High: ${high}`);
	lines.push(`  Medium: ${medium}`);
	lines.push(`  Low: ${low}`);

	return lines.join("\n");
}

// ============================================
// Extension Registration
// ============================================

// モジュールレベルのフラグ（reload時のリスナー重複登録防止）
let isInitialized = false;

export default function (pi: ExtensionAPI) {
	if (isInitialized) return;
	isInitialized = true;

	// Tool: Create a new task
	pi.registerTool({
		name: "task_create",
		label: "Create Task",
		description: "Create a new task with title, description, priority, tags, due date, and assignee",
		parameters: Type.Object({
			title: Type.String({ description: "Title of the task" }),
			description: Type.Optional(Type.String({ description: "Description of the task" })),
			priority: Type.Optional(Type.String({ description: "Priority: low, medium, high, or urgent (default: medium)" })),
			tags: Type.Optional(Type.Array(Type.String({ description: "Tags for categorization" }))),
			dueDate: Type.Optional(Type.String({ description: "Due date in ISO 8601 format (e.g., 2024-12-31)" })),
			assignee: Type.Optional(Type.String({ description: "Person assigned to the task" })),
			parentTaskId: Type.Optional(Type.String({ description: "Parent task ID for subtasks" })),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const _operationId = logger.startOperation("task_create" as OperationType, params.title, {
				task: params.title,
				params,
			});

			const validPriorities: TaskPriority[] = ["low", "medium", "high", "urgent"];
			const priority = (params.priority as TaskPriority) || "medium";
			if (params.priority && !validPriorities.includes(priority)) {
				return {
					content: [{ type: "text", text: `Invalid priority. Must be one of: ${validPriorities.join(", ")}` }],
					details: {}
				};
			}

			const storage = loadStorage();

			// Verify parent task exists if specified
			if (params.parentTaskId && !findTaskById(storage, params.parentTaskId)) {
				return {
					content: [{ type: "text", text: `Parent task not found: ${params.parentTaskId}` }],
					details: {}
				};
			}

			const task = createTask(
				params.title,
				params.description,
				priority,
				params.tags || [],
				params.dueDate,
				params.assignee,
				params.parentTaskId
			);
			storage.tasks.push(task);
			saveStorage(storage);

			logger.endOperation({
				status: "success",
				tokensUsed: 0,
				outputLength: 0,
				childOperations: 0,
				toolCalls: 0,
			});

			return {
				content: [{ type: "text", text: `Task created:\n\n${formatTaskDetails(task)}` }],
				details: { taskId: task.id }
			};
		},
	});

	// Tool: List all tasks
	pi.registerTool({
		name: "task_list",
		label: "List Tasks",
		description: "List all tasks with optional filtering by status, priority, tag, or assignee",
		parameters: Type.Object({
			status: Type.Optional(Type.String({ description: "Filter by status: todo, in_progress, completed, cancelled" })),
			priority: Type.Optional(Type.String({ description: "Filter by priority: low, medium, high, urgent" })),
			tag: Type.Optional(Type.String({ description: "Filter by tag" })),
			assignee: Type.Optional(Type.String({ description: "Filter by assignee" })),
			overdue: Type.Optional(Type.Boolean({ description: "Show only overdue tasks" })),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const storage = loadStorage();
			let tasks = storage.tasks;

			if (params.status) {
				const validStatuses: TaskStatus[] = ["todo", "in_progress", "completed", "cancelled", "failed"];
				if (!validStatuses.includes(params.status as TaskStatus)) {
					return {
						content: [{ type: "text", text: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }],
						details: {}
					};
				}
				tasks = filterByStatus({ tasks }, params.status as TaskStatus);
			}

			if (params.priority) {
				const validPriorities: TaskPriority[] = ["low", "medium", "high", "urgent"];
				if (!validPriorities.includes(params.priority as TaskPriority)) {
					return {
						content: [{ type: "text", text: `Invalid priority. Must be one of: ${validPriorities.join(", ")}` }],
						details: {}
					};
				}
				tasks = filterByPriority({ tasks }, params.priority as TaskPriority);
			}

			if (params.tag) {
				tasks = filterByTag({ tasks }, params.tag);
			}

			if (params.assignee) {
				tasks = filterByAssignee({ tasks }, params.assignee);
			}

			if (params.overdue) {
				tasks = getOverdueTasks({ tasks });
			}

			let title = "Tasks";
			if (params.status) title = `${params.status} tasks`;
			if (params.overdue) title = "Overdue tasks";

			return {
				content: [{ type: "text", text: formatTaskList(tasks, title) }],
				details: { count: tasks.length }
			};
		},
	});

	// Tool: Show task details
	pi.registerTool({
		name: "task_show",
		label: "Show Task",
		description: "Show detailed information about a specific task",
		parameters: Type.Object({
			taskId: Type.String({ description: "ID of the task to show" }),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const storage = loadStorage();
			const task = findTaskById(storage, params.taskId);

			if (!task) {
				return {
					content: [{ type: "text", text: `Task not found: ${params.taskId}` }],
					details: {}
				};
			}

			// Also show subtasks if any
			const subtasks = getSubtasks(storage, task.id);
			let output = formatTaskDetails(task);
			if (subtasks.length > 0) {
				output += `\n\n### Subtasks (${subtasks.length})`;
				subtasks.forEach(st => {
					output += `\n- ${getStatusIcon(st.status)} ${st.title} (${st.id})`;
				});
			}

			return {
				content: [{ type: "text", text: output }],
				details: { taskId: task.id, subtaskCount: subtasks.length }
			};
		},
	});

	// Tool: Update task
	pi.registerTool({
		name: "task_update",
		label: "Update Task",
		description: "Update task properties (title, description, status, priority, tags, due date, assignee)",
		parameters: Type.Object({
			taskId: Type.String({ description: "ID of the task to update" }),
			title: Type.Optional(Type.String({ description: "New title" })),
			description: Type.Optional(Type.String({ description: "New description" })),
			status: Type.Optional(Type.String({ description: "New status: todo, in_progress, completed, cancelled" })),
			priority: Type.Optional(Type.String({ description: "New priority: low, medium, high, urgent" })),
			tags: Type.Optional(Type.Array(Type.String({ description: "New tags" }))),
			dueDate: Type.Optional(Type.String({ description: "New due date in ISO 8601 format" })),
			assignee: Type.Optional(Type.String({ description: "New assignee" })),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const _operationId = logger.startOperation("task_update" as OperationType, params.taskId, {
				task: params.taskId,
				params,
			});

			const storage = loadStorage();

			const updates: Partial<Task> = {};
			if (params.title !== undefined) updates.title = params.title;
			if (params.description !== undefined) updates.description = params.description;
			if (params.status !== undefined) {
				const validStatuses: TaskStatus[] = ["todo", "in_progress", "completed", "cancelled", "failed"];
				if (!validStatuses.includes(params.status as TaskStatus)) {
					return {
						content: [{ type: "text", text: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }],
						details: {}
					};
				}
				updates.status = params.status as TaskStatus;
			}
			if (params.priority !== undefined) {
				const validPriorities: TaskPriority[] = ["low", "medium", "high", "urgent"];
				if (!validPriorities.includes(params.priority as TaskPriority)) {
					return {
						content: [{ type: "text", text: `Invalid priority. Must be one of: ${validPriorities.join(", ")}` }],
						details: {}
					};
				}
				updates.priority = params.priority as TaskPriority;
			}
			if (params.tags !== undefined) updates.tags = params.tags;
			if (params.dueDate !== undefined) updates.dueDate = params.dueDate;
			if (params.assignee !== undefined) updates.assignee = params.assignee;

			const task = updateTask(storage, params.taskId, updates);

			if (!task) {
				return {
					content: [{ type: "text", text: `Task not found: ${params.taskId}` }],
					details: {}
				};
			}

			saveStorage(storage);

			logger.endOperation({
				status: "success",
				tokensUsed: 0,
				outputLength: 0,
				childOperations: 0,
				toolCalls: 0,
			});

			return {
				content: [{ type: "text", text: `Task updated:\n\n${formatTaskDetails(task)}` }],
				details: { taskId: task.id }
			};
		},
	});

	// Tool: Complete task
	pi.registerTool({
		name: "task_complete",
		label: "Complete Task",
		description: "Mark a task as completed",
		parameters: Type.Object({
			taskId: Type.String({ description: "ID of the task to complete" }),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const _operationId = logger.startOperation("task_complete" as OperationType, params.taskId, {
				task: params.taskId,
				params: { taskId: params.taskId },
			});

			const storage = loadStorage();
			const task = completeTask(storage, params.taskId);

			if (!task) {
				return {
					content: [{ type: "text", text: `Task not found: ${params.taskId}` }],
					details: {}
				};
			}

			saveStorage(storage);

			logger.endOperation({
				status: "success",
				tokensUsed: 0,
				outputLength: 0,
				childOperations: 0,
				toolCalls: 0,
			});

			return {
				content: [{ type: "text", text: `Task completed:\n\n${formatTaskDetails(task)}` }],
				details: { taskId: task.id }
			};
		},
	});

	// Tool: Delete task
	pi.registerTool({
		name: "task_delete",
		label: "Delete Task",
		description: "Delete a task by ID",
		parameters: Type.Object({
			taskId: Type.String({ description: "ID of the task to delete" }),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const _operationId = logger.startOperation("task_delete" as OperationType, params.taskId, {
				task: params.taskId,
				params: { taskId: params.taskId },
			});

			const storage = loadStorage();
			const task = findTaskById(storage, params.taskId);

			if (!task) {
				return {
					content: [{ type: "text", text: `Task not found: ${params.taskId}` }],
					details: {}
				};
			}

			// Also delete subtasks
			const subtasks = getSubtasks(storage, params.taskId);
			storage.tasks = storage.tasks.filter(t => t.id !== params.taskId && t.parentTaskId !== params.taskId);

			saveStorage(storage);

			logger.endOperation({
				status: "success",
				tokensUsed: 0,
				outputLength: 0,
				childOperations: 0,
				toolCalls: 0,
			});

			const message = subtasks.length > 0
				? `Task deleted: ${task.title} (${task.id})\nAlso deleted ${subtasks.length} subtask(s)`
				: `Task deleted: ${task.title} (${task.id})`;

			return {
				content: [{ type: "text", text: message }],
				details: { deletedTaskId: params.taskId, deletedSubtaskCount: subtasks.length }
			};
		},
	});

	// Tool: Task statistics
	pi.registerTool({
		name: "task_stats",
		label: "Task Statistics",
		description: "Show task statistics and summary",
		parameters: Type.Object({}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const storage = loadStorage();
			return {
				content: [{ type: "text", text: formatTaskStats(storage) }],
				details: { totalTasks: storage.tasks.length }
			};
		},
	});

	// Slash command: /task
	pi.registerCommand("task", {
		description: "Task management commands (list, create, show, stats)",
		handler: async (args, ctx) => {
			if (!args || args === "help" || args === "") {
				ctx.ui.notify("Task commands: list, create <title>, show <id>, stats", "info");
			} else if (args === "list") {
				const storage = loadStorage();
				ctx.ui.notify(formatTaskList(storage.tasks), "info");
			} else if (args === "stats") {
				const storage = loadStorage();
				ctx.ui.notify(formatTaskStats(storage), "info");
			} else if (args.startsWith("create ")) {
				const title = args.substring(7).trim();
				if (title) {
					const storage = loadStorage();
					const task = createTask(title);
					storage.tasks.push(task);
					saveStorage(storage);
					ctx.ui.notify(`Created task: ${task.id}`, "info");
				} else {
					ctx.ui.notify("Usage: /task create <title>", "error");
				}
			} else if (args.startsWith("show ")) {
				const taskId = args.substring(5).trim();
				const storage = loadStorage();
				const task = findTaskById(storage, taskId);
				if (task) {
					ctx.ui.notify(formatTaskDetails(task), "info");
				} else {
					ctx.ui.notify(`Task not found: ${taskId}`, "error");
				}
			} else {
				ctx.ui.notify(`Unknown command: ${args}. Use: list, create, show, stats`, "error");
			}
		},
	});

	// Extension loaded notification
	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.notify("Task Extension loaded", "info");
	});

	// セッション終了時にリスナー重複登録防止フラグをリセット
	pi.on("session_shutdown", async () => {
		isInitialized = false;
	});
}
