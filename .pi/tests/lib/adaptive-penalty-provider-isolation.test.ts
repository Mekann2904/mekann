/**
 * Tests for provider-isolated adaptive penalty controller.
 * Phase 1 - Quick Wins: Adaptive Penalty Per-Provider Isolation
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createProviderIsolatedPenaltyController,
  extractProviderFromModel,
  type ProviderIsolatedPenaltyController,
} from "../../lib/agent/adaptive-penalty";

describe("extractProviderFromModel", () => {
  it("should identify OpenAI models", () => {
    expect(extractProviderFromModel("gpt-4")).toBe("openai");
    expect(extractProviderFromModel("gpt-3.5-turbo")).toBe("openai");
    expect(extractProviderFromModel("gpt-4-turbo-preview")).toBe("openai");
    expect(extractProviderFromModel("o1-preview")).toBe("openai");
    expect(extractProviderFromModel("o3-mini")).toBe("openai");
  });

  it("should identify Anthropic models", () => {
    expect(extractProviderFromModel("claude-3-opus")).toBe("anthropic");
    expect(extractProviderFromModel("claude-3-sonnet")).toBe("anthropic");
    expect(extractProviderFromModel("claude-2.1")).toBe("anthropic");
    expect(extractProviderFromModel("claude-instant-1.2")).toBe("anthropic");
  });

  it("should identify Google models", () => {
    expect(extractProviderFromModel("gemini-pro")).toBe("google");
    expect(extractProviderFromModel("gemini-1.5-flash")).toBe("google");
    expect(extractProviderFromModel("gemini-ultra")).toBe("google");
  });

  it("should identify local models", () => {
    expect(extractProviderFromModel("local-llama-2")).toBe("local");
    expect(extractProviderFromModel("ollama-llama3")).toBe("local");
    expect(extractProviderFromModel("llama-3-70b")).toBe("local");
  });

  it("should identify Azure models", () => {
    expect(extractProviderFromModel("azure-gpt-4")).toBe("azure");
    expect(extractProviderFromModel("azure-openai-deployment")).toBe("azure");
  });

  it("should return 'unknown' for unrecognized models", () => {
    expect(extractProviderFromModel("unknown-model")).toBe("unknown");
    expect(extractProviderFromModel("custom-model")).toBe("unknown");
    expect(extractProviderFromModel("")).toBe("unknown");
  });

  it("should be case-insensitive", () => {
    expect(extractProviderFromModel("GPT-4")).toBe("openai");
    expect(extractProviderFromModel("CLAUDE-3-OPUS")).toBe("anthropic");
    expect(extractProviderFromModel("Gemini-Pro")).toBe("google");
  });
});

describe("createProviderIsolatedPenaltyController", () => {
  let controller: ProviderIsolatedPenaltyController;

  beforeEach(() => {
    controller = createProviderIsolatedPenaltyController({
      isStable: false,
      maxPenalty: 8,
      decayMs: 60_000,
      decayStrategy: "hybrid",
    });
  });

  it("should create independent controllers per provider", () => {
    const openaiController = controller.getProviderController("openai");
    const anthropicController = controller.getProviderController("anthropic");

    expect(openaiController).toBeDefined();
    expect(anthropicController).toBeDefined();
    expect(openaiController).not.toBe(anthropicController);
  });

  it("should isolate penalties between providers", () => {
    // Raise penalty for OpenAI
    controller.raise("openai", "rate_limit");
    controller.raise("openai", "rate_limit");

    // OpenAI should have penalty
    const openaiController = controller.getProviderController("openai");
    expect(openaiController.get()).toBeGreaterThan(0);

    // Anthropic should NOT be affected
    const anthropicController = controller.getProviderController("anthropic");
    expect(anthropicController.get()).toBe(0);
  });

  it("should apply limits independently per provider", () => {
    // Raise OpenAI penalty significantly
    for (let i = 0; i < 5; i++) {
      controller.raise("openai", "rate_limit");
    }

    const baseLimit = 10;

    // OpenAI should have reduced limit
    const openaiLimit = controller.applyLimit("openai", baseLimit);
    expect(openaiLimit).toBeLessThan(baseLimit);

    // Anthropic should have full limit
    const anthropicLimit = controller.applyLimit("anthropic", baseLimit);
    expect(anthropicLimit).toBe(baseLimit);
  });

  it("should lower penalties per provider", () => {
    controller.raise("openai", "rate_limit");
    controller.raise("openai", "rate_limit");

    const beforeLower = controller.getProviderController("openai").get();
    expect(beforeLower).toBeGreaterThan(0);

    controller.lower("openai");

    const afterLower = controller.getProviderController("openai").get();
    expect(afterLower).toBeLessThan(beforeLower);
  });

  it("should return active providers with penalties", () => {
    // Initially no active providers
    expect(controller.getActiveProviders()).toHaveLength(0);

    // Raise penalty for OpenAI
    controller.raise("openai", "rate_limit");

    // OpenAI should be active
    const active = controller.getActiveProviders();
    expect(active).toContain("openai");
    expect(active).not.toContain("anthropic");
  });

  it("should return global penalty for monitoring", () => {
    // Global penalty should start at 0
    expect(controller.getGlobalPenalty()).toBe(0);
  });

  it("should reuse controller for same provider", () => {
    const controller1 = controller.getProviderController("openai");
    const controller2 = controller.getProviderController("openai");

    expect(controller1).toBe(controller2);
  });

  it("should handle rate_limit reason with higher weight", () => {
    controller.raise("openai", "rate_limit");

    const openaiController = controller.getProviderController("openai");
    // rate_limit has weight 2.0 by default
    expect(openaiController.get()).toBe(2);
  });

  it("should handle timeout reason with standard weight", () => {
    controller.raise("openai", "timeout");

    const openaiController = controller.getProviderController("openai");
    // timeout has weight 1.0 by default
    expect(openaiController.get()).toBe(1);
  });

  it("should ensure minimum limit of 1", () => {
    // Raise penalty to maximum
    for (let i = 0; i < 10; i++) {
      controller.raise("openai", "rate_limit");
    }

    const limit = controller.applyLimit("openai", 10);
    expect(limit).toBeGreaterThanOrEqual(1);
  });
});

describe("Provider Isolation Integration Scenarios", () => {
  it("should handle 429 from OpenAI without affecting Anthropic", () => {
    const controller = createProviderIsolatedPenaltyController({
      isStable: false,
      maxPenalty: 8,
      decayMs: 60_000,
    });

    // Simulate OpenAI rate limit
    controller.raise("openai", "rate_limit");
    controller.raise("openai", "rate_limit");
    controller.raise("openai", "rate_limit");

    // OpenAI parallelism should be reduced
    const openaiParallelism = controller.applyLimit("openai", 9);
    expect(openaiParallelism).toBeLessThan(9);

    // Anthropic should still have full parallelism
    const anthropicParallelism = controller.applyLimit("anthropic", 9);
    expect(anthropicParallelism).toBe(9);
  });

  it("should recover independently per provider", () => {
    const controller = createProviderIsolatedPenaltyController({
      isStable: false,
      maxPenalty: 8,
      decayMs: 60_000,
    });

    // Both providers have penalties
    controller.raise("openai", "rate_limit");
    controller.raise("anthropic", "timeout");

    // Lower only OpenAI
    controller.lower("openai");

    // OpenAI penalty should decrease
    const openaiController = controller.getProviderController("openai");
    expect(openaiController.get()).toBe(1); // 2 (rate_limit weight) - 1 (lower)

    // Anthropic penalty should remain
    const anthropicController = controller.getProviderController("anthropic");
    expect(anthropicController.get()).toBe(1);
  });
});
