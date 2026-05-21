import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import * as fsp from "node:fs/promises";
import { appendContextEvent, readEvents, computeStats, clearContext, eventsPath, contextDir } from "./store.js";
import { buildSnapshot } from "./snapshot.js";

export { appendContextEvent, readEvents, computeStats, clearContext } from "./store.js";
export type { MekannContextEvent, MekannContextEventKind, MekannContextRef, AppendEventInput } from "./store.js";
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
	const events = (await readEvents(cwd)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
	if (events.length === 0) return "No context events.";
	return events.map((e) =>
		`${e.id}\tP${e.priority}\t${e.kind}\t${e.title}\t${new Date(e.createdAt).toISOString()}`
	).join("\n");
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
	return [
		"context-ledger stats",
		"  events: " + stats.totalEvents,
		"  oldest: " + stats.oldest,
		"  newest: " + stats.newest,
		"by kind:",
		kindBreakdown,
		"by priority:",
		priorityBreakdown,
	].join("\n");
}

export default function contextLedgerExtension(pi: ExtensionAPI): void {
	pi.registerCommand("context-ledger", {
		description: "context-ledger events を表示・削除",
		getArgumentCompletions(prefix: string) {
			return ["list", "stats", "snapshot", "clear"].filter((v) => v.startsWith(prefix)).map((value) => ({ value, label: value }));
		},
		async handler(args: string | undefined, ctx: any) {
			const cwd = ctx?.cwd ?? process.cwd();
			const arg = args?.trim() ?? "";

			if (arg === "clear") {
				const confirmFn = ctx?.ui?.confirm;
				if (typeof confirmFn !== "function") {
					ctx?.ui?.notify?.("clear requires interactive confirmation", "warning");
					return;
				}
				const ok = await confirmFn("Clear context ledger?", `Delete ${contextDir(cwd)} ?`);
				if (!ok) return;
				await clearContext(cwd);
				ctx?.ui?.notify?.("context-ledger cleared", "info");
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

			if (arg === "snapshot") {
				const events = await readEvents(cwd);
				const xml = buildSnapshot(events);
				ctx?.ui?.notify?.(xml, "info");
				return;
			}

			// default: status
			ctx?.ui?.notify?.(await contextLedgerStatus(cwd), "info");
		},
	});
}
