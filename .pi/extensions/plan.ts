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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

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
import {
	ensurePlanDir as ensureSharedPlanDir,
	loadPlanStorage as loadSharedPlanStorage,
	savePlanStorage as saveSharedPlanStorage,
	loadPlanModeState as loadSharedPlanModeState,
	savePlanModeState as saveSharedPlanModeState,
} from "../lib/storage/task-plan-store.js";
import { applyPromptStack } from "../lib/agent/prompt-stack.js";
import type { PromptStackEntry } from "../lib/agent/prompt-stack.js";
import {
	createRuntimeNotification,
	formatRuntimeNotificationBlock,
} from "../lib/agent/runtime-notifications.js";
import {
	loadWorkspaceVerificationConfig,
	loadWorkspaceVerificationState,
	resolveWorkspaceVerificationPlan,
	isCompletionBlocked,
} from "../lib/workspace-verification.js";

// ============================================
// Global State
// ============================================

let planModeEnabled = false;
let planIdSequence = 0;

const WRITE_TOOLS = new Set(["edit", "write", "patch"]);
const EXECUTION_BASH_TOOL = "bash";
const PLAN_REQUIRED_MUTATION_TOOLS = new Set([
	"edit",
	"write",
	"patch",
	"bash",
]);
const UL_WORKFLOW_WRITABLE_PHASES = new Set(["plan", "annotate"]);

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

type PlanStepStatus = "pending" | "in_progress" | "completed" | "blocked";
type PlanStatus = "draft" | "active" | "completed" | "cancelled";

interface PlanStep {
	id: string;
	title: string;
	description?: string;
	status: PlanStepStatus;
	estimatedTime?: number; // minutes
	dependencies?: string[]; // step IDs
}

interface Plan {
	id: string;
	name: string;
	description?: string;
	createdAt: string;
	updatedAt: string;
	status: PlanStatus;
	steps: PlanStep[];
	goal?: string;
	nonGoals: string[];
	acceptanceCriteria: string[];
	constraints: string[];
	fileModuleImpact: string[];
	implementationOrder: string[];
	testVerification: string[];
	risksRollback: string[];
	progressLog: string[];
	currentStepId?: string;
	documentPath?: string;
	documentSlug?: string;
}

interface PlanStorage {
	plans: Plan[];
	currentPlanId?: string;
}

interface CreatePlanOptions {
	description?: string;
	goal?: string;
	nonGoals?: string[];
	acceptanceCriteria?: string[];
	constraints?: string[];
	fileModuleImpact?: string[];
	implementationOrder?: string[];
	testVerification?: string[];
	risksRollback?: string[];
	documentSlug?: string;
}

interface StarterStepDraft {
	title: string;
	description?: string;
}

interface StepTransitionResult {
	autoActivatedStep?: PlanStep;
	demotedStepIds: string[];
}

interface PlanLoopFocusSnapshot {
	planId?: string;
	planName?: string;
	currentStepTitle?: string;
	currentStepId?: string;
	nextStepTitle?: string;
	nextStepId?: string;
	recentProgress: string[];
}

interface PlanLedgerEnforcementResult {
	currentPlan?: Plan;
	currentStep?: PlanStep;
	nextReadyStep?: PlanStep;
	repaired: boolean;
	messages: string[];
	touchedPlanIds: string[];
}

const VALID_STEP_STATUSES: PlanStepStatus[] = ["pending", "in_progress", "completed", "blocked"];
const VALID_PLAN_STATUSES: PlanStatus[] = ["draft", "active", "completed", "cancelled"];

// ============================================
// Storage Management
// ============================================

function resolveWorkspaceRoot(ctx?: unknown): string {
	if (ctx && typeof ctx === "object" && "cwd" in ctx) {
		const cwd = (ctx as { cwd?: unknown }).cwd;
		if (typeof cwd === "string" && cwd.trim().length > 0) {
			return cwd;
		}
	}
	return process.cwd();
}

function ensurePlanDir(cwd: string = process.cwd()): void {
	ensureSharedPlanDir(cwd);
}

function normalizeStringArray(input: unknown): string[] {
	if (!Array.isArray(input)) {
		return [];
	}

	return input
		.filter((value): value is string => typeof value === "string")
		.map(value => value.trim())
		.filter(Boolean);
}

function normalizeStep(input: PlanStep): PlanStep {
	return {
		id: input.id,
		title: input.title,
		description: input.description,
		status: VALID_STEP_STATUSES.includes(input.status) ? input.status : "pending",
		estimatedTime: input.estimatedTime,
		dependencies: normalizeStringArray(input.dependencies),
	};
}

function normalizePlan(input: Plan): Plan {
	const steps = Array.isArray(input.steps) ? input.steps.map(step => normalizeStep(step)) : [];
	const inProgressSteps = steps.filter(step => step.status === "in_progress");
	const currentStepId = typeof input.currentStepId === "string"
		&& inProgressSteps.some(step => step.id === input.currentStepId)
		? input.currentStepId
		: inProgressSteps[0]?.id;

	for (const step of inProgressSteps.slice(1)) {
		if (step.id !== currentStepId) {
			step.status = "pending";
		}
	}

	return {
		id: input.id,
		name: input.name,
		description: input.description,
		createdAt: input.createdAt,
		updatedAt: input.updatedAt,
		status: VALID_PLAN_STATUSES.includes(input.status) ? input.status : "draft",
		steps,
		goal: typeof input.goal === "string" ? input.goal : input.description,
		nonGoals: normalizeStringArray(input.nonGoals),
		acceptanceCriteria: normalizeStringArray(input.acceptanceCriteria),
		constraints: normalizeStringArray(input.constraints),
		fileModuleImpact: normalizeStringArray(input.fileModuleImpact),
		implementationOrder: normalizeStringArray(input.implementationOrder),
		testVerification: normalizeStringArray(input.testVerification),
		risksRollback: normalizeStringArray(input.risksRollback),
		progressLog: normalizeStringArray(input.progressLog),
		currentStepId,
		documentPath: typeof input.documentPath === "string" ? input.documentPath : undefined,
		documentSlug: typeof input.documentSlug === "string" ? input.documentSlug : undefined,
	};
}

function normalizeStorage(storage: PlanStorage): PlanStorage {
	return {
		plans: Array.isArray(storage.plans) ? storage.plans.map(plan => normalizePlan(plan as Plan)) : [],
		currentPlanId: storage.currentPlanId,
	};
}

function loadStorage(cwd: string = process.cwd()): PlanStorage {
	return normalizeStorage(loadSharedPlanStorage<PlanStorage>(cwd));
}

function saveStorage(storage: PlanStorage, cwd: string = process.cwd()): void {
	saveSharedPlanStorage(normalizeStorage(storage), cwd);
}

function generateId(): string {
	planIdSequence += 1;
	return `${Date.now()}-${planIdSequence}`;
}

// ============================================
// Plan Operations
// ============================================

function createPlan(name: string, descriptionOrOptions?: string | CreatePlanOptions): Plan {
	const options: CreatePlanOptions = typeof descriptionOrOptions === "string"
		? { description: descriptionOrOptions }
		: (descriptionOrOptions ?? {});
	const safeName = typeof name === "string" && name.trim().length > 0 ? name.trim() : "Untitled Plan";

	const plan: Plan = {
		id: generateId(),
		name: safeName,
		description: options.description,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		status: "draft",
		steps: [],
		goal: options.goal ?? options.description,
		nonGoals: normalizeStringArray(options.nonGoals),
		acceptanceCriteria: normalizeStringArray(options.acceptanceCriteria),
		constraints: normalizeStringArray(options.constraints),
		fileModuleImpact: normalizeStringArray(options.fileModuleImpact),
		implementationOrder: normalizeStringArray(options.implementationOrder),
		testVerification: normalizeStringArray(options.testVerification),
		risksRollback: normalizeStringArray(options.risksRollback),
		progressLog: [],
		documentSlug: options.documentSlug?.trim() || undefined,
	};
	return plan;
}

