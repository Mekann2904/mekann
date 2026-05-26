import * as crypto from "node:crypto";
import * as fsp from "node:fs/promises";
import * as path from "node:path";

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

export function rotatedEventsPath(cwd: string): string {
	return path.join(contextDir(cwd), "events.v2.jsonl.1");
}

const DEFAULT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// ─── ID Generation ──────────────────────────────────────────────

let eventCounter = 0;

export function createEventId(createdAt: number, counter: number, random = ""): string {
	const suffix = random ? `_${random}` : "";
	return `ctx_${createdAt.toString(36)}_${counter.toString(36)}${suffix}`;
}

export function nextEventId(createdAt: number): string {
	eventCounter += 1;
	return createEventId(createdAt, eventCounter, crypto.randomBytes(3).toString("hex"));
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
	maxFileSizeBytes?: number;
	idGenerator?: (createdAt: number) => string;
	now?: () => number;
}

const VALID_KINDS = new Set<MekannContextEventKind>(["tool_result", "user_decision", "file_change", "error", "task", "plan", "subagent", "git", "rule", "constraint", "autoresearch", "safety_boundary"]);
const VALID_STATUSES = new Set<MekannContextEventStatus>(["active", "resolved", "superseded", "stale", "blocked", "invalidated"]);
const VALID_EVIDENCE_LEVELS = new Set<MekannContextEvidenceLevel>(["observed", "tool_reported", "user_decided", "agent_inferred", "agent_assumed", "generated_summary"]);
const VALID_REF_TYPES = new Set<MekannContextRef["type"]>(["artifact", "file", "url", "symbol", "commit", "event", "snapshot"]);
const VALID_REF_ROLES = new Set<NonNullable<MekannContextRef["role"]>>(["evidence", "output", "decision", "context"]);

