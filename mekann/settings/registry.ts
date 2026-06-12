import type { FeatureSettingsSchema } from "./types.js";
import { modesSettingsSchema } from "../safety/modes/settingsSchema.js";
import { sandboxSettingsSchema } from "../safety/sandbox/settingsSchema.js";
import { goalSettingsSchema } from "../autonomy/goal/settingsSchema.js";
import { subagentSettingsSchema } from "../autonomy/subagent/settingsSchema.js";
import { autoresearchSettingsSchema } from "../autonomy/autoresearch/settingsSchema.js";
import { commandNormalizationSettingsSchema } from "../context/command-normalization/settingsSchema.js";
import { outputGateSettingsSchema } from "../context/output-gate/settingsSchema.js";
import { contextLedgerSettingsSchema } from "../context/ledger/settingsSchema.js";
import { contextTrackerSettingsSchema } from "../context/context-tracker/settingsSchema.js";
import { cacheableContextSettingsSchema } from "../context/cacheable-context/settingsSchema.js";
import { codexSharedSettingsSchema } from "../utils/codex-shared/settingsSchema.js";
import { codexWebSearchSettingsSchema } from "../utils/codex-web-search/settingsSchema.js";
import { modelOptimizerSettingsSchema } from "../core/model-optimizer/settingsSchema.js";
import { terminalSettingsSchema } from "../utils/terminal/settingsSchema.js";
import { codexLimitsSettingsSchema } from "../utils/codex-limits/settingsSchema.js";
import { dashboardSettingsSchema } from "../utils/dashboard/settingsSchema.js";
import { zipRepoSettingsSchema } from "../utils/zip-repo/settingsSchema.js";
import { terminalShortcutsSettingsSchema } from "../utils/terminal-shortcuts/settingsSchema.js";
import { settingsEditorSettingsSchema } from "../utils/settings-editor/settingsSchema.js";
import { skillSurfaceSettingsSchema } from "../skill-surface/settingsSchema.js";

export const mekannSettingsSchemas: FeatureSettingsSchema[] = [modesSettingsSchema, sandboxSettingsSchema, goalSettingsSchema, subagentSettingsSchema, autoresearchSettingsSchema, commandNormalizationSettingsSchema, outputGateSettingsSchema, contextLedgerSettingsSchema, contextTrackerSettingsSchema, cacheableContextSettingsSchema, codexSharedSettingsSchema, codexWebSearchSettingsSchema, codexLimitsSettingsSchema, dashboardSettingsSchema, zipRepoSettingsSchema, terminalShortcutsSettingsSchema, settingsEditorSettingsSchema, skillSurfaceSettingsSchema, modelOptimizerSettingsSchema, terminalSettingsSchema];
export function findSettingSchema(feature: string, key: string) {
  return mekannSettingsSchemas.find((s) => s.feature === feature)?.settings.find((s) => s.key === key);
}
