/**
 * model-optimizer — API-based optimization profiles.
 *
 * Classification is driven by `Model.api` (KnownApi) rather than provider
 * string.  A single map (`API_FAMILY_MAP`) is the source of truth for which
 * API protocols are optimized, which overflow patterns they use, and which
 * post-compaction hint to inject.
 *
 * Adding a new API requires only a single entry in `API_FAMILY_MAP`.
 */

import type { Api, Model } from "@earendil-works/pi-ai";
import type { OptimizationProfile } from "./types.js";

// ---------------------------------------------------------------------------
// Shared overflow patterns (OpenAI-family)
// ---------------------------------------------------------------------------

const OPENAI_OVERFLOW_PATTERNS: RegExp[] = [
	/context_length_exceeded/i,
	/maximum context length/i,
	/exceeds the context window/i,
];

// ---------------------------------------------------------------------------
// Post-compaction hints
// ---------------------------------------------------------------------------

const OPENAI_POST_COMPACTION_HINT = [
	"The previous conversation was compacted.",
	"Continue from the compacted summary, preserving the objective,",
	"key decisions, relevant facts, constraints, and pending tasks.",
].join("\n");

const CODEX_POST_COMPACTION_HINT = [
	"The previous conversation was compacted.",
	"Continue from the compacted summary while preserving:",
	"- exact file paths and symbols",
	"- commands executed and their outcomes",
	"- patches or edits already applied",
	"- failing tests, errors, and reproduction steps",
	"- current objective and incomplete tasks",
	"- user decisions and constraints",
].join("\n");

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

/** Profile for standard OpenAI-family API protocols. */
export const OPENAI_FAMILY_PROFILE: OptimizationProfile = {
	overflowPatterns: OPENAI_OVERFLOW_PATTERNS,
	postCompactionHint: OPENAI_POST_COMPACTION_HINT,
};

/** Profile for the Codex-specific API protocol. */
export const CODEX_PROFILE: OptimizationProfile = {
	overflowPatterns: OPENAI_OVERFLOW_PATTERNS,
	postCompactionHint: CODEX_POST_COMPACTION_HINT,
};

// ---------------------------------------------------------------------------
// Single source of truth: api → { familyKey, profile }
// ---------------------------------------------------------------------------

export const API_FAMILY_MAP: Record<
	string,
	{ familyKey: string; profile: OptimizationProfile }
> = {
	"openai-completions": { familyKey: "openaiFamily", profile: OPENAI_FAMILY_PROFILE },
	"openai-responses": { familyKey: "openaiFamily", profile: OPENAI_FAMILY_PROFILE },
	"azure-openai-responses": { familyKey: "openaiFamily", profile: OPENAI_FAMILY_PROFILE },
	"openai-codex-responses": { familyKey: "openaiCodex", profile: CODEX_PROFILE },
};

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/** Resolve an optimization profile from a Pi Model object (by `model.api`). */
export function resolveProfile(model: Model<Api>): OptimizationProfile | undefined {
	return API_FAMILY_MAP[model.api]?.profile;
}

/** Resolve the settings family key for a given API string. */
export function resolveFamilyKey(api: string): string | undefined {
	return API_FAMILY_MAP[api]?.familyKey;
}
