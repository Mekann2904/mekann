/**
 * model-optimizer — shared settings schema helpers.
 */

import type { SettingSchema } from "../../settings/types.js";

export function boolSetting(
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
