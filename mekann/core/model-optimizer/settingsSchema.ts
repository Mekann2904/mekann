/**
 * model-optimizer — settings schema.
 *
 * Registered in mekann/settings/registry.ts so users can toggle feature
 * behaviour via `mekann settings.json`.
 *
 * Per-provider settings have been replaced by per-API-family settings
 * that align with the `model.api`–driven classification in profiles.ts.
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
			"openaiFamily.enabled",
			"API Families",
			true,
			"OpenAI API ファミリ (openai-responses, openai-completions, azure-openai-responses) 向けの最適化を有効にする。",
		),
		bool(
			"openaiCodex.enabled",
			"API Families",
			true,
			"OpenAI Codex API (openai-codex-responses) 向けの最適化を有効にする。",
		),
		bool(
			"overflowRecovery.enabled",
			"Features",
			true,
			"context overflow エラーの自動正規化を有効にする。",
		),
		bool(
			"metrics.enabled",
			"Features",
			true,
			"使用量とレイテンシの session-local 計測を有効にする。",
		),
		bool(
			"compactionObserver.enabled",
			"Features",
			true,
			"compaction lifecycle の観測を有効にする。",
		),
		bool(
			"postCompactionHint.enabled",
			"Features",
			true,
			"compaction 後の次 turn で provider-aware continuation hint を注入する。",
		),
		bool(
			"debugLogging",
			"Features",
			false,
			"デバッグログ（notify 表示）を有効にする。",
		),
	],
};
