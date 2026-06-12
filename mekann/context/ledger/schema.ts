export const CONTEXT_EVENT_KINDS = ["tool_result", "user_decision", "file_change", "error", "task", "plan", "subagent", "git", "rule", "constraint", "autoresearch", "safety_boundary"] as const;
export type MekannContextEventKind = typeof CONTEXT_EVENT_KINDS[number];

export const CONTEXT_EVENT_STATUSES = ["active", "resolved", "superseded", "stale", "blocked", "invalidated"] as const;
export type MekannContextEventStatus = typeof CONTEXT_EVENT_STATUSES[number];

export const CONTEXT_EVIDENCE_LEVELS = ["observed", "tool_reported", "user_decided", "agent_inferred", "agent_assumed", "generated_summary"] as const;
export type MekannContextEvidenceLevel = typeof CONTEXT_EVIDENCE_LEVELS[number];

export const CONTEXT_REF_TYPES = ["artifact", "file", "url", "symbol", "commit", "event", "snapshot"] as const;
export const CONTEXT_REF_ROLES = ["evidence", "output", "decision", "context"] as const;

export interface MekannContextScope {
	project?: string;
	paths?: string[];
	symbols?: string[];
	goalId?: string;
	planId?: string;
	branchId?: string;
	subagentId?: string;
}

export interface MekannContextRef {
	type: typeof CONTEXT_REF_TYPES[number];
	value: string;
	role?: typeof CONTEXT_REF_ROLES[number];
}

export interface MekannContextEvent {
	schemaVersion: "mekann-context/v2";
	id: string;
	kind: MekannContextEventKind;
	status: MekannContextEventStatus;
	priority: 0 | 1 | 2 | 3 | 4;
	title: string;
	summary: string;
	evidenceLevel: MekannContextEvidenceLevel;
	refs?: MekannContextRef[];
	scope?: MekannContextScope;
	supersedes?: string[];
	resolves?: string[];
	invalidates?: string[];
	expiresAt?: number;
	createdAt: number;
	cwd: string;
	sessionId?: string;
	turnId?: string;
	toolCallId?: string;
}

export interface ProjectedContextEvent extends MekannContextEvent {
	effectiveStatus: MekannContextEventStatus;
	supersededBy?: string[];
	resolvedBy?: string[];
	invalidatedBy?: string[];
}

export const VALID_KINDS = new Set<MekannContextEventKind>(CONTEXT_EVENT_KINDS);
export const VALID_STATUSES = new Set<MekannContextEventStatus>(CONTEXT_EVENT_STATUSES);
export const VALID_EVIDENCE_LEVELS = new Set<MekannContextEvidenceLevel>(CONTEXT_EVIDENCE_LEVELS);
export const VALID_REF_TYPES = new Set<MekannContextRef["type"]>(CONTEXT_REF_TYPES);
export const VALID_REF_ROLES = new Set<NonNullable<MekannContextRef["role"]>>(CONTEXT_REF_ROLES);
