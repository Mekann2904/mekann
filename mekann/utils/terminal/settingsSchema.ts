import type { FeatureSettingsSchema, SettingSchema } from "../../settings/types.js";

const bool = (key: string, category: string, defaultValue: boolean, description: string): SettingSchema<boolean> => ({
	key,
	type: "boolean",
	defaultValue,
	description,
	category,
	scopes: ["global"],
	restartRequired: false,
	validate(value) {
		return typeof value === "boolean" ? [] : ["boolean である必要があります"];
	},
});

export const terminalSettingsSchema: FeatureSettingsSchema = {
	feature: "terminal",
	title: "Terminal",
	settings: [
		bool("clearOnStartup", "Display", true, "Pi 起動時（session_start reason: startup）にターミナル画面をクリアします。"),
	],
};
