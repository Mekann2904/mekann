/**
 * model-optimizer/openai — overflow detection for OpenAI-family APIs.
 *
 * OpenAI currently uses the shared context-overflow patterns. Keep this
 * provider-local function as the module boundary so OpenAI-specific patterns
 * can be added without changing callers.
 */

import { matchesDefaultOverflowPatterns } from "../overflowPatterns.js";

/**
 * Test whether an error message looks like a context-overflow error
 * from an OpenAI-family API.
 */
export function isOpenaiOverflow(errorMessage: string): boolean {
	return matchesDefaultOverflowPatterns(errorMessage);
}
