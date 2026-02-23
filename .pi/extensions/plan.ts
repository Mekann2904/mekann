/**
 * @abdd.meta
 * path: .pi/extensions/plan.ts
 * role: プラン（作業計画）の作成、管理、実行機能を提供する拡張モジュール
 * why: 構造化されたタスク計画とステップ実行の管理を可能にするため
 * related: README.md, .pi/extensions/loop.ts, .pi/lib/plan-mode-shared.ts, .pi/lib/comprehensive-logger.ts
 * public_api: createPlan, ensurePlanDir, loadStorage, saveStorage, Plan, PlanStep
 * invariants: storage.jsonは常に有効なJSON形式、PlanStepのstatusは列挙値のいずれか、planIdSequenceは単調増加
 * side_effects: .pi/plans/storage.json への読み書き、.pi/plans ディレクトリの作成
 * failure_modes: ディレクトリ作成権限がない場合、storage.jsonの破損によるパースエラー、ディスク容量不足
 * @abdd.explain
 * overview: プラン管理機能の追加により、タスクの段階的計画と実行状態の追跡を行う
 * what_it_does:
 *   - .pi/plans/storage.json へのプランデータの永続化
 *   - PlanおよびPlanStepインターフェースに基づく構造管理
 *   - プランIDの生成とステータス管理（pending, in_progress, completed, blocked）
 *   - plan-mode-shared.tsと連携したモード管理の状態操作
 * why_it_exists:
 *   - 複雑なタスクを分割して管理するため
 *   - 作業の進捗を可視化し、実行履歴を残すため
 * scope:
 *   in: Plan名、説明、ステップ定義、外部からのAPI呼び出し
 *   out: storage.jsonへの更新、ロガーへの操作出力、AgentMessage形式の応答
 */

// File: .pi/extensions/plan.ts
// Description: Adds plan management functionality for pi - create, manage, and execute task plans
// Why: Enables structured task planning with step-by-step execution
// Related: README.md, .pi/extensions/loop.ts

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { AgentMessage } from "@mariozechner/pi-agent-core";

import { getLogger } from "../lib/comprehensive-logger";
import type { OperationType } from "../lib/comprehensive-logger-types";

const logger = getLogger();

// Import shared plan mode constants and utilities
import {
	PLAN_MODE_POLICY,
	isBashCommandAllowed,
	validatePlanModeState,
	createPlanModeState,
	PLAN_MODE_CONTEXT_TYPE,
	PLAN_MODE_STATUS_KEY,
	PLAN_MODE_ENV_VAR,
	type PlanModeState,
} from "../lib/plan-mode-shared";

// ============================================
// Global State
// ============================================

let planModeEnabled = false;
let planIdSequence = 0;

// ============================================
// Type Definitions
// ============================================

/**
 * CustomMessage型かどうかを判定する型ガード関数
 * CustomMessageは role: "custom" と customType プロパティを持つ
 */
function isCustomMessage(msg: AgentMessage): msg is AgentMessage & { customType: string } {
  return "customType" in msg;
}

interface PlanStep {
	id: string;
	title: string;
	description?: string;
	status: "pending" | "in_progress" | "completed" | "blocked";
	estimatedTime?: number; // minutes
	dependencies?: string[]; // step IDs
}

interface Plan {
	id: string;
	name: string;
	description?: string;
	createdAt: string;
	updatedAt: string;
	status: "draft" | "active" | "completed" | "cancelled";
	steps: PlanStep[];
}

interface PlanStorage {
	plans: Plan[];
	currentPlanId?: string;
}

// ============================================
// Storage Management
// ============================================

const PLAN_DIR = ".pi/plans";
const STORAGE_FILE = join(PLAN_DIR, "storage.json");

function ensurePlanDir(): void {
	if (!existsSync(PLAN_DIR)) {
		mkdirSync(PLAN_DIR, { recursive: true });
	}
}

