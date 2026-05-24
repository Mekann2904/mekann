/**
 * Codex shared types.
 *
 * Framework-independent Codex API types shared by codex-limits and codex-web-search.
 */

export type CodexErrorKind = "auth" | "rate_limit" | "transport" | "timeout" | "schema" | "unknown";

export interface CodexModel {
	id: string;
	name?: string;
	isDefault?: boolean;
}

export type SearchContextSize = "low" | "medium" | "high";