function buildStarterStepDrafts(plan: Plan): StarterStepDraft[] {
	const drafts: StarterStepDraft[] = [];
	const seenTitles = new Set<string>();

	const pushDraft = (title: string, description: string) => {
		const normalizedTitle = title.trim();
		if (normalizedTitle.length === 0 || seenTitles.has(normalizedTitle)) {
			return;
		}

		drafts.push({
			title: normalizedTitle,
			description,
		});
		seenTitles.add(normalizedTitle);
	};

	for (const phase of plan.implementationOrder) {
		pushDraft(phase, "Auto-generated from implementationOrder");
	}

	for (const verification of plan.testVerification) {
		const verificationTitle = verification.toLowerCase().startsWith("verify")
			? verification
			: `Verify: ${verification}`;
		pushDraft(verificationTitle, "Auto-generated from testVerification");
	}

	return drafts;
}

function bootstrapPlanSteps(plan: Plan): { createdSteps: PlanStep[]; autoStartedStep?: PlanStep } {
	if (plan.steps.length > 0) {
		return { createdSteps: [] };
	}

	const drafts = buildStarterStepDrafts(plan);
	if (drafts.length === 0) {
		return { createdSteps: [] };
	}

	const createdSteps: PlanStep[] = [];
	let previousStepId: string | undefined;
	for (const draft of drafts) {
		const { step } = addStepToPlan(
			plan,
			draft.title,
			draft.description,
			previousStepId ? [previousStepId] : undefined,
		);
		createdSteps.push(step);
		previousStepId = step.id;
	}

	appendProgressLog(plan, "planner", `Bootstrapped ${createdSteps.length} starter steps from plan metadata`);
	const autoStartedStep = activateNextReadyStep(plan);
	if (autoStartedStep) {
		appendProgressLog(plan, "planner", `Auto-started "${autoStartedStep.title}" from bootstrapped plan`);
	}

	return { createdSteps, autoStartedStep };
}

function buildPlanRecoveryHint(
	readiness: { plan?: Plan; reason?: string },
): string {
	if (!readiness.plan) {
		return " Next: call plan_create with acceptanceCriteria and implementationOrder. plan_create now bootstraps starter steps and current focus automatically.";
	}

	const currentPlan = readiness.plan;
	if (!isPlanReadyForExecution(currentPlan)) {
		return " Next: add acceptanceCriteria and implementationOrder/testVerification to the current plan so it becomes execution-ready.";
	}

	if (currentPlan.steps.length === 0) {
		return " Next: add at least one concrete step with plan_add_step, or recreate the plan with implementationOrder/testVerification so starter steps are bootstrapped automatically.";
	}

	const readySteps = getReadySteps(currentPlan);
	if (readySteps.length > 0 && !getCurrentStep(currentPlan)) {
		return " Next: call plan_run_next to claim exactly one current focus.";
	}

	return " Next: unblock dependencies or add the next concrete step, then resume execution.";
}

function findPlanById(storage: PlanStorage, planId: string): Plan | undefined {
	return storage.plans.find(p => p.id === planId);
}

function getCurrentPlan(storage: PlanStorage): Plan | undefined {
	if (storage.currentPlanId) {
		const current = findPlanById(storage, storage.currentPlanId);
		if (current) {
			return current;
		}
	}

	return [...storage.plans]
		.reverse()
		.find(plan => plan.status === "active" || plan.status === "draft");
}

function isPlanReadyForExecution(plan: Plan): boolean {
	if (plan.status === "completed" || plan.status === "cancelled") {
		return false;
	}

	const hasAcceptanceCriteria = plan.acceptanceCriteria.length > 0;
	const hasExecutionOutline = plan.steps.length > 0
		|| plan.implementationOrder.length > 0
		|| plan.testVerification.length > 0;

	return hasAcceptanceCriteria && hasExecutionOutline;
}

function getPlanExecutionReadiness(
	storage: PlanStorage,
): { plan?: Plan; ready: boolean; reason?: string } {
	const currentPlan = getCurrentPlan(storage);
	if (!currentPlan) {
		return {
			ready: false,
			reason: "SPEC-FIRST: no active plan found. Create a plan with plan_create before mutating the workspace.",
		};
	}

	// Completed or cancelled plans are always execution-ready (SPEC-FIRST guard bypass)
	if (currentPlan.status === "completed" || currentPlan.status === "cancelled") {
		return {
			plan: currentPlan,
			ready: true,
		};
	}

	if (!isPlanReadyForExecution(currentPlan)) {
		return {
			plan: currentPlan,
			ready: false,
			reason: `SPEC-FIRST: current plan ${currentPlan.id} is not execution-ready. Add acceptance criteria and implementation/verification steps before mutating the workspace.`,
		};
	}

	if (currentPlan.steps.length === 0) {
		return {
			plan: currentPlan,
			ready: false,
			reason: `SPEC-FIRST: current plan ${currentPlan.id} has no loop ledger steps yet. Add steps with plan_add_step before mutating the workspace.`,
		};
	}

	const currentStep = getCurrentStep(currentPlan);
	if (!currentStep) {
		const readySteps = getReadySteps(currentPlan);
		if (readySteps.length > 0) {
			return {
				plan: currentPlan,
				ready: false,
				reason: `SPEC-FIRST: current plan ${currentPlan.id} has no active in_progress step. Claim exactly one ready step with plan_run_next before mutating the workspace.`,
			};
		}

		return {
			plan: currentPlan,
			ready: false,
			reason: `SPEC-FIRST: current plan ${currentPlan.id} has no executable in_progress step. Unblock dependencies or add the next concrete step before mutating the workspace.`,
		};
	}

	return {
		plan: currentPlan,
		ready: true,
	};
}

function getBashCommandFromToolInput(input: unknown): string {
	if (!input || typeof input !== "object") {
		return "";
	}

	const record = input as Record<string, unknown>;
	for (const key of ["command", "cmd"]) {
		const value = record[key];
		if (typeof value === "string" && value.trim().length > 0) {
			return value.trim();
		}
	}

	return "";
}

function getMutationTargetPath(input: unknown): string | undefined {
	if (!input || typeof input !== "object") {
		return undefined;
	}

	const record = input as Record<string, unknown>;
	for (const key of ["path", "filePath", "targetPath"]) {
		const value = record[key];
		if (typeof value === "string" && value.trim().length > 0) {
			return value.trim();
		}
	}

	return undefined;
}

function isActiveUlWorkflowPlanMutationAllowed(
	toolName: string,
	input: unknown,
	workspaceRoot: string,
): boolean {
	if (toolName !== "write" && toolName !== "patch") {
		return false;
	}

	const targetPath = getMutationTargetPath(input);
	if (!targetPath) {
		return false;
	}

	try {
		const activePath = join(workspaceRoot, ".pi/ul-workflow/active.json");
		if (!existsSync(activePath)) {
			return false;
		}

		const activeRaw = readFileSync(activePath, "utf-8");
		const activeRegistry = JSON.parse(activeRaw) as {
			activeTaskId?: unknown;
		};
		const activeTaskId = typeof activeRegistry.activeTaskId === "string"
			? activeRegistry.activeTaskId.trim()
			: "";
		if (!activeTaskId) {
			return false;
		}

		const statusPath = join(workspaceRoot, ".pi/ul-workflow/tasks", activeTaskId, "status.json");
		if (!existsSync(statusPath)) {
			return false;
		}

		const statusRaw = readFileSync(statusPath, "utf-8");
		const workflowState = JSON.parse(statusRaw) as {
			phase?: unknown;
		};
		const phase = typeof workflowState.phase === "string"
			? workflowState.phase.trim()
			: "";
		if (!UL_WORKFLOW_WRITABLE_PHASES.has(phase)) {
			return false;
		}

		const expectedPlanPath = resolve(workspaceRoot, ".pi/ul-workflow/tasks", activeTaskId, "plan.md");
		const resolvedTargetPath = resolve(workspaceRoot, targetPath);
		return resolvedTargetPath === expectedPlanPath;
	} catch {
		return false;
	}
}

