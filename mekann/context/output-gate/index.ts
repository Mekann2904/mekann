import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import * as fsp from "node:fs/promises";
import { MEKANN_OUTPUT_GATE_DEFAULTS } from "../../config.js";
import { gateTextForLlm, outputGateDir, manifestPath, readManifest, resolveArtifactPath, shouldGateOutput } from "./store.js";
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

async function outputGateStats(cwd: string): Promise<string> {
	const entries = await readManifest(cwd);
	if (entries.length === 0) return "No stored tool outputs.";
	const totalBytes = entries.reduce((sum, e) => sum + e.bytes, 0);
	const totalLines = entries.reduce((sum, e) => sum + e.lines, 0);
	const byTool = new Map<string, number>();
	for (const e of entries) byTool.set(e.toolName, (byTool.get(e.toolName) ?? 0) + 1);
	const toolBreakdown = [...byTool.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => `  ${name}: ${count}`).join("\n");
	const oldest = new Date(Math.min(...entries.map((e) => e.createdAt))).toISOString();
	const newest = new Date(Math.max(...entries.map((e) => e.createdAt))).toISOString();
	return [
		`output-gate stats`,
		`  artifacts: ${entries.length}`,
		`  total bytes: ${totalBytes}`,
		`  total lines: ${totalLines}`,
		`  retention max: ${MEKANN_OUTPUT_GATE_DEFAULTS.artifactRetentionMaxFiles}`,
		`  oldest: ${oldest}`,
		`  newest: ${newest}`,
		`by tool:`,
		toolBreakdown,
		`manifest: ${manifestPath(cwd)}`,
	].join("\n");
}

async function outputGateShow(cwd: string, artifactId: string): Promise<string> {
	const entries = await readManifest(cwd);
	const entry = entries.find((e) => e.id === artifactId);
	if (!entry) return `Artifact not found: ${artifactId}`;
	const abs = resolveArtifactPath(cwd, entry);
	const lines: string[] = [
		`id: ${entry.id}`,
		`tool: ${entry.toolName}`,
		`bytes: ${entry.bytes}`,
		`lines: ${entry.lines}`,
		`sha256: ${entry.sha256}`,
		`created: ${new Date(entry.createdAt).toISOString()}`,
		`path: ${entry.path}`,
		`redacted: ${entry.redacted}`,
	];
	if (abs) lines.push(`file: ${abs}`, `file exists: true`);
	else lines.push(`file exists: false`);
	return lines.join("\n");
}

