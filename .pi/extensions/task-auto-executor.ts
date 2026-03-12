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

import { getInstanceId, isProcessAlive, extractPidFromInstanceId } from "../lib/core/ownership.js";
import {
	loadTaskStorage as loadSharedTaskStorage,
	saveTaskStorage as saveSharedTaskStorage,
} from "../lib/storage/task-plan-store.js";
import {
	createWorkpad,
	loadWorkpad,
	loadWorkflowDocument,
	updateWorkpad,
} from "../lib/workflow-workpad.js";
import {
	claimSymphonyIssue,
	getSymphonyIssueState,
	releaseSymphonyIssue,
} from "../lib/symphony-orchestrator-state.js";
import { createLongRunningReplay } from "../lib/long-running-supervisor.js";
import { onSessionEvent } from "../lib/runtime-sessions.js";

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

interface TaskStorage {
	tasks: Task[];
	currentTaskId?: string;
}

type RalphLoopTaskKind =
	| "implementation"
	| "research"
	| "planning"
	| "validation"
	| "documentation"
	| "other";

interface RalphLoopSelection {
	task: Task;
	kind: RalphLoopTaskKind;
	reason: string;
	validationLaneLimited: boolean;
}

interface AutoExecutorConfig {
	enabled: boolean;
	autoRun: boolean; // 自動実行するか、通知のみか
	currentTaskId?: string;
	maxRetries: number;
}

type AutoExecutorCheckpointStatus =
	| "claimed"
	| "dispatched"
	| "interrupted"
	| "completed"
	| "failed";

interface AutoExecutorCheckpoint {
	taskId: string;
	title: string;
	description?: string;
	kind: RalphLoopTaskKind;
	reason: string;
	workpadId?: string;
	status: AutoExecutorCheckpointStatus;
	ownerInstanceId?: string;
	ownerPid?: number;
	attemptCount: number;
	resumeCount: number;
	createdAt: string;
	updatedAt: string;
	lastError?: string;
}

interface AutoExecutorRuntimeState {
	checkpoints: AutoExecutorCheckpoint[];
}

interface TaskEvidenceSnapshot {
	workflowExists: boolean;
	completionGate: Record<string, unknown>;
	requiredCommands: string[];
	verificationSection: string;
	reviewSection: string;
	progressSection: string;
	proofArtifacts: string[];
	verifiedCommands: string[];
	hasWorkspaceVerification: boolean;
	progressEvidence: string[];
	verificationEvidence: string[];
	reviewEvidence: string[];
}

interface WorkspaceVerifyToolEvent {
	toolName?: string;
	isError?: boolean;
	result?: {
		summary?: unknown;
		details?: {
			success?: unknown;
		};
		success?: unknown;
	};
	error?: unknown;
	details?: {
		success?: unknown;
	};
}

// ============================================
// Constants
// ============================================

const TASK_DIR = ".pi/tasks";
const CONFIG_FILE = join(TASK_DIR, "auto-executor-config.json");
const RUNTIME_FILE = join(TASK_DIR, "auto-executor-runtime.json");
const DEFAULT_RETRY_DELAY_MS = 10_000;
const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;

const PRIORITY_ORDER: Record<TaskPriority, number> = {
	urgent: 4,
	high: 3,
	medium: 2,
	low: 1,
};

const KIND_ORDER: Record<RalphLoopTaskKind, number> = {
	implementation: 6,
	research: 5,
	planning: 4,
	documentation: 3,
	other: 2,
	validation: 1,
};

// ============================================
// State
// ============================================

let autoExecutorConfig: AutoExecutorConfig = {
	enabled: true,
	autoRun: true, // デフォルトは planner-led continuous execution
	maxRetries: 2,
};

let lastNotifiedTaskId: string | null = null;
let sessionEventUnsubscribe: (() => void) | null = null;

type ToolExecutor = (
	toolName: string,
	params: Record<string, unknown>,
) => Promise<{ content?: Array<{ type: string; text?: string }>; details?: Record<string, unknown> }>;

interface AutoDispatchTarget {
	task: Task;
	kind: RalphLoopTaskKind;
	reason: string;
	workpadId: string | null;
	mode: "fresh" | "resume";
	checkpoint: AutoExecutorCheckpoint | null;
}

// ============================================
// Storage Functions
// ============================================

function loadStorage(): TaskStorage {
	return loadSharedTaskStorage<TaskStorage>();
}

