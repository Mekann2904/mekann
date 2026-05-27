/**
 * model-optimizer/deepseek — DeepSeek optimizer module.
 *
 * Covers: the `deepseek` model on the `deepseek` provider only.
 * Matches strictly on `model.provider === "deepseek"` AND `model.id === "deepseek"`
 * to avoid enabling for OpenAI-compatible third-party providers.
 */

import type { Api, Model } from "@earendil-works/pi-ai";
import type { ProviderOptimizerModule } from "../types.js";
import { isDeepseekOverflow } from "./overflow.js";
import { DEEPSEEK_POST_COMPACTION_HINT } from "./compaction.js";
import { deepseekOptimizerSettings } from "./settings.js";

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const deepseekModule: ProviderOptimizerModule = {
	id: "deepseek",

	supports(model: Model<Api>): boolean {
		return model.provider === "deepseek" && model.id === "deepseek";
	},

	familyKey(_model: Model<Api>): string | undefined {
		return "deepseek";
	},

	detectOverflow(ctx: { model: Model<Api>; errorMessage: string }): boolean {
		return isDeepseekOverflow(ctx.errorMessage);
	},

	rewriteOverflow(ctx: { model: Model<Api>; errorMessage: string }): string {
		return `context_length_exceeded: ${ctx.errorMessage}`;
	},

	buildPostCompactionHint(_ctx: { model: Model<Api> }): string {
		return DEEPSEEK_POST_COMPACTION_HINT;
	},

	settings: deepseekOptimizerSettings,
};
