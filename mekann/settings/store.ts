import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, watch, writeFileSync, type FSWatcher } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { createHash, randomBytes } from "node:crypto";
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
 *   - `fs.watch` (IC-035): the first read of each existing settings file also
 *     starts a debounced watcher so edits made by external processes — the
 *     `mekann settings-editor` CLI, a text editor, another Pi — invalidate the
 *     cached entry automatically. `fs.watch` is best-effort (some sandboxes
 *     disable it); when unavailable we silently degrade to explicit
 *     invalidation only, which is the pre-existing behaviour.
 */
const settingsCache = new Map<string, LoadedSettings>();

// --- fs.watch-backed cache invalidation (IC-035) ----------------------------
//
// One watcher per cached settings path. The set is bounded by the number of
// distinct settings files (global + workspace), so it never grows unboundedly,
// and watchers live for the process — exactly what a long-running Pi session
// wants. Watch events are debounced (a burst of events coalesces into one
// invalidation) and never throw: a watcher error simply stops watching that
// path and falls back to explicit invalidation.
const SETTINGS_WATCH_DEBOUNCE_MS = 100;

interface SettingsWatcherHandle {
  watcher: FSWatcher;
  timer: ReturnType<typeof setTimeout> | undefined;
}

const settingsWatchers = new Map<string, SettingsWatcherHandle>();

function startSettingsWatcher(cacheKey: string, filePath: string): void {
  if (settingsWatchers.has(cacheKey)) return;
  const handle: SettingsWatcherHandle = { watcher: undefined as unknown as FSWatcher, timer: undefined };
  const trigger = (): void => {
    if (handle.timer !== undefined) return;
    handle.timer = setTimeout(() => {
      handle.timer = undefined;
      // Drop the cached entry; the next `loadSettings` re-reads disk.
      settingsCache.delete(cacheKey);
    }, SETTINGS_WATCH_DEBOUNCE_MS);
  };
  try {
    const watcher = watch(filePath, () => trigger());
    watcher.on("error", () => {
      const current = settingsWatchers.get(cacheKey);
      if (current) {
        if (current.timer !== undefined) clearTimeout(current.timer);
        settingsWatchers.delete(cacheKey);
      }
      try { watcher.close(); } catch { /* best-effort */ }
    });
    handle.watcher = watcher;
    settingsWatchers.set(cacheKey, handle);
  } catch {
    // `fs.watch` unavailable for this path/platform (file missing, sandbox
    // restrictions, etc.). Degrade to explicit invalidation only — no watcher.
  }
}

function stopSettingsWatcher(cacheKey: string): void {
  const handle = settingsWatchers.get(cacheKey);
  if (!handle) return;
  settingsWatchers.delete(cacheKey);
  if (handle.timer !== undefined) clearTimeout(handle.timer);
  try { handle.watcher.close(); } catch { /* best-effort */ }
}

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
  if (path === undefined) {
    for (const key of [...settingsWatchers.keys()]) stopSettingsWatcher(key);
    settingsCache.clear();
  } else {
    const key = resolvePath(path);
    stopSettingsWatcher(key);
    settingsCache.delete(key);
  }
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
 * Load settings for `path`, memoizing the (synchronous) disk read for the
 * process. Repeated calls with the same path return a snapshot of the cached
 * result without touching disk. Writes via `saveSettingsChecked` refresh the
 * cache; call `invalidateSettingsCache` to force a fresh disk read.
 */
export function loadSettings(path: string): LoadedSettings {
  const cacheKey = resolvePath(path);
  const cached = settingsCache.get(cacheKey);
  if (cached) return snapshotLoaded(cached);
  const loaded = readSettingsFromDisk(path);
  settingsCache.set(cacheKey, snapshotLoaded(loaded));
  // Watch existing files so external edits (editor / CLI / other Pi) invalidate
  // the cache. Non-existent files can't be watched; once created (typically via
  // `saveSettingsChecked`, which refreshes the cache itself) the next read
  // starts a watcher.
  if (loaded.exists) startSettingsWatcher(cacheKey, path);
  return snapshotLoaded(loaded);
}

