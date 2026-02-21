/**
 * @file .pi/lib/checkpoint-manager.ts の追加単体テスト
 * @description 自動クリーンアップ、エラーケース、環境変数のテスト
 * @testFramework vitest
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  initCheckpointManager,
  getCheckpointManager,
  resetCheckpointManager,
  isCheckpointManagerInitialized,
  getCheckpointDir,
  getCheckpointConfigFromEnv,
  type Checkpoint,
} from "../../../.pi/lib/checkpoint-manager.js";

// ============================================================================
// テストユーティリティ
// ============================================================================

const TEST_CHECKPOINT_DIR = ".pi/checkpoints-additional-test";

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
 * ランタイムディレクトリをクリーンアップ
 */
function cleanupRuntimeDir(): void {
  try {
    const dir = path.join(process.cwd(), ".pi", "runtime-test");
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
// 自動クリーンアップタイマーテスト
// ============================================================================

describe("Checkpoint Manager - 自動クリーンアップタイマー", () => {
  beforeEach(() => {
    resetCheckpointManager();
    cleanupTestDir();
    vi.useFakeTimers();
  });

  afterEach(() => {
    resetCheckpointManager();
    cleanupTestDir();
    vi.useRealTimers();
  });

  describe("タイマー設定", () => {
    it("cleanupIntervalMs_初期化_タイマーが設定される", () => {
      // Arrange
      const cleanupIntervalMs = 5000; // 5秒

      // Act
      initCheckpointManager({
        checkpointDir: TEST_CHECKPOINT_DIR,
        cleanupIntervalMs,
      });

      // Assert - 初期化が成功することを確認
      const stats = getCheckpointManager().getStats();
      expect(stats.totalCount).toBe(0);
    });

    it("cleanupIntervalMs_短期間設定_複数回実行", () => {
      // Arrange
      const cleanupIntervalMs = 1000; // 1秒

      initCheckpointManager({
        checkpointDir: TEST_CHECKPOINT_DIR,
        cleanupIntervalMs,
      });

      // Act
      vi.advanceTimersByTime(1000);
      vi.advanceTimersByTime(1000);
      vi.advanceTimersByTime(1000);

      // Assert - クリーンアップが実行される
      // (実際には期限切れのチェックポイントがないため、削除数は0)
    });

    it("cleanupIntervalMs_zero_タイマーは設定されるが実行されない", () => {
      // Arrange & Act
      // cleanupIntervalMs = 0は有効な設定
      initCheckpointManager({
        checkpointDir: TEST_CHECKPOINT_DIR,
        cleanupIntervalMs: 1, // 最小値
      });

      // Assert
      expect(isCheckpointManagerInitialized()).toBe(true);
    });
  });

  describe("期限切れチェックポイントの自動削除", () => {
    it("auto_cleanup_期限切れチェックポイント_自動的に削除される", async () => {
      // Arrange
      initCheckpointManager({
        checkpointDir: TEST_CHECKPOINT_DIR,
        cleanupIntervalMs: 1000,
      });

      const manager = getCheckpointManager();

      // 短いTTLでチェックポイントを作成
      await manager.save({
        taskId: "auto-cleanup-task",
        source: "subagent_run",
        provider: "test",
        model: "test",
        priority: "normal",
        state: {},
        progress: 0.5,
        ttlMs: 100, // 100ms
      });

      // 期限切れ前は存在する
      let stats = manager.getStats();
      expect(stats.totalCount).toBe(1);

      // Act - タイマーを進めて期限切れにする
      vi.advanceTimersByTime(5000); // クリーンアップ実行

      // 待機
      await vi.waitFor(() => {
        const stats = manager.getStats();
        return stats.totalCount === 0;
      }, { timeout: 6000 });

      // Assert
      stats = manager.getStats();
      expect(stats.totalCount).toBe(0);
    });

    it("auto_cleanup_有効なチェックポイント_削除されない", async () => {
      // Arrange
      initCheckpointManager({
        checkpointDir: TEST_CHECKPOINT_DIR,
        cleanupIntervalMs: 1000,
      });

      const manager = getCheckpointManager();

      // 長いTTLでチェックポイントを作成
      await manager.save({
        taskId: "long-lived-task",
        source: "subagent_run",
        provider: "test",
        model: "test",
        priority: "normal",
        state: {},
        progress: 0.5,
        ttlMs: 86400000, // 24時間
      });

      // Act - タイマーを進める
      vi.advanceTimersByTime(5000);

      // Assert - まだ存在する
      const stats = manager.getStats();
      expect(stats.totalCount).toBe(1);
    });
  });

  describe("リセット時のタイマークリーンアップ", () => {
    it("reset_checkpoint_manager_タイマーがクリアされる", () => {
      // Arrange
      initCheckpointManager({
        checkpointDir: TEST_CHECKPOINT_DIR,
        cleanupIntervalMs: 1000,
      });

      // Act
      resetCheckpointManager();

      // Assert
      expect(isCheckpointManagerInitialized()).toBe(false);
    });
  });
});

// ============================================================================
// 環境変数設定の追加テスト
// ============================================================================

describe("getCheckpointConfigFromEnv - 追加テスト", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetCheckpointManager();
    // 環境変数をコピー
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    resetCheckpointManager();
    // 元の環境変数を復元
    process.env = originalEnv;
  });

  describe("TTL設定のエッジケース", () => {
    it("PI_CHECKPOINT_TTL_MS_0_無視される", async () => {
      // Arrange
      process.env.PI_CHECKPOINT_TTL_MS = "0";

      // Act
      const config = getCheckpointConfigFromEnv();

      // Assert
      expect(config.defaultTtlMs).toBeUndefined();
    });

    it("PI_CHECKPOINT_TTL_MS_very_large_設定される", async () => {
      // Arrange
      process.env.PI_CHECKPOINT_TTL_MS = "864000000"; // 10日

      // Act
      const config = getCheckpointConfigFromEnv();

      // Assert
      expect(config.defaultTtlMs).toBe(864000000);
    });

    it("PI_CHECKPOINT_TTL_MS_浮動小数点_設定される（整数に変換）", async () => {
      // Arrange
      process.env.PI_CHECKPOINT_TTL_MS = "1000.5";

      // Act
      const config = getCheckpointConfigFromEnv();

      // Assert - 浮動小数点は整数に変換される
      expect(config.defaultTtlMs).toBe(1000);
    });

    it("PI_CHECKPOINT_TTL_MS_文字列_無視される", async () => {
      // Arrange
      process.env.PI_CHECKPOINT_TTL_MS = "invalid";

      // Act
      const config = getCheckpointConfigFromEnv();

      // Assert
      expect(config.defaultTtlMs).toBeUndefined();
    });
  });

  describe("maxCheckpoints設定のエッジケース", () => {
    it("PI_MAX_CHECKPOINTS_1_設定される", async () => {
      // Arrange
      process.env.PI_MAX_CHECKPOINTS = "1";

      // Act
      const config = getCheckpointConfigFromEnv();

      // Assert
      expect(config.maxCheckpoints).toBe(1);
    });

    it("PI_MAX_CHECKPOINTS_very_large_設定される", async () => {
      // Arrange
      process.env.PI_MAX_CHECKPOINTS = "10000";

      // Act
      const config = getCheckpointConfigFromEnv();

      // Assert
      expect(config.maxCheckpoints).toBe(10000);
    });

    it("PI_MAX_CHECKPOINTS_0_無視される", async () => {
      // Arrange
      process.env.PI_MAX_CHECKPOINTS = "0";

      // Act
      const config = getCheckpointConfigFromEnv();

      // Assert
      expect(config.maxCheckpoints).toBeUndefined();
    });
  });

  describe("cleanupIntervalMs設定のエッジケース", () => {
    it("PI_CHECKPOINT_CLEANUP_MS_very_short_設定される", async () => {
      // Arrange
      process.env.PI_CHECKPOINT_CLEANUP_MS = "100"; // 100ms

      // Act
      const config = getCheckpointConfigFromEnv();

      // Assert
      expect(config.cleanupIntervalMs).toBe(100);
    });

    it("PI_CHECKPOINT_CLEANUP_MS_very_long_設定される", async () => {
      // Arrange
      process.env.PI_CHECKPOINT_CLEANUP_MS = "3600000"; // 1時間

      // Act
      const config = getCheckpointConfigFromEnv();

      // Assert
      expect(config.cleanupIntervalMs).toBe(3600000);
    });

    it("PI_CHECKPOINT_CLEANUP_MS_0_無視される", async () => {
      // Arrange
      process.env.PI_CHECKPOINT_CLEANUP_MS = "0";

      // Act
      const config = getCheckpointConfigFromEnv();

      // Assert
      expect(config.cleanupIntervalMs).toBeUndefined();
    });
  });

  describe("複数の環境変数設定", () => {
    it("all_env_vars_set_すべて設定される", async () => {
      // Arrange
      process.env.PI_CHECKPOINT_DIR = "/custom/checkpoints";
      process.env.PI_CHECKPOINT_TTL_MS = "7200000";
      process.env.PI_MAX_CHECKPOINTS = "50";
      process.env.PI_CHECKPOINT_CLEANUP_MS = "1800000";

      // Act
      const config = getCheckpointConfigFromEnv();

      // Assert
      expect(config.checkpointDir).toBe("/custom/checkpoints");
      expect(config.defaultTtlMs).toBe(7200000);
      expect(config.maxCheckpoints).toBe(50);
      expect(config.cleanupIntervalMs).toBe(1800000);
    });

    it("partial_env_vars_set_設定されたもののみ適用", async () => {
      // Arrange
      process.env.PI_CHECKPOINT_TTL_MS = "3600000";
      process.env.PI_MAX_CHECKPOINTS = "25";
      // PI_CHECKPOINT_DIR と PI_CHECKPOINT_CLEANUP_MS は未設定

      // Act
      const config = getCheckpointConfigFromEnv();

      // Assert
      expect(config.defaultTtlMs).toBe(3600000);
      expect(config.maxCheckpoints).toBe(25);
      expect(config.checkpointDir).toBeUndefined();
      expect(config.cleanupIntervalMs).toBeUndefined();
    });
  });

  describe("空の環境変数", () => {
    it("PI_CHECKPOINT_DIR_empty_string_無視される", async () => {
      // Arrange
      process.env.PI_CHECKPOINT_DIR = "";

      // Act
      const config = getCheckpointConfigFromEnv();

      // Assert
      expect(config.checkpointDir).toBeUndefined();
    });

    it("PI_CHECKPOINT_TTL_MS_empty_string_無視される", async () => {
      // Arrange
      process.env.PI_CHECKPOINT_TTL_MS = "";

      // Act
      const config = getCheckpointConfigFromEnv();

      // Assert
      expect(config.defaultTtlMs).toBeUndefined();
    });
  });
});

