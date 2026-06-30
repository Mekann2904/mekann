import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "@sinclair/typebox";
import { appendContextEvent, readEvents, clearContext, archiveLegacyV1Log } from "./store.js";
import { computeStats, searchEvents, formatSearchResult, projectContextEvents } from "./query.js";
import { CONTEXT_EVENT_KINDS, type MekannContextEventKind } from "./schema.js";
import { buildSnapshot } from "./snapshot.js";
import { readLatestSnapshot } from "./snapshot-store.js";
import { handleClear } from "../clear.js";
import { registerOutputGateBypassTools } from "../output-gate/bypass.js";
import { featureBooleanValue, featureStringValue } from "../../settings/enabled.js";
import { setToolsActive } from "../../settings/toolSurface.js";
import { parseParams } from "../../utils/typed-params.js";
import { shouldExposeManualOrAlwaysSurface, shouldRestoreSessionContextSurface } from "../surface-policy.js";
import { registerPromptProvider } from "../../core/prompt-core/index.js";
import {
	POST_COMPACTION_RESTORE_MAX_BYTES,
	PostCompactionRestoreController,
} from "./postCompactionRestore.js";
import {
	CONTEXT_LEDGER_COMMAND_COMPLETIONS,
	clampInt,
	runContextLedgerCommand,
	searchContextEvents,
	summarizeSessionContextText,
} from "./projection.js";

export { appendContextEvent, readEvents, clearContext, archiveLegacyV1Log } from "./store.js";
export { computeStats, searchEvents, formatSearchResult, projectContextEvents } from "./query.js";
export type { MekannContextEvent, MekannContextEventKind, MekannContextRef, ProjectedContextEvent, MekannContextEventStatus, MekannContextEvidenceLevel, MekannContextScope } from "./schema.js";
export type { AppendEventInput } from "./store.js";
export { buildSnapshot } from "./snapshot.js";

const CONTEXT_LEDGER_TOOL_NAMES = ["search_context_events", "summarize_session_context"] as const;

