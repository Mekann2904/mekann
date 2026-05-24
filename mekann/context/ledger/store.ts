import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { spreadSessionMeta } from "../output-gate/store.js";

// ─── Schema ─────────────────────────────────────────────────────

export type MekannContextEventKind =
	| "tool_result"
	| "user_decision"
	| "file_change"
	| "error"
	| "task"
	| "plan"
	| "subagent"
	| "git"
	| "rule"
	| "constraint"
	| "autoresearch"
	| "safety_boundary";

export type MekannContextEventStatus = "active" | "resolved" | "superseded" | "stale" | "blocked" | "invalidated";

export type MekannContextEvidenceLevel =
	| "observed"
	| "tool_reported"
	| "user_decided"
	| "agent_inferred"
	| "agent_assumed"
	| "generated_summary";

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
	type: "artifact" | "file" | "url" | "symbol" | "commit" | "event" | "snapshot";
	value: string;
	role?: "evidence" | "output" | "decision" | "context";
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

// ─── Paths ──────────────────────────────────────────────────────

export function contextDir(cwd: string): string {
	return path.join(cwd, ".pi", "mekann-context");
}

export function eventsPath(cwd: string): string {
	return path.join(contextDir(cwd), "events.v2.jsonl");
}

// ─── ID Generation ──────────────────────────────────────────────

let eventCounter = 0;

export function createEventId(createdAt: number, counter: number): string {
	return `ctx_${createdAt.toString(36)}_${counter.toString(36)}`;
}

export function nextEventId(createdAt: number): string {
	eventCounter += 1;
	return createEventId(createdAt, eventCounter);
}

// ─── Append ─────────────────────────────────────────────────────

export interface AppendEventInput {
	cwd: string;
	kind: MekannContextEventKind;
	priority: 0 | 1 | 2 | 3 | 4;
	title: string;
	summary: string;
	evidenceLevel: MekannContextEvidenceLevel;
	status?: MekannContextEventStatus;
	refs?: MekannContextRef[];
	scope?: MekannContextScope;
	supersedes?: string[];
	resolves?: string[];
	invalidates?: string[];
	expiresAt?: number;
	sessionId?: string;
	turnId?: string;
	toolCallId?: string;
	branchId?: string;
	idGenerator?: (createdAt: number) => string;
	now?: () => number;
}

