/**
 * output-gate — Pi tool/command/hook registration entry point.
 *
 * Thin adapter: builds OutputGateController from config, delegates all
 * use-cases, and converts between Pi event types and controller I/O.
 */

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, ToolResultEvent } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "@sinclair/typebox";
import * as fsp from "node:fs/promises";
import { MEKANN_OUTPUT_GATE_DEFAULTS } from "../../config.js";
import { featureConfig, featureValue } from "../../settings/featureConfig.js";
import { featureStringValue } from "../../settings/enabled.js";
import { setToolsActive } from "../../settings/toolSurface.js";
import { outputGateDir, readManifest } from "./store.js";
import { registerOutputGateBypassTools } from "./bypass.js";
import { handleClear } from "../clear.js";
import { recordToolOutputArtifact } from "../recording.js";
import { OutputGateController } from "./controller.js";
import type { SearchToolOutputsInput } from "./search.js";
import { parseParams } from "../../utils/typed-params.js";
import { parseFlags, stripQuotes, tokenizeArgs } from "../../utils/cli-args/index.js";

// ---------------------------------------------------------------------------
// Re-exports (backward compatibility)
// ---------------------------------------------------------------------------

export { shouldGateOutput, buildStoredOutputStub, buildPreview, gateTextForLlm } from "./store.js";
export { extractTextContent } from "./controller.js";

// ---------------------------------------------------------------------------
// Controller instance
// ---------------------------------------------------------------------------

function createController(): OutputGateController {
	const cfg = featureConfig("output-gate");
	return new OutputGateController({
		config: {
			maxInlineBytes: Number(cfg.maxInlineBytes) || MEKANN_OUTPUT_GATE_DEFAULTS.maxInlineBytes,
			previewBytes: Number(cfg.previewBytes) || MEKANN_OUTPUT_GATE_DEFAULTS.previewBytes,
			artifactRetentionMaxFiles: Number(cfg.artifactRetentionMaxFiles) || MEKANN_OUTPUT_GATE_DEFAULTS.artifactRetentionMaxFiles,
		},
		recorder: { recordToolOutputArtifact },
	});
}

// ---------------------------------------------------------------------------
// Pi response helper
// ---------------------------------------------------------------------------

