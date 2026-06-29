/**
 * Codex error types and classification helpers.
 *
 * Framework-independent. No Pi imports.
 */

import type { CodexErrorKind } from "./types.js";
import { redactSecrets } from "../../context/tool-output/redact.js";

export class CodexError extends Error {
	readonly kind: CodexErrorKind;
	readonly status?: number;
	/**
	 * Full (redacted) HTTP response body, retained only when PI_CODEX_DEBUG /
	 * CODEX_DEBUG is set (IC-225). Never contains raw secrets — the body is
	 * passed through `redactSecrets` first — and it is never shown to the user;
	 * user-facing messages use a short redacted preview only.
	 */
	readonly debugBody?: string;

	constructor(kind: CodexErrorKind, message: string, status?: number, debugBody?: string) {
		super(message);
		this.name = "CodexError";
		this.kind = kind;
		if (status !== undefined) this.status = status;
		if (debugBody !== undefined) this.debugBody = debugBody;
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

// ---------------------------------------------------------------------------
// Error body redaction (IC-225 / IC-218)
// ---------------------------------------------------------------------------

/** Max length of the redacted body preview embedded in the exception message. */
const CODEX_ERROR_BODY_PREVIEW = 300;

function codexDebugEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
	return Boolean(env.PI_CODEX_DEBUG ?? env.CODEX_DEBUG);
}

/**
 * Build a safe exception payload from an HTTP error response body.
 *
 * The full body is a leak surface: a misbehaving gateway can echo the request
 * token, accountId, or query. We (1) mask secrets via the canonical
 * `redactSecrets` (#138), (2) scrub the specific accountId value when known,
 * (3) keep only a short redacted preview in the user-facing message, and
 * (4) retain the full redacted body in `debugBody` only when PI_CODEX_DEBUG /
 * CODEX_DEBUG is set.
 *
 * The preview is deliberately large enough to preserve detection substrings
 * (`model_not_found`, `reasoning`, `effort`) used by isModelAvailabilityError /
 * isReasoningParameterError.
 */
export function redactCodexErrorBody(
	body: string,
	options: { accountId?: string } = {},
): { message: string; debugBody?: string } {
	let redacted = redactSecrets(body).text;
	if (options.accountId && options.accountId.length > 0) {
		redacted = redacted.split(options.accountId).join("[REDACTED_ACCOUNT_ID]");
	}
	const message = redacted.slice(0, CODEX_ERROR_BODY_PREVIEW);
	const debugBody = codexDebugEnabled() ? redacted : undefined;
	return { message, debugBody };
}

/**
 * Handle a non-2xx Codex HTTP response: read, redact, and throw a CodexError.
 *
 * Shared by fetchCodexJson / fetchCodexModels / fetchCodexWebSearch so every
 * Codex HTTP failure routes through the same secret-masking path (IC-225)
 * instead of each caller re-implementing the read→redact→throw boilerplate.
 * Always throws.
 */
export async function throwCodexHttpError(
	response: Response,
	prefix: string,
	accountId: string,
): Promise<never> {
	const status = response.status;
	const masked = redactCodexErrorBody(await response.text(), { accountId });
	throw new CodexError(
		classifyHttpStatus(status),
		`${prefix}: HTTP ${status} ${masked.message}`,
		status,
		masked.debugBody,
	);
}
