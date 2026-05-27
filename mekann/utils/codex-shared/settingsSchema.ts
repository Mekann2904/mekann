import { MEKANN_CODEX_DEFAULTS } from "../../config.js";
import type { FeatureSettingsSchema, SettingSchema } from "../../settings/types.js";

function str(key: string, category: string, defaultValue: string, description: string): SettingSchema<string> {
	return {
		key,
		type: "string",
		defaultValue,
		description,
		category,
		scopes: ["global", "workspace"],
		restartRequired: false,
		validate(value) {
			return typeof value === "string" && value.trim().length > 0 ? [] : ["空でない文字列である必要があります"];
		},
	};
}

function num(key: string, category: string, defaultValue: number, min: number, max: number, description: string): SettingSchema<number> {
	return {
		key,
		type: "number",
		defaultValue,
		description,
		category,
		scopes: ["global", "workspace"],
		restartRequired: false,
		validate(value) {
			const n = Number(value);
			if (!Number.isFinite(n) || !Number.isInteger(n)) return ["整数である必要があります"];
			if (n < min || n > max) return [`${min}〜${max} の範囲で指定してください`];
			return [];
		},
	};
}

export const codexSharedSettingsSchema: FeatureSettingsSchema = {
	feature: "codex-shared",
	title: "Codex Shared",
	settings: [
		str("baseUrl", "Advanced", MEKANN_CODEX_DEFAULTS.baseUrl, "Codex API base URL。通常は変更不要です。"),
		num("modelCacheTtlMs", "Advanced", MEKANN_CODEX_DEFAULTS.modelCacheTtlMs, 0, 24 * 60 * 60 * 1000, "Codex model catalog cache TTL ms。通常は変更不要です。"),
	],
};
