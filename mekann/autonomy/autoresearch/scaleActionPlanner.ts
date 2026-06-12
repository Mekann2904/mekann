import * as crypto from "node:crypto";

import { readCurrentContract } from "./contractV1.js";
import { readScaleState } from "./scaleStateStore.js";
import type { ScaleAction, ScaleHypothesisRecord, ScaleStateV1 } from "./scaleTypes.js";

function scaleActionId(): string { return `scale_act_${Date.now().toString(36)}_${crypto.randomBytes(2).toString("hex")}`; }
function numberConfig(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
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

export function selectNextHypothesis(s: ScaleStateV1): ScaleHypothesisRecord | undefined {
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
