import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import * as fsp from "node:fs/promises";
import { appendContextEvent, readEvents, computeStats, clearContext, searchEvents, formatSearchResult, eventsPath, contextDir, projectContextEvents } from "./store.js";
import { buildSnapshot, snapshotWatermarkMatches } from "./snapshot.js";
import { writeLatestSnapshot, readBoundedLatestSnapshot } from "./snapshot-store.js";
import { handleClear } from "../output-gate/index.js";

export { appendContextEvent, readEvents, computeStats, clearContext, searchEvents, formatSearchResult, projectContextEvents } from "./store.js";
export type { MekannContextEvent, MekannContextEventKind, MekannContextRef, AppendEventInput, ProjectedContextEvent, MekannContextEventStatus, MekannContextEvidenceLevel, MekannContextScope } from "./store.js";
export { buildSnapshot } from "./snapshot.js";

async function contextLedgerStatus(cwd: string): Promise<string> {
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

async function contextLedgerList(cwd: string): Promise<string> {
	const events = projectContextEvents(await readEvents(cwd)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
	if (events.length === 0) return "No context events.";
	return events.map((e) => {
		const status = e.effectiveStatus === e.status ? `status=${e.status}` : `status=${e.status} effective=${e.effectiveStatus}`;
		return `${e.id}\tP${e.priority}\t${e.kind}\t${status}\t${e.title}\t${new Date(e.createdAt).toISOString()}`;
	}).join("\n");
}

async function contextLedgerStats(cwd: string): Promise<string> {
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

export default function contextLedgerExtension(pi: ExtensionAPI): void {
	function clampInt(value: unknown, fallback: number, min: number, max: number): number {
		const n = Number(value);
		if (!Number.isFinite(n)) return fallback;
		return Math.max(min, Math.min(max, Math.trunc(n)));
	}
	const KindEnum = Type.Union([
		Type.Literal("tool_result"),
		Type.Literal("user_decision"),
		Type.Literal("file_change"),
		Type.Literal("error"),
		Type.Literal("task"),
		Type.Literal("plan"),
		Type.Literal("subagent"),
		Type.Literal("git"),
		Type.Literal("rule"),
		Type.Literal("constraint"),
		Type.Literal("autoresearch"),
		Type.Literal("safety_boundary"),
	]);

	pi.registerTool({
		name: "search_context_events",
		label: "Search Context Events",
		description: "Search decisions, tasks, errors, plans, and artifact references stored in the context ledger.",
		promptSnippet: "Search working memory events from the context ledger.",
		promptGuidelines: [
			"Use search_context_events for decisions, tasks, errors, plans, and artifact references.",
			"Use search_tool_outputs for raw log/output snippets stored by output-gate.",
		],
		parameters: Type.Object({
			query: Type.Optional(Type.String({ description: "Search title, summary, and refs" })),
			kind: Type.Optional(KindEnum),
			maxResults: Type.Optional(Type.Number({ description: "Maximum events to return (default: 20)" })),
			priorityMax: Type.Optional(Type.Number({ description: "Only include events with priority <= this value (0-4)" })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const cwd = ctx?.cwd ?? process.cwd();
			const events = await searchEvents({
				cwd,
				query: (params as any).query ? String((params as any).query) : undefined,
				kind: (params as any).kind,
				maxResults: clampInt((params as any).maxResults, 20, 1, 100),
				priorityMax: (params as any).priorityMax == null
					? undefined
					: clampInt((params as any).priorityMax, 4, 0, 4),
			});
			const text = formatSearchResult(events);
			return { content: [{ type: "text", text }], details: {} as Record<string, unknown> };
		},
	});

	pi.registerTool({
		name: "summarize_session_context",
		label: "Summarize Session Context",
		description: "Read the latest session snapshot or rebuild one from context events. Use this to restore working memory after session restart or compaction.",
		promptSnippet: "Summarize session context for working memory restore.",
		promptGuidelines: [
			"Use summarize_session_context to get a compact summary of session state for context restore.",
			"Use search_context_events for specific decisions, tasks, or errors.",
			"Use search_tool_outputs for raw log/output snippets.",
		],
		parameters: Type.Object({
			rebuild: Type.Optional(Type.Boolean({ description: "Rebuild from context events instead of reading latest snapshot" })),
			maxBytes: Type.Optional(Type.Number({ description: "Maximum snapshot bytes (default: 4096, min: 256)" })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const cwd = ctx?.cwd ?? process.cwd();
			const maxBytes = clampInt((params as any).maxBytes, 4096, 512, 65536);
			const rebuild = Boolean((params as any).rebuild);

			const events = await readEvents(cwd);
			let xml: string | undefined;
			if (!rebuild) {
				const cached = await readBoundedLatestSnapshot(cwd, maxBytes);
				if (cached && snapshotWatermarkMatches(cached, events)) xml = cached;
			}
			if (!xml) {
				xml = buildSnapshot(events, { maxBytes });
			}

			return { content: [{ type: "text", text: xml }], details: {} };
		},
	});

	pi.registerCommand("context-ledger", {
		description: "context-ledger events を表示・削除",
		getArgumentCompletions(prefix: string) {
			return ["list", "stats", "snapshot", "restore", "clear"].filter((v) => v.startsWith(prefix)).map((value) => ({ value, label: value }));
		},
		async handler(args: string | undefined, ctx: any) {
			const cwd = ctx?.cwd ?? process.cwd();
			const arg = args?.trim() ?? "";

			if (arg === "clear") {
				await handleClear(ctx, "context-ledger", contextDir(cwd), async () => { await clearContext(cwd); });
				return;
			}

			if (arg === "stats") {
				ctx?.ui?.notify?.(await contextLedgerStats(cwd), "info");
				return;
			}

			if (arg === "list") {
				ctx?.ui?.notify?.(await contextLedgerList(cwd), "info");
				return;
			}

			if (arg === "snapshot" || arg.startsWith("snapshot")) {
				const maxBytesMatch = arg.match(/--max-bytes\s+(\d+)/);
				const unbounded = arg.includes("--unbounded");
				const maxBytes = unbounded ? undefined : (maxBytesMatch ? Math.max(512, parseInt(maxBytesMatch[1], 10)) : 4096);
				const shouldWrite = arg.includes("--write");
				const events = await readEvents(cwd);
				const xml = buildSnapshot(events, { maxBytes });

				if (shouldWrite) {
					const result = await writeLatestSnapshot(cwd, xml);
					ctx?.ui?.notify?.(
						`Snapshot saved:\n  latest: ${result.latestPath}\n  timestamped: ${result.snapshotPath}\n  size: ${result.bytes} bytes`,
						"info",
					);
				} else {
					ctx?.ui?.notify?.(xml, "info");
				}
				return;
			}

			if (arg === "restore" || arg.startsWith("restore")) {
				const maxBytesMatch = arg.match(/--max-bytes\s+(\d+)/);
				const maxBytes = maxBytesMatch ? Math.max(512, parseInt(maxBytesMatch[1], 10)) : 4096;
				const rebuild = arg.includes("--rebuild");
				const shouldWrite = arg.includes("--write");

				let xml: string | undefined;

				if (!rebuild) {
					xml = await readBoundedLatestSnapshot(cwd, maxBytes);
				}

				const events = await readEvents(cwd);

				if (!xml || !snapshotWatermarkMatches(xml, events)) {
					xml = buildSnapshot(events, { maxBytes });
					if (shouldWrite) {
						await writeLatestSnapshot(cwd, xml);
					}
				}

				ctx?.ui?.notify?.(xml, "info");
				return;
			}

			// default: status
			ctx?.ui?.notify?.(await contextLedgerStatus(cwd), "info");
		},
	});
}