export default function contextLedgerExtension(pi: ExtensionAPI): void {
	let manualToolsActive = false;

	// IC-273: these tools aggregate/summarise stored session context; gating
	// their results would re-store them and create a save→search→save cycle.
	// Declare bypass at the registration site, co-located with the tools below.
	registerOutputGateBypassTools(CONTEXT_LEDGER_TOOL_NAMES);

	// ── post-compaction working-memory restore ───────────────────────
	// Re-read the toggle on session_start; arm on session_compact; disarm once
	// the snapshot is delivered into a freshly-built dynamic block.
	let postCompactionRestoreEnabled = featureBooleanValue(
		"context-ledger",
		"postCompactionRestore.enabled",
		true,
	);
	const restoreController = new PostCompactionRestoreController({
		isEnabled: () => postCompactionRestoreEnabled,
		readSnapshotXml: (cwd) =>
			summarizeSessionContextText({ cwd, maxBytes: POST_COMPACTION_RESTORE_MAX_BYTES }),
	});
	registerPromptProvider({
		id: "context-ledger",
		getFragments: (ctx) => restoreController.getFragments(ctx),
	});

	function shouldExposeContextLedgerTools(): boolean {
		return shouldExposeManualOrAlwaysSurface({
			configuredSurface: featureStringValue("context-ledger", "toolSurface", "on-demand"),
			manualActive: manualToolsActive,
		});
	}

	function syncContextLedgerToolSurface(): void {
		setToolsActive(pi, CONTEXT_LEDGER_TOOL_NAMES, shouldExposeContextLedgerTools());
	}

	function setManualToolsActive(active: boolean): void {
		manualToolsActive = active;
		syncContextLedgerToolSurface();
	}
	const KindEnum = Type.Enum(Object.fromEntries(CONTEXT_EVENT_KINDS.map((kind) => [kind, kind])) as { [K in MekannContextEventKind]: K });
	const searchContextEventsParams = Type.Object({
		query: Type.Optional(Type.String({ description: "Search title, summary, and refs" })),
		kind: Type.Optional(KindEnum),
		maxResults: Type.Optional(Type.Number({ description: "Maximum events to return (default: 20)" })),
		priorityMax: Type.Optional(Type.Number({ description: "Only include events with priority <= this value (0-4)" })),
	});
	type SearchContextEventsParams = Static<typeof searchContextEventsParams>;

	pi.registerTool({
		name: "search_context_events",
		label: "Search Context Events",
		description: "Search decisions, tasks, errors, plans, and artifact references stored in the context ledger.",
		promptSnippet: "Search working memory events from the context ledger.",
		promptGuidelines: [
			"Use search_context_events for decisions, tasks, errors, plans, and artifact references.",
			"Use search_tool_outputs for raw log/output snippets stored by output-gate.",
		],
		parameters: searchContextEventsParams,
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const cwd = ctx?.cwd ?? process.cwd();
			// Type-safe decode: schema↔handler field drift surfaces as a compile
			// error instead of silently returning undefined.
			const p: SearchContextEventsParams = parseParams(searchContextEventsParams, params);
			const result = await searchContextEvents({
				cwd,
				query: p.query,
				kind: p.kind,
				maxResults: p.maxResults,
				priorityMax: p.priorityMax,
			});
			return { content: [{ type: "text", text: result.text }], details: result.details };
		},
	});

	const summarizeSessionContextParams = Type.Object({
		rebuild: Type.Optional(Type.Boolean({ description: "Rebuild from context events instead of reading latest snapshot" })),
		maxBytes: Type.Optional(Type.Number({ description: "Maximum snapshot bytes (default: 4096, min: 512)" })),
	});
	type SummarizeSessionContextParams = Static<typeof summarizeSessionContextParams>;

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
		parameters: summarizeSessionContextParams,
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const cwd = ctx?.cwd ?? process.cwd();
			const p: SummarizeSessionContextParams = parseParams(summarizeSessionContextParams, params);
			const text = await summarizeSessionContextText({
				cwd,
				rebuild: p.rebuild,
				maxBytes: p.maxBytes,
			});
			return { content: [{ type: "text", text }], details: {} };
		},
	});

	pi.registerCommand("context-ledger", {
		description: "context-ledger events を表示・削除",
		getArgumentCompletions(prefix: string) {
			return CONTEXT_LEDGER_COMMAND_COMPLETIONS.filter((v) => v.startsWith(prefix)).map((value) => ({ value, label: value }));
		},
		async handler(args: string | undefined, ctx: ExtensionCommandContext) {
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

	pi.on("session_start", async (event, ctx) => {
		const cwd = ctx?.cwd ?? process.cwd();
		manualToolsActive = false;
		manualToolsActive = shouldRestoreSessionContextSurface({
			reason: event?.reason,
			hasLatestSnapshot: Boolean(await readLatestSnapshot(cwd)),
		});
		syncContextLedgerToolSurface();
		// Fresh session: nothing to restore. Re-read the toggle in case settings changed.
		restoreController.reset();
		postCompactionRestoreEnabled = featureBooleanValue(
			"context-ledger",
			"postCompactionRestore.enabled",
			true,
		);
		// Best-effort: archive the legacy v1 ledger on first contact so it stops
		// masquerading as a live log (ADR-0006 / issue #96). Must never break session start.
		try {
			await archiveLegacyV1Log(cwd);
		} catch {
			/* best-effort migration */
		}
	});

	pi.on("session_compact", async () => {
		setManualToolsActive(true);
		// A compaction completed: offer the ledger snapshot on the next prompt
		// render so working memory is restored without a manual summarize call.
		restoreController.arm();
	});

	// Consume the restore once the snapshot lands in a freshly-built dynamic
	// block. cache-friendly-prompt's context handler runs before this one
	// (core loads before context), so the block is already appended here.
	pi.on("context", async (event) => {
		restoreController.consumeIfDelivered(event?.messages ?? []);
	});

	pi.on("session_shutdown", async () => {
		manualToolsActive = false;
		restoreController.reset();
		syncContextLedgerToolSurface();
	});
}

export { clampInt };