function applyPlanModeToolFilter(pi: ExtensionAPI, enabled: boolean): void {
	if (typeof pi.getAllTools !== "function" || typeof pi.setActiveTools !== "function") {
		return;
	}

	try {
		const allTools = pi.getAllTools().map(tool => tool.name);
		if (!enabled) {
			pi.setActiveTools(allTools);
			return;
		}

		const allowed = allTools.filter(name => !WRITE_TOOLS.has(name) && name !== EXECUTION_BASH_TOOL);
		pi.setActiveTools(allowed);
	} catch {
		// tool_call gate remains the source of truth
	}
}

function findStepById(plan: Plan, stepId: string): PlanStep | undefined {
	return plan.steps.find(s => s.id === stepId);
}

/**
 * ステップ依存関係の循環を検出する
 * 深さ優先探索でサイクルを検出
 * @param plan - 対象プラン
 * @param newStepId - 新しいステップのID
 * @param dependencies - 新しいステップの依存関係
 * @returns 循環がある場合はtrue
 */
function hasCircularDependency(plan: Plan, newStepId: string, dependencies?: string[]): boolean {
	if (!dependencies || dependencies.length === 0) return false;

	// 依存関係に自分自身が含まれていないか確認
	if (dependencies.includes(newStepId)) return true;

	// 存在しないステップへの依存は循環として扱わない（別途バリデーションで処理）
	const visited = new Set<string>();
	const stack = [...dependencies];

	while (stack.length > 0) {
		const currentId = stack.pop()!;
		if (visited.has(currentId)) continue;
		visited.add(currentId);

		// 自分自身に到達したら循環
		if (currentId === newStepId) return true;

		// 現在のステップの依存関係を取得
		const currentStep = plan.steps.find(s => s.id === currentId);
		if (currentStep?.dependencies) {
			for (const depId of currentStep.dependencies) {
				if (depId === newStepId) return true;
				if (!visited.has(depId)) {
					stack.push(depId);
				}
			}
		}
	}

	return false;
}

function addStepToPlan(plan: Plan, title: string, description?: string, dependencies?: string[]): { step: PlanStep; warnings: string[] } {
	const stepId = generateId();
	const warnings: string[] = [];

	// 依存関係の存在確認
	if (dependencies && dependencies.length > 0) {
		const existingStepIds = new Set(plan.steps.map(s => s.id));
		const missingDeps = dependencies.filter(depId => !existingStepIds.has(depId));
		if (missingDeps.length > 0) {
			warnings.push(`Dependencies not found: ${missingDeps.join(", ")}. These dependencies will be ignored if steps are never added.`);
		}
	}

	// 循環依存の検出
	if (hasCircularDependency(plan, stepId, dependencies)) {
		throw new Error(`Circular dependency detected: adding step "${title}" would create a cycle`);
	}

	const step: PlanStep = {
		id: stepId,
		title,
		description,
		status: "pending",
		dependencies
	};
	plan.steps.push(step);
	plan.updatedAt = new Date().toISOString();
	return { step, warnings };
}

function getCurrentStep(plan: Plan): PlanStep | undefined {
	if (plan.currentStepId) {
		const current = findStepById(plan, plan.currentStepId);
		if (current?.status === "in_progress") {
			return current;
		}
	}

	return plan.steps.find(step => step.status === "in_progress");
}

function resolveCurrentPlan(storage: PlanStorage): Plan | undefined {
	if (storage.currentPlanId) {
		const current = findPlanById(storage, storage.currentPlanId);
		if (current && current.status !== "cancelled" && current.status !== "completed") {
			return current;
		}
	}

	return [...storage.plans].reverse().find(plan => plan.status === "active" || plan.status === "draft");
}

function createPlanLoopFocusSnapshot(plan: Plan | undefined): PlanLoopFocusSnapshot | null {
	if (!plan) {
		return null;
	}

	const currentStep = getCurrentStep(plan);
	const nextStep = currentStep ? undefined : getNextReadyStep(plan);

	return {
		planId: plan.id,
		planName: plan.name,
		currentStepTitle: currentStep?.title,
		currentStepId: currentStep?.id,
		nextStepTitle: nextStep?.title,
		nextStepId: nextStep?.id,
		recentProgress: plan.progressLog.slice(-3),
	};
}

export function buildPlanLoopFocusBlock(snapshot: PlanLoopFocusSnapshot | null): string {
	if (!snapshot) {
		return "";
	}

	const lines = [
		"# Current Plan Focus",
		"",
		`Plan: ${snapshot.planName ?? "unknown"} (${snapshot.planId ?? "unknown"})`,
		snapshot.currentStepTitle
			? `Current focus: ${snapshot.currentStepTitle} (${snapshot.currentStepId ?? "unknown"})`
			: "Current focus: none",
		snapshot.nextStepTitle
			? `Up next: ${snapshot.nextStepTitle} (${snapshot.nextStepId ?? "unknown"})`
			: "Up next: none",
		"",
		"Loop discipline:",
		"- One thing per loop. Advance only the current focus.",
		"- If you need to edit, search and read adjacent files first.",
		"- Verify the touched unit before widening the scope.",
	];

	if (snapshot.recentProgress.length > 0) {
		lines.push("", "Recent progress:");
		for (const entry of snapshot.recentProgress) {
			lines.push(`- ${entry}`);
		}
	}

	return lines.join("\n");
}

function getUnmetDependencyIds(plan: Plan, step: PlanStep): string[] {
	if (!step.dependencies || step.dependencies.length === 0) {
		return [];
	}

	const completedStepIds = new Set(
		plan.steps.filter(candidate => candidate.status === "completed").map(candidate => candidate.id)
	);

	return step.dependencies.filter(depId => !completedStepIds.has(depId));
}

function appendProgressLog(plan: Plan, actor: string, message: string): void {
	const entry = `${new Date().toISOString()} ${actor}: ${message}`;
	plan.progressLog.push(entry);
}

function syncCurrentStep(plan: Plan): string[] {
	const inProgressSteps = plan.steps.filter(step => step.status === "in_progress");
	if (inProgressSteps.length === 0) {
		plan.currentStepId = undefined;
		return [];
	}

	const preferredStep = plan.currentStepId
		? inProgressSteps.find(step => step.id === plan.currentStepId)
		: undefined;
	const activeStep = preferredStep ?? inProgressSteps[0];
	plan.currentStepId = activeStep.id;

	const demoted: string[] = [];
	for (const step of inProgressSteps) {
		if (step.id !== activeStep.id) {
			step.status = "pending";
			demoted.push(step.id);
		}
	}

	return demoted;
}

function getNextReadyStep(plan: Plan): PlanStep | undefined {
	return getReadySteps(plan)[0];
}

