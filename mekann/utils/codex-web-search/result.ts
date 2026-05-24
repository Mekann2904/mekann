/**
 * Codex web search result formatting.
 *
 * Formats the raw CodexWebSearchResult into LLM-facing text and structured details.
 */

import type { CodexWebSearchResult } from "./search.js";

export interface CodexWebSearchDetails {
	responseId?: string;
	model: string;
	searchCalls: CodexWebSearchResult["searchCalls"];
	citations: CodexWebSearchResult["citations"];
	usage?: CodexWebSearchResult["usage"];
	rawText: string;
	streaming?: boolean;
}

/**
 * Format the search result for the LLM: answer text + numbered source list.
 */
export function formatResultText(result: CodexWebSearchResult): string {
	const parts: string[] = [];

	if (result.text) {
		parts.push(result.text);
	}

	if (result.citations.length > 0) {
		parts.push("");
		parts.push("Sources:");
		const seen = new Set<string>();
		let index = 1;
		for (const citation of result.citations) {
			if (seen.has(citation.url)) continue;
			seen.add(citation.url);
			const title = citation.title ? `${citation.title} — ` : "";
			parts.push(`[${index}] ${title}${citation.url}`);
			index++;
		}
	}

	return parts.join("\n");
}
