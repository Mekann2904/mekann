import type { FeatureSettingsSchema } from "./types.js";
import { planModeSettingsSchema } from "../safety/plan-mode/settingsSchema.js";
import { subagentSettingsSchema } from "../autonomy/subagent/settingsSchema.js";

export const mekannSettingsSchemas: FeatureSettingsSchema[] = [planModeSettingsSchema, subagentSettingsSchema];
export function findSettingSchema(feature: string, key: string) {
  return mekannSettingsSchemas.find((s) => s.feature === feature)?.settings.find((s) => s.key === key);
}