/**
 * Robust synchronous backoff. `Atomics.wait` on a `SharedArrayBuffer` is the
 * cheap path, but some sandboxes (macOS seatbelt, containers) disable SAB, in
 * which case `Atomics.wait` throws `TypeError` and would crash the whole lock
 * loop (IC-034). Fall back to a bounded busy-wait so contention backoff keeps
 * working instead of bringing down settings I/O.
 */
function sleepSync(ms: number): void {
  if (ms <= 0) return;
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      /* SharedArrayBuffer unavailable: spin until the backoff has elapsed. */
    }
  }
}

function errnoCode(e: unknown): string | undefined {
  return (e as { code?: string } | null | undefined)?.code;
}

// --- Settings file lock (IC-033) --------------------------------------------
//
// `mkdirSync` is an atomic create-or-fail (O_EXCL) lock directory. The lock is
// broken only when it is *definitively* stale: the owning process is dead
// (`process.kill(pid, 0)` → ESRCH), or — as a last-resort safety valve against
// pid reuse / unreadable owner info — older than `staleMs`. A live holder is
// never displaced even if its critical section runs long, so two processes can
// no longer overwrite the settings concurrently (the old 30s-only heuristic
// would steal a still-running writer). `owner.json` inside the lock dir carries
// `{ pid, token, startedAt }`; on release we only remove a lock whose token is
// still ours, so a lock that was stale-broken and re-acquired mid-flight is
// left for its new owner. We keep the directory-based lock (rather than an
// O_EXCL *file*) so there is no on-disk format migration window with older
// Mekann processes.
const SETTINGS_LOCK_TIMEOUT_MS = 5_000;
const SETTINGS_LOCK_POLL_MS = 25;
const SETTINGS_LOCK_STALE_MS = 60_000;

export interface SettingsLockOptions {
  /** Total time to keep trying to acquire the lock before giving up. */
  timeoutMs?: number;
  /** Delay between acquire attempts while contended. */
  pollMs?: number;
  /** A held lock older than this (and with no live owner) is abandoned. */
  staleMs?: number;
}

interface LockOwner {
  pid?: number;
  token?: string;
  startedAt?: number;
}

function readLockOwner(lockDir: string): { owner: LockOwner | null; mtimeMs: number | null } {
  // Always stat the lock dir for mtimeMs (best-effort): the age-based stale
  // fallback in isStaleSettingsLock must work even when owner.json is present
  // but unusable (empty/corrupt object, or missing pid/startedAt). Previously
  // mtimeMs was discarded whenever owner.json parsed, so such a lock could never
  // be reclaimed by age and saveModelConfig stalled until the lock timeout.
  let mtimeMs: number | null = null;
  try {
    mtimeMs = statSync(lockDir).mtimeMs;
  } catch {
    /* leave null; the age fallback degrades to `now` (never stale) */
  }
  try {
    const owner = JSON.parse(readFileSync(join(lockDir, "owner.json"), "utf8")) as LockOwner;
    return { owner, mtimeMs };
  } catch {
    return { owner: null, mtimeMs };
  }
}

/**
 * `true` only when the holder is *definitively* gone (`ESRCH`). Everything else
 * — alive (signal succeeded), alive-but-unsignalable (`EPERM`), or an
 * inconclusive error — is treated as "not dead" so a live holder is never
 * displaced. Stale-breaking on those cases is left to the `startedAt` age check.
 */
function isOwnerPidDead(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (e) {
    return errnoCode(e) === "ESRCH"; // no such process → holder is gone
  }
}

