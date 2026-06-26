/**
 * output-gate — Pi tool/command/hook registration entry point.
 *
 * Thin adapter: builds OutputGateController from config, delegates all
 * use-cases, and converts between Pi event types and controller I/O.
 */

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, ToolResultEvent } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { parseParams } from "../../tool-params.js";
import * as fsp from "node:fs/promises";
import { MEKANN_OUTPUT_GATE_DEFAULTS } from "../../config.js";
import { featureConfig, featureValue } from "../../settings/featureConfig.js";
import { featureStringValue } from "../../settings/enabled.js";
import { setToolsActive } from "../../settings/toolSurface.js";
import { outputGateDir, readManifest } from "./store.js";
import { handleClear } from "../clear.js";
import { recordToolOutputArtifact } from "../recording.js";
import { OutputGateController } from "./controller.js";
import type { SearchToolOutputsInput } from "./search.js";

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
	const match = args?.match(/--keep\s+(\d+)/);
	return match ? parseInt(match[1], 10) : undefined;
}

function parseShowArg(args: string | undefined): string | undefined {
	const trimmed = args?.trim() ?? "";
	if (trimmed.startsWith("show ")) return trimmed.slice(5).trim();
	return undefined;
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
	const searchToolOutputsParams = Type.Object({
		query: Type.String({ description: "Search query" }),
		artifact: Type.Optional(Type.String({ description: "Optional output-gate artifact id" })),
		maxResults: Type.Optional(Type.Number({ description: "Maximum matching snippets" })),
		contextLines: Type.Optional(Type.Number({ description: "Context lines around each match" })),
		preferRg: Type.Optional(Type.Boolean({ description: "Use ripgrep for search (default: true)" })),
		literal: Type.Optional(Type.Boolean({ description: "Treat query as fixed string, not regex (default: true)" })),
		caseSensitive: Type.Optional(Type.Boolean({ description: "Case-sensitive search (default: false)" })),
	});

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
			const p = parseParams(searchToolOutputsParams, params);
			const text = await controller.search({ cwd, ...p } satisfies SearchToolOutputsInput);
			return textResponse(text, { source: "output-gate", query: p.query, artifact: p.artifact });
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
		async handler(args: string, ctx: ExtensionCommandContext) {
			const cwd = ctx.cwd;
			const arg = (args ?? "").trim();

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

			// show <artifactId>
			const showId = parseShowArg(arg);
			if (showId) {
				ctx.ui.notify(await controller.show(cwd, showId), "info");
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
	pi.on("tool_result", async (event: ToolResultEvent, ctx: ExtensionContext) => {
		const toolName = event.toolName;
		const cwd = ctx.cwd;

		try {
			const result = await controller.handleToolResult({
				cwd,
				toolName,
				content: event.content,
				details: asRecord(event.details),
				isError: event.isError,
				toolCallId: event.toolCallId,
			});
			if (isOutputGateStored(result?.details)) await syncSearchToolSurface(cwd);
			return result;
		} catch {
			// Fail-open: output-gate must never break or replace the original tool result.
			return undefined;
		}
	});

	pi.on("session_start", async (_event, ctx: ExtensionContext) => {
		await syncSearchToolSurface(ctx.cwd ?? process.cwd());
	});

	pi.on("session_shutdown", async () => {
		if (searchToolActive) setToolsActive(pi, OUTPUT_GATE_TOOL_NAMES, false);
		searchToolActive = false;
	});
}
