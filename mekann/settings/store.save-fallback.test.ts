// IC-032: saveSettingsChecked must never fall back to a destructive direct
// overwrite of `path`. When the atomic rename fails it should keep the staged
// tmp file as a recovery artifact and throw; when staging the payload fails it
// should clean up the partial tmp. These paths need node:fs to fail on demand,
// so they live in a dedicated file (vi.mock is module-wide and would disturb the
// real-fs tests in store.test.ts).
import { afterEach, describe, expect, it, vi } from "vitest";
import * as nodeFs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Failures are toggled per test; the mock delegates to the real fs otherwise so
// the lock + concurrency check behave normally.
let renameShouldThrow = false;
let writeTmpShouldThrow = false;

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    renameSync: vi.fn((...args: Parameters<typeof nodeFs.renameSync>) => {
      if (renameShouldThrow) throw new Error("rename EXDEV (forced)");
      return actual.renameSync(...args);
    }),
    writeFileSync: vi.fn((p: unknown, ...rest: unknown[]) => {
      // Only the staged tmp payload is forced to fail; owner.json / lock writes
      // and any test setup writes go to the real fs.
      if (writeTmpShouldThrow && String(p).includes(".tmp.")) throw new Error("disk full (forced)");
      return (actual.writeFileSync as (...a: unknown[]) => void)(p as string, ...rest);
    }),
  };
});

const {
  emptySettings,
  invalidateSettingsCache,
  loadSettings,
  saveSettingsChecked,
  setFeatureValue,
} = await import("./store.js");

// `fs` here is the mocked module; mkdtempSync/readdirSync/readFileSync/rmSync are
// the real implementations (spread above), and writeFileSync/renameSync delegate
// to the real ones while the toggle flags are false.
const fs = await import("node:fs");

describe("saveSettingsChecked atomic publish (IC-032)", () => {
  afterEach(() => {
    renameShouldThrow = false;
    writeTmpShouldThrow = false;
    invalidateSettingsCache();
  });

  it("keeps the staged tmp file and leaves path untouched when rename fails", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mekann-save-rename-"));
    try {
      const file = path.join(dir, "mekann.json");
      fs.writeFileSync(file, JSON.stringify(setFeatureValue(emptySettings(), "subagent", "maxSubagents", 1), null, 2) + "\n", "utf8");
      const loaded = loadSettings(file);

      renameShouldThrow = true;
      expect(() => saveSettingsChecked(file, setFeatureValue(emptySettings(), "subagent", "maxSubagents", 2), loaded.hash))
        .toThrow(/settings save failed.*rename/);
      renameShouldThrow = false;

      // `path` must not have been destructively overwritten — the prior value is intact.
      expect(JSON.parse(fs.readFileSync(file, "utf8")).features.subagent.maxSubagents).toBe(1);
      // The intact tmp recovery artifact remains on disk for manual recovery.
      const tmps = fs.readdirSync(dir).filter((n) => n.includes(".tmp."));
      expect(tmps.length).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("cleans up a partial tmp and does not touch path when staging throws", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mekann-save-stage-"));
    try {
      const file = path.join(dir, "mekann.json");
      fs.writeFileSync(file, JSON.stringify(setFeatureValue(emptySettings(), "subagent", "maxSubagents", 5), null, 2) + "\n", "utf8");
      const loaded = loadSettings(file);

      writeTmpShouldThrow = true;
      expect(() => saveSettingsChecked(file, setFeatureValue(emptySettings(), "subagent", "maxSubagents", 6), loaded.hash))
        .toThrow(/cannot write.*\.tmp/);
      writeTmpShouldThrow = false;

      // No tmp leak, and `path` is untouched.
      expect(fs.readdirSync(dir).filter((n) => n.includes(".tmp."))).toEqual([]);
      expect(JSON.parse(fs.readFileSync(file, "utf8")).features.subagent.maxSubagents).toBe(5);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