function loadStorage(): PlanStorage {
	ensurePlanDir();
	if (!existsSync(STORAGE_FILE)) {
		const empty: PlanStorage = { plans: [] };
		writeFileSync(STORAGE_FILE, JSON.stringify(empty, null, 2), "utf-8");
		return empty;
	}
	try {
		const content = readFileSync(STORAGE_FILE, "utf-8");
		return JSON.parse(content);
	} catch {
		return { plans: [] };
	}
}

function saveStorage(storage: PlanStorage): void {
	ensurePlanDir();
	writeFileSync(STORAGE_FILE, JSON.stringify(storage, null, 2), "utf-8");
}

function generateId(): string {
	planIdSequence += 1;
	return `${Date.now()}-${planIdSequence}`;
}

// ============================================
// Plan Operations
// ============================================

function createPlan(name: string, description?: string): Plan {
	const plan: Plan = {
		id: generateId(),
		name,
		description,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		status: "draft",
		steps: []
	};
	return plan;
}

function findPlanById(storage: PlanStorage, planId: string): Plan | undefined {
	return storage.plans.find(p => p.id === planId);
}

function findStepById(plan: Plan, stepId: string): PlanStep | undefined {
	return plan.steps.find(s => s.id === stepId);
}

function addStepToPlan(plan: Plan, title: string, description?: string, dependencies?: string[]): PlanStep {
	const step: PlanStep = {
		id: generateId(),
		title,
		description,
		status: "pending",
		dependencies
	};
	plan.steps.push(step);
	plan.updatedAt = new Date().toISOString();
	return step;
}

function updateStepStatus(plan: Plan, stepId: string, status: PlanStep["status"]): boolean {
	const step = findStepById(plan, stepId);
	if (!step) return false;
	step.status = status;
	plan.updatedAt = new Date().toISOString();
	return true;
}

function getReadySteps(plan: Plan): PlanStep[] {
	const completedStepIds = new Set(
		plan.steps.filter(s => s.status === "completed").map(s => s.id)
	);

	return plan.steps.filter(step => {
		if (step.status !== "pending") return false;
		if (!step.dependencies || step.dependencies.length === 0) return true;
		return step.dependencies.every(depId => completedStepIds.has(depId));
	});
}

function formatPlanSummary(plan: Plan): string {
	const lines: string[] = [];
	lines.push(`## Plan: ${plan.name}`);
	if (plan.description) {
		lines.push(`\n${plan.description}`);
	}
	lines.push(`\nStatus: ${plan.status}`);
	lines.push(`Created: ${new Date(plan.createdAt).toLocaleString()}`);
	lines.push(`Updated: ${new Date(plan.updatedAt).toLocaleString()}`);

	const statusCounts = {
		pending: plan.steps.filter(s => s.status === "pending").length,
		in_progress: plan.steps.filter(s => s.status === "in_progress").length,
		completed: plan.steps.filter(s => s.status === "completed").length,
		blocked: plan.steps.filter(s => s.status === "blocked").length
	};

	lines.push(`\nProgress: ${statusCounts.completed}/${plan.steps.length} steps completed`);
	lines.push(`  Pending: ${statusCounts.pending} | In Progress: ${statusCounts.in_progress} | Completed: ${statusCounts.completed} | Blocked: ${statusCounts.blocked}`);

	if (plan.steps.length > 0) {
		lines.push("\n### Steps:");
		plan.steps.forEach((step, idx) => {
			const icon = step.status === "completed" ? "✓" : step.status === "in_progress" ? "→" : step.status === "blocked" ? "⊗" : "○";
			lines.push(`${idx + 1}. [${icon}] ${step.title}`);
			if (step.description) {
				lines.push(`   ${step.description}`);
			}
			if (step.dependencies && step.dependencies.length > 0) {
				lines.push(`   Depends on: ${step.dependencies.join(", ")}`);
			}
		});
	}

	return lines.join("\n");
}

function formatPlanList(plans: Plan[]): string {
	if (plans.length === 0) {
		return "No plans found. Create one using plan_create.";
	}

	const lines: string[] = ["## Plans"];
	plans.forEach(plan => {
		const progress = plan.steps.length > 0
			? `${plan.steps.filter(s => s.status === "completed").length}/${plan.steps.length}`
			: "0/0";
		lines.push(`\n### ${plan.name}`);
		lines.push(`ID: ${plan.id}`);
		lines.push(`Status: ${plan.status} | Progress: ${progress}`);
		if (plan.description) {
			lines.push(`Description: ${plan.description}`);
		}
	});
	return lines.join("\n");
}

