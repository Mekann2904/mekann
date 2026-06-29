/**
 * Codex shared types.
 *
 * Framework-independent Codex API types shared by codex-limits and codex-web-search.
 */

export type CodexErrorKind = "auth" | "rate_limit" | "overloaded" | "transport" | "timeout" | "schema" | "unknown";

/**
 * Known Codex reasoning-effort levels. `xhigh` is non-standard / supported by
 * only some models; treat the union as the set Mekann understands, not the
 * exhaustive set the API may report (issue #167 / IC-229).
 */
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
	/**
	 * Effort levels the API reports this model as supporting. Typed as `string`
	 * (not {@link CodexReasoningEffort}) so unknown / newly-introduced efforts
	 * are preserved instead of silently dropped during normalization
	 * (issue #167 / IC-230).
	 */
	supportedReasoningEfforts?: string[];
}

export type SearchContextSize = "low" | "medium" | "high";
