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
    { key: "display", type: "enum", defaultValue: "external-split", description: "subagent 表示方法。", category: "Display", scopes: ["global", "workspace"], restartRequired: true, enumValues: [...subagentDisplayValues], validate(value) { return subagentDisplayValues.includes(value as SubagentDisplaySetting) ? [] : ["display は none | external-pi | external-split のいずれかです"]; } },
  ],
};
