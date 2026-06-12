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

export const dashboardSettingsSchema: FeatureSettingsSchema = {
	feature: "dashboard",
	title: "Dashboard",
	settings: [
		bool("enabled", "General", true, "/dashboard command と dashboard 関連 UI integration を有効にします。"),
	],
};