function nonEmptyString(value: string, name: string): void {
	if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${name} is required`);
}

function nonEmptyArray<T>(items: T[] | undefined): T[] | undefined {
	return items && items.length > 0 ? items : undefined;
}

export async function appendContextEvent(input: AppendEventInput): Promise<MekannContextEvent> {
	await fsp.mkdir(contextDir(input.cwd), { recursive: true });
	const createdAt = input.now?.() ?? Date.now();
	const id = input.idGenerator?.(createdAt) ?? nextEventId(createdAt);
	if (!/^ctx_[a-z0-9]+_[a-z0-9]+$/.test(id)) throw new Error(`Invalid context event id: ${id}`);
	nonEmptyString(input.title, "title");
	nonEmptyString(input.summary, "summary");
	if (!input.evidenceLevel) throw new Error("evidenceLevel is required");
	if (input.expiresAt != null && !Number.isFinite(input.expiresAt)) throw new Error("expiresAt must be a finite number");

	const scope = { ...(input.scope ?? {}) };
	if (input.branchId && !scope.branchId) scope.branchId = input.branchId;
	const event: MekannContextEvent = {
		schemaVersion: "mekann-context/v2",
		id,
		kind: input.kind,
		status: input.status ?? "active",
		createdAt,
		cwd: input.cwd,
		priority: input.priority,
		title: input.title,
		summary: input.summary,
		evidenceLevel: input.evidenceLevel,
		...spreadSessionMeta(input),
		...(Object.keys(scope).length > 0 ? { scope } : {}),
		...(nonEmptyArray(input.refs) ? { refs: input.refs } : {}),
		...(nonEmptyArray(input.supersedes) ? { supersedes: input.supersedes } : {}),
		...(nonEmptyArray(input.resolves) ? { resolves: input.resolves } : {}),
		...(nonEmptyArray(input.invalidates) ? { invalidates: input.invalidates } : {}),
		...(input.expiresAt != null ? { expiresAt: input.expiresAt } : {}),
	};
	await fsp.appendFile(eventsPath(input.cwd), `${JSON.stringify(event)}\n`, "utf8");
	return event;
}

// ─── Read ───────────────────────────────────────────────────────

function isEventLike(event: any): event is MekannContextEvent {
	return event?.schemaVersion === "mekann-context/v2"
		&& /^ctx_[a-z0-9]+_[a-z0-9]+$/.test(event.id)
		&& typeof event.kind === "string"
		&& typeof event.title === "string"
		&& event.title.trim().length > 0
		&& typeof event.summary === "string"
		&& event.summary.trim().length > 0
		&& typeof event.evidenceLevel === "string"
		&& typeof event.createdAt === "number";
}

export async function readEvents(cwd: string): Promise<MekannContextEvent[]> {
	const file = eventsPath(cwd);
	let raw = "";
	try {
		raw = await fsp.readFile(file, "utf8");
	} catch (error: any) {
		if (error?.code === "ENOENT") return [];
		throw error;
	}
	const out: MekannContextEvent[] = [];
	for (const line of raw.split(/\r?\n/)) {
		if (!line.trim()) continue;
		try {
			const event = JSON.parse(line);
			if (isEventLike(event)) out.push(event);
		} catch { /* skip corrupt jsonl */ }
	}
	return out;
}

// ─── Projection ─────────────────────────────────────────────────

function pushId(obj: Record<string, string[] | undefined>, key: string, value: string): void {
	obj[key] = [...(obj[key] ?? []), value];
}

export function projectContextEvents(events: MekannContextEvent[]): ProjectedContextEvent[] {
	const byId = new Map<string, ProjectedContextEvent>();
	for (const event of events) byId.set(event.id, { ...event, effectiveStatus: event.status });
	for (const event of events) {
		for (const targetId of event.supersedes ?? []) {
			const target = byId.get(targetId);
			if (target) pushId(target as any, "supersededBy", event.id);
		}
		for (const targetId of event.resolves ?? []) {
			const target = byId.get(targetId);
			if (target) pushId(target as any, "resolvedBy", event.id);
		}
		for (const targetId of event.invalidates ?? []) {
			const target = byId.get(targetId);
			if (target) pushId(target as any, "invalidatedBy", event.id);
		}
	}
	for (const event of byId.values()) {
		if (event.invalidatedBy?.length) event.effectiveStatus = "invalidated";
		else if (event.supersededBy?.length) event.effectiveStatus = "superseded";
		else if (event.resolvedBy?.length) event.effectiveStatus = "resolved";
		else event.effectiveStatus = event.status;
	}
	return [...byId.values()];
}

// ─── Stats ──────────────────────────────────────────────────────

export interface ContextStats {
	totalEvents: number;
	byKind: Record<string, number>;
	byPriority: Record<number, number>;
	byStatus: Record<string, number>;
	byEffectiveStatus: Record<string, number>;
	oldest: string;
	newest: string;
}

export function computeStats(events: ProjectedContextEvent[] | MekannContextEvent[]): ContextStats {
	if (events.length === 0) return { totalEvents: 0, byKind: {}, byPriority: {}, byStatus: {}, byEffectiveStatus: {}, oldest: "", newest: "" };
	const projected = ("effectiveStatus" in events[0]) ? events as ProjectedContextEvent[] : projectContextEvents(events as MekannContextEvent[]);
	const byKind: Record<string, number> = {};
	const byPriority: Record<number, number> = {};
	const byStatus: Record<string, number> = {};
	const byEffectiveStatus: Record<string, number> = {};
	for (const e of projected) {
		byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
		byPriority[e.priority] = (byPriority[e.priority] ?? 0) + 1;
		byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
		byEffectiveStatus[e.effectiveStatus] = (byEffectiveStatus[e.effectiveStatus] ?? 0) + 1;
	}
	const oldest = new Date(Math.min(...projected.map((e) => e.createdAt))).toISOString();
	const newest = new Date(Math.max(...projected.map((e) => e.createdAt))).toISOString();
	return { totalEvents: projected.length, byKind, byPriority, byStatus, byEffectiveStatus, oldest, newest };
}

// ─── Clear ──────────────────────────────────────────────────────

export async function clearContext(cwd: string): Promise<void> {
	await fsp.rm(contextDir(cwd), { recursive: true, force: true });
}

// ─── Helpers ────────────────────────────────────────────────────

export function truncate(str: string, maxLen: number): string {
	if (str.length <= maxLen) return str;
	return str.slice(0, maxLen - 1) + "…";
}

export function sortByPriorityThenNewest<T extends { priority: number; createdAt: number }>(events: T[]): T[] {
	return events.sort((a, b) => {
		if (a.priority !== b.priority) return a.priority - b.priority;
		return b.createdAt - a.createdAt;
	});
}

// ─── Search ─────────────────────────────────────────────────────

export interface SearchEventsInput {
	cwd: string;
	query?: string;
	kind?: MekannContextEventKind;
	maxResults?: number;
	priorityMax?: number;
}

function matchQuery(event: ProjectedContextEvent, query: string): boolean {
	const q = query.toLocaleLowerCase();
	if (event.title.toLocaleLowerCase().includes(q)) return true;
	if (event.summary.toLocaleLowerCase().includes(q)) return true;
	if (event.refs) {
		for (const ref of event.refs) if (ref.value.toLocaleLowerCase().includes(q)) return true;
	}
	return false;
}

export async function searchEvents(input: SearchEventsInput): Promise<ProjectedContextEvent[]> {
	let events = projectContextEvents(await readEvents(input.cwd));
	if (events.length === 0) return [];
	if (input.kind) events = events.filter((e) => e.kind === input.kind);
	if (input.priorityMax != null) events = events.filter((e) => e.priority <= input.priorityMax!);
	if (input.query) events = events.filter((e) => matchQuery(e, input.query!));
	sortByPriorityThenNewest(events);
	return events.slice(0, input.maxResults ?? 20);
}

export function formatSearchResult(events: ProjectedContextEvent[]): string {
	if (events.length === 0) return "No matching context events.";
	return events.map((e) => {
		const status = e.effectiveStatus === e.status ? `status=${e.status}` : `status=${e.status} effective=${e.effectiveStatus}`;
		const lines = [
			`### ${e.id}  P${e.priority}  ${e.kind}  ${status}  ${truncate(e.title, 160)}`,
			`summary: ${truncate(e.summary, 800)}`,
		];
		if (e.supersededBy?.length) lines.push(`supersededBy: ${e.supersededBy.join(", ")}`);
		if (e.resolvedBy?.length) lines.push(`resolvedBy: ${e.resolvedBy.join(", ")}`);
		if (e.invalidatedBy?.length) lines.push(`invalidatedBy: ${e.invalidatedBy.join(", ")}`);
		if (e.refs && e.refs.length > 0) {
			lines.push("refs:");
			for (const ref of e.refs.slice(0, 10)) lines.push(`  ${ref.type}: ${truncate(ref.value, 200)}${ref.role ? ` (${ref.role})` : ""}`);
		}
		lines.push(`created: ${new Date(e.createdAt).toISOString()}`);
		return lines.join("\n");
	}).join("\n\n");
}
