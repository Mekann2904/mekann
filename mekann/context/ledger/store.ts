import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { spreadSessionMeta } from "../output-gate/store.js";

// ─── Schema ─────────────────────────────────────────────────────

export type MekannContextEventKind =
	| "tool_result"
	| "user_decision"
	| "file_change"
	| "error"
	| "task"
	| "plan"
	| "subagent";

export interface MekannContextRef {
	type: "artifact" | "file" | "url" | "symbol" | "commit";
	value: string;
}

export interface MekannContextEvent {
	schemaVersion: "mekann-context/v1";
	id: string;
	kind: MekannContextEventKind;
	createdAt: number;
	cwd: string;
	sessionId?: string;
	turnId?: string;
	toolCallId?: string;
	branchId?: string;
	priority: 0 | 1 | 2 | 3 | 4;
	title: string;
	summary: string;
	refs?: MekannContextRef[];
}

// ─── Paths ──────────────────────────────────────────────────────

export function contextDir(cwd: string): string {
	return path.join(cwd, ".pi", "mekann-context");
}

export function eventsPath(cwd: string): string {
	return path.join(contextDir(cwd), "events.jsonl");
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
	refs?: MekannContextRef[];
	sessionId?: string;
	turnId?: string;
	toolCallId?: string;
	branchId?: string;
	idGenerator?: (createdAt: number) => string;
	now?: () => number;
}

export async function appendContextEvent(input: AppendEventInput): Promise<MekannContextEvent> {
	await fsp.mkdir(contextDir(input.cwd), { recursive: true });
	const createdAt = input.now?.() ?? Date.now();
	const id = input.idGenerator?.(createdAt) ?? nextEventId(createdAt);
	if (!/^ctx_[a-z0-9]+_[a-z0-9]+$/.test(id)) throw new Error(`Invalid context event id: ${id}`);
	const event: MekannContextEvent = {
		schemaVersion: "mekann-context/v1",
		id,
		kind: input.kind,
		createdAt,
		cwd: input.cwd,
		priority: input.priority,
		title: input.title,
		summary: input.summary,
		...spreadSessionMeta(input),
		...(input.refs && input.refs.length > 0 ? { refs: input.refs } : {}),
	};
	await fsp.appendFile(eventsPath(input.cwd), `${JSON.stringify(event)}\n`, "utf8");
	return event;
}

// ─── Read ───────────────────────────────────────────────────────

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
			const event = JSON.parse(line) as MekannContextEvent;
			if (event?.id && event?.kind && /^ctx_[a-z0-9]+_[a-z0-9]+$/.test(event.id)) {
				out.push(event);
			}
		} catch { /* skip corrupt jsonl */ }
	}
	return out;
}

// ─── Stats ──────────────────────────────────────────────────────

export interface ContextStats {
	totalEvents: number;
	byKind: Record<string, number>;
	byPriority: Record<number, number>;
	oldest: string;
	newest: string;
}

export function computeStats(events: MekannContextEvent[]): ContextStats {
	if (events.length === 0) {
		return { totalEvents: 0, byKind: {}, byPriority: {}, oldest: "", newest: "" };
	}
	const byKind: Record<string, number> = {};
	const byPriority: Record<number, number> = {};
	for (const e of events) {
		byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
		byPriority[e.priority] = (byPriority[e.priority] ?? 0) + 1;
	}
	const oldest = new Date(Math.min(...events.map((e) => e.createdAt))).toISOString();
	const newest = new Date(Math.max(...events.map((e) => e.createdAt))).toISOString();
	return { totalEvents: events.length, byKind, byPriority, oldest, newest };
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

function matchQuery(event: MekannContextEvent, query: string): boolean {
	const q = query.toLocaleLowerCase();
	if (event.title.toLocaleLowerCase().includes(q)) return true;
	if (event.summary.toLocaleLowerCase().includes(q)) return true;
	if (event.refs) {
		for (const ref of event.refs) {
			if (ref.value.toLocaleLowerCase().includes(q)) return true;
		}
	}
	return false;
}

export async function searchEvents(input: SearchEventsInput): Promise<MekannContextEvent[]> {
	let events = await readEvents(input.cwd);
	if (events.length === 0) return [];

	if (input.kind) {
		events = events.filter((e) => e.kind === input.kind);
	}
	if (input.priorityMax != null) {
		events = events.filter((e) => e.priority <= input.priorityMax!);
	}
	if (input.query) {
		events = events.filter((e) => matchQuery(e, input.query!));
	}

	// Sort by priority ascending, then createdAt descending
	sortByPriorityThenNewest(events);

	const maxResults = input.maxResults ?? 20;
	return events.slice(0, maxResults);
}

export function formatSearchResult(events: MekannContextEvent[]): string {
	if (events.length === 0) return "No matching context events.";
	return events.map((e) => {
		const lines = [
			`### ${e.id}  P${e.priority}  ${e.kind}  ${truncate(e.title, 160)}`,
			`summary: ${truncate(e.summary, 800)}`,
		];
		if (e.refs && e.refs.length > 0) {
			lines.push("refs:");
			for (const ref of e.refs.slice(0, 10)) {
				lines.push(`  ${ref.type}: ${truncate(ref.value, 200)}`);
			}
		}
		lines.push(`created: ${new Date(e.createdAt).toISOString()}`);
		return lines.join("\n");
	}).join("\n\n");
}
