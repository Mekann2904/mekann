import { MEKANN_SUBAGENT_DEFAULTS } from "../../config.js";
import type { FeatureSettingsSchema, SettingSchema } from "../../settings/types.js";

export type SubagentDisplaySetting = "none" | "external-pi" | "external-split";
export const subagentDisplayValues = ["none", "external-pi", "external-split"] as const;

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

export const subagentSettingsSchema: FeatureSettingsSchema = {
  feature: "subagent",
  title: "Subagent",
  settings: [
    num("maxSubagents", "Capacity", MEKANN_SUBAGENT_DEFAULTS.maxSubagents, 1, 4, "同時実行する subagent 数。"),
    num("maxOpenAgents", "Capacity", MEKANN_SUBAGENT_DEFAULTS.maxOpenAgents, 1, 8, "root を含む open agent 数の上限。"),
    num("maxQueuedSubagents", "Capacity", MEKANN_SUBAGENT_DEFAULTS.maxQueuedSubagents, 0, 16, "待機 queue に入れられる subagent 数。"),
    num("externalPiSlots", "Capacity", MEKANN_SUBAGENT_DEFAULTS.externalPiSlots, 0, 4, "外部 Pi 表示に使う slot 数。"),
    num("maxDepth", "Boundaries", MEKANN_SUBAGENT_DEFAULTS.maxDepth, 0, 3, "subagent 階層の最大 depth。"),
    num("minWaitTimeoutMs", "Timeouts", MEKANN_SUBAGENT_DEFAULTS.minWaitTimeoutMs, 1000, 600000, "wait timeout の下限 ms。"),
    num("defaultWaitTimeoutMs", "Timeouts", MEKANN_SUBAGENT_DEFAULTS.defaultWaitTimeoutMs, 1000, 600000, "wait_agent の default timeout ms。"),
    num("maxWaitTimeoutMs", "Timeouts", MEKANN_SUBAGENT_DEFAULTS.maxWaitTimeoutMs, 1000, 600000, "wait timeout の上限 ms。"),
    { key: "display", type: "enum", defaultValue: MEKANN_SUBAGENT_DEFAULTS.display, description: "subagent 表示方法。", category: "Display", scopes: ["global", "workspace"], restartRequired: true, enumValues: [...subagentDisplayValues], validate(value) { return subagentDisplayValues.includes(value as SubagentDisplaySetting) ? [] : ["display は none | external-pi | external-split のいずれかです"]; } },
    bool("allowUnsafeExternalPi", "Display", MEKANN_SUBAGENT_DEFAULTS.allowUnsafeExternalPi, "external-pi/external-split で独立 Pi process を起動することを許可します。"),
    str("logDir", "Display", MEKANN_SUBAGENT_DEFAULTS.logDir, "subagent display log directory。空文字なら default location を使います。"),
    str("kittenBin", "Display", MEKANN_SUBAGENT_DEFAULTS.kittenBin, "Kitty remote control に使う kitten binary path/name。"),
    str("piCommand", "Display", MEKANN_SUBAGENT_DEFAULTS.piCommand, "external-pi/external-split で child Pi process を起動する shell command。"),
    str("extensionPath", "Display", "", "child Pi に -e で渡す extension path。空文字なら runtime default を使います。"),
    num("maxPatchBytes", "Boundaries", MEKANN_SUBAGENT_DEFAULTS.maxPatchBytes, 1024, 1_000_000, "subagent patch proposal の最大 bytes。"),
  ],
};
