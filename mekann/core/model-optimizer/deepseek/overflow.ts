/**
 * model-optimizer/deepseek — overflow detection for DeepSeek API.
 *
 * DeepSeek currently uses the shared context-overflow patterns. Keep this
 * provider-local function as the module boundary so DeepSeek-specific patterns
 * can be added without changing callers.
 */

import { matchesDefaultOverflowPatterns } from "../overflowPatterns.js";

/**
 * Test whether an error message looks like a context-overflow error
 * from the DeepSeek API.
 */
export function isDeepseekOverflow(errorMessage: string): boolean {
	return matchesDefaultOverflowPatterns(errorMessage);
}
