import type { FeatureSettingsSchema, SettingSchema } from "../../settings/types.js";

function number(
	key: string,
	category: string,
	defaultValue: number,
	description: string,
	validate: (value: unknown) => string[],
): SettingSchema<number> {
	return {
		key,
		type: "number",
		defaultValue,
		description,
		category,
		scopes: ["global", "workspace"],
		restartRequired: false,
		validate,
	};
}

function positiveInt(message: string) {
	return (value: unknown): string[] => {
		if (typeof value !== "number" || !Number.isFinite(value)) return [message];
		if (!Number.isInteger(value) || value < 1) return ["1 以上の整数である必要があります"];
		return [];
	};
}

export const issueSettingsSchema: FeatureSettingsSchema = {
	feature: "issue",
	title: "Issue",
	settings: [
		number(
			"autopilot.maxParallel",
			"Autopilot",
			2,
			"`/issue-autopilot` が同時に駆動する Work Pi の上限。並列ワーカープールは別 issue で拡張されるまで、現状は 1（逐次）として動作します。",
			positiveInt("autopilot.maxParallel は 1 以上の整数である必要があります"),
		),
	],
};
