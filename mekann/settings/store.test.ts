import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptySettings, getGlobalMekannSettingsPath, getWorkspaceMekannSettingsPath, invalidateSettingsCache, loadSettings, loadSettingsReadonly, saveSettingsChecked, setFeatureValue, withSettingsLock } from "./store.js";
import { featureConfig, featureValue } from "./featureConfig.js";
import { featureRawConfig } from "./enabled.js";

describe("settings store", () => {
  it("sets nested feature values", () => {
    const next = setFeatureValue(emptySettings(), "modes", "models.main", { provider: "p", modelId: "m" });
    expect(next.features["modes"].models).toEqual({ main: { provider: "p", modelId: "m" } });
  });

  it("rejects concurrent writes by hash", () => {
    const dir = mkdtempSync(join(tmpdir(), "mekann-settings-test-"));
    try {
      const path = join(dir, "mekann.json");
      const loaded = loadSettings(path);
      saveSettingsChecked(path, setFeatureValue(loaded.settings, "subagent", "maxSubagents", 2), loaded.hash);
      expect(() => saveSettingsChecked(path, setFeatureValue(loaded.settings, "subagent", "maxSubagents", 3), loaded.hash)).toThrow(/concurrently/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("settings store cache", () => {
  // The cache is module-scoped; isolate every test on its own tmp path and clear
  // the whole cache between tests so state never leaks across them.
  afterEach(() => invalidateSettingsCache());

  it("memoizes repeated reads of the same path (no disk I/O after the first)", () => {
    const dir = mkdtempSync(join(tmpdir(), "mekann-cache-test-"));
    try {
      const path = join(dir, "mekann.json");
      const settings = setFeatureValue(emptySettings(), "subagent", "maxSubagents", 7);
      writeFileSync(path, JSON.stringify(settings, null, 2) + "\n", "utf8");

      const first = loadSettings(path);
      expect(first.settings.features.subagent?.maxSubagents).toBe(7);

      // Mutate the file on disk after the first read. A cached (second) read
      // must NOT reflect this change; only an invalidated read should.
      writeFileSync(path, JSON.stringify(setFeatureValue(emptySettings(), "subagent", "maxSubagents", 99), null, 2) + "\n", "utf8");

      const cached = loadSettings(path);
      expect(cached.settings.features.subagent?.maxSubagents).toBe(7);

      invalidateSettingsCache(path);
      const fresh = loadSettings(path);
      expect(fresh.settings.features.subagent?.maxSubagents).toBe(99);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("refreshes the cache after saveSettingsChecked (no stale values)", () => {
    const dir = mkdtempSync(join(tmpdir(), "mekann-cache-save-test-"));
    try {
      const path = join(dir, "mekann.json");
      const loaded = loadSettings(path);
      const newHash = saveSettingsChecked(path, setFeatureValue(loaded.settings, "subagent", "maxSubagents", 2), loaded.hash);
      expect(newHash).not.toBe(loaded.hash);

      // Overwrite the file out-of-band after the save. If the cache was refreshed
      // with the saved value, the next read returns the saved value (2), not the
      // out-of-band value (99); proving we are not reading stale pre-save data
      // nor blindly re-reading disk.
      writeFileSync(path, JSON.stringify(setFeatureValue(emptySettings(), "subagent", "maxSubagents", 99), null, 2) + "\n", "utf8");
      const after = loadSettings(path);
      expect(after.settings.features.subagent?.maxSubagents).toBe(2);
      expect(after.hash).toBe(newHash);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("bypasses the cache for saveSettingsChecked concurrency checks", () => {
    const dir = mkdtempSync(join(tmpdir(), "mekann-cache-concurrency-test-"));
    try {
      const path = join(dir, "mekann.json");
      const loaded = loadSettings(path);
      writeFileSync(path, JSON.stringify(setFeatureValue(emptySettings(), "subagent", "maxSubagents", 99), null, 2) + "\n", "utf8");

      expect(() => saveSettingsChecked(path, setFeatureValue(loaded.settings, "subagent", "maxSubagents", 2), loaded.hash)).toThrow(/settings changed concurrently/);
      expect(loadSettings(path).settings.features.subagent?.maxSubagents).toBe(99);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("returns independent snapshots so caller mutations don't poison the cache", () => {
    const dir = mkdtempSync(join(tmpdir(), "mekann-cache-snapshot-test-"));
    try {
      const path = join(dir, "mekann.json");
      const settings = setFeatureValue(emptySettings(), "modes", "models.main", { provider: "p", modelId: "m" });
      writeFileSync(path, JSON.stringify(settings, null, 2) + "\n", "utf8");

      const first = loadSettings(path);
      // Mimic safety/modes/utils.ts: alias settings and reassign a feature entry.
      const next = first.settings;
      next.features["modes"] = { ...(next.features["modes"] ?? {}), mutated: true };
      ((next.features["modes"]?.models as Record<string, unknown>) ?? {}).nestedMutation = true;

      const second = loadSettings(path);
      expect(second.settings.features["modes"]).not.toHaveProperty("mutated");
      expect(second.settings.features["modes"]?.models).not.toHaveProperty("nestedMutation");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("settings cache disk-read efficiency", () => {
  // Acceptance: hot paths (sandbox bash, startup feature gating, output-gate)
  // used to re-read the global + workspace settings files on every call. With
  // the process cache, each path is read from disk at most once; subsequent
  // reads are Map lookups. We mutate the files after warming the cache to prove
  // hot-path reads do not observe disk again until explicit invalidation.
  afterEach(() => { invalidateSettingsCache(); vi.restoreAllMocks(); });

  it("serves repeated settings reads from cache (no disk I/O after the first)", () => {
    const home = mkdtempSync(join(tmpdir(), "mekann-eff-home-"));
    const cwd = mkdtempSync(join(tmpdir(), "mekann-eff-cwd-"));
    const globalPath = getGlobalMekannSettingsPath(home);
    const workspacePath = getWorkspaceMekannSettingsPath(cwd);
    mkdirSync(join(globalPath, ".."), { recursive: true });
    mkdirSync(join(workspacePath, ".."), { recursive: true });
    writeFileSync(globalPath, JSON.stringify(setFeatureValue(emptySettings(), "output-gate", "maxInlineBytes", 1234), null, 2) + "\n", "utf8");
    writeFileSync(workspacePath, JSON.stringify(setFeatureValue(emptySettings(), "sandbox", "bashMode", "ask"), null, 2) + "\n", "utf8");
    try {
      // Warm: ~5 sandbox-bash-commands worth of settings access populates the cache.
      for (let i = 0; i < 5; i++) {
        featureRawConfig("sandbox", cwd);
        featureConfig("output-gate", cwd, home);
        featureValue("output-gate", "maxInlineBytes", cwd, home);
      }

      // Rewrite both files with different values on disk. If reads are cached,
      // the next calls must still return the ORIGINAL (pre-rewrite) values —
      // proving no disk I/O happened. (A non-cached read would pick up 9999 / "off".)
      writeFileSync(globalPath, JSON.stringify(setFeatureValue(emptySettings(), "output-gate", "maxInlineBytes", 9999), null, 2) + "\n", "utf8");
      writeFileSync(workspacePath, JSON.stringify(setFeatureValue(emptySettings(), "sandbox", "bashMode", "off"), null, 2) + "\n", "utf8");
      expect(featureValue("output-gate", "maxInlineBytes", cwd, home)).toBe(1234);
      expect(featureRawConfig("sandbox", cwd).bashMode).toBe("ask");

      // After invalidation the new on-disk values must be visible again.
      invalidateSettingsCache(globalPath);
      invalidateSettingsCache(workspacePath);
      expect(featureValue("output-gate", "maxInlineBytes", cwd, home)).toBe(9999);
      expect(featureRawConfig("sandbox", cwd).bashMode).toBe("off");
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("featureConfig reads each settings file once via the read-only accessor (2 loads, not 4)", async () => {
    const store = await import("./store.js");
    const home = mkdtempSync(join(tmpdir(), "mekann-dedup-home-"));
    const cwd = mkdtempSync(join(tmpdir(), "mekann-dedup-cwd-"));
    const globalPath = getGlobalMekannSettingsPath(home);
    const workspacePath = getWorkspaceMekannSettingsPath(cwd);
    mkdirSync(join(globalPath, ".."), { recursive: true });
    mkdirSync(join(workspacePath, ".."), { recursive: true });
    writeFileSync(globalPath, JSON.stringify(emptySettings(), null, 2) + "\n", "utf8");
    writeFileSync(workspacePath, JSON.stringify(emptySettings(), null, 2) + "\n", "utf8");
    try {
      // featureConfig resolves the global + workspace settings exactly once
      // each (loadBoth) and reuses them for both schema resolution and the
      // schema-less compatibility fallback. Previously this was 4 disk reads;
      // the dedup keeps it at 2. featureConfig is a verified read-only hot path
      // so it routes through loadSettingsReadonly (issue #168 / IC-169).
      const spy = vi.spyOn(store, "loadSettingsReadonly");
      featureConfig("output-gate", cwd, home);
      expect(spy.mock.calls.length).toBe(2);
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("settings store read-only accessor (issue #168 / IC-169)", () => {
  // loadSettingsReadonly serves verified non-mutating hot paths. It returns the
  // shared canonical cache entry with zero cloning, so cache hits are a Map
  // lookup instead of a recursive JSON clone. Mutating callers keep using the
  // cloning loadSettings.
  afterEach(() => invalidateSettingsCache());

  it("returns the same canonical reference across reads (no clone)", () => {
    const dir = mkdtempSync(join(tmpdir(), "mekann-readonly-ref-"));
    try {
      const path = join(dir, "mekann.json");
      const settings = setFeatureValue(emptySettings(), "output-gate", "maxInlineBytes", 42);
      writeFileSync(path, JSON.stringify(settings, null, 2) + "\n", "utf8");

      const a = loadSettingsReadonly(path);
      const b = loadSettingsReadonly(path);
      // Same shared object (and nested settings) — no per-read allocation.
      expect(a).toBe(b);
      expect(a.settings).toBe(b.settings);
      expect(a.settings.features["output-gate"]?.maxInlineBytes).toBe(42);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("stays independent from the cloning loadSettings (mutation safety preserved)", () => {
    const dir = mkdtempSync(join(tmpdir(), "mekann-readonly-clone-"));
    try {
      const path = join(dir, "mekann.json");
      const settings = setFeatureValue(emptySettings(), "output-gate", "maxInlineBytes", 42);
      writeFileSync(path, JSON.stringify(settings, null, 2) + "\n", "utf8");

      const readonly = loadSettingsReadonly(path);
      const mutating = loadSettings(path);

      // The mutating accessor hands back an independent clone; the read-only
      // accessor hands back the canonical object.
      expect(mutating).not.toBe(readonly);
      expect(mutating.settings).not.toBe(readonly.settings);
      // Poison the clone only; the canonical object must be unaffected.
      (mutating.settings.features["output-gate"] as Record<string, unknown>).poisoned = true;
      const again = loadSettingsReadonly(path);
      expect(again.settings.features["output-gate"]).not.toHaveProperty("poisoned");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("reflects saveSettingsChecked updates without a manual invalidation", () => {
    const dir = mkdtempSync(join(tmpdir(), "mekann-readonly-save-"));
    try {
      const path = join(dir, "mekann.json");
      const loaded = loadSettings(path);
      saveSettingsChecked(path, setFeatureValue(emptySettings(), "sandbox", "bashMode", "ask"), loaded.hash);

      const readonly = loadSettingsReadonly(path);
      expect(readonly.settings.features.sandbox?.bashMode).toBe("ask");
      // Read-only reads after the save keep returning the refreshed canonical value.
      expect(loadSettingsReadonly(path).settings).toBe(readonly.settings);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});


// ---------------------------------------------------------------------------
// IC-032 / IC-033 / IC-034 / IC-035 — robustness added in issue #150.
// The rename-fallback failure path is covered separately in
// `store.save-fallback.test.ts` (it needs a node:fs mock, which is module-wide).
// ---------------------------------------------------------------------------

/** Pre-create a settings lock directory with the given owner info, simulating a
 * lock held by another (possibly crashed) process. */
function holdSettingsLock(settingsPath: string, owner: { pid: number; token: string; startedAt: number }): string {
  const lockDir = `${settingsPath}.lock`;
  mkdirSync(lockDir);
  writeFileSync(join(lockDir, "owner.json"), JSON.stringify(owner), "utf8");
  return lockDir;
}

describe("settings save atomicity (IC-032)", () => {
  afterEach(() => invalidateSettingsCache());

  it("leaves no tmp file (and no lock) behind after a successful save", () => {
    const dir = mkdtempSync(join(tmpdir(), "mekann-save-clean-"));
    try {
      const path = join(dir, "mekann.json");
      const loaded = loadSettings(path);
      saveSettingsChecked(path, setFeatureValue(loaded.settings, "subagent", "maxSubagents", 2), loaded.hash);
      expect(readdirSync(dir).filter((n) => n.includes(".tmp."))).toEqual([]);
      expect(existsSync(`${path}.lock`)).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("settings lock staleness (IC-033)", () => {
  afterEach(() => invalidateSettingsCache());

  it("breaks a stale lock whose owner process has died", () => {
    const dir = mkdtempSync(join(tmpdir(), "mekann-lock-dead-"));
    try {
      const path = join(dir, "mekann.json");
      // A child that has already exited by the time spawnSync returns → its pid
      // is definitively dead (ESRCH), mirroring a writer that crashed mid-save.
      const dead = spawnSync(process.execPath, ["--eval", "process.exit(0)"]);
      const deadPid = dead.pid as number;
      const lockDir = holdSettingsLock(path, { pid: deadPid, token: "crashed", startedAt: Date.now() });

      // The dead holder's lock is broken immediately; our fn runs and releases.
      const result = withSettingsLock(path, () => "acquired", { timeoutMs: 1000, pollMs: 5 });
      expect(result).toBe("acquired");
      expect(existsSync(lockDir)).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("does not steal a lock held by a live process (waits, then times out)", () => {
    const dir = mkdtempSync(join(tmpdir(), "mekann-lock-live-"));
    try {
      const path = join(dir, "mekann.json");
      // Our own pid is alive with a fresh startedAt → not stale → not breakable.
      holdSettingsLock(path, { pid: process.pid, token: "alive", startedAt: Date.now() });

      expect(() => withSettingsLock(path, () => "x", { timeoutMs: 120, pollMs: 10 })).toThrow(/lock timeout/);
      // The live holder's lock is left intact (not displaced).
      expect(existsSync(`${path}.lock`)).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("breaks a lock older than staleMs even when the owner pid is alive (pid-reuse safety valve)", () => {
    const dir = mkdtempSync(join(tmpdir(), "mekann-lock-age-"));
    try {
      const path = join(dir, "mekann.json");
      holdSettingsLock(path, { pid: process.pid, token: "ancient", startedAt: Date.now() - 60_000 });

      const result = withSettingsLock(path, () => "acquired", { staleMs: 1_000, timeoutMs: 1000, pollMs: 5 });
      expect(result).toBe("acquired");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("settings lock SharedArrayBuffer fallback (IC-034)", () => {
  afterEach(() => invalidateSettingsCache());

  it("keeps working (no TypeError crash) when SharedArrayBuffer is unavailable", () => {
    const dir = mkdtempSync(join(tmpdir(), "mekann-lock-sab-"));
    try {
      const path = join(dir, "mekann.json");
      // Live holder so acquisition contends and exercises sleepSync backoff.
      holdSettingsLock(path, { pid: process.pid, token: "alive", startedAt: Date.now() });

      const original = (globalThis as { SharedArrayBuffer?: unknown }).SharedArrayBuffer;
      // Simulate a sandbox that disables SharedArrayBuffer: without the busy-wait
      // fallback, `Atomics.wait`/`new SharedArrayBuffer` would throw TypeError and
      // crash the lock loop.
      Object.defineProperty(globalThis, "SharedArrayBuffer", { configurable: true, value: undefined });
      try {
        expect(() => withSettingsLock(path, () => "x", { timeoutMs: 120, pollMs: 10 })).toThrow(/lock timeout/);
      } finally {
        Object.defineProperty(globalThis, "SharedArrayBuffer", { configurable: true, value: original });
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