function activateStep(plan: Plan, stepId: string): StepTransitionResult {
	const step = findStepById(plan, stepId);
	if (!step) {
		return { demotedStepIds: [] };
	}

	const demotedStepIds: string[] = [];
	for (const candidate of plan.steps) {
		if (candidate.id !== stepId && candidate.status === "in_progress") {
			candidate.status = "pending";
			demotedStepIds.push(candidate.id);
		}
	}

	step.status = "in_progress";
	plan.currentStepId = stepId;
	plan.status = plan.status === "completed" || plan.status === "cancelled" ? plan.status : "active";
	plan.updatedAt = new Date().toISOString();

	return { demotedStepIds };
}

function activateNextReadyStep(plan: Plan): PlanStep | undefined {
	if (getCurrentStep(plan)) {
		return undefined;
	}

	const nextStep = getNextReadyStep(plan);
	if (!nextStep) {
		return undefined;
	}

	nextStep.status = "in_progress";
	plan.currentStepId = nextStep.id;
	plan.status = "active";
	plan.updatedAt = new Date().toISOString();
	return nextStep;
}

function enforcePlanLoopLedger(
	storage: PlanStorage,
	options?: { autoActivateCurrent?: boolean },
): PlanLedgerEnforcementResult {
	const messages: string[] = [];
	const touchedPlanIds = new Set<string>();
	let repaired = false;
	const currentPlan = resolveCurrentPlan(storage);

	if (currentPlan && storage.currentPlanId !== currentPlan.id) {
		storage.currentPlanId = currentPlan.id;
		repaired = true;
		messages.push(`Normalized current plan to ${currentPlan.name} (${currentPlan.id}).`);
	}

	for (const plan of storage.plans) {
		const demotedStepIds = syncCurrentStep(plan);
		if (demotedStepIds.length > 0) {
			repaired = true;
			touchedPlanIds.add(plan.id);
			messages.push(`Collapsed competing in_progress steps in ${plan.name}: ${demotedStepIds.join(", ")}`);
		}
	}

	if (!currentPlan) {
		return {
			repaired,
			messages,
			touchedPlanIds: [...touchedPlanIds],
		};
	}

	for (const plan of storage.plans) {
		if (plan.id === currentPlan.id) {
			continue;
		}

		const foreignInProgress = plan.steps.filter(step => step.status === "in_progress");
		if (foreignInProgress.length === 0) {
			continue;
		}

		for (const step of foreignInProgress) {
			step.status = "pending";
		}
		plan.currentStepId = undefined;
		plan.updatedAt = new Date().toISOString();
		repaired = true;
		touchedPlanIds.add(plan.id);
		messages.push(`Demoted non-current plan focus in ${plan.name}: ${foreignInProgress.map(step => step.id).join(", ")}`);
	}

	let currentStep = getCurrentStep(currentPlan);
	if (!currentStep && options?.autoActivateCurrent !== false) {
		const autoActivatedStep = activateNextReadyStep(currentPlan);
		if (autoActivatedStep) {
			repaired = true;
			touchedPlanIds.add(currentPlan.id);
			appendProgressLog(currentPlan, "planner", `Auto-started "${autoActivatedStep.title}" to restore single loop focus`);
			messages.push(`Auto-started current focus: ${autoActivatedStep.title} (${autoActivatedStep.id})`);
			currentStep = autoActivatedStep;
		}
	}

	return {
		currentPlan,
		currentStep,
		nextReadyStep: currentStep ? undefined : getNextReadyStep(currentPlan),
		repaired,
		messages,
		touchedPlanIds: [...touchedPlanIds],
	};
}

function persistPlanLedgerIfNeeded(
	storage: PlanStorage,
	workspaceRoot: string,
	result: PlanLedgerEnforcementResult,
): void {
	if (!result.repaired) {
		return;
	}

	for (const planId of result.touchedPlanIds) {
		const plan = findPlanById(storage, planId);
		if (plan) {
			syncPlanDocument(plan, workspaceRoot);
		}
	}
	saveStorage(storage, workspaceRoot);
}

function updateStepStatus(
	plan: Plan,
	stepId: string,
	status: PlanStepStatus,
	options?: { actor?: string; note?: string; activateNext?: boolean },
): { ok: boolean; error?: string; details?: Record<string, unknown> } {
	if (plan.status === "cancelled") {
		return { ok: false, error: "plan_cancelled" };
	}

	const step = findStepById(plan, stepId);
	if (!step) {
		return { ok: false, error: "step_not_found" };
	}

	const actor = options?.actor?.trim() || "executor";
	const noteSuffix = options?.note?.trim() ? `: ${options.note.trim()}` : "";

	if (status === "in_progress") {
		const unmetDependencyIds = getUnmetDependencyIds(plan, step);
		if (unmetDependencyIds.length > 0) {
			return {
				ok: false,
				error: "dependencies_unmet",
				details: { unmetDependencyIds },
			};
		}

		const transition = activateStep(plan, stepId);
		appendProgressLog(plan, actor, `Started "${step.title}"${noteSuffix}`);
		if (transition.demotedStepIds.length > 0) {
			appendProgressLog(plan, actor, `Paused competing in-progress steps: ${transition.demotedStepIds.join(", ")}`);
		}
		return { ok: true, details: { demotedStepIds: transition.demotedStepIds } };
	}

	step.status = status;
	plan.updatedAt = new Date().toISOString();

	if (plan.currentStepId === step.id) {
		plan.currentStepId = undefined;
	}

	if (status === "completed") {
		appendProgressLog(plan, actor, `Completed "${step.title}"${noteSuffix}`);
		if (plan.status === "draft") {
			plan.status = "active";
		}

		const autoActivatedStep = options?.activateNext === false ? undefined : activateNextReadyStep(plan);
		if (autoActivatedStep) {
			appendProgressLog(plan, actor, `Auto-started "${autoActivatedStep.title}" after completion`);
		}

		if (plan.steps.length > 0 && plan.steps.every(candidate => candidate.status === "completed")) {
			plan.status = "completed";
			plan.currentStepId = undefined;
			appendProgressLog(plan, actor, "Marked plan completed");
		}

		return { ok: true, details: { autoActivatedStepId: autoActivatedStep?.id } };
	}

	if (status === "blocked") {
		appendProgressLog(plan, actor, `Blocked "${step.title}"${noteSuffix}`);
		return { ok: true };
	}

	appendProgressLog(plan, actor, `Reset "${step.title}" to pending${noteSuffix}`);
	syncCurrentStep(plan);
	return { ok: true };
}

function getReadySteps(plan: Plan): PlanStep[] {
	if (plan.status === "cancelled") {
		return [];
	}

	const completedStepIds = new Set(
		plan.steps.filter(s => s.status === "completed").map(s => s.id)
	);

	return plan.steps.filter(step => {
		if (step.status !== "pending") return false;
		if (!step.dependencies || step.dependencies.length === 0) return true;
		return step.dependencies.every(depId => completedStepIds.has(depId));
	});
}

function slugifyPlanName(input: string): string {
	const safeInput = typeof input === "string" && input.trim().length > 0 ? input : "plan";
	return safeInput
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "") || "plan";
}

function ensureProjectPlansDir(workspaceRoot: string): string {
	const plansDir = join(workspaceRoot, "plans");
	if (!existsSync(plansDir)) {
		mkdirSync(plansDir, { recursive: true });
	}
	return plansDir;
}

function ensurePlanDocumentPath(plan: Plan, workspaceRoot: string): string {
	if (plan.documentPath) {
		return plan.documentPath;
	}

	const plansDir = ensureProjectPlansDir(workspaceRoot);
	const baseSlug = plan.documentSlug || slugifyPlanName(plan.name);
	const shortId = plan.id.split("-").at(-1) ?? plan.id;
	let relativePath = `plans/${baseSlug}.md`;
	let absolutePath = join(workspaceRoot, relativePath);

	if (existsSync(absolutePath)) {
		relativePath = `plans/${baseSlug}-${shortId}.md`;
		absolutePath = join(workspaceRoot, relativePath);
	}

	plan.documentSlug = baseSlug;
	plan.documentPath = relativePath;
	return plan.documentPath;
}

