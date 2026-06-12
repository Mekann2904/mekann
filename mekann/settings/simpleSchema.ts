import type { FeatureSettingsSchema, SettingSchema } from "./types.js";

export function boolSetting(
	key: string,
	category: string,
	defaultValue: boolean,
	description: string,
	restartRequired = true,
): SettingSchema<boolean> {
	return {
		key,
		type: "boolean",
		defaultValue,
		description,
		category,
		scopes: ["global", "workspace"],
		restartRequired,
		validate(value) {
			return typeof value === "boolean" ? [] : ["boolean である必要があります"];
		},
	};
}

export function enabledOnlySchema(feature: string, title: string, description: string): FeatureSettingsSchema {
	return {
		feature,
		title,
		settings: [boolSetting("enabled", "General", true, description, true)],
	};
}
