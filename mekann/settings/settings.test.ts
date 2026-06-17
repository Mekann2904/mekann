import { describe, expect, it } from "vitest";
import { flattenEffective, diagnosticsForUnknownKeys } from "./effective.js";
import { findSettingSchema, mekannSettingsSchemas } from "./registry.js";
import type { LoadedSettings } from "./store.js";

function loaded(features: Record<string, Record<string, unknown>>): LoadedSettings {
  return { path: "x", exists: true, settings: { version: 1, features }, hash: "h", errors: [] };
}

describe("mekann settings core", () => {
  it("merges default, global, and workspace into effective values", () => {
    const eff = flattenEffective(mekannSettingsSchemas, loaded({ subagent: { maxSubagents: 2 } }), loaded({ subagent: { maxSubagents: 3 } }));
    expect(eff.find((e) => e.feature === "subagent" && e.key === "maxSubagents")?.effectiveValue).toBe(3);
    expect(eff.find((e) => e.feature === "subagent" && e.key === "maxSubagents")?.source).toBe("workspace");
  });

  it("reports unknown keys", () => {
    const diags = diagnosticsForUnknownKeys(mekannSettingsSchemas, loaded({ subagent: { nope: true } }), loaded({ mystery: {} }));
    expect(diags.join("\n")).toContain("subagent.nope");
    expect(diags.join("\n")).toContain("unknown feature mystery");
  });

  it("falls back to global when no workspace override", () => {
    const eff = flattenEffective(mekannSettingsSchemas, loaded({ subagent: { maxSubagents: 4 } }), loaded({}));
    const item = eff.find((e) => e.feature === "subagent" && e.key === "maxSubagents");
    expect(item?.effectiveValue).toBe(4);
    expect(item?.source).toBe("global");
  });

  it("uses default when neither global nor workspace is set", () => {
    const eff = flattenEffective(mekannSettingsSchemas, loaded({}), loaded({}));
    const item = eff.find((e) => e.feature === "subagent" && e.key === "maxSubagents");
    expect(item?.effectiveValue).toBe(1);
    expect(item?.source).toBe("default");
  });

  it("warns when workspace override equals default", () => {
    const eff = flattenEffective(mekannSettingsSchemas, loaded({}), loaded({ subagent: { maxSubagents: 1 } }));
    const item = eff.find((e) => e.feature === "subagent" && e.key === "maxSubagents");
    expect(item?.diagnostics).toContain("workspace override が default と同じです");
  });
});

describe("settings registry", () => {
  const featureNames = ["modes", "sandbox", "subagent", "review-fixer", "command-normalization", "output-gate", "codex-shared", "codex-web-search", "codex-limits", "dashboard", "model-optimizer", "terminal"];

  it("registers all expected features", () => {
    const registered = mekannSettingsSchemas.map((s) => s.feature);
    for (const name of featureNames) expect(registered).toContain(name);
  });

  it("every setting has a valid key, type, and validate function", () => {
    for (const schema of mekannSettingsSchemas) {
      for (const setting of schema.settings) {
        expect(setting.key).toBeTruthy();
        expect(["number", "string", "boolean", "enum", "modelRef"]).toContain(setting.type);
        expect(typeof setting.validate).toBe("function");
        expect(setting.scopes).toContain("global");
        expect(setting.scopes).toContain("workspace");
      }
    }
  });

  it("validates accepts valid values for all settings", () => {
    for (const schema of mekannSettingsSchemas) {
      for (const setting of schema.settings) {
        const errors = setting.validate(setting.defaultValue);
        expect(errors).toEqual([]);
      }
    }
  });

  it("findSettingSchema locates a known setting", () => {
    const s = findSettingSchema("subagent", "maxSubagents");
    expect(s?.type).toBe("number");
  });

  it("findSettingSchema returns undefined for unknown", () => {
    expect(findSettingSchema("nope", "x")).toBeUndefined();
  });
});

