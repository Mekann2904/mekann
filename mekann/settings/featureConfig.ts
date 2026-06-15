import { flattenEffective } from "./effective.js";
import { mekannSettingsSchemas } from "./registry.js";
import { getGlobalMekannSettingsPath, getWorkspaceMekannSettingsPath, loadSettings } from "./store.js";
import type { LoadedSettings } from "./store.js";
import type { EffectiveSetting, MekannSettingsFile } from "./types.js";

function getPathValue(obj: Record<string, unknown>, key: string): unknown {
  const parts = key.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function setPathValue(obj: Record<string, unknown>, key: string, value: unknown): void {
  const parts = key.split(".");
  let cur = obj;
  for (const part of parts.slice(0, -1)) {
    const next = cur[part];
    if (!next || typeof next !== "object" || Array.isArray(next)) cur[part] = {};
    cur = cur[part] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

export interface EffectiveFeatureConfig {
  feature: string;
  values: Record<string, unknown>;
  settings: EffectiveSetting[];
  diagnostics: string[];
}

/**
 * Load the global + workspace settings for a single (cwd, home) pair once,
 * so resolution and the schema-less compatibility fallback share the same
 * `LoadedSettings` instead of each reading disk again. (loadSettings itself
 * is memoized in store.ts; this dedupe cuts the per-call load count from 4 to 2
 * even on a cold cache.)
 */
function loadBoth(cwd: string, home?: string): { global: LoadedSettings; workspace: LoadedSettings } {
  return {
    global: loadSettings(getGlobalMekannSettingsPath(home)),
    workspace: loadSettings(getWorkspaceMekannSettingsPath(cwd)),
  };
}

function resolveFrom(feature: string, global: LoadedSettings, workspace: LoadedSettings): EffectiveFeatureConfig {
  const settings = flattenEffective(mekannSettingsSchemas, global, workspace).filter((s) => s.feature === feature);
  const values: Record<string, unknown> = {};
  for (const setting of settings) setPathValue(values, setting.key, setting.effectiveValue);
  return {
    feature,
    values,
    settings,
    diagnostics: [...global.errors, ...workspace.errors, ...settings.flatMap((s) => s.diagnostics)],
  };
}

/**
 * Deep Module Interface for Mekann settings resolution.
 * Owns global/workspace merge, schema defaults, source, and diagnostics so
 * Feature callers do not repeat `Number(...) || default`-style resolution.
 */
export function resolveEffectiveFeatureConfig(feature: string, cwd = process.cwd(), home?: string): EffectiveFeatureConfig {
  const { global, workspace } = loadBoth(cwd, home);
  return resolveFrom(feature, global, workspace);
}

export function featureValue(feature: string, key: string, cwd = process.cwd(), home?: string): unknown {
  const { global, workspace } = loadBoth(cwd, home);
  const resolved = resolveFrom(feature, global, workspace);
  const schemaValue = getPathValue(resolved.values, key);
  if (schemaValue !== undefined) return schemaValue;

  // Compatibility for settings that do not yet have a schema — reuse the already
  // loaded global/workspace instead of reading them a second time.
  const w = workspace.settings.features[feature] ?? {};
  const g = global.settings.features[feature] ?? {};
  return getPathValue(w, key) ?? getPathValue(g, key);
}

export function featureConfig(feature: string, cwd = process.cwd(), home?: string): Record<string, unknown> {
  const { global, workspace } = loadBoth(cwd, home);
  const resolved = resolveFrom(feature, global, workspace);

  // Compatibility: include unschematized keys after schema-backed values, reusing
  // the already loaded global/workspace (no second disk read).
  return {
    ...(global.settings.features[feature] ?? {}),
    ...(workspace.settings.features[feature] ?? {}),
    ...resolved.values,
  };
}

export function getNested(file: MekannSettingsFile, feature: string, key: string): unknown { return getPathValue(file.features[feature] ?? {}, key); }