function renderSection(title: string, items: string[], fallback: string): string[] {
	if (items.length === 0) {
		return [`# ${title}`, fallback];
	}

	return [`# ${title}`, ...items.map(item => `- ${item}`)];
}

function renderChecklistSection(title: string, items: string[], fallback: string): string[] {
	if (items.length === 0) {
		return [`# ${title}`, fallback];
	}

	return [`# ${title}`, ...items.map(item => `- [ ] ${item}`)];
}

function getStepMarker(status: PlanStepStatus): string {
	switch (status) {
		case "completed":
			return "x";
		case "in_progress":
			return "-";
		case "blocked":
			return "!";
		default:
			return " ";
	}
}

function formatPlanDocument(plan: Plan): string {
	const lines: string[] = [
		`<!-- ${plan.documentPath ?? `plans/${slugifyPlanName(plan.name)}.md`} -->`,
		"<!-- このファイルは、長い実行計画と live checklist を一緒に追跡する durable plan です。 -->",
		"<!-- なぜ存在するか: 会話だけでは崩れやすい判断理由と進捗を、後続セッションでも再利用するためです。 -->",
		`<!-- 関連ファイル: AGENTS.md, .factory/droids/planner.md, .factory/droids/executor.md, .factory/droids/verifier.md -->`,
		"",
		"# Goal",
		plan.goal?.trim() || plan.description?.trim() || "未記入",
		"",
		...renderSection("Non-goals", plan.nonGoals, "- まだ未記入"),
		"",
		...renderChecklistSection("Acceptance Criteria", plan.acceptanceCriteria, "- [ ] まだ未記入"),
		"",
		...renderSection("Constraints", plan.constraints, "- まだ未記入"),
		"",
		...renderSection("File/Module Impact", plan.fileModuleImpact, "- まだ未記入"),
		"",
		...renderSection("Implementation Order", plan.implementationOrder, "- まだ未記入"),
		"",
		"# Live Checklist",
	];

	if (plan.steps.length === 0) {
		lines.push("- [ ] まだ未記入");
	} else {
		for (const step of plan.steps) {
			const suffix = step.id === plan.currentStepId ? " <-- current" : "";
			lines.push(`- [${getStepMarker(step.status)}] ${step.title} (${step.id})${suffix}`);
		}
	}

	lines.push(
		"",
		...renderSection("Test & Verification", plan.testVerification, "- まだ未記入"),
		"",
		...renderSection("Risks / Rollback", plan.risksRollback, "- まだ未記入"),
		"",
		"# Progress Log",
	);

	if (plan.progressLog.length === 0) {
		lines.push("- まだ履歴はありません");
	} else {
		for (const entry of plan.progressLog) {
			lines.push(`- ${entry}`);
		}
	}

	return `${lines.join("\n")}\n`;
}

function syncPlanDocument(plan: Plan, workspaceRoot: string): string {
	const relativePath = ensurePlanDocumentPath(plan, workspaceRoot);
	const absolutePath = join(workspaceRoot, relativePath);
	ensureProjectPlansDir(workspaceRoot);
	writeFileSync(absolutePath, formatPlanDocument(plan), "utf-8");
	return relativePath;
}

function formatPlanSummary(plan: Plan): string {
	const lines: string[] = [];
	lines.push(`## Plan: ${plan.name}`);
	lines.push(`ID: ${plan.id}`);
	if (plan.description) {
		lines.push(`\n${plan.description}`);
	}
	lines.push(`\nStatus: ${plan.status}`);
	lines.push(`Created: ${new Date(plan.createdAt).toLocaleString()}`);
	lines.push(`Updated: ${new Date(plan.updatedAt).toLocaleString()}`);
	if (plan.documentPath) {
		lines.push(`Document: ${plan.documentPath}`);
	}

	const statusCounts = {
		pending: plan.steps.filter(s => s.status === "pending").length,
		in_progress: plan.steps.filter(s => s.status === "in_progress").length,
		completed: plan.steps.filter(s => s.status === "completed").length,
		blocked: plan.steps.filter(s => s.status === "blocked").length
	};

	lines.push(`\nProgress: ${statusCounts.completed}/${plan.steps.length} steps completed`);
	lines.push(`  Pending: ${statusCounts.pending} | In Progress: ${statusCounts.in_progress} | Completed: ${statusCounts.completed} | Blocked: ${statusCounts.blocked}`);

	const currentStep = getCurrentStep(plan);
	if (currentStep) {
		lines.push(`Current Focus: ${currentStep.title} (${currentStep.id})`);
	}

	const readySteps = getReadySteps(plan);
	if (readySteps.length > 0) {
		lines.push(`Up Next: ${readySteps.slice(0, 3).map(step => `${step.title} (${step.id})`).join(" | ")}`);
	}

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

	if (plan.progressLog.length > 0) {
		lines.push("\n### Recent Progress:");
		for (const entry of plan.progressLog.slice(-3)) {
			lines.push(`- ${entry}`);
		}
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
		if (plan.documentPath) {
			lines.push(`Document: ${plan.documentPath}`);
		}
		const currentStep = getCurrentStep(plan);
		if (currentStep) {
			lines.push(`Current: ${currentStep.title} (${currentStep.id})`);
		}
		if (plan.description) {
			lines.push(`Description: ${plan.description}`);
		}
	});
	return lines.join("\n");
}

// ============================================
// Extension Registration
// ============================================

// モジュールレベルのフラグ（reload時のリスナー重複登録防止）
let isInitialized = false;

/**
 * テスト用のリセット関数
 * @summary isInitializedフラグをリセット
 */
export function resetForTesting(): void {
  isInitialized = false;
	planModeEnabled = false;
	delete process.env[PLAN_MODE_ENV_VAR];
}

