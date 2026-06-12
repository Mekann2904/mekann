import type { RunKeySource, CacheFriendlyRequestRole } from "../prompt-core/index.js";

function pickString(...values: unknown[]): string | undefined {
	for (const value of values)
		if (typeof value === "string" && value.trim()) return value.trim();
	return undefined;
}

export function contextCwd(event: any, ctx: any): string {
	return event?.systemPromptOptions?.cwd ?? ctx?.cwd ?? process.cwd();
}

export function modelProvider(ctx: any): string | undefined {
	return ctx?.model?.provider;
}

export function modelId(ctx: any): string | undefined {
	return ctx?.model?.id;
}

export function requestIdOf(event: any, ctx: any): string | undefined {
	return pickString(
		event?.requestId,
		event?.request_id,
		event?.id,
		event?.message?.requestId,
		event?.message?.request_id,
		event?.response?.requestId,
		event?.response?.id,
		ctx?.requestId,
		ctx?.request_id,
	);
}

export function runKeyWithSource(event: any, ctx: any): {
	runKey: string;
	runKeySource: RunKeySource;
} {
	const candidates: Array<[RunKeySource, unknown]> = [
		["sessionId", event?.sessionId ?? ctx?.sessionId],
		["conversationId", event?.conversationId ?? ctx?.conversationId],
		["session.id", event?.session?.id ?? ctx?.session?.id],
		["runId", event?.runId ?? ctx?.runId],
		["cwd", ctx?.cwd ?? event?.systemPromptOptions?.cwd],
	];
	for (const [source, value] of candidates) {
		const key = pickString(value);
		if (key) return { runKey: key, runKeySource: source };
	}
	return { runKey: "default", runKeySource: "default" };
}

export function requestRoleOf(
	event: any,
	ctx: any,
): { requestRole: CacheFriendlyRequestRole; requestRoleSource: string } {
	const envRole = pickString(process.env.PI_SUBAGENT_ROLE);
	if (envRole === "child") return { requestRole: "subagent", requestRoleSource: "env:PI_SUBAGENT_ROLE" };

	const explicit = pickString(event?.requestRole, event?.role, event?.agentRole, ctx?.requestRole, ctx?.role, ctx?.agentRole);
	if (explicit) {
		const normalized = explicit.toLowerCase();
		if (normalized.includes("subagent") || normalized.includes("sub-agent") || normalized === "child") return { requestRole: "subagent", requestRoleSource: `explicit:${explicit}` };
		if (normalized.includes("tool")) return { requestRole: "tool", requestRoleSource: `explicit:${explicit}` };
		if (normalized.includes("main") || normalized === "root") return { requestRole: "main", requestRoleSource: `explicit:${explicit}` };
	}

	const agentPath = pickString(event?.agentPath, event?.agent_path, event?.agent?.path, ctx?.agentPath, ctx?.agent_path, ctx?.agent?.path);
	if (agentPath) {
		if (agentPath === "/root" || agentPath === "root") return { requestRole: "main", requestRoleSource: "agentPath" };
		if (agentPath.startsWith("/root/") || agentPath.includes("subagent")) return { requestRole: "subagent", requestRoleSource: "agentPath" };
	}

	const taskName = pickString(event?.taskName, event?.task_name, ctx?.taskName, ctx?.task_name);
	if (taskName) return { requestRole: "subagent", requestRoleSource: "taskName" };

	return { requestRole: "main", requestRoleSource: "default:root-process" };
}

export function messageTimestamp(message: any): string {
	const timestamp = message?.timestamp;
	if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
		const ms = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
		return new Date(ms).toISOString();
	}
	if (typeof timestamp === "string" && timestamp.trim()) {
		const ms = Date.parse(timestamp);
		if (Number.isFinite(ms)) return new Date(ms).toISOString();
	}
	return new Date().toISOString();
}

export function actualUsageKey(
	event: any,
	ctx: any,
	message: any,
	normalized: { inputTotalTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens?: number; cacheMissTokens?: number },
): string | null {
	const requestId = requestIdOf(event, ctx);
	const messageId = pickString(message?.id, event?.messageId, event?.id);
	const timestamp = message?.timestamp;
	if (!requestId && !messageId && timestamp === undefined) return null;
	const { runKey } = runKeyWithSource(event, ctx);
	return [
		ctx?.cwd ?? "",
		runKey,
		requestId ?? "",
		messageId ?? "",
		timestamp ?? "",
		normalized.inputTotalTokens,
		normalized.outputTokens,
		normalized.cacheReadTokens,
		normalized.cacheWriteTokens ?? "",
		normalized.cacheMissTokens ?? "",
	].join(":");
}

export { pickString };