function saveStorage(storage: TaskStorage): void {
	saveSharedTaskStorage(storage);
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

function loadRuntimeState(): AutoExecutorRuntimeState {
	if (!existsSync(RUNTIME_FILE)) {
		return { checkpoints: [] };
	}
	try {
		const data = readFileSync(RUNTIME_FILE, "utf-8");
		const parsed = JSON.parse(data) as Partial<AutoExecutorRuntimeState>;
		return {
			checkpoints: Array.isArray(parsed.checkpoints) ? parsed.checkpoints : [],
		};
	} catch {
		return { checkpoints: [] };
	}
}

function saveRuntimeState(runtime: AutoExecutorRuntimeState): void {
	if (!existsSync(TASK_DIR)) {
		mkdirSync(TASK_DIR, { recursive: true });
	}
	writeFileSync(RUNTIME_FILE, JSON.stringify(runtime, null, 2));
}

function upsertCheckpoint(
	taskId: string,
	update: Partial<AutoExecutorCheckpoint> & Pick<AutoExecutorCheckpoint, "title" | "kind" | "reason">,
): AutoExecutorCheckpoint {
	const runtime = loadRuntimeState();
	const now = new Date().toISOString();
	const existingIndex = runtime.checkpoints.findIndex((item) => item.taskId === taskId);
	const existing = existingIndex >= 0 ? runtime.checkpoints[existingIndex] : null;
	const next: AutoExecutorCheckpoint = {
		taskId,
		title: update.title,
		description: update.description ?? existing?.description,
		kind: update.kind ?? existing?.kind ?? "other",
		reason: update.reason ?? existing?.reason ?? "durable auto executor state",
		workpadId: update.workpadId ?? existing?.workpadId,
		status: update.status ?? existing?.status ?? "claimed",
		ownerInstanceId: update.ownerInstanceId ?? existing?.ownerInstanceId,
		ownerPid: update.ownerPid ?? existing?.ownerPid,
		attemptCount: update.attemptCount ?? existing?.attemptCount ?? 0,
		resumeCount: update.resumeCount ?? existing?.resumeCount ?? 0,
		createdAt: existing?.createdAt ?? now,
		updatedAt: now,
		lastError: update.lastError ?? existing?.lastError,
	};

	if (existingIndex >= 0) {
		runtime.checkpoints[existingIndex] = next;
	} else {
		runtime.checkpoints.push(next);
	}

	saveRuntimeState(runtime);
	return next;
}

function getCheckpoint(taskId: string): AutoExecutorCheckpoint | null {
	return loadRuntimeState().checkpoints.find((item) => item.taskId === taskId) ?? null;
}

function isActiveCheckpointStatus(status: AutoExecutorCheckpointStatus): boolean {
	return status === "claimed" || status === "dispatched" || status === "interrupted";
}

function inferRecoveredTaskPriority(checkpoint: AutoExecutorCheckpoint): TaskPriority {
	switch (checkpoint.kind) {
		case "validation":
		case "documentation":
			return "medium";
		case "implementation":
		case "research":
		case "planning":
		case "other":
		default:
			return "high";
	}
}

function restoreTasksFromActiveCheckpoints(storage: TaskStorage): TaskStorage {
	const runtime = loadRuntimeState();
	const knownTaskIds = new Set(storage.tasks.map((task) => task.id));
	let changed = false;
	const nextTasks = [...storage.tasks];

	for (const checkpoint of runtime.checkpoints) {
		if (!isActiveCheckpointStatus(checkpoint.status)) {
			continue;
		}

		if (knownTaskIds.has(checkpoint.taskId)) {
			continue;
		}

		const recoveredTask: Task = {
			id: checkpoint.taskId,
			title: checkpoint.title || checkpoint.taskId,
			description: checkpoint.description,
			status: "in_progress",
			priority: inferRecoveredTaskPriority(checkpoint),
			tags: ["durable-resume"],
			createdAt: checkpoint.createdAt,
			updatedAt: checkpoint.updatedAt,
			ownerInstanceId: checkpoint.ownerInstanceId,
			claimedAt: checkpoint.updatedAt,
			lastError: checkpoint.lastError,
			completionGateStatus: "clear",
		};

		nextTasks.push(recoveredTask);
		knownTaskIds.add(checkpoint.taskId);
		changed = true;
	}

	if (!changed) {
		return storage;
	}

	const nextStorage: TaskStorage = {
		...storage,
		tasks: nextTasks,
	};
	saveStorage(nextStorage);
	return nextStorage;
}

function startTaskWorkpad(cwd: string, task: Task): string | null {
  const workflow = loadWorkflowDocument(cwd);
  if (!workflow.exists) {
    return null;
  }

  const record = createWorkpad(cwd, {
    task: task.title,
    source: "auto:task_run_next",
    issueId: task.id,
  });

  updateWorkpad(cwd, {
    id: record.metadata.id,
    section: "progress",
    content: `- task claimed automatically from queue: ${task.id}`,
    mode: "append",
  });
  updateWorkpad(cwd, {
    id: record.metadata.id,
    section: "next",
    content: "- inspect related files, implement the smallest working slice, then verify locally",
    mode: "replace",
  });

  return record.metadata.id;
}

function reclaimTaskOwnership(taskId: string): Task | null {
	const storage = loadStorage();
	const taskIndex = storage.tasks.findIndex((task) => task.id === taskId);
	if (taskIndex < 0) {
		return null;
	}

	const task = storage.tasks[taskIndex];
	task.status = "in_progress";
	task.ownerInstanceId = getInstanceId();
	task.claimedAt = new Date().toISOString();
	task.updatedAt = new Date().toISOString();
	saveStorage(storage);

	autoExecutorConfig.currentTaskId = task.id;
	saveConfig();

	return task;
}

function getToolExecutor(ctx: unknown): ToolExecutor | undefined {
	const anyCtx = ctx as {
		callTool?: (
			toolName: string,
			params: Record<string, unknown>,
		) => Promise<{ content?: Array<{ type: string; text?: string }>; details?: Record<string, unknown> }>;
		executeTool?: (options: {
			toolName: string;
			params: Record<string, unknown>;
		}) => Promise<{ content?: Array<{ type: string; text?: string }>; details?: Record<string, unknown> }>;
	};

	if (typeof anyCtx.callTool === "function") {
		const callTool = anyCtx.callTool;
		return (toolName, params) => callTool(toolName, params);
	}

	if (typeof anyCtx.executeTool === "function") {
		const executeTool = anyCtx.executeTool;
		return (toolName, params) => executeTool({ toolName, params });
	}

	return undefined;
}

function canAutoRunInContext(ctx: unknown): boolean {
	return Boolean(getToolExecutor(ctx));
}

function buildPlannerWorkerExecutionContext(input: {
	taskId: string;
	kind: string;
	reason: string;
	workpadId: string | null;
}): string {
	return [
		"## Continuous Executor Contract",
		"",
		"- この実行は mekann の既定 long-running mode です。",
		"- 進行責任は root planner が持ち、個々の worker は割り当てタスクだけに集中します。",
		"- worker 同士は直接調整しません。共有ロック前提の協調は禁止です。",
		"- 必要な分解は planner が行い、worker は handoff を planner 側へ返します。",
		"- 各反復は fresh context を前提にし、 durable state は task / workpad / workflow artifact に残します。",
		"- 巨大な静的計画に固定せず、観測結果に応じて task DAG を更新して構いません。",
		"- 小さく安全な変更だけで逃げず、担当タスクの完了責任を持って前に進めます。",
		"",
		"## Auto Execution Context",
		"",
		`- taskId: ${input.taskId}`,
		`- kind: ${input.kind}`,
		`- reason: ${input.reason}`,
		input.workpadId ? `- workpadId: ${input.workpadId}` : null,
		"- まず関連ファイルを読んで、最小の working slice を実装すること。",
		"- planner は research / implement / validate / review を必要最小限で fan-out してよい。",
		"- worker は他ワーカーの担当や大局を気にせず、自分のタスクだけ終わらせること。",
		"- 完了後は task_complete でこの taskId を完了すること。",
	].filter(Boolean).join("\n");
}

function buildDurableResumeContext(input: {
	cwd: string;
	workpadId: string | null;
	checkpoint: AutoExecutorCheckpoint | null;
}): string {
	const replay = createLongRunningReplay(input.cwd);
	const recentEvents = replay.recentEvents
		.slice(-5)
		.map((event) => `- ${event.type}: ${event.summary}`);
	const warnings = replay.warnings.slice(0, 5).map((warning) => `- ${warning}`);

	return [
		"## Durability Resume Contract",
		"",
		"- この実行は crash / timeout / interrupt 後の resume です。",
		"- 途中まで進んだ副作用をやみくもに再実行しないこと。",
		"- 最初に workpad / journal / git diff / verification artifact を読んで、現在地を再構成すること。",
		"- すでに終わっている手順は繰り返さず、未完了の最小 slice だけを再開すること。",
		input.workpadId ? `- durable workpadId: ${input.workpadId}` : "- durable workpadId: unavailable",
		input.checkpoint ? `- previous checkpoint status: ${input.checkpoint.status}` : null,
		input.checkpoint?.lastError ? `- previous interruption: ${input.checkpoint.lastError}` : null,
		`- long-running next action: ${replay.nextAction}`,
		`- long-running resume reason: ${replay.resumeReason}`,
		warnings.length > 0 ? "### Recovery Warnings" : null,
		...warnings,
		recentEvents.length > 0 ? "### Recent Durable Events" : null,
		...recentEvents,
	].filter(Boolean).join("\n");
}

function hasBlockingForeignInProgressTask(storage: TaskStorage): boolean {
	const instanceId = getInstanceId();

	return storage.tasks.some((task) => {
		if (task.status !== "in_progress") {
			return false;
		}

		if (!task.ownerInstanceId) {
			return false;
		}

		if (task.ownerInstanceId === instanceId) {
			return false;
		}

		const pid = extractPidFromInstanceId(task.ownerInstanceId);
		if (!pid) {
			return false;
		}

		return isProcessAlive(pid);
	});
}

function resolveNextAutoDispatch(storage: TaskStorage, cwd: string = process.cwd()): {
	target: AutoDispatchTarget | null;
	blockedReason: string | null;
} {
	const effectiveStorage = restoreTasksFromActiveCheckpoints(storage);

	if (hasBlockingForeignInProgressTask(effectiveStorage)) {
		return {
			target: null,
			blockedReason: "another active in_progress task is owned by a live instance",
		};
	}

	const runtime = loadRuntimeState();
	const resumableTasks = effectiveStorage.tasks
		.filter((task) => task.status === "in_progress")
		.map((task) => ({
			task,
			checkpoint: runtime.checkpoints.find((item) => item.taskId === task.id) ?? null,
		}))
		.filter(({ task, checkpoint }) => {
			if (!checkpoint || !isActiveCheckpointStatus(checkpoint.status)) {
				return false;
			}
			if (!task.ownerInstanceId) {
				return true;
			}
			if (task.ownerInstanceId === getInstanceId()) {
				return true;
			}
			const pid = extractPidFromInstanceId(task.ownerInstanceId);
			return Boolean(pid && !isProcessAlive(pid));
		})
		.sort((left, right) => compareLoopTasks(left.task, right.task));

	const resumable = resumableTasks[0];
	if (resumable) {
		return {
			target: {
				task: resumable.task,
				kind: resumable.checkpoint?.kind ?? classifyRalphLoopTaskKind(resumable.task),
				reason: "resume from durable checkpoint after interrupted auto-run",
				workpadId: resumable.checkpoint?.workpadId
					?? getSymphonyIssueState(cwd, resumable.task.id)?.workpadId
					?? null,
				mode: "resume",
				checkpoint: resumable.checkpoint,
			},
			blockedReason: null,
		};
	}

	const selection = selectNextLoopTask(effectiveStorage);
	return {
		target: selection
			? {
				task: selection.task,
				kind: selection.kind,
				reason: selection.reason,
				workpadId: getSymphonyIssueState(cwd, selection.task.id)?.workpadId ?? null,
				mode: "fresh",
				checkpoint: getCheckpoint(selection.task.id),
			}
			: null,
		blockedReason: null,
	};
}

function reconcileDurableAutoExecutorState(storage: TaskStorage): TaskStorage {
	const effectiveStorage = restoreTasksFromActiveCheckpoints(storage);
	const currentTaskId = autoExecutorConfig.currentTaskId;
	if (!currentTaskId) {
		return effectiveStorage;
	}

	const task = effectiveStorage.tasks.find((item) => item.id === currentTaskId);
	if (!task || task.status !== "in_progress" || task.ownerInstanceId !== getInstanceId()) {
		delete autoExecutorConfig.currentTaskId;
		saveConfig();
	}
	return effectiveStorage;
}

function releaseClaimedTask(taskId: string): Task | null {
	const storage = loadStorage();
	const taskIndex = storage.tasks.findIndex((task) => task.id === taskId);
	if (taskIndex < 0) {
		return null;
	}

	const task = storage.tasks[taskIndex];
	task.status = "todo";
	delete task.ownerInstanceId;
	delete task.claimedAt;
	task.updatedAt = new Date().toISOString();
	saveStorage(storage);

	if (autoExecutorConfig.currentTaskId === taskId) {
		delete autoExecutorConfig.currentTaskId;
		saveConfig();
	}

	return task;
}

function computeRetryDelayMs(retryAttempt: number): number {
	const exponent = Math.max(0, retryAttempt - 1);
	return Math.min(DEFAULT_RETRY_DELAY_MS * (2 ** exponent), MAX_RETRY_DELAY_MS);
}

function scheduleTaskRetry(taskId: string, message?: string): { task: Task | null; delayMs: number } {
	const storage = loadStorage();
	const taskIndex = storage.tasks.findIndex((task) => task.id === taskId);
	if (taskIndex < 0) {
		return { task: null, delayMs: DEFAULT_RETRY_DELAY_MS };
	}

	const task = storage.tasks[taskIndex];
	const retryCount = (task.retryCount ?? 0) + 1;
	const delayMs = computeRetryDelayMs(retryCount);
	task.status = "todo";
	task.retryCount = retryCount;
	task.nextRetryAt = new Date(Date.now() + delayMs).toISOString();
	task.lastError = message;
	task.updatedAt = new Date().toISOString();
	delete task.ownerInstanceId;
	delete task.claimedAt;
	delete task.completedAt;
	saveStorage(storage);

	if (autoExecutorConfig.currentTaskId === taskId) {
		delete autoExecutorConfig.currentTaskId;
		saveConfig();
	}

	return { task, delayMs };
}

function updateTaskWorkspaceVerification(
	taskId: string,
	status: "passed" | "failed",
	message?: string,
): Task | null {
	const storage = loadStorage();
	const taskIndex = storage.tasks.findIndex((task) => task.id === taskId);
	if (taskIndex < 0) {
		return null;
	}

	const task = storage.tasks[taskIndex];
	task.workspaceVerificationStatus = status;
	task.workspaceVerifiedAt = new Date().toISOString();
	task.workspaceVerificationMessage = message;
	task.updatedAt = new Date().toISOString();
	saveStorage(storage);
	return task;
}

function updateTaskCompletionGate(
	taskId: string,
	status: "clear" | "blocked",
	message?: string,
	blockers?: string[],
): Task | null {
	const storage = loadStorage();
	const taskIndex = storage.tasks.findIndex((task) => task.id === taskId);
	if (taskIndex < 0) {
		return null;
	}

	const task = storage.tasks[taskIndex];
	task.completionGateStatus = status;
	task.completionGateUpdatedAt = new Date().toISOString();
	task.completionGateMessage = message;
	task.completionGateBlockers = blockers?.length ? [...blockers] : [];
	task.updatedAt = new Date().toISOString();
	saveStorage(storage);
	return task;
}

function extractProofArtifactsFromText(text: string | undefined): string[] {
	const matches = new Set<string>();
	for (const line of String(text ?? "").split("\n")) {
		const match = line.match(/^\s*[-*]?\s*proof artifact:\s*(.+)\s*$/i);
		if (match?.[1]) {
			matches.add(match[1].trim());
		}
	}
	return [...matches];
}

function summarizeEvidenceLines(text: string | undefined): string[] {
	return String(text ?? "")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.filter((line) => line !== "- pending" && line !== "- created")
		.slice(0, 20);
}

function extractWorkspaceVerifyPassed(event: WorkspaceVerifyToolEvent): boolean {
	if (event.isError) {
		return false;
	}

	const candidates = [
		event.details?.success,
		event.result?.details?.success,
		event.result?.success,
	];

	for (const candidate of candidates) {
		if (typeof candidate === "boolean") {
			return candidate;
		}
	}

	return !event.isError;
}

function collectVerifiedCommands(
	verificationSection: string,
	requiredCommands: string[],
): string[] {
	return requiredCommands.filter((command) => commandSatisfied(verificationSection, command));
}

function collectTaskEvidence(cwd: string, taskId: string): TaskEvidenceSnapshot {
	const issueState = getSymphonyIssueState(cwd, taskId);
	const workpad = issueState?.workpadId ? loadWorkpad(cwd, issueState.workpadId) : null;
	const workflow = loadWorkflowDocument(cwd);
	const verificationSection = workpad?.sections.verification ?? "";
	const reviewSection = workpad?.sections.review ?? "";
	const progressSection = workpad?.sections.progress ?? "";
	const proofArtifacts = [
		...extractProofArtifactsFromText(progressSection),
		...extractProofArtifactsFromText(verificationSection),
		...extractProofArtifactsFromText(reviewSection),
	].filter((value, index, array) => array.indexOf(value) === index);
	const verifiedCommands = collectVerifiedCommands(
		verificationSection,
		workflow.frontmatter.verification?.required_commands ?? [],
	);
	const storage = loadStorage();
	const task = storage.tasks.find((item) => item.id === taskId);
	const compactVerification = verificationSection.toLowerCase();

	return {
		workflowExists: workflow.exists,
		completionGate: workflow.frontmatter.completion_gate ?? {},
		requiredCommands: workflow.frontmatter.verification?.required_commands ?? [],
		verificationSection,
		reviewSection,
		progressSection,
		proofArtifacts,
		verifiedCommands,
		hasWorkspaceVerification: task?.workspaceVerificationStatus === "passed"
			|| compactVerification.includes("workspace_verify passed")
			|| compactVerification.includes("verify:workspace")
			|| compactVerification.includes("workspace verification passed"),
		progressEvidence: summarizeEvidenceLines(progressSection),
		verificationEvidence: summarizeEvidenceLines(verificationSection),
		reviewEvidence: summarizeEvidenceLines(reviewSection),
	};
}

function syncTaskProofState(
	taskId: string,
	evidence: TaskEvidenceSnapshot,
): Task | null {
	const storage = loadStorage();
	const taskIndex = storage.tasks.findIndex((task) => task.id === taskId);
	if (taskIndex < 0) {
		return null;
	}

	const task = storage.tasks[taskIndex];
	task.proofArtifacts = evidence.proofArtifacts;
	task.verifiedCommands = evidence.verifiedCommands;
	task.progressEvidence = evidence.progressEvidence;
	task.verificationEvidence = evidence.verificationEvidence;
	task.reviewEvidence = evidence.reviewEvidence;
	task.updatedAt = new Date().toISOString();
	saveStorage(storage);
	return task;
}

function finalizeTaskStatus(
	taskId: string,
	status: "completed" | "failed",
): Task | null {
	const storage = loadStorage();
	const taskIndex = storage.tasks.findIndex((task) => task.id === taskId);
	if (taskIndex < 0) {
		return null;
	}

	const task = storage.tasks[taskIndex];
	if (task.status === status) {
		return task;
	}

	task.status = status;
	task.updatedAt = new Date().toISOString();
	task.completedAt = status === "completed" ? new Date().toISOString() : undefined;
	if (status === "completed") {
		delete task.nextRetryAt;
		delete task.lastError;
		delete task.retryCount;
		task.completionGateStatus = "clear";
		task.completionGateUpdatedAt = new Date().toISOString();
		task.completionGateMessage = "completion gate passed";
		task.completionGateBlockers = [];
	}
	saveStorage(storage);

	if (autoExecutorConfig.currentTaskId === taskId) {
		delete autoExecutorConfig.currentTaskId;
		saveConfig();
	}

	return task;
}

function syncTaskOutcomeToWorkpad(
	cwd: string,
	taskId: string,
	status: "completed" | "failed" | "retrying",
	message?: string,
): void {
	const issueState = getSymphonyIssueState(cwd, taskId);
	if (!issueState?.workpadId) {
		return;
	}

	if (status === "completed") {
		updateWorkpad(cwd, {
			id: issueState.workpadId,
			section: "verification",
			content: `- auto-run session completed${message ? `: ${message}` : ""}`,
			mode: "append",
		});
		updateWorkpad(cwd, {
			id: issueState.workpadId,
			section: "next",
			content: "- no further action required",
			mode: "replace",
		});
		return;
	}

	if (status === "retrying") {
		updateWorkpad(cwd, {
			id: issueState.workpadId,
			section: "verification",
			content: `- auto-run session failed, retry scheduled${message ? `: ${message}` : ""}`,
			mode: "append",
		});
		updateWorkpad(cwd, {
			id: issueState.workpadId,
			section: "next",
			content: "- wait for retry window, then resume the same task automatically",
			mode: "replace",
		});
		return;
	}

	updateWorkpad(cwd, {
		id: issueState.workpadId,
		section: "verification",
		content: `- auto-run session failed${message ? `: ${message}` : ""}`,
		mode: "append",
	});
	updateWorkpad(cwd, {
		id: issueState.workpadId,
		section: "next",
		content: "- inspect the failure, repair the smallest broken slice, then rerun the task",
		mode: "replace",
	});
}

function hasMeaningfulEvidence(text: string | undefined): boolean {
	const normalized = String(text ?? "").trim();
	if (!normalized) {
		return false;
	}

	const compact = normalized.toLowerCase();
	if (
		compact === "- pending"
		|| compact === "- created"
		|| compact === "- no required commands declared"
	) {
		return false;
	}

	const lines = normalized
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);

	return lines.some((line) => !line.startsWith("- [ ]"));
}

