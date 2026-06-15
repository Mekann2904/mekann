import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptySettings, getGlobalMekannSettingsPath, getWorkspaceMekannSettingsPath, invalidateSettingsCache, loadSettings, saveSettingsChecked, setFeatureValue } from "./store.js";
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

  it("featureConfig no longer calls loadSettings twice for the compatibility fallback (4 -> 2)", async () => {
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
      // On a cold cache a single featureConfig() previously invoked loadSettings
      // 4 times (resolveEffectiveFeatureConfig read global+workspace, then the
      // compatibility fallback read them again). After dedup it is exactly 2.
      const spy = vi.spyOn(store, "loadSettings");
      featureConfig("output-gate", cwd, home);
      expect(spy.mock.calls.length).toBe(2);
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
