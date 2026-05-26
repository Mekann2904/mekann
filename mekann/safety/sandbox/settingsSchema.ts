import { MEKANN_SANDBOX_DEFAULTS } from "../../config.js";
import type { FeatureSettingsSchema, SettingSchema } from "../../settings/types.js";

function num(key: string, category: string, defaultValue: number, min: number, max: number, description: string): SettingSchema<number> {
  return { key, type: "number", defaultValue, description, category, scopes: ["global", "workspace"], restartRequired: true, validate(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return ["整数である必要があります"];
    if (n < min || n > max) return [`${min}〜${max} の範囲で指定してください`];
    return [];
  } };
}

export const sandboxSettingsSchema: FeatureSettingsSchema = {
  feature: "sandbox",
  title: "Sandbox",
  settings: [
    num("llmOutputMaxBytes", "Limits", MEKANN_SANDBOX_DEFAULTS.llmOutputMaxBytes, 1024, 1_048_576, "LLM 出力の最大バイト数。"),
    num("llmOutputMaxLines", "Limits", MEKANN_SANDBOX_DEFAULTS.llmOutputMaxLines, 100, 50_000, "LLM 出力の最大行数。"),
  ],
};