export default function (pi: ExtensionAPI) {
	if (isInitialized) return;
	isInitialized = true;

		// ============================================
		// Plan Mode (Spec-first read-only mode)
		// Mutating tools are blocked until the user exits plan mode.
		// ============================================

	// ============================================
	// Plan Mode State Persistence
	// ============================================

	function syncPlanModeEnv(enabled: boolean): void {
		if (enabled) {
			process.env[PLAN_MODE_ENV_VAR] = "1";
			return;
		}
		delete process.env[PLAN_MODE_ENV_VAR];
	}

	function savePlanModeState(enabled: boolean, cwd: string = process.cwd()): void {
		const state = createPlanModeState(enabled);
		saveSharedPlanModeState(state, cwd);

		// Keep env flag in sync so other extensions see the real plan mode state.
		syncPlanModeEnv(enabled);
	}

	function loadPlanModeState(cwd: string = process.cwd()): boolean {
		try {
			const state = loadSharedPlanModeState<PlanModeState>(cwd);
			if (!state) {
				syncPlanModeEnv(false);
				return false;
			}

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

		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Context type is complex and varies by call site
		function togglePlanMode(ctx: any) {
			const workspaceRoot = resolveWorkspaceRoot(ctx);
			planModeEnabled = !planModeEnabled;
			savePlanModeState(planModeEnabled, workspaceRoot);

			if (planModeEnabled) {
				applyPlanModeToolFilter(pi, true);
				ctx.ui.notify("PLAN MODE: Spec-first read-only restrictions enabled", "warning");
				ctx.ui.setStatus(PLAN_MODE_STATUS_KEY, "PLAN MODE");
			} else {
				applyPlanModeToolFilter(pi, false);
				ctx.ui.notify("PLAN MODE: Disabled", "info");
				ctx.ui.setStatus(PLAN_MODE_STATUS_KEY, undefined);
			}
		}

	// ============================================
	// P0: Context Injection via before_agent_start
	// ============================================

	pi.on("before_agent_start", async (event, ctx) => {
		const workspaceRoot = resolveWorkspaceRoot(ctx);
		const storage = loadStorage(workspaceRoot);
		const ledgerResult = enforcePlanLoopLedger(storage, { autoActivateCurrent: true });
		persistPlanLedgerIfNeeded(storage, workspaceRoot, ledgerResult);
		const currentPlan = ledgerResult.currentPlan;
		const focusBlock = buildPlanLoopFocusBlock(createPlanLoopFocusSnapshot(currentPlan));
		const entries: PromptStackEntry[] = [];

		if (focusBlock) {
			entries.push({
				source: "plan-current-focus",
				recordSource: "plan-current-focus",
				layer: "startup-context",
				markerId: `plan-current-focus:${currentPlan?.id ?? "none"}`,
				content: focusBlock,
			});
		}

		if (planModeEnabled) {
			const notification = createRuntimeNotification(
				"plan-mode",
				"PLAN MODE is active. Read-only restrictions are enforced until you exit plan mode.",
				"warning",
				1,
			);
			entries.push({
				source: "plan-mode-policy",
				recordSource: "plan-mode-policy",
				layer: "system-policy",
				markerId: "plan-mode-policy",
				content: PLAN_MODE_POLICY,
			});
			if (notification) {
				entries.push({
					source: "plan-mode-notification",
					recordSource: "plan-mode-notification",
					layer: "runtime-notification",
					markerId: "plan-mode-notification",
					content: formatRuntimeNotificationBlock([notification]),
				});
			}
		}

		if (ledgerResult.messages.length > 0) {
			const notification = createRuntimeNotification(
				"plan-loop-ledger",
				ledgerResult.messages.join(" | "),
				ledgerResult.currentStep ? "warning" : "critical",
				1,
			);
			if (notification) {
				entries.push({
					source: "plan-loop-ledger-notification",
					recordSource: "plan-loop-ledger-notification",
					layer: "runtime-notification",
					markerId: `plan-loop-ledger:${currentPlan?.id ?? "none"}:${ledgerResult.currentStep?.id ?? "none"}`,
					content: formatRuntimeNotificationBlock([notification]),
				});
			}
		}

		if (entries.length === 0) {
			return;
		}

		const result = applyPromptStack(event.systemPrompt ?? "", entries);
		if (result.appliedEntries.length === 0) {
			return;
		}

		return {
			systemPrompt: result.systemPrompt,
			message: planModeEnabled
				? {
					customType: PLAN_MODE_CONTEXT_TYPE,
					content: "PLAN MODE is active. Read-only restrictions are enforced until you exit plan mode.",
					display: false,
				}
				: undefined,
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

		pi.on("tool_call", async (event, ctx) => {
			const toolName = typeof event.toolName === "string" ? event.toolName : "";
			const command = toolName === EXECUTION_BASH_TOOL
				? getBashCommandFromToolInput(event.input)
				: "";
			const isReadOnlyBash = toolName === EXECUTION_BASH_TOOL && command.length > 0 && isBashCommandAllowed(command);
			const requiresPlan = PLAN_REQUIRED_MUTATION_TOOLS.has(toolName) && !isReadOnlyBash;

			if (planModeEnabled) {
				if (toolName === EXECUTION_BASH_TOOL && command && !isReadOnlyBash) {
					return {
						block: true,
						reason: `PLAN MODE: write-capable bash command blocked. Command: ${command}\nStay in read-only exploration or exit plan mode to implement.`,
					};
				}

				if (WRITE_TOOLS.has(toolName)) {
					return {
						block: true,
						reason: `PLAN MODE: ${toolName} is blocked. Stay in read-only exploration or exit plan mode to implement.`,
					};
				}

				return;
			}

			if (!requiresPlan) {
				return;
			}

			const workspaceRoot = resolveWorkspaceRoot(ctx);
			if (isActiveUlWorkflowPlanMutationAllowed(toolName, event.input, workspaceRoot)) {
				return;
			}
			const storage = loadStorage(workspaceRoot);
			const ledgerResult = enforcePlanLoopLedger(storage, { autoActivateCurrent: true });
			persistPlanLedgerIfNeeded(storage, workspaceRoot, ledgerResult);
			const readiness = getPlanExecutionReadiness(storage);
			if (readiness.ready) {
				return;
			}

			const suffix = readiness.plan
				? ` Current plan: ${readiness.plan.name} (${readiness.plan.id}).`
				: "";
			const hint = buildPlanRecoveryHint(readiness);
			return {
				block: true,
				reason: `${readiness.reason}${suffix}${hint}`,
			};
		});

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
		description: "Create a new task plan with a live checklist and durable markdown document",
		parameters: Type.Object({
			name: Type.String({ description: "Name of the plan" }),
			description: Type.Optional(Type.String({ description: "Description of the plan" })),
			goal: Type.Optional(Type.String({ description: "Main outcome for the plan document" })),
			nonGoals: Type.Optional(Type.Array(Type.String({ description: "Out-of-scope items" }))),
			acceptanceCriteria: Type.Optional(Type.Array(Type.String({ description: "Acceptance criteria checklist items" }))),
			constraints: Type.Optional(Type.Array(Type.String({ description: "Constraints to preserve" }))),
			fileModuleImpact: Type.Optional(Type.Array(Type.String({ description: "Files or modules expected to change" }))),
			implementationOrder: Type.Optional(Type.Array(Type.String({ description: "Ordered implementation phases" }))),
			testVerification: Type.Optional(Type.Array(Type.String({ description: "Tests and manual verification points" }))),
			risksRollback: Type.Optional(Type.Array(Type.String({ description: "Risks and rollback notes" }))),
			documentSlug: Type.Optional(Type.String({ description: "Optional slug for plans/<slug>.md" })),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const _operationId = logger.startOperation("plan_create" as OperationType, params.name, {
				task: params.name,
				params: { name: params.name, description: params.description },
			});

			const workspaceRoot = resolveWorkspaceRoot(ctx);
			const storage = loadStorage(workspaceRoot);
			const plan = createPlan(params.name, {
				description: params.description,
				goal: params.goal,
				nonGoals: params.nonGoals,
				acceptanceCriteria: params.acceptanceCriteria,
				constraints: params.constraints,
				fileModuleImpact: params.fileModuleImpact,
				implementationOrder: params.implementationOrder,
				testVerification: params.testVerification,
				risksRollback: params.risksRollback,
				documentSlug: params.documentSlug,
			});
			appendProgressLog(plan, "planner", "Initial plan created");
			const bootstrapResult = bootstrapPlanSteps(plan);
			syncPlanDocument(plan, workspaceRoot);
			storage.plans.push(plan);
			storage.currentPlanId = plan.id;
			saveStorage(storage, workspaceRoot);

			logger.endOperation({
				status: "success",
				tokensUsed: 0,
				outputLength: 0,
				childOperations: 0,
				toolCalls: 0,
			});

			return {
				content: [{
					type: "text",
					text: [
						"Plan created:",
						"",
						bootstrapResult.createdSteps.length > 0
							? `Bootstrapped ${bootstrapResult.createdSteps.length} starter steps from plan metadata.`
							: "No starter steps were bootstrapped.",
						bootstrapResult.autoStartedStep
							? `Current focus auto-started: ${bootstrapResult.autoStartedStep.title} (${bootstrapResult.autoStartedStep.id})`
							: "Current focus auto-started: none",
						"",
						formatPlanSummary(plan),
					].join("\n"),
				}],
				details: {
					planId: plan.id,
					documentPath: plan.documentPath,
					currentStepId: plan.currentStepId,
					bootstrappedStepIds: bootstrapResult.createdSteps.map(step => step.id),
					autoBootstrapped: bootstrapResult.createdSteps.length > 0,
				},
				id: plan.id,
				planId: plan.id,
				documentPath: plan.documentPath,
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
			const storage = loadStorage(resolveWorkspaceRoot(ctx));
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
			const storage = loadStorage(resolveWorkspaceRoot(ctx));
			const plan = findPlanById(storage, params.planId);

			if (!plan) {
				return {
					content: [{ type: "text", text: `Plan not found: ${params.planId}` }],
					details: {}
				};
			}

			return {
				content: [{ type: "text", text: formatPlanSummary(plan) }],
				details: {
					planId: plan.id,
					stepCount: plan.steps.length,
					currentStepId: plan.currentStepId,
					documentPath: plan.documentPath,
				},
				id: plan.id,
				planId: plan.id,
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

			const workspaceRoot = resolveWorkspaceRoot(ctx);
			const storage = loadStorage(workspaceRoot);
			const plan = findPlanById(storage, params.planId);

			if (!plan) {
				return {
					content: [{ type: "text", text: `Plan not found: ${params.planId}` }],
					details: {}
				};
			}

			let step: PlanStep;
			let warnings: string[] = [];
			try {
				const result = addStepToPlan(plan, params.title, params.description, params.dependencies);
				step = result.step;
				warnings = result.warnings;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text", text: `Error: ${message}` }],
					details: { error: "circular_dependency" }
				};
			}
			appendProgressLog(plan, "planner", `Added step "${step.title}"`);
			syncPlanDocument(plan, workspaceRoot);
			saveStorage(storage, workspaceRoot);

			logger.endOperation({
				status: "success",
				tokensUsed: 0,
				outputLength: 0,
				childOperations: 0,
				toolCalls: 0,
			});

			let outputText = `Step added to plan "${plan.name}" (ID: ${plan.id}):\n\n• ${step.title} (Step ID: ${step.id})${step.description ? `\n  ${step.description}` : ""}`;
			if (warnings.length > 0) {
				outputText += `\n\n⚠ Warnings:\n${warnings.map(w => `  - ${w}`).join("\n")}`;
			}

			return {
				content: [{ type: "text", text: outputText }],
				details: { planId: plan.id, stepId: step.id, warnings, documentPath: plan.documentPath },
				planId: plan.id,
				stepId: step.id,
			};
		},
	});

	// Tool: Update step status
	pi.registerTool({
		name: "plan_update_step",
		label: "Update Step Status",
		description: "Update a step and keep a single current in-progress item with optional auto-advance",
		parameters: Type.Object({
			planId: Type.String({ description: "ID of the plan" }),
			stepId: Type.String({ description: "ID of the step to update" }),
			status: Type.String({ description: "New status: pending, in_progress, completed, or blocked" }),
			actor: Type.Optional(Type.String({ description: "Who is performing the update, e.g. planner/executor/verifier" })),
			progressNote: Type.Optional(Type.String({ description: "Reason or verification note to append to the progress log" })),
			activateNext: Type.Optional(Type.Boolean({ description: "When completing a step, automatically move the next ready step to in_progress" })),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const _operationId = logger.startOperation("plan_update_step" as OperationType, params.stepId, {
				task: `Update step: ${params.stepId}`,
				params: { planId: params.planId, stepId: params.stepId, status: params.status },
			});

			const workspaceRoot = resolveWorkspaceRoot(ctx);
			const storage = loadStorage(workspaceRoot);
			const plan = findPlanById(storage, params.planId);

			if (!plan) {
				return {
					content: [{ type: "text", text: `Plan not found: ${params.planId}` }],
					details: {}
				};
			}

			if (!VALID_STEP_STATUSES.includes(params.status as PlanStepStatus)) {
				return {
					content: [{ type: "text", text: `Invalid status. Must be one of: ${VALID_STEP_STATUSES.join(", ")}` }],
					details: {}
				};
			}

			// Workspace verification check for completed status
			if (params.status === "completed") {
				const wvConfig = loadWorkspaceVerificationConfig(workspaceRoot);
				const wvState = loadWorkspaceVerificationState(workspaceRoot);
				const wvResolvedPlan = resolveWorkspaceVerificationPlan(wvConfig, workspaceRoot);
				if (isCompletionBlocked(wvConfig, wvState, wvResolvedPlan)) {
					const reason = wvConfig.requireReplanOnRepeatedFailure && wvState.replanRequired
						? `Repeated verification failures require a new repair strategy. Update the plan and run workspace_verify_replan. ${wvState.replanReason ?? ""}`.trim()
						: wvConfig.requireProofReview && wvState.pendingProofReview
							? "A successful verification exists, but its proof artifacts have not been acknowledged. Run workspace_verify_ack after inspecting the latest artifacts."
							: "Workspace verification is stale. Run workspace_verify and inspect the latest artifacts.";
					return {
						content: [{ type: "text", text: `${reason} before marking a plan step completed.` }],
						details: {}
					};
				}
			}

			const updateResult = updateStepStatus(plan, params.stepId, params.status as PlanStepStatus, {
				actor: params.actor,
				note: params.progressNote,
				activateNext: params.activateNext,
			});
			if (!updateResult.ok) {
				const unmetDependencyIds = Array.isArray(updateResult.details?.unmetDependencyIds)
					? updateResult.details.unmetDependencyIds.join(", ")
					: "";
				return {
					content: [{
						type: "text",
						text: updateResult.error === "dependencies_unmet"
							? `Step cannot start yet. Unmet dependencies: ${unmetDependencyIds}`
							: updateResult.error === "plan_cancelled"
								? "Cancelled plans cannot update steps."
							: `Step not found: ${params.stepId}`,
					}],
					details: updateResult.details ?? {}
				};
			}

			const ledgerResult = enforcePlanLoopLedger(storage, { autoActivateCurrent: true });
			syncPlanDocument(plan, workspaceRoot);
			persistPlanLedgerIfNeeded(storage, workspaceRoot, ledgerResult);
			if (!ledgerResult.repaired) {
				saveStorage(storage, workspaceRoot);
			}
			const step = findStepById(plan, params.stepId);
			const currentStep = ledgerResult.currentStep ?? getCurrentStep(plan);
			const nextReadyStep = ledgerResult.nextReadyStep ?? getNextReadyStep(plan);

			logger.endOperation({
				status: "success",
				tokensUsed: 0,
				outputLength: 0,
				childOperations: 0,
				toolCalls: 0,
			});

			return {
				content: [{
					type: "text",
					text: [
						`Step status updated (Plan: ${plan.id}):`,
						"",
						`• ${step?.title} → ${params.status}`,
						currentStep ? `• Current focus: ${currentStep.title} (${currentStep.id})` : "• Current focus: none",
						nextReadyStep ? `• Up next: ${nextReadyStep.title} (${nextReadyStep.id})` : "• Up next: none",
						"",
						formatPlanSummary(plan),
					].join("\n"),
				}],
				details: {
					planId: plan.id,
					stepId: params.stepId,
					status: params.status,
					currentStepId: currentStep?.id,
					nextStepId: nextReadyStep?.id,
					documentPath: plan.documentPath,
					...updateResult.details,
				},
				planId: plan.id,
				stepId: params.stepId,
			};
		},
	});

	pi.registerTool({
		name: "plan_run_next",
		label: "Run Next Plan Step",
		description: "Move the next ready pending step to in_progress and surface the current focus",
		parameters: Type.Object({
			planId: Type.String({ description: "ID of the plan" }),
			actor: Type.Optional(Type.String({ description: "Who is claiming the next step" })),
			progressNote: Type.Optional(Type.String({ description: "Optional note to append when the next step starts" })),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const workspaceRoot = resolveWorkspaceRoot(ctx);
			const storage = loadStorage(workspaceRoot);
			const plan = findPlanById(storage, params.planId);

			if (!plan) {
				return {
					content: [{ type: "text", text: `Plan not found: ${params.planId}` }],
					details: {}
				};
			}

			if (plan.status === "cancelled") {
				return {
					content: [{ type: "text", text: "Cancelled plans cannot start new steps." }],
					details: { planId: plan.id }
				};
			}

			const currentStep = getCurrentStep(plan);
			if (currentStep) {
				return {
					content: [{ type: "text", text: `A step is already in progress:\n\n• ${currentStep.title} (${currentStep.id})` }],
					details: { planId: plan.id, currentStepId: currentStep.id, documentPath: plan.documentPath },
				};
			}

			const nextStep = activateNextReadyStep(plan);
			if (!nextStep) {
				return {
					content: [{ type: "text", text: "No ready pending steps found." }],
					details: { planId: plan.id, count: 0 }
				};
			}

			appendProgressLog(plan, params.actor?.trim() || "executor", `Started "${nextStep.title}"${params.progressNote ? `: ${params.progressNote}` : ""}`);
			const ledgerResult = enforcePlanLoopLedger(storage, { autoActivateCurrent: false });
			syncPlanDocument(plan, workspaceRoot);
			persistPlanLedgerIfNeeded(storage, workspaceRoot, ledgerResult);
			if (!ledgerResult.repaired) {
				saveStorage(storage, workspaceRoot);
			}

			return {
				content: [{ type: "text", text: `Current focus updated:\n\n• ${nextStep.title} (${nextStep.id})\n\n${formatPlanSummary(plan)}` }],
				details: { planId: plan.id, stepId: nextStep.id, currentStepId: nextStep.id, documentPath: plan.documentPath },
				planId: plan.id,
				stepId: nextStep.id,
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
			const storage = loadStorage(resolveWorkspaceRoot(ctx));
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

			const lines: string[] = [`## Ready Steps for "${plan.name}" (ID: ${plan.id}) - ${readySteps.length} steps`];
			readySteps.forEach((step, idx) => {
				lines.push(`\n${idx + 1}. ${step.title} (Step ID: ${step.id})`);
				if (step.description) {
					lines.push(`   ${step.description}`);
				}
			});

			return {
				content: [{ type: "text", text: lines.join("\n") }],
				details: { count: readySteps.length, stepIds: readySteps.map(s => s.id), currentStepId: plan.currentStepId }
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

			const workspaceRoot = resolveWorkspaceRoot(ctx);
			const storage = loadStorage(workspaceRoot);
			const planToDelete = findPlanById(storage, params.planId);

			if (!planToDelete) {
				return {
					content: [{ type: "text", text: `Plan not found: ${params.planId}` }],
					details: {}
				};
			}

			const deletedPlanName = planToDelete.name;
			storage.plans = storage.plans.filter(p => p.id !== params.planId);
			saveStorage(storage, workspaceRoot);

			logger.endOperation({
				status: "success",
				tokensUsed: 0,
				outputLength: 0,
				childOperations: 0,
				toolCalls: 0,
			});

			return {
				content: [{ type: "text", text: `Plan deleted: "${deletedPlanName}" (ID: ${params.planId})` }],
				details: { deletedPlanId: params.planId, deletedPlanName }
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

			const workspaceRoot = resolveWorkspaceRoot(ctx);
			const storage = loadStorage(workspaceRoot);
			const plan = findPlanById(storage, params.planId);

			if (!plan) {
				return {
					content: [{ type: "text", text: `Plan not found: ${params.planId}` }],
					details: {}
				};
			}

			if (!VALID_PLAN_STATUSES.includes(params.status as PlanStatus)) {
				return {
					content: [{ type: "text", text: `Invalid status. Must be one of: ${VALID_PLAN_STATUSES.join(", ")}` }],
					details: {}
				};
			}

			if (params.status === "completed" && plan.steps.some(step => step.status !== "completed")) {
				return {
					content: [{ type: "text", text: "Plan cannot be marked completed while unfinished steps remain." }],
					details: { unfinishedStepIds: plan.steps.filter(step => step.status !== "completed").map(step => step.id) }
				};
			}

			plan.status = params.status as PlanStatus;
			plan.updatedAt = new Date().toISOString();
			if (plan.status === "cancelled") {
				for (const step of plan.steps) {
					if (step.status === "in_progress") {
						step.status = "pending";
					}
				}
				plan.currentStepId = undefined;
			}
			appendProgressLog(plan, "planner", `Plan status changed to ${plan.status}`);
			const ledgerResult = enforcePlanLoopLedger(storage, { autoActivateCurrent: true });
			syncPlanDocument(plan, workspaceRoot);
			persistPlanLedgerIfNeeded(storage, workspaceRoot, ledgerResult);
			if (!ledgerResult.repaired) {
				saveStorage(storage, workspaceRoot);
			}

			logger.endOperation({
				status: "success",
				tokensUsed: 0,
				outputLength: 0,
				childOperations: 0,
				toolCalls: 0,
			});

			return {
				content: [{ type: "text", text: `Plan "${plan.name}" (ID: ${plan.id}) status updated to: ${params.status}` }],
				details: { planId: plan.id, status: params.status, documentPath: plan.documentPath }
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
				const storage = loadStorage(resolveWorkspaceRoot(ctx));
				ctx.ui.notify(formatPlanList(storage.plans), "info");
			} else if (args.startsWith("create ")) {
				const name = args.substring(7).trim();
				if (name) {
					const workspaceRoot = resolveWorkspaceRoot(ctx);
					const storage = loadStorage(workspaceRoot);
					const plan = createPlan(name);
					appendProgressLog(plan, "planner", "Initial plan created");
					syncPlanDocument(plan, workspaceRoot);
					storage.plans.push(plan);
					storage.currentPlanId = plan.id;
					saveStorage(storage, workspaceRoot);
					ctx.ui.notify(`Created plan: ${plan.id}`, "info");
				} else {
					ctx.ui.notify("Usage: /plan create <name>", "error");
				}
			} else if (args.startsWith("show ")) {
				const planId = args.substring(5).trim();
				const storage = loadStorage(resolveWorkspaceRoot(ctx));
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
		const workspaceRoot = resolveWorkspaceRoot(ctx);
		planModeEnabled = loadPlanModeState(workspaceRoot);
		const storage = loadStorage(workspaceRoot);
		const ledgerResult = enforcePlanLoopLedger(storage, { autoActivateCurrent: true });
		persistPlanLedgerIfNeeded(storage, workspaceRoot, ledgerResult);

		ctx.ui.notify("Plan Extension loaded", "info");
		if (ledgerResult.messages.length > 0) {
			ctx.ui.notify(`Plan loop ledger repaired: ${ledgerResult.messages.join(" | ")}`, "warning");
		}
		if (planModeEnabled) {
			applyPlanModeToolFilter(pi, true);
			ctx.ui.setStatus(PLAN_MODE_STATUS_KEY, "PLAN MODE");
			ctx.ui.notify("PLAN MODE restored with spec-first read-only restrictions", "warning");
			return;
		}
		ctx.ui.setStatus(PLAN_MODE_STATUS_KEY, undefined);
	});

	// セッション終了時にリスナー重複登録防止フラグをリセット
	pi.on("session_shutdown", async () => {
		isInitialized = false;
	});
}
