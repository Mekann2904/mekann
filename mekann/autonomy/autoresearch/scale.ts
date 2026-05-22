import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { evaluateQueryStatically } from "./queryEvaluation.js";
import { computeContractHash, filterInternalPaths, planPath, readCurrentContract, readLockFile, type AutoresearchContractV1 } from "./contractV1.js";
import { getPlanDir, readState, writeState } from "./layout.js";
import { getChangedFiles } from "./runner.js";

export type ScaleStatus = "none" | "planning" | "approved" | "running" | "draining" | "paused" | "stopped";

export interface ScaleRuntimeStore {
	active: boolean;
	promptQueued: boolean;
}

export interface ScaleAction {
	action_id: string;
	type: string;
	instruction: string;
	expected_completion: { type: string; required_fields: string[] };
	/** Concrete tool calls the root agent should perform for this action. */
	tool_calls?: Array<{ tool: string; params: Record<string, unknown> }>;
}

export interface ScaleHypothesisRecord {
	id: string;
	slot: string;
	hypothesis: string;
	rationale?: string;
	suggested_paths: string[];
	expected_evidence: string[];
	risk: "low" | "medium" | "high";
	score?: number;
	status: "new" | "scored" | "assigned" | "exhausted";
}

export type ScalePhase = "need_scouts" | "waiting_scouts" | "need_scoring" | "need_proposer" | "waiting_proposer" | "need_critic" | "waiting_critic" | "need_candidate_eval" | "generation_review";

export interface ScaleStateV1 {
	version: 1;
	status: ScaleStatus;
	planId?: string;
	contractHash?: string;
	generation: number;
	activeAction?: ScaleAction;
	stopRequested?: boolean;
	pauseReason?: string;
	bestCandidateId?: string;
	pendingAdoptionCandidateId?: string;
	phase?: ScalePhase;
	hypotheses?: ScaleHypothesisRecord[];
	candidateIds?: string[];
	criticFindings?: Array<{ candidate_id?: string; severity?: string; finding: string }>;
	strategySurvivors?: Array<{ kind: "slot" | "role_template" | "evidence_pattern"; name: string; score?: number; note?: string }>;
	queues: { hypotheses: number; proposals: number; candidates: number };
	resources: { subagentsUsed: number; subagentsMax: number; evaluationsUsed: number; evaluationsMax: number; worktreesUsed: number; worktreesMax: number };
	createdAt: string;
	updatedAt: string;
}

export const BASELINE_HYPOTHESIS_SLOTS = [
	"file_cluster",
	"algorithmic_strategy",
	"measurement_bottleneck",
	"risk_reduction",
	"negative_control",
	"cross_cutting_simplification",
] as const;

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

export function defaultScaleState(planId: string, contractHash: string, status: ScaleStatus = "approved"): ScaleStateV1 {
	const ts = nowIso();
	return {
		version: 1,
		status,
		planId,
		contractHash,
		generation: 0,
		queues: { hypotheses: 0, proposals: 0, candidates: 0 },
		resources: { subagentsUsed: 0, subagentsMax: 2, evaluationsUsed: 0, evaluationsMax: 1, worktreesUsed: 0, worktreesMax: 2 },
		createdAt: ts,
		updatedAt: ts,
	};
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
		`Phase: ${state.phase ?? "none"}`,
	];
	if (state.pauseReason) lines.push(`Pause reason: ${state.pauseReason}`);
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
	const state = defaultScaleState(planId, contractHash, "approved");
	writeScaleState(cwd, state);
	appendScaleEvent(cwd, { type: "scaling_approved", planId, contractHash });
	updateScaleSummary(cwd, state);
	return { planId, planDir, state };
}

