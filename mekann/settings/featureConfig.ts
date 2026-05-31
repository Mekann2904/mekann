import { flattenEffective } from "./effective.js";
import { mekannSettingsSchemas } from "./registry.js";
import { getGlobalMekannSettingsPath, getWorkspaceMekannSettingsPath, loadSettings } from "./store.js";
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
 * Deep Module Interface for Mekann settings resolution.
 * Owns global/workspace merge, schema defaults, source, and diagnostics so
 * Feature callers do not repeat `Number(...) || default`-style resolution.
 */
export function resolveEffectiveFeatureConfig(feature: string, cwd = process.cwd(), home?: string): EffectiveFeatureConfig {
  const global = loadSettings(getGlobalMekannSettingsPath(home));
  const workspace = loadSettings(getWorkspaceMekannSettingsPath(cwd));
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

export function featureValue(feature: string, key: string, cwd = process.cwd(), home?: string): unknown {
  const resolved = resolveEffectiveFeatureConfig(feature, cwd, home);
  const schemaValue = getPathValue(resolved.values, key);
  if (schemaValue !== undefined) return schemaValue;

  // Compatibility for settings that do not yet have a schema.
  const global = loadSettings(getGlobalMekannSettingsPath(home));
  const workspace = loadSettings(getWorkspaceMekannSettingsPath(cwd));
  const w = workspace.settings.features[feature] ?? {};
  const g = global.settings.features[feature] ?? {};
  return getPathValue(w, key) ?? getPathValue(g, key);
}

export function featureConfig(feature: string, cwd = process.cwd(), home?: string): Record<string, unknown> {
  const resolved = resolveEffectiveFeatureConfig(feature, cwd, home);

  // Compatibility: include unschematized keys after schema-backed values.
  const global = loadSettings(getGlobalMekannSettingsPath(home));
  const workspace = loadSettings(getWorkspaceMekannSettingsPath(cwd));
  return {
    ...(global.settings.features[feature] ?? {}),
    ...(workspace.settings.features[feature] ?? {}),
    ...resolved.values,
  };
}

export function getNested(file: MekannSettingsFile, feature: string, key: string): unknown { return getPathValue(file.features[feature] ?? {}, key); }