function commandSatisfied(verificationSection: string, command: string): boolean {
	const normalizedSection = verificationSection.toLowerCase();
	const normalizedCommand = command.trim().toLowerCase();
	if (!normalizedCommand) {
		return true;
	}

	if (normalizedSection.includes(`- [ ] ${normalizedCommand}`)) {
		return false;
	}

	if (normalizedSection.includes(`- [x] ${normalizedCommand}`)) {
		return true;
	}

	return normalizedSection.includes(normalizedCommand);
}

function evaluateCompletionGate(
	cwd: string,
	taskId: string,
	evidence?: TaskEvidenceSnapshot,
): { ok: boolean; blockers: string[] } {
	const snapshot = evidence ?? collectTaskEvidence(cwd, taskId);
	if (!snapshot.workflowExists) {
		return { ok: true, blockers: [] };
	}

	const completionGate = snapshot.completionGate;
	const blockers: string[] = [];

	if (completionGate.require_single_in_progress_step !== false) {
		const storage = loadStorage();
		const inProgressCount = storage.tasks.filter((task) => task.status === "in_progress").length;
		if (inProgressCount > 1) {
			blockers.push(`multiple in_progress tasks remain (${inProgressCount})`);
		}
	}

	for (const command of snapshot.requiredCommands) {
		if (!commandSatisfied(snapshot.verificationSection, command)) {
			blockers.push(`verification command not confirmed: ${command}`);
		}
	}

	if (completionGate.require_proof_artifacts !== false) {
		const hasProofArtifacts = snapshot.proofArtifacts.length > 0
			|| hasMeaningfulEvidence(snapshot.verificationSection)
			|| hasMeaningfulEvidence(snapshot.reviewSection)
			|| hasMeaningfulEvidence(snapshot.progressSection);
		if (!hasProofArtifacts) {
			blockers.push("proof artifacts are missing from workpad");
		}
	}

	if (completionGate.require_workspace_verification !== false) {
		if (!snapshot.hasWorkspaceVerification) {
			blockers.push("workspace verification proof is missing");
		}
	}

	return {
		ok: blockers.length === 0,
		blockers,
	};
}

