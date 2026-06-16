import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// settingsLoader resolves model + thinking from the `modes` feature (Work Pi
// profile `review_fix`), NOT from the review-fixer feature itself. This pins
// the migration: review-fixer.model / review-fixer.reasoningEffort no longer
// exist; the values come from modes.models.review_fix / modes.thinking.review_fix.

const { featureRawConfigMock } = vi.hoisted(() => ({
  featureRawConfigMock: vi.fn(),
}));

vi.mock("../../settings/enabled.js", () => ({
  featureRawConfig: featureRawConfigMock,
  isFeatureEnabled: () => true,
}));

beforeEach(() => featureRawConfigMock.mockReset());
afterEach(() => vi.restoreAllMocks());

describe("loadReviewFixerSettings", () => {
  it("resolves model + thinking from the modes review_fix Work Pi profile", async () => {
    featureRawConfigMock.mockImplementation((feature: string) => {
      if (feature === "modes") return { models: { review_fix: { provider: "zai", modelId: "glm-5.2" } }, thinking: { review_fix: "xhigh" } };
      if (feature === "review-fixer") return { enabled: true, maxFixRetries: 5 };
      return {};
    });
    const { loadReviewFixerSettings } = await import("./settingsLoader.js");
    const settings = loadReviewFixerSettings();
    expect(settings.model).toEqual({ provider: "zai", modelId: "glm-5.2" });
    expect(settings.reasoningEffort).toBe("xhigh");
    // review-fixer feature still owns enabled + capacity.
    expect(settings.enabled).toBe(true);
    expect(settings.maxFixRetries).toBe(5);
  });

  it("returns undefined model + default high thinking when modes review_fix is unset", async () => {
    featureRawConfigMock.mockImplementation((feature: string) => {
      if (feature === "modes") return {};
      if (feature === "review-fixer") return { enabled: true };
      return {};
    });
    const { loadReviewFixerSettings } = await import("./settingsLoader.js");
    const settings = loadReviewFixerSettings();
    expect(settings.model).toBeUndefined();
    expect(settings.reasoningEffort).toBe("high");
  });

  it("ignores any legacy review-fixer.model / reasoningEffort values", async () => {
    // After migration these keys are gone from the review-fixer schema; even if
    // a stale config still carries them, they must NOT be honored.
    featureRawConfigMock.mockImplementation((feature: string) => {
      if (feature === "modes") return { models: { review_fix: { provider: "openai", modelId: "gpt-5.1" } } };
      if (feature === "review-fixer") return { model: { provider: "stale", modelId: "stale" }, reasoningEffort: "low" };
      return {};
    });
    const { loadReviewFixerSettings } = await import("./settingsLoader.js");
    const settings = loadReviewFixerSettings();
    expect(settings.model).toEqual({ provider: "openai", modelId: "gpt-5.1" });
    expect(settings.reasoningEffort).toBe("high");
  });
});
