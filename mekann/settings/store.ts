import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { getPiAgentConfigDir } from "../config.js";
import type { MekannSettingsFile } from "./types.js";

export function getGlobalMekannSettingsPath(home = homedir()): string { return join(getPiAgentConfigDir(home), "mekann.json"); }
export function getWorkspaceMekannSettingsPath(cwd = process.cwd()): string { return join(cwd, ".pi", "mekann.json"); }
export function emptySettings(): MekannSettingsFile { return { version: 1, features: {} }; }
export function hashText(text: string): string { return createHash("sha256").update(text).digest("hex"); }
export interface LoadedSettings { path: string; exists: boolean; settings: MekannSettingsFile; hash: string; errors: string[]; }

export function normalizeSettings(raw: unknown): MekannSettingsFile {
  if (!raw || typeof raw !== "object") return emptySettings();
  const r = raw as Record<string, unknown>;
  const features = r.features && typeof r.features === "object" ? r.features as Record<string, unknown> : {};
  const out: MekannSettingsFile = emptySettings();
  for (const [feature, value] of Object.entries(features)) {
    if (value && typeof value === "object" && !Array.isArray(value)) out.features[feature] = { ...(value as Record<string, unknown>) };
  }
  return out;
}

export function loadSettings(path: string): LoadedSettings {
  if (!existsSync(path)) return { path, exists: false, settings: emptySettings(), hash: "", errors: [] };
  try {
    const text = readFileSync(path, "utf8");
    return { path, exists: true, settings: normalizeSettings(JSON.parse(text)), hash: hashText(text), errors: [] };
  } catch (e) {
    return { path, exists: true, settings: emptySettings(), hash: "", errors: [`${path}: ${(e as Error).message}`] };
  }
}

function sleepSync(ms: number): void { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
export function withSettingsLock<T>(settingsPath: string, fn: () => T): T {
  const dir = dirname(settingsPath); if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const lockPath = `${settingsPath}.lock`; const start = Date.now();
  for (;;) {
    try { mkdirSync(lockPath); break; } catch (e) {
      if ((e as { code?: string }).code !== "EEXIST") throw e;
      try { if (Date.now() - statSync(lockPath).mtimeMs > 30_000) { rmSync(lockPath, { recursive: true, force: true }); continue; } } catch {}
      if (Date.now() - start > 5_000) throw new Error(`settings lock timeout: ${lockPath}`);
      sleepSync(25);
    }
  }
  try { return fn(); } finally { rmSync(lockPath, { recursive: true, force: true }); }
}

export function saveSettingsChecked(path: string, settings: MekannSettingsFile, expectedHash: string): string {
  return withSettingsLock(path, () => {
    const current = loadSettings(path);
    if (current.hash !== expectedHash) throw new Error(`settings changed concurrently: ${path}`);
    const json = JSON.stringify(settings, null, 2) + "\n";
    const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
    writeFileSync(tmp, json, "utf8");
    try { renameSync(tmp, path); } catch { writeFileSync(path, json, "utf8"); rmSync(tmp, { force: true }); }
    return hashText(json);
  });
}

export function setFeatureValue(file: MekannSettingsFile, feature: string, key: string, value: unknown): MekannSettingsFile {
  const next = normalizeSettings(file);
  next.features[feature] = { ...(next.features[feature] ?? {}) };
  const parts = key.split(".");
  let target = next.features[feature];
  for (const part of parts.slice(0, -1)) {
    const current = target[part];
    target[part] = current && typeof current === "object" && !Array.isArray(current) ? { ...(current as Record<string, unknown>) } : {};
    target = target[part] as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1];
  if (value === undefined || value === null || value === "") delete target[leaf];
  else target[leaf] = value;
  return next;
}
