/**
 * OutputGateController — deep module for output-gate use-cases.
 *
 * Owns gating, storage, status/list/stats/show/purge, search delegation,
 * and context-ledger recording seam. No Pi framework imports.
 */

import * as fsp from "node:fs/promises";
import {
	gateTextForLlm,
	manifestPath,
	outputGateDir,
	readManifest,
	resolveArtifactPath,
	shouldGateOutput,
} from "./store.js";
import { searchToolOutputs, type SearchToolOutputsInput } from "./search.js";
import type { RecordToolOutputArtifactInput } from "../recording.js";

// ---------------------------------------------------------------------------
// Config (injected)
// ---------------------------------------------------------------------------

export interface OutputGateControllerConfig {
	maxInlineBytes: number;
	previewBytes: number;
	artifactRetentionMaxFiles: number;
}

// ---------------------------------------------------------------------------
// Tool result input / output
// ---------------------------------------------------------------------------

export interface ToolResultInput {
	cwd: string;
	toolName: string;
	content: unknown;
	details?: Record<string, unknown>;
	isError?: boolean;
	sessionId?: string;
	turnId?: string;
	toolCallId?: string;
	branchId?: string;
}

export interface ToolResultOutput {
	content: Array<{ type: "text"; text: string }>;
	details: Record<string, unknown>;
	isError?: boolean;
}

// ---------------------------------------------------------------------------
// Recorder seam (context-ledger)
// ---------------------------------------------------------------------------

export interface OutputGateRecorder {
	recordToolOutputArtifact(input: RecordToolOutputArtifactInput): Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const IGNORED_TOOLS = new Set([
	"search_tool_outputs",
	"search_context_events",
	"summarize_session_context",
]);

export function extractTextContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return (content as Array<any>)
		.filter((part) => part?.type === "text" && typeof part.text === "string")
		.map((part) => part.text)
		.join("\n");
}

