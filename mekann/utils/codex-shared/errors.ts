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

// Substrings (regex-aware) that map a human-facing event message to a
// {@link CodexErrorKind}. English phrases plus Japanese-locale phrases so
// retries/fallbacks fire regardless of runtime locale (issue #162, IC-227).
// Each array is joined with `|` into a single RegExp — same idiom as
// safety/sandbox/executionControl.ts. Order within a group is irrelevant;
// the classification checks groups in priority order below.
const OVERLOADED_RE = new RegExp([
	"server[-_ ]?is[-_ ]?overloaded",
	"service[-_ ]?unavailable",
	"overloaded",
	"slow_down",
	"過負荷",
	"オーバーロード",
	"スロー?ダウン",
	"サービスは?(利用不可|利用できません)",
	"現在利用できません",
].join("|"));
const RATE_LIMIT_RE = new RegExp([
	"rate[- ]?limit",
	"too many requests",
	"quota",
	"429",
	"レートリミット",
	"リクエストが多すぎ",
	"リクエスト過多",
	"回数制限に達",
	"クォータ",
].join("|"));
const AUTH_RE = new RegExp([
	"auth",
	"unauthori[sz]ed",
	"forbidden",
	"401",
	"403",
	"認証",
	"承認",
	"権限が(ない|ありません)",
	"アクセスが拒否",
	"禁止されています",
	"許可されません",
].join("|"));
const TIMEOUT_RE = new RegExp(["timeout", "timed out", "タイムアウト", "時間切れ"].join("|"));
const TRANSPORT_RE = new RegExp([
	"network",
	"connection",
	"disconnect",
	"transport",
	"fetch failed",
	"ネットワーク",
	"接続(できません|エラー|が切れ)",
	"切断され",
	"通信エラー",
	"転送エラー",
].join("|"));

export function classifyEventErrorMessage(message: string): CodexErrorKind {
	const lower = message.toLowerCase();
	if (OVERLOADED_RE.test(lower)) return "overloaded";
	if (RATE_LIMIT_RE.test(lower)) return "rate_limit";
	if (AUTH_RE.test(lower)) return "auth";
	if (TIMEOUT_RE.test(lower)) return "timeout";
	if (TRANSPORT_RE.test(lower)) return "transport";
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