function handleRuntimeSessionOutcome(event: {
	type: string;
	data: unknown;
}): void {
	if (event.type !== "session_updated") {
		return;
	}

	const session = event.data as {
		taskId?: string;
		status?: string;
		message?: string;
	};

	if (!session.taskId) {
		return;
	}

	const evidence = collectTaskEvidence(process.cwd(), session.taskId);
	const runtimeTask = loadStorage().tasks.find((task) => task.id === session.taskId);
	const checkpoint = getCheckpoint(session.taskId);

	if (session.status === "completed") {
		const gate = evaluateCompletionGate(process.cwd(), session.taskId, evidence);
		if (!gate.ok) {
			const gateMessage = `completion gate blocked: ${gate.blockers.join(" | ")}`;
			updateTaskCompletionGate(
				session.taskId,
				"blocked",
				gateMessage,
				gate.blockers,
			);
			const issueState = getSymphonyIssueState(process.cwd(), session.taskId);
			const retryAttempt = (issueState?.retryAttempt ?? 0) + 1;
			if (retryAttempt <= autoExecutorConfig.maxRetries) {
				const { delayMs } = scheduleTaskRetry(session.taskId, gateMessage);
				upsertCheckpoint(session.taskId, {
					title: runtimeTask?.title ?? session.taskId,
					description: runtimeTask?.description,
					kind: checkpoint?.kind ?? "other",
					reason: checkpoint?.reason ?? "completion gate blocked",
					workpadId: checkpoint?.workpadId,
					status: "interrupted",
					ownerInstanceId: getInstanceId(),
					ownerPid: process.pid,
					attemptCount: checkpoint?.attemptCount ?? 1,
					resumeCount: checkpoint?.resumeCount ?? 0,
					lastError: gateMessage,
				});
				syncTaskProofState(session.taskId, evidence);
				syncTaskOutcomeToWorkpad(
					process.cwd(),
					session.taskId,
					"retrying",
					`${gateMessage} (retry ${retryAttempt}/${autoExecutorConfig.maxRetries}, in ${Math.ceil(delayMs / 1000)}s)`,
				);
				return;
			}

			finalizeTaskStatus(session.taskId, "failed");
			upsertCheckpoint(session.taskId, {
				title: runtimeTask?.title ?? session.taskId,
				description: runtimeTask?.description,
				kind: checkpoint?.kind ?? "other",
				reason: checkpoint?.reason ?? "completion gate blocked",
				workpadId: checkpoint?.workpadId,
				status: "failed",
				ownerInstanceId: getInstanceId(),
				ownerPid: process.pid,
				attemptCount: checkpoint?.attemptCount ?? 1,
				resumeCount: checkpoint?.resumeCount ?? 0,
				lastError: gateMessage,
			});
			syncTaskProofState(session.taskId, evidence);
			syncTaskOutcomeToWorkpad(
				process.cwd(),
				session.taskId,
				"failed",
				`completion gate blocked: ${gate.blockers.join(" | ")} (retry budget exhausted)`,
			);
			return;
		}

		updateTaskCompletionGate(session.taskId, "clear", "completion gate passed", []);
		finalizeTaskStatus(session.taskId, "completed");
		upsertCheckpoint(session.taskId, {
			title: runtimeTask?.title ?? session.taskId,
			description: runtimeTask?.description,
			kind: checkpoint?.kind ?? "other",
			reason: checkpoint?.reason ?? "runtime session completed",
			workpadId: checkpoint?.workpadId,
			status: "completed",
			ownerInstanceId: getInstanceId(),
			ownerPid: process.pid,
			attemptCount: checkpoint?.attemptCount ?? 1,
			resumeCount: checkpoint?.resumeCount ?? 0,
			lastError: undefined,
		});
		syncTaskProofState(session.taskId, evidence);
		syncTaskOutcomeToWorkpad(process.cwd(), session.taskId, "completed", session.message);
		return;
	}

	if (session.status === "failed") {
		const issueState = getSymphonyIssueState(process.cwd(), session.taskId);
		const retryAttempt = (issueState?.retryAttempt ?? 0) + 1;
		if (retryAttempt <= autoExecutorConfig.maxRetries) {
			const { delayMs } = scheduleTaskRetry(session.taskId, session.message);
			upsertCheckpoint(session.taskId, {
				title: runtimeTask?.title ?? session.taskId,
				description: runtimeTask?.description,
				kind: checkpoint?.kind ?? "other",
				reason: checkpoint?.reason ?? "runtime session failed",
				workpadId: checkpoint?.workpadId,
				status: "interrupted",
				ownerInstanceId: getInstanceId(),
				ownerPid: process.pid,
				attemptCount: checkpoint?.attemptCount ?? 1,
				resumeCount: checkpoint?.resumeCount ?? 0,
				lastError: session.message,
			});
			syncTaskProofState(session.taskId, evidence);
			syncTaskOutcomeToWorkpad(
				process.cwd(),
				session.taskId,
				"retrying",
				`${session.message ?? "unknown error"} (retry ${retryAttempt}/${autoExecutorConfig.maxRetries}, in ${Math.ceil(delayMs / 1000)}s)`,
			);
			return;
		}

		finalizeTaskStatus(session.taskId, "failed");
		upsertCheckpoint(session.taskId, {
			title: runtimeTask?.title ?? session.taskId,
			description: runtimeTask?.description,
			kind: checkpoint?.kind ?? "other",
			reason: checkpoint?.reason ?? "runtime session failed",
			workpadId: checkpoint?.workpadId,
			status: "failed",
			ownerInstanceId: getInstanceId(),
			ownerPid: process.pid,
			attemptCount: checkpoint?.attemptCount ?? 1,
			resumeCount: checkpoint?.resumeCount ?? 0,
			lastError: session.message,
		});
		syncTaskProofState(session.taskId, evidence);
		syncTaskOutcomeToWorkpad(
			process.cwd(),
			session.taskId,
			"failed",
			`${session.message ?? "unknown error"} (retry budget exhausted)`,
		);
	}
}

