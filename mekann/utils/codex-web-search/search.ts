/**
 * Codex web search core — fetchCodexWebSearch and supporting types.
 *
 * Framework-independent HTTP + SSE logic.
 */

import { CodexError, classifyEventErrorMessage, classifyHttpStatus } from "../codex-shared/errors.js";
import type { SearchContextSize } from "../codex-shared/types.js";
import { buildCodexHeaders, resolveCodexEndpoint } from "../codex-shared/client.js";
import { parseSse } from "./stream.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CodexWebSearchOptions {
	query: string;
	token: string;
	accountId: string;
	model: string;
	baseUrl?: string;
	externalWebAccess?: boolean;
	searchContextSize?: SearchContextSize;
	effort?: import("../codex-shared/types.js").CodexReasoningEffort;
	signal?: AbortSignal;
	onTextDelta?: (delta: string) => void;
	fetchImpl?: typeof fetch;
}

export interface CodexCitation {
	title?: string;
	url: string;
	startIndex?: number;
	endIndex?: number;
}

export interface CodexSearchCall {
	id?: string;
	status?: string;
	query?: string;
	url?: string;
	actionType?: string;
}

export interface CodexWebSearchResult {
	responseId?: string;
	model: string;
	text: string;
	searchCalls: CodexSearchCall[];
	citations: CodexCitation[];
	usage?: {
		inputTokens?: number;
		outputTokens?: number;
		totalTokens?: number;
	};
}

// ---------------------------------------------------------------------------
// Internal SSE response shapes
// ---------------------------------------------------------------------------

interface ResponseOutputText {
	type?: string;
	text?: string;
	annotations?: Array<{
		type?: string;
		title?: string;
		url?: string;
		start_index?: number;
		end_index?: number;
	}>;
}

interface ResponseOutputItem {
	id?: string;
	type?: string;
	status?: string;
	role?: string;
	action?: {
		type?: string;
		query?: string;
		queries?: string[];
		url?: string;
	};
	content?: ResponseOutputText[];
}

interface ResponseUsage {
	input_tokens?: number;
	output_tokens?: number;
	total_tokens?: number;
}

interface ResponseEnvelope {
	id?: string;
	usage?: ResponseUsage;
}

interface ResponseEventData {
	response?: ResponseEnvelope;
	item?: ResponseOutputItem;
	delta?: string;
	error?: {
		message?: string;
		code?: string;
	};
}

// ---------------------------------------------------------------------------
// fetchCodexWebSearch
// ---------------------------------------------------------------------------

export async function fetchCodexWebSearch(
	options: CodexWebSearchOptions,
): Promise<CodexWebSearchResult> {
	const fetcher = options.fetchImpl ?? fetch;
	const response = await fetcher(
		resolveCodexEndpoint(options.baseUrl, "responses"),
		{
			method: "POST",
			headers: buildCodexHeaders(
				options.token,
				options.accountId,
				"text/event-stream",
			),
			body: JSON.stringify(buildWebSearchRequestBody(options)),
			signal: options.signal,
		},
	);

	if (!response.ok) {
		const status = response.status;
		throw new CodexError(
			classifyHttpStatus(status),
			`Codex web search request failed: HTTP ${status} ${await response.text()}`,
			status,
		);
	}
	if (!response.body) {
		throw new CodexError(
			"transport",
			"Codex web search response did not include a body",
		);
	}

	let responseId: string | undefined;
	let usage: ResponseUsage | undefined;
	let streamedText = "";
	const messageTextParts: string[] = [];
	const searchCalls = new Map<string, CodexSearchCall>();
	const citations = new Map<string, CodexCitation>();

	for await (const event of parseSse(response.body)) {
		const data = event.data as ResponseEventData | undefined;
		if (!data) continue;

		if (event.type === "response.created") {
			responseId = data.response?.id;
			continue;
		}

		if (event.type === "response.output_text.delta") {
			const delta = data.delta ?? "";
			streamedText += delta;
			options.onTextDelta?.(delta);
			continue;
		}

		if (
			event.type === "response.output_item.added" &&
			data.item?.type === "web_search_call"
		) {
			const item = data.item;
			searchCalls.set(item.id ?? `search-${searchCalls.size + 1}`, {
				id: item.id,
				status: item.status,
			});
			continue;
		}

		if (event.type === "response.output_item.done") {
			collectOutputItem(data.item, searchCalls, messageTextParts, citations);
			continue;
		}

		if (event.type === "response.completed") {
			usage = data.response?.usage;
			continue;
		}

		if (event.type === "response.failed") {
			const message =
				data.error?.message ?? data.error?.code ?? "Codex web search failed";
			throw new CodexError(classifyEventErrorMessage(message), message);
		}
	}

	return {
		responseId,
		model: options.model,
		text: messageTextParts.join("") || streamedText,
		searchCalls: [...searchCalls.values()],
		citations: [...citations.values()],
		usage: usage
			? {
					inputTokens: usage.input_tokens,
					outputTokens: usage.output_tokens,
					totalTokens: usage.total_tokens,
				}
			: undefined,
	};
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function buildWebSearchRequestBody(options: CodexWebSearchOptions) {
	const body: Record<string, unknown> = {
		model: options.model,
		instructions:
			"You are a concise web search assistant. Use web search, answer the query, and preserve source citations from annotations.",
		input: [
			{
				type: "message",
				role: "user",
				content: [{ type: "input_text", text: options.query }],
			},
		],
		tools: [
			{
				type: "web_search",
				external_web_access: options.externalWebAccess ?? true,
				search_context_size: options.searchContextSize ?? "medium",
			},
		],
		tool_choice: "required",
		parallel_tool_calls: true,
		store: false,
		stream: true,
		include: [],
	};

	if (options.effort) {
		body.reasoning = { effort: options.effort };
	}

	return body;
}

function collectOutputItem(
	item: ResponseOutputItem | undefined,
	searchCalls: Map<string, CodexSearchCall>,
	messageTextParts: string[],
	citations: Map<string, CodexCitation>,
): void {
	if (!item) return;

	if (item.type === "web_search_call") {
		const key = item.id ?? `search-${searchCalls.size + 1}`;
		const query =
			item.action?.query ?? item.action?.queries?.join(", ");
		searchCalls.set(key, {
			id: item.id,
			status: item.status,
			query,
			url: item.action?.url,
			actionType: item.action?.type,
		});
		return;
	}

	if (item.type !== "message" || item.role !== "assistant") return;

	for (const part of item.content ?? []) {
		if (part.type !== "output_text") continue;
		messageTextParts.push(part.text ?? "");
		for (const annotation of part.annotations ?? []) {
			if (annotation.type !== "url_citation" || !annotation.url) continue;
			citations.set(annotation.url, {
				title: annotation.title,
				url: annotation.url,
				startIndex: annotation.start_index,
				endIndex: annotation.end_index,
			});
		}
	}
}
