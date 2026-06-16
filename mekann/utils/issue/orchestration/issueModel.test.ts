import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { featureConfigMock } = vi.hoisted(() => ({ featureConfigMock: vi.fn() }));

vi.mock("../../../settings/featureConfig.js", () => ({ featureConfig: featureConfigMock }));

beforeEach(() => featureConfigMock.mockReset());
afterEach(() => vi.restoreAllMocks());

describe("resolveIssueWorkPiModel", () => {
  it("reads modes.models.issue + modes.thinking.issue", async () => {
    featureConfigMock.mockReturnValue({
      models: { issue: { provider: "zai", modelId: "glm-5.2" } },
      thinking: { issue: "high" },
    });
    const { resolveIssueWorkPiModel } = await import("./issueModel.js");
    expect(resolveIssueWorkPiModel()).toEqual({ model: { provider: "zai", modelId: "glm-5.2" }, thinking: "high" });
  });

  it("returns undefined values when the issue profile is unset", async () => {
    featureConfigMock.mockReturnValue({ models: {}, thinking: {} });
    const { resolveIssueWorkPiModel } = await import("./issueModel.js");
    expect(resolveIssueWorkPiModel()).toEqual({ model: undefined, thinking: undefined });
  });

  it("ignores malformed model + invalid thinking defensively", async () => {
    featureConfigMock.mockReturnValue({ models: { issue: "not-a-ref" }, thinking: { issue: "bogus" } });
    const { resolveIssueWorkPiModel } = await import("./issueModel.js");
    expect(resolveIssueWorkPiModel()).toEqual({ model: undefined, thinking: undefined });
  });

  it("resolves gracefully when the modes feature is absent", async () => {
    featureConfigMock.mockReturnValue(undefined);
    const { resolveIssueWorkPiModel } = await import("./issueModel.js");
    expect(resolveIssueWorkPiModel()).toEqual({ model: undefined, thinking: undefined });
  });
});
