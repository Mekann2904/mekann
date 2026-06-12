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
import { boolSetting } from "./settings-utils.js";

// ---------------------------------------------------------------------------
// Base settings (feature-level, not module-specific)
// ---------------------------------------------------------------------------

const baseSettings: SettingSchema<boolean>[] = [
	boolSetting(
		"enabled",
		"General",
		true,
		"model-optimizer 拡張全体の有効/無効。",
	),
	boolSetting(
		"overflowRecovery.enabled",
		"Features",
		true,
		"context overflow エラーの自動正規化を有効にする。",
	),
	boolSetting(
		"metrics.enabled",
		"Features",
		true,
		"使用量とレイテンシの session-local 計測を有効にする。",
	),
	boolSetting(
		"compactionObserver.enabled",
		"Features",
		true,
		"compaction lifecycle の観測を有効にする。",
	),
	boolSetting(
		"postCompactionHint.enabled",
		"Features",
		true,
		"compaction 後の次 turn で provider-aware continuation hint を注入する。",
	),
	boolSetting(
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
