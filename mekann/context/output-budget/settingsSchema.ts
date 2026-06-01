import type { FeatureSettingsSchema, SettingSchema } from "../../settings/types.js";

function bool(key: string, category: string, defaultValue: boolean, description: string): SettingSchema<boolean> {
	return { key, type: "boolean", defaultValue, description, category, scopes: ["global", "workspace"], restartRequired: true, validate(value) { return typeof value === "boolean" ? [] : ["boolean である必要があります"]; } };
}

function num(key: string, category: string, defaultValue: number, min: number, max: number, description: string): SettingSchema<number> {
	return { key, type: "number", defaultValue, description, category, scopes: ["global", "workspace"], restartRequired: false, validate(value) {
		const n = Number(value);
		if (!Number.isFinite(n) || !Number.isInteger(n)) return ["整数である必要があります"];
		if (n < min || n > max) return [`${min}〜${max} の範囲で指定してください`];
		return [];
	} };
}

export const outputBudgetSettingsSchema: FeatureSettingsSchema = {
	feature: "output-budget",
	title: "Output Budget",
	settings: [
		bool("enabled", "General", true, "tool 出力の compact 表示を有効にします。"),
		bool("bashEnabled", "Bash", true, "bash tool_call の単純な ls/tree/find、cat/head/tail、grep/rg、git command を compact 表示向けに扱います。"),
		bool("recordNormalization", "Developer", false, "developer mode: command normalization の前後と byte metrics を workspace local の .mekann/output-budget/normalization.jsonl に記録します。個人情報や secret を含む command line が保存され得るためデフォルト off です。"),
		num("maxLines", "Limits", 200, 20, 5000, "compact 表示の最大行数。"),
		num("maxLineLength", "Limits", 240, 40, 2000, "compact 表示の1行最大文字数。"),
		num("grepMaxResults", "Grep", 200, 1, 2000, "grep/rg compact 表示の全体最大 match 数。"),
		num("grepMaxPerFile", "Grep", 25, 1, 200, "grep/rg compact 表示のファイルごとの最大 match 数。"),
		num("grepMaxLineLength", "Grep", 240, 40, 2000, "grep/rg compact 表示の1行最大文字数。"),
	],
};