// ============================================
// Extension Registration
// ============================================

export default function (pi: ExtensionAPI) {
	// ============================================
	// Plan Mode (Read-only mode)
	// ============================================

	const READ_ONLY_TOOLS = ["read", "grep", "find", "ls"];
	const WRITE_TOOLS = ["edit", "write"];

	// Tools available in plan mode
	const PLAN_MODE_TOOLS = ["read", "bash", "grep", "find", "ls"];
	// Tools available in normal mode
	const NORMAL_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "edit", "write"];

	// ============================================
	// Plan Mode State Persistence
	// ============================================

	const PLAN_STATE_FILE = join(PLAN_DIR, "plan-mode-state.json");

	function syncPlanModeEnv(enabled: boolean): void {
		if (enabled) {
			process.env[PLAN_MODE_ENV_VAR] = "1";
			return;
		}
		delete process.env[PLAN_MODE_ENV_VAR];
	}

	function savePlanModeState(enabled: boolean): void {
		ensurePlanDir();

		// Use atomic write via temp file
		const tempFile = `${PLAN_STATE_FILE}.tmp`;
		const state = createPlanModeState(enabled);
		writeFileSync(tempFile, JSON.stringify(state, null, 2), "utf-8");
		renameSync(tempFile, PLAN_STATE_FILE); // Atomic on POSIX

		// Keep env flag in sync so other extensions see the real plan mode state.
		syncPlanModeEnv(enabled);
	}

	function loadPlanModeState(): boolean {
		if (!existsSync(PLAN_STATE_FILE)) {
			syncPlanModeEnv(false);
			return false;
		}
		try {
			const content = readFileSync(PLAN_STATE_FILE, "utf-8");
			const state: PlanModeState = JSON.parse(content);

			// Validate checksum to detect corruption/tampering
			if (!validatePlanModeState(state)) {
				console.error('Plan mode state file corrupted - disabling for safety');
				syncPlanModeEnv(false);
				return false;
			}

			// Restore environment variable only when plan mode is truly enabled.
			syncPlanModeEnv(state.enabled === true);

			return state.enabled === true;
		} catch (error) {
			console.error('Error loading plan mode state:', error);
			syncPlanModeEnv(false);
			return false; // Fail-safe: disable plan mode on error
		}
	}

	function togglePlanMode(ctx: any) {
		planModeEnabled = !planModeEnabled;
		savePlanModeState(planModeEnabled);

		if (planModeEnabled) {
			// NOTE: Tool restriction DISABLED - all tools available
			// pi.setActiveTools(PLAN_MODE_TOOLS);
			ctx.ui.notify("PLAN MODE: Read-only enabled (no restrictions)", "info");
			ctx.ui.setStatus(PLAN_MODE_STATUS_KEY, "PLAN MODE");
		} else {
			// NOTE: No restriction changes needed
			// pi.setActiveTools(NORMAL_MODE_TOOLS);
			ctx.ui.notify("PLAN MODE: Disabled", "info");
			ctx.ui.setStatus(PLAN_MODE_STATUS_KEY, undefined);
		}
	}

	// ============================================
	// P0: Context Injection via before_agent_start
	// ============================================

	pi.on("before_agent_start", async (event, _ctx) => {
		if (!planModeEnabled) return;

		return {
			systemPrompt: `${event.systemPrompt}\n\n${PLAN_MODE_POLICY}`,
			message: {
				customType: PLAN_MODE_CONTEXT_TYPE,
				content: "PLAN MODE is active. Restrictions are disabled and all tools are available.",
				display: false,
			},
		};
	});

	// ============================================
	// P2: Context Cleanup via context event
	// ============================================

	pi.on("context", async (event) => {
		// If plan mode is enabled, no cleanup needed
		if (planModeEnabled) return;

		// If plan mode is disabled, filter out plan mode context messages
		return {
			messages: event.messages.filter((m) => {
				if (isCustomMessage(m) && m.customType === PLAN_MODE_CONTEXT_TYPE) return false;
				return true;
			}),
		};
	});

	// NOTE: Plan mode tool_call blocking DISABLED to allow normal bash command operation
	// Block write operations in plan mode
	// pi.on("tool_call", async (event, ctx) => {
	// 	if (planModeEnabled) {
	// 		// Check bash commands with enhanced filtering
	// 		if (event.toolName === "bash") {
	// 			const command = (event.input as any)?.command;
	// 			if (command && !isBashCommandAllowed(command)) {
	// 				return {
	// 					block: true,
	// 					reason: `PLAN MODE: Command blocked in plan mode. Command: ${command}\nExit plan mode to make changes.`
	// 				};
	// 			}
	// 		}
	// 		// Block write tools
	// 		else if (WRITE_TOOLS.includes(event.toolName)) {
	// 			return {
	// 				block: true,
	// 				reason: `PLAN MODE: ${event.toolName} tool disabled in plan mode.\nExit plan mode to make changes.`
	// 			};
	// 		}
	// 	}
	// });

	// Slash command to toggle plan mode
	pi.registerCommand("planmode", {
		description: "Toggle plan mode (read-only / read-write)",
		handler: async (_args, ctx) => {
			togglePlanMode(ctx);
		},
	});

	// Tool: Create a new plan
	pi.registerTool({
		name: "plan_create",
		label: "Create Plan",
		description: "Create a new task plan with a name and optional description",
		parameters: Type.Object({
			name: Type.String({ description: "Name of the plan" }),
			description: Type.Optional(Type.String({ description: "Description of the plan" })),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const _operationId = logger.startOperation("plan_create" as OperationType, params.name, {
				task: params.name,
				params: { name: params.name, description: params.description },
			});

			const storage = loadStorage();
			const plan = createPlan(params.name, params.description);
			storage.plans.push(plan);
			saveStorage(storage);

			logger.endOperation({
				status: "success",
				tokensUsed: 0,
				outputLength: 0,
				childOperations: 0,
				toolCalls: 0,
			});

			return {
				content: [{ type: "text", text: `Plan created:\n\n${formatPlanSummary(plan)}` }],
				details: { planId: plan.id }
			};
		},
	});

	// Tool: List all plans
	pi.registerTool({
		name: "plan_list",
		label: "List Plans",
		description: "List all existing plans",
		parameters: Type.Object({}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const storage = loadStorage();
			return {
				content: [{ type: "text", text: formatPlanList(storage.plans) }],
				details: { count: storage.plans.length }
			};
		},
	});

	// Tool: Show plan details
	pi.registerTool({
		name: "plan_show",
		label: "Show Plan",
		description: "Show detailed information about a specific plan",
		parameters: Type.Object({
			planId: Type.String({ description: "ID of the plan to show" }),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const storage = loadStorage();
			const plan = findPlanById(storage, params.planId);

			if (!plan) {
				return {
					content: [{ type: "text", text: `Plan not found: ${params.planId}` }],
					details: {}
				};
			}

			return {
				content: [{ type: "text", text: formatPlanSummary(plan) }],
				details: { planId: plan.id, stepCount: plan.steps.length }
			};
		},
	});

	// Tool: Add a step to a plan
	pi.registerTool({
		name: "plan_add_step",
		label: "Add Step",
		description: "Add a step to a plan with optional description and dependencies",
		parameters: Type.Object({
			planId: Type.String({ description: "ID of the plan to add step to" }),
			title: Type.String({ description: "Title of the step" }),
			description: Type.Optional(Type.String({ description: "Description of what this step involves" })),
			dependencies: Type.Optional(Type.Array(Type.String({ description: "Step IDs this step depends on" }))),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const _operationId = logger.startOperation("plan_add_step" as OperationType, params.title, {
				task: `Add step: ${params.title}`,
				params: { planId: params.planId, title: params.title },
			});

			const storage = loadStorage();
			const plan = findPlanById(storage, params.planId);

			if (!plan) {
				return {
					content: [{ type: "text", text: `Plan not found: ${params.planId}` }],
					details: {}
				};
			}

			const step = addStepToPlan(plan, params.title, params.description, params.dependencies);
			saveStorage(storage);

			logger.endOperation({
				status: "success",
				tokensUsed: 0,
				outputLength: 0,
				childOperations: 0,
				toolCalls: 0,
			});

			return {
				content: [{ type: "text", text: `Step added to plan "${plan.name}":\n\n• ${step.title}${step.description ? `\n  ${step.description}` : ""}` }],
				details: { planId: plan.id, stepId: step.id }
			};
		},
	});

	// Tool: Update step status
	pi.registerTool({
		name: "plan_update_step",
		label: "Update Step Status",
		description: "Update the status of a step (pending, in_progress, completed, blocked)",
		parameters: Type.Object({
			planId: Type.String({ description: "ID of the plan" }),
			stepId: Type.String({ description: "ID of the step to update" }),
			status: Type.String({ description: "New status: pending, in_progress, completed, or blocked" }),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const _operationId = logger.startOperation("plan_update_step" as OperationType, params.stepId, {
				task: `Update step: ${params.stepId}`,
				params: { planId: params.planId, stepId: params.stepId, status: params.status },
			});

			const storage = loadStorage();
			const plan = findPlanById(storage, params.planId);

			if (!plan) {
				return {
					content: [{ type: "text", text: `Plan not found: ${params.planId}` }],
					details: {}
				};
			}

			const validStatuses = ["pending", "in_progress", "completed", "blocked"];
			if (!validStatuses.includes(params.status)) {
				return {
					content: [{ type: "text", text: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }],
					details: {}
				};
			}

			const success = updateStepStatus(plan, params.stepId, params.status as PlanStep["status"]);

			if (!success) {
				return {
					content: [{ type: "text", text: `Step not found: ${params.stepId}` }],
					details: {}
				};
			}

			saveStorage(storage);
			const step = findStepById(plan, params.stepId);

			logger.endOperation({
				status: "success",
				tokensUsed: 0,
				outputLength: 0,
				childOperations: 0,
				toolCalls: 0,
			});

			return {
				content: [{ type: "text", text: `Step status updated:\n\n• ${step?.title} → ${params.status}` }],
				details: { planId: plan.id, stepId: params.stepId, status: params.status }
			};
		},
	});

	// Tool: Get ready steps
	pi.registerTool({
		name: "plan_ready_steps",
		label: "Get Ready Steps",
		description: "Get steps that are ready to execute (all dependencies completed)",
		parameters: Type.Object({
			planId: Type.String({ description: "ID of the plan" }),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const storage = loadStorage();
			const plan = findPlanById(storage, params.planId);

			if (!plan) {
				return {
					content: [{ type: "text", text: `Plan not found: ${params.planId}` }],
					details: {}
				};
			}

			const readySteps = getReadySteps(plan);

			if (readySteps.length === 0) {
				return {
					content: [{ type: "text", text: "No steps ready to execute. All pending steps have unmet dependencies or no pending steps remain." }],
					details: { count: 0 }
				};
			}

			const lines: string[] = [`## Ready Steps (${readySteps.length})`];
			readySteps.forEach((step, idx) => {
				lines.push(`\n${idx + 1}. ${step.title}`);
				if (step.description) {
					lines.push(`   ${step.description}`);
				}
			});

			return {
				content: [{ type: "text", text: lines.join("\n") }],
				details: { count: readySteps.length, stepIds: readySteps.map(s => s.id) }
			};
		},
	});

	// Tool: Delete plan
	pi.registerTool({
		name: "plan_delete",
		label: "Delete Plan",
		description: "Delete a plan by ID",
		parameters: Type.Object({
			planId: Type.String({ description: "ID of the plan to delete" }),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const _operationId = logger.startOperation("plan_delete" as OperationType, params.planId, {
				task: `Delete plan: ${params.planId}`,
				params: { planId: params.planId },
			});

			const storage = loadStorage();
			const initialCount = storage.plans.length;
			storage.plans = storage.plans.filter(p => p.id !== params.planId);

			if (storage.plans.length === initialCount) {
				return {
					content: [{ type: "text", text: `Plan not found: ${params.planId}` }],
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
				content: [{ type: "text", text: `Plan deleted: ${params.planId}` }],
				details: { deletedPlanId: params.planId }
			};
		},
	});

	// Tool: Update plan status
	pi.registerTool({
		name: "plan_update_status",
		label: "Update Plan Status",
		description: "Update the status of a plan (draft, active, completed, cancelled)",
		parameters: Type.Object({
			planId: Type.String({ description: "ID of the plan" }),
			status: Type.String({ description: "New status: draft, active, completed, or cancelled" }),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const _operationId = logger.startOperation("plan_update_status" as OperationType, params.planId, {
				task: `Update status: ${params.planId}`,
				params: { planId: params.planId, status: params.status },
			});

			const storage = loadStorage();
			const plan = findPlanById(storage, params.planId);

			if (!plan) {
				return {
					content: [{ type: "text", text: `Plan not found: ${params.planId}` }],
					details: {}
				};
			}

			const validStatuses = ["draft", "active", "completed", "cancelled"];
			if (!validStatuses.includes(params.status)) {
				return {
					content: [{ type: "text", text: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }],
					details: {}
				};
			}

			plan.status = params.status as Plan["status"];
			plan.updatedAt = new Date().toISOString();
			saveStorage(storage);

			logger.endOperation({
				status: "success",
				tokensUsed: 0,
				outputLength: 0,
				childOperations: 0,
				toolCalls: 0,
			});

			return {
				content: [{ type: "text", text: `Plan "${plan.name}" status updated to: ${params.status}` }],
				details: { planId: plan.id, status: params.status }
			};
		},
	});

	// Slash command: /plan
	pi.registerCommand("plan", {
		description: "Plan management commands (list, create, show)",
		handler: async (args, ctx) => {
			if (!args || args === "help" || args === "") {
				ctx.ui.notify("Plan commands: list, create <name>, show <id>", "info");
			} else if (args === "list") {
				const storage = loadStorage();
				ctx.ui.notify(formatPlanList(storage.plans), "info");
			} else if (args.startsWith("create ")) {
				const name = args.substring(7).trim();
				if (name) {
					const storage = loadStorage();
					const plan = createPlan(name);
					storage.plans.push(plan);
					saveStorage(storage);
					ctx.ui.notify(`Created plan: ${plan.id}`, "success");
				} else {
					ctx.ui.notify("Usage: /plan create <name>", "error");
				}
			} else if (args.startsWith("show ")) {
				const planId = args.substring(5).trim();
				const storage = loadStorage();
				const plan = findPlanById(storage, planId);
				if (plan) {
					ctx.ui.notify(formatPlanSummary(plan), "info");
				} else {
					ctx.ui.notify(`Plan not found: ${planId}`, "error");
				}
			} else {
				ctx.ui.notify(`Unknown command: ${args}. Use: list, create, show`, "error");
			}
		},
	});

	// Keyboard shortcut: Ctrl+Shift+P for plan mode toggle
	pi.registerShortcut("ctrl+shift+p", {
		description: "Toggle plan mode (read-only)",
		handler: async (ctx) => {
			togglePlanMode(ctx);
		},
	});

	// Extension loaded notification
	pi.on("session_start", async (_event, ctx) => {
		// Load plan mode state from file
		planModeEnabled = loadPlanModeState();

		ctx.ui.notify("Plan Extension loaded (restrictions disabled)", "info");
		if (planModeEnabled) {
			// NOTE: Tool restrictions DISABLED
			// pi.setActiveTools(PLAN_MODE_TOOLS);
			ctx.ui.setStatus(PLAN_MODE_STATUS_KEY, "PLAN MODE");
			ctx.ui.notify("PLAN MODE restored from saved state (no restrictions)", "info");
			return;
		}
		ctx.ui.setStatus(PLAN_MODE_STATUS_KEY, undefined);
	});
}
