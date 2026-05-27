import type { FeatureSettingsSchema } from "./types.js";
import { planModeSettingsSchema } from "../safety/plan-mode/settingsSchema.js";
import { sandboxSettingsSchema } from "../safety/sandbox/settingsSchema.js";
import { subagentSettingsSchema } from "../autonomy/subagent/settingsSchema.js";
import { outputGateSettingsSchema } from "../context/output-gate/settingsSchema.js";
import { codexSharedSettingsSchema } from "../utils/codex-shared/settingsSchema.js";
import { codexWebSearchSettingsSchema } from "../utils/codex-web-search/settingsSchema.js";

export const mekannSettingsSchemas: FeatureSettingsSchema[] = [planModeSettingsSchema, sandboxSettingsSchema, subagentSettingsSchema, outputGateSettingsSchema, codexSharedSettingsSchema, codexWebSearchSettingsSchema];
export function findSettingSchema(feature: string, key: string) {
  return mekannSettingsSchemas.find((s) => s.feature === feature)?.settings.find((s) => s.key === key);
}
