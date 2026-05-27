/**
 * model-optimizer — settings schema.
 *
 * Registered in mekann/settings/registry.ts so users can toggle feature
 * behaviour via `mekann settings.json`.
 *
 * Settings with "(Phase 2)" in the description are reserved for future
 * implementation and have no runtime effect yet.
 */

import type { FeatureSettingsSchema, SettingSchema } from "../../settings/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bool(
	key: string,
	category: string,
	defaultValue: boolean,
	description: string,
): SettingSchema<boolean> {
	return {
		key,
		type: "boolean",
		defaultValue,
		description,
		category,
		scopes: ["global", "workspace"],
		restartRequired: false,
		validate(value) {
			return typeof value === "boolean" ? [] : ["boolean 値である必要があります"];
		},
	};
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const modelOptimizerSettingsSchema: FeatureSettingsSchema = {
	feature: "model-optimizer",
	title: "Model Optimizer",
	settings: [
		bool(
			"enabled",
			"General",
			true,
			"model-optimizer 拡張全体の有効/無効。",
		),
		bool(
			"openai.enabled",
			"Providers",
			true,
			"openai provider 向けの最適化を有効にする。",
		),
		bool(
			"openaiCodex.enabled",
			"Providers",
			true,
			"openai-codex provider 向けの最適化を有効にする。",
		),
		bool(
			"overflowRecovery.enabled",
			"Features",
			true,
			"context overflow エラーの自動正規化を有効にする。",
		),
		bool(
			"debugLogging",
			"Features",
			false,
			"デバッグログ（notify 表示）を有効にする。",
		),
	],
};
