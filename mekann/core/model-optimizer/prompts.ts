/**
 * model-optimizer — provider-aware prompt hints.
 */

import type { OptimizedProviderId } from "./types.js";

// ---------------------------------------------------------------------------
// Post-compaction continuation hints
// ---------------------------------------------------------------------------

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

const OPENAI_POST_COMPACTION_HINT = [
	"The previous conversation was compacted.",
	"Continue from the compacted summary, preserving the objective,",
	"key decisions, relevant facts, constraints, and pending tasks.",
].join("\n");

export function getPostCompactionHint(provider: OptimizedProviderId): string {
	if (provider === "openai-codex") return CODEX_POST_COMPACTION_HINT;
	return OPENAI_POST_COMPACTION_HINT;
}
