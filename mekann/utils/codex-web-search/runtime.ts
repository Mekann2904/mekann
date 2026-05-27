/**
 * CodexWebSearchRuntime — deep module for codex-web-search.
 *
 * Owns model resolution, retry policy, streaming throttle, and result building.
 * No Pi framework imports — pure Codex domain logic.
 */

import type { CodexReasoningEffort, SearchContextSize } from "../codex-shared/types.js";
import {
	CodexError,
	isModelAvailabilityError,
	isReasoningParameterError,
	isOverloadedError,
	normalizeReasoningEffortForModel,
	findModelById,
} from "../codex-shared/index.js";
import {
	getCachedCodexModels,
	invalidateCodexModelsCache,
} from "../codex-shared/models.js";
import { fetchCodexWebSearch } from "./search.js";
import { formatResultText } from "./result.js";
import type { CodexWebSearchDetails, ModelResolutionSource } from "./result.js";

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new DOMException("The operation was aborted.", "AbortError"));
			return;
		}
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener("abort", () => {
			clearTimeout(timer);
			reject(new DOMException("The operation was aborted.", "AbortError"));
		}, { once: true });
	});
}

// ---------------------------------------------------------------------------
// Config (injected, not imported)
// ---------------------------------------------------------------------------

export interface CodexWebSearchConfig {
	/** Explicit model override; skips auto-resolution when set. */
	model?: string;
	/** Default reasoning effort. */
	effort?: CodexReasoningEffort;
	/** Model to try when the current provider is non-Codex. */
	nonCodexDefaultModel: string;
	/** Reasoning effort for the non-Codex default model. */
	nonCodexDefaultEffort: CodexReasoningEffort;
	/** Default search context size when caller doesn't specify. */
	defaultSearchContextSize: SearchContextSize;
	/** Whether external web access is enabled. */
	externalWebAccess: boolean;
	/** Codex API base URL. */
	baseUrl: string;
	/** Codex model catalog cache TTL in ms. */
	modelCacheTtlMs: number;
}

// ---------------------------------------------------------------------------
// Input / Output
// ---------------------------------------------------------------------------

export interface CodexWebSearchRuntimeInput {
	query: string;
	searchContextSize?: SearchContextSize;
	token: string;
	accountId: string;
	/** Current Pi model context for auto-resolution. Undefined if no active model. */
	currentModel?: { id: string; provider: string };
	/** Streaming delta callback. */
	onTextDelta?: (delta: string) => void;
	/** Abort signal. */
	signal?: AbortSignal;
	/** Custom fetch implementation (for testing). */
	fetchImpl?: typeof fetch;
}

export interface CodexWebSearchRuntimeOutput {
	text: string;
	details: CodexWebSearchDetails;
}

// ---------------------------------------------------------------------------
// Resolved model + effort (internal)
// ---------------------------------------------------------------------------

interface ResolvedModelAndEffort {
	model: string;
	effort?: CodexReasoningEffort;
	source: ModelResolutionSource;
}

// ---------------------------------------------------------------------------
// Streaming throttle
// ---------------------------------------------------------------------------

const STREAM_THROTTLE_MS = 50;

function createStreamingCallback(
	onUpdate: ((delta: string) => void) | undefined,
) {
	let accumulatedText = "";
	let lastUpdateAt = 0;
	let pendingTimer: ReturnType<typeof setTimeout> | undefined;

	const emitUpdate = () => {
		onUpdate?.(accumulatedText);
	};

	const handleDelta = (delta: string) => {
		accumulatedText += delta;

		const now = Date.now();
		const elapsed = now - lastUpdateAt;

		if (elapsed >= STREAM_THROTTLE_MS) {
			lastUpdateAt = now;
			emitUpdate();
			return;
		}

		if (!pendingTimer) {
			pendingTimer = setTimeout(() => {
				pendingTimer = undefined;
				lastUpdateAt = Date.now();
				emitUpdate();
			}, STREAM_THROTTLE_MS - elapsed);
		}
	};

	return { handleDelta };
}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

const CODEX_PROVIDER_ID = "openai-codex";

export class CodexWebSearchRuntime {
	constructor(private readonly config: CodexWebSearchConfig) {}

