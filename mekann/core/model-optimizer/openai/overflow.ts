/**
 * model-optimizer/openai — overflow detection for OpenAI-family APIs.
 *
 * Detects context-overflow error messages by matching known patterns.
 * Covers: openai-completions, openai-responses, azure-openai-responses,
 * openai-codex-responses.
 */

const OPENAI_OVERFLOW_PATTERNS: RegExp[] = [
	/context_length_exceeded/i,
	/maximum context length/i,
	/exceeds the context window/i,
];

/**
 * Test whether an error message looks like a context-overflow error
 * from an OpenAI-family API.
 */
export function isOpenaiOverflow(errorMessage: string): boolean {
	return OPENAI_OVERFLOW_PATTERNS.some((p) => p.test(errorMessage));
}
