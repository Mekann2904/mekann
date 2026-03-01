/**
 * Tests for centralized retry configuration.
 * Phase 1 - Quick Wins: Retry Policy Unification
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getRetryConfig,
  createRetryConfigFromEnv,
  getActiveRetryProfile,
  isStableRetryProfile,
  isValidRetryConfig,
  mergeRetryConfig,
  RETRY_PROFILES,
  PROVIDER_RETRY_DEFAULTS,
  type RetryProfile,
  type RetryConfig,
} from "../../lib/retry-config";

describe("RETRY_PROFILES", () => {
  it("should define stable profile with no retries", () => {
    expect(RETRY_PROFILES.stable.maxRetries).toBe(0);
    expect(RETRY_PROFILES.stable.jitter).toBe("none");
  });

  it("should define balanced profile with moderate retries", () => {
    expect(RETRY_PROFILES.balanced.maxRetries).toBe(3);
    expect(RETRY_PROFILES.balanced.jitter).toBe("partial");
  });

  it("should define aggressive profile with high retries", () => {
    expect(RETRY_PROFILES.aggressive.maxRetries).toBe(5);
    expect(RETRY_PROFILES.aggressive.jitter).toBe("full");
  });

  it("should have valid configurations for all profiles", () => {
    for (const profile of Object.values(RETRY_PROFILES)) {
      expect(profile.maxDelayMs).toBeGreaterThanOrEqual(profile.initialDelayMs);
      expect(profile.multiplier).toBeGreaterThanOrEqual(1);
      expect(["full", "partial", "none"]).toContain(profile.jitter);
    }
  });
});

describe("getRetryConfig", () => {
  it("should return balanced profile by default", () => {
    const config = getRetryConfig();
    expect(config.maxRetries).toBe(RETRY_PROFILES.balanced.maxRetries);
  });

  it("should return stable profile when specified", () => {
    const config = getRetryConfig("stable");
    expect(config.maxRetries).toBe(0);
    expect(config.jitter).toBe("none");
  });

  it("should return aggressive profile when specified", () => {
    const config = getRetryConfig("aggressive");
    expect(config.maxRetries).toBe(5);
    expect(config.jitter).toBe("full");
  });

  it("should apply OpenAI provider overrides from balanced profile", () => {
    const config = getRetryConfig("balanced", "openai");
    expect(config.maxRetries).toBe(2); // Overridden in profile
    expect(config.maxDelayMs).toBe(45_000); // Overridden in profile
  });

  it("should apply Anthropic provider overrides from balanced profile", () => {
    const config = getRetryConfig("balanced", "anthropic");
    expect(config.maxRetries).toBe(3);
    expect(config.maxDelayMs).toBe(60_000);
  });

  it("should apply Google provider overrides from balanced profile", () => {
    const config = getRetryConfig("balanced", "google");
    expect(config.maxRetries).toBe(2);
    expect(config.initialDelayMs).toBe(1000);
  });

  it("should use default provider settings when not in profile", () => {
    const config = getRetryConfig("stable", "openai");
    // Stable has no provider overrides, so PROVIDER_RETRY_DEFAULTS.openai applies
    // maxRetries is overridden from 0 (stable) to 2 (openai default)
    expect(config.maxRetries).toBe(2); // OpenAI default override
    expect(config.initialDelayMs).toBe(800); // OpenAI default
  });

  it("should return config without provider overrides for unknown provider", () => {
    const config = getRetryConfig("balanced", "unknown-provider");
    expect(config.maxRetries).toBe(RETRY_PROFILES.balanced.maxRetries);
  });

  it("should ensure maxDelayMs >= initialDelayMs", () => {
    const config = getRetryConfig("balanced");
    expect(config.maxDelayMs).toBeGreaterThanOrEqual(config.initialDelayMs);
  });
});

describe("createRetryConfigFromEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return balanced profile by default", () => {
    delete process.env.PI_RETRY_PROFILE;
    delete process.env.PI_LLM_PROVIDER;

    const config = createRetryConfigFromEnv();
    expect(config.maxRetries).toBe(RETRY_PROFILES.balanced.maxRetries);
  });

  it("should use PI_RETRY_PROFILE environment variable", () => {
    process.env.PI_RETRY_PROFILE = "stable";

    const config = createRetryConfigFromEnv();
    expect(config.maxRetries).toBe(0);
  });

  it("should use PI_LLM_PROVIDER for provider overrides", () => {
    process.env.PI_RETRY_PROFILE = "balanced";
    process.env.PI_LLM_PROVIDER = "openai";

    const config = createRetryConfigFromEnv();
    expect(config.maxRetries).toBe(2); // OpenAI override
  });

  it("should handle invalid profile gracefully", () => {
    process.env.PI_RETRY_PROFILE = "invalid-profile";

    const config = createRetryConfigFromEnv();
    expect(config.maxRetries).toBe(RETRY_PROFILES.balanced.maxRetries);
  });

  it("should be case-insensitive for profile", () => {
    process.env.PI_RETRY_PROFILE = "STABLE";

    const config = createRetryConfigFromEnv();
    expect(config.maxRetries).toBe(0);
  });
});

describe("getActiveRetryProfile", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return balanced by default", () => {
    delete process.env.PI_RETRY_PROFILE;
    expect(getActiveRetryProfile()).toBe("balanced");
  });

  it("should return stable when configured", () => {
    process.env.PI_RETRY_PROFILE = "stable";
    expect(getActiveRetryProfile()).toBe("stable");
  });

  it("should return aggressive when configured", () => {
    process.env.PI_RETRY_PROFILE = "aggressive";
    expect(getActiveRetryProfile()).toBe("aggressive");
  });
});

describe("isStableRetryProfile", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return false for balanced profile", () => {
    delete process.env.PI_RETRY_PROFILE;
    expect(isStableRetryProfile()).toBe(false);
  });

  it("should return true for stable profile", () => {
    process.env.PI_RETRY_PROFILE = "stable";
    expect(isStableRetryProfile()).toBe(true);
  });

  it("should return false for aggressive profile", () => {
    process.env.PI_RETRY_PROFILE = "aggressive";
    expect(isStableRetryProfile()).toBe(false);
  });
});

describe("isValidRetryConfig", () => {
  it("should validate correct configuration", () => {
    const config: RetryConfig = {
      maxRetries: 3,
      initialDelayMs: 800,
      maxDelayMs: 60_000,
      multiplier: 2.0,
      jitter: "partial",
    };
    expect(isValidRetryConfig(config)).toBe(true);
  });

  it("should reject negative maxRetries", () => {
    const config: RetryConfig = {
      maxRetries: -1,
      initialDelayMs: 800,
      maxDelayMs: 60_000,
      multiplier: 2.0,
      jitter: "partial",
    };
    expect(isValidRetryConfig(config)).toBe(false);
  });

  it("should reject maxRetries > 20", () => {
    const config: RetryConfig = {
      maxRetries: 21,
      initialDelayMs: 800,
      maxDelayMs: 60_000,
      multiplier: 2.0,
      jitter: "partial",
    };
    expect(isValidRetryConfig(config)).toBe(false);
  });

  it("should reject initialDelayMs < 1", () => {
    const config: RetryConfig = {
      maxRetries: 3,
      initialDelayMs: 0,
      maxDelayMs: 60_000,
      multiplier: 2.0,
      jitter: "partial",
    };
    expect(isValidRetryConfig(config)).toBe(false);
  });

  it("should reject maxDelayMs < initialDelayMs", () => {
    const config: RetryConfig = {
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 500,
      multiplier: 2.0,
      jitter: "partial",
    };
    expect(isValidRetryConfig(config)).toBe(false);
  });

  it("should reject invalid jitter mode", () => {
    const config = {
      maxRetries: 3,
      initialDelayMs: 800,
      maxDelayMs: 60_000,
      multiplier: 2.0,
      jitter: "invalid" as "full" | "partial" | "none",
    };
    expect(isValidRetryConfig(config)).toBe(false);
  });

  it("should reject multiplier < 1", () => {
    const config: RetryConfig = {
      maxRetries: 3,
      initialDelayMs: 800,
      maxDelayMs: 60_000,
      multiplier: 0.5,
      jitter: "partial",
    };
    expect(isValidRetryConfig(config)).toBe(false);
  });
});

describe("mergeRetryConfig", () => {
  it("should return copy of base when no overrides", () => {
    const base: RetryConfig = {
      maxRetries: 3,
      initialDelayMs: 800,
      maxDelayMs: 60_000,
      multiplier: 2.0,
      jitter: "partial",
    };

    const merged = mergeRetryConfig(base);

    expect(merged).toEqual(base);
    expect(merged).not.toBe(base);
  });

  it("should apply overrides to base", () => {
    const base: RetryConfig = {
      maxRetries: 3,
      initialDelayMs: 800,
      maxDelayMs: 60_000,
      multiplier: 2.0,
      jitter: "partial",
    };

    const merged = mergeRetryConfig(base, { maxRetries: 5 });

    expect(merged.maxRetries).toBe(5);
    expect(merged.initialDelayMs).toBe(800); // Unchanged
  });

  it("should ensure maxDelayMs >= initialDelayMs after merge", () => {
    const base: RetryConfig = {
      maxRetries: 3,
      initialDelayMs: 800,
      maxDelayMs: 60_000,
      multiplier: 2.0,
      jitter: "partial",
    };

    const merged = mergeRetryConfig(base, { initialDelayMs: 100_000 });

    expect(merged.maxDelayMs).toBe(100_000);
  });

  it("should preserve all base values not overridden", () => {
    const base: RetryConfig = {
      maxRetries: 3,
      initialDelayMs: 800,
      maxDelayMs: 60_000,
      multiplier: 2.0,
      jitter: "partial",
    };

    const merged = mergeRetryConfig(base, { jitter: "full" });

    expect(merged.maxRetries).toBe(3);
    expect(merged.initialDelayMs).toBe(800);
    expect(merged.maxDelayMs).toBe(60_000);
    expect(merged.multiplier).toBe(2.0);
    expect(merged.jitter).toBe("full");
  });
});

describe("PROVIDER_RETRY_DEFAULTS", () => {
  it("should define defaults for major providers", () => {
    expect(PROVIDER_RETRY_DEFAULTS.openai).toBeDefined();
    expect(PROVIDER_RETRY_DEFAULTS.anthropic).toBeDefined();
    expect(PROVIDER_RETRY_DEFAULTS.google).toBeDefined();
    expect(PROVIDER_RETRY_DEFAULTS.azure).toBeDefined();
    expect(PROVIDER_RETRY_DEFAULTS.local).toBeDefined();
  });

  it("should have conservative defaults for local models", () => {
    expect(PROVIDER_RETRY_DEFAULTS.local?.maxRetries).toBe(1);
    expect(PROVIDER_RETRY_DEFAULTS.local?.initialDelayMs).toBe(500);
  });
});
