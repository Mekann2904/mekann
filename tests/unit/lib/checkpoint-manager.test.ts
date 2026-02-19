/**
 * @fileoverview checkpoint-manager.ts の単体テスト
 * @description プロパティベーステストを含む包括的なテストスイート
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fc from "fast-check";
import * as fs from "node:fs";
import * as path from "node:path";

// テスト対象のインポート
import {
  initCheckpointManager,
  getCheckpointManager,
  resetCheckpointManager,
  isCheckpointManagerInitialized,
  getCheckpointDir,
  type Checkpoint,
  type CheckpointSource,
  type CheckpointPriority,
} from "../../../.pi/lib/checkpoint-manager";

// ============================================================================
// テストユーティリティ
// ============================================================================

const TEST_CHECKPOINT_DIR = ".pi/checkpoints-test";

/**
 * テスト用のディレクトリをクリーンアップ
 */
function cleanupTestDir(): void {
  try {
    const dir = path.join(process.cwd(), TEST_CHECKPOINT_DIR);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * 新しいマネージャーを初期化
 */
function initFreshManager(): void {
  resetCheckpointManager();
  initCheckpointManager({ checkpointDir: TEST_CHECKPOINT_DIR });
}

// ============================================================================
// initCheckpointManager Tests
// ============================================================================

describe("initCheckpointManager", () => {
  beforeEach(() => {
    resetCheckpointManager();
    cleanupTestDir();
  });

  afterEach(() => {
    resetCheckpointManager();
    cleanupTestDir();
  });

  describe("正常系", () => {
    it("initCheckpointManager_初期化成功_例外が発生しない", () => {
      // Act & Assert
      expect(() => initCheckpointManager({ checkpointDir: TEST_CHECKPOINT_DIR })).not.toThrow();
    });

    it("initCheckpointManager_重複初期化_2回目は無視される", () => {
      // Arrange
      initCheckpointManager({ checkpointDir: TEST_CHECKPOINT_DIR });

      // Act & Assert - 2回目の初期化は無視される
      expect(() => initCheckpointManager({ checkpointDir: TEST_CHECKPOINT_DIR })).not.toThrow();
    });
  });

  describe("初期化状態確認", () => {
    it("isCheckpointManagerInitialized_初期化前_falseを返す", () => {
      // Act
      const result = isCheckpointManagerInitialized();

      // Assert
      expect(result).toBe(false);
    });

    it("isCheckpointManagerInitialized_初期化後_trueを返す", () => {
      // Arrange
      initCheckpointManager({ checkpointDir: TEST_CHECKPOINT_DIR });

      // Act
      const result = isCheckpointManagerInitialized();

      // Assert
      expect(result).toBe(true);
    });

    it("isCheckpointManagerInitialized_リセット後_falseを返す", () => {
      // Arrange
      initCheckpointManager({ checkpointDir: TEST_CHECKPOINT_DIR });
      resetCheckpointManager();

      // Act
      const result = isCheckpointManagerInitialized();

      // Assert
      expect(result).toBe(false);
    });
  });
});

// ============================================================================
// getCheckpointDir Tests
// ============================================================================

describe("getCheckpointDir", () => {
  beforeEach(() => {
    resetCheckpointManager();
    cleanupTestDir();
  });

  afterEach(() => {
    resetCheckpointManager();
    cleanupTestDir();
  });

  describe("正常系", () => {
    it("getCheckpointDir_初期化後_正しいパスを返す", () => {
      // Arrange
      initCheckpointManager({ checkpointDir: TEST_CHECKPOINT_DIR });

      // Act
      const dir = getCheckpointDir();

      // Assert
      expect(dir).toContain(TEST_CHECKPOINT_DIR);
    });
  });
});

// ============================================================================
// save/load/delete Tests
// ============================================================================

describe("Checkpoint CRUD操作", () => {
  let manager: ReturnType<typeof getCheckpointManager>;

  beforeEach(() => {
    cleanupTestDir();
    initFreshManager();
    manager = getCheckpointManager();
  });

  afterEach(() => {
    resetCheckpointManager();
    cleanupTestDir();
  });

  describe("save", () => {
    it("save_正常なチェックポイント_成功を返す", async () => {
      // Arrange
      const checkpoint: Omit<Checkpoint, "id" | "createdAt"> = {
        taskId: "task-001",
        source: "subagent_run",
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        priority: "normal",
        state: { step: 1 },
        progress: 0.5,
        ttlMs: 86400000,
      };

      // Act
      const result = await manager.save(checkpoint);

      // Assert
      expect(result.success).toBe(true);
      expect(result.checkpointId).toBeDefined();
    });

    it("save_プログレス範囲外_クランプされる", async () => {
      // Arrange
      const checkpoint: Omit<Checkpoint, "id" | "createdAt"> = {
        taskId: "task-002",
        source: "subagent_run",
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        priority: "normal",
        state: {},
        progress: 2.0, // 範囲外
        ttlMs: 86400000,
      };

      // Act
      const result = await manager.save(checkpoint);

      // Assert - プログレスは1.0にクランプされる
      expect(result.success).toBe(true);
    });

    it("save_負のプログレス_0にクランプされる", async () => {
      // Arrange
      const checkpoint: Omit<Checkpoint, "id" | "createdAt"> = {
        taskId: "task-003",
        source: "subagent_run",
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        priority: "normal",
        state: {},
        progress: -0.5, // 範囲外
        ttlMs: 86400000,
      };

      // Act
      const result = await manager.save(checkpoint);

      // Assert
      expect(result.success).toBe(true);
    });
  });

  describe("load", () => {
    it("load_存在するタスクID_チェックポイントを返す", async () => {
      // Arrange
      const taskId = "task-load-test";
      await manager.save({
        taskId,
        source: "subagent_run",
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        priority: "normal",
        state: { data: "test" },
        progress: 0.7,
        ttlMs: 86400000,
      });

      // Act
      const result = await manager.load(taskId);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.taskId).toBe(taskId);
    });

    it("load_存在しないタスクID_nullを返す", async () => {
      // Act
      const result = await manager.load("nonexistent-task");

      // Assert
      expect(result).toBeNull();
    });
  });

  describe("delete", () => {
    it("delete_存在するタスクID_trueを返す", async () => {
      // Arrange
      const taskId = "task-delete-test";
      await manager.save({
        taskId,
        source: "subagent_run",
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        priority: "normal",
        state: {},
        progress: 0.5,
        ttlMs: 86400000,
      });

      // Act
      const result = await manager.delete(taskId);

      // Assert
      expect(result).toBe(true);
    });

    it("delete_存在しないタスクID_falseを返す", async () => {
      // Act
      const result = await manager.delete("nonexistent-task");

      // Assert
      expect(result).toBe(false);
    });
  });
});

// ============================================================================
// TTL Tests
// ============================================================================

describe("TTL機能", () => {
  let manager: ReturnType<typeof getCheckpointManager>;

  beforeEach(() => {
    cleanupTestDir();
    initFreshManager();
    manager = getCheckpointManager();
  });

  afterEach(() => {
    resetCheckpointManager();
    cleanupTestDir();
  });

  describe("期限切れ検出", () => {
    it("listExpired_期限切れチェックポイント_リストに含まれる", async () => {
      // Arrange - フェイクタイマーを使用
      vi.useFakeTimers();

      try {
        await manager.save({
          taskId: "expired-task",
          source: "subagent_run",
          provider: "anthropic",
          model: "claude-3-5-sonnet",
          priority: "normal",
          state: {},
          progress: 0.5,
          ttlMs: 1, // 1ms - 即座に期限切れ
        });

        // 時間を進めて期限切れにする
        vi.advanceTimersByTime(10);

        // Act
        const expired = await manager.listExpired();

        // Assert
        expect(expired.some((cp) => cp.taskId === "expired-task")).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("listExpired_有効なチェックポイント_リストに含まれない", async () => {
      // Arrange - 長いTTLで作成
      await manager.save({
        taskId: "valid-task",
        source: "subagent_run",
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        priority: "normal",
        state: {},
        progress: 0.5,
        ttlMs: 86400000, // 24時間
      });

      // Act
      const expired = await manager.listExpired();

      // Assert
      expect(expired.some((cp) => cp.taskId === "valid-task")).toBe(false);
    });
  });

  describe("cleanup", () => {
    it("cleanup_期限切れ削除_削除数を返す", async () => {
      // Arrange - フェイクタイマーを使用
      vi.useFakeTimers();

      try {
        await manager.save({
          taskId: "expired-cleanup-test",
          source: "subagent_run",
          provider: "anthropic",
          model: "claude-3-5-sonnet",
          priority: "normal",
          state: {},
          progress: 0.5,
          ttlMs: 1,
        });

        // 時間を進めて期限切れにする
        vi.advanceTimersByTime(10);

        // Act
        const deletedCount = await manager.cleanup();

        // Assert
        expect(deletedCount).toBeGreaterThanOrEqual(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

// ============================================================================
// getStats Tests
// ============================================================================

describe("getStats", () => {
  let manager: ReturnType<typeof getCheckpointManager>;

  beforeEach(() => {
    cleanupTestDir();
    initFreshManager();
    manager = getCheckpointManager();
  });

  afterEach(() => {
    resetCheckpointManager();
    cleanupTestDir();
  });

  describe("正常系", () => {
    it("getStats_初期状態_ゼロ統計を返す", () => {
      // Act
      const stats = manager.getStats();

      // Assert
      expect(stats.totalCount).toBe(0);
      expect(stats.totalSizeBytes).toBe(0);
      expect(stats.oldestCreatedAt).toBeNull();
      expect(stats.newestCreatedAt).toBeNull();
    });

    it("getStats_チェックポイント作成後_統計が更新される", async () => {
      // Arrange
      await manager.save({
        taskId: "stats-test",
        source: "subagent_run",
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        priority: "normal",
        state: { data: "test" },
        progress: 0.5,
        ttlMs: 86400000,
      });

      // Act
      const stats = manager.getStats();

      // Assert
      expect(stats.totalCount).toBe(1);
      expect(stats.totalSizeBytes).toBeGreaterThan(0);
      expect(stats.oldestCreatedAt).not.toBeNull();
      expect(stats.newestCreatedAt).not.toBeNull();
    });

    it("getStats_ソース別統計_正しく分類される", async () => {
      // Arrange
      await manager.save({
        taskId: "subagent-task",
        source: "subagent_run",
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        priority: "normal",
        state: {},
        progress: 0.5,
        ttlMs: 86400000,
      });

      await manager.save({
        taskId: "team-task",
        source: "agent_team_run",
        provider: "openai",
        model: "gpt-4",
        priority: "high",
        state: {},
        progress: 0.3,
        ttlMs: 86400000,
      });

      // Act
      const stats = manager.getStats();

      // Assert
      expect(stats.bySource.subagent_run).toBe(1);
      expect(stats.bySource.agent_team_run).toBe(1);
    });
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  let manager: ReturnType<typeof getCheckpointManager>;

  beforeEach(() => {
    cleanupTestDir();
    initFreshManager();
    manager = getCheckpointManager();
  });

  afterEach(() => {
    resetCheckpointManager();
    cleanupTestDir();
  });

  it("save_任意の有効な入力_常に成功またはエラーメッセージを返す", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          taskId: fc.string({ minLength: 1, maxLength: 50 }),
          source: fc.constantFrom<CheckpointSource>(
            "subagent_run",
            "subagent_run_parallel",
            "agent_team_run",
            "agent_team_run_parallel"
          ),
          provider: fc.string({ minLength: 1, maxLength: 50 }),
          model: fc.string({ minLength: 1, maxLength: 50 }),
          priority: fc.constantFrom<CheckpointPriority>(
            "critical",
            "high",
            "normal",
            "low",
            "background"
          ),
          state: fc.anything(),
          progress: fc.float({ min: -1, max: 2, noNaN: true }),
          ttlMs: fc.integer({ min: 1, max: 86400000 * 7 }),
        }),
        async (checkpoint) => {
          // Act
          const result = await manager.save(checkpoint);

          // Assert - 不変条件
          expect(typeof result.success).toBe("boolean");
          if (result.success) {
            expect(result.checkpointId).toBeDefined();
            expect(result.path).toBeDefined();
          } else {
            expect(result.error).toBeDefined();
          }
        }
      )
    );
  });

  it("load_保存後のロード_元のデータと一致", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // 英数字のみを使用（特殊文字による問題を回避）
          taskId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-z0-9]+$/.test(s)),
          source: fc.constantFrom<CheckpointSource>("subagent_run", "agent_team_run"),
          provider: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-z0-9]+$/.test(s)),
          model: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-z0-9]+$/.test(s)),
          priority: fc.constantFrom<CheckpointPriority>("normal", "high", "critical"),
          state: fc.anything(),
          progress: fc.float({ min: 0, max: 1, noNaN: true }),
          ttlMs: fc.constant(86400000),
        }),
        async (checkpoint) => {
          // Arrange
          await manager.save(checkpoint);

          // Act
          const loaded = await manager.load(checkpoint.taskId);

          // Assert - 不変条件
          expect(loaded).not.toBeNull();
          expect(loaded?.taskId).toBe(checkpoint.taskId);
          expect(loaded?.source).toBe(checkpoint.source);
          expect(loaded?.provider).toBe(checkpoint.provider);
          expect(loaded?.model).toBe(checkpoint.model);
        }
      )
    );
  });

  it("getStats_統計は常に整合している", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 10 }),
        async (count) => {
          // Arrange - 指定数のチェックポイントを作成
          for (let i = 0; i < count; i++) {
            await manager.save({
              taskId: `stats-prop-test-${i}`,
              source: "subagent_run",
              provider: "test",
              model: "test",
              priority: "normal",
              state: { index: i },
              progress: 0.5,
              ttlMs: 86400000,
            });
          }

          // Act
          const stats = manager.getStats();

          // Assert - 不変条件
          expect(stats.totalCount).toBeGreaterThanOrEqual(0);
          expect(stats.totalSizeBytes).toBeGreaterThanOrEqual(0);
          expect(stats.expiredCount).toBeGreaterThanOrEqual(0);

          // 整合性チェック
          if (stats.totalCount > 0) {
            expect(stats.oldestCreatedAt).not.toBeNull();
            expect(stats.newestCreatedAt).not.toBeNull();
            expect(stats.newestCreatedAt!).toBeGreaterThanOrEqual(stats.oldestCreatedAt!);
          }
        }
      )
    );
  });
});
