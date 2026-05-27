import { describe, expect, it } from "vitest";
import { modesSettingsSchema } from "./settingsSchema.js";

describe("modes settings schema", () => {
  it("contains mode profile model and thinking settings", () => {
    expect(modesSettingsSchema.settings.map((s) => s.key)).toContain("models.main");
    expect(modesSettingsSchema.settings.map((s) => s.key)).toContain("thinking.sub");
  });
});
