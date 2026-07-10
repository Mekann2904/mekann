import { MEKANN_COMMIT_REWRITE_DEFAULTS } from "../../config.js";
import { boolSetting } from "../../settings/simpleSchema.js";
import type { FeatureSettingsSchema, SettingSchema } from "../../settings/types.js";

function optionalStr(key: string, category: string, defaultValue: string | undefined, description: string): SettingSchema<string | undefined> {
	return {
		key,
		type: "string",
		defaultValue,
		description,
		category,
		scopes: ["global", "workspace"],
		restartRequired: false,
		validate(value) {
			return value === undefined || (typeof value === "string" && value.trim().length > 0) ? [] : ["空でない文字列、または unset である必要があります"];
		},
	};
}

export const commitRewriteSettingsSchema: FeatureSettingsSchema = {
	feature: "commit-rewrite",
	title: "Commit Rewrite",
	settings: [
		boolSetting("enabled", "General", MEKANN_COMMIT_REWRITE_DEFAULTS.enabled, "commit-rewrite コマンドを有効にします。現在のブランチの未 push コミットのメッセージを、現在のモデルで 1 コミットずつ書き直します。", true),
		boolSetting("createBackup", "Safety", MEKANN_COMMIT_REWRITE_DEFAULTS.createBackup, "適用前に backup/commit-rewrite/<timestamp> ブランチを自動作成します。事故時は git reset --hard <branch> で復元できます。", false),
		{
			key: "maxCommits",
			type: "number",
			defaultValue: MEKANN_COMMIT_REWRITE_DEFAULTS.maxCommits,
			description: "1 回のコマンド実行で書き換えるコミット数の安全上限。超過すると警告します。",
			category: "Safety",
			scopes: ["global", "workspace"],
			restartRequired: false,
			validate(value) {
				const n = Number(value);
				if (!Number.isFinite(n) || !Number.isInteger(n)) return ["整数である必要があります"];
				if (n < 1 || n > 200) return ["1〜200 の範囲で指定してください"];
				return [];
			},
		},
		{
			key: "minMessageWords",
			type: "number",
			defaultValue: MEKANN_COMMIT_REWRITE_DEFAULTS.minMessageWords,
			description: "この単語数未満かつ Conventional Commits 形式でないメッセージを「貧弱」と判定して書き直し対象にします。",
			category: "Detection",
			scopes: ["global", "workspace"],
			restartRequired: false,
			validate(value) {
				const n = Number(value);
				if (!Number.isFinite(n) || !Number.isInteger(n)) return ["整数である必要があります"];
				if (n < 1 || n > 20) return ["1〜20 の範囲で指定してください"];
				return [];
			},
		},
		{
			key: "weakPatterns",
			type: "string",
			defaultValue: MEKANN_COMMIT_REWRITE_DEFAULTS.weakPatterns,
			description: "「貧弱」と判定するメッセージをカンマ区切りで指定（例: add,fix,wip）。空の場合はデフォルトパターンを使います。Conventional Commits 形式のメッセージは常に除外されます。",
			category: "Detection",
			scopes: ["global", "workspace"],
			restartRequired: false,
			validate(value) {
				return typeof value === "string" ? [] : ["文字列である必要があります"];
			},
		},
		optionalStr("model", "Model", MEKANN_COMMIT_REWRITE_DEFAULTS.model, "メッセージ生成に使う明示 model id（provider/model 形式）。unset の場合は pi の現在のモデルを使います。"),
	],
};
