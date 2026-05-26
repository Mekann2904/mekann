import { describe, expect, it } from "vitest";
import { planModeSettingsSchema } from "./settingsSchema.js";

describe("plan-mode settings schema", () => {
  it("contains mode profile model and thinking settings", () => {
    expect(planModeSettingsSchema.settings.map((s) => s.key)).toContain("models.main");
    expect(planModeSettingsSchema.settings.map((s) => s.key)).toContain("thinking.sub");
  });
});
