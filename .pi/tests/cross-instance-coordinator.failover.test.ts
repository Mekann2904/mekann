/**
 * @abdd.meta
 * path: .pi/lib/__tests__/cross-instance-coordinator.failover.test.ts
 * role: 分散ロックのフェイルオーバーテスト
 * why: ロック競合、期限切れ、クラッシュ復旧、エッジケースの品質保証
 * related: .pi/lib/cross-instance-coordinator.ts
 * public_api: なし（テストファイル）
 * invariants: テストは冪等性を持つ、一時ディレクトリでファイルシステム分離
 * side_effects: なし（テスト実行環境でのみ動作）
 * failure_modes: テスト失敗時は詳細なエラーメッセージを出力
 * @abdd.explain
 * overview: 分散ロックのフェイルオーバーシナリオをテスト
 * what_it_does:
 *   - ロック取得競合のテスト
 *   - ロック期限切れとクリーンアップのテスト
 *   - プロセスクラッシュシミュレーション
 *   - リトライメカニズムのテスト
 *   - 非所有者による解放のテスト
 *   - 破損ロックファイル処理のテスト
 *   - 同時ロック取得のテスト
 * why_it_exists:
 *   - 分散ロックの信頼性を保証するため
 *   - エッジケースでの動作を検証するため
 * scope:
 *   in: モック時間、一時ディレクトリ
 *   out: テスト結果（成功/失敗）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  registerInstance,
  unregisterInstance,
  tryAcquireLock,
  releaseLock,
  cleanupExpiredLocks,
  setCoordinatorNowProvider,
  setLockDirForTesting,
  isCoordinatorInitialized,
  type DistributedLock,
} from "../lib/coordination/cross-instance-coordinator.js";

// ============================================================================
// Test Helpers
// ============================================================================

let tempDir: string;
let mockTime: number;

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lock-failover-test-"));
}

function cleanupTempDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

function getLockFilePath(resource: string): string {
  return path.join(tempDir, `${resource.replace(/[:/]/g, "_")}.lock`);
}

function createCorruptedLockFile(resource: string, content: string): void {
  const lockPath = getLockFilePath(resource);
  fs.writeFileSync(lockPath, content, "utf-8");
}

function readLockFile(resource: string): DistributedLock | null {
  const lockPath = getLockFilePath(resource);
  if (!fs.existsSync(lockPath)) return null;
  try {
    const content = fs.readFileSync(lockPath, "utf-8");
    return JSON.parse(content) as DistributedLock;
  } catch {
    return null;
  }
}

// ============================================================================
// Distributed Lock Failover Tests
// ============================================================================

describe("Distributed Lock Failover Tests", () => {
  beforeEach(() => {
    // Setup fake timers
    vi.useFakeTimers();
    mockTime = Date.now();

    // Setup time provider
    setCoordinatorNowProvider(() => mockTime);

    // Setup temp directory
    tempDir = createTempDir();
    setLockDirForTesting(tempDir);

    // Register instance if not already registered
    if (!isCoordinatorInitialized()) {
      registerInstance("test-session-failover", process.cwd());
    }
  });

  afterEach(() => {
    // Cleanup
    unregisterInstance();
    setLockDirForTesting(null);
    setCoordinatorNowProvider(undefined);
    cleanupTempDir(tempDir);
    vi.useRealTimers();
  });

  // ==========================================================================
  // Scenario 2.1: Lock Acquisition Collision
  // ==========================================================================
  describe("2.1 Lock Acquisition Collision", () => {
    it("should prevent two instances from acquiring the same resource simultaneously", async () => {
      // Instance A acquires lock
      const lockA = tryAcquireLock("resource-1", 30000, 0);
      expect(lockA).not.toBeNull();
      expect(lockA?.resource).toBe("resource-1");
      expect(lockA?.lockId).toBeDefined();

      // Instance B attempts to acquire same resource (immediately)
      const lockB = tryAcquireLock("resource-1", 30000, 0);
      expect(lockB).toBeNull();

      // Verify lock A is still valid
      const lockFileContent = readLockFile("resource-1");
      expect(lockFileContent).not.toBeNull();
      expect(lockFileContent?.lockId).toBe(lockA?.lockId);
    });

    it("should allow different resources to be locked simultaneously", () => {
      const lockA = tryAcquireLock("resource-A", 30000, 0);
      const lockB = tryAcquireLock("resource-B", 30000, 0);

      expect(lockA).not.toBeNull();
      expect(lockB).not.toBeNull();
      // Different resources can be locked - verify by checking resource field
      expect(lockA?.resource).toBe("resource-A");
      expect(lockB?.resource).toBe("resource-B");
    });
  });

  // ==========================================================================
  // Scenario 2.2: Lock Expiry and Non-Owner Cleanup
  // ==========================================================================
  describe("2.2 Lock Expiry and Non-Owner Cleanup", () => {
    it("should remove expired locks during cleanup", () => {
      // Create lock with short TTL
      const lock = tryAcquireLock("resource-1", 100, 0);
      expect(lock).not.toBeNull();

      // Advance time past TTL
      mockTime += 150;
      setCoordinatorNowProvider(() => mockTime);

      // Cleanup expired locks
      cleanupExpiredLocks();

      // Verify lock file is removed
      expect(fs.existsSync(getLockFilePath("resource-1"))).toBe(false);
    });

    it("should allow new acquisition after expiry cleanup", () => {
      // Create lock with short TTL
      const lock1 = tryAcquireLock("resource-1", 100, 0);
      expect(lock1).not.toBeNull();

      // Advance time past TTL
      mockTime += 150;
      setCoordinatorNowProvider(() => mockTime);

      // Cleanup and acquire new lock
      cleanupExpiredLocks();
      const lock2 = tryAcquireLock("resource-1", 30000, 0);

      expect(lock2).not.toBeNull();
      expect(lock2?.lockId).not.toBe(lock1?.lockId);
    });

    it("should not remove locks that are still valid", () => {
      const lock = tryAcquireLock("resource-1", 30000, 0);
      expect(lock).not.toBeNull();

      // Advance time but not past TTL
      mockTime += 1000;
      setCoordinatorNowProvider(() => mockTime);

      cleanupExpiredLocks();

      // Lock should still exist
      expect(fs.existsSync(getLockFilePath("resource-1"))).toBe(true);
    });
  });

  // ==========================================================================
  // Scenario 2.3: Process Crash Simulation
  // ==========================================================================
  describe("2.3 Process Crash Simulation", () => {
    it("should release orphaned lock after TTL expires", () => {
      // Simulate instance A acquiring lock
      const lockA = tryAcquireLock("resource-1", 100, 0);
      expect(lockA).not.toBeNull();

      // Simulate crash: no release call, just advance time
      mockTime += 150;
      setCoordinatorNowProvider(() => mockTime);

      // Cleanup expired locks (simulating another instance's cleanup)
      cleanupExpiredLocks();

      // New instance should be able to acquire lock
      const lockB = tryAcquireLock("resource-1", 30000, 0);
      expect(lockB).not.toBeNull();
    });

    it("should handle multiple orphaned locks", () => {
      // Create multiple locks
      const lock1 = tryAcquireLock("resource-1", 100, 0);
      const lock2 = tryAcquireLock("resource-2", 200, 0);
      const lock3 = tryAcquireLock("resource-3", 300, 0);

      expect(lock1).not.toBeNull();
      expect(lock2).not.toBeNull();
      expect(lock3).not.toBeNull();

      // Release lock1 to keep it
      if (lock1) releaseLock(lock1);

      // Advance time to expire lock2 and lock3
      mockTime += 250;
      setCoordinatorNowProvider(() => mockTime);

      cleanupExpiredLocks();

      // lock1 was released, so file is gone
      expect(fs.existsSync(getLockFilePath("resource-1"))).toBe(false);
      // lock2 should be expired and removed
      expect(fs.existsSync(getLockFilePath("resource-2"))).toBe(false);
      // lock3 should still be valid (TTL 300ms, only 250ms passed)
      expect(fs.existsSync(getLockFilePath("resource-3"))).toBe(true);
    });
  });

  // ==========================================================================
  // Scenario 2.4: Retry Mechanism with Backoff
  // ==========================================================================
  describe("2.4 Retry Mechanism with Backoff", () => {
    it("should retry with exponential backoff on collision", () => {
      // Lock the resource first
      const lockA = tryAcquireLock("resource-1", 30000, 0);
      expect(lockA).not.toBeNull();

      // Try to acquire with retries (should fail because lock is held)
      const startTime = mockTime;
      const lockB = tryAcquireLock("resource-1", 30000, 3);

      // Should return null after all retries fail
      expect(lockB).toBeNull();

      // Note: The actual backoff timing uses Atomics.wait which doesn't work with fake timers
      // We're testing the retry logic, not the exact timing
    });

    it("should succeed on retry if lock becomes available", () => {
      // Lock the resource
      const lockA = tryAcquireLock("resource-1", 100, 0);
      expect(lockA).not.toBeNull();

      // Advance time past TTL
      mockTime += 150;
      setCoordinatorNowProvider(() => mockTime);

      // Try to acquire with retries - should succeed after expired lock is cleaned
      const lockB = tryAcquireLock("resource-1", 30000, 3);
      expect(lockB).not.toBeNull();
    });

    it("should return null immediately when maxRetries is 0 and lock is held", () => {
      const lockA = tryAcquireLock("resource-1", 30000, 0);
      expect(lockA).not.toBeNull();

      const lockB = tryAcquireLock("resource-1", 30000, 0);
      expect(lockB).toBeNull();
    });
  });

  // ==========================================================================
  // Scenario 2.5: Release by Non-Owner
  // ==========================================================================
  describe("2.5 Release by Non-Owner", () => {
    it("should silently fail when non-owner tries to release lock", () => {
      const lock = tryAcquireLock("resource-1", 30000, 0);
      expect(lock).not.toBeNull();

      // Create a fake lock object with different lockId (simulating non-owner)
      const fakeLock: DistributedLock = {
        lockId: "different-instance-fake-id",
        acquiredAt: mockTime,
        expiresAt: mockTime + 30000,
        resource: "resource-1",
      };

      // Non-owner tries to release (should not throw)
      expect(() => releaseLock(fakeLock)).not.toThrow();

      // Original lock should still exist
      expect(fs.existsSync(getLockFilePath("resource-1"))).toBe(true);
      const lockFile = readLockFile("resource-1");
      expect(lockFile?.lockId).toBe(lock?.lockId);
    });

    it("should allow owner to release lock after non-owner attempt", () => {
      const lock = tryAcquireLock("resource-1", 30000, 0);
      expect(lock).not.toBeNull();

      // Non-owner attempt
      const fakeLock: DistributedLock = {
        lockId: "fake-lock-id",
        acquiredAt: mockTime,
        expiresAt: mockTime + 30000,
        resource: "resource-1",
      };
      releaseLock(fakeLock);

      // Owner releases
      if (lock) {
        expect(() => releaseLock(lock)).not.toThrow();
      }

      // Lock should be removed
      expect(fs.existsSync(getLockFilePath("resource-1"))).toBe(false);
    });
  });

  // ==========================================================================
  // Scenario 2.6: Corrupted Lock File Handling
  // ==========================================================================
  describe("2.6 Corrupted Lock File Handling", () => {
    it("should handle corrupted JSON lock file gracefully", () => {
      // Create corrupted lock file
      createCorruptedLockFile("resource-1", "INVALID{JSON");

      // Try to acquire lock - should not throw
      expect(() => {
        const lock = tryAcquireLock("resource-1", 30000, 0);
        // May or may not succeed depending on cleanup during retry
      }).not.toThrow();
    });

    it("should remove corrupted lock file during cleanup", () => {
      createCorruptedLockFile("resource-1", "not valid json {{{");

      // Cleanup should remove corrupted file
      cleanupExpiredLocks();

      expect(fs.existsSync(getLockFilePath("resource-1"))).toBe(false);
    });

    it("should allow new lock acquisition after corrupted file cleanup", () => {
      createCorruptedLockFile("resource-1", "corrupted");

      cleanupExpiredLocks();

      const lock = tryAcquireLock("resource-1", 30000, 0);
      expect(lock).not.toBeNull();
    });

    it("should handle empty lock file", () => {
      createCorruptedLockFile("resource-1", "");

      expect(() => {
        tryAcquireLock("resource-1", 30000, 0);
      }).not.toThrow();
    });

    it("should handle lock file with missing fields", () => {
      // Create lock file with partial data
      createCorruptedLockFile("resource-2", JSON.stringify({ lockId: "partial" }));

      expect(() => {
        cleanupExpiredLocks();
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // Scenario 2.7: Concurrent Lock Acquisition Attempts
  // ==========================================================================
  describe("2.7 Concurrent Lock Acquisition Attempts", () => {
    it("should allow exactly one lock when multiple instances try simultaneously", async () => {
      // Simulate concurrent attempts by running them in sequence
      // (true concurrency is hard to test deterministically)
      const results: (DistributedLock | null)[] = [];

      // First attempt should succeed
      results.push(tryAcquireLock("resource-1", 30000, 0));

      // Subsequent attempts should fail (lock is held)
      for (let i = 0; i < 4; i++) {
        results.push(tryAcquireLock("resource-1", 30000, 0));
      }

      const successful = results.filter((r) => r !== null);
      expect(successful).toHaveLength(1);
    });

    it("should handle rapid acquire-release cycles", () => {
      for (let i = 0; i < 10; i++) {
        const lock = tryAcquireLock(`cycle-resource-${i}`, 30000, 0);
        expect(lock).not.toBeNull();
        if (lock) {
          releaseLock(lock);
        }
      }

      // All lock files should be removed
      for (let i = 0; i < 10; i++) {
        expect(fs.existsSync(getLockFilePath(`cycle-resource-${i}`))).toBe(false);
      }
    });

    it("should handle lock acquisition on same resource after release", () => {
      const lock1 = tryAcquireLock("resource-1", 30000, 0);
      expect(lock1).not.toBeNull();

      if (lock1) {
        releaseLock(lock1);
      }

      // Advance time to ensure new lockId
      mockTime += 10;
      setCoordinatorNowProvider(() => mockTime);

      const lock2 = tryAcquireLock("resource-1", 30000, 0);
      expect(lock2).not.toBeNull();
      // Second acquisition succeeds after release
      expect(lock2?.resource).toBe("resource-1");
    });
  });

  // ==========================================================================
  // Additional Edge Cases
  // ==========================================================================
  describe("Edge Cases", () => {
    it("should handle resource names with special characters", () => {
      const specialResources = [
        "resource:with:colons",
        "resource/with/slashes",
        "resource-with-dashes",
        "resource_with_underscores",
      ];

      for (const resource of specialResources) {
        const lock = tryAcquireLock(resource, 30000, 0);
        expect(lock).not.toBeNull();
        expect(lock?.resource).toBe(resource);
        if (lock) {
          releaseLock(lock);
        }
      }
    });

    it("should handle zero TTL (immediate expiry)", () => {
      const lock = tryAcquireLock("resource-1", 0, 0);
      // With TTL=0, lock immediately expires
      // Cleanup should remove it
      mockTime += 1;
      setCoordinatorNowProvider(() => mockTime);
      cleanupExpiredLocks();
      expect(fs.existsSync(getLockFilePath("resource-1"))).toBe(false);
    });

    it("should handle very long TTL", () => {
      const veryLongTtl = 365 * 24 * 60 * 60 * 1000; // 1 year in ms
      const lock = tryAcquireLock("resource-1", veryLongTtl, 0);
      expect(lock).not.toBeNull();

      // Advance time significantly but not past TTL
      mockTime += 24 * 60 * 60 * 1000; // 1 day
      setCoordinatorNowProvider(() => mockTime);
      cleanupExpiredLocks();

      expect(fs.existsSync(getLockFilePath("resource-1"))).toBe(true);
    });

    it("should return null when coordinator is not initialized", () => {
      // Unregister to simulate uninitialized state
      unregisterInstance();

      const lock = tryAcquireLock("resource-1", 30000, 0);
      expect(lock).toBeNull();

      // Re-register for cleanup
      registerInstance("test-session-failover", process.cwd());
    });
  });
});
