import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { featureBooleanValue } from "../../settings/enabled.js";
import { classifyBashCommand, normalizeBashCommand, type CommandNormalizationKind } from "./command.js";
import { normalizeGrepLikeCommand } from "./grep.js";
import { appendNormalizationRecord, type NormalizationRecord } from "./recording.js";

type NormalizationPlan = { record: NormalizationRecord };

/**
 * Pending normalization plans, scoped by session boundary so that plans from
 * different sessions (or cwds) never collide on `toolCallId` and never leak
 * across `session_shutdown`.
 *
 * Outer key: session scope (`sessionId\0cwd`). Inner key: `toolCallId`.
 */
const plansBySession = new Map<string, Map<string, NormalizationPlan>>();

/** Maximum pending plans retained per session. Bounds memory when a `tool_result` never arrives. */
const MAX_PENDING_PLANS_PER_SESSION = 1000;

/** Sentinel used when session/cwd identifiers are unavailable so plans are still grouped consistently. */
const NO_SCOPE = "__no-scope__";

/**
 * Compute a stable session scope key from the handler context. Reads
 * `ctx.sessionManager.getSessionId()` and `ctx.cwd`; degrades to a sentinel
 * when either is missing rather than throwing, to preserve fail-open behaviour.
 */
function sessionScope(ctx: any): string {
	try {
		const sessionId = ctx?.sessionManager?.getSessionId?.();
		const cwd = typeof ctx?.cwd === "string" ? ctx.cwd : undefined;
		const sessionPart = typeof sessionId === "string" && sessionId.length > 0 ? sessionId : NO_SCOPE;
		const cwdPart = typeof cwd === "string" && cwd.length > 0 ? cwd : NO_SCOPE;
		return `${sessionPart}\0${cwdPart}`;
	} catch {
		return `${NO_SCOPE}\0${NO_SCOPE}`;
	}
}

function plansForSession(scope: string): Map<string, NormalizationPlan> {
	let plans = plansBySession.get(scope);
	if (!plans) {
		plans = new Map();
		plansBySession.set(scope, plans);
	}
	return plans;
}

function rememberPlan(scope: string, toolCallId: string, plan: NormalizationPlan): void {
	const plans = plansForSession(scope);
	// Bound pending state per session so missed `tool_result`s cannot accumulate unboundedly.
	if (plans.size >= MAX_PENDING_PLANS_PER_SESSION) {
		// Evict the oldest entry (Map preserves insertion order).
		const oldest = plans.keys().next();
		if (!oldest.done && typeof oldest.value === "string") plans.delete(oldest.value);
	}
	plans.set(toolCallId, plan);
}

function takePlan(scope: string, toolCallId: string): NormalizationPlan | undefined {
	const plans = plansBySession.get(scope);
	if (!plans) return undefined;
	const plan = plans.get(toolCallId);
	if (plan) plans.delete(toolCallId);
	// Drop the session bucket once empty so long-running processes do not retain stale scopes.
	if (plans.size === 0) plansBySession.delete(scope);
	return plan;
}

function forgetSession(scope: string): void {
	plansBySession.delete(scope);
}

type TextPart = { type: "text"; text: string };

function isTextPart(part: unknown): part is TextPart {
	return typeof part === "object" && part !== null && (part as { type?: unknown }).type === "text" && typeof (part as { text?: unknown }).text === "string";
}

function textContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content.filter(isTextPart).map((part) => part.text).join("\n");
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
			const recordEnabled = featureBooleanValue(FEATURE, "recordNormalization", false, ctx?.cwd);
			if (!recordEnabled) return;

			const id = (event as any).toolCallId ?? (event as any).id;
			if (typeof id !== "string") return;
			const effectiveCommand = normalized ?? command;
			const record: NormalizationRecord = {
				version: 1,
				timestamp: new Date().toISOString(),
				toolCallId: id,
				kind,
				cwd: ctx?.cwd ?? process.cwd(),
				originalCommand: command,
				normalizedCommand: effectiveCommand,
				changed: effectiveCommand !== command,
			};
			rememberPlan(sessionScope(ctx), id, { record });
		} catch {
			// Fail open: command-normalization must never block tool execution.
		}
	});

	pi.on("tool_result", async (event: any, ctx: any) => {
		try {
			const id = event?.toolCallId;
			if (typeof id !== "string") return undefined;
			const plan = takePlan(sessionScope(ctx), id);
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

	pi.on("session_shutdown", async (_event: any, ctx: any) => {
		try {
			forgetSession(sessionScope(ctx));
		} catch {
			// Fail open: cleanup must never throw during shutdown.
		}
	});
}