export function buildScalingPlan(query: string): { markdown: string; contract: AutoresearchContractV1; contractHash: string; decision: string; blockingIssues: string[]; clarifyingQuestions: string[] } {
	const evaluation = evaluateQueryStatically(query);
	const m = evaluation.contractDraft.primaryMetric;
	const metricName = m.name ?? "duration_seconds";
	const metricDirection = m.direction === "higher" ? "higher" : "lower";
	const metricSource = m.measurementMethod === "wall_clock" ? "wall_clock" : "metric_line";
	const objectiveSlots = deriveObjectiveSlots(query);
	const contract = {
		schemaVersion: "autoresearch/v1",
		mode: "test_time_scaling",
		objective: {
			summary: evaluation.contractDraft.objective || query,
			successDefinition: `${metricName} improves in ${metricDirection} direction through evidence-driven candidate selection`,
		},
		scope: {
			allowedWritePaths: ["src/**", "tests/**", "lib/**"],
			forbiddenWritePaths: ["autoresearch.sh", "checks.sh", "benchmarks/**", "benchmark/**", "fixtures/**", "test/fixtures/**", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"],
			immutableReadPaths: ["autoresearch.sh", "checks.sh", "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "benchmarks/**", "benchmark/**", "fixtures/**", "test/fixtures/**"],
			requireGit: true,
			requireCleanGitWorktree: true,
		},
		evaluation: {
			benchmark: { command: { argv: ["bash", "./autoresearch.sh"], cwd: "." }, timeoutSeconds: 600, repeats: 3, aggregate: "median" },
			primaryMetric: {
				name: metricName,
				direction: metricDirection,
				source: metricSource === "wall_clock" ? { type: "wall_clock" } : { type: "metric_line", format: "METRIC <name>=<number>", fallback: "wall_clock" },
			},
			checks: evaluation.contractDraft.checksCommand ? [{ name: "default-checks", command: { argv: ["bash", "./checks.sh"], cwd: "." }, timeoutSeconds: 300, required: true }] : [],
		},
		acceptance: {
			mode: "better_than_baseline",
			minRelativeImprovement: 0.02,
			requireImprovementAboveNoiseFloor: true,
			requireAllChecksPass: true,
			rejectIfMetricMissing: true,
			rejectIfImmutableReadPathChanged: true,
			rejectIfForbiddenFilesChanged: true,
			rejectIfBenchmarkChanged: true,
		},
		loop: { maxIterations: 50, maxRuntimeMinutes: 120, maxConsecutiveNoImprovement: 3, maxConsecutiveFailures: 2 },
		failurePolicy: { onBenchmarkFailure: "discard", onCheckFailure: "discard", onMetricMissing: "discard", onContractViolation: "pause", onRevertFailure: "pause" },
		scaling: {
			population: { initialHypotheses: 6, candidatesPerGeneration: 3, survivorsPerGeneration: 1, baselineSlots: [...BASELINE_HYPOTHESIS_SLOTS], objectiveDerivedSlots: objectiveSlots },
			roles: { scouts: 2, proposers: 2, critics: 1, historians: 1 },
			generation: { proposalMapping: "one_hypothesis_one_proposal", evaluationOrder: "slot_diversity_round_robin", survivorKinds: ["candidate", "hypothesis", "strategy"] },
			scoring: { method: "rules_with_critic_comments", ranking: "hard_gate_then_primary_metric" },
			resources: { respectSubagentConcurrencyLimit: true, maxConcurrentEvaluations: 1, maxActiveWorktrees: 2 },
			evidence: { preferMechanicalEvidence: true, recordFailedCandidates: true, recordPatterns: ["checks", "benchmark", "critic_finding", "cheap_evidence"] },
			stopPolicy: { stopCommand: "/autoresearch-scale stop", gracefulStopBoundary: "candidate", internalState: "draining", uiState: "graceful stopping", completeMarkerBehavior: "record_exploration_exhaustion" },
		},
	} as AutoresearchContractV1;
	const markdown = [
		"# Autoresearch Scaling Plan", "", "## User Query", "", query,
		"", "## Interpreted Objective", "", contract.objective.summary,
		"", "## Scaling Strategy", "", "Autoresearch test-time scaling は既存 autoresearch loop を置き換えず、候補集団・証拠・世代更新で探索量を増やします。root agent は supervisor が出す単一 action を実行します。",
		"", "## Hypothesis Population", "", "Baseline slots:", ...BASELINE_HYPOTHESIS_SLOTS.map((s) => `- ${s}`), "", "Objective-derived slots:", ...(objectiveSlots.length ? objectiveSlots.map((s) => `- ${s}`) : ["- （目的文から追加 slot は検出されませんでした。必要なら編集してください）"]),
		"", "## Role Mix", "", "- scout: structured hypotheses を作る", "- proposer: 1 hypothesis から 1 patch proposal を作る", "- critic: scope / metric hacking / hidden side effect を監査する", "- historian: failure memory と strategy survivor を整理する",
		"", "## Generation Policy", "", "- hypothesis は rule-based scoring + critic comments で順位づける", "- candidate evaluation は slot diversity round-robin で行う", "- benchmark は初期値では逐次実行する", "- candidate / hypothesis / strategy survivor を別カテゴリで残す",
		"", "## Evidence Policy", "", "- contract, checks, benchmark, git diff, scope validation, revert 可能性を中心証拠にする", "- Negative-control hypothesis は弱い patch ではなく評価系の sanity check とする", "- COMPLETE marker は停止ではなく exploration exhaustion として記録する",
		"", "## Stop / Pause Policy", "", "- `/autoresearch-scale stop` は graceful stop。現在の candidate evaluation を完了してから止める", "- safety pause は contract violation / unexpected dirty workspace / revert failure / resource error / human decision required で使う", "- winning candidate は pending adoption として保持し、main worktree には自動反映しない",
		"", "## Assumptions", "", ...evaluation.contractDraft.constraints.map((c) => `- ${c}`), `- Platform: ${process.platform}`,
		"", "## Unknowns", "", ...evaluation.clarifyingQuestions.map((q) => `- ${q}`),
		"", "## Evaluation Contract", "", "```autoresearch-contract jsonc", JSON.stringify(contract, null, 2), "```",
	].join("\n");
	return { markdown, contract, contractHash: computeContractHash(contract), decision: evaluation.decision, blockingIssues: evaluation.blockingIssues, clarifyingQuestions: evaluation.clarifyingQuestions };
}

function deriveObjectiveSlots(query: string): string[] {
	const slots: string[] = [];
	const q = query.toLowerCase();
	if (/ui|tui|widget|表示|画面/.test(q)) slots.push("ui_interaction");
	if (/type|型|typecheck|tsc/.test(q)) slots.push("type_safety");
	if (/bench|metric|性能|遅|速|latency|performance/.test(q)) slots.push("performance_measurement");
	if (/test|テスト|check/.test(q)) slots.push("test_signal_quality");
	if (/api|tool|command|コマンド/.test(q)) slots.push("api_boundary");
	return [...new Set(slots)];
}

export function createPlanningScaleState(cwd: string): void {
	fs.mkdirSync(path.join(cwd, ".autoresearch"), { recursive: true });
	fs.writeFileSync(path.join(cwd, ".autoresearch", "scale.planning.json"), JSON.stringify({ status: "planning", updatedAt: nowIso() }, null, 2) + "\n", "utf8");
}

export function statusText(cwd: string): string {
	const s = readScaleState(cwd);
	if (!s) {
		const planning = path.join(cwd, ".autoresearch", "scale.planning.json");
		if (fs.existsSync(planning)) return "autoresearch-scale: planning\nplan: autoresearch.plan.md\n次: plan を確認・編集して autoresearch_approve を実行してください。";
		return "autoresearch-scale: none";
	}
	const uiState = s.status === "draining" ? "graceful stopping" : s.status;
	return [
		`autoresearch-scale: ${uiState}`,
		`plan: ${s.planId ?? "?"}`,
		`generation: ${s.generation}`,
		`active: ${s.activeAction ? `${s.activeAction.type} (${s.activeAction.action_id})` : "none"}`,
		`queues: hypotheses=${s.queues.hypotheses} proposals=${s.queues.proposals} candidates=${s.queues.candidates}`,
		`resources: subagents=${s.resources.subagentsUsed}/${s.resources.subagentsMax} evaluations=${s.resources.evaluationsUsed}/${s.resources.evaluationsMax} worktrees=${s.resources.worktreesUsed}/${s.resources.worktreesMax}`,
		`pending adoption: ${s.pendingAdoptionCandidateId ?? "none"}`,
		`phase: ${s.phase ?? "none"}`,
		`summary: ${path.relative(cwd, scaleSummaryPath(cwd, s.planId))}`,
		s.pauseReason ? `pause reason: ${s.pauseReason}` : undefined,
	].filter(Boolean).join("\n");
}

export function computeNextScaleAction(cwd: string): ScaleAction | null {
	const s = readScaleState(cwd);
	if (!s || s.status !== "running") return null;
	if (s.activeAction) return s.activeAction;
	if (s.generation === 0) return action("start_generation", "generation_started", "Autoresearch test-time scaling の次 action: generation 1 を開始してください。完了後に autoresearch_scale_complete_action に action_id と result.summary を渡してください。");
	const phase = s.phase ?? "need_scouts";
	if (phase === "need_scouts") return action("spawn_scouts", "role_tasks_started", scoutInstruction(), scoutToolCalls(cwd, s));
	if (phase === "waiting_scouts") return action("wait_scout_results", "structured_hypotheses", waitScoutInstruction(), waitToolCalls());
	if (phase === "need_scoring") return action("score_hypotheses", "hypotheses_scored", "structured hypotheses を rule-based scoring で順位付けします。この action は root agent の追加判断を必要としません。autoresearch_scale_complete_action に action_id と result.summary を渡してください。");
	if (phase === "need_proposer") return action("spawn_proposer", "proposal_task_started", proposerInstruction(s), proposerToolCalls(cwd, s));
	if (phase === "waiting_proposer") return action("wait_proposer_result", "candidate_imported", waitProposerInstruction(), [...(waitToolCalls() ?? []), { tool: "autoresearch_candidate_escrow", params: { source: "pending", max_results: 1 } }]);
	if (phase === "need_critic") return action("spawn_critic", "critic_task_started", criticInstruction(s), criticToolCalls(cwd, s));
	if (phase === "waiting_critic") return action("wait_critic_result", "critic_findings_recorded", waitCriticInstruction(), waitToolCalls());
	if (phase === "need_candidate_eval") return action("evaluate_candidate", "candidate_evaluation_finished", evaluateCandidateInstruction(s), evaluationToolCalls(s));
	if (phase === "generation_review") return action("generation_review", "generation_reviewed", "historian 観点で generation summary / survivor / failure memory を整理してください。新しい patch は作らず、result.summary に次世代で増やす slot / 避ける strategy / evidence_pattern を記録してください。");
	return null;
}

function action(type: string, completionType: string, instruction: string, toolCalls?: ScaleAction["tool_calls"]): ScaleAction {
	return { action_id: scaleActionId(), type, instruction, expected_completion: { type: completionType, required_fields: ["summary"] }, tool_calls: toolCalls };
}

function scoutInstruction(): string {
	return [
		"hypothesis slots に対する scout subagent を、subagent 並列数上限内で起動してください。",
		"scout は read-only です。直接 edit / benchmark / autoresearch_run は行いません。",
		"各 scout の期待成果物は structured hypotheses です: slot, hypothesis, rationale, suggested_paths, expected_evidence, risk。",
		"spawn 後、起動した task 数を result.started_count に入れて autoresearch_scale_complete_action を呼んでください。",
	].join("\n");
}

function scoutToolCalls(cwd: string, _s: ScaleStateV1): ScaleAction["tool_calls"] {
	const contract = readCurrentContract(cwd) as any;
	const slots = [...(contract?.scaling?.population?.baselineSlots ?? BASELINE_HYPOTHESIS_SLOTS), ...(contract?.scaling?.population?.objectiveDerivedSlots ?? [])];
	const scopeNote = `Allowed write paths: ${JSON.stringify(contract?.scope?.allowedWritePaths ?? [])}\nForbidden write paths: ${JSON.stringify(contract?.scope?.forbiddenWritePaths ?? [])}`;
	return [0, 1].map((i) => ({
		tool: "spawn_agent",
		params: {
			task_name: `scale/scout-${Date.now().toString(36)}-${i + 1}`,
			message: [
				"Read-only scout for Autoresearch test-time scaling.",
				"目的: hypothesis slots を具体的な structured hypotheses に変換する。編集・benchmark・autoresearch tools は禁止。",
				`Objective: ${contract?.objective?.summary ?? "unknown"}`,
				`Slots: ${JSON.stringify(slots)}`,
				scopeNote,
				"Return Japanese concise findings. Include structured hypotheses array with slot, hypothesis, rationale, suggested_paths, expected_evidence, risk.",
			].join("\n"),
			authority: { mode: "read_only" },
		},
	}));
}

function waitToolCalls(): ScaleAction["tool_calls"] { return [{ tool: "wait_agent", params: { timeout_ms: 30000 } }]; }

function waitScoutInstruction(): string {
	return [
		"wait_agent で scout result を回収し、structured hypotheses を統合してください。",
		"完了後、autoresearch_scale_complete_action の result.hypotheses に配列で渡してください。",
		"形式: { slot, hypothesis, rationale?, suggested_paths: string[], expected_evidence: string[], risk: low|medium|high }",
	].join("\n");
}

function proposerInstruction(s: ScaleStateV1): string {
	const h = selectNextHypothesis(s);
	return [
		"最上位の未割当 hypothesis から 1 つだけ proposer subagent を起動してください。",
		h ? `hypothesis_id=${h.id}\nslot=${h.slot}\nhypothesis=${h.hypothesis}\npaths=${h.suggested_paths.join(", ")}` : "未割当 hypothesis がありません。result.summary に exhaustion を記録してください。",
		"proposer は 1 hypothesis → 1 patch proposal を返します。直接 apply せず、subagent result として回収します。",
		"spawn 後、result.hypothesis_id と result.started_count を渡して complete_action してください。",
	].join("\n");
}

function proposerToolCalls(cwd: string, s: ScaleStateV1): ScaleAction["tool_calls"] {
	const contract = readCurrentContract(cwd) as any;
	const h = selectNextHypothesis(s);
	if (!h) return [];
	return [{
		tool: "spawn_agent",
		params: {
			task_name: `scale/proposer-${h.id}`,
			message: [
				"Patch proposer for Autoresearch test-time scaling.",
				"1 hypothesis から 1 つだけ minimal patch proposal を作る。benchmark は実行しない。main worktree へ直接 apply しない。",
				`Hypothesis ID: ${h.id}`,
				`Slot: ${h.slot}`,
				`Hypothesis: ${h.hypothesis}`,
				`Expected evidence: ${h.expected_evidence.join("; ")}`,
				`Suggested paths: ${h.suggested_paths.join(", ")}`,
				`Allowed write paths: ${JSON.stringify(contract?.scope?.allowedWritePaths ?? [])}`,
				`Forbidden write paths: ${JSON.stringify(contract?.scope?.forbiddenWritePaths ?? [])}`,
				"Return subagent.result.v1 patch proposal as raw JSON only.",
			].join("\n"),
			authority: { mode: "propose_patch", write_scope: contract?.scope?.allowedWritePaths ?? [], require_base_hash: true, isolated_worktree: "preferred", max_patch_bytes: 50000 },
			result_contract: "subagent_result_v1",
		},
	}];
}

function waitProposerInstruction(): string {
	return [
		"wait_agent で proposer の patch proposal result を回収し、autoresearch_candidate_escrow で candidate 化してください。",
		"完了後、autoresearch_scale_complete_action の result.candidate_ids に escrow された candidate_id 配列を渡してください。",
	].join("\n");
}

function criticInstruction(s: ScaleStateV1): string {
	const candidateId = (s.candidateIds ?? [])[0];
	return [
		"candidate を評価前に critic subagent へ read-only review させてください。",
		candidateId ? `candidate_id=${candidateId}` : "candidate_id がありません。result.summary に exhaustion を記録してください。",
		"critic は scope violation、metric hacking、hidden side effect、expected_evidence の弱さを指摘します。ranking decision は critic に委ねません。",
		"spawn 後、result.candidate_id と result.started_count を渡して complete_action してください。",
	].join("\n");
}

function criticToolCalls(cwd: string, s: ScaleStateV1): ScaleAction["tool_calls"] {
	const contract = readCurrentContract(cwd) as any;
	const candidateId = (s.candidateIds ?? [])[0];
	if (!candidateId) return [];
	return [{
		tool: "spawn_agent",
		params: {
			task_name: `scale/critic-${candidateId}`,
			message: [
				"Read-only critic for Autoresearch test-time scaling candidate.",
				`Candidate ID: ${candidateId}`,
				"Review scope violation, metric hacking risk, hidden side effects, and evidence weakness. Do not edit files. Do not decide keep/discard.",
				`Allowed write paths: ${JSON.stringify(contract?.scope?.allowedWritePaths ?? [])}`,
				`Forbidden write paths: ${JSON.stringify(contract?.scope?.forbiddenWritePaths ?? [])}`,
				"Return findings as: [{ candidate_id, severity, finding }].",
			].join("\n"),
			authority: { mode: "read_only" },
		},
	}];
}

function waitCriticInstruction(): string {
	return [
		"wait_agent で critic result を回収し、findings を structured に要約してください。",
		"完了後、autoresearch_scale_complete_action の result.findings に配列で渡してください。",
		"形式: { candidate_id?, severity?, finding }。critic findings は ranking を直接変えず risk_note / policy adjustment の材料にします。",
	].join("\n");
}

function evaluateCandidateInstruction(s: ScaleStateV1): string {
	const candidateId = (s.candidateIds ?? [])[0];
	return [
		"次の candidate を isolated evaluation してください。main worktree には適用しません。",
		candidateId ? `candidate_id=${candidateId}` : "candidate_id がありません。result.summary に exhaustion を記録してください。",
		"手順: autoresearch_apply_candidate_isolated → autoresearch_run_contract({ candidate_id })。",
		"完了後、decision / metric / candidate_id を result に入れて complete_action してください。",
	].join("\n");
}

function evaluationToolCalls(s: ScaleStateV1): ScaleAction["tool_calls"] {
	const candidateId = (s.candidateIds ?? [])[0];
	if (!candidateId) return [];
	return [
		{ tool: "autoresearch_apply_candidate_isolated", params: { candidate_id: candidateId } },
		{ tool: "autoresearch_run_contract", params: { candidate_id: candidateId, reason: "autoresearch-scale candidate evaluation", iteration_label: `generation-${s.generation}` } },
	];
}

export function startScale(cwd: string): ScaleStateV1 {
	const s = readScaleState(cwd);
	if (!s) throw new Error("承認済み scaling state が見つかりません。先に /autoresearch-scale <目的文> と autoresearch_approve を実行してください。");
	if (!["approved", "stopped", "paused", "running"].includes(s.status)) throw new Error(`現在の状態から start できません: ${s.status}`);
	const resumeError = validateStartPreconditions(cwd, s);
	if (resumeError) {
		const paused: ScaleStateV1 = { ...s, status: "paused", pauseReason: resumeError };
		writeScaleState(cwd, paused);
		appendScaleEvent(cwd, { type: "paused", reason: resumeError });
		updateScaleSummary(cwd, paused);
		throw new Error(resumeError);
	}
	const next: ScaleStateV1 = { ...s, status: "running", stopRequested: false, pauseReason: undefined };
	if (s.status === "stopped") next.generation = s.generation + 1;
	writeScaleState(cwd, next);
	appendScaleEvent(cwd, { type: "scaling_started", from: s.status, generation: next.generation });
	updateScaleSummary(cwd, next);
	return next;
}

function validateStartPreconditions(cwd: string, state: ScaleStateV1): string | null {
	const contract = readCurrentContract(cwd);
	const lock = readLockFile(cwd);
	if (!contract) return "current contract が見つかりません";
	if (!lock) return "lock file が見つかりません";
	const currentHash = computeContractHash(contract);
	if (currentHash !== lock.contractHash) return "contract hash mismatch";
	if (state.contractHash && state.contractHash !== currentHash) return "scaling state contract hash mismatch";
	const changed = filterInternalPaths(getChangedFiles(cwd));
	if (changed.length > 0) return `contract-relevant dirty workspace: ${changed.join(", ")}`;
	return null;
}

export function requestScaleStop(cwd: string): ScaleStateV1 {
	const s = readScaleState(cwd);
	if (!s) throw new Error("scaling state が見つかりません");
	const next: ScaleStateV1 = { ...s, status: s.activeAction ? "draining" : "stopped", stopRequested: true };
	writeScaleState(cwd, next);
	appendScaleEvent(cwd, { type: "stop_requested", from: s.status, gracefulStopBoundary: "candidate" });
	if (next.status === "stopped") appendScaleEvent(cwd, { type: "stopped", generation: next.generation });
	updateScaleSummary(cwd, next);
	return next;
}

export function completeScaleAction(cwd: string, params: { action_id: string; status?: "ok" | "failed"; result?: Record<string, unknown> }): ScaleStateV1 {
	const s = readScaleState(cwd);
	if (!s) throw new Error("scaling state が見つかりません");
	if (!s.activeAction || s.activeAction.action_id !== params.action_id) throw new Error("action_id が active action と一致しません");
	let next: ScaleStateV1 = { ...s, activeAction: undefined };
	const result = params.result ?? {};
	appendScaleEvent(cwd, { type: params.status === "failed" ? "action_failed" : "action_completed", action: s.activeAction, result });
	if (params.status === "failed") {
		next.status = "paused";
		next.pauseReason = String(result.summary ?? `${s.activeAction.type} failed`);
		appendScaleEvent(cwd, { type: "paused", reason: next.pauseReason });
	} else if (s.activeAction.type === "start_generation") {
		next.generation = Math.max(1, s.generation + 1);
		next.phase = "need_scouts";
		next.hypotheses = [];
		next.candidateIds = [];
		next.queues = { hypotheses: 0, proposals: 0, candidates: 0 };
		appendScaleEvent(cwd, { type: "generation_started", generation: next.generation });
	} else if (s.activeAction.type === "spawn_scouts") {
		next.phase = "waiting_scouts";
		next.resources = { ...next.resources, subagentsUsed: numberResult(result.started_count, 0) };
		appendScaleEvent(cwd, { type: "role_task_started", role: "scout", count: next.resources.subagentsUsed });
	} else if (s.activeAction.type === "wait_scout_results") {
		const records = parseHypotheses(result.hypotheses);
		next.hypotheses = records;
		next.queues = { ...next.queues, hypotheses: records.length };
		next.resources = { ...next.resources, subagentsUsed: 0 };
		next.phase = records.length > 0 ? "need_scoring" : "generation_review";
		for (const h of records) appendScaleEvent(cwd, { type: "hypothesis_created", hypothesis: h });
		appendScaleEvent(cwd, { type: "role_task_finished", role: "scout", producedHypotheses: records.length });
	} else if (s.activeAction.type === "score_hypotheses") {
		const scored = scoreHypotheses(next.hypotheses ?? []);
		next.hypotheses = scored;
		next.phase = scored.some((h) => h.status === "scored") ? "need_proposer" : "generation_review";
		appendScaleEvent(cwd, { type: "ranking_updated", kind: "hypothesis", hypotheses: scored.map(({ id, slot, score, risk }) => ({ id, slot, score, risk })) });
	} else if (s.activeAction.type === "spawn_proposer") {
		const selected = selectNextHypothesis(next);
		next.hypotheses = (next.hypotheses ?? []).map((h) => h.id === (result.hypothesis_id ?? selected?.id) ? { ...h, status: "assigned" } : h);
		next.phase = "waiting_proposer";
		next.resources = { ...next.resources, subagentsUsed: numberResult(result.started_count, 1) };
		appendScaleEvent(cwd, { type: "role_task_started", role: "proposer", hypothesisId: result.hypothesis_id ?? selected?.id });
	} else if (s.activeAction.type === "wait_proposer_result") {
		const candidateIds = stringArray(result.candidate_ids);
		next.candidateIds = candidateIds;
		next.queues = { ...next.queues, proposals: 0, candidates: candidateIds.length };
		next.resources = { ...next.resources, subagentsUsed: 0 };
		next.phase = candidateIds.length > 0 ? "need_critic" : "generation_review";
		for (const id of candidateIds) appendScaleEvent(cwd, { type: "candidate_imported", candidate_id: id });
		appendScaleEvent(cwd, { type: "role_task_finished", role: "proposer", candidateIds });
	} else if (s.activeAction.type === "spawn_critic") {
		next.phase = "waiting_critic";
		next.resources = { ...next.resources, subagentsUsed: numberResult(result.started_count, 1) };
		appendScaleEvent(cwd, { type: "role_task_started", role: "critic", candidateId: result.candidate_id ?? (next.candidateIds ?? [])[0] });
	} else if (s.activeAction.type === "wait_critic_result") {
		const findings = parseCriticFindings(result.findings);
		next.criticFindings = [...(next.criticFindings ?? []), ...findings];
		next.resources = { ...next.resources, subagentsUsed: 0 };
		next.phase = "need_candidate_eval";
		appendScaleEvent(cwd, { type: "role_task_finished", role: "critic", findings });
		for (const f of findings) appendScaleEvent(cwd, { type: "evidence_recorded", pattern: { kind: "critic_finding", ...f } });
	} else if (s.activeAction.type === "evaluate_candidate") {
		const candidateId = typeof result.candidate_id === "string" ? result.candidate_id : (next.candidateIds ?? [])[0];
		if (candidateId) {
			appendScaleEvent(cwd, { type: "candidate_evaluation_started", candidate_id: candidateId });
			appendScaleEvent(cwd, { type: "candidate_evaluation_finished", candidate_id: candidateId, decision: result.decision, metric: result.metric, summary: result.summary });
			appendScaleEvent(cwd, { type: "evidence_recorded", candidate_id: candidateId, patterns: [
				{ kind: "benchmark", metric: result.metric ?? null },
				{ kind: "checks", passed: result.checks_passed ?? null },
			] });
			if (result.decision === "keep") {
				next.bestCandidateId = candidateId;
				next.pendingAdoptionCandidateId = candidateId;
			}
		}
		next.candidateIds = (next.candidateIds ?? []).filter((id) => id !== candidateId);
		next.queues = { ...next.queues, candidates: next.candidateIds.length };
		next.phase = next.candidateIds.length > 0 ? "need_candidate_eval" : "generation_review";
	} else if (s.activeAction.type === "generation_review") {
		const survivors = buildStrategySurvivors(next, result);
		next.strategySurvivors = [...(next.strategySurvivors ?? []), ...survivors];
		appendScaleEvent(cwd, { type: "summary_updated", generation: next.generation, summary: result.summary });
		appendScaleEvent(cwd, { type: "policy_adjusted", generation: next.generation, basis: result, strategySurvivors: survivors });
		next.generation += 1;
		next.phase = "need_scouts";
		next.hypotheses = [];
		next.candidateIds = [];
		next.criticFindings = [];
		next.queues = { hypotheses: 0, proposals: 0, candidates: 0 };
	}
	if (next.status === "draining") {
		next.status = "stopped";
		appendScaleEvent(cwd, { type: "stopped", generation: next.generation });
	}
	writeScaleState(cwd, next);
	updateScaleSummary(cwd, next);
	return next;
}

function numberResult(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function parseCriticFindings(value: unknown): Array<{ candidate_id?: string; severity?: string; finding: string }> {
	if (!Array.isArray(value)) return [];
	return value.flatMap((v) => {
		if (!v || typeof v !== "object") return [];
		const r = v as Record<string, unknown>;
		const finding = typeof r.finding === "string" ? r.finding.trim() : "";
		if (!finding) return [];
		return [{
			candidate_id: typeof r.candidate_id === "string" ? r.candidate_id : undefined,
			severity: typeof r.severity === "string" ? r.severity : undefined,
			finding,
		}];
	});
}

function parseHypotheses(value: unknown): ScaleHypothesisRecord[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((v, i) => {
		if (!v || typeof v !== "object") return [];
		const r = v as Record<string, unknown>;
		const hypothesis = typeof r.hypothesis === "string" ? r.hypothesis.trim() : "";
		if (!hypothesis) return [];
		const risk = r.risk === "low" || r.risk === "high" ? r.risk : "medium";
		return [{
			id: `hyp_${Date.now().toString(36)}_${i}`,
			slot: typeof r.slot === "string" ? r.slot : "unknown",
			hypothesis,
			rationale: typeof r.rationale === "string" ? r.rationale : undefined,
			suggested_paths: stringArray(r.suggested_paths),
			expected_evidence: stringArray(r.expected_evidence),
			risk,
			status: "new" as const,
		}];
	});
}

function scoreHypotheses(hypotheses: ScaleHypothesisRecord[]): ScaleHypothesisRecord[] {
	return hypotheses.map((h) => {
		let score = 0;
		if (h.suggested_paths.length > 0) score += 2;
		if (h.expected_evidence.length > 0) score += 3;
		if (h.expected_evidence.some((e) => /bench|metric|check|test|diff/i.test(e))) score += 2;
		if (h.risk === "low") score += 2;
		if (h.risk === "high") score -= 2;
		if (h.slot === "negative_control") score += 1;
		return { ...h, score, status: "scored" as const };
	}).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

function selectNextHypothesis(s: ScaleStateV1): ScaleHypothesisRecord | undefined {
	const available = [...(s.hypotheses ?? [])].filter((h) => h.status === "scored");
	if (available.length === 0) return undefined;
	const assignedBySlot = new Map<string, number>();
	for (const h of s.hypotheses ?? []) if (h.status === "assigned") assignedBySlot.set(h.slot, (assignedBySlot.get(h.slot) ?? 0) + 1);
	return available.sort((a, b) => {
		const slotDelta = (assignedBySlot.get(a.slot) ?? 0) - (assignedBySlot.get(b.slot) ?? 0);
		if (slotDelta !== 0) return slotDelta;
		return (b.score ?? 0) - (a.score ?? 0);
	})[0];
}

function buildStrategySurvivors(state: ScaleStateV1, result: Record<string, unknown>): Array<{ kind: "slot" | "role_template" | "evidence_pattern"; name: string; score?: number; note?: string }> {
	const survivors: Array<{ kind: "slot" | "role_template" | "evidence_pattern"; name: string; score?: number; note?: string }> = [];
	const bestSlot = [...(state.hypotheses ?? [])].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]?.slot;
	if (bestSlot) survivors.push({ kind: "slot", name: bestSlot, score: 1, note: "highest scored hypothesis slot in generation" });
	if ((state.criticFindings ?? []).length > 0) survivors.push({ kind: "role_template", name: "critic:metric_hacking_scope_risk", score: 1, note: "critic findings recorded" });
	if (typeof result.evidence_pattern === "string") survivors.push({ kind: "evidence_pattern", name: result.evidence_pattern, score: 1, note: "reported by historian" });
	return survivors;
}

export function claimNextAction(cwd: string): ScaleAction | null {
	const action = computeNextScaleAction(cwd);
	if (!action) return null;
	const s = readScaleState(cwd)!;
	if (!s.activeAction) {
		const next = { ...s, activeAction: action };
		writeScaleState(cwd, next);
		appendScaleEvent(cwd, { type: "next_action_claimed", action });
		updateScaleSummary(cwd, next);
	}
	return action;
}

export function nextActionMessage(action: ScaleAction): string {
	const lines = [
		"Autoresearch test-time scaling supervisor instruction:",
		`- action_id: ${action.action_id}`,
		`- type: ${action.type}`,
		`- expected completion: ${action.expected_completion.type}`,
		"",
		action.instruction,
	];
	if (action.tool_calls && action.tool_calls.length > 0) {
		lines.push("", "Suggested tool calls:");
		for (const call of action.tool_calls) lines.push(`- ${call.tool}: ${JSON.stringify(call.params)}`);
	}
	lines.push("", "完了後は autoresearch_scale_complete_action を呼び、action_id と result.summary を記録してください。");
	return lines.join("\n");
}
