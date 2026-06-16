import { boolSetting } from "../../settings/simpleSchema.js";
import type { FeatureSettingsSchema, SettingSchema } from "../../settings/types.js";
import { MODE_PROFILE_NAMES, type ModeProfileName, type ModelRef, type ThinkingLevel } from "./utils.js";

/** Collaboration modes the user toggles between at runtime. */
const RUNTIME_MODES: ModeProfileName[] = ["main", "read_only", "auto", "sub"];
/** Profiles whose model is applied once when a separate Pi session launches. */
const WORK_PI_PROFILES: ModeProfileName[] = ["review_fix", "issue"];
const thinkingValues = ["off", "minimal", "low", "medium", "high", "xhigh"];

function profileCategory(name: ModeProfileName): string {
  return WORK_PI_PROFILES.includes(name) ? "Work Pi profiles" : "Mode profiles";
}

function profileLabel(name: ModeProfileName): string {
  switch (name) {
    case "review_fix": return "Review Fixer の child Pi";
    case "issue": return "Issue Work Pi";
    default: return `${name} mode`;
  }
}

function modelSetting(name: ModeProfileName): SettingSchema<ModelRef | undefined> {
  return {
    key: `models.${name}`,
    type: "modelRef",
    defaultValue: undefined,
    description: `${profileLabel(name)} で使う provider/modelId。未設定なら Pi の現在 model を使います。`,
    category: profileCategory(name),
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

function thinkingSetting(name: ModeProfileName): SettingSchema<ThinkingLevel | undefined> {
  return {
    key: `thinking.${name}`,
    type: "enum",
    defaultValue: undefined,
    description: `${profileLabel(name)} の reasoning effort。未設定なら Pi の現在値を使います。`,
    category: profileCategory(name),
    scopes: ["global", "workspace"],
    restartRequired: true,
    enumValues: thinkingValues,
    validate(value) { return value === undefined || thinkingValues.includes(String(value)) ? [] : [`thinking は ${thinkingValues.join(" | ")} のいずれかです`]; },
  };
}

export const modesSettingsSchema: FeatureSettingsSchema = {
  feature: "modes",
  title: "Collaboration Modes",
  settings: [
    boolSetting("enabled", "General", true, "read-only/sub mode commands と mode instructions を有効にします。false の場合、LLM-visible surface を登録しません。", true),
    ...MODE_PROFILE_NAMES.flatMap((name) => [modelSetting(name), thinkingSetting(name)]),
  ],
};
