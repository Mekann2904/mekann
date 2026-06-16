import { describe, expect, it } from "vitest";
import { codexWebSearchSettingsSchema } from "./settingsSchema.js";
import type { CodexReasoningEffort } from "../codex-shared/types.js";

describe("codex-web-search settings schema", () => {
  const effortValues: CodexReasoningEffort[] = ["none", "minimal", "low", "medium", "high", "xhigh"];

  it("effort accepts all enum values including none and xhigh", () => {
    const effort = codexWebSearchSettingsSchema.settings.find((s) => s.key === "effort")!;
    expect(effort.validate(undefined)).toEqual([]);
    for (const value of effortValues) {
      expect(effort.validate(value)).toEqual([]);
    }
    expect(effort.validate("invalid")).not.toEqual([]);
  });

  it("effort validate message lists all enum values to stay in sync with effortValues", () => {
    const effort = codexWebSearchSettingsSchema.settings.find((s) => s.key === "effort")!;
    const [message] = effort.validate("invalid");
    for (const value of effortValues) {
      expect(message).toContain(value);
    }
    expect(message).toContain("unset");
  });

  it("nonCodexDefaultEffort accepts all enum values including none and xhigh", () => {
    const nonCodexDefaultEffort = codexWebSearchSettingsSchema.settings.find((s) => s.key === "nonCodexDefaultEffort")!;
    for (const value of effortValues) {
      expect(nonCodexDefaultEffort.validate(value)).toEqual([]);
    }
    expect(nonCodexDefaultEffort.validate("invalid")).not.toEqual([]);
  });

  it("nonCodexDefaultEffort validate message lists all enum values to stay in sync with effortValues", () => {
    const nonCodexDefaultEffort = codexWebSearchSettingsSchema.settings.find((s) => s.key === "nonCodexDefaultEffort")!;
    const [message] = nonCodexDefaultEffort.validate("invalid");
    for (const value of effortValues) {
      expect(message).toContain(value);
    }
  });
});
