/**
 * model-optimizer/deepseek — settings for the DeepSeek optimizer module.
 */

import type { SettingSchema } from "../../../settings/types.js";
import { boolSetting } from "../settings-utils.js";

export const deepseekOptimizerSettings: SettingSchema<boolean>[] = [
	boolSetting(
		"deepseek.enabled",
		"API Families",
		true,
		"DeepSeek API 向けの最適化を有効にする。",
	),
];