function textResponse(text: string, details: Record<string, unknown> = { source: "output-gate" }): {
	content: Array<{ type: "text"; text: string }>;
	details: Record<string, unknown>;
} {
	return { content: [{ type: "text" as const, text }], details };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function isOutputGateStored(details: unknown): boolean {
	if (!details || typeof details !== "object" || !("outputGate" in details)) return false;
	const outputGate = details.outputGate;
	return Boolean(outputGate && typeof outputGate === "object" && "stored" in outputGate && outputGate.stored === true);
}

// ---------------------------------------------------------------------------
// Command arg parsing (adapter-level)
// ---------------------------------------------------------------------------

function parseKeepArg(args: string | undefined): number | undefined {
	const { flags } = parseFlags(tokenizeArgs(args ?? ""));
	const raw = flags.get("keep")?.[0];
	if (raw === undefined || raw === "") return undefined;
	const n = Number(raw);
	return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : undefined;
}

interface ShowParse {
	/** True when the user invoked the `show` subcommand (with or without an id). */
	readonly isShow: boolean;
	/** Resolved artifact id, if any. */
	readonly id?: string;
}

/**
 * Parse the `show` subcommand. Accepts `show <id>`, `show '<id>'` (quoted),
 * `show --id <id>`, `show --id=<id>`, and the `show=<id>` shorthand.
 * Returns `isShow: true` (with no id) for a bare `show` so the caller can show
 * usage instead of falling through to the default status view.
 */
function parseShowArg(args: string | undefined): ShowParse {
	const tokens = tokenizeArgs(args ?? "");
	if (tokens.length === 0) return { isShow: false };
	const head = tokens[0];

	if (head === "show") {
		const { positionals, flags } = parseFlags(tokens.slice(1));
		const id = flags.get("id")?.[0] ?? positionals[0];
		return { isShow: true, id };
	}

	// `show=<id>` shorthand (single token, optional surrounding quotes).
	const shorthand = head.match(/^show=(.*)$/);
	if (shorthand) {
		return { isShow: true, id: stripQuotes(shorthand[1]) || undefined };
	}

	return { isShow: false };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

const OUTPUT_GATE_TOOL_NAMES = ["search_tool_outputs"] as const;

export default function outputGateExtension(pi: ExtensionAPI): void {
	if (featureValue("output-gate", "enabled") === false) return;

	const controller = createController();
	let searchToolActive = false;

	async function syncSearchToolSurface(cwd: string): Promise<void> {
		const surface = featureStringValue("output-gate", "toolSurface", "artifact");
		const active = surface === "always" || (surface === "artifact" && (await readManifest(cwd)).length > 0);
		searchToolActive = active;
		setToolsActive(pi, OUTPUT_GATE_TOOL_NAMES, active);
	}

	// --- search_tool_outputs tool ---
	// IC-273: this tool aggregates stored outputs, so gating its results would
	// re-store them and create a save→search→save cycle. Declare bypass at the
	// registration site so new search/aggregation tools opt out here too.
	registerOutputGateBypassTools(OUTPUT_GATE_TOOL_NAMES);
	const searchToolOutputsParams = Type.Object({
		query: Type.String({ description: "Search query" }),
		artifact: Type.Optional(
			Type.String({ description: "Optional output-gate artifact id" }),
		),
		maxResults: Type.Optional(
			Type.Number({ description: "Maximum matching snippets" }),
		),
		contextLines: Type.Optional(
			Type.Number({ description: "Context lines around each match" }),
		),
		preferRg: Type.Optional(
			Type.Boolean({ description: "Use ripgrep for search (default: true)" }),
		),
		literal: Type.Optional(
			Type.Boolean({
				description: "Treat query as fixed string, not regex (default: true)",
			}),
		),
		caseSensitive: Type.Optional(
			Type.Boolean({ description: "Case-sensitive search (default: false)" }),
		),
	});
	type SearchToolOutputsParams = Static<typeof searchToolOutputsParams>;

	pi.registerTool({
		name: "search_tool_outputs",
		label: "Search Stored Tool Outputs",
		description:
			"Search large tool outputs stored by output-gate and return small snippets.",
		promptSnippet:
			"Search snippets from large tool outputs stored as output-gate artifacts.",
		promptGuidelines: [
			"Use search_tool_outputs with an artifact id from an output-gate stub to retrieve relevant snippets.",
		],
		parameters: searchToolOutputsParams,
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const cwd = ctx?.cwd ?? process.cwd();
			// Type-safe decode: field access is compile-checked (schema↔handler drift
			// becomes a type error) and Convert preserves the legacy String/Number/
			// Boolean coercion for loosely-typed payloads. pi always supplies
			// schema-valid params, and the controller owns the "Query is required."
			// fallback for an empty query — so this handler needs no special-casing.
			const p: SearchToolOutputsParams = parseParams(searchToolOutputsParams, params);
			const text = await controller.search({
				cwd,
				query: p.query,
				artifact: p.artifact,
				maxResults: p.maxResults,
				contextLines: p.contextLines,
				preferRg: p.preferRg,
				literal: p.literal,
				caseSensitive: p.caseSensitive,
			} satisfies SearchToolOutputsInput);
			return textResponse(text);
		},
	});

	// --- output-gate command ---
	pi.registerCommand("output-gate", {
		description: "output-gate artifacts を表示・削除",
		getArgumentCompletions(prefix: string) {
			return ["list", "clear", "stats", "show", "purge", "enable-tools", "disable-tools"]
				.filter((v) => v.startsWith(prefix))
				.map((value) => ({ value, label: value }));
		},
		async handler(args: string | undefined, ctx: ExtensionCommandContext) {
			const cwd = ctx?.cwd ?? process.cwd();
			const arg = args?.trim() ?? "";

			if (arg === "enable-tools") {
				searchToolActive = true;
				setToolsActive(pi, OUTPUT_GATE_TOOL_NAMES, true);
				ctx.ui.notify("output-gate search tools enabled", "info");
				return;
			}

			if (arg === "disable-tools") {
				searchToolActive = false;
				setToolsActive(pi, OUTPUT_GATE_TOOL_NAMES, false);
				ctx.ui.notify("output-gate search tools disabled", "info");
				return;
			}

			// show <artifactId> | show '<id>' | show --id <id> | show --id=<id> | show=<id>
			const show = parseShowArg(arg);
			if (show.isShow) {
				if (show.id) {
					ctx?.ui?.notify?.(await controller.show(cwd, show.id), "info");
				} else {
					ctx?.ui?.notify?.(
						"Usage: output-gate show <artifactId> | show --id <id> | show --id=<id> | show=<id>",
						"info",
					);
				}
				return;
			}

			if (arg === "clear") {
				await handleClear(ctx, "output-gate artifacts", outputGateDir(cwd), async () => {
					await fsp.rm(outputGateDir(cwd), { recursive: true, force: true });
				});
				await syncSearchToolSurface(cwd);
				return;
			}

			if (arg === "stats") {
				ctx.ui.notify(await controller.stats(cwd), "info");
				return;
			}

			if (arg === "list") {
				ctx.ui.notify(await controller.list(cwd), "info");
				return;
			}

			if (arg.startsWith("purge")) {
				const keep =
					parseKeepArg(arg) ??
					(Number(featureConfig("output-gate").artifactRetentionMaxFiles) ||
					MEKANN_OUTPUT_GATE_DEFAULTS.artifactRetentionMaxFiles);
				ctx.ui.notify(await controller.purge(cwd, keep), "info");
				await syncSearchToolSurface(cwd);
				return;
			}

			// default: status
			ctx.ui.notify(await controller.status(cwd), "info");
		},
	});

	// --- tool_result hook ---
	// pi attaches extra runtime fields (cwd/branchId/name on the event;
	// sessionId/turnId/branchId on ctx) that the SDK types do not yet model.
	// Narrow them with precise types instead of `any` so a future schema change
	// still surfaces. See #155 for SDK-typing follow-up.
	type ToolResultEventRuntime = ToolResultEvent & { cwd?: string; branchId?: string };
	type ToolResultCtxRuntime = ExtensionContext & { sessionId?: string; turnId?: string; branchId?: string };

	pi.on("tool_result", async (event, ctx) => {
		const e = event as ToolResultEventRuntime;
		const c = ctx as ToolResultCtxRuntime;
		const toolName = String(e.toolName);
		const cwd = e.cwd ?? c.cwd ?? process.cwd();

		try {
			const result = await controller.handleToolResult({
				cwd,
				toolName,
				content: e.content,
				details: e.details as Record<string, unknown> | undefined,
				isError: e.isError,
				sessionId: c.sessionId,
				turnId: c.turnId,
				toolCallId: e.toolCallId,
				branchId: c.branchId ?? e.branchId,
			});
			const outputGate = result?.details?.outputGate as { stored?: unknown } | undefined;
			if (outputGate?.stored === true) await syncSearchToolSurface(cwd);
			return result;
		} catch {
			// Fail-open: output-gate must never break or replace the original tool result.
			return undefined;
		}
	});

	pi.on("session_start", async (_event, ctx) => {
		await syncSearchToolSurface(ctx?.cwd ?? process.cwd());
	});

	pi.on("session_shutdown", async () => {
		if (searchToolActive) setToolsActive(pi, OUTPUT_GATE_TOOL_NAMES, false);
		searchToolActive = false;
	});
}
