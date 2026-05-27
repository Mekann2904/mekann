/**
 * model-optimizer/deepseek — overflow detection for DeepSeek API.
 *
 * Detects context-overflow error messages by matching known patterns
 * specific to the DeepSeek API response format.
 */

const DEEPSEEK_OVERFLOW_PATTERNS: RegExp[] = [
	/context_length_exceeded/i,
	/maximum context length/i,
	/exceeds the context window/i,
];

/**
 * Test whether an error message looks like a context-overflow error
 * from the DeepSeek API.
 */
export function isDeepseekOverflow(errorMessage: string): boolean {
	return DEEPSEEK_OVERFLOW_PATTERNS.some((p) => p.test(errorMessage));
}
