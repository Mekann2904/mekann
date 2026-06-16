/**
 * volatile.ts — Shared volatile-runtime-line detection (single source of truth).
 *
 * Used by BOTH:
 *   - the extraction layer (`splitVolatileRuntimeBlock` in cache-friendly-prompt),
 *     which moves these lines out of the cacheable base-system prefix; and
 *   - the inspection layer (`inspectBaseSystemPrompt` in inspect.ts), which warns
 *     about them.
 *
 * Because extraction and inspection share this one source, any base-system line
 * that inspection flags as volatile runtime is also removed by extraction (and
 * vice versa). Previously the two layers used different pattern sets, so
 * inspection could warn about a line that extraction left sitting in the stable
 * prefix and invalidating provider cache.
 *
 * Threshold design (過剰抽出回避): every pattern is anchored to the start of a
 * line and requires a `:` value separator. This reliably catches real runtime
 * headers ("Current date: 2026-05-27", "Current file: render.ts") while NOT
 * extracting stable policy prose that merely mentions a volatile term ("When
 * asked for the current date, run a command").
 *
 * The broader substring detection of volatile terms/values inside cacheable
 * FRAGMENTS (`volatileValuePatterns` / `volatileWarningTerms` in inspect.ts) is a
 * separate concern — fragment content hygiene — and intentionally stays more
 * permissive than this line-based extraction set.
 */
export const volatileRuntimeLinePatterns: readonly RegExp[] = [
	/^\s*current\s+date\s*:/i,
	/^\s*current\s+time\s*:/i,
	/^\s*current\s+working\s+directory\s*:/i,
	/^\s*current\s+cwd\s*:/i,
	/^\s*cwd\s*:/i,
	/^\s*working\s+directory\s*:/i,
	/^\s*current\s+file\s*:/i,
	/^\s*open\s+files?\s*:/i,
	/^\s*recent\s+(tool|command|search|context|files?)\s*:/i,
	/^\s*git\s+status\s*:/i,
	/^\s*continuation\s*:/i,
	/^\s*tokens?\s+used\s*:/i,
	/^\s*time\s+used\s*:/i,
	/^\s*remaining\s+tokens?\s*:/i,
	/^\s*token\s+budget\s*:/i,
];

/** True when a single line looks like a volatile runtime header line. */
export function isVolatileRuntimeLine(line: string): boolean {
	return volatileRuntimeLinePatterns.some((re) => re.test(line));
}

/**
 * Split a multi-line block into stable lines and volatile runtime lines using the
 * shared `volatileRuntimeLinePatterns`. Pure: no side effects.
 */
export function splitVolatileLines(text: string): {
	stableLines: string[];
	volatileLines: string[];
} {
	const stableLines: string[] = [];
	const volatileLines: string[] = [];
	for (const line of text.split(/\n/)) {
		if (isVolatileRuntimeLine(line)) volatileLines.push(line);
		else stableLines.push(line);
	}
	return { stableLines, volatileLines };
}
