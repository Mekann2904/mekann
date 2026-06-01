import { buildSnapshot, snapshotWatermarkMatches } from "./snapshot.js";
import { readBoundedLatestSnapshot, writeLatestSnapshot } from "./snapshot-store.js";
import { clearContext, contextDir, eventsPath, readEvents } from "./store.js";
import { computeStats, formatSearchResult, projectContextEvents, searchEvents } from "./query.js";
import type { MekannContextEventKind } from "./schema.js";

export function clampInt(value: unknown, fallback: number, min: number, max: number): number {
	const n = Number(value);
	if (!Number.isFinite(n)) return fallback;
	return Math.max(min, Math.min(max, Math.trunc(n)));
}

export async function contextLedgerStatus(cwd: string): Promise<string> {
	const events = await readEvents(cwd);
	const stats = computeStats(events);
	if (stats.totalEvents === 0) return "Context ledger is empty.";
	return [
		"context-ledger events: " + stats.totalEvents,
		"oldest: " + stats.oldest,
		"newest: " + stats.newest,
		"events: " + eventsPath(cwd),
	].join("\n");
}

export async function contextLedgerList(cwd: string): Promise<string> {
	const events = projectContextEvents(await readEvents(cwd)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
	if (events.length === 0) return "No context events.";
	return events.map((e) => {
		const status = e.effectiveStatus === e.status ? `status=${e.status}` : `status=${e.status} effective=${e.effectiveStatus}`;
		return `${e.id}\tP${e.priority}\t${e.kind}\t${status}\t${e.title}\t${new Date(e.createdAt).toISOString()}`;
	}).join("\n");
}

export async function contextLedgerStats(cwd: string): Promise<string> {
	const events = await readEvents(cwd);
	if (events.length === 0) return "Context ledger is empty.";
	const stats = computeStats(events);
	const kindBreakdown = Object.entries(stats.byKind)
		.sort((a, b) => b[1] - a[1])
		.map(([kind, count]) => `  ${kind}: ${count}`)
		.join("\n");
	const priorityBreakdown = Object.entries(stats.byPriority)
		.sort((a, b) => Number(a[0]) - Number(b[0]))
		.map(([p, count]) => `  P${p}: ${count}`)
		.join("\n");
	const statusBreakdown = Object.entries(stats.byStatus)
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([status, count]) => `  ${status}: ${count}`)
		.join("\n");
	const effectiveStatusBreakdown = Object.entries(stats.byEffectiveStatus)
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([status, count]) => `  ${status}: ${count}`)
		.join("\n");
	return [
		"context-ledger stats",
		"  events: " + stats.totalEvents,
		"  oldest: " + stats.oldest,
		"  newest: " + stats.newest,
		"by kind:",
		kindBreakdown,
		"by priority:",
		priorityBreakdown,
		"by status:",
		statusBreakdown,
		"by effective status:",
		effectiveStatusBreakdown,
	].join("\n");
}

export async function searchContextEventsText(input: {
	cwd: string;
	query?: string;
	kind?: MekannContextEventKind;
	maxResults?: unknown;
	priorityMax?: unknown;
}): Promise<string> {
	const events = await searchEvents({
		cwd: input.cwd,
		query: input.query,
		kind: input.kind,
		maxResults: clampInt(input.maxResults, 20, 1, 100),
		priorityMax: input.priorityMax == null ? undefined : clampInt(input.priorityMax, 4, 0, 4),
	});
	return formatSearchResult(events);
}

export async function summarizeSessionContextText(input: {
	cwd: string;
	rebuild?: unknown;
	maxBytes?: unknown;
}): Promise<string> {
	const maxBytes = clampInt(input.maxBytes, 4096, 512, 65536);
	const rebuild = Boolean(input.rebuild);
	const events = await readEvents(input.cwd);
	let xml: string | undefined;
	if (!rebuild) {
		const cached = await readBoundedLatestSnapshot(input.cwd, maxBytes);
		if (cached && snapshotWatermarkMatches(cached, events)) xml = cached;
	}
	if (!xml) xml = buildSnapshot(events, { maxBytes });
	return xml;
}

export const CONTEXT_LEDGER_COMMAND_COMPLETIONS = ["list", "stats", "snapshot", "restore", "clear", "enable-tools", "disable-tools"] as const;

export type ContextLedgerCommandResult =
	| { kind: "notify"; text: string; level: "info" }
	| { kind: "clear"; label: "context-ledger"; targetDir: string; clear: () => Promise<void> };

export async function runContextLedgerCommand(cwd: string, args: string | undefined): Promise<ContextLedgerCommandResult> {
	const arg = args?.trim() ?? "";

	if (arg === "clear") {
		return { kind: "clear", label: "context-ledger", targetDir: contextDir(cwd), clear: async () => { await clearContext(cwd); } };
	}

	if (arg === "stats") return { kind: "notify", text: await contextLedgerStats(cwd), level: "info" };
	if (arg === "list") return { kind: "notify", text: await contextLedgerList(cwd), level: "info" };

	if (arg === "snapshot" || arg.startsWith("snapshot")) {
		const maxBytesMatch = arg.match(/--max-bytes\s+(\d+)/);
		const unbounded = arg.includes("--unbounded");
		const maxBytes = unbounded ? undefined : (maxBytesMatch ? Math.max(512, parseInt(maxBytesMatch[1], 10)) : 4096);
		const shouldWrite = arg.includes("--write");
		const events = await readEvents(cwd);
		const xml = buildSnapshot(events, { maxBytes });

		if (shouldWrite) {
			const result = await writeLatestSnapshot(cwd, xml);
			return { kind: "notify", level: "info", text: `Snapshot saved:\n  latest: ${result.latestPath}\n  timestamped: ${result.snapshotPath}\n  size: ${result.bytes} bytes` };
		}
		return { kind: "notify", text: xml, level: "info" };
	}

	if (arg === "restore" || arg.startsWith("restore")) {
		const maxBytesMatch = arg.match(/--max-bytes\s+(\d+)/);
		const maxBytes = maxBytesMatch ? Math.max(512, parseInt(maxBytesMatch[1], 10)) : 4096;
		const rebuild = arg.includes("--rebuild");
		const shouldWrite = arg.includes("--write");

		let xml: string | undefined;
		if (!rebuild) xml = await readBoundedLatestSnapshot(cwd, maxBytes);

		const events = await readEvents(cwd);
		if (!xml || !snapshotWatermarkMatches(xml, events)) {
			xml = buildSnapshot(events, { maxBytes });
			if (shouldWrite) await writeLatestSnapshot(cwd, xml);
		}

		return { kind: "notify", text: xml, level: "info" };
	}

	return { kind: "notify", text: await contextLedgerStatus(cwd), level: "info" };
}
