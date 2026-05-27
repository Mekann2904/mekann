/**
 * model-optimizer/deepseek — settings for the DeepSeek optimizer module.
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

export const deepseekOptimizerSettings: SettingSchema<boolean>[] = [
	bool(
		"deepseek.enabled",
		"API Families",
		true,
		"DeepSeek API 向けの最適化を有効にする。",
	),
];
