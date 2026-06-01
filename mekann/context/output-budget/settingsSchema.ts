import type { FeatureSettingsSchema, SettingSchema } from "../../settings/types.js";

function bool(key: string, category: string, defaultValue: boolean, description: string): SettingSchema<boolean> {
	return { key, type: "boolean", defaultValue, description, category, scopes: ["global", "workspace"], restartRequired: true, validate(value) { return typeof value === "boolean" ? [] : ["boolean である必要があります"]; } };
}

export const outputBudgetSettingsSchema: FeatureSettingsSchema = {
	feature: "output-budget",
	title: "Output Budget",
	settings: [
		bool("bashEnabled", "Bash", true, "bash tool_call の単純な ls/tree/find、grep/rg、git command を parse しやすい形式に正規化します。検索範囲や読み取り対象は変更しません。"),
		bool("recordNormalization", "Developer", false, "developer mode: command normalization の前後と byte metrics を workspace local の .mekann/output-budget/normalization.jsonl に記録します。個人情報や secret を含む command line が保存され得るためデフォルト off です。"),
	],
};