async function outputGatePurge(cwd: string, keep: number): Promise<string> {
	const entries = await readManifest(cwd);
	if (entries.length <= keep) return `Only ${entries.length} artifacts, nothing to purge (keep=${keep}).`;
	const sorted = [...entries].sort((a, b) => b.createdAt - a.createdAt);
	const toRemove = sorted.slice(keep);
	let removed = 0;
	for (const entry of toRemove) {
		const abs = resolveArtifactPath(cwd, entry);
		if (abs) {
			try { await fsp.unlink(abs); removed++; } catch { /* ignore */ }
		}
	}
	// Rewrite manifest with kept entries only
	const kept = sorted.slice(0, keep);
	await fsp.writeFile(manifestPath(cwd), kept.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
	return `Purged ${removed} artifacts. Kept ${kept.length} (most recent).`;
}

function parseKeepArg(args: string | undefined): number | undefined {
	const match = args?.match(/--keep\s+(\d+)/);
	return match ? parseInt(match[1], 10) : undefined;
}

function parseShowArg(args: string | undefined): string | undefined {
	const trimmed = args?.trim() ?? "";
	if (trimmed.startsWith("show ")) return trimmed.slice(5).trim();
	return undefined;
}

export default function outputGateExtension(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "search_tool_outputs",
		label: "Search Stored Tool Outputs",
		description: "Search large tool outputs stored by output-gate and return small snippets.",
		promptSnippet: "Search snippets from large tool outputs stored as output-gate artifacts.",
		promptGuidelines: ["Use search_tool_outputs with an artifact id from an output-gate stub to retrieve relevant snippets."],
		parameters: Type.Object({
			query: Type.String({ description: "Search query" }),
			artifact: Type.Optional(Type.String({ description: "Optional output-gate artifact id" })),
			maxResults: Type.Optional(Type.Number({ description: "Maximum matching snippets" })),
			contextLines: Type.Optional(Type.Number({ description: "Context lines around each match" })),
			preferRg: Type.Optional(Type.Boolean({ description: "Use ripgrep for search (default: true)" })),
			literal: Type.Optional(Type.Boolean({ description: "Treat query as fixed string, not regex (default: true)" })),
			caseSensitive: Type.Optional(Type.Boolean({ description: "Case-sensitive search (default: false)" })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const cwd = ctx?.cwd ?? process.cwd();
			const text = await searchToolOutputs({
				cwd,
				query: String((params as any).query ?? ""),
				artifact: (params as any).artifact ? String((params as any).artifact) : undefined,
				maxResults: (params as any).maxResults === undefined ? undefined : Number((params as any).maxResults),
				contextLines: (params as any).contextLines === undefined ? undefined : Number((params as any).contextLines),
				preferRg: (params as any).preferRg === undefined ? undefined : Boolean((params as any).preferRg),
				literal: (params as any).literal === undefined ? undefined : Boolean((params as any).literal),
				caseSensitive: (params as any).caseSensitive === undefined ? undefined : Boolean((params as any).caseSensitive),
			});
			return { content: [{ type: "text", text }], details: {} };
		},
	});

	pi.registerCommand("output-gate", {
		description: "output-gate artifacts を表示・削除",
		getArgumentCompletions(prefix: string) {
			return ["list", "clear", "stats", "show", "purge"].filter((v) => v.startsWith(prefix)).map((value) => ({ value, label: value }));
		},
		async handler(args: string | undefined, ctx: any) {
			const cwd = ctx?.cwd ?? process.cwd();
			const arg = args?.trim() ?? "";

			// show <artifactId>
			const showId = parseShowArg(arg);
			if (showId) {
				const message = await outputGateShow(cwd, showId);
				ctx?.ui?.notify?.(message, "info");
				return;
			}

			if (arg === "clear") {
				const ok = await ctx?.ui?.confirm?.("Clear output-gate artifacts?", `Delete ${outputGateDir(cwd)} ?`);
				if (ok === false) return;
				await fsp.rm(outputGateDir(cwd), { recursive: true, force: true });
				ctx?.ui?.notify?.("output-gate artifacts cleared", "info");
				return;
			}

			if (arg === "stats") {
				ctx?.ui?.notify?.(await outputGateStats(cwd), "info");
				return;
			}

			if (arg === "list") {
				ctx?.ui?.notify?.(await outputGateList(cwd), "info");
				return;
			}

			if (arg.startsWith("purge")) {
				const keep = parseKeepArg(arg) ?? MEKANN_OUTPUT_GATE_DEFAULTS.artifactRetentionMaxFiles;
				const message = await outputGatePurge(cwd, keep);
				ctx?.ui?.notify?.(message, "info");
				return;
			}

			// default: status
			ctx?.ui?.notify?.(await outputGateStatus(cwd), "info");
		},
	});

	pi.on("tool_result", async (event: any, ctx: any) => {
		const toolName = String(event?.toolName ?? event?.name ?? "tool");
		if (toolName === "search_tool_outputs") return undefined;
		const text = extractTextContent(event?.content);
		if (!shouldGateOutput(text, { toolName, maxInlineBytes: MEKANN_OUTPUT_GATE_DEFAULTS.maxInlineBytes })) return undefined;
		const cwd = event?.cwd ?? ctx?.cwd ?? process.cwd();
		const gated = await gateTextForLlm({ cwd, toolName, text, source: { kind: "tool_result", toolName }, maxInlineBytes: MEKANN_OUTPUT_GATE_DEFAULTS.maxInlineBytes, previewBytes: MEKANN_OUTPUT_GATE_DEFAULTS.previewBytes, sessionId: ctx?.sessionId, turnId: ctx?.turnId, toolCallId: event?.toolCallId });
		if (!gated.handled) return undefined;
		return {
			content: [{ type: "text", text: gated.text }],
			...(typeof event?.isError === "boolean" ? { isError: event.isError } : {}),
			details: {
				...(event?.details ?? {}),
				outputGate: gated.gated ? {
					stored: true,
					artifactId: gated.artifactId,
					bytes: gated.originalBytes,
					lines: gated.originalLines,
					sha256: gated.sha256,
					redacted: true,
				} : {
					stored: false,
					bytes: gated.originalBytes,
					lines: gated.originalLines,
					redacted: true,
					storageError: gated.storageError,
				},
			},
		};
	});
}