	async execute(input: CodexWebSearchRuntimeInput): Promise<CodexWebSearchRuntimeOutput> {
		const resolved = await this.resolveModelAndEffort(input);
		const { handleDelta } = createStreamingCallback(input.onTextDelta);

		const searchContextSize =
			input.searchContextSize ?? this.config.defaultSearchContextSize;

		const runSearch = (model: string, effort?: CodexReasoningEffort) =>
			fetchCodexWebSearch({
				query: input.query,
				searchContextSize,
				token: input.token,
				accountId: input.accountId,
				model,
				baseUrl: this.config.baseUrl,
				externalWebAccess: this.config.externalWebAccess,
				effort,
				signal: input.signal,
				onTextDelta: handleDelta,
				...(input.fetchImpl && { fetchImpl: input.fetchImpl }),
			});

		try {
			const result = await runSearch(resolved.model, resolved.effort);
			return this.buildOutput(result, resolved.source, resolved.effort, searchContextSize);
		} catch (error) {
			// Retry: model not found → invalidate cache, retry with Codex default
			if (isModelAvailabilityError(error)) {
				invalidateCodexModelsCache({
					baseUrl: this.config.baseUrl,
					accountId: input.accountId,
				});
				const refreshed = await getCachedCodexModels({
					token: input.token,
					accountId: input.accountId,
					baseUrl: this.config.baseUrl,
				}, this.config.modelCacheTtlMs);
				const fallbackModel = findModelById(refreshed.models, refreshed.defaultModelId);
				const fallbackEffort = normalizeReasoningEffortForModel(
					resolved.effort,
					fallbackModel,
				);
				const result = await runSearch(refreshed.defaultModelId, fallbackEffort);
				return this.buildOutput(result, "codex_default", fallbackEffort, searchContextSize);
			}

			// Retry: reasoning parameter not supported → retry without effort
			if (isReasoningParameterError(error) && resolved.effort) {
				const result = await runSearch(resolved.model);
				return this.buildOutput(result, resolved.source, undefined, searchContextSize);
			}

			// Retry: server overloaded → exponential backoff, up to 2 retries
			if (isOverloadedError(error)) {
				const MAX_OVERLOADED_RETRIES = 2;
				const BASE_DELAY_MS = 2_000;

				for (let attempt = 1; attempt <= MAX_OVERLOADED_RETRIES; attempt++) {
					const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
					await sleep(delay, input.signal);
					try {
						const result = await runSearch(resolved.model, resolved.effort);
						return this.buildOutput(result, resolved.source, resolved.effort, searchContextSize);
					} catch (retryError) {
						if (!isOverloadedError(retryError)) throw retryError;
					}
				}
			}

			throw error;
		}
	}

	// -----------------------------------------------------------------------
	// Model + effort resolution
	// -----------------------------------------------------------------------

	private async resolveModelAndEffort(
		input: CodexWebSearchRuntimeInput,
	): Promise<ResolvedModelAndEffort> {
		const configModel = this.config.model;
		const configEffort = this.config.effort;

		// 1. Config override
		if (configModel) {
			return { model: configModel, effort: configEffort ?? undefined, source: "explicit" };
		}

		const isCodexProvider = input.currentModel?.provider === CODEX_PROVIDER_ID;
		const cached = await getCachedCodexModels({
			token: input.token,
			accountId: input.accountId,
			baseUrl: this.config.baseUrl,
		}, this.config.modelCacheTtlMs);
		const availableIds = cached.modelIds;

		// 2. Codex provider → use current model, fallback to Codex default
		if (isCodexProvider && input.currentModel?.id) {
			if (availableIds.has(input.currentModel.id)) {
				const model = findModelById(cached.models, input.currentModel.id);
				return {
					model: input.currentModel.id,
					effort: normalizeReasoningEffortForModel(configEffort, model),
					source: "current_codex",
				};
			}
			const fallbackModel = findModelById(cached.models, cached.defaultModelId);
			return {
				model: cached.defaultModelId,
				effort: normalizeReasoningEffortForModel(configEffort, fallbackModel),
				source: "codex_default",
			};
		}

		// 3. Non-codex provider → try non-codex default model, then Codex default
		const nonCodexModel = this.config.nonCodexDefaultModel;
		const nonCodexEffort = this.config.nonCodexDefaultEffort;

		if (availableIds.has(nonCodexModel)) {
			const model = findModelById(cached.models, nonCodexModel);
			return {
				model: nonCodexModel,
				effort: normalizeReasoningEffortForModel(nonCodexEffort, model),
				source: "non_codex_default",
			};
		}

		const fallbackModel = findModelById(cached.models, cached.defaultModelId);
		return {
			model: cached.defaultModelId,
			effort: normalizeReasoningEffortForModel(nonCodexEffort, fallbackModel),
			source: "codex_default",
		};
	}

	// -----------------------------------------------------------------------
	// Output builder
	// -----------------------------------------------------------------------

	private buildOutput(
		result: Awaited<ReturnType<typeof fetchCodexWebSearch>>,
		modelSource: ModelResolutionSource,
		effort?: CodexReasoningEffort,
		searchContextSize?: SearchContextSize,
	): CodexWebSearchRuntimeOutput {
		const text = formatResultText(result);
		const details: CodexWebSearchDetails = {
			responseId: result.responseId,
			model: result.model,
			modelSource,
			effort,
			searchContextSize,
			searchCalls: result.searchCalls,
			citations: result.citations,
			usage: result.usage,
			rawText: result.text,
			streaming: false,
		};
		return { text, details };
	}
}
