import { describe, expect, it } from "vitest";
import { modesSettingsSchema } from "./settingsSchema.js";

describe("modes settings schema", () => {
  it("contains mode profile model and thinking settings", () => {
    expect(modesSettingsSchema.settings.map((s) => s.key)).toContain("models.main");
    expect(modesSettingsSchema.settings.map((s) => s.key)).toContain("thinking.sub");
  });

  it("exposes Work Pi model profiles for review_fix and issue", () => {
    // review-fixer and issue launch separate Pi sessions (child Pi / Work Pi
    // pane). Their model/thinking preferences live in `modes` so all model
    // config is centralized under Collaboration Modes, instead of scattered
    // across feature-specific tabs.
    const keys = modesSettingsSchema.settings.map((s) => s.key);
    expect(keys).toContain("models.review_fix");
    expect(keys).toContain("thinking.review_fix");
    expect(keys).toContain("models.issue");
    expect(keys).toContain("thinking.issue");
  });
});
