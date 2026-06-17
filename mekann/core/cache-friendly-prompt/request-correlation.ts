import type { RunKeySource, CacheFriendlyRequestRole } from "../prompt-core/index.js";

function pickString(...values: unknown[]): string | undefined {
	for (const value of values)
		if (typeof value === "string" && value.trim()) return value.trim();
	return undefined;
}

function pickBoolean(...values: unknown[]): boolean | undefined {
	for (const value of values) {
		if (typeof value === "boolean") return value;
		if (typeof value === "string") {
			const normalized = value.trim().toLowerCase();
			if (normalized === "true") return true;
			if (normalized === "false") return false;
		}
	}
	return undefined;
}

/**
 * Minimal structural view of a snapshot used for snapshot-derived role
 * inference. Kept deliberately small so request-correlation stays decoupled
 * from the full snapshot reducer module. Only the fields actually consumed
 * by `inferRoleFromSnapshot` are declared — do not add speculative fields
 * without wiring them into inference.
 */
export interface RoleInferenceSnapshot {
	runKeySource?: RunKeySource;
	requestRole?: CacheFriendlyRequestRole;
	requestRoleSource?: string;
}

/** True when `source` is one of the weak/default sources that signal a guess. */
function isWeakRoleSource(source: string | undefined): boolean {
	return !source || source === "default:root-process" || source.startsWith("default:") || source === "(none)";
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

	// Explicit role fields emitted by Pi or host integrations.
	const explicit = pickString(
		event?.requestRole,
		event?.role,
		event?.agentRole,
		event?.sessionRole,
		ctx?.requestRole,
		ctx?.role,
		ctx?.agentRole,
		ctx?.sessionRole,
	);
	if (explicit) {
		const normalized = explicit.toLowerCase();
		if (normalized.includes("subagent") || normalized.includes("sub-agent") || normalized === "child") return { requestRole: "subagent", requestRoleSource: `explicit:${explicit}` };
		if (normalized.includes("tool")) return { requestRole: "tool", requestRoleSource: `explicit:${explicit}` };
		if (normalized.includes("main") || normalized === "root") return { requestRole: "main", requestRoleSource: `explicit:${explicit}` };
	}

	// Explicit boolean subagent flag (host integrations that know the truth).
	const isSubagent = pickBoolean(
		event?.isSubagent,
		event?.subagent,
		event?.session?.isSubagent,
		ctx?.isSubagent,
		ctx?.subagent,
		ctx?.session?.isSubagent,
	);
	if (isSubagent === true) return { requestRole: "subagent", requestRoleSource: "explicit:isSubagent" };
	if (isSubagent === false) return { requestRole: "main", requestRoleSource: "explicit:isSubagent" };

	// A session that has a parent session/lineage is a forked or delegated run.
	const parentSession = pickString(
		event?.parentSession,
		event?.parent_session,
		event?.session?.parent,
		event?.session?.parentSession,
		event?.parent,
		ctx?.parentSession,
		ctx?.parent_session,
		ctx?.session?.parent,
		ctx?.session?.parentSession,
		ctx?.parent,
	);
	if (parentSession) return { requestRole: "subagent", requestRoleSource: "parentSession" };

	const agentPath = pickString(
		event?.agentPath,
		event?.agent_path,
		event?.agent?.path,
		event?.session?.path,
		ctx?.agentPath,
		ctx?.agent_path,
		ctx?.agent?.path,
		ctx?.session?.path,
	);
	if (agentPath) {
		if (agentPath === "/root" || agentPath === "root") return { requestRole: "main", requestRoleSource: "agentPath" };
		if (agentPath.startsWith("/root/") || agentPath.includes("subagent")) return { requestRole: "subagent", requestRoleSource: "agentPath" };
	}

	const taskName = pickString(
		event?.taskName,
		event?.task_name,
		event?.task?.name,
		event?.taskPath,
		ctx?.taskName,
		ctx?.task_name,
		ctx?.task?.name,
		ctx?.taskPath,
	);
	if (taskName) return { requestRole: "subagent", requestRoleSource: "taskName" };

	return { requestRole: "main", requestRoleSource: "default:root-process" };
}

/**
 * Infer a request role from snapshot-derived signals when explicit event/ctx
 * fields are absent. Conservative by design: it only returns a role when a
 * signal is genuinely informative and otherwise returns `null` so the caller
 * can fall back further.
 *
 * Signals considered (see issue #90):
 *  - an already-resolved, non-default role stored on the snapshot is trusted;
 *  - `runKeySource === "cwd"` indicates a root/one-off process (no session or
 *    conversation id was available), which strongly implies a main run.
 *
 * Returns `null` when no informative signal is available.
 */
export function inferRoleFromSnapshot(
	state: RoleInferenceSnapshot | null | undefined,
): { requestRole: CacheFriendlyRequestRole; requestRoleSource: string } | null {
	if (!state) return null;
	if (
		state.requestRole &&
		state.requestRole !== "unknown" &&
		!isWeakRoleSource(state.requestRoleSource)
	) {
		return {
			requestRole: state.requestRole,
			requestRoleSource: `snapshot:${state.requestRoleSource}`,
		};
	}
	if (state.runKeySource === "cwd") {
		return { requestRole: "main", requestRoleSource: "snapshot:runKeySource:cwd" };
	}
	return null;
}

/**
 * Resolve a request role for any hook (including provider/message hooks that
 * fire outside the agent-start hook). Chains explicit event/ctx resolution →
 * snapshot-derived inference →
 * role-only memo hint, and only falls back to the default main guess when no
 * signal fires. This is the single entry point used by provider/message hooks.
 */
export function resolveRequestRole(opts: {
	event: any;
	ctx: any;
	snapshot?: RoleInferenceSnapshot | null;
	roleHint?: { requestRole: CacheFriendlyRequestRole; requestRoleSource: string } | null;
}): { requestRole: CacheFriendlyRequestRole; requestRoleSource: string } {
	const explicit = requestRoleOf(opts.event, opts.ctx);
	if (!isWeakRoleSource(explicit.requestRoleSource)) return explicit;
	const inferred = inferRoleFromSnapshot(opts.snapshot);
	if (inferred) return inferred;
	if (opts.roleHint) {
		return {
			requestRole: opts.roleHint.requestRole,
			requestRoleSource: `memo:${opts.roleHint.requestRoleSource}`,
		};
	}
	return explicit;
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
