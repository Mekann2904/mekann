import type { FeatureSettingsSchema, SettingSchema } from "../../settings/types.js";

const autoApproveMutations: SettingSchema<boolean> = {
	key: "autoApproveMutations",
	type: "boolean",
	defaultValue: false,
	description: "issue worktree 内の commit、push、PR・Issue 更新を確認なしで実行します。対象が fork や外部 repository でも適用されるため、信頼できる workspace でのみ有効にしてください。",
	category: "Automation",
	scopes: ["workspace"],
	restartRequired: false,
	validate(value) {
		return typeof value === "boolean" ? [] : ["boolean である必要があります"];
	},
};

export const issueWorkflowSettingsSchema: FeatureSettingsSchema = {
	feature: "issue-workflow",
	title: "Issue Workflow",
	settings: [autoApproveMutations],
};
