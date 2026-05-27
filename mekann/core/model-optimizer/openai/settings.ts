/**
 * model-optimizer/openai — settings for the OpenAI-family optimizer module.
 */

import type { SettingSchema } from "../../../settings/types.js";

function bool(
	key: string,
	category: string,
	defaultValue: boolean,
	description: string,
): SettingSchema<boolean> {
	return {
		key,
		type: "boolean",
		defaultValue,
		description,
		category,
		scopes: ["global", "workspace"],
		restartRequired: false,
		validate(value) {
			return typeof value === "boolean" ? [] : ["boolean 値である必要があります"];
		},
	};
}

export const openaiOptimizerSettings: SettingSchema<boolean>[] = [
	bool(
		"openaiFamily.enabled",
		"API Families",
		true,
		"OpenAI API ファミリ (openai-responses, openai-completions, azure-openai-responses) 向けの最適化を有効にする。",
	),
	bool(
		"openaiCodex.enabled",
		"API Families",
		true,
		"OpenAI Codex API (openai-codex-responses) 向けの最適化を有効にする。",
	),
];
