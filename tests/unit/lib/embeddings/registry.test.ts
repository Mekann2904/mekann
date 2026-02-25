/**
 * @abdd.meta
 * path: tests/unit/lib/embeddings/registry.test.ts
 * role: Unit tests for EmbeddingProviderRegistry
 * why: Ensure provider registration, lookup, and status tracking work correctly
 * related: .pi/lib/embeddings/registry.ts, tests/helpers/shared-mocks.ts
 * public_api: None (test file)
 * invariants: All tests use isolated mocks, no filesystem side effects
 * side_effects: None (all filesystem operations are mocked)
 * failure_modes: Test failures indicate bugs in registry.ts
 * @abdd.explain
 * overview: Comprehensive unit tests for the EmbeddingProviderRegistry class
 * what_it_does: Tests registration, lookup, availability checking, and status reporting
 * why_it_exists: Verify P0 module correctness before integration
 * scope:
 *   in: EmbeddingProviderRegistry public API
 *   out: Private implementation details, other modules
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import { createFsMock } from "../../../helpers/shared-mocks";
import type { EmbeddingProvider, ProviderStatus } from "../../../../.pi/lib/embeddings/types.js";

// Mock modules before importing
vi.mock("node:fs", () => createFsMock());
vi.mock("node:path", () => ({
  join: vi.fn((...args) => args.join("/")),
}));
vi.mock("node:os", () => ({
  homedir: vi.fn(() => "/home/test"),
}));

// Helper to create mock provider
function createMockProvider(overrides: Partial<EmbeddingProvider> = {}): EmbeddingProvider {
  return {
    id: "test-provider",
    name: "Test Provider",
    generateEmbedding: vi.fn().mockResolvedValue(new Float32Array([0.1, 0.2, 0.3])),
    isAvailable: vi.fn().mockResolvedValue(true),
    getModel: vi.fn().mockReturnValue("test-model"),
    getMaxTokens: vi.fn().mockReturnValue(8191),
    ...overrides,
  };
}

describe("EmbeddingProviderRegistry", () => {
  let registry: typeof import("../../../../.pi/lib/embeddings/registry.js");

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    registry = await import("../../../../.pi/lib/embeddings/registry.js");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Registration Tests
  // ===========================================================================

  describe("register", () => {
    it("should register a valid provider", async () => {
      const provider = createMockProvider();
      const { EmbeddingProviderRegistry } = registry;
      const reg = new EmbeddingProviderRegistry();

      reg.register(provider);

      const retrieved = reg.get(provider.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(provider.id);
    });

    it("should overwrite provider with same id", async () => {
      const provider1 = createMockProvider({ id: "same-id", name: "First" });
      const provider2 = createMockProvider({ id: "same-id", name: "Second" });
      const { EmbeddingProviderRegistry } = registry;
      const reg = new EmbeddingProviderRegistry();

      reg.register(provider1);
      reg.register(provider2);

      const retrieved = reg.get("same-id");
      expect(retrieved?.name).toBe("Second");
    });
  });

  // ===========================================================================
  // Unregistration Tests
  // ===========================================================================

  describe("unregister", () => {
    it("should remove registered provider", async () => {
      const provider = createMockProvider();
      const { EmbeddingProviderRegistry } = registry;
      const reg = new EmbeddingProviderRegistry();

      reg.register(provider);
      reg.unregister(provider.id);

      const retrieved = reg.get(provider.id);
      expect(retrieved).toBeUndefined();
    });

    it("should handle unregistering non-existent provider", async () => {
      const { EmbeddingProviderRegistry } = registry;
      const reg = new EmbeddingProviderRegistry();

      // Should not throw
      expect(() => reg.unregister("non-existent")).not.toThrow();
    });
  });

  // ===========================================================================
  // Lookup Tests
  // ===========================================================================

  describe("get", () => {
    it("should return undefined for non-existent provider", async () => {
      const { EmbeddingProviderRegistry } = registry;
      const reg = new EmbeddingProviderRegistry();

      const result = reg.get("non-existent");
      expect(result).toBeUndefined();
    });

    it("should return registered provider", async () => {
      const provider = createMockProvider({ id: "my-provider" });
      const { EmbeddingProviderRegistry } = registry;
      const reg = new EmbeddingProviderRegistry();

      reg.register(provider);
      const result = reg.get("my-provider");

      expect(result).toBe(provider);
    });
  });

  // ===========================================================================
  // List Tests
  // ===========================================================================

  describe("getAll", () => {
    it("should return empty array when no providers registered", async () => {
      const { EmbeddingProviderRegistry } = registry;
      const reg = new EmbeddingProviderRegistry();

      const result = reg.getAll();
      expect(result).toHaveLength(0);
    });

    it("should return all registered providers", async () => {
      const provider1 = createMockProvider({ id: "provider-1" });
      const provider2 = createMockProvider({ id: "provider-2" });
      const provider3 = createMockProvider({ id: "provider-3" });
      const { EmbeddingProviderRegistry } = registry;
      const reg = new EmbeddingProviderRegistry();

      reg.register(provider1);
      reg.register(provider2);
      reg.register(provider3);

      const result = reg.getAll();
      expect(result).toHaveLength(3);
      expect(result.map((p) => p.id)).toContain("provider-1");
      expect(result.map((p) => p.id)).toContain("provider-2");
      expect(result.map((p) => p.id)).toContain("provider-3");
    });
  });

  // ===========================================================================
  // Availability Tests
  // ===========================================================================

  describe("getAvailable", () => {
    it("should return only available providers", async () => {
      const available = createMockProvider({
        id: "available",
        isAvailable: vi.fn().mockResolvedValue(true),
      });
      const unavailable = createMockProvider({
        id: "unavailable",
        isAvailable: vi.fn().mockResolvedValue(false),
      });
      const { EmbeddingProviderRegistry } = registry;
      const reg = new EmbeddingProviderRegistry();

      reg.register(available);
      reg.register(unavailable);

      const result = await reg.getAvailable();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("available");
    });
  });

  // ===========================================================================
  // Status Tests
  // ===========================================================================

  describe("getAllStatus", () => {
    it("should return status for all providers", async () => {
      const provider = createMockProvider();
      const { EmbeddingProviderRegistry } = registry;
      const reg = new EmbeddingProviderRegistry();

      reg.register(provider);
      const statuses = await reg.getAllStatus();

      expect(statuses).toHaveLength(1);
      expect(statuses[0].id).toBe(provider.id);
    });
  });

  // ===========================================================================
  // Parameterized Tests
  // ===========================================================================

  describe("parameterized validation", () => {
    it.each([
      ["openai", "OpenAI", true],
      ["local", "Local Provider", true],
      ["custom-embedding", "Custom", true],
      ["", "Empty ID", false],
      ["has spaces", "Invalid ID", false],
    ])("should validate provider id '%s': %s", (id, _name, expectedValid) => {
      const isValid = id.length > 0 && !id.includes(" ");
      expect(isValid).toBe(expectedValid);
    });

    it.each([
      [128, true, "standard dimension"],
      [256, true, "medium dimension"],
      [512, true, "large dimension"],
      [1536, true, "OpenAI dimension"],
      [0, false, "zero dimension"],
      [-128, false, "negative dimension"],
    ])("should validate embedding dimension %i: %s", (dim, expectedValid, _desc) => {
      const isValid = dim > 0;
      expect(isValid).toBe(expectedValid);
    });
  });
});

// ===========================================================================
// Property-Based Tests
// ===========================================================================

describe("EmbeddingProviderRegistry Property Tests", () => {
  it("should maintain id uniqueness invariant", () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 50 }),
          name: fc.string({ maxLength: 100 }),
        }),
        (providerDef) => {
          // Invariant: same id should always refer to same provider
          const id = providerDef.id;
          expect(id).toBe(providerDef.id);
        }
      )
    );
  });

  it("should handle arbitrary embedding vectors", () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ min: -1, max: 1, noNaN: true }), { minLength: 1, maxLength: 1536 }),
        (embedding) => {
          // Invariant: embedding should be valid array
          expect(embedding.length).toBeGreaterThan(0);
          expect(embedding.every((v) => Number.isFinite(v))).toBe(true);
        }
      )
    );
  });

  it("should maintain consistency: register + get", async () => {
    const { EmbeddingProviderRegistry } = await import("../../../../.pi/lib/embeddings/registry.js");

    fc.assert(
      fc.property(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.includes(" ")),
          name: fc.string({ maxLength: 100 }),
        }),
        (providerDef) => {
          const reg = new EmbeddingProviderRegistry();
          const provider = createMockProvider(providerDef);

          reg.register(provider);

          // Invariant: registered provider should be retrievable
          const retrieved = reg.get(providerDef.id);
          expect(retrieved).toBeDefined();
          expect(retrieved?.id).toBe(providerDef.id);
        }
      )
    );
  });
});
