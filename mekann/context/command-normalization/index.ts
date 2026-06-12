import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { featureBooleanValue } from "../../settings/enabled.js";
import { classifyBashCommand, normalizeBashCommand, type CommandNormalizationKind } from "./command.js";
import { normalizeGrepLikeCommand } from "./grep.js";
import { appendNormalizationRecord, type NormalizationRecord } from "./recording.js";

type NormalizationPlan = { record: NormalizationRecord };
const normalizationPlans = new Map<string, NormalizationPlan>();

function textContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return (content as Array<any>).filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n");
}

const FEATURE = "command-normalization";

export default function commandNormalization(pi: ExtensionAPI): void {
	pi.on("tool_call", async (event: any, ctx: any) => {
		try {
			if (!featureBooleanValue(FEATURE, "bashEnabled", true, ctx?.cwd)) return;
			if (!isToolCallEventType("bash", event)) return;
			const command = event?.input?.command;
			if (typeof command !== "string") return;
			const kind = classifyBashCommand(command);
			if (!kind) return;

			const normalized = kind === "grep" ? normalizeGrepLikeCommand(command) : normalizeBashCommand(command, kind);
			if (normalized && normalized !== command) event.input.command = normalized;
			const id = (event as any).toolCallId ?? (event as any).id;
			const effectiveCommand = normalized ?? command;
			const recordEnabled = featureBooleanValue(FEATURE, "recordNormalization", false, ctx?.cwd);
			if (!recordEnabled) return;
			const record = {
				version: 1 as const,
				timestamp: new Date().toISOString(),
				...(typeof id === "string" ? { toolCallId: id } : {}),
				kind,
				cwd: ctx?.cwd ?? process.cwd(),
				originalCommand: command,
				normalizedCommand: effectiveCommand,
				changed: effectiveCommand !== command,
			};
			if (typeof id === "string") normalizationPlans.set(id, { record });
		} catch {
			// Fail open: command-normalization must never block tool execution.
		}
	});

	pi.on("tool_result", async (event: any, ctx: any) => {
		try {
			const id = event?.toolCallId;
			const plan = typeof id === "string" ? normalizationPlans.get(id) : undefined;
			if (typeof id === "string") normalizationPlans.delete(id);
			if (!plan) return undefined;

			const text = textContent(event?.content);
			await appendNormalizationRecord(ctx?.cwd ?? process.cwd(), {
				...plan.record,
				result: {
					outputBytes: Buffer.byteLength(text),
					...(typeof event?.isError === "boolean" ? { isError: event.isError } : {}),
				},
			});
			return undefined;
		} catch {
			return undefined;
		}
	});
}
