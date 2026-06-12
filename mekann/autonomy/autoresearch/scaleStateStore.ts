import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { type AutoresearchContractV1 } from "./contractV1.js";
import { getPlanDir, readState, writeState } from "./layout.js";
import { type ScaleStateV1, type ScaleStatus } from "./scaleTypes.js";

function nowIso(): string { return new Date().toISOString(); }
function sha12(s: string): string { return crypto.createHash("sha256").update(s).digest("hex").slice(0, 12); }
function scaleActionId(): string { return `scale_act_${Date.now().toString(36)}_${crypto.randomBytes(2).toString("hex")}`; }

export function isScalingContract(contract: unknown): contract is AutoresearchContractV1 & { mode: "test_time_scaling"; scaling: Record<string, unknown> } {
	return Boolean(contract && typeof contract === "object" && (contract as any).mode === "test_time_scaling" && (contract as any).scaling);
}

export function scalePlanId(contract: AutoresearchContractV1, planMarkdown: string): string {
	return "plan-scale-" + sha12(JSON.stringify(contract) + "\n" + planMarkdown);
}

export function scalingDir(cwd: string, planId?: string): string {
	const s = readState(cwd);
	const id = planId ?? s.currentPlanId;
	if (!id) throw new Error("current scaling plan が見つかりません");
	const planDir = s.currentPlanDir ? path.resolve(cwd, s.currentPlanDir) : getPlanDir(cwd, id);
	return path.join(planDir, "scaling");
}

export function scaleStatePath(cwd: string, planId?: string): string { return path.join(scalingDir(cwd, planId), "state.json"); }
export function scaleEventsPath(cwd: string, planId?: string): string { return path.join(scalingDir(cwd, planId), "events.jsonl"); }
export function scaleSummaryPath(cwd: string, planId?: string): string { return path.join(scalingDir(cwd, planId), "latest-summary.md"); }

export function defaultScaleState(planId: string, contractHash: string, status: ScaleStatus = "approved", contract?: AutoresearchContractV1): ScaleStateV1 {
	const ts = nowIso();
	return {
		version: 1,
		status,
		planId,
		contractHash,
		generation: 0,
		queues: { hypotheses: 0, proposals: 0, candidates: 0 },
		resources: scaleResourcesFromContract(contract),
		createdAt: ts,
		updatedAt: ts,
	};
}

function scaleResourcesFromContract(contract?: AutoresearchContractV1): ScaleStateV1["resources"] {
	const scaling = (contract as any)?.scaling;
	const roles = scaling?.roles ?? {};
	const resources = scaling?.resources ?? {};
	return {
		subagentsUsed: 0,
		subagentsMax: Math.max(0, numberConfig(roles.scouts, 2)),
		evaluationsUsed: 0,
		evaluationsMax: Math.max(1, numberConfig(resources.maxConcurrentEvaluations, 1)),
		worktreesUsed: 0,
		worktreesMax: Math.max(1, numberConfig(resources.maxActiveWorktrees, 2)),
	};
}

function numberConfig(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
}

export function readScaleState(cwd: string): ScaleStateV1 | null {
	try { return JSON.parse(fs.readFileSync(scaleStatePath(cwd), "utf8")) as ScaleStateV1; }
	catch { return null; }
}

export function writeScaleState(cwd: string, state: ScaleStateV1): void {
	const dir = scalingDir(cwd, state.planId);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, "state.json"), JSON.stringify({ ...state, updatedAt: nowIso() }, null, 2) + "\n", "utf8");
}

export function appendScaleEvent(cwd: string, event: Record<string, unknown>): void {
	const s = readScaleState(cwd);
	const dir = scalingDir(cwd, s?.planId);
	fs.mkdirSync(dir, { recursive: true });
	fs.appendFileSync(path.join(dir, "events.jsonl"), JSON.stringify({ ...event, createdAt: event.createdAt ?? nowIso() }) + "\n", "utf8");
}

export function updateScaleSummary(cwd: string, state: ScaleStateV1): void {
	const dir = scalingDir(cwd, state.planId);
	fs.mkdirSync(dir, { recursive: true });
	const lines = [
		"# Autoresearch Scale Summary",
		"",
		`State: ${state.status}`,
		`Plan: ${state.planId ?? "?"}`,
		`Generation: ${state.generation}`,
		`Active action: ${state.activeAction ? `${state.activeAction.type} (${state.activeAction.action_id})` : "none"}`,
		`Queues: hypotheses=${state.queues.hypotheses} proposals=${state.queues.proposals} candidates=${state.queues.candidates}`,
		`Resources: subagents=${state.resources.subagentsUsed}/${state.resources.subagentsMax} evaluations=${state.resources.evaluationsUsed}/${state.resources.evaluationsMax} worktrees=${state.resources.worktreesUsed}/${state.resources.worktreesMax}`,
		`Pending adoption: ${state.pendingAdoptionCandidateId ?? "none"}`,
		`Planning backlog: ${state.planningBacklog?.length ?? 0}`,
		`Phase: ${state.phase ?? "none"}`,
	];
	if (state.pauseReasonCode) lines.push(`Pause reason code: ${state.pauseReasonCode}`);
	if (state.pauseReason) lines.push(`Pause reason: ${state.pauseReason}`);
	if (state.planningBacklog?.length) {
		lines.push("", "## Planning backlog", "", "次回 planning の入力候補。running 中の scope 変更要求ではありません。");
		for (const item of state.planningBacklog) {
			lines.push(
				"",
				`### ${item.id}`,
				`- Priority: ${item.priority}`,
				`- Risk: ${item.risk}`,
				`- Summary: ${item.summary}`,
				`- Why out of contract: ${item.why_out_of_contract}`,
				`- Suggested contract change: ${item.suggested_contract_change}`,
			);
			if (item.related_candidate_id) lines.push(`- Related candidate: ${item.related_candidate_id}`);
			if (item.related_hypothesis_id) lines.push(`- Related hypothesis: ${item.related_hypothesis_id}`);
			if (item.evidence?.length) lines.push("- Evidence:", ...item.evidence.map((e) => `  - ${e}`));
		}
	}
	fs.writeFileSync(path.join(dir, "latest-summary.md"), lines.join("\n") + "\n", "utf8");
}

export function initializeScalingStateForApprovedContract(cwd: string, contract: AutoresearchContractV1, contractHash: string, planMarkdown: string): { planId: string; planDir: string; state: ScaleStateV1 } {
	const planId = scalePlanId(contract, planMarkdown);
	const planDir = getPlanDir(cwd, planId);
	fs.mkdirSync(planDir, { recursive: true });
	fs.writeFileSync(path.join(planDir, "plan.md"), planMarkdown, "utf8");
	fs.writeFileSync(path.join(planDir, "contract.json"), JSON.stringify(contract, null, 2) + "\n", "utf8");
	const rel = path.relative(cwd, planDir) || planDir;
	writeState(cwd, {
		...readState(cwd),
		currentPlanId: planId,
		currentPlanDir: rel,
		currentContractHash: contractHash,
		runCount: 0,
		latestRunId: undefined,
		bestRunId: undefined,
		bestMetric: undefined,
	});
	const state = defaultScaleState(planId, contractHash, "approved", contract);
	writeScaleState(cwd, state);
	appendScaleEvent(cwd, { type: "scaling_approved", planId, contractHash });
	updateScaleSummary(cwd, state);
	return { planId, planDir, state };
}
