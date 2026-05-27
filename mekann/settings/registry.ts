import type { FeatureSettingsSchema } from "./types.js";
import { modesSettingsSchema } from "../safety/modes/settingsSchema.js";
import { sandboxSettingsSchema } from "../safety/sandbox/settingsSchema.js";
import { subagentSettingsSchema } from "../autonomy/subagent/settingsSchema.js";
import { outputGateSettingsSchema } from "../context/output-gate/settingsSchema.js";
import { codexSharedSettingsSchema } from "../utils/codex-shared/settingsSchema.js";
import { codexWebSearchSettingsSchema } from "../utils/codex-web-search/settingsSchema.js";
import { modelOptimizerSettingsSchema } from "../core/model-optimizer/settingsSchema.js";
import { terminalSettingsSchema } from "../utils/terminal/settingsSchema.js";

export const mekannSettingsSchemas: FeatureSettingsSchema[] = [modesSettingsSchema, sandboxSettingsSchema, subagentSettingsSchema, outputGateSettingsSchema, codexSharedSettingsSchema, codexWebSearchSettingsSchema, modelOptimizerSettingsSchema, terminalSettingsSchema];
export function findSettingSchema(feature: string, key: string) {
  return mekannSettingsSchemas.find((s) => s.feature === feature)?.settings.find((s) => s.key === key);
}
