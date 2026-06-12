import { describe, expect, it } from "vitest";
import { subagentSettingsSchema } from "./settingsSchema.js";

describe("subagent settings schema", () => {
  it("validates conservative capacity limits and neutral display values", () => {
    const max = subagentSettingsSchema.settings.find((s) => s.key === "maxSubagents")!;
    expect(max.validate(5)).not.toEqual([]);
    const display = subagentSettingsSchema.settings.find((s) => s.key === "display")!;
    expect(display.validate("external-split")).toEqual([]);
    expect(display.validate("kitty-split")).not.toEqual([]);
  });
});
