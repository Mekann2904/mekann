import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { filterInternalPaths, readCurrentContract, readLockFile } from "./contractV1.js";
import { getChangedFiles } from "./runner.js";
import { importSubagentResultsAsCandidates, readCandidate } from "./candidate.js";
import { SubagentResultStore } from "../subagent/resultStore.js";
import {
	appendScaleEvent,
	readScaleState,
	scaleSummaryPath,
	updateScaleSummary,
	writeScaleState,
} from "./scaleStateStore.js";
import { computeContractHash } from "./contractV1.js";
import type {
	SafetyPauseReason,
	ScaleAction,
	ScaleHypothesisRecord,
	ScalePlanningBacklogItem,
	ScaleStateV1,
} from "./scaleTypes.js";

function scaleActionId(): string { return `scale_act_${Date.now().toString(36)}_${crypto.randomBytes(2).toString("hex")}`; }
function numberConfig(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
}

export function statusText(cwd: string): string {
	const s = readScaleState(cwd);
	if (!s) {
		const planning = path.join(cwd, ".autoresearch", "scale.planning.json");
		if (fs.existsSync(planning)) return "autoresearch-scale: planning\nplan: autoresearch.plan.md\n次: 自走開始前の評価契約を確認し、問題なければ autoresearch_approve を実行してください。";
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
		`planning backlog: ${s.planningBacklog?.length ?? 0}`,
		`phase: ${s.phase ?? "none"}`,
		`summary: ${path.relative(cwd, scaleSummaryPath(cwd, s.planId))}`,
		s.pauseReasonCode ? `pause reason code: ${s.pauseReasonCode}` : undefined,
		s.pauseReason ? `pause reason: ${s.pauseReason}` : undefined,
	].filter(Boolean).join("\n");
}

