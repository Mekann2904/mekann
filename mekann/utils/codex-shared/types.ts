/**
 * Codex shared types.
 *
 * Framework-independent Codex API types shared by codex-limits and codex-web-search.
 */

export type CodexErrorKind = "auth" | "rate_limit" | "overloaded" | "transport" | "timeout" | "schema" | "unknown";

export type CodexReasoningEffort =
	| "none"
	| "minimal"
	| "low"
	| "medium"
	| "high"
	| "xhigh";

export interface CodexModel {
	id: string;
	name?: string;
	isDefault?: boolean;
	supportedReasoningEfforts?: CodexReasoningEffort[];
}

export type SearchContextSize = "low" | "medium" | "high";
