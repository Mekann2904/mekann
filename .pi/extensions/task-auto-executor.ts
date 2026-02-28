/**
 * @abdd.meta
 * path: .pi/extensions/task-auto-executor.ts
 * role: エージェントのアイドル時に未実行タスクを自動的に取得・通知・実行する拡張機能
 * why: 人間がタスクを積んでおき、エージェントが暇なときに自動消化するため
 * related: .pi/extensions/task.ts, .pi/extensions/subagents.ts, .pi/extensions/agent-idle-indicator.ts
 * public_api: default関数, isAutoExecutorEnabled, toggleAutoExecutor, getNextPendingTask
 * invariants: 同時に1つのタスクのみ実行、ユーザー入力時は自動実行を一時停止
 * side_effects: タスクのステータス変更、サブエージェントの起動、UI通知
 * failure_modes: タスク実行エラー時はfailedステータスへ遷移
 * @abdd.explain
 * overview: アイドル検出から未実行タスクの自動取得・委任実行・ステータス更新までの一連のフローを管理
 * what_it_does:
 *   - agent_endイベントでアイドル状態を検出
 *   - 優先度順（urgent>high>medium>low）にtodoタスクを取得
 *   - ユーザーに次のタスクを通知し、実行指示を待つ
 *   - task_run_nextツールで次のタスクを実行
 * why_it_exists:
 *   - 人間がタスクを積むだけで、エージェントが自律的に作業を消化するため
 *   - アイドル時間を有効活用し、バックグラウンドで継続的な価値産出を行うため
 * scope:
 *   in: task.tsのストレージ、agent_end/agent_startイベント
 *   out: タスクステータスの更新、実行ログ、UI通知
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { getInstanceId, isProcessAlive, extractPidFromInstanceId } from "./ul-workflow.js";

import { getLogger } from "../lib/comprehensive-logger";
import type { OperationType } from "../lib/comprehensive-logger-types";

const logger = getLogger();

// ============================================
// Types
// ============================================

type TaskPriority = "low" | "medium" | "high" | "urgent";
type TaskStatus = "todo" | "in_progress" | "completed" | "cancelled" | "failed";

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
	ownerInstanceId?: string; // 所有するpiインスタンスID（sessionId-pid形式）
	claimedAt?: string;       // 所有取得時刻
}

interface TaskStorage {
	tasks: Task[];
	currentTaskId?: string;
}

interface AutoExecutorConfig {
	enabled: boolean;
	autoRun: boolean; // 自動実行するか、通知のみか
	currentTaskId?: string;
	maxRetries: number;
}

// ============================================
// Constants
// ============================================

const TASK_DIR = ".pi/tasks";
const STORAGE_FILE = join(TASK_DIR, "storage.json");
const CONFIG_FILE = join(TASK_DIR, "auto-executor-config.json");

const PRIORITY_ORDER: Record<TaskPriority, number> = {
	urgent: 4,
	high: 3,
	medium: 2,
	low: 1,
};

// ============================================
// State
// ============================================

let autoExecutorConfig: AutoExecutorConfig = {
	enabled: true,
	autoRun: false, // デフォルトは通知のみ
	maxRetries: 2,
};

let lastNotifiedTaskId: string | null = null;

// ============================================
// Storage Functions
// ============================================

function loadStorage(): TaskStorage {
	if (!existsSync(STORAGE_FILE)) {
		return { tasks: [] };
	}
	try {
		const data = readFileSync(STORAGE_FILE, "utf-8");
		return JSON.parse(data);
	} catch {
		return { tasks: [] };
	}
}

function saveStorage(storage: TaskStorage): void {
	if (!existsSync(TASK_DIR)) {
		mkdirSync(TASK_DIR, { recursive: true });
	}
	writeFileSync(STORAGE_FILE, JSON.stringify(storage, null, 2));
}

function loadConfig(): void {
	if (!existsSync(CONFIG_FILE)) {
		return;
	}
	try {
		const data = readFileSync(CONFIG_FILE, "utf-8");
		autoExecutorConfig = { ...autoExecutorConfig, ...JSON.parse(data) };
	} catch {
		// Use defaults
	}
}

function saveConfig(): void {
	if (!existsSync(TASK_DIR)) {
		mkdirSync(TASK_DIR, { recursive: true });
	}
	writeFileSync(CONFIG_FILE, JSON.stringify(autoExecutorConfig, null, 2));
}

// ============================================
// Task Selection
// ============================================

function getNextPendingTask(storage: TaskStorage): Task | null {
	const instanceId = getInstanceId();
	
	// 候補となるタスクを抽出
	const candidates = storage.tasks.filter(t => {
		// todoタスクは常に候補
		if (t.status === "todo") return true;
		
		// in_progressタスクは所有者チェック
		if (t.status === "in_progress") {
			// 所有者がいない → 候補に含める（古いデータの移行対応）
			if (!t.ownerInstanceId) return true;
			
			// 自分が所有している → 候補に含める
			if (t.ownerInstanceId === instanceId) return true;
			
			// 他のインスタンスが所有している → プロセスが死んでいれば再取得可能
			const pid = extractPidFromInstanceId(t.ownerInstanceId);
			if (pid && !isProcessAlive(pid)) return true;
			
			// 他のインスタンスが実行中 → スキップ
			return false;
		}
		
		return false;
	});
	
	if (candidates.length === 0) {
		return null;
	}

	// Sort by priority (highest first), then by creation date (oldest first)
	candidates.sort((a, b) => {
		const priorityDiff = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
		if (priorityDiff !== 0) return priorityDiff;
		return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
	});

	return candidates[0];
}

// ============================================
// Public API
// ============================================

export function isAutoExecutorEnabled(): boolean {
	return autoExecutorConfig.enabled;
}

export function getAutoExecutorStatus(): AutoExecutorConfig & { pendingCount: number } {
	const storage = loadStorage();
	const pendingCount = storage.tasks.filter(t => t.status === "todo").length;
	return { ...autoExecutorConfig, pendingCount };
}

export function toggleAutoExecutor(enabled?: boolean): void {
	autoExecutorConfig.enabled = enabled ?? !autoExecutorConfig.enabled;
	saveConfig();
}

// ============================================
// Extension Registration
// ============================================

// モジュールレベルのフラグ（reload時のリスナー重複登録防止）
let isInitialized = false;

export default function registerTaskAutoExecutor(pi: ExtensionAPI) {
	if (isInitialized) return;
	isInitialized = true;

	loadConfig();

	// Tool: Run next pending task
	pi.registerTool({
		name: "task_run_next",
		label: "Run Next Pending Task",
		description: "Execute the next pending task from the task queue (highest priority first)",
		parameters: Type.Object({}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const storage = loadStorage();
			const nextTask = getNextPendingTask(storage);

			if (!nextTask) {
				return {
					content: [{ type: "text", text: "実行待ちのタスクがありません。" }],
					details: { pendingCount: 0 }
				};
			}

			// Update status to in_progress and record owner
			const taskIndex = storage.tasks.findIndex(t => t.id === nextTask.id);
			const instanceId = getInstanceId();
			storage.tasks[taskIndex].status = "in_progress";
			storage.tasks[taskIndex].ownerInstanceId = instanceId;
			storage.tasks[taskIndex].claimedAt = new Date().toISOString();
			storage.tasks[taskIndex].updatedAt = new Date().toISOString();
			saveStorage(storage);

			autoExecutorConfig.currentTaskId = nextTask.id;
			saveConfig();

			// Build task description for execution
			const taskDescription = nextTask.description
				? `${nextTask.title}\n\n詳細: ${nextTask.description}`
				: nextTask.title;

			return {
				content: [{
					type: "text",
					text: `## 次のタスクを実行します

**タスクID**: ${nextTask.id}
**タイトル**: ${nextTask.title}
**優先度**: ${nextTask.priority}
**ステータス**: in_progress

---

以下のタスクを実行してください:

${taskDescription}

---

完了したら \`task_complete\` ツールでタスクID \`${nextTask.id}\` を完了してください。`,
				}],
				details: {
					taskId: nextTask.id,
					title: nextTask.title,
					priority: nextTask.priority,
					description: nextTask.description
				}
			};
		},
	});

	// Tool: Show pending tasks summary
	pi.registerTool({
		name: "task_queue_show",
		label: "Show Task Queue",
		description: "Display the current task queue with priorities and counts",
		parameters: Type.Object({}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const storage = loadStorage();
			const todoTasks = storage.tasks.filter(t => t.status === "todo");

			if (todoTasks.length === 0) {
				return {
					content: [{ type: "text", text: "タスクキューは空です。" }],
					details: { pendingCount: 0 }
				};
			}

			// Group by priority
			const grouped: Record<TaskPriority, Task[]> = {
				urgent: [],
				high: [],
				medium: [],
				low: [],
			};

			todoTasks.forEach(t => grouped[t.priority].push(t));

			let output = `## タスクキュー (${todoTasks.length}件)\n\n`;

			(["urgent", "high", "medium", "low"] as TaskPriority[]).forEach(priority => {
				const tasks = grouped[priority];
				if (tasks.length > 0) {
					output += `### ${priority.toUpperCase()} (${tasks.length}件)\n`;
					tasks.forEach(t => {
						output += `- [${t.id}] ${t.title}\n`;
						if (t.description) {
							output += `  ${t.description.slice(0, 60)}${t.description.length > 60 ? "..." : ""}\n`;
						}
					});
					output += "\n";
				}
			});

			const nextTask = getNextPendingTask(storage);
			if (nextTask) {
				output += `---\n**次に実行**: [${nextTask.id}] ${nextTask.title} (${nextTask.priority})`;
			}

			return {
				content: [{ type: "text", text: output }],
				details: {
					pendingCount: todoTasks.length,
					byPriority: {
						urgent: grouped.urgent.length,
						high: grouped.high.length,
						medium: grouped.medium.length,
						low: grouped.low.length,
					}
				}
			};
		},
	});

	// Tool: Toggle auto executor
	pi.registerTool({
		name: "task_auto_executor_toggle",
		label: "Toggle Task Auto Executor",
		description: "Enable or disable automatic task notification when idle",
		parameters: Type.Object({
			enabled: Type.Optional(Type.Boolean({ description: "Enable (true) or disable (false). Omit to toggle." })),
			autoRun: Type.Optional(Type.Boolean({ description: "Also enable automatic execution (not just notification)" })),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const previousEnabled = autoExecutorConfig.enabled;
			const previousAutoRun = autoExecutorConfig.autoRun;

			if (params.enabled !== undefined) {
				autoExecutorConfig.enabled = params.enabled;
			} else {
				autoExecutorConfig.enabled = !autoExecutorConfig.enabled;
			}

			if (params.autoRun !== undefined) {
				autoExecutorConfig.autoRun = params.autoRun;
			}

			saveConfig();

			return {
				content: [{
					type: "text",
					text: `## 自動タスク実行設定

- **有効**: ${previousEnabled ? "有効" : "無効"} → ${autoExecutorConfig.enabled ? "有効" : "無効"}
- **自動実行**: ${previousAutoRun ? "有効" : "無効"} → ${autoExecutorConfig.autoRun ? "有効" : "無効"}

※ 自動実行が無効の場合、アイドル時に次のタスクを通知のみ行います。`,
				}],
				details: {
					enabled: autoExecutorConfig.enabled,
					autoRun: autoExecutorConfig.autoRun,
				}
			};
		},
	});

	// Tool: Get auto executor status
	pi.registerTool({
		name: "task_auto_executor_status",
		label: "Task Auto Executor Status",
		description: "Show current auto executor configuration and status",
		parameters: Type.Object({}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const status = getAutoExecutorStatus();

			return {
				content: [{
					type: "text",
					text: `## 自動タスク実行ステータス

- **有効**: ${status.enabled ? "はい" : "いいえ"}
- **自動実行**: ${status.autoRun ? "はい" : "いいえ"}
- **現在のタスク**: ${status.currentTaskId || "なし"}
- **待機中タスク数**: ${status.pendingCount}
- **最大リトライ回数**: ${status.maxRetries}`,
				}],
				details: status
			};
		},
	});

	// Event: Agent ends (idle state) - notify about next task
	pi.on("agent_end", async (_event, ctx) => {
		if (!autoExecutorConfig.enabled) {
			return;
		}

		// Guard: ctx or ctx.ui may be undefined in some contexts
		if (!ctx?.ui) {
			return;
		}

		const storage = loadStorage();
		const nextTask = getNextPendingTask(storage);

		if (!nextTask) {
			ctx.ui.setStatus("auto-executor", undefined);
			return;
		}

		// Avoid notifying the same task repeatedly
		if (lastNotifiedTaskId === nextTask.id) {
			return;
		}
		lastNotifiedTaskId = nextTask.id;

		// Show status in footer
		ctx.ui.setStatus(
			"auto-executor",
			ctx.ui.theme.fg("warning", `次のタスク: ${nextTask.title.slice(0, 25)}...`)
		);

		// Notify about the next task
		ctx.ui.notify(
			`[アイドル] 次のタスク: ${nextTask.title} (${nextTask.priority})\n「次のタスクを実行して」と言うと実行します。`,
			"info"
		);
	});

	// Event: Agent starts - clear idle indicator
	pi.on("agent_start", async (_event, ctx) => {
		// guard: ctx or ctx.ui may be undefined in some contexts
		if (!ctx?.ui) {
			return;
		}
		ctx.ui.setStatus("auto-executor", undefined);
		lastNotifiedTaskId = null; // Reset notification tracking
	});

	// Event: Session start
	pi.on("session_start", async (_event, ctx) => {
		loadConfig();

		// guard: ctx or ctx.ui may be undefined in some contexts
		if (!ctx?.ui) {
			return;
		}

		const storage = loadStorage();
		const pendingCount = storage.tasks.filter(t => t.status === "todo").length;

		if (pendingCount > 0) {
			const nextTask = getNextPendingTask(storage);
			ctx.ui.notify(
				`[自動実行] ${pendingCount}件のタスクが待機中。${autoExecutorConfig.enabled ? "アイドル時に通知します。" : ""}`,
				"info"
			);
			if (nextTask) {
				ctx.ui.setStatus(
					"auto-executor",
					ctx.ui.theme.fg("warning", `待機中: ${pendingCount}タスク`)
				);
			}
		}
	});

	// Command: /auto-executor
	pi.registerCommand("auto-executor", {
		description: "Toggle or check auto task executor",
		handler: async (args, ctx) => {
			if (args === "status") {
				const status = getAutoExecutorStatus();
				ctx.ui.notify(
					`自動実行: ${status.enabled ? "有効" : "無効"} | 自動Run: ${status.autoRun ? "有効" : "無効"} | 待機中: ${status.pendingCount}件`,
					"info"
				);
			} else if (args === "on" || args === "enable") {
				autoExecutorConfig.enabled = true;
				saveConfig();
				ctx.ui.notify("自動タスク通知を有効にしました", "info");
			} else if (args === "off" || args === "disable") {
				autoExecutorConfig.enabled = false;
				saveConfig();
				ctx.ui.notify("自動タスク通知を無効にしました", "info");
			} else if (args === "auto") {
				autoExecutorConfig.autoRun = !autoExecutorConfig.autoRun;
				saveConfig();
				ctx.ui.notify(`自動実行: ${autoExecutorConfig.autoRun ? "有効" : "無効"}`, "info");
			} else {
				autoExecutorConfig.enabled = !autoExecutorConfig.enabled;
				saveConfig();
				ctx.ui.notify(
					`自動タスク通知: ${autoExecutorConfig.enabled ? "有効" : "無効"}`,
					"info"
				);
			}
		},
	});

	// セッション終了時にリスナー重複登録防止フラグをリセット
	pi.on("session_shutdown", async () => {
		isInitialized = false;
	});
}
