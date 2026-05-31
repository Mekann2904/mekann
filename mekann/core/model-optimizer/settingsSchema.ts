/**
 * model-optimizer — settings schema.
 *
 * Registered in mekann/settings/registry.ts so users can toggle feature
 * behaviour via Mekann-owned `mekann.json` files.
 *
 * Base settings are defined here.  Per-module settings are contributed
 * by each provider optimizer module and concatenated at build time.
 */

import type { FeatureSettingsSchema, SettingSchema } from "../../settings/types.js";
import { optimizerModules } from "./modules.js";

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
// Base settings (feature-level, not module-specific)
// ---------------------------------------------------------------------------

const baseSettings: SettingSchema<boolean>[] = [
	bool(
		"enabled",
		"General",
		true,
		"model-optimizer 拡張全体の有効/無効。",
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
];

// ---------------------------------------------------------------------------
// Schema (base + all module settings)
// ---------------------------------------------------------------------------

export const modelOptimizerSettingsSchema: FeatureSettingsSchema = {
	feature: "model-optimizer",
	title: "Model Optimizer",
	settings: [
		...baseSettings,
		...optimizerModules.flatMap((m) => m.settings),
	],
};