describe("sandbox schema", () => {
  it("has sandbox settings with correct defaults", () => {
    const schema = mekannSettingsSchemas.find((s) => s.feature === "sandbox")!;
    expect(schema.settings).toHaveLength(6);
    expect(schema.settings.find((s) => s.key === "enabled")?.defaultValue).toBe(true);
    expect(schema.settings.find((s) => s.key === "bashMode")?.defaultValue).toBe("sandboxed");
    expect(schema.settings.find((s) => s.key === "bashAllowlist")?.defaultValue).toBe("");
    expect(schema.settings.find((s) => s.key === "allowPersistentBashApprovals")?.defaultValue).toBe(true);
    const bytes = schema.settings.find((s) => s.key === "llmOutputMaxBytes")!;
    expect(bytes.defaultValue).toBe(50 * 1024);
    const lines = schema.settings.find((s) => s.key === "llmOutputMaxLines")!;
    expect(lines.defaultValue).toBe(2000);
  });

  it("rejects out-of-range values", () => {
    const schema = mekannSettingsSchemas.find((s) => s.feature === "sandbox")!;
    const bytes = schema.settings.find((s) => s.key === "llmOutputMaxBytes")!;
    expect(bytes.validate(0)).toBeTruthy();
    expect(bytes.validate(51200)).toEqual([]);
  });
});

describe("command-normalization schema", () => {
  it("has command-normalization settings", () => {
    const schema = mekannSettingsSchemas.find((s) => s.feature === "command-normalization")!;
    expect(schema.settings.map((s) => s.key)).toEqual(["enabled", "bashEnabled", "recordNormalization"]);
    expect(schema.settings.find((s) => s.key === "enabled")?.defaultValue).toBe(true);
  });
});

describe("output-gate schema", () => {
  it("has output-gate settings", () => {
    const schema = mekannSettingsSchemas.find((s) => s.feature === "output-gate")!;
    expect(schema.settings).toHaveLength(8);
    expect(schema.settings.find((s) => s.key === "enabled")?.defaultValue).toBe(true);
  });

  it("keeps cacheable-context default surface small and retrieval-oriented", () => {
    const schema = mekannSettingsSchemas.find((s) => s.feature === "cacheable-context")!;
    expect(schema.settings.find((s) => s.key === "enabled")?.defaultValue).toBe(true);
    expect(schema.settings.find((s) => s.key === "promptSurface")?.defaultValue).toBe("locator");
    expect(schema.settings.find((s) => s.key === "contextMode")?.defaultValue).toBe("term-index");
    expect(schema.settings.find((s) => s.key === "maxPrefixChars")?.defaultValue).toBe(32000);
  });

  it("deprecates cacheable-context promptSurface \"full\" with a fallback diagnostic", () => {
    const schema = mekannSettingsSchemas.find((s) => s.feature === "cacheable-context")!;
    const setting = schema.settings.find((s) => s.key === "promptSurface")!;
    // locator / off are accepted cleanly
    expect(setting.validate("locator")).toEqual([]);
    expect(setting.validate("off")).toEqual([]);
    // full is deprecated and surfaces a diagnostic (graceful fallback to locator)
    const fullDiags = setting.validate("full");
    expect(fullDiags.length).toBeGreaterThan(0);
    expect(fullDiags.join("")).toContain("非推奨");
    // any other value is rejected
    expect(setting.validate("bogus").length).toBeGreaterThan(0);
  });

  it("flattenEffective resolves all output-gate settings", () => {
    const eff = flattenEffective(mekannSettingsSchemas, loaded({ "output-gate": { maxInlineBytes: 8192 } }), loaded({}));
    const item = eff.find((e) => e.feature === "output-gate" && e.key === "maxInlineBytes");
    expect(item?.effectiveValue).toBe(8192);
    expect(item?.source).toBe("global");
  });
});

describe("modes schema", () => {
  it("has model and thinking settings for 4 modes", () => {
    const schema = mekannSettingsSchemas.find((s) => s.feature === "modes")!;
    const modes = ["main", "read_only", "auto", "sub"];
    for (const mode of modes) {
      expect(schema.settings.find((s) => s.key === `models.${mode}`)).toBeDefined();
      expect(schema.settings.find((s) => s.key === `thinking.${mode}`)).toBeDefined();
    }
  });

  it("validates modelRef accepts undefined and valid objects", () => {
    const schema = mekannSettingsSchemas.find((s) => s.feature === "modes")!;
    const model = schema.settings.find((s) => s.key === "models.main")!;
    expect(model.validate(undefined)).toEqual([]);
    expect(model.validate({ provider: "p", modelId: "m" })).toEqual([]);
    expect(model.validate({ provider: "", modelId: "" }).length).toBeGreaterThan(0);
  });
});
