/**
 * @jest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SemanticCache,
  DEFAULT_SEMANTIC_CACHE_CONFIG,
  createFileHashMap,
  getSharedSemanticCache,
  type CacheEntry,
  type SemanticCacheConfig,
} from "../../lib/semantic-cache.js";

describe("semantic-cache", () => {
  describe("DEFAULT_SEMANTIC_CACHE_CONFIG", () => {
    it("should_have_sensible_defaults", () => {
      // Arrange & Act & Assert
      expect(DEFAULT_SEMANTIC_CACHE_CONFIG.enabled).toBe(true);
      expect(DEFAULT_SEMANTIC_CACHE_CONFIG.similarityThreshold).toBe(0.85);
      expect(DEFAULT_SEMANTIC_CACHE_CONFIG.maxEntries).toBe(1000);
      expect(DEFAULT_SEMANTIC_CACHE_CONFIG.ttlMs).toBe(1_800_000); // 30 minutes
    });
  });

  describe("SemanticCache", () => {
    let cache: SemanticCache;
    let mockEmbeddingProvider: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockEmbeddingProvider = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
      cache = new SemanticCache(undefined, mockEmbeddingProvider);
    });

    describe("constructor", () => {
      it("should_create_cache_with_default_config", () => {
        // Arrange & Act
        const c = new SemanticCache();

        // Assert
        const stats = c.getStats();
        expect(stats.enabled).toBe(true);
        expect(stats.maxEntries).toBe(1000);
      });

      it("should_accept_custom_config", () => {
        // Arrange
        const config: SemanticCacheConfig = {
          enabled: false,
          similarityThreshold: 0.9,
          maxEntries: 500,
          ttlMs: 60000,
        };

        // Act
        const c = new SemanticCache(config);

        // Assert
        const stats = c.getStats();
        expect(stats.enabled).toBe(false);
        expect(stats.maxEntries).toBe(500);
      });
    });

    describe("add", () => {
      it("should_add_entry_to_cache", async () => {
        // Arrange
        const task = "Implement feature X";
        const agentId = "implementer";
        const result = { status: "success" };
        const fileHashes = { "file.ts": "abc123" };

        // Act
        const entry = await cache.add(task, agentId, result, fileHashes);

        // Assert
        expect(entry.task).toBe(task);
        expect(entry.agentId).toBe(agentId);
        expect(entry.result).toBe(result);
        expect(entry.fileHashes).toEqual(fileHashes);
        expect(entry.timestamp).toBeGreaterThan(0);
      });

      it("should_increment_entry_count", async () => {
        // Arrange & Act
        await cache.add("task1", "agent1", {}, {});
        await cache.add("task2", "agent2", {}, {});

        // Assert
        const stats = cache.getStats();
        expect(stats.entryCount).toBe(2);
      });

      it("should_evict_oldest_entries_when_exceeding_max", async () => {
        // Arrange
        const smallCache = new SemanticCache(
          { ...DEFAULT_SEMANTIC_CACHE_CONFIG, maxEntries: 3 },
          mockEmbeddingProvider
        );

        // Act
        await smallCache.add("task1", "agent", {}, {});
        await smallCache.add("task2", "agent", {}, {});
        await smallCache.add("task3", "agent", {}, {});
        await smallCache.add("task4", "agent", {}, {});

        // Assert
        const stats = smallCache.getStats();
        expect(stats.entryCount).toBe(3);
      });
    });

    describe("findSimilar", () => {
      it("should_return_null_when_disabled", async () => {
        // Arrange
        const disabledCache = new SemanticCache({
          ...DEFAULT_SEMANTIC_CACHE_CONFIG,
          enabled: false,
        });
        await disabledCache.add("task", "agent", {}, {});

        // Act
        const result = await disabledCache.findSimilar("task", "agent", {});

        // Assert
        expect(result).toBeNull();
      });

      it("should_return_null_when_no_embedding_provider", async () => {
        // Arrange
        const noProviderCache = new SemanticCache();
        await noProviderCache.add("task", "agent", {}, {});

        // Act
        const result = await noProviderCache.findSimilar("task", "agent", {});

        // Assert
        expect(result).toBeNull();
      });

      it("should_return_null_for_different_agent", async () => {
        // Arrange
        await cache.add("task", "agent1", { data: 1 }, {});

        // Act
        const result = await cache.findSimilar("task", "agent2", {});

        // Assert
        expect(result).toBeNull();
      });

      it("should_return_null_for_expired_ttl", async () => {
        // Arrange
        const shortTtlCache = new SemanticCache(
          { ...DEFAULT_SEMANTIC_CACHE_CONFIG, ttlMs: 1 }, // 1ms TTL
          mockEmbeddingProvider
        );

        await shortTtlCache.add("task", "agent", { data: 1 }, {});

        // Wait for TTL to expire
        await new Promise((r) => setTimeout(r, 10));

        // Act
        const result = await shortTtlCache.findSimilar("task", "agent", {});

        // Assert
        expect(result).toBeNull();
      });

      it("should_return_null_for_file_hash_mismatch", async () => {
        // Arrange
        await cache.add("task", "agent", { data: 1 }, { "file.ts": "hash1" });

        // Act - Different file hash
        const result = await cache.findSimilar("task", "agent", {
          "file.ts": "hash2",
        });

        // Assert
        expect(result).toBeNull();
      });

      it("should_find_similar_entry", async () => {
        // Arrange
        mockEmbeddingProvider.mockResolvedValue([0.5, 0.5, 0.5]);
        await cache.add("Implement feature X", "agent", { status: "done" }, {});

        // Act
        const result = await cache.findSimilar(
          "Create implementation for feature X",
          "agent",
          {}
        );

        // Assert
        expect(result).not.toBeNull();
        expect(result?.result).toEqual({ status: "done" });
      });

      it("should_return_null_below_similarity_threshold", async () => {
        // Arrange - Different embeddings
        mockEmbeddingProvider
          .mockResolvedValueOnce([1, 0, 0]) // For add
          .mockResolvedValueOnce([0, 1, 0]); // For findSimilar (orthogonal)

        await cache.add("Task A", "agent", { data: 1 }, {});

        // Act
        const result = await cache.findSimilar("Completely different task", "agent", {});

        // Assert
        expect(result).toBeNull();
      });

      it("should_handle_embedding_provider_failure", async () => {
        // Arrange
        mockEmbeddingProvider.mockRejectedValue(new Error("Embedding failed"));

        // Act
        const result = await cache.findSimilar("task", "agent", {});

        // Assert
        expect(result).toBeNull();
      });
    });

    describe("clear", () => {
      it("should_remove_all_entries", async () => {
        // Arrange
        await cache.add("task1", "agent", {}, {});
        await cache.add("task2", "agent", {}, {});

        // Act
        cache.clear();

        // Assert
        expect(cache.getStats().entryCount).toBe(0);
      });
    });

    describe("getStats", () => {
      it("should_return_correct_statistics", async () => {
        // Arrange
        await cache.add("task1", "agent", {}, {});
        await cache.add("task2", "agent", {}, {});

        // Act
        const stats = cache.getStats();

        // Assert
        expect(stats.entryCount).toBe(2);
        expect(stats.maxEntries).toBe(1000);
        expect(stats.enabled).toBe(true);
      });
    });

    describe("cosineSimilarity", () => {
      it("should_return_1_for_identical_vectors", async () => {
        // Arrange
        mockEmbeddingProvider.mockResolvedValue([1, 2, 3]);
        await cache.add("task", "agent", { data: 1 }, {});

        // Act - Same embedding should match
        const result = await cache.findSimilar("task", "agent", {});

        // Assert
        expect(result).not.toBeNull();
      });

      it("should_handle_zero_vectors", async () => {
        // Arrange
        mockEmbeddingProvider.mockResolvedValue([0, 0, 0]);
        await cache.add("task", "agent", { data: 1 }, {});

        // Act
        const result = await cache.findSimilar("task", "agent", {});

        // Assert - Zero vectors should not match (denom is 0)
        expect(result).toBeNull();
      });

      it("should_handle_mismatched_vector_lengths", async () => {
        // Arrange
        mockEmbeddingProvider
          .mockResolvedValueOnce([1, 2, 3]) // For add
          .mockResolvedValueOnce([1, 2]); // For find (different length)

        await cache.add("task", "agent", { data: 1 }, {});

        // Act
        const result = await cache.findSimilar("task", "agent", {});

        // Assert
        expect(result).toBeNull();
      });
    });
  });

  describe("createFileHashMap", () => {
    it("should_create_hash_map_from_files", async () => {
      // Arrange
      const mockReadContent = vi
        .fn()
        .mockResolvedValueOnce("content of file1")
        .mockResolvedValueOnce("content of file2");

      // Act
      const hashes = await createFileHashMap(
        ["file1.ts", "file2.ts"],
        mockReadContent
      );

      // Assert
      expect(hashes["file1.ts"]).toBeDefined();
      expect(hashes["file2.ts"]).toBeDefined();
      expect(mockReadContent).toHaveBeenCalledTimes(2);
    });

    it("should_skip_unreadable_files", async () => {
      // Arrange
      const mockReadContent = vi
        .fn()
        .mockResolvedValueOnce("content")
        .mockRejectedValueOnce(new Error("File not found"));

      // Act
      const hashes = await createFileHashMap(
        ["readable.ts", "unreadable.ts"],
        mockReadContent
      );

      // Assert
      expect(hashes["readable.ts"]).toBeDefined();
      expect(hashes["unreadable.ts"]).toBeUndefined();
    });

    it("should_include_length_and_content_samples_in_hash", async () => {
      // Arrange
      const content = "Hello World";
      const mockReadContent = vi.fn().mockResolvedValue(content);

      // Act
      const hashes = await createFileHashMap(["file.ts"], mockReadContent);

      // Assert
      const hash = hashes["file.ts"];
      expect(hash).toContain(`${content.length}:`);
      expect(hash).toContain(content.slice(0, 32));
      expect(hash).toContain(content.slice(-32));
    });
  });

  describe("getSharedSemanticCache", () => {
    it("should_return_same_instance_on_multiple_calls", () => {
      // Arrange & Act
      const cache1 = getSharedSemanticCache();
      const cache2 = getSharedSemanticCache();

      // Assert
      expect(cache1).toBe(cache2);
    });

    it("should_create_new_instance_with_config", () => {
      // Arrange & Act
      const cache1 = getSharedSemanticCache();
      const cache2 = getSharedSemanticCache({ maxEntries: 500 });

      // Assert
      expect(cache2).not.toBe(cache1);
    });
  });
});
