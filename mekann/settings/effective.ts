import type { EffectiveSetting, FeatureSettingsSchema } from "./types.js";
import type { LoadedSettings } from "./store.js";

function getPath(obj: Record<string, unknown>, key: string): unknown {
  let cur: unknown = obj;
  for (const part of key.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}
function hasPath(obj: Record<string, unknown>, key: string): boolean {
  let cur: unknown = obj;
  for (const part of key.split(".")) {
    if (!cur || typeof cur !== "object" || !Object.prototype.hasOwnProperty.call(cur, part)) return false;
    cur = (cur as Record<string, unknown>)[part];
  }
  return true;
}

export function flattenEffective(schemas: FeatureSettingsSchema[], global: LoadedSettings, workspace: LoadedSettings): EffectiveSetting[] {
  const out: EffectiveSetting[] = [];
  for (const feature of schemas) {
    const g = global.settings.features[feature.feature] ?? {};
    const w = workspace.settings.features[feature.feature] ?? {};
    for (const schema of feature.settings) {
      const hasW = hasPath(w, schema.key);
      const hasG = hasPath(g, schema.key);
      const workspaceValue = getPath(w, schema.key);
      const globalValue = getPath(g, schema.key);
      const effectiveValue = hasW ? workspaceValue : hasG ? globalValue : schema.defaultValue;
      const diagnostics = [...schema.validate(effectiveValue)];
      if (hasW && workspaceValue === schema.defaultValue) diagnostics.push("workspace override が default と同じです");
      out.push({ feature: feature.feature, key: schema.key, schema, defaultValue: schema.defaultValue, globalValue, workspaceValue, effectiveValue, source: hasW ? "workspace" : hasG ? "global" : "default", diagnostics });
    }
  }
  return out;
}

function leafPaths(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return prefix ? [prefix] : [];
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return prefix ? [prefix] : [];
  return entries.flatMap(([key, child]) => leafPaths(child, prefix ? `${prefix}.${key}` : key));
}

export function diagnosticsForUnknownKeys(schemas: FeatureSettingsSchema[], global: LoadedSettings, workspace: LoadedSettings): string[] {
  const messages: string[] = [...global.errors, ...workspace.errors];
  const known = new Map(schemas.map((s) => [s.feature, new Set(s.settings.map((x) => x.key))]));
  for (const loaded of [global, workspace]) {
    const scope = loaded === global ? "global" : "workspace";
    for (const [feature, values] of Object.entries(loaded.settings.features)) {
      const keys = known.get(feature);
      if (!keys) { messages.push(`${scope}: unknown feature ${feature}`); continue; }
      if (!values || typeof values !== "object") continue;
      for (const key of leafPaths(values)) {
        if (!keys.has(key)) {
          // A leaf path like "models.main.provider" may be a sub-key of a
          // known setting "models.main" (e.g. modelRef objects). Skip those.
          let isSubkey = false;
          const parts = key.split(".");
          for (let i = parts.length - 1; i >= 1; i--) {
            if (keys.has(parts.slice(0, i).join("."))) { isSubkey = true; break; }
          }
          if (!isSubkey) messages.push(`${scope}: ${feature}.${key} は unknown key です`);
        }
      }
    }
  }
  return messages;
}
