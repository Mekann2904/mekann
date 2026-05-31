/**
 * model-optimizer/openai — OpenAI-family optimizer module.
 *
 * Covers: openai-completions, openai-responses, openai-codex-responses.
 * Only models whose provider is "openai" or "openai-codex" are supported.
 */

import type { OptimizerModel, ProviderOptimizerModule } from "../types.js";
import { isOpenaiOverflow } from "./overflow.js";
import { buildOpenaiCompactionHint } from "./compaction.js";
import { openaiOptimizerSettings } from "./settings.js";

// ---------------------------------------------------------------------------
// API × provider whitelist
// ---------------------------------------------------------------------------

const OPENAI_API_FAMILIES: Record<string, string> = {
	"openai-completions": "openaiFamily",
	"openai-responses": "openaiFamily",
	"openai-codex-responses": "openaiCodex",
};

const OPENAI_API_PROVIDERS: Record<string, string[]> = {
	"openai-completions": ["openai"],
	"openai-responses": ["openai"],
	"openai-codex-responses": ["openai-codex"],
};

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const openaiModule: ProviderOptimizerModule = {
	id: "openai",

	supports(model: OptimizerModel): boolean {
		if (!(model.api in OPENAI_API_FAMILIES)) return false;
		const allowed = OPENAI_API_PROVIDERS[model.api];
		return !!allowed && allowed.includes(model.provider);
	},

	familyKey(model: OptimizerModel): string | undefined {
		return OPENAI_API_FAMILIES[model.api];
	},

	detectOverflow(ctx: { model: OptimizerModel; errorMessage: string }): boolean {
		return isOpenaiOverflow(ctx.errorMessage);
	},

	rewriteOverflow(ctx: { model: OptimizerModel; errorMessage: string }): string {
		return `context_length_exceeded: ${ctx.errorMessage}`;
	},

	buildPostCompactionHint(ctx: { model: OptimizerModel }): string {
		return buildOpenaiCompactionHint(ctx.model.api);
	},

	settings: openaiOptimizerSettings,
};
