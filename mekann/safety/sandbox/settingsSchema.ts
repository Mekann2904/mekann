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

function bool(key: string, category: string, defaultValue: boolean, description: string): SettingSchema<boolean> {
  return { key, type: "boolean", defaultValue, description, category, scopes: ["global", "workspace"], restartRequired: true, validate(value) { return typeof value === "boolean" ? [] : ["boolean である必要があります"]; } };
}

function str(key: string, category: string, defaultValue: string, description: string): SettingSchema<string> {
  return { key, type: "string", defaultValue, description, category, scopes: ["global", "workspace"], restartRequired: true, validate(value) { return typeof value === "string" ? [] : ["文字列である必要があります"]; } };
}

const bashModeValues = ["off", "ask", "sandboxed", "yolo"] as const;

export const sandboxSettingsSchema: FeatureSettingsSchema = {
  feature: "sandbox",
  title: "Sandbox",
  settings: [
    bool("enabled", "General", true, "bash tool の sandbox override と /sandbox command を有効にします。false の場合、Pi 標準 bash tool に干渉しません。"),
    { key: "bashMode", type: "enum", defaultValue: "sandboxed", description: "ユーザー向け bash mode。off は bash 禁止、ask は allowlist 外をユーザー確認、sandboxed は filesystem sandbox 内で実行、yolo は OS sandbox なしで実行します。", category: "Bash Policy", scopes: ["global", "workspace"], restartRequired: false, enumValues: [...bashModeValues], validate(value) { return bashModeValues.includes(value as any) ? [] : ["off | ask | sandboxed | yolo のいずれかです"]; } },
    str("bashAllowlist", "Bash Policy", "", "bashMode=ask で確認なしに実行できる bash command の exact match 一覧。1 行に 1 command。"),
    bool("allowPersistentBashApprovals", "Bash Policy", true, "allowlist 外 command をユーザーが workspace mekann.json に永続許可できるようにします。"),
    num("llmOutputMaxBytes", "Limits", MEKANN_SANDBOX_DEFAULTS.llmOutputMaxBytes, 1024, 1_048_576, "LLM 出力の最大バイト数。"),
    num("llmOutputMaxLines", "Limits", MEKANN_SANDBOX_DEFAULTS.llmOutputMaxLines, 100, 50_000, "LLM 出力の最大行数。"),
  ],
};
