import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { emptySettings, loadSettings, saveSettingsChecked, setFeatureValue } from "./store.js";

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
