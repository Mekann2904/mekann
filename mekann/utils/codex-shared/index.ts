/**
 * Codex shared module — re-exports all shared primitives.
 */

export type { CodexErrorKind, CodexModel, CodexReasoningEffort, SearchContextSize } from "./types.js";
export { extractAccountIdFromToken } from "./auth.js";
export {
	normalizeCodexBaseUrl,
	resolveCodexEndpoint,
	buildCodexHeaders,
	getDefaultClientVersion,
	fetchCodexJson,
} from "./client.js";
export {
	CodexError,
	classifyError,
	classifyHttpStatus,
	classifyEventErrorMessage,
	isAuthError,
	isModelAvailabilityError,
	isReasoningParameterError,
} from "./errors.js";
export {
	fetchCodexModels,
	selectDefaultModel,
	getCachedCodexModels,
	invalidateCodexModelsCache,
	clearCodexModelsCache,
	codexModelsCacheKey,
	normalizeReasoningEffortForModel,
	findModelById,
} from "./models.js";
export type { CodexModelsCacheEntry } from "./models.js";
