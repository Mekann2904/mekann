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
import { computeNextScaleAction, selectNextHypothesis } from "./scaleActionPlanner.js";

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

