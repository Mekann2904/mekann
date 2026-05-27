import { MEKANN_CODEX_WEB_SEARCH_DEFAULTS } from "../../config.js";
import type { CodexReasoningEffort, SearchContextSize } from "../codex-shared/types.js";
import type { FeatureSettingsSchema, SettingSchema } from "../../settings/types.js";

const searchContextValues: SearchContextSize[] = ["low", "medium", "high"];
const effortValues: CodexReasoningEffort[] = ["none", "minimal", "low", "medium", "high", "xhigh"];

function bool(key: string, category: string, defaultValue: boolean, description: string): SettingSchema<boolean> {
	return { key, type: "boolean", defaultValue, description, category, scopes: ["global", "workspace"], restartRequired: false, validate(value) { return typeof value === "boolean" ? [] : ["boolean である必要があります"]; } };
}

function str(key: string, category: string, defaultValue: string, description: string): SettingSchema<string> {
	return { key, type: "string", defaultValue, description, category, scopes: ["global", "workspace"], restartRequired: false, validate(value) { return typeof value === "string" && value.trim().length > 0 ? [] : ["空でない文字列である必要があります"]; } };
}

function optionalStr(key: string, category: string, defaultValue: string | undefined, description: string): SettingSchema<string | undefined> {
	return { key, type: "string", defaultValue, description, category, scopes: ["global", "workspace"], restartRequired: false, validate(value) { return value === undefined || (typeof value === "string" && value.trim().length > 0) ? [] : ["空でない文字列、または unset である必要があります"]; } };
}

export const codexWebSearchSettingsSchema: FeatureSettingsSchema = {
	feature: "codex-web-search",
	title: "Codex Web Search",
	settings: [
		bool("enabled", "Access", MEKANN_CODEX_WEB_SEARCH_DEFAULTS.enabled, "Codex web search tool executionを有効にします。false の場合も tool 登録は維持され、実行時に無効化メッセージを返します。"),
		bool("externalWebAccess", "Access", MEKANN_CODEX_WEB_SEARCH_DEFAULTS.externalWebAccess, "Codex web search request の external_web_access を有効にします。"),
		{ key: "defaultSearchContextSize", type: "enum", defaultValue: MEKANN_CODEX_WEB_SEARCH_DEFAULTS.defaultSearchContextSize, description: "searchContextSize 未指定時のデフォルト。", category: "Search", scopes: ["global", "workspace"], restartRequired: false, enumValues: searchContextValues, validate(value) { return searchContextValues.includes(value as SearchContextSize) ? [] : ["low | medium | high のいずれかです"]; } },
		optionalStr("model", "Model", MEKANN_CODEX_WEB_SEARCH_DEFAULTS.model, "Codex web search に使う明示 model id。unset の場合は自動解決します。"),
		{ key: "effort", type: "enum", defaultValue: MEKANN_CODEX_WEB_SEARCH_DEFAULTS.effort, description: "明示 model / Codex current model で使う reasoning effort。unset の場合は送信しません。", category: "Model", scopes: ["global", "workspace"], restartRequired: false, enumValues: effortValues, validate(value) { return value === undefined || effortValues.includes(value as CodexReasoningEffort) ? [] : ["minimal | low | medium | high のいずれか、または unset です"]; } },
		str("nonCodexDefaultModel", "Model", MEKANN_CODEX_WEB_SEARCH_DEFAULTS.nonCodexDefaultModel, "現在 provider が openai-codex 以外のときに優先する Codex model id。"),
		{ key: "nonCodexDefaultEffort", type: "enum", defaultValue: MEKANN_CODEX_WEB_SEARCH_DEFAULTS.nonCodexDefaultEffort, description: "nonCodexDefaultModel で使う reasoning effort。", category: "Model", scopes: ["global", "workspace"], restartRequired: false, enumValues: effortValues, validate(value) { return effortValues.includes(value as CodexReasoningEffort) ? [] : ["minimal | low | medium | high のいずれかです"]; } },
	],
};
