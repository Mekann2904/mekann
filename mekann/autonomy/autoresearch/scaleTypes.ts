export type ScaleStatus = "none" | "planning" | "approved" | "running" | "draining" | "paused" | "stopped";
export type SafetyPauseReason = "contract_violation" | "unexpected_dirty_workspace" | "revert_failure" | "resource_exhausted_or_unavailable" | "unsafe_or_irreversible_decision_required";

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

export interface ScalePlanningBacklogItem {
	id: string;
	kind: "out_of_contract_opportunity";
	summary: string;
	why_out_of_contract: string;
	suggested_contract_change: string;
	related_candidate_id?: string;
	related_hypothesis_id?: string;
	evidence?: string[];
	risk: "low" | "medium" | "high";
	priority: "low" | "medium" | "high";
}

export type ScalePhase = "need_scouts" | "waiting_scouts" | "need_scoring" | "need_proposer" | "waiting_proposer" | "need_critic" | "waiting_critic" | "need_candidate_eval" | "need_historian" | "waiting_historian" | "generation_review";

export interface ScaleStateV1 {
	version: 1;
	status: ScaleStatus;
	planId?: string;
	contractHash?: string;
	generation: number;
	activeAction?: ScaleAction;
	stopRequested?: boolean;
	pauseReasonCode?: SafetyPauseReason;
	pauseReason?: string;
	bestCandidateId?: string;
	pendingAdoptionCandidateId?: string;
	phase?: ScalePhase;
	hypotheses?: ScaleHypothesisRecord[];
	candidateIds?: string[];
	criticFindings?: Array<{ candidate_id?: string; severity?: string; finding: string }>;
	strategySurvivors?: Array<{ kind: "slot" | "role_template" | "evidence_pattern"; name: string; score?: number; note?: string }>;
	planningBacklog?: ScalePlanningBacklogItem[];
	queues: { hypotheses: number; proposals: number; candidates: number };
	resources: { subagentsUsed: number; subagentsMax: number; evaluationsUsed: number; evaluationsMax: number; worktreesUsed: number; worktreesMax: number };
	createdAt: string;
	updatedAt: string;
}
