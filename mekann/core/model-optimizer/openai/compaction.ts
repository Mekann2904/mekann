/**
 * model-optimizer/openai — post-compaction hints for OpenAI-family APIs.
 *
 * Returns a context-appropriate continuation hint based on the specific
 * API protocol.  Codex gets a code-preserving hint; standard OpenAI gets
 * a generic objective-preserving hint.
 */

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

/**
 * Build a post-compaction hint for the given OpenAI-family API.
 */
export function buildOpenaiCompactionHint(api: string): string {
	if (api === "openai-codex-responses") return CODEX_POST_COMPACTION_HINT;
	return OPENAI_POST_COMPACTION_HINT;
}

export { OPENAI_POST_COMPACTION_HINT, CODEX_POST_COMPACTION_HINT };
