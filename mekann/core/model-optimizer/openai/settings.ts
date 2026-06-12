/**
 * model-optimizer/openai — settings for the OpenAI-family optimizer module.
 */

import type { SettingSchema } from "../../../settings/types.js";
import { boolSetting } from "../settings-utils.js";

export const openaiOptimizerSettings: SettingSchema<boolean>[] = [
	boolSetting(
		"openaiFamily.enabled",
		"API Families",
		true,
		"OpenAI API ファミリ (openai-responses, openai-completions, azure-openai-responses) 向けの最適化を有効にする。",
	),
	boolSetting(
		"openaiCodex.enabled",
		"API Families",
		true,
		"OpenAI Codex API (openai-codex-responses) 向けの最適化を有効にする。",
	),
];