function isStaleSettingsLock(lockDir: string, now: number, staleMs: number): boolean {
  const { owner, mtimeMs } = readLockOwner(lockDir);
  if (owner && typeof owner.pid === "number") {
    if (isOwnerPidDead(owner.pid)) return true; // holder crashed: safe to break now
    const startedAt = typeof owner.startedAt === "number" ? owner.startedAt : (mtimeMs ?? now);
    // Even a live-looking holder can't pin the lock forever (pid reuse / stuck
    // process): bound it by startedAt as a last resort.
    return now - startedAt > staleMs;
  }
  // No owner info (pre-owner-file lock, or owner.json unreadable): fall back to
  // the lock directory's mtime age.
  const reference = mtimeMs ?? now;
  return now - reference > staleMs;
}

function settingsLockOwns(lockDir: string, token: string): boolean {
  const { owner } = readLockOwner(lockDir);
  return owner?.token === token;
}

export function withSettingsLock<T>(settingsPath: string, fn: () => T, options: SettingsLockOptions = {}): T {
  const dir = dirname(settingsPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const lockDir = `${settingsPath}.lock`;
  const token = `${process.pid}-${Date.now().toString(36)}-${randomBytes(6).toString("hex")}`;
  const timeoutMs = options.timeoutMs ?? SETTINGS_LOCK_TIMEOUT_MS;
  const pollMs = options.pollMs ?? SETTINGS_LOCK_POLL_MS;
  const staleMs = options.staleMs ?? SETTINGS_LOCK_STALE_MS;
  const start = Date.now();
  for (;;) {
    try {
      mkdirSync(lockDir); // O_EXCL create-or-EEXIST
      break;
    } catch (e) {
      if (errnoCode(e) !== "EEXIST") throw e; // real filesystem error
      if (isStaleSettingsLock(lockDir, Date.now(), staleMs)) {
        rmSync(lockDir, { recursive: true, force: true });
        continue; // retry immediately so a crashed writer doesn't stall us
      }
      if (Date.now() - start > timeoutMs) throw new Error(`settings lock timeout: ${lockDir}`);
      sleepSync(pollMs);
    }
  }
  // Stamp owner info so other processes can tell a live holder from a crashed one.
  try {
    writeFileSync(join(lockDir, "owner.json"), JSON.stringify({ pid: process.pid, token, startedAt: Date.now() }), "utf8");
  } catch {
    /* owner info is best-effort; the mtime-age stale fallback still applies */
  }
  try {
    return fn();
  } finally {
    // Only remove a lock that still belongs to us; if a stale-breaker already
    // handed it to another owner, leave it intact.
    if (settingsLockOwns(lockDir, token)) rmSync(lockDir, { recursive: true, force: true });
  }
}

const SETTINGS_RENAME_ATTEMPTS = 5;
const SETTINGS_RENAME_BACKOFF_MS = 20;

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
    // Atomic publish (IC-032): stage the full payload in a sibling tmp file —
    // same directory, so the rename is same-device and never EXDEV — then swap
    // it into place. We deliberately do NOT fall back to a direct `writeFileSync`
    // overwrite of `path` if rename fails: a crash mid-overwrite would leave a
    // partial, unparseable settings file. Instead we keep the intact tmp file as
    // a recovery artifact and surface the failure, leaving `path` untouched.
    const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
    try {
      writeFileSync(tmp, json, "utf8");
    } catch (e) {
      try { rmSync(tmp, { force: true }); } catch { /* best-effort partial cleanup */ }
      throw new Error(`settings save failed: cannot write ${tmp}: ${(e as Error).message}`);
    }
    for (let attempt = 0; attempt < SETTINGS_RENAME_ATTEMPTS; attempt++) {
      try {
        renameSync(tmp, path);
        break; // success — tmp is now `path`
      } catch (e) {
        if (attempt >= SETTINGS_RENAME_ATTEMPTS - 1) {
          // Leave `tmp` on disk for manual recovery; `path` stays at its prior value.
          throw new Error(`settings save failed: rename ${tmp} -> ${path}: ${(e as Error).message}`);
        }
        sleepSync(SETTINGS_RENAME_BACKOFF_MS);
      }
    }
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
