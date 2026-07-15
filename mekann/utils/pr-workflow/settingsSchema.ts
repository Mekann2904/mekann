import type { FeatureSettingsSchema, SettingSchema } from "../../settings/types.js";

const autoCheckDetectedPrs: SettingSchema<boolean> = {
	key: "autoCheckDetectedPrs",
	type: "boolean",
	defaultValue: false,
	description: "PR URL を検出した後、CI と mergeability をバックグラウンドで自動確認します。明示的な /pr-check はこの設定に関係なく利用できます。",
	category: "Automation",
	scopes: ["workspace"],
	restartRequired: false,
	validate(value) {
		return typeof value === "boolean" ? [] : ["boolean である必要があります"];
	},
};

export const prWorkflowSettingsSchema: FeatureSettingsSchema = {
	feature: "pr-workflow",
	title: "PR Workflow",
	settings: [autoCheckDetectedPrs],
};
