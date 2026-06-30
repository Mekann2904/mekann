import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { getPiAgentConfigDir } from "../config.js";
import type { MekannSettingsFile } from "./types.js";

export function getGlobalMekannSettingsPath(home = homedir()): string { return join(getPiAgentConfigDir(home), "mekann.json"); }
export function getWorkspaceMekannSettingsPath(cwd = process.cwd()): string { return join(cwd, ".pi", "mekann.json"); }
export function emptySettings(): MekannSettingsFile { return { version: 1, features: {} }; }
export function hashText(text: string): string { return createHash("sha256").update(text).digest("hex"); }
export interface LoadedSettings { path: string; exists: boolean; settings: MekannSettingsFile; hash: string; errors: string[]; }

/**
 * Process-scoped cache of `loadSettings` results, keyed by absolute settings path.
 *
 * Mekann settings files are effectively static for the lifetime of a Pi session
 * (there is no live-reload/fs.watch), yet hot paths (sandbox bash execution,
 * startup feature gating, output-gate) used to re-read + JSON.parse the same
 * files on every call. This cache memoizes the disk read so repeated reads of
 * the same path cost a Map lookup instead of synchronous file I/O.
 *
 * Invalidation:
 *   - `saveSettingsChecked` refreshes the entry for the path it just wrote, so
 *     post-write reads never return stale values.
 *   - `invalidateSettingsCache(path?)` is the escape hatch for explicit reloads
 *     (e.g. a Pi reload/session_start hook that knows settings changed).
 */
const settingsCache = new Map<string, LoadedSettings>();

function cloneJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (value && typeof value === "object") return cloneJsonObject(value as Record<string, unknown>);
  return value;
}

function cloneJsonObject(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) out[key] = cloneJsonValue(item);
  return out;
}

function cloneSettings(settings: MekannSettingsFile): MekannSettingsFile {
  return { version: settings.version, features: cloneJsonObject(settings.features) as Record<string, Record<string, unknown>> };
}

/**
 * Returns an independent structural copy of a cached `LoadedSettings` so caller
 * mutations never poison the shared cache snapshot. Settings are JSON-shaped,
 * so a small recursive clone keeps the cache boundary explicit without bringing
 * in a heavier dependency.
 */
function snapshotLoaded(loaded: LoadedSettings): LoadedSettings {
  return { ...loaded, settings: cloneSettings(loaded.settings), errors: [...loaded.errors] };
}

/**
 * Drop the cached settings for `path`, or the whole cache when `path` is
 * omitted. Use after any out-of-band settings mutation that bypasses
 * `saveSettingsChecked`, or when a Pi reload/session_start must re-read disk.
 */
export function invalidateSettingsCache(path?: string): void {
  if (path === undefined) settingsCache.clear();
  else settingsCache.delete(resolvePath(path));
}

/**
 * Internal: the canonical cached entry for `path`, reading disk on a miss.
 *
 * The cache stores ONE canonical `LoadedSettings` per resolved path. Mutating
 * callers (`loadSettings`) get a defensive clone of it via `snapshotLoaded`;
 * verified read-only hot paths (`loadSettingsReadonly`) get the canonical
 * object directly with zero allocation. Storing a single canonical object —
 * instead of a per-read clone — is what makes the read-only accessor safe to
 * share (issue #168 / IC-169).
 */
function canonicalLoaded(cacheKey: string, path: string): LoadedSettings {
  const cached = settingsCache.get(cacheKey);
  if (cached) return cached;
  const loaded = readSettingsFromDisk(path);
  settingsCache.set(cacheKey, loaded);
  return loaded;
}

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

function readSettingsFromDisk(path: string): LoadedSettings {
  if (!existsSync(path)) return { path, exists: false, settings: emptySettings(), hash: "", errors: [] };
  try {
    const text = readFileSync(path, "utf8");
    return { path, exists: true, settings: normalizeSettings(JSON.parse(text)), hash: hashText(text), errors: [] };
  } catch (e) {
    return { path, exists: true, settings: emptySettings(), hash: "", errors: [`${path}: ${(e as Error).message}`] };
  }
}

/**
 * Load settings for `path`, returning an independent snapshot each call so
 * caller mutations never poison the shared cache. The disk read is memoized for
 * the process: repeated calls with the same path return a fresh clone of the
 * cached result without touching disk. Writes via `saveSettingsChecked` refresh
 * the cache; call `invalidateSettingsCache` to force a fresh disk read.
 *
 * Use this for any code path that may MUTATE the returned settings (aliasing and
 * reassigning a feature entry, in-place edits before `saveSettingsChecked`).
 */
export function loadSettings(path: string): LoadedSettings {
  return snapshotLoaded(canonicalLoaded(resolvePath(path), path));
}

/**
 * Read-only accessor for verified non-mutating hot paths (feature gating,
 * sandbox bash mode/allowlist, output-gate thresholds). Returns the shared
 * canonical cache entry directly — NO recursive clone — so repeated reads cost
 * a Map lookup and zero allocation instead of a deep JSON clone on every call
 * (issue #168 / IC-169).
 *
 * Contract: callers MUST NOT mutate the returned `settings` or any nested
 * object/array. The returned object is shared across every reader for this
 * path; mutating it would poison the cache for the whole process. Any caller
 * that cannot guarantee read-only access must use the cloning `loadSettings`
 * instead. `saveSettingsChecked`/`invalidateSettingsCache` remain the only
 * supported ways to refresh the value.
 */
export function loadSettingsReadonly(path: string): LoadedSettings {
  return canonicalLoaded(resolvePath(path), path);
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
    // Bypass the process cache for the optimistic concurrency check. Another
    // process may have written this file since our caller loaded it, and using a
    // cached hash here would silently overwrite that external change.
    const current = readSettingsFromDisk(path);
    if (current.hash !== expectedHash) {
      settingsCache.set(resolvePath(path), snapshotLoaded(current));
      throw new Error(`settings changed concurrently: ${path}`);
    }
    const json = JSON.stringify(settings, null, 2) + "\n";
    const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
    writeFileSync(tmp, json, "utf8");
    try { renameSync(tmp, path); } catch { writeFileSync(path, json, "utf8"); rmSync(tmp, { force: true }); }
    const newHash = hashText(json);
    // Refresh the cache with the just-written content so subsequent reads see
    // the new value without a disk round-trip (and never see the stale one).
    settingsCache.set(resolvePath(path), { path, exists: true, settings: cloneSettings(normalizeSettings(settings)), hash: newHash, errors: [] });
    return newHash;
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
