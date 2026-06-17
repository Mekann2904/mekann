import { beforeEach, describe, expect, it, vi } from "vitest";

// loadSettings hits the filesystem; mock it so we can drive the
// "enabled missing" vs "explicitly set" branches deterministically.
vi.mock("./store.js", () => ({
  loadSettings: vi.fn(),
  getGlobalMekannSettingsPath: () => "/global/mekann.json",
  getWorkspaceMekannSettingsPath: () => "/workspace/mekann.json",
}));

import { loadSettings } from "./store.js";
import { isFeatureEnabled } from "./enabled.js";

const mockedLoadSettings = vi.mocked(loadSettings);

/** Make global + workspace both report the given feature map. */
function setFeatures(features: Record<string, Record<string, unknown>>): void {
  mockedLoadSettings.mockReturnValue({
    path: "x",
    exists: true,
    settings: { version: 1, features },
    hash: "h",
    errors: [],
  });
}

beforeEach(() => mockedLoadSettings.mockReset());

describe("isFeatureEnabled", () => {
  it("subagent defaults to disabled when 'enabled' is unset (ADR-0018)", () => {
    setFeatures({});
    expect(isFeatureEnabled("subagent")).toBe(false);
  });

  it("subagent is enabled when explicitly enabled", () => {
    setFeatures({ subagent: { enabled: true } });
    expect(isFeatureEnabled("subagent")).toBe(true);
  });

  it("subagent is disabled when explicitly disabled", () => {
    setFeatures({ subagent: { enabled: false } });
    expect(isFeatureEnabled("subagent")).toBe(false);
  });

  it("keeps other features enabled-by-default when unset (backward compat)", () => {
    setFeatures({});
    // review-fixer must keep working even when subagent is default-off,
    // because it owns its own control plane (ADR-0018 dependency boundary).
    expect(isFeatureEnabled("review-fixer")).toBe(true);
    expect(isFeatureEnabled("sandbox")).toBe(true);
  });
});
