/**
 * @abdd.meta
 * path: .pi/tests/lib/memory/entity-centric-memory.test.ts
 * role: Entity-Centric Memoryの単体テスト
 * why: エンティティ管理とパーソナライズド検索の動作を保証するため
 * related: .pi/lib/memory/entity-centric-memory.ts
 * public_api: なし（テストファイル）
 * invariants: なし
 * side_effects: なし（モック使用）
 * failure_modes: なし
 * @abdd.explain
 * overview: Entity-Centric MemoryのCRUD操作と検索機能をテストする
 * what_it_does:
 *   - エンティティの作成・取得・更新・削除をテスト
 *   - メモリの追加・検索をテスト
 *   - 重要度計算とアクセス追跡をテスト
 * why_it_exists:
 *   - Entity-Centric Memoryの正しい動作を保証するため
 * scope:
 *   in: テストケース
 *   out: テスト結果
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createEntity,
  getEntity,
  updateEntity,
  deleteEntity,
  getEntitiesByType,
  addMemoryToEntity,
  getMemoriesForEntity,
  searchMemories,
  updateMemoryImportance,
  recordMemoryAccess,
  calculateImportance,
  mergeEntities,
  loadEntityMemoryStore,
  saveEntityMemoryStore,
  resetStore,
  type Entity,
  type EntityMemoryEntry,
  DEFAULT_CONFIG,
} from "../../../lib/memory/entity-centric-memory.js";

// Mock fs and embeddings
vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  unlinkSync: vi.fn(),
  renameSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, size: 0 })),
}));

vi.mock("../../../lib/embeddings/index.js", () => ({
  generateEmbedding: vi.fn(async () => [0.1, 0.2, 0.3]),
  cosineSimilarity: vi.fn((a: number[], b: number[]) => {
    // Simple mock similarity
    if (a.length !== b.length) return 0;
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }),
}));

// Mock cwd
const testCwd = "/test/cwd";

describe("Entity-Centric Memory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  describe("Entity CRUD Operations", () => {
    describe("createEntity", () => {
      it("should create a user entity", () => {
        const entity = createEntity(testCwd, "user", "Test User", {
          email: "test@example.com",
        });

        expect(entity.type).toBe("user");
        expect(entity.name).toBe("Test User");
        expect(entity.attributes.email).toBe("test@example.com");
        expect(entity.id).toBeDefined();
        expect(entity.createdAt).toBeDefined();
      });

      it("should create a task entity", () => {
        const entity = createEntity(testCwd, "task", "Implement Feature", {
          priority: "high",
        });

        expect(entity.type).toBe("task");
        expect(entity.name).toBe("Implement Feature");
        expect(entity.attributes.priority).toBe("high");
      });

      it("should create entity with default attributes", () => {
        const entity = createEntity(testCwd, "project", "My Project");

        expect(entity.attributes).toEqual({});
      });
    });

    describe("getEntity", () => {
      it("should return entity by id", () => {
        const created = createEntity(testCwd, "user", "Test User");
        const retrieved = getEntity(testCwd, created.id);

        expect(retrieved).toEqual(created);
      });

      it("should return null for non-existent entity", () => {
        const result = getEntity(testCwd, "non-existent-id");
        expect(result).toBeNull();
      });
    });

    describe("updateEntity", () => {
      it("should update entity attributes", () => {
        const entity = createEntity(testCwd, "user", "Test User", {
          name: "Original",
        });

        const updated = updateEntity(testCwd, entity.id, {
          name: "Updated",
          newField: "value",
        });

        expect(updated?.attributes.name).toBe("Updated");
        expect(updated?.attributes.newField).toBe("value");
        expect(updated?.updatedAt).toBeDefined();
      });

      it("should return null for non-existent entity", () => {
        const result = updateEntity(testCwd, "non-existent", { x: 1 });
        expect(result).toBeNull();
      });
    });

    describe("deleteEntity", () => {
      it("should delete entity and its memories", () => {
        const entity = createEntity(testCwd, "user", "Test User");
        const deleted = deleteEntity(testCwd, entity.id);

        expect(deleted).toBe(true);
        expect(getEntity(testCwd, entity.id)).toBeNull();
      });

      it("should return false for non-existent entity", () => {
        const result = deleteEntity(testCwd, "non-existent");
        expect(result).toBe(false);
      });
    });

    describe("getEntitiesByType", () => {
      it("should return entities of specific type", () => {
        createEntity(testCwd, "user", "User 1");
        createEntity(testCwd, "user", "User 2");
        createEntity(testCwd, "task", "Task 1");

        const users = getEntitiesByType(testCwd, "user");
        const tasks = getEntitiesByType(testCwd, "task");

        expect(users.length).toBe(2);
        expect(tasks.length).toBe(1);
      });

      it("should return empty array for type with no entities", () => {
        const projects = getEntitiesByType(testCwd, "project");
        expect(projects).toEqual([]);
      });
    });
  });

  describe("Memory Operations", () => {
    let testEntity: Entity;

    beforeEach(() => {
      testEntity = createEntity(testCwd, "user", "Test User");
    });

    describe("addMemoryToEntity", () => {
      it("should add memory to entity", async () => {
        const entry = await addMemoryToEntity(
          testCwd,
          testEntity.id,
          "User prefers dark mode",
          "user_input"
        );

        expect(entry.content).toBe("User prefers dark mode");
        expect(entry.entityId).toBe(testEntity.id);
        expect(entry.source).toBe("user_input");
        expect(entry.importance).toBe(0.5);
      });

      it("should generate embedding for memory", async () => {
        const entry = await addMemoryToEntity(
          testCwd,
          testEntity.id,
          "Test content",
          "agent_observation",
          { ...DEFAULT_CONFIG, embeddingEnabled: true }
        );

        expect(entry.embedding).toBeDefined();
        expect(entry.embedding?.length).toBe(3); // Mock returns [0.1, 0.2, 0.3]
      });

      it("should throw error for non-existent entity", async () => {
        await expect(
          addMemoryToEntity(testCwd, "non-existent", "content", "user_input")
        ).rejects.toThrow("Entity not found");
      });

      it("should enforce max entries per entity", async () => {
        const config = { ...DEFAULT_CONFIG, maxEntriesPerEntity: 2 };

        await addMemoryToEntity(testCwd, testEntity.id, "Memory 1", "user_input", config);
        await addMemoryToEntity(testCwd, testEntity.id, "Memory 2", "user_input", config);
        await addMemoryToEntity(testCwd, testEntity.id, "Memory 3", "user_input", config);

        const memories = getMemoriesForEntity(testCwd, testEntity.id, 10);
        expect(memories.length).toBe(2);
      });
    });

    describe("getMemoriesForEntity", () => {
      it("should return memories for entity", async () => {
        await addMemoryToEntity(testCwd, testEntity.id, "Memory 1", "user_input");
        await addMemoryToEntity(testCwd, testEntity.id, "Memory 2", "user_input");

        const memories = getMemoriesForEntity(testCwd, testEntity.id);

        expect(memories.length).toBe(2);
      });

      it("should respect limit parameter", async () => {
        await addMemoryToEntity(testCwd, testEntity.id, "Memory 1", "user_input");
        await addMemoryToEntity(testCwd, testEntity.id, "Memory 2", "user_input");
        await addMemoryToEntity(testCwd, testEntity.id, "Memory 3", "user_input");

        const memories = getMemoriesForEntity(testCwd, testEntity.id, 2);

        expect(memories.length).toBe(2);
      });

      it("should return empty array for entity with no memories", () => {
        const entity = createEntity(testCwd, "user", "New User");
        const memories = getMemoriesForEntity(testCwd, entity.id);

        expect(memories).toEqual([]);
      });
    });

    describe("searchMemories", () => {
      it("should search memories by content", async () => {
        await addMemoryToEntity(testCwd, testEntity.id, "User likes Python", "user_input");
        await addMemoryToEntity(testCwd, testEntity.id, "User prefers dark mode", "user_input");

        const results = await searchMemories(testCwd, "Python");

        expect(results.length).toBeGreaterThan(0);
        expect(results[0].entry.content).toContain("Python");
      });

      it("should filter by entity type", async () => {
        const taskEntity = createEntity(testCwd, "task", "Test Task");
        await addMemoryToEntity(testCwd, testEntity.id, "User info", "user_input");
        await addMemoryToEntity(testCwd, taskEntity.id, "Task info", "agent_observation");

        const userResults = await searchMemories(testCwd, "info", ["user"]);
        const taskResults = await searchMemories(testCwd, "info", ["task"]);

        expect(userResults.every((r) => r.entity.type === "user")).toBe(true);
        expect(taskResults.every((r) => r.entity.type === "task")).toBe(true);
      });

      it("should return low relevance for non-matching query", async () => {
        // Add memory without embedding
        await addMemoryToEntity(
          testCwd,
          testEntity.id,
          "Some content",
          "user_input",
          { ...DEFAULT_CONFIG, embeddingEnabled: false }
        );

        // Search with embedding disabled - should use text matching only
        const results = await searchMemories(
          testCwd,
          "xyznonexistent",
          undefined,
          { ...DEFAULT_CONFIG, embeddingEnabled: false }
        );

        // Text matching should find no direct matches, but personalizationBoost may add small score
        // Results should have low relevance (only from personalizationBoost, not from content match)
        if (results.length > 0) {
          expect(results[0].relevanceScore).toBeLessThan(0.3);
        }
      });
    });

    describe("updateMemoryImportance", () => {
      it("should update memory importance", async () => {
        const entry = await addMemoryToEntity(
          testCwd,
          testEntity.id,
          "Test content",
          "user_input"
        );

        updateMemoryImportance(testCwd, entry.id, 0.9);

        const memories = getMemoriesForEntity(testCwd, testEntity.id);
        expect(memories[0].importance).toBe(0.9);
      });

      it("should clamp importance to 0-1", async () => {
        const entry = await addMemoryToEntity(
          testCwd,
          testEntity.id,
          "Test content",
          "user_input"
        );

        updateMemoryImportance(testCwd, entry.id, 1.5);
        let memories = getMemoriesForEntity(testCwd, testEntity.id);
        expect(memories[0].importance).toBe(1);

        updateMemoryImportance(testCwd, entry.id, -0.5);
        memories = getMemoriesForEntity(testCwd, testEntity.id);
        expect(memories[0].importance).toBe(0);
      });
    });

    describe("recordMemoryAccess", () => {
      it("should increment access count", async () => {
        const entry = await addMemoryToEntity(
          testCwd,
          testEntity.id,
          "Test content",
          "user_input"
        );

        expect(entry.accessCount).toBe(0);

        recordMemoryAccess(testCwd, entry.id);
        recordMemoryAccess(testCwd, entry.id);

        const memories = getMemoriesForEntity(testCwd, testEntity.id);
        expect(memories[0].accessCount).toBe(2);
        expect(memories[0].lastAccessedAt).toBeDefined();
      });
    });
  });

  describe("Utility Functions", () => {
    describe("calculateImportance", () => {
      it("should calculate importance with decay", () => {
        const entry: EntityMemoryEntry = {
          id: "test",
          entityId: "entity",
          entityType: "user",
          content: "Test",
          timestamp: new Date().toISOString(),
          source: "user_input",
          importance: 0.8,
          accessCount: 0,
          lastAccessedAt: new Date().toISOString(),
        };

        const importance = calculateImportance(entry, 0.95);
        expect(importance).toBeCloseTo(0.8, 1);
      });

      it("should boost importance with access count", () => {
        const entry: EntityMemoryEntry = {
          id: "test",
          entityId: "entity",
          entityType: "user",
          content: "Test",
          timestamp: new Date().toISOString(),
          source: "user_input",
          importance: 0.5,
          accessCount: 100,
          lastAccessedAt: new Date().toISOString(),
        };

        const importance = calculateImportance(entry, 0.95);
        expect(importance).toBeGreaterThan(0.5);
      });

      it("should decay old entries", () => {
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 30);

        const entry: EntityMemoryEntry = {
          id: "test",
          entityId: "entity",
          entityType: "user",
          content: "Test",
          timestamp: oldDate.toISOString(),
          source: "user_input",
          importance: 1.0,
          accessCount: 0,
          lastAccessedAt: oldDate.toISOString(),
        };

        const importance = calculateImportance(entry, 0.95);
        expect(importance).toBeLessThan(1.0);
      });
    });

    describe("mergeEntities", () => {
      it("should merge entity attributes", () => {
        const target: Entity = {
          id: "1",
          type: "user",
          name: "User",
          attributes: { a: 1, b: 2 },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const source: Entity = {
          id: "2",
          type: "user",
          name: "User Updated",
          attributes: { b: 3, c: 4 },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const merged = mergeEntities(target, source);

        expect(merged.attributes.a).toBe(1);
        expect(merged.attributes.b).toBe(3);
        expect(merged.attributes.c).toBe(4);
      });
    });
  });
});
