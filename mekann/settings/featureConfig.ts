import { getGlobalMekannSettingsPath, getWorkspaceMekannSettingsPath, loadSettings } from "./store.js";
import type { MekannSettingsFile } from "./types.js";

function getPathValue(obj: Record<string, unknown>, key: string): unknown {
  const parts = key.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function featureValue(feature: string, key: string, cwd = process.cwd(), home?: string): unknown {
  const global = loadSettings(getGlobalMekannSettingsPath(home));
  const workspace = loadSettings(getWorkspaceMekannSettingsPath(cwd));
  const w = workspace.settings.features[feature] ?? {};
  const g = global.settings.features[feature] ?? {};
  return getPathValue(w, key) ?? getPathValue(g, key);
}

export function featureConfig(feature: string, cwd = process.cwd(), home?: string): Record<string, unknown> {
  const global = loadSettings(getGlobalMekannSettingsPath(home));
  const workspace = loadSettings(getWorkspaceMekannSettingsPath(cwd));
  return { ...(global.settings.features[feature] ?? {}), ...(workspace.settings.features[feature] ?? {}) };
}

export function getNested(file: MekannSettingsFile, feature: string, key: string): unknown { return getPathValue(file.features[feature] ?? {}, key); }
