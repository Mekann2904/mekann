import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { featureBooleanValue } from "../../settings/enabled.js";
import { classifyBashCommand, normalizeBashCommand, type OutputBudgetKind } from "./command.js";
import { normalizeGrepLikeCommand } from "./grep.js";
import { appendNormalizationRecord, type NormalizationRecord } from "./recording.js";

type OutputPlan = { kind: OutputBudgetKind; command: string; originalCommand: string; record?: NormalizationRecord };
const plans = new Map<string, OutputPlan>();

function textContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return (content as Array<any>).filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n");
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
			const id = event?.toolCallId;
			const plan = typeof id === "string" ? plans.get(id) : undefined;
			if (typeof id === "string") plans.delete(id);
			if (!plan?.record) return undefined;

			const text = textContent(event?.content);
			await appendNormalizationRecord(ctx?.cwd ?? process.cwd(), {
				...plan.record,
				result: {
					originalBytes: Buffer.byteLength(text),
					compacted: false,
					...(typeof event?.isError === "boolean" ? { isError: event.isError } : {}),
				},
			});
			return undefined;
		} catch {
			return undefined;
		}
	});
}
