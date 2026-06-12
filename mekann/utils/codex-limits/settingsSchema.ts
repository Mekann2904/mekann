import type { FeatureSettingsSchema, SettingSchema } from "../../settings/types.js";

function bool(key: string, category: string, defaultValue: boolean, description: string): SettingSchema<boolean> {
	return {
		key,
		type: "boolean",
		defaultValue,
		description,
		category,
		scopes: ["global", "workspace"],
		restartRequired: true,
		validate(value) {
			return typeof value === "boolean" ? [] : ["boolean である必要があります"];
		},
	};
}

export const codexLimitsSettingsSchema: FeatureSettingsSchema = {
	feature: "codex-limits",
	title: "Codex Limits",
	settings: [
		bool("enabled", "General", true, "Codex usage footer/statusline と /codex-status command を有効にします。"),
	],
};