async function autoRunNextTask(ctx: {
	cwd: string;
	ui?: ExtensionAPI["context"]["ui"];
	callTool?: (
		toolName: string,
		params: Record<string, unknown>,
	) => Promise<{ content?: Array<{ type: string; text?: string }>; details?: Record<string, unknown> }>;
	executeTool?: (options: {
		toolName: string;
		params: Record<string, unknown>;
	}) => Promise<{ content?: Array<{ type: string; text?: string }>; details?: Record<string, unknown> }>;
}, target?: AutoDispatchTarget): Promise<void> {
	const executeTool = getToolExecutor(ctx);
	if (!executeTool) {
		ctx.ui?.notify("自動実行を開始できません。tool executor が見つかりません。", "warning");
		return;
	}

	let taskId: string | null = null;
	let title: string | null = null;
	let description = "";
	let workpadId: string | null = null;
	let kind: RalphLoopTaskKind = "other";
	let reason = "auto dispatch from idle loop";
	let checkpoint = target?.checkpoint ?? null;

	if (target?.mode === "resume") {
		const reclaimed = reclaimTaskOwnership(target.task.id);
		if (!reclaimed) {
			ctx.ui?.notify("resume 対象タスクの所有権復旧に失敗しました。", "warning");
			return;
		}

		taskId = reclaimed.id;
		title = reclaimed.title;
		description = reclaimed.description ?? "";
		workpadId = target.workpadId;
		kind = target.kind;
		reason = target.reason;
		checkpoint = upsertCheckpoint(reclaimed.id, {
			title: reclaimed.title,
			description: reclaimed.description,
			kind: target.kind,
			reason: target.reason,
			workpadId: workpadId ?? undefined,
			status: "interrupted",
			ownerInstanceId: getInstanceId(),
			ownerPid: process.pid,
			attemptCount: (checkpoint?.attemptCount ?? 0) + 1,
			resumeCount: (checkpoint?.resumeCount ?? 0) + 1,
			lastError: checkpoint?.lastError,
		});
		claimSymphonyIssue({
			cwd: ctx.cwd,
			issueId: reclaimed.id,
			title: reclaimed.title,
			source: "task-auto-executor",
			reason: "durable resume claimed existing in_progress task",
			workpadId: workpadId ?? undefined,
		});
	} else {
		const nextTaskResult = await executeTool("task_run_next", {});
		const details = (nextTaskResult.details ?? {}) as Record<string, unknown>;
		taskId = typeof details.taskId === "string" ? details.taskId : null;
		title = typeof details.title === "string" ? details.title : null;
		description = typeof details.description === "string" ? details.description : "";
		workpadId = typeof details.workpadId === "string" ? details.workpadId : null;
		kind = typeof details.kind === "string" ? details.kind as RalphLoopTaskKind : "other";
		reason = typeof details.reason === "string" ? details.reason : "auto dispatch from idle loop";
	}

	if (!taskId || !title) {
		ctx.ui?.notify("次タスクの自動取得に失敗しました。", "warning");
		return;
	}

	const taskBody = description ? `${title}\n\n詳細: ${description}` : title;
	const extraContext = [
		buildPlannerWorkerExecutionContext({
			taskId,
			kind,
			reason,
			workpadId,
		}),
		target?.mode === "resume"
			? buildDurableResumeContext({
				cwd: ctx.cwd,
				workpadId,
				checkpoint,
			})
			: null,
	].filter(Boolean).join("\n\n");

	checkpoint = upsertCheckpoint(taskId, {
		title,
		description,
		kind,
		reason,
		workpadId: workpadId ?? undefined,
		status: "dispatched",
		ownerInstanceId: getInstanceId(),
		ownerPid: process.pid,
		attemptCount: target?.mode === "resume"
			? (checkpoint?.attemptCount ?? 1)
			: (checkpoint?.attemptCount ?? 0) + 1,
		resumeCount: checkpoint?.resumeCount ?? 0,
		lastError: undefined,
	});

	if (workpadId) {
		updateWorkpad(ctx.cwd, {
			id: workpadId,
			section: "progress",
			content: target?.mode === "resume"
				? "- durable auto-run resume started via task_auto_executor"
				: "- auto-run dispatch started via task_auto_executor",
			mode: "append",
		});
	}

	try {
		await executeTool("subagent_run_dag", {
			task: taskBody,
			taskId,
			extraContext,
			autoGenerate: true,
		});
		ctx.ui?.notify(`自動実行を開始しました: ${title}`, "info");
	} catch (error) {
		const restoredTask = releaseClaimedTask(taskId);
		upsertCheckpoint(taskId, {
			title: restoredTask?.title ?? title,
			description: restoredTask?.description ?? description,
			kind,
			reason,
			workpadId: workpadId ?? undefined,
			status: "interrupted",
			ownerInstanceId: getInstanceId(),
			ownerPid: process.pid,
			attemptCount: checkpoint?.attemptCount ?? 1,
			resumeCount: checkpoint?.resumeCount ?? 0,
			lastError: error instanceof Error ? error.message : String(error),
		});
		releaseSymphonyIssue({
			cwd: ctx.cwd,
			issueId: taskId,
			title: restoredTask?.title ?? title,
			source: "task-auto-executor",
			reason: `auto-run dispatch failed: ${error instanceof Error ? error.message : String(error)}`,
			workpadId: workpadId ?? undefined,
		});
		if (workpadId) {
			updateWorkpad(ctx.cwd, {
				id: workpadId,
				section: "verification",
				content: `- auto-run dispatch failed: ${error instanceof Error ? error.message : String(error)}`,
				mode: "append",
			});
			updateWorkpad(ctx.cwd, {
				id: workpadId,
				section: "next",
				content: "- inspect the runner failure, then retry auto dispatch or execute manually",
				mode: "replace",
			});
		}
		ctx.ui?.notify(
			`自動実行の起動に失敗しました: ${title}`,
			"warning",
		);
	}
}

