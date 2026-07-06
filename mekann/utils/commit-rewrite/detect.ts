/**
 * Detection of "weak" commit messages — the only candidates commit-rewrite
 * touches. A message is weak when it fails to communicate the change:
 *   - empty, or
 *   - already in Conventional Commits form (definitely NOT weak — leave alone), or
 *   - a single token, or
 *   - an exact match against a configurable weak-pattern list, or
 *   - fewer than `minWords` tokens.
 *
 * The Conventional Commits guard is first so well-formed messages such as
 * `feat(utils): add terminal shortcut` are never rewritten, even though they
 * contain the word "add".
 */
const CONVENTIONAL_RE =
	/^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert|improvement)(\([^)]+\))?!?: .+/i;

export const DEFAULT_WEAK_PATTERNS = [
	"add",
	"fix",
	"wip",
	"update",
	"test",
	"misc",
	"stuff",
	"tweak",
	"changes",
	"change",
	"edit",
	"tmp",
	"temp",
	"work",
	"commit",
	"save",
	"done",
	"todo",
	"hack",
	"cleanup",
];

/** Parse a comma-separated patterns string into a lower-cased token list, falling back to defaults. */
export function parseWeakPatterns(input: string | undefined): string[] {
	if (!input || !input.trim()) return DEFAULT_WEAK_PATTERNS;
	const tokens = input
		.split(",")
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
	return tokens.length > 0 ? tokens : DEFAULT_WEAK_PATTERNS;
}

/** True when a commit subject is too weak to communicate its change. Pure for testing. */
export function isWeakMessage(
	subject: string,
	patterns: string[] = DEFAULT_WEAK_PATTERNS,
	minWords = 3,
): boolean {
	const trimmed = subject.trim();
	if (!trimmed) return true;
	// Already-conventional messages are considered well-formed — never rewrite.
	if (CONVENTIONAL_RE.test(trimmed)) return false;
	const lower = trimmed.toLowerCase();
	const words = lower.split(/\s+/).filter(Boolean);
	if (words.length <= 1) return true;
	if (patterns.includes(lower)) return true;
	if (words.length < minWords) return true;
	return false;
}
