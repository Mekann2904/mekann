import type { FeatureSettingsSchema, SettingSchema } from "../../settings/types.js";

function bool(key: string, category: string, defaultValue: boolean, description: string): SettingSchema<boolean> {
  return { key, type: "boolean", defaultValue, description, category, scopes: ["global", "workspace"], restartRequired: true, validate(value) { return typeof value === "boolean" ? [] : ["boolean である必要があります"]; } };
}

function num(key: string, category: string, defaultValue: number, min: number, max: number, description: string): SettingSchema<number> {
  return { key, type: "number", defaultValue, description, category, scopes: ["global", "workspace"], restartRequired: true, validate(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return ["整数である必要があります"];
    if (n < min || n > max) return [`${min}〜${max} の範囲で指定してください`];
    return [];
  } };
}

export const contextTrackerSettingsSchema: FeatureSettingsSchema = {
  feature: "context-tracker",
  title: "Context Tracker",
  settings: [
    bool("enabled", "General", true, "context pressure monitoring server and commands を有効にします。LLM tool は追加しません。"),
    num("port", "Server", 0, 0, 65535, "monitoring HTTP server port。0 なら空き port を自動選択します。"),
  ],
};
