import { boolSetting } from "../../settings/simpleSchema.js";
import type { FeatureSettingsSchema, SettingSchema } from "../../settings/types.js";

const toolSurfaceValues = ["on-demand", "always"] as const;

const toolSurfaceSetting: SettingSchema<string> = {
	key: "toolSurface",
	type: "enum",
	defaultValue: "on-demand",
	description: "context-ledger search/summarize tools を LLM に見せる条件。on-demand は compaction 後や command で有効化、always は常時。",
	category: "Context Surface",
	scopes: ["global", "workspace"],
	restartRequired: false,
	enumValues: [...toolSurfaceValues],
	validate(value) {
		return toolSurfaceValues.includes(value as any) ? [] : ["on-demand | always のいずれかです"];
	},
};

export const contextLedgerSettingsSchema: FeatureSettingsSchema = {
	feature: "context-ledger",
	title: "Context Ledger",
	settings: [
		boolSetting("enabled", "General", true, "context-ledger tools と command を有効にします。false の場合、LLM-visible search/snapshot tools を登録しません。", true),
		toolSurfaceSetting,
		boolSetting(
			"postCompactionRestore.enabled",
			"Features",
			true,
			"compaction 後の次 turn で ledger snapshot を動的フラグメントとして自動注入し、working memory を復元する。手動で summarize_session_context を呼ばなくてよい。model-optimizer の compaction hint とは別 ID/優先度で併存する。",
			false,
		),
	],
};
