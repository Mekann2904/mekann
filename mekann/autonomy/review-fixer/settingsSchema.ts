import { boolSetting } from "../../settings/simpleSchema.js";
import type { FeatureSettingsSchema, SettingSchema } from "../../settings/types.js";

const reasoningEffortValues = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

function modelSetting(): SettingSchema<{ provider: string; modelId: string } | undefined> {
  return {
    key: "model",
    type: "modelRef",
    defaultValue: undefined,
    description: "Review fixer で使う provider/modelId。未設定なら Pi の現在 model を使います。",
    category: "Model",
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

export const reviewFixerSettingsSchema: FeatureSettingsSchema = {
  feature: "review-fixer",
  title: "Review Fixer",
  settings: [
    boolSetting("enabled", "General", true, "Review fixer tool を有効にします。thermo-nuclear-code-quality-review に基づく同期 review + edit を child Pi で行います。"),
    modelSetting(),
    {
      key: "reasoningEffort",
      type: "enum",
      defaultValue: "high",
      description: "Review fixer の reasoning effort。未設定なら high を使います。",
      category: "Model",
      scopes: ["global", "workspace"],
      restartRequired: true,
      enumValues: [...reasoningEffortValues],
      validate(value) { return reasoningEffortValues.includes(value as any) ? [] : ["reasoningEffort が不正です"]; },
    },
    {
      key: "maxFixRetries",
      type: "number",
      defaultValue: 3,
      description: "verification 失敗時の修正再試行回数上限。",
      category: "Capacity",
      scopes: ["global", "workspace"],
      restartRequired: true,
      validate(value) {
        const n = Number(value);
        if (!Number.isFinite(n) || !Number.isInteger(n)) return ["整数である必要があります"];
        if (n < 1 || n > 10) return ["1〜10 の範囲で指定してください"];
        return [];
      },
    },
  ],
};
