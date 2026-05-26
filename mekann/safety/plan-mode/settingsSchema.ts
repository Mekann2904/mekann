import type { FeatureSettingsSchema, SettingSchema } from "../../settings/types.js";
import type { ModelRef, ThinkingLevel } from "./utils.js";

const modes = ["main", "plan", "read_only", "auto", "sub"] as const;
const thinkingValues = ["off", "minimal", "low", "medium", "high", "xhigh"];

function modelSetting(mode: typeof modes[number]): SettingSchema<ModelRef | undefined> {
  return {
    key: `models.${mode}`,
    type: "modelRef",
    defaultValue: undefined,
    description: `${mode} mode で使う provider/modelId。未設定なら Pi の現在 model を使います。`,
    category: "Mode profiles",
    scopes: ["global", "workspace"],
    restartRequired: true,
    validate(value) {
      if (value === undefined) return [];
      if (!value || typeof value !== "object") return ["model は object である必要があります"];
      const v = value as Record<string, unknown>;
      return typeof v.provider === "string" && v.provider && typeof v.modelId === "string" && v.modelId ? [] : ["model は provider と modelId が必要です"];
    },
  };
}

function thinkingSetting(mode: typeof modes[number]): SettingSchema<ThinkingLevel | undefined> {
  return {
    key: `thinking.${mode}`,
    type: "enum",
    defaultValue: undefined,
    description: `${mode} mode の reasoning effort。未設定なら Pi の現在値を使います。`,
    category: "Mode profiles",
    scopes: ["global", "workspace"],
    restartRequired: true,
    enumValues: thinkingValues,
    validate(value) { return value === undefined || thinkingValues.includes(String(value)) ? [] : [`thinking は ${thinkingValues.join(" | ")} のいずれかです`]; },
  };
}

export const planModeSettingsSchema: FeatureSettingsSchema = {
  feature: "plan-mode",
  title: "Plan mode",
  settings: modes.flatMap((m) => [modelSetting(m), thinkingSetting(m)]),
};
