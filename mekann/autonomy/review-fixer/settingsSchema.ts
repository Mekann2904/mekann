import { boolSetting } from "../../settings/simpleSchema.js";
import type { FeatureSettingsSchema } from "../../settings/types.js";

/**
 * Review Fixer feature settings.
 *
 * The model + thinking for Review Fixer's child Pi live under the `modes`
 * feature's Work Pi profile (`review_fix`) — see modes/settingsSchema.ts — so
 * all Work Pi model config is centralized in Collaboration Modes. This feature
 * owns only its enabled flag and capacity (retry limit).
 */
export const reviewFixerSettingsSchema: FeatureSettingsSchema = {
  feature: "review-fixer",
  title: "Review Fixer",
  settings: [
    boolSetting("enabled", "General", true, "Review fixer tool を有効にします。thermo-nuclear-code-quality-review に基づく同期 review + edit を child Pi で行います。"),
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
