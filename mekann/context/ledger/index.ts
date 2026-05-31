import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { appendContextEvent, readEvents, computeStats, clearContext, searchEvents, formatSearchResult, projectContextEvents } from "./store.js";
import { buildSnapshot } from "./snapshot.js";
import { readLatestSnapshot } from "./snapshot-store.js";
import { handleClear } from "../clear.js";
import { featureStringValue } from "../../settings/enabled.js";
import { setToolsActive } from "../../settings/toolSurface.js";
import {
	CONTEXT_LEDGER_COMMAND_COMPLETIONS,
	clampInt,
	runContextLedgerCommand,
	searchContextEventsText,
	summarizeSessionContextText,
} from "./projection.js";

export { appendContextEvent, readEvents, computeStats, clearContext, searchEvents, formatSearchResult, projectContextEvents } from "./store.js";
export type { MekannContextEvent, MekannContextEventKind, MekannContextRef, AppendEventInput, ProjectedContextEvent, MekannContextEventStatus, MekannContextEvidenceLevel, MekannContextScope } from "./store.js";
export { buildSnapshot } from "./snapshot.js";

const CONTEXT_LEDGER_TOOL_NAMES = ["search_context_events", "summarize_session_context"] as const;

export default function contextLedgerExtension(pi: ExtensionAPI): void {
	let manualToolsActive = false;

	function shouldExposeContextLedgerTools(): boolean {
		return featureStringValue("context-ledger", "toolSurface", "on-demand") === "always" || manualToolsActive;
	}

	function syncContextLedgerToolSurface(): void {
		setToolsActive(pi, CONTEXT_LEDGER_TOOL_NAMES, shouldExposeContextLedgerTools());
	}

	function setManualToolsActive(active: boolean): void {
		manualToolsActive = active;
		syncContextLedgerToolSurface();
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
			const text = await searchContextEventsText({
				cwd,
				query: (params as any).query ? String((params as any).query) : undefined,
				kind: (params as any).kind,
				maxResults: (params as any).maxResults,
				priorityMax: (params as any).priorityMax,
			});
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
			maxBytes: Type.Optional(Type.Number({ description: "Maximum snapshot bytes (default: 4096, min: 512)" })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const cwd = ctx?.cwd ?? process.cwd();
			const text = await summarizeSessionContextText({
				cwd,
				rebuild: (params as any).rebuild,
				maxBytes: (params as any).maxBytes,
			});
			return { content: [{ type: "text", text }], details: {} };
		},
	});

	pi.registerCommand("context-ledger", {
		description: "context-ledger events を表示・削除",
		getArgumentCompletions(prefix: string) {
			return CONTEXT_LEDGER_COMMAND_COMPLETIONS.filter((v) => v.startsWith(prefix)).map((value) => ({ value, label: value }));
		},
		async handler(args: string | undefined, ctx: any) {
			const cwd = ctx?.cwd ?? process.cwd();
			const arg = args?.trim() ?? "";
			if (arg === "enable-tools") {
				setManualToolsActive(true);
				ctx?.ui?.notify?.("context-ledger tools enabled", "info");
				return;
			}
			if (arg === "disable-tools") {
				setManualToolsActive(false);
				ctx?.ui?.notify?.("context-ledger tools disabled", "info");
				return;
			}
			if (arg === "restore" || arg.startsWith("restore")) setManualToolsActive(true);
			const result = await runContextLedgerCommand(cwd, args);
			if (result.kind === "clear") {
				await handleClear(ctx, result.label, result.targetDir, result.clear);
				return;
			}
			ctx?.ui?.notify?.(result.text, result.level);
		},
	});

	pi.on("session_start", async (event: any, ctx: any) => {
		const cwd = ctx?.cwd ?? process.cwd();
		manualToolsActive = false;
		if ((event?.reason === "resume" || event?.reason === "reload" || event?.reason === "fork") && await readLatestSnapshot(cwd)) {
			manualToolsActive = true;
		}
		syncContextLedgerToolSurface();
	});

	pi.on("session_compact", async () => {
		setManualToolsActive(true);
	});

	pi.on("session_shutdown", async () => {
		manualToolsActive = false;
		syncContextLedgerToolSurface();
	});
}

export { clampInt };
