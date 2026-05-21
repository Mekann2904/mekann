import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fsp from "node:fs/promises";
import { MEKANN_OUTPUT_GATE_DEFAULTS } from "../../config.js";
import { gateTextForLlm, outputGateDir, manifestPath, readManifest, shouldGateOutput } from "./store.js";
import { searchToolOutputs } from "./search.js";

export { shouldGateOutput, buildStoredOutputStub, buildPreview, gateTextForLlm } from "./store.js";

export function extractTextContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((part: any) => part?.type === "text" && typeof part.text === "string")
		.map((part: any) => part.text)
		.join("\n");
}

async function outputGateStatus(cwd: string): Promise<string> {
	const entries = await readManifest(cwd);
	const totalBytes = entries.reduce((sum, e) => sum + e.bytes, 0);
	return [`output-gate artifacts: ${entries.length}`, `total bytes: ${totalBytes}`, `manifest: ${manifestPath(cwd)}`].join("\n");
}

async function outputGateList(cwd: string): Promise<string> {
	const entries = (await readManifest(cwd)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
	if (entries.length === 0) return "No stored tool outputs.";
	return entries.map((e) => `${e.id}\t${e.toolName}\t${e.bytes} bytes\t${new Date(e.createdAt).toISOString()}\t${e.path}`).join("\n");
}

export default function outputGateExtension(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "search_tool_outputs",
		label: "Search Stored Tool Outputs",
		description: "Search large tool outputs stored by output-gate and return small snippets.",
		promptSnippet: "Search snippets from large tool outputs stored as output-gate artifacts.",
		promptGuidelines: ["Use search_tool_outputs with an artifact id from an output-gate stub to retrieve relevant snippets."],
		parameters: {
			type: "object",
			required: ["query"],
			properties: {
				query: { type: "string", description: "Search query (rg regex when rg is available; substring fallback otherwise)" },
				artifact: { type: "string", description: "Optional output-gate artifact id" },
				maxResults: { type: "number", description: "Maximum matching snippets" },
				contextLines: { type: "number", description: "Context lines around each match" },
			},
		},
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const cwd = ctx?.cwd ?? process.cwd();
			const text = await searchToolOutputs({
				cwd,
				query: String((params as any).query ?? ""),
				artifact: (params as any).artifact ? String((params as any).artifact) : undefined,
				maxResults: (params as any).maxResults === undefined ? undefined : Number((params as any).maxResults),
				contextLines: (params as any).contextLines === undefined ? undefined : Number((params as any).contextLines),
			});
			return { content: [{ type: "text", text }], details: {} };
		},
	});

	pi.registerCommand("output-gate", {
		description: "output-gate artifacts を表示・削除",
		getArgumentCompletions(prefix: string) {
			return ["list", "clear"].filter((v) => v.startsWith(prefix)).map((value) => ({ value, label: value }));
		},
		async handler(args: string | undefined, ctx: any) {
			const cwd = ctx?.cwd ?? process.cwd();
			const arg = args?.trim();
			if (arg === "clear") {
				const ok = await ctx?.ui?.confirm?.("Clear output-gate artifacts?", `Delete ${outputGateDir(cwd)} ?`);
				if (ok === false) return;
				await fsp.rm(outputGateDir(cwd), { recursive: true, force: true });
				ctx?.ui?.notify?.("output-gate artifacts cleared", "info");
				return;
			}
			const message = arg === "list" ? await outputGateList(cwd) : await outputGateStatus(cwd);
			ctx?.ui?.notify?.(message, "info");
		},
	});

	pi.on("tool_result", async (event: any, ctx: any) => {
		const toolName = String(event?.toolName ?? event?.name ?? "tool");
		if (toolName === "search_tool_outputs") return undefined;
		const text = extractTextContent(event?.content);
		if (!shouldGateOutput(text, { toolName, maxInlineBytes: MEKANN_OUTPUT_GATE_DEFAULTS.maxInlineBytes })) return undefined;
		const cwd = event?.cwd ?? ctx?.cwd ?? process.cwd();
		const gated = await gateTextForLlm({ cwd, toolName, text, source: { kind: "tool_result", details: event?.details }, maxInlineBytes: MEKANN_OUTPUT_GATE_DEFAULTS.maxInlineBytes, previewBytes: MEKANN_OUTPUT_GATE_DEFAULTS.previewBytes });
		if (!gated.gated) return undefined;
		return {
			content: [{ type: "text", text: gated.text }],
			isError: event?.isError,
			details: {
				...(event?.details ?? {}),
				outputGate: {
					stored: true,
					artifactId: gated.artifactId,
					bytes: gated.originalBytes,
					lines: gated.originalLines,
					sha256: gated.sha256,
					redacted: true,
				},
			},
		};
	});
}