function nonEmptyString(value: string, name: string): void {
	if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${name} is required`);
}

function requireStringArray(value: unknown, name: string): void {
	if (value == null) return;
	if (!Array.isArray(value) || !value.every((v) => typeof v === "string" && v.length > 0)) throw new Error(`${name} must be a string array`);
}

function requireScope(value: unknown): void {
	if (value == null) return;
	if (typeof value !== "object" || Array.isArray(value)) throw new Error("scope must be an object");
	const scope = value as MekannContextScope;
	for (const key of ["paths", "symbols"] as const) requireStringArray(scope[key], `scope.${key}`);
	for (const key of ["project", "goalId", "planId", "branchId", "subagentId"] as const) {
		if (scope[key] != null && typeof scope[key] !== "string") throw new Error(`scope.${key} must be a string`);
	}
}

function requireRefs(value: unknown): void {
	if (value == null) return;
	if (!Array.isArray(value)) throw new Error("refs must be an array");
	for (const ref of value as MekannContextRef[]) {
		if (!VALID_REF_TYPES.has(ref.type) || typeof ref.value !== "string" || ref.value.length === 0) throw new Error("Invalid context event ref");
		if (ref.role && !VALID_REF_ROLES.has(ref.role)) throw new Error(`Invalid context event ref role: ${ref.role}`);
	}
}

function requireValidEventInput(input: AppendEventInput, status: MekannContextEventStatus): void {
	if (!VALID_KINDS.has(input.kind)) throw new Error(`Invalid context event kind: ${input.kind}`);
	if (!VALID_STATUSES.has(status)) throw new Error(`Invalid context event status: ${status}`);
	if (!Number.isInteger(input.priority) || input.priority < 0 || input.priority > 4) throw new Error("priority must be an integer from 0 to 4");
	nonEmptyString(input.cwd, "cwd");
	const title = input.title.trim();
	const summary = input.summary.trim();
	nonEmptyString(title, "title");
	nonEmptyString(summary, "summary");
	if (summary.length > 4000) throw new Error("summary must be 4000 characters or less");
	if (!VALID_EVIDENCE_LEVELS.has(input.evidenceLevel)) throw new Error(`Invalid evidenceLevel: ${input.evidenceLevel}`);
	if (input.expiresAt != null && !Number.isFinite(input.expiresAt)) throw new Error("expiresAt must be a finite number");
	for (const field of ["supersedes", "resolves", "invalidates"] as const) requireStringArray(input[field], field);
	requireRefs(input.refs);
	requireScope(input.scope);
}

function nonEmptyArray<T>(items: T[] | undefined): T[] | undefined {
	return items && items.length > 0 ? items : undefined;
}

function spreadLedgerSessionMeta(input: { sessionId?: string; turnId?: string; toolCallId?: string }): Record<string, string> {
	const out: Record<string, string> = {};
	if (input.sessionId) out.sessionId = input.sessionId;
	if (input.turnId) out.turnId = input.turnId;
	if (input.toolCallId) out.toolCallId = input.toolCallId;
	return out;
}

const MAX_EVENTS = 2_000;

export async function appendContextEvent(input: AppendEventInput): Promise<MekannContextEvent> {
	await fsp.mkdir(contextDir(input.cwd), { recursive: true });
	const createdAt = input.now?.() ?? Date.now();
	const id = input.idGenerator?.(createdAt) ?? nextEventId(createdAt);
	if (!/^ctx_[a-z0-9]+_[a-z0-9]+(?:_[a-f0-9]+)?$/.test(id)) throw new Error(`Invalid context event id: ${id}`);
	const status = input.status ?? "active";
	requireValidEventInput(input, status);
	const title = input.title.trim();
	const summary = input.summary.trim();

	const scope = { ...(input.scope ?? {}) };
	if (input.branchId && !scope.branchId) scope.branchId = input.branchId;
	const event: MekannContextEvent = {
		schemaVersion: "mekann-context/v2",
		id,
		kind: input.kind,
		status,
		createdAt,
		cwd: input.cwd,
		priority: input.priority,
		title,
		summary,
		evidenceLevel: input.evidenceLevel,
		...spreadLedgerSessionMeta(input),
		...(Object.keys(scope).length > 0 ? { scope } : {}),
		...(nonEmptyArray(input.refs) ? { refs: input.refs } : {}),
		...(nonEmptyArray(input.supersedes) ? { supersedes: input.supersedes } : {}),
		...(nonEmptyArray(input.resolves) ? { resolves: input.resolves } : {}),
		...(nonEmptyArray(input.invalidates) ? { invalidates: input.invalidates } : {}),
		...(input.expiresAt != null ? { expiresAt: input.expiresAt } : {}),
	};
	const filePath = eventsPath(input.cwd);
	await fsp.appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");
	// Rotate if file exceeds size limit
	await rotateIfNeeded(input.cwd, filePath, input.maxFileSizeBytes);
	// Periodically prune the event log to prevent unbounded growth
	await pruneEventLog(input.cwd, filePath);
	return event;
}

// ─── Read ───────────────────────────────────────────────────────

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((v) => typeof v === "string" && v.length > 0);
}

function isScopeLike(value: unknown): boolean {
	if (value == null) return true;
	if (typeof value !== "object" || Array.isArray(value)) return false;
	const scope = value as MekannContextScope;
	if (scope.paths != null && !isStringArray(scope.paths)) return false;
	if (scope.symbols != null && !isStringArray(scope.symbols)) return false;
	for (const key of ["project", "goalId", "planId", "branchId", "subagentId"] as const) if (scope[key] != null && typeof scope[key] !== "string") return false;
	return true;
}

function areRefsLike(value: unknown): boolean {
	if (value == null) return true;
	if (!Array.isArray(value)) return false;
	return value.every((ref: MekannContextRef) => VALID_REF_TYPES.has(ref.type) && typeof ref.value === "string" && ref.value.length > 0 && (ref.role == null || VALID_REF_ROLES.has(ref.role)));
}

function isEventLike(event: any): event is MekannContextEvent {
	return event?.schemaVersion === "mekann-context/v2"
		&& /^ctx_[a-z0-9]+_[a-z0-9]+(?:_[a-f0-9]+)?$/.test(event.id)
		&& VALID_KINDS.has(event.kind)
		&& VALID_STATUSES.has(event.status)
		&& Number.isInteger(event.priority) && event.priority >= 0 && event.priority <= 4
		&& typeof event.title === "string" && event.title.trim().length > 0
		&& typeof event.summary === "string" && event.summary.trim().length > 0 && event.summary.length <= 4000
		&& VALID_EVIDENCE_LEVELS.has(event.evidenceLevel)
		&& typeof event.cwd === "string" && event.cwd.trim().length > 0
		&& Number.isFinite(event.createdAt)
		&& (event.expiresAt == null || Number.isFinite(event.expiresAt))
		&& (event.supersedes == null || isStringArray(event.supersedes))
		&& (event.resolves == null || isStringArray(event.resolves))
		&& (event.invalidates == null || isStringArray(event.invalidates))
		&& areRefsLike(event.refs)
		&& isScopeLike(event.scope)
		&& (event.sessionId == null || typeof event.sessionId === "string")
		&& (event.turnId == null || typeof event.turnId === "string")
		&& (event.toolCallId == null || typeof event.toolCallId === "string");
}

async function readJsonlFile(file: string): Promise<MekannContextEvent[]> {
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

export async function readEvents(cwd: string): Promise<MekannContextEvent[]> {
	const rotated = await readJsonlFile(rotatedEventsPath(cwd));
	const current = await readJsonlFile(eventsPath(cwd));
	return [...rotated, ...current];
}

// ─── Pruning ──────────────────────────────────────────────────────

let lastPruneCheck = 0;
const PRUNE_CHECK_INTERVAL_MS = 30_000; // check at most every 30s
const PRUNE_RETAIN_MS = 2 * 60 * 60 * 1000; // retain non-active events for 2 hours

async function rotateIfNeeded(cwd: string, filePath: string, maxBytes?: number): Promise<void> {
	const limit = maxBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;
	try {
		const stat = await fsp.stat(filePath).catch(() => undefined);
		if (!stat || stat.size < limit) return;
		const rp = rotatedEventsPath(cwd);
		// Move current file → .1 (overwriting any previous .1)
		await fsp.rename(filePath, rp);
		// New empty current file will be created on next append
	} catch {
		// Rotation must never break event appending
	}
}

async function pruneEventLog(cwd: string, filePath: string): Promise<void> {
	const now = Date.now();
	if (now - lastPruneCheck < PRUNE_CHECK_INTERVAL_MS) return;
	lastPruneCheck = now;
	try {
		const stat = await fsp.stat(filePath).catch(() => undefined);
		if (!stat) return;
		// Rough estimate: if file is small enough, skip
		const lineEstimate = stat.size / 500; // average ~500 bytes per JSON event
		if (lineEstimate < MAX_EVENTS) return;
		const raw = await fsp.readFile(filePath, "utf8");
		const lines = raw.split(/\r?\n/);
		if (lines.length <= MAX_EVENTS) return;
		// Parse, filter, and compact
		const kept: MekannContextEvent[] = [];
		const pruneCutoff = now - PRUNE_RETAIN_MS;
		for (const line of lines) {
			if (!line.trim()) continue;
			try {
				const event = JSON.parse(line);
				if (!isEventLike(event)) continue;
				// Always keep active events
				if (event.status === "active") { kept.push(event); continue; }
				// Keep recent non-active events
				if (event.createdAt > pruneCutoff) { kept.push(event); continue; }
				// Drop old superseded/resolved/stale/invalidated events
			} catch { /* skip corrupt */ }
		}
		if (kept.length < lines.filter((l) => l.trim()).length) {
			const compacted = kept.map((e) => JSON.stringify(e)).join("\n") + "\n";
			await fsp.writeFile(filePath, compacted, "utf8");
		}
	} catch {
		// Pruning must never break event appending
	}
}

// ─── Projection ─────────────────────────────────────────────────

function pushId(obj: Record<string, string[] | undefined>, key: string, value: string): void {
	const arr = obj[key];
	if (arr) arr.push(value);
	else obj[key] = [value];
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
	let oldestTs = projected[0].createdAt;
	let newestTs = projected[0].createdAt;
	for (let i = 1; i < projected.length; i++) {
		const ts = projected[i].createdAt;
		if (ts < oldestTs) oldestTs = ts;
		if (ts > newestTs) newestTs = ts;
	}
	const oldest = new Date(oldestTs).toISOString();
	const newest = new Date(newestTs).toISOString();
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
		const expired = e.expiresAt != null && e.expiresAt < Date.now();
		const lines = [
			`### ${e.id}  P${e.priority}  ${e.kind}  ${status}  evidence=${e.evidenceLevel}  ${truncate(e.title, 160)}`,
			`summary: ${truncate(e.summary, 800)}`,
		];
		if (e.scope && Object.keys(e.scope).length > 0) lines.push(`scope: ${Object.entries(e.scope).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(",") : v}`).join(" ")}`);
		if (e.expiresAt != null) lines.push(`expiresAt: ${new Date(e.expiresAt).toISOString()}${expired ? " (expired: true)" : ""}`);
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
