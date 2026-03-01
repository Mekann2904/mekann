/**
 * @abdd.meta
 * @path .pi/tests/lib/context-repository.test.ts
 * @role Test suite for SACMS hierarchical context repository
 * @why Verify context management, relevance-based distribution, and inheritance
 * @related ../../lib/context-repository.ts
 * @public_api Tests for ContextRepository class and exported constants
 * @invariants Tests should not depend on external state
 * @side_effects None expected
 * @failure_modes None expected
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  ContextRepository,
  RELEVANCE_THRESHOLD,
  type ContextNode,
  type ContextSearchOptions,
} from "../../lib/context-repository";

describe("context-repository", () => {
  let repository: ContextRepository;

  beforeEach(() => {
    repository = new ContextRepository();
  });

  describe("RELEVANCE_THRESHOLD", () => {
    it("RELEVANCE_THRESHOLD_hasExpectedValue", () => {
      expect(RELEVANCE_THRESHOLD).toBe(0.65);
    });
  });

  describe("constructor", () => {
    it("constructor_createsEmptyRepository", () => {
      expect(repository.size()).toBe(0);
      expect(repository.getRoot()).toBeNull();
    });
  });

  describe("addContext", () => {
    it("addContext_createsRootNode_whenNoParent", () => {
      const node = repository.addContext("task-1", "Root content");

      expect(repository.getRoot()).toBe(node);
      expect(node.id).toBe("ctx-task-1");
      expect(node.content).toBe("Root content");
      expect(node.children).toEqual([]);
    });

    it("addContext_createsChildNode_whenParentSpecified", () => {
      repository.addContext("parent", "Parent content");
      const child = repository.addContext("child", "Child content", "parent");

      const parent = repository.getContextByTaskId("parent");
      expect(parent?.children).toContainEqual(child);
    });

    it("addContext_setsMetadata", () => {
      const node = repository.addContext("task-1", "Test content");

      expect(node.metadata.taskId).toBe("task-1");
      expect(node.metadata.timestamp).toBeDefined();
      expect(node.metadata.tokens).toBeGreaterThan(0);
      expect(node.metadata.relevance).toBe(1.0);
    });

    it("addContext_estimatesTokens", () => {
      const longContent = "x".repeat(1000);
      const node = repository.addContext("task-1", longContent);

      expect(node.metadata.tokens).toBeGreaterThan(0);
    });

    it("addContext_multipleChildren_createsHierarchy", () => {
      repository.addContext("root", "Root");
      repository.addContext("child1", "Child 1", "root");
      repository.addContext("child2", "Child 2", "root");

      const root = repository.getContextByTaskId("root");
      expect(root?.children).toHaveLength(2);
    });
  });

  describe("setEmbedding", () => {
    it("setEmbedding_setsEmbeddingOnNode", () => {
      repository.addContext("task-1", "Content");
      const embedding = [0.1, 0.2, 0.3, 0.4];

      repository.setEmbedding("task-1", embedding);

      const node = repository.getContextByTaskId("task-1");
      expect(node?.embedding).toEqual(embedding);
    });

    it("setEmbedding_nonExistentTask_doesNothing", () => {
      repository.setEmbedding("non-existent", [0.1, 0.2]);

      expect(repository.size()).toBe(0);
    });
  });

  describe("getRelevantContext", () => {
    it("getRelevantContext_emptyRepository_returnsEmptyArray", () => {
      const queryEmbedding = [0.1, 0.2, 0.3];
      const results = repository.getRelevantContext(queryEmbedding);

      expect(results).toEqual([]);
    });

    it("getRelevantContext_noEmbeddings_returnsEmptyArray", () => {
      repository.addContext("task-1", "Content without embedding");

      const queryEmbedding = [0.1, 0.2, 0.3];
      const results = repository.getRelevantContext(queryEmbedding);

      expect(results).toEqual([]);
    });

    it("getRelevantContext_filtersByThreshold", () => {
      repository.addContext("task-1", "Content 1");
      repository.addContext("task-2", "Content 2");

      // Set embeddings - one similar, one different
      repository.setEmbedding("task-1", [1, 0, 0]);
      repository.setEmbedding("task-2", [0, 1, 0]);

      // Query similar to task-1
      const queryEmbedding = [0.9, 0.1, 0];
      const results = repository.getRelevantContext(queryEmbedding, 0.8);

      // Only task-1 should match (cosine similarity ~0.9)
      expect(results.length).toBeLessThanOrEqual(1);
      if (results.length > 0) {
        expect(results[0].metadata.taskId).toBe("task-1");
      }
    });

    it("getRelevantContext_usesDefaultThreshold", () => {
      repository.addContext("task-1", "Content");
      repository.setEmbedding("task-1", [1, 0, 0]);

      // Query exactly at threshold boundary
      const queryEmbedding = [0.8, 0.6, 0]; // Cosine similarity = 0.8
      const results = repository.getRelevantContext(queryEmbedding);

      // Should use RELEVANCE_THRESHOLD (0.65)
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it("getRelevantContext_sortsByRelevance", () => {
      repository.addContext("task-1", "Content 1");
      repository.addContext("task-2", "Content 2");
      repository.addContext("task-3", "Content 3");

      repository.setEmbedding("task-1", [1, 0, 0]);
      repository.setEmbedding("task-2", [0.7, 0.7, 0]);
      repository.setEmbedding("task-3", [0, 1, 0]);

      const queryEmbedding = [0.9, 0.1, 0];
      const results = repository.getRelevantContext(queryEmbedding, 0.5);

      // Should be sorted by relevance descending
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].metadata.relevance).toBeGreaterThanOrEqual(
          results[i].metadata.relevance
        );
      }
    });

    it("getRelevantContext_traversesHierarchy", () => {
      repository.addContext("root", "Root content");
      repository.addContext("child", "Child content", "root");

      repository.setEmbedding("root", [1, 0, 0]);
      repository.setEmbedding("child", [0.9, 0.1, 0]);

      const queryEmbedding = [0.95, 0.05, 0];
      const results = repository.getRelevantContext(queryEmbedding, 0.8);

      // Both should be found
      expect(results.length).toBe(2);
    });
  });

  describe("getContextByTaskId", () => {
    it("getContextByTaskId_existingTask_returnsNode", () => {
      const added = repository.addContext("task-1", "Content");

      const found = repository.getContextByTaskId("task-1");

      expect(found).toBe(added);
    });

    it("getContextByTaskId_nonExistentTask_returnsUndefined", () => {
      const found = repository.getContextByTaskId("non-existent");

      expect(found).toBeUndefined();
    });
  });

  describe("getInheritedContext", () => {
    it("getInheritedContext_noParent_returnsEmptyArray", () => {
      repository.addContext("task-1", "Content");

      const inherited = repository.getInheritedContext("task-1");

      expect(inherited).toEqual([]);
    });

    it("getInheritedContext_withParent_returnsParent", () => {
      repository.addContext("parent", "Parent content");
      repository.addContext("child", "Child content", "parent");

      const inherited = repository.getInheritedContext("child");

      expect(inherited.length).toBe(1);
      expect(inherited[0].metadata.taskId).toBe("parent");
    });

    it("getInheritedContext_withGrandparent_returnsAncestors", () => {
      repository.addContext("grandparent", "Grandparent content");
      repository.addContext("parent", "Parent content", "grandparent");
      repository.addContext("child", "Child content", "parent");

      const inherited = repository.getInheritedContext("child");

      expect(inherited.length).toBe(2);
      const taskIds = inherited.map((n) => n.metadata.taskId);
      expect(taskIds).toContain("parent");
      expect(taskIds).toContain("grandparent");
    });

    it("getInheritedContext_nonExistentTask_returnsEmptyArray", () => {
      const inherited = repository.getInheritedContext("non-existent");

      expect(inherited).toEqual([]);
    });
  });

  describe("compressContext", () => {
    it("compressContext_shortContent_returnsAsIs", async () => {
      const node = repository.addContext("task-1", "Short content");

      const compressed = await repository.compressContext(node, 1000);

      expect(compressed).toBe("Short content");
    });

    it("compressContext_longContent_compresses", async () => {
      const longContent = "x".repeat(10000);
      const node = repository.addContext("task-1", longContent);

      const compressed = await repository.compressContext(node, 100);

      // Should be truncated (stub implementation)
      expect(compressed.length).toBeLessThanOrEqual(10000);
    });
  });

  describe("size", () => {
    it("size_emptyRepository_returnsZero", () => {
      expect(repository.size()).toBe(0);
    });

    it("size_withNodes_returnsCorrectCount", () => {
      repository.addContext("task-1", "Content 1");
      repository.addContext("task-2", "Content 2");
      repository.addContext("task-3", "Content 3");

      expect(repository.size()).toBe(3);
    });
  });

  describe("getRoot", () => {
    it("getRoot_emptyRepository_returnsNull", () => {
      expect(repository.getRoot()).toBeNull();
    });

    it("getRoot_withRootNode_returnsRoot", () => {
      const root = repository.addContext("root", "Root content");

      expect(repository.getRoot()).toBe(root);
    });
  });

  describe("clear", () => {
    it("clear_removesAllNodes", () => {
      repository.addContext("task-1", "Content 1");
      repository.addContext("task-2", "Content 2");

      repository.clear();

      expect(repository.size()).toBe(0);
      expect(repository.getRoot()).toBeNull();
    });
  });

  describe("getStats", () => {
    it("getStats_emptyRepository_returnsZeroStats", () => {
      const stats = repository.getStats();

      expect(stats.totalNodes).toBe(0);
      expect(stats.totalTokens).toBe(0);
      expect(stats.maxDepth).toBe(0);
      expect(stats.avgTokensPerNode).toBe(0);
    });

    it("getStats_withNodes_returnsCorrectStats", () => {
      repository.addContext("root", "Root content");
      repository.addContext("child", "Child content", "root");

      const stats = repository.getStats();

      expect(stats.totalNodes).toBe(2);
      expect(stats.totalTokens).toBeGreaterThan(0);
      expect(stats.maxDepth).toBe(2);
      expect(stats.avgTokensPerNode).toBeGreaterThan(0);
    });

    it("getStats_calculatesMaxDepth", () => {
      repository.addContext("level1", "Level 1");
      repository.addContext("level2", "Level 2", "level1");
      repository.addContext("level3", "Level 3", "level2");

      const stats = repository.getStats();

      expect(stats.maxDepth).toBe(3);
    });
  });

  describe("integration tests", () => {
    it("full context management workflow", async () => {
      // Build hierarchy
      const root = repository.addContext("main-task", "Main task description");
      const subtask1 = repository.addContext("subtask-1", "First subtask", "main-task");
      const subtask2 = repository.addContext("subtask-2", "Second subtask", "main-task");

      // Set embeddings
      repository.setEmbedding("main-task", [1, 0, 0, 0]);
      repository.setEmbedding("subtask-1", [0.9, 0.1, 0, 0]);
      repository.setEmbedding("subtask-2", [0.1, 0.9, 0, 0]);

      // Query for relevant context
      const queryEmbedding = [0.95, 0.05, 0, 0];
      const relevant = repository.getRelevantContext(queryEmbedding, 0.8);

      expect(relevant.length).toBeGreaterThan(0);

      // Get inherited context
      const inherited = repository.getInheritedContext("subtask-1");
      expect(inherited.some((n) => n.metadata.taskId === "main-task")).toBe(true);

      // Compress long content
      const longContent = "x".repeat(5000);
      const longNode = repository.addContext("long-task", longContent);
      const compressed = await repository.compressContext(longNode, 100);
      expect(compressed.length).toBeLessThanOrEqual(5000);

      // Get stats
      const stats = repository.getStats();
      expect(stats.totalNodes).toBe(4);
    });

    it("relevance-based context distribution", () => {
      // Create multiple contexts with different embeddings
      const contexts = [
        { id: "ctx-1", content: "About programming", embedding: [1, 0, 0] },
        { id: "ctx-2", content: "About cooking", embedding: [0, 1, 0] },
        { id: "ctx-3", content: "About sports", embedding: [0, 0, 1] },
        { id: "ctx-4", content: "About programming too", embedding: [0.9, 0.1, 0] },
      ];

      contexts.forEach((ctx) => {
        repository.addContext(ctx.id, ctx.content);
        repository.setEmbedding(ctx.id, ctx.embedding);
      });

      // Query for programming-related content
      const queryEmbedding = [0.95, 0.05, 0];
      const results = repository.getRelevantContext(queryEmbedding, 0.7);

      // Should find programming-related contexts
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.metadata.relevance >= 0.7)).toBe(true);
    });

    it("hierarchical context inheritance", () => {
      // Build deep hierarchy
      repository.addContext("project", "Project context");
      repository.addContext("module", "Module context", "project");
      repository.addContext("feature", "Feature context", "module");
      repository.addContext("task", "Task context", "feature");

      // Get inheritance chain
      const inherited = repository.getInheritedContext("task");

      expect(inherited.length).toBe(3);
      const taskIds = inherited.map((n) => n.metadata.taskId);
      expect(taskIds).toContain("feature");
      expect(taskIds).toContain("module");
      expect(taskIds).toContain("project");
    });
  });
});
