/**
 * model-optimizer/openai — OpenAI-family optimizer module.
 *
 * Covers: openai-completions, openai-responses, azure-openai-responses,
 * openai-codex-responses.
 */

import type { Api, Model } from "@earendil-works/pi-ai";
import type { ProviderOptimizerModule } from "../types.js";
import { isOpenaiOverflow } from "./overflow.js";
import { buildOpenaiCompactionHint } from "./compaction.js";
import { openaiOptimizerSettings } from "./settings.js";

// ---------------------------------------------------------------------------
// API → family key mapping
// ---------------------------------------------------------------------------

const OPENAI_API_FAMILIES: Record<string, string> = {
	"openai-completions": "openaiFamily",
	"openai-responses": "openaiFamily",
	"azure-openai-responses": "openaiFamily",
	"openai-codex-responses": "openaiCodex",
};

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const openaiModule: ProviderOptimizerModule = {
	id: "openai",

	supports(model: Model<Api>): boolean {
		return model.api in OPENAI_API_FAMILIES;
	},

	familyKey(model: Model<Api>): string | undefined {
		return OPENAI_API_FAMILIES[model.api];
	},

	detectOverflow(ctx: { model: Model<Api>; errorMessage: string }): boolean {
		return isOpenaiOverflow(ctx.errorMessage);
	},

	rewriteOverflow(ctx: { model: Model<Api>; errorMessage: string }): string {
		return `context_length_exceeded: ${ctx.errorMessage}`;
	},

	buildPostCompactionHint(ctx: { model: Model<Api> }): string {
		return buildOpenaiCompactionHint(ctx.model.api);
	},

	settings: openaiOptimizerSettings,
};
