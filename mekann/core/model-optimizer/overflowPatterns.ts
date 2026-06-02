/**
 * model-optimizer — shared context-overflow detection helpers.
 */

const DEFAULT_OVERFLOW_PATTERNS: RegExp[] = [
	/context_length_exceeded/i,
	/maximum context length/i,
	/exceeds the context window/i,
];

export function matchesDefaultOverflowPatterns(errorMessage: string): boolean {
	return DEFAULT_OVERFLOW_PATTERNS.some((pattern) => pattern.test(errorMessage));
}

export function canonicalOverflowMessage(errorMessage: string): string {
	return `context_length_exceeded: ${errorMessage}`;
}