// ============================================
// Task Selection
// ============================================

function getNextPendingTask(storage: TaskStorage): Task | null {
	const selection = selectNextLoopTask(storage);
	return selection?.task ?? null;
}

function buildTaskSearchText(task: Task): string {
	return [
		task.title,
		task.description ?? "",
		task.tags.join(" "),
	].join("\n").toLowerCase();
}

export function classifyRalphLoopTaskKind(task: Task): RalphLoopTaskKind {
	const haystack = buildTaskSearchText(task);

	if (/(lint|typecheck|test|verify|verification|build|smoke|regression|coverage|検証|テスト|型検査|ビルド)/i.test(haystack)) {
		return "validation";
	}

	if (/(implement|fix|refactor|code|patch|repair|migration|実装|修正|変更|追加|移行)/i.test(haystack)) {
		return "implementation";
	}

	if (/(research|investigate|analyze|search|audit|explore|調査|分析|検索|監査)/i.test(haystack)) {
		return "research";
	}

	if (/(plan|spec|design|todo|roadmap|計画|仕様|設計)/i.test(haystack)) {
		return "planning";
	}

	if (/(docs|document|readme|comment|documentation|ドキュメント|コメント|readme)/i.test(haystack)) {
		return "documentation";
	}

	return "other";
}

function compareLoopTasks(left: Task, right: Task): number {
	const priorityDiff = PRIORITY_ORDER[right.priority] - PRIORITY_ORDER[left.priority];
	if (priorityDiff !== 0) return priorityDiff;

	const kindDiff = KIND_ORDER[classifyRalphLoopTaskKind(right)] - KIND_ORDER[classifyRalphLoopTaskKind(left)];
	if (kindDiff !== 0) return kindDiff;

	return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
}