export function computeNextScaleAction(cwd: string): ScaleAction | null {
	const s = readScaleState(cwd);
	if (!s || s.status !== "running") return null;
	if (s.activeAction) return s.activeAction;
	if (s.generation === 0) return action("start_generation", "generation_started", "Autoresearch test-time scaling supervisor の内部 action: generation 1 を開始します。ユーザ判断を求めず、完了後に autoresearch_scale_complete_action へ action_id と result.summary を渡してください。");
	const phase = s.phase ?? "need_scouts";
	if (phase === "need_scouts") return action("spawn_scouts", "role_tasks_started", scoutInstruction(), scoutToolCalls(cwd, s));
	if (phase === "waiting_scouts") return action("wait_scout_results", "structured_hypotheses", waitScoutInstruction(), [...(waitToolCalls() ?? []), { tool: "autoresearch_scale_ingest", params: {} }]);
	if (phase === "need_scoring") return action("score_hypotheses", "hypotheses_scored", "structured hypotheses を rule-based scoring で順位付けします。この action は root agent の追加判断を必要としません。autoresearch_scale_complete_action に action_id と result.summary を渡してください。");
	if (phase === "need_proposer") return action("spawn_proposer", "proposal_task_started", proposerInstruction(s), proposerToolCalls(cwd, s));
	if (phase === "waiting_proposer") return action("wait_proposer_result", "candidate_imported", waitProposerInstruction(), [...(waitToolCalls() ?? []), { tool: "autoresearch_scale_ingest", params: {} }]);
	if (phase === "need_critic") return action("spawn_critic", "critic_task_started", criticInstruction(s), criticToolCalls(cwd, s));
	if (phase === "waiting_critic") return action("wait_critic_result", "critic_findings_recorded", waitCriticInstruction(), [...(waitToolCalls() ?? []), { tool: "autoresearch_scale_ingest", params: {} }]);
	if (phase === "need_candidate_eval") return action("evaluate_candidate", "candidate_evaluation_finished", evaluateCandidateInstruction(s), [...(evaluationToolCalls(s) ?? []), { tool: "autoresearch_scale_ingest", params: {} }]);
	if (phase === "need_historian") return action("spawn_historian", "historian_task_started", historianInstruction(s), historianToolCalls(cwd, s));
	if (phase === "waiting_historian") return action("wait_historian_result", "generation_reviewed", waitHistorianInstruction(), [...(waitToolCalls() ?? []), { tool: "autoresearch_scale_ingest", params: {} }]);
	if (phase === "generation_review") return action("generation_review", "generation_reviewed", "historian 結果を generation summary / survivor / failure memory として確定してください。新しい patch は作らず、result.summary に次世代で増やす slot / 避ける strategy / evidence_pattern を記録してください。現在 contract では評価・採用できないが次回 planning で探索価値がある発見は、ユーザに scope 変更を求めず result.planning_backlog に入れてください。");
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

function scoutToolCalls(cwd: string, s: ScaleStateV1): ScaleAction["tool_calls"] {
	const contract = readCurrentContract(cwd) as any;
	const slots = [...(contract?.scaling?.population?.baselineSlots ?? []), ...(contract?.scaling?.population?.objectiveDerivedSlots ?? [])];
	const scoutCount = Math.min(Math.max(0, numberConfig(contract?.scaling?.roles?.scouts, s.resources.subagentsMax)), Math.max(0, s.resources.subagentsMax - s.resources.subagentsUsed));
	const scopeNote = `Allowed write paths: ${JSON.stringify(contract?.scope?.allowedWritePaths ?? [])}\nForbidden write paths: ${JSON.stringify(contract?.scope?.forbiddenWritePaths ?? [])}`;
	return Array.from({ length: scoutCount }, (_, i) => ({
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

function historianInstruction(s: ScaleStateV1): string {
	return [
		"historian subagent を起動し、この generation の evidence / failures / survivors / role effectiveness を整理してください。",
		"新しい patch や benchmark は実行しません。",
		`Generation: ${s.generation}`,
		`Hypotheses: ${JSON.stringify((s.hypotheses ?? []).map(({ id, slot, score, status }) => ({ id, slot, score, status })))}`,
		`Critic findings: ${JSON.stringify(s.criticFindings ?? [])}`,
		`Best candidate: ${s.bestCandidateId ?? "none"}`,
		"Return summary and optional evidence_pattern name useful for future generations.",
	].join("\n");
}

function historianToolCalls(_cwd: string, s: ScaleStateV1): ScaleAction["tool_calls"] {
	return [{
		tool: "spawn_agent",
		params: {
			task_name: `scale/historian-generation-${s.generation}`,
			message: historianInstruction(s),
			authority: { mode: "read_only" },
		},
	}];
}

function waitHistorianInstruction(): string {
	return [
		"wait_agent で historian result を回収してください。",
		"完了後は autoresearch_scale_ingest を呼び、summary / evidence_pattern を generation_review に反映します。",
	].join("\n");
}

export function startScale(cwd: string): ScaleStateV1 {
	const s = readScaleState(cwd);
	if (!s) throw new Error("承認済み scaling state が見つかりません。先に /autoresearch-scale <目的文> と autoresearch_approve を実行してください。");
	if (!["approved", "stopped", "paused", "running"].includes(s.status)) throw new Error(`現在の状態から start できません: ${s.status}`);
	const resumeError = validateStartPreconditions(cwd, s);
	if (resumeError) {
		const paused: ScaleStateV1 = { ...s, status: "paused", pauseReasonCode: resumeError.code, pauseReason: resumeError.message };
		writeScaleState(cwd, paused);
		appendScaleEvent(cwd, { type: "paused", reasonCode: resumeError.code, reason: resumeError.message });
		updateScaleSummary(cwd, paused);
		throw new Error(resumeError.message);
	}
	const next: ScaleStateV1 = { ...s, status: "running", stopRequested: false, pauseReasonCode: undefined, pauseReason: undefined };
	if (s.status === "stopped") next.generation = s.generation + 1;
	writeScaleState(cwd, next);
	appendScaleEvent(cwd, { type: "scaling_started", from: s.status, generation: next.generation });
	updateScaleSummary(cwd, next);
	return next;
}

function validateStartPreconditions(cwd: string, state: ScaleStateV1): { code: SafetyPauseReason; message: string } | null {
	const contract = readCurrentContract(cwd);
	const lock = readLockFile(cwd);
	if (!contract) return { code: "contract_violation", message: "current contract が見つかりません" };
	if (!lock) return { code: "contract_violation", message: "lock file が見つかりません" };
	const currentHash = computeContractHash(contract);
	if (currentHash !== lock.contractHash) return { code: "contract_violation", message: "contract hash mismatch" };
	if (state.contractHash && state.contractHash !== currentHash) return { code: "contract_violation", message: "scaling state contract hash mismatch" };
	const changed = filterInternalPaths(getChangedFiles(cwd));
	if (changed.length > 0) return { code: "unexpected_dirty_workspace", message: `contract-relevant dirty workspace: ${changed.join(", ")}` };
	return null;
}

export function requestScaleStop(cwd: string): ScaleStateV1 {
	const s = readScaleState(cwd);
	if (!s) throw new Error("scaling state が見つかりません");
	const activeType = s.activeAction?.type;
	const shouldDrain = activeType === "evaluate_candidate";
	const next: ScaleStateV1 = {
		...s,
		status: shouldDrain ? "draining" : "stopped",
		stopRequested: true,
		activeAction: shouldDrain ? s.activeAction : undefined,
		resources: shouldDrain ? s.resources : { ...s.resources, subagentsUsed: 0 },
	};
	writeScaleState(cwd, next);
	appendScaleEvent(cwd, { type: "stop_requested", from: s.status, gracefulStopBoundary: "candidate" });
	if (!shouldDrain && activeType) appendScaleEvent(cwd, { type: "role_tasks_ignored", reason: "graceful stop only waits for active candidate evaluation", activeAction: s.activeAction });
	if (next.status === "stopped") appendScaleEvent(cwd, { type: "stopped", generation: next.generation });
	updateScaleSummary(cwd, next);
	return next;
}

type CompleteActionOutcome = { state: ScaleStateV1; events: Array<Record<string, unknown>> };
type CompleteActionHandler = (state: ScaleStateV1, result: Record<string, unknown>) => CompleteActionOutcome;

const COMPLETE_ACTION_HANDLERS: Record<string, CompleteActionHandler> = {
	start_generation: completeStartGeneration,
	spawn_scouts: completeSpawnScouts,
	wait_scout_results: completeWaitScoutResults,
	score_hypotheses: completeScoreHypotheses,
	spawn_proposer: completeSpawnProposer,
	wait_proposer_result: completeWaitProposerResult,
	spawn_critic: completeSpawnCritic,
	wait_critic_result: completeWaitCriticResult,
	evaluate_candidate: completeEvaluateCandidate,
	spawn_historian: completeSpawnHistorian,
	wait_historian_result: completeWaitHistorianResult,
	generation_review: completeGenerationReview,
};

export function completeScaleAction(cwd: string, params: { action_id: string; status?: "ok" | "failed"; result?: Record<string, unknown> }): ScaleStateV1 {
	const s = readScaleState(cwd);
	if (!s) throw new Error("scaling state が見つかりません");
	if (!s.activeAction || s.activeAction.action_id !== params.action_id) throw new Error("action_id が active action と一致しません");
	const result = params.result ?? {};
	const events: Array<Record<string, unknown>> = [{ type: params.status === "failed" ? "action_failed" : "action_completed", action: s.activeAction, result }];
	let next: ScaleStateV1 = { ...s, activeAction: undefined };

	if (params.status === "failed") {
		next.status = "paused";
		next.pauseReasonCode = parseSafetyPauseReason(result.pause_reason_code) ?? "resource_exhausted_or_unavailable";
		next.pauseReason = String(result.summary ?? `${s.activeAction.type} failed`);
		events.push({ type: "paused", reasonCode: next.pauseReasonCode, reason: next.pauseReason });
	} else {
		const handler = COMPLETE_ACTION_HANDLERS[s.activeAction.type];
		if (handler) {
			const outcome = handler(next, result);
			next = outcome.state;
			events.push(...outcome.events);
		}
	}

	if (next.status === "draining") {
		next.status = "stopped";
		events.push({ type: "stopped", generation: next.generation });
	}
	for (const event of events) appendScaleEvent(cwd, event);
	writeScaleState(cwd, next);
	updateScaleSummary(cwd, next);
	return next;
}

function completeStartGeneration(state: ScaleStateV1): CompleteActionOutcome {
	const next = {
		...state,
		generation: Math.max(1, state.generation + 1),
		phase: "need_scouts" as const,
		hypotheses: [],
		candidateIds: [],
		queues: { hypotheses: 0, proposals: 0, candidates: 0 },
	};
	return { state: next, events: [{ type: "generation_started", generation: next.generation }] };
}

function completeSpawnScouts(state: ScaleStateV1, result: Record<string, unknown>): CompleteActionOutcome {
	const next = { ...state, phase: "waiting_scouts" as const, resources: { ...state.resources, subagentsUsed: numberResult(result.started_count, 0) } };
	return { state: next, events: [{ type: "role_task_started", role: "scout", count: next.resources.subagentsUsed }] };
}

function completeWaitScoutResults(state: ScaleStateV1, result: Record<string, unknown>): CompleteActionOutcome {
	const records = parseHypotheses(result.hypotheses);
	const next = {
		...state,
		hypotheses: records,
		queues: { ...state.queues, hypotheses: records.length },
		resources: { ...state.resources, subagentsUsed: 0 },
		phase: records.length > 0 ? "need_scoring" as const : "need_historian" as const,
	};
	return { state: next, events: [...records.map((h) => ({ type: "hypothesis_created", hypothesis: h })), { type: "role_task_finished", role: "scout", producedHypotheses: records.length }] };
}

function completeScoreHypotheses(state: ScaleStateV1): CompleteActionOutcome {
	const scored = scoreHypotheses(state.hypotheses ?? []);
	const next = { ...state, hypotheses: scored, phase: scored.some((h) => h.status === "scored") ? "need_proposer" as const : "need_historian" as const };
	return { state: next, events: [{ type: "ranking_updated", kind: "hypothesis", hypotheses: scored.map(({ id, slot, score, risk }) => ({ id, slot, score, risk })) }] };
}

function completeSpawnProposer(state: ScaleStateV1, result: Record<string, unknown>): CompleteActionOutcome {
	const selected = selectNextHypothesis(state);
	const hypothesisId = result.hypothesis_id ?? selected?.id;
	const next = {
		...state,
		hypotheses: (state.hypotheses ?? []).map((h) => h.id === hypothesisId ? { ...h, status: "assigned" as const } : h),
		phase: "waiting_proposer" as const,
		resources: { ...state.resources, subagentsUsed: numberResult(result.started_count, 1) },
	};
	return { state: next, events: [{ type: "role_task_started", role: "proposer", hypothesisId }] };
}

function completeWaitProposerResult(state: ScaleStateV1, result: Record<string, unknown>): CompleteActionOutcome {
	const candidateIds = stringArray(result.candidate_ids);
	const next = {
		...state,
		candidateIds,
		queues: { ...state.queues, proposals: 0, candidates: candidateIds.length },
		resources: { ...state.resources, subagentsUsed: 0 },
		phase: candidateIds.length > 0 ? "need_critic" as const : "need_historian" as const,
	};
	return { state: next, events: [...candidateIds.map((id) => ({ type: "candidate_imported", candidate_id: id })), { type: "role_task_finished", role: "proposer", candidateIds }] };
}

function completeSpawnCritic(state: ScaleStateV1, result: Record<string, unknown>): CompleteActionOutcome {
	const next = { ...state, phase: "waiting_critic" as const, resources: { ...state.resources, subagentsUsed: numberResult(result.started_count, 1) } };
	return { state: next, events: [{ type: "role_task_started", role: "critic", candidateId: result.candidate_id ?? (next.candidateIds ?? [])[0] }] };
}

function completeWaitCriticResult(state: ScaleStateV1, result: Record<string, unknown>): CompleteActionOutcome {
	const findings = parseCriticFindings(result.findings);
	const next = { ...state, criticFindings: [...(state.criticFindings ?? []), ...findings], resources: { ...state.resources, subagentsUsed: 0 }, phase: "need_candidate_eval" as const };
	return { state: next, events: [{ type: "role_task_finished", role: "critic", findings }, ...findings.map((f) => ({ type: "evidence_recorded", pattern: { kind: "critic_finding", ...f } }))] };
}

function completeEvaluateCandidate(state: ScaleStateV1, result: Record<string, unknown>): CompleteActionOutcome {
	const candidateId = typeof result.candidate_id === "string" ? result.candidate_id : (state.candidateIds ?? [])[0];
	const events: Array<Record<string, unknown>> = [];
	let next = state;
	if (candidateId) {
		events.push(
			{ type: "candidate_evaluation_started", candidate_id: candidateId },
			{ type: "candidate_evaluation_finished", candidate_id: candidateId, decision: result.decision, metric: result.metric, summary: result.summary },
			{ type: "evidence_recorded", candidate_id: candidateId, patterns: [
				{ kind: "benchmark", metric: result.metric ?? null },
				{ kind: "checks", passed: result.checks_passed ?? null },
			] },
		);
		if (result.decision === "keep") next = { ...next, bestCandidateId: candidateId, pendingAdoptionCandidateId: candidateId };
	}
	const candidateIds = (next.candidateIds ?? []).filter((id) => id !== candidateId);
	next = { ...next, candidateIds, queues: { ...next.queues, candidates: candidateIds.length }, phase: candidateIds.length > 0 ? "need_candidate_eval" as const : "need_historian" as const };
	return { state: next, events };
}

function completeSpawnHistorian(state: ScaleStateV1, result: Record<string, unknown>): CompleteActionOutcome {
	const next = { ...state, phase: "waiting_historian" as const, resources: { ...state.resources, subagentsUsed: numberResult(result.started_count, 1) } };
	return { state: next, events: [{ type: "role_task_started", role: "historian", generation: next.generation }] };
}

function completeWaitHistorianResult(state: ScaleStateV1, result: Record<string, unknown>): CompleteActionOutcome {
	const next = { ...state, resources: { ...state.resources, subagentsUsed: 0 }, phase: "generation_review" as const };
	return { state: next, events: [{ type: "role_task_finished", role: "historian", summary: result.summary, evidence_pattern: result.evidence_pattern }] };
}

function completeGenerationReview(state: ScaleStateV1, result: Record<string, unknown>): CompleteActionOutcome {
	const survivors = buildStrategySurvivors(state, result);
	const planningBacklog = parsePlanningBacklog(result.planning_backlog);
	const next = {
		...state,
		strategySurvivors: [...(state.strategySurvivors ?? []), ...survivors],
		planningBacklog: [...(state.planningBacklog ?? []), ...planningBacklog],
		generation: state.generation + 1,
		phase: "need_scouts" as const,
		hypotheses: [],
		candidateIds: [],
		criticFindings: [],
		queues: { hypotheses: 0, proposals: 0, candidates: 0 },
	};
	return { state: next, events: [
		{ type: "summary_updated", generation: state.generation, summary: result.summary },
		...planningBacklog.map((item) => ({ type: "planning_backlog_item_added", item })),
		{ type: "policy_adjusted", generation: state.generation, basis: result, strategySurvivors: survivors, planningBacklog },
	] };
}

function parsePlanningBacklog(value: unknown): ScalePlanningBacklogItem[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((v, i) => {
		if (!v || typeof v !== "object") return [];
		const r = v as Record<string, unknown>;
		const summary = typeof r.summary === "string" ? r.summary.trim() : "";
		const why = typeof r.why_out_of_contract === "string" ? r.why_out_of_contract.trim() : "";
		const change = typeof r.suggested_contract_change === "string" ? r.suggested_contract_change.trim() : "";
		if (!summary || !why || !change) return [];
		const risk = r.risk === "low" || r.risk === "high" ? r.risk : "medium";
		const priority = r.priority === "low" || r.priority === "high" ? r.priority : "medium";
		return [{
			id: `backlog_${Date.now().toString(36)}_${i}`,
			kind: "out_of_contract_opportunity" as const,
			summary,
			why_out_of_contract: why,
			suggested_contract_change: change,
			related_candidate_id: typeof r.related_candidate_id === "string" ? r.related_candidate_id : undefined,
			related_hypothesis_id: typeof r.related_hypothesis_id === "string" ? r.related_hypothesis_id : undefined,
			evidence: stringArray(r.evidence),
			risk,
			priority,
		}];
	});
}

function parseSafetyPauseReason(value: unknown): SafetyPauseReason | undefined {
	return value === "contract_violation"
		|| value === "unexpected_dirty_workspace"
		|| value === "revert_failure"
		|| value === "resource_exhausted_or_unavailable"
		|| value === "unsafe_or_irreversible_decision_required"
		? value
		: undefined;
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

type IngestActionHandler = (cwd: string, state: ScaleStateV1) => ScaleStateV1;

const INGEST_ACTION_HANDLERS: Record<string, IngestActionHandler> = {
	wait_scout_results: ingestScoutResults,
	wait_proposer_result: ingestProposerResult,
	wait_critic_result: ingestCriticResult,
	wait_historian_result: ingestHistorianResult,
	evaluate_candidate: ingestCandidateEvaluation,
};

export function ingestScaleAction(cwd: string): ScaleStateV1 {
	const s = readScaleState(cwd);
	if (!s?.activeAction) throw new Error("active scale action がありません");
	const handler = INGEST_ACTION_HANDLERS[s.activeAction.type];
	if (!handler) throw new Error(`ingest unsupported for action: ${s.activeAction.type}`);
	return handler(cwd, s);
}

function ingestScoutResults(cwd: string, state: ScaleStateV1): ScaleStateV1 {
	const store = new SubagentResultStore(cwd);
	const scoutResults = store.list({ status: "pending" }).filter((r) => r.agent_path.includes("/scale/scout") || r.agent_path.includes("scale/scout"));
	const hypotheses = scoutResults.flatMap((r) => hypothesesFromStoredResult(r.result));
	return completeScaleAction(cwd, { action_id: state.activeAction!.action_id, result: { summary: `ingested ${hypotheses.length} scout hypotheses`, hypotheses } });
}

function ingestProposerResult(cwd: string, state: ScaleStateV1): ScaleStateV1 {
	const contract = readCurrentContract(cwd);
	const lock = readLockFile(cwd);
	if (!contract || !lock) throw new Error("current contract / lock file が見つかりません");
	const imported = importSubagentResultsAsCandidates(cwd, contract, lock, { source: "pending", max_results: 1 }).imported;
	return completeScaleAction(cwd, { action_id: state.activeAction!.action_id, result: { summary: `imported ${imported.length} candidates`, candidate_ids: imported.map((c) => c.candidate_id) } });
}

function ingestCriticResult(cwd: string, state: ScaleStateV1): ScaleStateV1 {
	const store = new SubagentResultStore(cwd);
	const criticResults = store.list({ status: "pending" }).filter((r) => r.agent_path.includes("/scale/critic") || r.agent_path.includes("scale/critic"));
	const findings = criticResults.flatMap((r) => findingsFromStoredResult(r.result, (state.candidateIds ?? [])[0]));
	return completeScaleAction(cwd, { action_id: state.activeAction!.action_id, result: { summary: `ingested ${findings.length} critic findings`, findings } });
}

function ingestHistorianResult(cwd: string, state: ScaleStateV1): ScaleStateV1 {
	const store = new SubagentResultStore(cwd);
	const historianResults = store.list({ status: "pending" }).filter((r) => r.agent_path.includes("/scale/historian") || r.agent_path.includes("scale/historian"));
	const summary = historianResults.map((r) => (r.result as any).summary ?? (r.result as any).reason ?? "historian completed").join("\n") || "historian result unavailable";
	return completeScaleAction(cwd, { action_id: state.activeAction!.action_id, result: { summary, evidence_pattern: inferEvidencePattern(summary) } });
}

function ingestCandidateEvaluation(cwd: string, state: ScaleStateV1): ScaleStateV1 {
	const candidateId = (state.candidateIds ?? [])[0];
	if (!candidateId) return completeScaleAction(cwd, { action_id: state.activeAction!.action_id, result: { summary: "no candidate to evaluate" } });
	const c = readCandidate(cwd, candidateId);
	if (c.status !== "kept" && c.status !== "discarded") throw new Error(`candidate evaluation is not finished: ${candidateId} status=${c.status}`);
	return completeScaleAction(cwd, { action_id: state.activeAction!.action_id, result: { summary: c.decision?.reason ?? c.status, candidate_id: candidateId, decision: c.status === "kept" ? "keep" : "discard", metric: c.decision?.metric ?? null, checks_passed: c.status === "kept" } });
}

function hypothesesFromStoredResult(result: unknown): Array<{ slot: string; hypothesis: string; rationale?: string; suggested_paths: string[]; expected_evidence: string[]; risk: "low" | "medium" | "high" }> {
	const raw = JSON.stringify(result);
	const parsed = extractFirstJsonArray(raw);
	if (parsed) return parseHypotheses(parsed).map(({ slot, hypothesis, rationale, suggested_paths, expected_evidence, risk }) => ({ slot, hypothesis, rationale, suggested_paths, expected_evidence, risk }));
	const r = result as any;
	const summary = typeof r?.summary === "string" ? r.summary : typeof r?.reason === "string" ? r.reason : "subagent observation";
	return [{ slot: "unknown", hypothesis: summary, suggested_paths: [], expected_evidence: Array.isArray(r?.evidence) ? r.evidence.filter((e: unknown): e is string => typeof e === "string") : [], risk: "medium" }];
}

function findingsFromStoredResult(result: unknown, fallbackCandidateId?: string): Array<{ candidate_id?: string; severity?: string; finding: string }> {
	const raw = JSON.stringify(result);
	const parsed = extractFirstJsonArray(raw);
	if (parsed) {
		const findings = parseCriticFindings(parsed);
		if (findings.length > 0) return findings.map((f) => ({ candidate_id: f.candidate_id ?? fallbackCandidateId, severity: f.severity, finding: f.finding }));
	}
	const r = result as any;
	const summary = typeof r?.summary === "string" ? r.summary : typeof r?.reason === "string" ? r.reason : "critic completed without structured findings";
	return [{ candidate_id: fallbackCandidateId, severity: "info", finding: summary }];
}

function extractFirstJsonArray(raw: string): unknown[] | null {
	const start = raw.indexOf("[");
	const end = raw.lastIndexOf("]");
	if (start < 0 || end <= start) return null;
	try { const parsed = JSON.parse(raw.slice(start, end + 1)); return Array.isArray(parsed) ? parsed : null; } catch { return null; }
}

function inferEvidencePattern(summary: string): string | undefined {
	if (/cheap|targeted|small/i.test(summary)) return "cheap_evidence";
	if (/check|test/i.test(summary)) return "checks";
	if (/bench|metric|performance|latency/i.test(summary)) return "benchmark";
	if (/critic|risk|scope|metric hacking/i.test(summary)) return "critic_finding";
	return undefined;
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
		"Autoresearch test-time scaling supervisor internal instruction:",
		"このメッセージは root agent が自律的に実行するための内部指示です。ユーザへの判断依頼ではありません。",
		`- action_id: ${action.action_id}`,
		`- type: ${action.type}`,
		`- expected completion: ${action.expected_completion.type}`,
		"",
		action.instruction,
	];
	if (action.tool_calls && action.tool_calls.length > 0) {
		lines.push("", "Internal tool calls to execute autonomously:");
		for (const call of action.tool_calls) lines.push(`- ${call.tool}: ${JSON.stringify(call.params)}`);
	}
	lines.push("", "完了後はユーザに質問せず、autoresearch_scale_complete_action を呼び、action_id と result.summary を記録してください。failed completion の場合は可能なら result.pause_reason_code に contract_violation / unexpected_dirty_workspace / revert_failure / resource_exhausted_or_unavailable / unsafe_or_irreversible_decision_required のいずれかを入れてください。");
	return lines.join("\n");
}
