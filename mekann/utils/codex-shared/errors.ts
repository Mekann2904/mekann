/**
 * Codex error types and classification helpers.
 *
 * Framework-independent. No Pi imports.
 */

import type { CodexErrorKind } from "./types.js";

export class CodexError extends Error {
	readonly kind: CodexErrorKind;
	readonly status?: number;

	constructor(kind: CodexErrorKind, message: string, status?: number) {
		super(message);
		this.name = "CodexError";
		this.kind = kind;
		if (status !== undefined) this.status = status;
	}
}

export function classifyError(error: unknown): CodexErrorKind {
	if (error instanceof CodexError) return error.kind;
	if (
		error instanceof Error &&
		(error.name === "AbortError" || error.name === "TimeoutError")
	) {
		return "timeout";
	}
	return "unknown";
}

export function classifyHttpStatus(status: number): CodexErrorKind {
	if (status === 401 || status === 403) return "auth";
	if (status === 429) return "rate_limit";
	if (status === 503) return "overloaded";
	return "transport";
}

export function classifyEventErrorMessage(message: string): CodexErrorKind {
	const lower = message.toLowerCase();
	if (/server[-_ ]?is[-_ ]?overloaded|service[-_ ]?unavailable|overloaded|slow_down/.test(lower)) return "overloaded";
	if (/rate[- ]?limit|too many requests|quota|429/.test(lower)) return "rate_limit";
	if (/auth|unauthori[sz]ed|forbidden|401|403/.test(lower)) return "auth";
	if (/timeout|timed out/.test(lower)) return "timeout";
	if (/network|connection|disconnect|transport|fetch failed/.test(lower))
		return "transport";
	return "unknown";
}

export function isAuthError(error: unknown): boolean {
	return error instanceof CodexError && error.kind === "auth";
}

export function isModelAvailabilityError(error: unknown): boolean {
	if (!(error instanceof CodexError)) return false;
	const msg = error.message.toLowerCase();
	return (
		msg.includes("model_not_found") ||
		msg.includes("unsupported_model") ||
		msg.includes("model not found") ||
		msg.includes("unsupported model")
	);
}

export function isReasoningParameterError(error: unknown): boolean {
	if (!(error instanceof CodexError)) return false;
	if (error.status !== 400) return false;
	const msg = error.message.toLowerCase();
	return (
		msg.includes("reasoning") ||
		msg.includes("effort")
	);
}

export function isOverloadedError(error: unknown): boolean {
	return error instanceof CodexError && error.kind === "overloaded";
}