export function hasExistingOutputGateDetails(details: Record<string, unknown> | undefined): boolean {
	if (!details) return false;
	const value = details.outputGate;
	return !!value && typeof value === "object";
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export class OutputGateController {
	private readonly config: OutputGateControllerConfig;
	private readonly recorder: OutputGateRecorder | undefined;

	constructor(options: {
		config: OutputGateControllerConfig;
		recorder?: OutputGateRecorder;
	}) {
		this.config = options.config;
		this.recorder = options.recorder;
	}

	// -----------------------------------------------------------------------
	// Tool result gating + recording
	// -----------------------------------------------------------------------

	async handleToolResult(
		input: ToolResultInput,
	): Promise<ToolResultOutput | undefined> {
		const toolName = input.toolName;
		if (IGNORED_TOOLS.has(toolName)) return undefined;
		if (hasExistingOutputGateDetails(input.details)) return undefined;

		const text = extractTextContent(input.content);
		if (!shouldGateOutput(text, { toolName, maxInlineBytes: this.config.maxInlineBytes }))
			return undefined;

		const gated = await gateTextForLlm({
			cwd: input.cwd,
			toolName,
			text,
			source: { kind: "tool_result", toolName },
			maxInlineBytes: this.config.maxInlineBytes,
			previewBytes: this.config.previewBytes,
			sessionId: input.sessionId,
			turnId: input.turnId,
			toolCallId: input.toolCallId,
			branchId: input.branchId,
		});

		if (!gated.handled) return undefined;

		// Best-effort ledger recording: only when artifact was stored successfully.
		if (gated.gated && gated.artifactId && this.recorder) {
			await this.recordGatedOutput(input, {
				artifactId: gated.artifactId,
				originalBytes: gated.originalBytes,
				originalLines: gated.originalLines,
			});
		}

		return {
			content: [{ type: "text", text: gated.text }],
			...(typeof input.isError === "boolean" ? { isError: input.isError } : {}),
			details: {
				...(input.details ?? {}),
				outputGate: gated.gated
					? {
							stored: true,
							artifactId: gated.artifactId,
							bytes: gated.originalBytes,
							lines: gated.originalLines,
							sha256: gated.sha256,
							redacted: true,
						}
					: {
							stored: false,
							bytes: gated.originalBytes,
							lines: gated.originalLines,
							redacted: true,
							storageError: gated.storageError,
						},
			},
		};
	}

	private async recordGatedOutput(
		input: ToolResultInput,
		gated: { artifactId: string; originalBytes: number; originalLines: number },
	): Promise<void> {
		try {
			await this.recorder!.recordToolOutputArtifact({
				cwd: input.cwd,
				toolName: input.toolName,
				artifactId: gated.artifactId,
				originalBytes: gated.originalBytes,
				originalLines: gated.originalLines,
				isError: input.isError,
				sessionId: input.sessionId,
				turnId: input.turnId,
				toolCallId: input.toolCallId,
				branchId: input.branchId,
			});
		} catch {
			// Best-effort: ledger recording must not break output-gate.
		}
	}

	// -----------------------------------------------------------------------
	// Status / List / Stats / Show / Purge
	// -----------------------------------------------------------------------

	async status(cwd: string): Promise<string> {
		const entries = await readManifest(cwd);
		const totalBytes = entries.reduce((sum, e) => sum + e.bytes, 0);
		return [
			`output-gate artifacts: ${entries.length}`,
			`total bytes: ${totalBytes}`,
			`manifest: ${manifestPath(cwd)}`,
		].join("\n");
	}

	async list(cwd: string): Promise<string> {
		const entries = (await readManifest(cwd))
			.sort((a, b) => b.createdAt - a.createdAt)
			.slice(0, 20);
		if (entries.length === 0) return "No stored tool outputs.";
		return entries
			.map(
				(e) =>
					`${e.id}\t${e.toolName}\t${e.bytes} bytes\t${new Date(e.createdAt).toISOString()}\t${e.path}`,
			)
			.join("\n");
	}

	async stats(cwd: string): Promise<string> {
		const entries = await readManifest(cwd);
		if (entries.length === 0) return "No stored tool outputs.";
		const totalBytes = entries.reduce((sum, e) => sum + e.bytes, 0);
		const totalLines = entries.reduce((sum, e) => sum + e.lines, 0);
		const byTool = new Map<string, number>();
		for (const e of entries) byTool.set(e.toolName, (byTool.get(e.toolName) ?? 0) + 1);
		const toolBreakdown = [...byTool.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([name, count]) => `  ${name}: ${count}`)
			.join("\n");
		const oldest = new Date(Math.min(...entries.map((e) => e.createdAt))).toISOString();
		const newest = new Date(Math.max(...entries.map((e) => e.createdAt))).toISOString();
		return [
			`output-gate stats`,
			`  artifacts: ${entries.length}`,
			`  total bytes: ${totalBytes}`,
			`  total lines: ${totalLines}`,
			`  retention max: ${this.config.artifactRetentionMaxFiles}`,
			`  oldest: ${oldest}`,
			`  newest: ${newest}`,
			`by tool:`,
			toolBreakdown,
			`manifest: ${manifestPath(cwd)}`,
		].join("\n");
	}

	async show(cwd: string, artifactId: string): Promise<string> {
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
		if (entry.schemaVersion) lines.push(`schemaVersion: ${entry.schemaVersion}`);
		if (entry.redactionVersion != null) lines.push(`redactionVersion: ${entry.redactionVersion}`);
		if (entry.contentType) lines.push(`contentType: ${entry.contentType}`);
		if (entry.omittedBytes != null) lines.push(`omittedBytes: ${entry.omittedBytes}`);
		if (entry.retrievalHints?.length) lines.push(`retrievalHints: ${entry.retrievalHints.join(", ")}`);
		if (entry.originalBytes != null) lines.push(`originalBytes: ${entry.originalBytes}`);
		if (entry.originalLines != null) lines.push(`originalLines: ${entry.originalLines}`);
		if (entry.sessionId) lines.push(`sessionId: ${entry.sessionId}`);
		if (entry.turnId) lines.push(`turnId: ${entry.turnId}`);
		if (entry.toolCallId) lines.push(`toolCallId: ${entry.toolCallId}`);
		if (entry.branchId) lines.push(`branchId: ${entry.branchId}`);
		if (entry.commandHash) lines.push(`commandHash: ${entry.commandHash}`);
		if (abs) lines.push(`file: ${abs}`, `file exists: true`);
		else lines.push(`file exists: false`);
		return lines.join("\n");
	}

	async purge(cwd: string, keep?: number): Promise<string> {
		const keepCount = keep ?? this.config.artifactRetentionMaxFiles;
		const entries = await readManifest(cwd);
		if (entries.length <= keepCount)
			return `Only ${entries.length} artifacts, nothing to purge (keep=${keepCount}).`;
		const sorted = [...entries].sort((a, b) => b.createdAt - a.createdAt);
		const toRemove = sorted.slice(keepCount);
		let removed = 0;
		for (const entry of toRemove) {
			const abs = resolveArtifactPath(cwd, entry);
			if (abs) {
				try {
					await fsp.unlink(abs);
					removed++;
				} catch {
					/* ignore */
				}
			}
		}
		// Rewrite manifest with kept entries only
		const kept = sorted.slice(0, keepCount);
		await fsp.writeFile(
			manifestPath(cwd),
			kept.map((e) => JSON.stringify(e)).join("\n") + "\n",
			"utf8",
		);
		return `Purged ${removed} artifacts. Kept ${kept.length} (most recent).`;
	}

	// -----------------------------------------------------------------------
	// Search
	// -----------------------------------------------------------------------

	async search(input: SearchToolOutputsInput): Promise<string> {
		return searchToolOutputs(input);
	}
}
