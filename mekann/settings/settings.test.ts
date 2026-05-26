import { describe, expect, it } from "vitest";
import { flattenEffective, diagnosticsForUnknownKeys } from "./effective.js";
import { mekannSettingsSchemas } from "./registry.js";
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
});
