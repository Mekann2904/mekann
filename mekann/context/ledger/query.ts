import { readEvents } from "./store.js";
import type { MekannContextEvent, MekannContextEventKind, MekannContextEventStatus, ProjectedContextEvent } from "./schema.js";

type BacklinkField = "supersededBy" | "resolvedBy" | "invalidatedBy";

function pushBacklink(event: ProjectedContextEvent, field: BacklinkField, sourceId: string): void {
	const current = event[field];
	if (current) current.push(sourceId);
	else event[field] = [sourceId];
}

export function projectContextEvents(events: MekannContextEvent[]): ProjectedContextEvent[] {
	const byId = new Map<string, ProjectedContextEvent>();
	for (const event of events) byId.set(event.id, { ...event, effectiveStatus: event.status });
	for (const event of events) {
		for (const targetId of event.supersedes ?? []) {
			const target = byId.get(targetId);
			if (target) pushBacklink(target, "supersededBy", event.id);
		}
		for (const targetId of event.resolves ?? []) {
			const target = byId.get(targetId);
			if (target) pushBacklink(target, "resolvedBy", event.id);
		}
		for (const targetId of event.invalidates ?? []) {
			const target = byId.get(targetId);
			if (target) pushBacklink(target, "invalidatedBy", event.id);
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
	return { totalEvents: projected.length, byKind, byPriority, byStatus, byEffectiveStatus, oldest: new Date(oldestTs).toISOString(), newest: new Date(newestTs).toISOString() };
}

/**
 * Truncate a display field (event title / summary / ref) to `maxLen`
 * *characters*, appending an ellipsis. Iterates by code point so a surrogate
 * pair (emoji) or multi-byte CJK character is never split mid-character —
 * this is the char-budget display analog of byte-safe slicing. The overall
 * snapshot byte budget is enforced separately by `trimSnapshotToBudget`, so
 * per-field limits stay character-based for consistent visual length (see
 * issue #157 / IC-193: the old `str.slice` could split a surrogate pair and
 * emit a lone surrogate / U+FFFD).
 */
export function truncate(str: string, maxLen: number): string {
	if (maxLen <= 0) return "";
	const chars = Array.from(str);
	if (chars.length <= maxLen) return str;
	return chars.slice(0, Math.max(0, maxLen - 1)).join("") + "…";
}

export function sortByPriorityThenNewest<T extends { priority: number; createdAt: number }>(events: T[]): T[] {
	return events.sort((a, b) => {
		if (a.priority !== b.priority) return a.priority - b.priority;
		return b.createdAt - a.createdAt;
	});
}

export interface SearchEventsInput {
	cwd: string;
	query?: string;
	kind?: MekannContextEventKind;
	maxResults?: number;
	priorityMax?: number;
}

/**
 * Normalize text for context-event search (issue #162, IC-191).
 *
 * - NFKC folds full-width/half-width and compatibility forms so ｆｕｌｌ ≡ full.
 * - NFD + combining-mark strip (U+0300–U+036F, Latin/Greek accents only — not
 *   Japanese dakuten U+3099/U+309A) so café ≡ cafe. A trailing NFKC recomposes
 *   Japanese dakuten so カ vs ガ stay distinct.
 * - `toLowerCase` (not `toLocaleLowerCase`) avoids locale drift like Turkish-I.
 */
function normalizeForSearch(text: string): string {
	return text
		.normalize("NFKC")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.normalize("NFKC")
		.toLowerCase();
}

function matchQuery(event: ProjectedContextEvent, query: string): boolean {
	const terms = normalizeForSearch(query).split(/\s+/).filter(Boolean);
	if (terms.length === 0) return true;
	const haystack = normalizeForSearch(
		[event.title, event.summary, ...(event.refs?.map((ref) => ref.value) ?? [])].join("\n"),
	);
	// AND across query terms, order-independent: "bug login" ≡ "login bug".
	return terms.every((term) => haystack.includes(term));
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

export type { MekannContextEventStatus };
