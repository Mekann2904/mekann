import { describe, expect, it } from "vitest";
import { HARD_MAX_SUBAGENTS, MEKANN_SUBAGENT_DEFAULTS } from "../../config.js";
import { subagentSettingsSchema } from "./settingsSchema.js";

describe("subagent settings schema", () => {
  it("validates conservative capacity limits and neutral display values", () => {
    const max = subagentSettingsSchema.settings.find((s) => s.key === "maxSubagents")!;
    expect(max.validate(5)).not.toEqual([]);
    const display = subagentSettingsSchema.settings.find((s) => s.key === "display")!;
    expect(display.validate("external-split")).toEqual([]);
    expect(display.validate("kitty-split")).not.toEqual([]);
  });

  it("caps maxSubagents at HARD_MAX_SUBAGENTS (issue #83 / C-010)", () => {
    const max = subagentSettingsSchema.settings.find((s) => s.key === "maxSubagents")!;
    // The schema ceiling must match the enforced hard cap (4), not the default (1).
    expect(max.validate(HARD_MAX_SUBAGENTS)).toEqual([]);
    expect(max.validate(HARD_MAX_SUBAGENTS + 1)).not.toEqual([]);
  });

  it("exposes configurable maxResultRetries with 1–10 range (issue #83 / C-014)", () => {
    const retries = subagentSettingsSchema.settings.find((s) => s.key === "maxResultRetries")!;
    expect(retries.defaultValue).toBe(MEKANN_SUBAGENT_DEFAULTS.maxResultRetries);
    expect(retries.defaultValue).toBe(3);
    expect(retries.validate(1)).toEqual([]);
    expect(retries.validate(10)).toEqual([]);
    expect(retries.validate(0)).not.toEqual([]);
    expect(retries.validate(11)).not.toEqual([]);
    expect(retries.validate(2.5)).not.toEqual([]);
  });

  it("exposes configurable helloTimeoutMs raised above the old hard-coded 10s", () => {
    // review_fixer timed out 3x in a row because the child Pi handshake
    // deadline was a non-configurable 10s — too tight for a cold pi boot
    // (kitty -> shell -> node -> pi -> extension load -> model init -> hello).
    // The setting must exist, follow the config default, and exceed 10s.
    const hello = subagentSettingsSchema.settings.find((s) => s.key === "helloTimeoutMs")!;
    expect(hello.defaultValue).toBe(MEKANN_SUBAGENT_DEFAULTS.helloTimeoutMs);
    expect(hello.defaultValue).toBeGreaterThan(10_000);
    expect(hello.validate(10_000)).toEqual([]);
    expect(hello.validate(4_999)).not.toEqual([]);
    expect(hello.validate(600_000)).toEqual([]);
  });
});