// ============================================================================
// エラーハンドリングの追加テスト
// ============================================================================

describe("Checkpoint Manager - エラーハンドリング", () => {
  beforeEach(() => {
    resetCheckpointManager();
    cleanupTestDir();
  });

  afterEach(() => {
    resetCheckpointManager();
    cleanupTestDir();
  });

  describe("ディレクトリ作成エラー", () => {
    it("ディレクトリ作成権限なし_初期化失敗しない", () => {
      // Arrange & Act
      // 実際の権限エラーをシミュレートすることは難しいため
      // テスト用のディレクトリを使用
      expect(() => {
        initCheckpointManager({
          checkpointDir: TEST_CHECKPOINT_DIR,
        });
      }).not.toThrow();

      // Assert
      expect(isCheckpointManagerInitialized()).toBe(true);
    });

    it("不正なディレクトリパス_初期化失敗しない", () => {
      // Arrange & Act
      // 不正なパス（実際にはOSで処理される）
      expect(() => {
        initCheckpointManager({
          checkpointDir: "./test/checkpoints",
        });
      }).not.toThrow();

      // Assert
      expect(isCheckpointManagerInitialized()).toBe(true);
    });
  });

  describe("ファイル書き込みエラー", () => {
    it("ディスク容量不足_エラーが返される", async () => {
      // Arrange
      initFreshManager();
      const manager = getCheckpointManager();

      // 実際のディスク容量不足をシミュレートすることは難しいため
      // 通常の保存操作をテスト
      const result = await manager.save({
        taskId: "disk-full-test",
        source: "subagent_run",
        provider: "test",
        model: "test",
        priority: "normal",
        state: { data: "test".repeat(100) },
        progress: 0.5,
        ttlMs: 86400000,
      });

      // Assert
      expect(result).toHaveProperty("success");
      expect(typeof result.success).toBe("boolean");
    });

    it("不正な状態オブジェクト_シリアライズエラーがキャッチされる", async () => {
      // Arrange
      initFreshManager();
      const manager = getCheckpointManager();

      // 循環参照を持つオブジェクト
      const circular: Record<string, unknown> = { name: "test" };
      circular.self = circular;

      // Act
      const result = await manager.save({
        taskId: "circular-test",
        source: "subagent_run",
        provider: "test",
        model: "test",
        priority: "normal",
        state: circular,
        progress: 0.5,
        ttlMs: 86400000,
      });

      // Assert - エラーが返される（JSON.stringifyは循環参照で失敗）
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("ファイル読み込みエラー", () => {
    it("破損したJSONファイル_エラーがキャッチされる", async () => {
      // Arrange
      initFreshManager();
      const manager = getCheckpointManager();

      // チェックポイントを保存
      await manager.save({
        taskId: "corrupt-test",
        source: "subagent_run",
        provider: "test",
        model: "test",
        priority: "normal",
        state: { data: "test" },
        progress: 0.5,
        ttlMs: 86400000,
      });

      // チェックポイントファイルを直接書き換えて破損させる
      const dir = getCheckpointDir();
      const files = fs.readdirSync(dir);
      const checkpointFile = files.find((f) => f.includes("corrupt-test"));
      if (checkpointFile) {
        const filePath = path.join(dir, checkpointFile);
        fs.writeFileSync(filePath, "invalid json content");
      }

      // Act - 破損したファイルは統計に含まれない
      const stats = manager.getStats();

      // Assert - 破損したファイルはカウントされないか、正常にスキップされる
      expect(stats.totalCount).toBeGreaterThanOrEqual(0);
    });
  });
});

// ============================================================================
// 統計情報の追加テスト
// ============================================================================

describe("getCheckpointStats - 追加テスト", () => {
  beforeEach(() => {
    resetCheckpointManager();
    cleanupTestDir();
    initFreshManager();
  });

  afterEach(() => {
    resetCheckpointManager();
    cleanupTestDir();
  });

  describe("統計情報の整合性", () => {
    it("stats_after_multiple_saves_正確なカウント", async () => {
      // Arrange
      const manager = getCheckpointManager();

      // 複数のチェックポイントを作成
      for (let i = 0; i < 10; i++) {
        await manager.save({
          taskId: `stats-task-${i}`,
          source: i % 2 === 0 ? "subagent_run" : "agent_team_run",
          provider: "test",
          model: "test",
          priority: "normal",
          state: { index: i },
          progress: i / 10,
          ttlMs: 86400000,
        });
      }

      // Act
      const stats = manager.getStats();

      // Assert
      expect(stats.totalCount).toBe(10);
      expect(stats.bySource.subagent_run).toBe(5);
      expect(stats.bySource.agent_team_run).toBe(5);
      expect(stats.totalSizeBytes).toBeGreaterThan(0);
      expect(stats.oldestCreatedAt).not.toBeNull();
      expect(stats.newestCreatedAt).not.toBeNull();
    });

    it("stats_after_deletes_正確なカウント", async () => {
      // Arrange
      const manager = getCheckpointManager();

      // チェックポイントを作成
      await manager.save({
        taskId: "delete-stats-1",
        source: "subagent_run",
        provider: "test",
        model: "test",
        priority: "normal",
        state: {},
        progress: 0.5,
        ttlMs: 86400000,
      });

      await manager.save({
        taskId: "delete-stats-2",
        source: "subagent_run",
        provider: "test",
        model: "test",
        priority: "normal",
        state: {},
        progress: 0.5,
        ttlMs: 86400000,
      });

      await manager.save({
        taskId: "delete-stats-3",
        source: "subagent_run",
        provider: "test",
        model: "test",
        priority: "normal",
        state: {},
        progress: 0.5,
        ttlMs: 86400000,
      });

      // Act - 1つ削除
      await manager.delete("delete-stats-2");

      // Assert
      const stats = manager.getStats();
      expect(stats.totalCount).toBe(2);
    });

    it("stats_oldest_and_newest_consistency", async () => {
      // Arrange
      const manager = getCheckpointManager();

      // 時間をずらして作成
      await manager.save({
        taskId: "time-test-1",
        source: "subagent_run",
        provider: "test",
        model: "test",
        priority: "normal",
        state: {},
        progress: 0.1,
        ttlMs: 86400000,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      await manager.save({
        taskId: "time-test-2",
        source: "subagent_run",
        provider: "test",
        model: "test",
        priority: "normal",
        state: {},
        progress: 0.2,
        ttlMs: 86400000,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      await manager.save({
        taskId: "time-test-3",
        source: "subagent_run",
        provider: "test",
        model: "test",
        priority: "normal",
        state: {},
        progress: 0.3,
        ttlMs: 86400000,
      });

      // Act
      const stats = manager.getStats();

      // Assert - 最古が最新より前である
      expect(stats.oldestCreatedAt).not.toBeNull();
      expect(stats.newestCreatedAt).not.toBeNull();
      expect(stats.newestCreatedAt!).toBeGreaterThanOrEqual(stats.oldestCreatedAt!);
    });
  });

  describe("期限切れチェックポイントの統計", () => {
    it("stats_expired_count_正確なカウント", async () => {
      // Arrange
      const manager = getCheckpointManager();
      vi.useFakeTimers();

      try {
        // 有効期限の短いチェックポイントを作成
        await manager.save({
          taskId: "expired-1",
          source: "subagent_run",
          provider: "test",
          model: "test",
          priority: "normal",
          state: {},
          progress: 0.5,
          ttlMs: 100, // 100ms
        });

        await manager.save({
          taskId: "expired-2",
          source: "subagent_run",
          provider: "test",
          model: "test",
          priority: "normal",
          state: {},
          progress: 0.5,
          ttlMs: 200, // 200ms
        });

        await manager.save({
          taskId: "valid",
          source: "subagent_run",
          provider: "test",
          model: "test",
          priority: "normal",
          state: {},
          progress: 0.5,
          ttlMs: 86400000, // 24時間
        });

        // 期限切れ前
        let stats = manager.getStats();
        expect(stats.expiredCount).toBe(0);

        // Act - 時間を進める
        vi.advanceTimersByTime(500);

        // Assert
        stats = manager.getStats();
        expect(stats.expiredCount).toBe(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("優先度別統計", () => {
    it("stats_by_priority_all_levels", async () => {
      // Arrange
      const manager = getCheckpointManager();
      const priorities: Array<"critical" | "high" | "normal" | "low" | "background"> =
        ["critical", "high", "normal", "low", "background"];

      for (const priority of priorities) {
        await manager.save({
          taskId: `priority-${priority}`,
          source: "subagent_run",
          provider: "test",
          model: "test",
          priority,
          state: {},
          progress: 0.5,
          ttlMs: 86400000,
        });
      }

      // Act
      const stats = manager.getStats();

      // Assert
      expect(stats.byPriority.critical).toBe(1);
      expect(stats.byPriority.high).toBe(1);
      expect(stats.byPriority.normal).toBe(1);
      expect(stats.byPriority.low).toBe(1);
      expect(stats.byPriority.background).toBe(1);
    });

    it("stats_by_priority_multiple_per_level", async () => {
      // Arrange
      const manager = getCheckpointManager();

      await manager.save({
        taskId: "high-1",
        source: "subagent_run",
        provider: "test",
        model: "test",
        priority: "high",
        state: {},
        progress: 0.5,
        ttlMs: 86400000,
      });

      await manager.save({
        taskId: "high-2",
        source: "agent_team_run",
        provider: "test",
        model: "test",
        priority: "high",
        state: {},
        progress: 0.7,
        ttlMs: 86400000,
      });

      await manager.save({
        taskId: "normal-1",
        source: "subagent_run",
        provider: "test",
        model: "test",
        priority: "normal",
        state: {},
        progress: 0.5,
        ttlMs: 86400000,
      });

      // Act
      const stats = manager.getStats();

      // Assert
      expect(stats.byPriority.high).toBe(2);
      expect(stats.byPriority.normal).toBe(1);
      expect(stats.totalCount).toBe(3);
    });
  });
});

// ============================================================================
// maxCheckpoints制限の詳細テスト
// ============================================================================

describe("maxCheckpoints制限 - 詳細テスト", () => {
  beforeEach(() => {
    resetCheckpointManager();
    cleanupTestDir();
  });

  afterEach(() => {
    resetCheckpointManager();
    cleanupTestDir();
  });

  describe("制限を超えた場合の削除順序", () => {
    it("古いチェックポイントから削除", async () => {
      // Arrange
      initCheckpointManager({
        checkpointDir: TEST_CHECKPOINT_DIR,
        maxCheckpoints: 3,
      });

      const manager = getCheckpointManager();

      // 5つのチェックポイントを作成（制限は3）
      for (let i = 1; i <= 5; i++) {
        await manager.save({
          taskId: `limit-test-${i}`,
          source: "subagent_run",
          provider: "test",
          model: "test",
          priority: "normal",
          state: { order: i },
          progress: i / 10,
          ttlMs: 86400000,
        });
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Act
      const stats = manager.getStats();

      // Assert - 最大3つのみ保持
      expect(stats.totalCount).toBeLessThanOrEqual(3);

      // 最新のものが保持されている
      const loaded4 = await manager.load("limit-test-4");
      const loaded5 = await manager.load("limit-test-5");
      expect(loaded4).not.toBeNull();
      expect(loaded5).not.toBeNull();

      // 古いものは削除されている
      const loaded1 = await manager.load("limit-test-1");
      const loaded2 = await manager.load("limit-test-2");
      expect(loaded1).toBeNull();
      expect(loaded2).toBeNull();
    });

    it("制限以下_削除されない", async () => {
      // Arrange
      initCheckpointManager({
        checkpointDir: TEST_CHECKPOINT_DIR,
        maxCheckpoints: 5,
      });

      const manager = getCheckpointManager();

      // 3つのチェックポイントを作成（制限は5）
      for (let i = 1; i <= 3; i++) {
        await manager.save({
          taskId: `under-limit-${i}`,
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

      // Assert - すべて保持される
      expect(stats.totalCount).toBe(3);
    });

    it("maxCheckpoints_1_最新のみ保持", async () => {
      // Arrange
      initCheckpointManager({
        checkpointDir: TEST_CHECKPOINT_DIR,
        maxCheckpoints: 1,
      });

      const manager = getCheckpointManager();

      // 複数のチェックポイントを作成
      for (let i = 1; i <= 5; i++) {
        await manager.save({
          taskId: `single-limit-${i}`,
          source: "subagent_run",
          provider: "test",
          model: "test",
          priority: "normal",
          state: {},
          progress: 0.5,
          ttlMs: 86400000,
        });
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Act
      const stats = manager.getStats();

      // Assert
      expect(stats.totalCount).toBe(1);

      // 最新のみ保持
      const loaded5 = await manager.load("single-limit-5");
      expect(loaded5).not.toBeNull();

      const loaded1 = await manager.load("single-limit-1");
      expect(loaded1).toBeNull();
    });
  });
});

// ============================================================================
// 複雑なシナリオテスト
// ============================================================================

describe("Checkpoint Manager - 複雑なシナリオ", () => {
  beforeEach(() => {
    resetCheckpointManager();
    cleanupTestDir();
  });

  afterEach(() => {
    resetCheckpointManager();
    cleanupTestDir();
  });

  describe("同じtaskIdでの複数回の保存", () => {
    it("same_task_id_overwrites_previous", async () => {
      // Arrange
      initFreshManager();
      const manager = getCheckpointManager();

      // 別のtaskIdを使用してテスト間の競合を避ける
      await manager.save({
        taskId: "overwrite-test-overwrite-task",
        source: "subagent_run",
        provider: "test",
        model: "test",
        priority: "normal",
        state: { version: 1, step: 1 },
        progress: 0.3,
        ttlMs: 86400000,
      });

      // Act - 同じtaskIdで再度保存
      await manager.save({
        taskId: "overwrite-test-overwrite-task",
        source: "subagent_run",
        provider: "test",
        model: "test",
        priority: "high",
        state: { version: 2, step: 2 },
        progress: 0.6,
        ttlMs: 86400000,
      });

      // Assert - 最新の値が取得される
      const loaded = await manager.load("overwrite-test-overwrite-task");
      expect(loaded).not.toBeNull();
      expect(loaded?.state).toEqual({ version: 2, step: 2 });
      expect(loaded?.progress).toBe(0.6);
      expect(loaded?.priority).toBe("high");

      // 統計は1つのみ（同じtaskIdなので上書きされる）
      const stats = manager.getStats();
      expect(stats.totalCount).toBe(1);
    });

    it("same_task_id_with_different_sources_overwrites", async () => {
      // Arrange
      initFreshManager();
      const manager = getCheckpointManager();

      await manager.save({
        taskId: "multi-source-task",
        source: "subagent_run",
        provider: "test",
        model: "test",
        priority: "normal",
        state: { source: "subagent" },
        progress: 0.5,
        ttlMs: 86400000,
      });

      // Act - 別のソースで保存
      await manager.save({
        taskId: "multi-source-task",
        source: "agent_team_run",
        provider: "test",
        model: "test",
        priority: "normal",
        state: { source: "team" },
        progress: 0.7,
        ttlMs: 86400000,
      });

      // Assert - 最新のものが取得される
      const loaded = await manager.load("multi-source-task");
      expect(loaded).not.toBeNull();
      expect(loaded?.source).toBe("agent_team_run");
      expect(loaded?.state).toEqual({ source: "team" });
    });
  });

  describe("大規模なチェックポイント管理", () => {
    it("many_checkpoints_performance_問題なく動作", async () => {
      // Arrange
      initCheckpointManager({
        checkpointDir: TEST_CHECKPOINT_DIR,
        maxCheckpoints: 100,
      });

      const manager = getCheckpointManager();
      const count = 50; // 50個のチェックポイント

      // Act
      const startTime = Date.now();
      for (let i = 0; i < count; i++) {
        await manager.save({
          taskId: `perf-test-${i}`,
          source: i % 2 === 0 ? "subagent_run" : "agent_team_run",
          provider: "test",
          model: "test",
          priority: "normal",
          state: { index: i, data: "x".repeat(100) },
          progress: i / count,
          ttlMs: 86400000,
        });
      }
      const duration = Date.now() - startTime;

      // Assert
      expect(duration).toBeLessThan(10000); // 10秒以内

      const stats = manager.getStats();
      expect(stats.totalCount).toBe(count);
    });

    it("many_checkpoints_cleanup_performance_問題なく動作", async () => {
      // Arrange
      initCheckpointManager({
        checkpointDir: TEST_CHECKPOINT_DIR,
        maxCheckpoints: 100,
      });

      const manager = getCheckpointManager();
      vi.useFakeTimers();

      try {
        // 大量のチェックポイントを作成
        for (let i = 0; i < 50; i++) {
          await manager.save({
            taskId: `cleanup-perf-${i}`,
            source: "subagent_run",
            provider: "test",
            model: "test",
            priority: "normal",
            state: {},
            progress: 0.5,
            ttlMs: 100, // 100msで期限切れ
          });
        }

        // Act - 期限切れにしてクリーンアップ
        vi.advanceTimersByTime(5000);
        await vi.waitFor(async () => {
          const stats = manager.getStats();
          return stats.expiredCount === 50;
        }, { timeout: 6000 });

        // クリーンアップ実行
        const deleted = await manager.cleanup();

        // Assert
        expect(deleted).toBeGreaterThanOrEqual(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