export function selectNextLoopTask(storage: TaskStorage): RalphLoopSelection | null {
	const instanceId = getInstanceId();
	
	// 候補となるタスクを抽出
	const candidates = storage.tasks.filter(t => {
		// todoタスクは常に候補
		if (t.status === "todo") {
			if (t.nextRetryAt && Date.parse(t.nextRetryAt) > Date.now()) {
				return false;
			}
			return true;
		}
		
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

	candidates.sort(compareLoopTasks);

	const nonValidationCandidates = candidates.filter(task => classifyRalphLoopTaskKind(task) !== "validation");
	const selected = nonValidationCandidates[0] ?? candidates[0];
	const kind = classifyRalphLoopTaskKind(selected);
	const validationLaneLimited = nonValidationCandidates.length > 0;
	const reason = validationLaneLimited
		? `one thing per loop: implementation/research lane preferred over validation lane (${kind})`
		: `one thing per loop: best available pending task (${kind})`;

	return {
		task: selected,
		kind,
		reason,
		validationLaneLimited,
	};
}

export function buildRalphLoopExecutionBrief(selection: RalphLoopSelection): string {
	const validationNote = selection.validationLaneLimited
		? "- Validation lane は1本に絞る。実装や調査が残っている間は、この1件以外の検証仕事を並列に増やさない。"
		: "- このタスクが現時点の最重要項目です。これ1件だけを前に進める。";

	return [
		"## Ralph Loop Execution Brief",
		"",
		`- **選定理由**: ${selection.reason}`,
		`- **タスク種別**: ${selection.kind}`,
		"- **基本方針**: One thing per loop. このタスクだけを進める。",
		"- **変更前**: 未実装だと決めつけず、関連コードを検索して読んでから触る。",
		"- **実装順序**: quick and dirty prototype -> 局所検証 -> 観測した失敗だけ修復。",
		"- **品質**: placeholder 実装は禁止。足りない機能は仕様どおりに埋める。",
		validationNote,
		"- **継続性**: 新しい発見や別件バグは todo / plan / journal に残してから進む。",
	].join("\n");
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
	reconcileDurableAutoExecutorState(loadStorage());
	if (!sessionEventUnsubscribe) {
		sessionEventUnsubscribe = onSessionEvent(handleRuntimeSessionOutcome);
	}

	// Tool: Run next pending task
	pi.registerTool({
		name: "task_run_next",
		label: "Run Next Pending Task",
		description: "Execute the next pending task from the task queue (highest priority first)",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const storage = loadStorage();
			const selection = selectNextLoopTask(storage);
			const nextTask = selection?.task ?? null;

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
			const workpadId = startTaskWorkpad(ctx.cwd, nextTask);
			upsertCheckpoint(nextTask.id, {
				title: nextTask.title,
				description: nextTask.description,
				kind: selection?.kind ?? classifyRalphLoopTaskKind(nextTask),
				reason: selection?.reason ?? "claimed from task_run_next",
				workpadId: workpadId ?? undefined,
				status: "claimed",
				ownerInstanceId: instanceId,
				ownerPid: process.pid,
				attemptCount: 0,
				resumeCount: 0,
				lastError: undefined,
			});
			claimSymphonyIssue({
				cwd: ctx.cwd,
				issueId: nextTask.id,
				title: nextTask.title,
				source: "task-auto-executor",
				reason: "claimed from task_run_next",
				workpadId: workpadId ?? undefined,
			});

			// Build task description for execution
			const taskDescription = nextTask.description
				? `${nextTask.title}\n\n詳細: ${nextTask.description}`
				: nextTask.title;
			const executionBrief = selection ? buildRalphLoopExecutionBrief(selection) : "";

			return {
				content: [{
					type: "text",
					text: `## 次のタスクを実行します

**タスクID**: ${nextTask.id}
**タイトル**: ${nextTask.title}
**優先度**: ${nextTask.priority}
**ステータス**: in_progress
${workpadId ? `**WORKPAD**: ${workpadId}` : ""}

---

${executionBrief}

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
					description: nextTask.description,
					kind: selection?.kind,
					reason: selection?.reason,
					workpadId,
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
		async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
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

			const nextSelection = selectNextLoopTask(storage);
			const nextTask = nextSelection?.task ?? null;
			if (nextTask) {
				output += `---\n**次に実行**: [${nextTask.id}] ${nextTask.title} (${nextTask.priority})\n`;
				output += `**種別**: ${nextSelection?.kind ?? "other"}\n`;
				output += `**理由**: ${nextSelection?.reason ?? "priority order"}`;
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
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
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

※ 自動実行が有効な場合、planner-led DAG 実行を自動で開始します。`,
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
		async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
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
		const { target, blockedReason } = resolveNextAutoDispatch(storage, ctx.cwd);
		const nextTask = target?.task ?? null;

		if (!nextTask) {
			ctx.ui.setStatus("auto-executor", undefined);
			if (blockedReason) {
				ctx.ui.setStatus(
					"auto-executor",
					ctx.ui.theme.fg("warning", "他インスタンスの実行中タスクを優先")
				);
			}
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

		if (autoExecutorConfig.autoRun && canAutoRunInContext(ctx)) {
			await autoRunNextTask(ctx as never, target ?? undefined);
			return;
		}

		// Notify about the next task
		if (!autoExecutorConfig.autoRun) {
			ctx.ui.notify(
			`[アイドル] 次のタスク: ${nextTask.title} (${nextTask.priority}, ${target?.kind ?? "other"})\n${target?.reason ?? ""}\n「次のタスクを実行して」と言うと実行します。`,
			"info"
			);
		}
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

	pi.on("tool_result", async (event, ctx) => {
		const anyEvent = event as WorkspaceVerifyToolEvent;
		if (anyEvent.toolName !== "workspace_verify") {
			return;
		}

		const taskId = autoExecutorConfig.currentTaskId;
		if (!taskId) {
			return;
		}

		const message = typeof anyEvent.result?.summary === "string"
			? String(anyEvent.result.summary)
			: typeof anyEvent.error === "string"
				? anyEvent.error
				: anyEvent.isError
					? "workspace verification failed"
					: "workspace verification passed";

		const status = extractWorkspaceVerifyPassed(anyEvent) ? "passed" : "failed";
		updateTaskWorkspaceVerification(taskId, status, message);
		const issueState = getSymphonyIssueState(ctx.cwd, taskId);
		if (issueState?.workpadId) {
			updateWorkpad(ctx.cwd, {
				id: issueState.workpadId,
				section: "verification",
				content: `- workspace_verify ${status}: ${message}`,
				mode: "append",
			});
		}
	});

	// Event: Session start
	pi.on("session_start", async (_event, ctx) => {
		loadConfig();
		const storage = reconcileDurableAutoExecutorState(loadStorage());
		const { target, blockedReason } = resolveNextAutoDispatch(storage, ctx.cwd);
		const nextTask = target?.task ?? null;
		const runnableCount = target ? 1 : 0;
		const todoCount = storage.tasks.filter(t => t.status === "todo").length;
		const reclaimableInProgressCount = storage.tasks.filter((task) => {
			if (task.status !== "in_progress") {
				return false;
			}
			if (!task.ownerInstanceId) {
				return true;
			}
			if (task.ownerInstanceId === getInstanceId()) {
				return true;
			}
			const pid = extractPidFromInstanceId(task.ownerInstanceId);
			return Boolean(pid && !isProcessAlive(pid));
		}).length;

		if (ctx?.ui && (todoCount > 0 || reclaimableInProgressCount > 0 || blockedReason)) {
			ctx.ui.notify(
				blockedReason
					? `[自動実行] 他インスタンスの実行中タスクを優先するため、新規自動起動は保留します。`
					: `[自動実行] todo=${todoCount}件 / reclaimable=${reclaimableInProgressCount}件。${autoExecutorConfig.enabled ? (autoExecutorConfig.autoRun ? "planner-led 自動実行を継続します。" : "アイドル時に通知します。") : ""}`,
				"info"
			);
			if (nextTask) {
				ctx.ui.setStatus(
					"auto-executor",
					ctx.ui.theme.fg("warning", `待機中: ${nextTask.title.slice(0, 25)}...`)
				);
			} else if (blockedReason) {
				ctx.ui.setStatus(
					"auto-executor",
					ctx.ui.theme.fg("warning", "他インスタンスの実行中タスクを優先")
				);
			}
		}

		if (
			autoExecutorConfig.enabled
			&& autoExecutorConfig.autoRun
			&& !autoExecutorConfig.currentTaskId
			&& runnableCount > 0
			&& canAutoRunInContext(ctx)
		) {
			await autoRunNextTask(ctx as never, target ?? undefined);
		}
	});

	// Command: /auto-executor
	pi.registerCommand("auto-executor", {
		description: "Toggle or check auto task executor",
		handler: async (args, ctx) => {
			if (args === "status") {
				const status = getAutoExecutorStatus();
				ctx.ui.notify(
					`自動実行: ${status.enabled ? "有効" : "無効"} | planner-led autoRun: ${status.autoRun ? "有効" : "無効"} | 待機中: ${status.pendingCount}件`,
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
		if (autoExecutorConfig.currentTaskId) {
			const task = loadStorage().tasks.find((item) => item.id === autoExecutorConfig.currentTaskId);
			if (task && task.status === "in_progress") {
				const checkpoint = getCheckpoint(task.id);
				upsertCheckpoint(task.id, {
					title: task.title,
					description: task.description,
					kind: checkpoint?.kind ?? classifyRalphLoopTaskKind(task),
					reason: checkpoint?.reason ?? "session shutdown interrupted auto-run",
					workpadId: checkpoint?.workpadId,
					status: "interrupted",
					ownerInstanceId: task.ownerInstanceId,
					ownerPid: checkpoint?.ownerPid ?? process.pid,
					attemptCount: checkpoint?.attemptCount ?? 1,
					resumeCount: checkpoint?.resumeCount ?? 0,
					lastError: checkpoint?.lastError ?? "session shutdown before task completion",
				});
			}
		}
		sessionEventUnsubscribe?.();
		sessionEventUnsubscribe = null;
		isInitialized = false;
	});
}
