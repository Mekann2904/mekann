import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { featureBooleanValue, featureRawConfig } from "../../settings/enabled.js";
import { classifyBashCommand, kindForToolResult, normalizeBashCommand } from "./command.js";
import { compactGitOutput, compactListOutput, compactReadOutput, type CompactOptions, type OutputBudgetKind } from "./formatters.js";
import { compactGrepLikeOutput, normalizeGrepLikeCommand } from "./grep.js";
import { appendNormalizationRecord, type NormalizationRecord } from "./recording.js";

type OutputPlan = { kind: OutputBudgetKind; command: string; originalCommand: string; record?: NormalizationRecord };
const plans = new Map<string, OutputPlan>();

function textContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return (content as Array<any>).filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n");
}

function cfgNumber(key: string, fallback: number, cwd?: string): number {
	const value = featureRawConfig("output-budget", cwd)[key];
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function options(cwd?: string): CompactOptions {
	return {
		maxResults: cfgNumber("grepMaxResults", 200, cwd),
		maxPerFile: cfgNumber("grepMaxPerFile", 25, cwd),
		maxLineLength: cfgNumber("maxLineLength", cfgNumber("grepMaxLineLength", 240, cwd), cwd),
		maxLines: cfgNumber("maxLines", 200, cwd),
	};
}

function compact(kind: OutputBudgetKind, text: string, command: string, opts: CompactOptions): string | null {
	if (kind === "grep") return compactGrepLikeOutput(text, command, opts);
	if (kind === "list") return compactListOutput(text, command, opts);
	if (kind === "read") return compactReadOutput(text, command, opts);
	if (kind === "git") return compactGitOutput(text, command, opts);
	return null;
}

export default function outputBudget(pi: ExtensionAPI): void {
	pi.on("tool_call", async (event: any, ctx: any) => {
		try {
			if (!featureBooleanValue("output-budget", "bashEnabled", true, ctx?.cwd)) return;
			if (!isToolCallEventType("bash", event)) return;
			const command = event?.input?.command;
			if (typeof command !== "string") return;
			const kind = classifyBashCommand(command);
			if (!kind) return;

			const normalized = kind === "grep" ? normalizeGrepLikeCommand(command) : normalizeBashCommand(command, kind);
			if (normalized && normalized !== command) event.input.command = normalized;
			const id = (event as any).toolCallId ?? (event as any).id;
			const effectiveCommand = normalized ?? command;
			const recordEnabled = featureBooleanValue("output-budget", "recordNormalization", false, ctx?.cwd);
			const record = recordEnabled ? {
				version: 1 as const,
				timestamp: new Date().toISOString(),
				...(typeof id === "string" ? { toolCallId: id } : {}),
				kind,
				cwd: ctx?.cwd ?? process.cwd(),
				originalCommand: command,
				normalizedCommand: effectiveCommand,
				changed: effectiveCommand !== command,
			} : undefined;
			if (typeof id === "string") plans.set(id, { kind, command: effectiveCommand, originalCommand: command, record });
		} catch {
			// Fail open: output-budget must never block tool execution.
		}
	});

	pi.on("tool_result", async (event: any, ctx: any) => {
		try {
			if (!featureBooleanValue("output-budget", "enabled", true, ctx?.cwd)) return undefined;
			const toolName = String(event?.toolName ?? event?.name ?? "");
			const id = event?.toolCallId;
			const plan = typeof id === "string" ? plans.get(id) : undefined;
			if (typeof id === "string") plans.delete(id);

			const kind = plan?.kind ?? kindForToolResult(toolName);
			if (!kind) return undefined;
			const command = String(event?.input?.command ?? event?.details?.command ?? plan?.command ?? toolName);
			const text = textContent(event?.content);
			if (!text.trim()) return undefined;

			const compactText = compact(kind, text, command, options(ctx?.cwd));
			const originalBytes = Buffer.byteLength(text);
			if (plan?.record) {
				await appendNormalizationRecord(ctx?.cwd ?? process.cwd(), {
					...plan.record,
					result: {
						originalBytes,
						...(compactText ? { compactBytes: Buffer.byteLength(compactText) } : {}),
						compacted: !!compactText && compactText !== text,
						...(typeof event?.isError === "boolean" ? { isError: event.isError } : {}),
					},
				});
			}
			if (!compactText || compactText === text) return undefined;
			return {
				content: [{ type: "text", text: compactText }],
				details: { ...(event?.details ?? {}), outputBudget: { kind, originalBytes, compactBytes: Buffer.byteLength(compactText) } },
				isError: event?.isError,
			};
		} catch {
			return undefined;
		}
	});
}
