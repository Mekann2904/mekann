import * as crypto from "node:crypto";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { withAppendLock } from "../../utils/atomic-append.js";
import { VALID_EVIDENCE_LEVELS, VALID_KINDS, VALID_REF_ROLES, VALID_REF_TYPES, VALID_STATUSES, type MekannContextEvent, type MekannContextEventKind, type MekannContextEventStatus, type MekannContextEvidenceLevel, type MekannContextRef, type MekannContextScope, type ProjectedContextEvent } from "./schema.js";

// ─── Paths ──────────────────────────────────────────────────────

export function contextDir(cwd: string): string {
	return path.join(cwd, ".pi", "mekann-context");
}

export function eventsPath(cwd: string): string {
	return path.join(contextDir(cwd), "events.v2.jsonl");
}

/**
 * Legacy v1 ledger filename (`events.jsonl`), superseded by ADR-0006. The v2
 * runtime never reads or writes this path; it is archived away on first
 * contact so it cannot masquerade as a live log (issue #96).
 */
const LEGACY_V1_EVENTS_FILENAME = "events.jsonl";

export function legacyV1EventsPath(cwd: string): string {
	return path.join(contextDir(cwd), LEGACY_V1_EVENTS_FILENAME);
}

/**
 * Maximum number of rotated generations kept on disk (issue #76 / C-009).
 *
 * Rotation shifts generations up (`.k` -> `.(k+1)`) before writing the newly
 * rotated tail into `.1`. Older generations are only unlinked once the cap is
 * reached, so prior rotation content is never discarded on the 2nd rotation
 * (the original silent-overwrite bug). Bounded to
 * `MAX_ROTATED_GENERATIONS * DEFAULT_MAX_FILE_SIZE_BYTES` (~50 MB) worst case.
 */
const MAX_ROTATED_GENERATIONS = 5;

export function rotatedEventsPath(cwd: string, generation = 1): string {
	return path.join(contextDir(cwd), `events.v2.jsonl.${generation}`);
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
	// Append, rotate, and prune as a single locked transaction so a concurrent
	// writer (sibling pi process in the same cwd) cannot interleave a line into a
	// half-rotated file or have its just-appended event clobbered by a rotation
	// rewrite. The lock is an O_EXCL lockfile sibling shared with the other
	// JSONL writers (issue #139).
	await withAppendLock(filePath, async () => {
		await fsp.appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");
		// Rotate after appending, preserving the just-appended event in current.
		await rotateIfNeeded(input.cwd, filePath, input.maxFileSizeBytes);
		// Periodically prune the event log to prevent unbounded growth
		await pruneEventLog(input.cwd, filePath);
	});
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

async function listRotatedGenerations(cwd: string): Promise<number[]> {
	let entries: string[];
	try {
		entries = await fsp.readdir(contextDir(cwd));
	} catch (error: any) {
		if (error?.code === "ENOENT") return [];
		throw error;
	}
	const gens: number[] = [];
	for (const name of entries) {
		const m = /^events\.v2\.jsonl\.([1-9]\d*)$/.exec(name);
		if (m) gens.push(Number.parseInt(m[1], 10));
	}
	return gens.sort((a, b) => a - b);
}

export async function readEvents(cwd: string): Promise<MekannContextEvent[]> {
	// Read oldest generation first so the merged stream stays chronological:
	// `.N` (oldest) -> `.1` (newest rotated) -> current.
	const gens = await listRotatedGenerations(cwd);
	const rotated: MekannContextEvent[] = [];
	for (const generation of [...gens].sort((a, b) => b - a)) {
		rotated.push(...await readJsonlFile(rotatedEventsPath(cwd, generation)));
	}
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
		const raw = await fsp.readFile(filePath, "utf8");
		const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
		if (lines.length <= 1) return;
		const gens = await listRotatedGenerations(cwd);
		// Drop generations that are already at/over the cap. Older generations are
		// only lost after MAX_ROTATED_GENERATIONS full rotations — never on the
		// 2nd (the original silent-overwrite bug, issue #76 / C-009).
		for (const generation of gens) {
			if (generation >= MAX_ROTATED_GENERATIONS) {
				await fsp.rm(rotatedEventsPath(cwd, generation), { force: true });
			}
		}
		// Shift remaining generations up by one, highest first so renames never
		// clobber an existing file: `.k` -> `.(k+1)`.
		const shiftable = gens.filter((g) => g < MAX_ROTATED_GENERATIONS).sort((a, b) => b - a);
		for (const generation of shiftable) {
			await fsp.rename(rotatedEventsPath(cwd, generation), rotatedEventsPath(cwd, generation + 1));
		}
		const rp = rotatedEventsPath(cwd, 1);
		// Keep the newest event in the current file so readers never observe a
		// missing current log immediately after rotation.
		await fsp.writeFile(rp, `${lines.slice(0, -1).join("\n")}\n`, "utf8");
		await fsp.writeFile(filePath, `${lines[lines.length - 1]}\n`, "utf8");
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

export async function clearContext(cwd: string): Promise<void> {
	await fsp.rm(contextDir(cwd), { recursive: true, force: true });
}

async function statOptional(file: string) {
	try {
		return await fsp.stat(file);
	} catch (error: any) {
		if (error?.code === "ENOENT") return undefined;
		throw error;
	}
}

/**
 * Archive the legacy v1 context ledger (`events.jsonl`) introduced before
 * ADR-0006. v2 is the only runtime path (`events.v2.jsonl`); a lingering v1
 * file is dead weight that can mislead readers into thinking v1 is still live.
 *
 * Renames the v1 file to `events.jsonl.bak` (best-effort, idempotent). The
 * data is preserved for forensic inspection but is clearly marked as a legacy
 * backup and is never read by the runtime. If a previous `.bak` already
 * exists, the new orphan is stashed as `events.jsonl.bak.<timestamp>` so no v1
 * data is silently lost. Safe to call repeatedly: a no-op once the v1 file is
 * gone. Unexpected FS errors propagate; best-effort callers wrap in try/catch.
 */
export async function archiveLegacyV1Log(cwd: string): Promise<void> {
	const v1Path = legacyV1EventsPath(cwd);
	const v1Stat = await statOptional(v1Path);
	if (!v1Stat?.isFile()) return;
	let backupPath = `${v1Path}.bak`;
	if ((await statOptional(backupPath))?.isFile()) {
		backupPath = `${v1Path}.bak.${Date.now()}`;
	}
	await fsp.rename(v1Path, backupPath);
}

export type { MekannContextEvent, MekannContextEventKind, MekannContextRef, ProjectedContextEvent, MekannContextEventStatus, MekannContextEvidenceLevel, MekannContextScope } from "./schema.js";
export { computeStats, formatSearchResult, projectContextEvents, searchEvents, sortByPriorityThenNewest, truncate } from "./query.js";
export type { ContextStats, SearchEventsInput } from "./query.js";
