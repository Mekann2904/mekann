/**
 * model-optimizer/deepseek — DeepSeek optimizer module.
 *
 * Covers: all models on the `deepseek` provider.
 * Matches on `model.provider === "deepseek"` to support current and future
 * DeepSeek models (deepseek-v4-flash, deepseek-v4-pro, etc.) while avoiding
 * enabling for OpenAI-compatible third-party providers.
 */

import type { OptimizerModel, ProviderOptimizerModule } from "../types.js";
import { isDeepseekOverflow } from "./overflow.js";
import { DEEPSEEK_POST_COMPACTION_HINT } from "./compaction.js";
import { deepseekOptimizerSettings } from "./settings.js";

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const deepseekModule: ProviderOptimizerModule = {
	id: "deepseek",

	supports(model: OptimizerModel): boolean {
		return model.provider === "deepseek";
	},

	familyKey(_model: OptimizerModel): string | undefined {
		return "deepseek";
	},

	detectOverflow(ctx: { model: OptimizerModel; errorMessage: string }): boolean {
		return isDeepseekOverflow(ctx.errorMessage);
	},

	buildPostCompactionHint(_ctx: { model: OptimizerModel }): string {
		return DEEPSEEK_POST_COMPACTION_HINT;
	},

	settings: deepseekOptimizerSettings,
};
