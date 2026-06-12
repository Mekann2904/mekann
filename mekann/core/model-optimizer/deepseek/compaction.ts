/**
 * model-optimizer/deepseek — post-compaction hints for DeepSeek API.
 *
 * Returns a DeepSeek-aware continuation hint that preserves the user's
 * objective, reasoning context, and tool-use state after compaction.
 * Inspired by DeepSeek-Reasonix's context-manager fold heuristics.
 */

const DEEPSEEK_POST_COMPACTION_HINT = [
	"The previous conversation was compacted.",
	"Continue from the compacted summary while preserving:",
	"- the user's ORIGINAL OBJECTIVE (never paraphrase away negative constraints)",
	"- decisions reached and conclusions drawn",
	"- files inspected or modified, and important tool results",
	"- pending tasks and open questions",
	"- all 'do not' / 'never' / 'avoid' instructions verbatim",
	"Skip turn-by-turn play-by-play; continue tool use and reasoning normally.",
].join("\n");

export { DEEPSEEK_POST_COMPACTION_HINT };
